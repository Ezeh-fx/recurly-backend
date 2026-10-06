import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from './errorHandler';
import { HTTP_STATUS, ERROR_CODES } from '../config/constants';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
      };
    }
  }
}

export const authenticate = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.UNAUTHORIZED,
        'No token provided',
      );
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token with proper validation
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: 'subtrack',
      audience: 'subtrack-api',
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;

    // Validate required claims
    if (!decoded.userId || typeof decoded.userId !== 'string') {
      throw new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.TOKEN_INVALID,
        'Invalid token: missing or invalid userId',
      );
    }

    if (!decoded.email || typeof decoded.email !== 'string') {
      throw new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.TOKEN_INVALID,
        'Invalid token: missing or invalid email',
      );
    }

    if (decoded.tokenType !== 'access') {
      throw new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.TOKEN_INVALID,
        'Invalid token: expected access token',
      );
    }

    if (!decoded.jti || typeof decoded.jti !== 'string') {
      throw new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.TOKEN_INVALID,
        'Invalid token: missing or invalid jti',
      );
    }

    // Attach user info to request
    req.user = {
      id: decoded.userId,
      email: decoded.email,
    };

    next();
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }

    if (error instanceof jwt.TokenExpiredError) {
      return next(
        new AppError(
          HTTP_STATUS.UNAUTHORIZED,
          ERROR_CODES.TOKEN_EXPIRED,
          'Token has expired',
        ),
      );
    }

    if (error instanceof jwt.JsonWebTokenError) {
      return next(
        new AppError(
          HTTP_STATUS.UNAUTHORIZED,
          ERROR_CODES.TOKEN_INVALID,
          'Invalid token',
        ),
      );
    }

    next(error);
  }
};
