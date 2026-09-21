import pino from "pino";

import { env } from "../config/env.js";

const developmentTransport = {
  target: "pino-pretty",
  options: {
    colorize: true,
    ignore: "pid,hostname",
    levelFirst: true,
    singleLine: true,
    translateTime: "SYS:standard",
  },
} as const;

export const logger = pino({
  level: env.LOG_LEVEL,
  ...(env.NODE_ENV === "development"
    ? { transport: developmentTransport }
    : {}),
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers.set-cookie",
    "*.token",
    "*.idToken",
    "*.secret",
  ],
});
