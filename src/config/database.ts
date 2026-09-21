import dns from 'node:dns';
import mongoose from 'mongoose';

import { env } from './env.js';

mongoose.set('strictQuery', true);
mongoose.set('sanitizeFilter', true);

export async function connectDatabase(): Promise<void> {
  dns.setServers(env.DNS_SERVERS);

  await mongoose.connect(env.MONGODB_URI, {
    maxPoolSize: env.DB_MAX_POOL_SIZE,
    serverSelectionTimeoutMS: env.DB_SERVER_SELECTION_TIMEOUT_MS,
  });
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}