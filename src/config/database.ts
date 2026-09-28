import dns from 'node:dns';
import mongoose from 'mongoose';

import logger from './logger';
import { env } from './env';

if (env.NODE_ENV === 'development' && env.DNS_SERVERS) {
  const dnsServers = env.DNS_SERVERS
    .split(',')
    .map((server) => server.trim())
    .filter(Boolean);

  if (dnsServers.length) {
    dns.setServers(dnsServers);
    logger.info(
      // { dnsServers },
      'Development DNS servers configured',
    );
  }
}

export const connectDB = async () => {
  try {
    await mongoose.connect(env.MONGODB_URI);

    logger.info('MongoDB connected successfully');
  } catch (error) {
    logger.error({ err: error }, 'MongoDB connection error');
    throw error;
  }
};

export const disconnectDB = async () => {
  try {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected successfully');
  } catch (error) {
    logger.error({ err: error }, 'MongoDB disconnection error');
    throw error;
  }
};

