import logger from '../config/logger';

export const logError = (error: Error, context?: Record<string, unknown>) => {
  logger.error({
    ...context,
    err: error,
  }, error.message);
};

export const logWarn = (message: string, context?: Record<string, unknown>) => {
  logger.warn({
    ...context,
  }, message);
};

export const logInfo = (message: string, context?: Record<string, unknown>) => {
  logger.info({
    ...context,
  }, message);
};

export const logDebug = (message: string, context?: Record<string, unknown>) => {
  logger.debug({
    ...context,
  }, message);
};
