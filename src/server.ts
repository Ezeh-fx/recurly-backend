import dotenv from 'dotenv';

dotenv.config();

import express,{Application} from 'express';
import compression from 'compression';
import { env } from './config/env';
import { connectDB } from './config/database';
import logger from './config/logger';
import { applySecurityMiddleware } from './middleware/security';
import { requestLogger } from './middleware/logger';
import { errorHandler } from './middleware/errorHandler';

const app:Application = express();

const startServer = async () => {
  try {
    await connectDB();
    
    // Apply security middleware globally
    app.use(applySecurityMiddleware);
    
    // Body parsing middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    
    // Compression middleware
    app.use(compression());
    
    // Request logging
    app.use(requestLogger);
    
    // Health check endpoint
    app.get('/health', (_req, res) => {
      res.json({ status: 'ok', environment: env.NODE_ENV });
    });
    
    // 404 handler - must be after all routes but before error handler
    app.use((_req, res) => {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'The requested resource does not exist'
        }
      });
    });
    
    // Error handling middleware (must be last)
    app.use(errorHandler);
    
    const server = app.listen(env.PORT, () => {
      logger.info(`Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM signal received: closing HTTP server');
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
    });
    
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server');
    process.exit(1);
  }
};

startServer();
