import type { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details: unknown;
  public readonly isOperational: boolean;

  public constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}

type ErrorResponse = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

function isProduction(request: Request): boolean {
  return request.app.get('env') === 'production';
}

function createErrorResponse(
  code: string,
  message: string,
  details?: unknown,
): ErrorResponse {
  const error: ErrorResponse['error'] = { code, message };

  if (details !== undefined) {
    error.details = details;
  }

  return { success: false, error };
}

function normalizeError(error: unknown, request: Request): {
  statusCode: number;
  response: ErrorResponse;
} {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      response: createErrorResponse(
        error.code,
        error.message,
        error.details,
      ),
    };
  }

  if (error instanceof z.ZodError) {
    return {
      statusCode: 422,
      response: createErrorResponse(
        'VALIDATION_ERROR',
        'The request contains invalid data.',
        error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
          code: issue.code,
        })),
      ),
    };
  }

  if (error instanceof mongoose.Error.ValidationError) {
    return {
      statusCode: 422,
      response: createErrorResponse(
        'DATABASE_VALIDATION_ERROR',
        'The submitted data is invalid.',
      ),
    };
  }

  if (error instanceof mongoose.Error.CastError) {
    return {
      statusCode: 400,
      response: createErrorResponse(
        'INVALID_IDENTIFIER',
        'A supplied identifier is invalid.',
      ),
    };
  }

  if (isProduction(request)) {
    return {
      statusCode: 500,
      response: createErrorResponse(
        'INTERNAL_SERVER_ERROR',
        'An unexpected error occurred.',
      ),
    };
  }

  const message = error instanceof Error ? error.message : 'Unknown error';

  return {
    statusCode: 500,
    response: createErrorResponse('INTERNAL_SERVER_ERROR', message),
  };
}

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  request: Request,
  response: Response,
  _next: NextFunction,
): void => {
  const { statusCode, response: errorResponse } = normalizeError(error, request);

  response.status(statusCode).json(errorResponse);
};
