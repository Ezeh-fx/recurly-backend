import mongoose from 'mongoose';

import { env } from './env.js';

mongoose.set('strictQuery', true);
mongoose.set('sanitizeFilter', true);

export async function connectDatabase(): Promise<void> {
   try {
    await mongoose.connect(env.MONGODB_URI, {
      maxPoolSize: env.DB_MAX_POOL_SIZE,
      serverSelectionTimeoutMS: env.DB_SERVER_SELECTION_TIMEOUT_MS,
    });
    console.log('Database connected successfully');
  } catch (error) {
    console.error('Database connection error:', error);
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}