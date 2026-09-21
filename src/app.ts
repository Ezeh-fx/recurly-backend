import compression from "compression";
import cors, { type CorsOptions } from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import mongoSanitize from "express-mongo-sanitize";
import helmet from "helmet";
import hpp from "hpp";
import { pinoHttp } from "pino-http";

import {
  API_PREFIX,
  REQUEST_BODY_LIMIT,
  REQUEST_TIMEOUT_MS,
} from "./config/constants.js";
import { env } from "./config/env.js";
import { isDatabaseConnected } from "./config/database.js";
import { errorHandler, AppError } from "./middleware/error-handler.js";
import { apiRateLimiter } from "./middleware/rate-limit.js";
import { logger } from "./utils/logger.js";

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (origin === undefined || env.CORS_ORIGINS.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new AppError(403, "CORS_ORIGIN_DENIED", "Origin is not allowed."));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
  optionsSuccessStatus: 204,
};

const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors(corsOptions));
app.use(compression());
app.use(express.json({ limit: REQUEST_BODY_LIMIT, strict: true }));
app.use(express.urlencoded({ extended: false, limit: REQUEST_BODY_LIMIT }));
app.use((request: Request, _response: Response, next: NextFunction) => {
  for (const value of [request.body, request.params, request.query]) {
    if (value !== null && typeof value === "object") {
      mongoSanitize.sanitize(value as Record<string, unknown>);
    }
  }

  next();
});
app.use(hpp());
app.use(
  pinoHttp({
    logger,
    redact: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers.set-cookie",
    ],
  }),
);
app.use(apiRateLimiter);
app.use((_request: Request, response: Response, next: NextFunction) => {
  response.setTimeout(REQUEST_TIMEOUT_MS, () => {
    next(new AppError(408, "REQUEST_TIMEOUT", "The request timed out."));
  });
  next();
});

app.get("/health", (_request: Request, response: Response) => {
  response.status(200).json({
    success: true,
    data: {
      service: "ok",
      database: isDatabaseConnected() ? "connected" : "disconnected",
    },
  });
});

app.use(
  `${API_PREFIX}`,
  (_request: Request, _response: Response, next: NextFunction) => {
    next(
      new AppError(
        404,
        "ROUTE_NOT_FOUND",
        "The requested route was not found.",
      ),
    );
  },
);

app.use((_request: Request, _response: Response, next: NextFunction) => {
  next(
    new AppError(404, "ROUTE_NOT_FOUND", "The requested route was not found."),
  );
});

app.use(errorHandler);

export default app;
