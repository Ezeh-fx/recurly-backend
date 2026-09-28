import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import hpp from 'hpp';
import { Request, Response, NextFunction } from 'express';
import type { RequestHandler } from 'express';
import { env } from '../config/env';
import logger from '../config/logger';

// Helmet for secure HTTP headers
export const securityHeaders: RequestHandler = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false,
});

// Rate limiter for authentication routes (stricter)
// Apply this specifically to /api/v1/auth/* routes in route definitions
export const authRateLimiter: RequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: {
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many authentication attempts, please try again later',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Global rate limiter (looser)
export const globalRateLimiter: RequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: {
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests, please try again later',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// HPP to protect against HTTP Parameter Pollution
export const hppMiddleware: RequestHandler = hpp({
  whitelist: [], // Add any query parameters that should allow duplicates
});

// Express Mongo Sanitize to prevent NoSQL injection
// In Express 5, req.query is read-only, so we need a custom approach
const sanitizeObject = (obj: unknown, path: string): Record<string, unknown> => {
  if (!obj || typeof obj !== 'object') {
    return obj as Record<string, unknown>;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, path)) as unknown as Record<string, unknown>;
  }

  const sanitized: Record<string, unknown> = {};
  for (const key in obj) {
    if (key.startsWith('$') || key.includes('.')) {
      logger.warn({ key, path }, 'MongoSanitize: Sanitized key');
      continue; // Skip keys starting with $ or containing .
    }
    
    // Recursively sanitize nested objects
    sanitized[key] = sanitizeObject((obj as Record<string, unknown>)[key], path);
  }
  return sanitized;
};

export const mongoSanitizeMiddleware: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  // Sanitize body
  if (req.body) {
    req.body = sanitizeObject(req.body, req.path);
  }

  // Sanitize params
  if (req.params) {
    req.params = sanitizeObject(req.params, req.path) as any;
  }

  // Skip query sanitization in Express 5 (read-only)
  next();
};

// CORS middleware with explicit allow-list
export const corsMiddleware: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const allowedOrigins = env.CORS_ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
};

// Combined security middleware for easy application (global only)
export const applySecurityMiddleware: RequestHandler[] = [
  securityHeaders,
  corsMiddleware,
  globalRateLimiter,
  hppMiddleware,
  mongoSanitizeMiddleware, // Custom implementation for Express 5 compatibility
];
