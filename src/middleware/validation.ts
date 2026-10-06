import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { AppError } from './errorHandler';
import { HTTP_STATUS, ERROR_CODES } from '../config/constants';

export const validate = (schema: ZodSchema) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      // Validate the request
      const result = schema.safeParse({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      if (!result.success) {
        // Format Zod errors
        const errors: any[] = [];
        for (const issue of result.error.issues) {
          errors.push({
            field: issue.path.join('.'),
            message: issue.message,
          });
        }

        throw new AppError(
          HTTP_STATUS.UNPROCESSABLE_ENTITY,
          ERROR_CODES.VALIDATION_ERROR,
          JSON.stringify(errors),
        );
      }

      // Update request with validated data
      const data = result.data as any;
      if (data.body) {
        req.body = data.body;
      }
      if (data.query) {
        Object.defineProperty(req, 'query', {
          value: data.query,
          writable: true,
          configurable: true,
        });
      }
      if (data.params) {
        req.params = data.params;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
