import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const { method, url, ip } = req;
    const { statusCode } = res;

    logger.info({
      method,
      url,
      ip,
      statusCode,
      duration: `${duration}ms`,
    }, 'HTTP request completed');
  });

  next();
};

export default requestLogger;
