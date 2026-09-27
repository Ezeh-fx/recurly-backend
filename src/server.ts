import dotenv from 'dotenv';

dotenv.config();

import { env } from './config/env';
import { connectDB } from './config/database';
import logger from './config/logger';

const startServer = async () => {
  try {
    await connectDB();
    
    logger.info(`Starting server in ${env.NODE_ENV} mode on port ${env.PORT}`);
    
    // TODO: Initialize Express app and routes here
    
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server');
    process.exit(1);
  }
};

startServer();
