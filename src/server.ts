import http from "node:http";

import app from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";

let server: http.Server | undefined;
let isShuttingDown = false;

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

async function cleanup(exitCode: 0 | 1, reason: string): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.info({ reason }, "Cleanup started");

  try {
    if (server?.listening === true) {
      const activeServer = server;

      await new Promise<void>((resolve, reject) => {
        activeServer.close((error) => {
          if (error !== undefined) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }

    await disconnectDatabase();
    logger.info({ exitCode }, "Cleanup completed");
    process.exitCode = exitCode;
  } catch (error) {
    logger.error({ errorName: errorName(error) }, "Shutdown failed");
    process.exitCode = 1;
  }
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  await cleanup(0, signal);
}

async function startServer(): Promise<void> {
  try {
    await connectDatabase();

    server = app.listen(env.PORT, () => {
      logger.info(
        { port: env.PORT, environment: env.NODE_ENV },
        "Server started",
      );
    });

    server.on("error", (error) => {
      logger.fatal({ errorName: errorName(error) }, "Server failed to listen");
      void cleanup(1, "server-error");
    });
  } catch (error) {
    logger.fatal({ errorName: errorName(error) }, "Server startup failed");
    await cleanup(1, "startup-failure");
  }
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.once("uncaughtException", (error) => {
  logger.fatal({ errorName: errorName(error) }, "Uncaught exception");
  void cleanup(1, "uncaught-exception");
});

process.once("unhandledRejection", (reason) => {
  logger.fatal({ errorName: errorName(reason) }, "Unhandled promise rejection");
  void cleanup(1, "unhandled-rejection");
});

void startServer();
