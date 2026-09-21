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

async function shutdown(signal: NodeJS.Signals): Promise<void> {
	if (isShuttingDown) {
		return;
	}

	isShuttingDown = true;
	logger.info({ signal }, "Shutdown started");

	try {
		if (server !== undefined) {
			await new Promise<void>((resolve, reject) => {
				server?.close((error) => {
					if (error !== undefined) {
						reject(error);
						return;
					}

					resolve();
				});
			});
		}

		await disconnectDatabase();
		logger.info("Shutdown completed");
		process.exitCode = 0;
	} catch (error) {
		logger.error({ errorName: errorName(error) }, "Shutdown failed");
		process.exitCode = 1;
	}
}

async function startServer(): Promise<void> {
	try {
		await connectDatabase();

		server = app.listen(env.PORT, () => {
			logger.info({ port: env.PORT, environment: env.NODE_ENV }, "Server started");
		}); 

		server.on("error", (error) => {
			logger.fatal({ errorName: errorName(error) }, "Server failed to listen");
			process.exitCode = 1;
		});
	} catch (error) {
		logger.fatal({ error }, "Server startup failed");
		await disconnectDatabase();
		process.exitCode = 1;
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
	process.exitCode = 1;
});

process.once("unhandledRejection", (reason) => {
	logger.fatal({ errorName: errorName(reason) }, "Unhandled promise rejection");
	process.exitCode = 1;
});

void startServer();
