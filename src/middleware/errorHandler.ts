import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';
import { env } from '../config/env';

export class AppError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof AppError) {
    logger.error({
      code: err.code,
      statusCode: err.statusCode,
      message: err.message,
      url: req.url,
      method: req.method,
    }, 'Application error');

    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
      },
    });
  }

  // Generic error handler
  const safeMessage = err instanceof Error
    ? err.message
    : typeof err === 'string'
      ? err
      : err && typeof err === 'object' && 'message' in err
        ? String(err.message)
        : 'An unexpected error occurred';

  const safeStack = err instanceof Error ? err.stack : undefined;

  logger.error({
    message: safeMessage,
    stack: env.NODE_ENV === 'development' ? safeStack : undefined,
    url: req.url,
    method: req.method,
  }, 'Unhandled error');

  const statusCode = 500;
  const code = 'INTERNAL_SERVER_ERROR';
  const message = env.NODE_ENV === 'development'
    ? safeMessage
    : 'An unexpected error occurred';

  res.status(statusCode).json({
    error: {
      code,
      message,
    },
  });
};
