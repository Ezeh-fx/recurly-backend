import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  
  // Database
  MONGODB_URI: z.string().url().default('mongodb://localhost:27017/test-subtrack'),
  
  // JWT
  JWT_ACCESS_SECRET: z.string().min(32).default('test-access-secret-key-32chars-min'),
  JWT_REFRESH_SECRET: z.string().min(32).default('test-refresh-secret-key-32chars-min'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  
  // OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  APPLE_CLIENT_ID: z.string().optional(),
  
  // Email
  EMAIL_PROVIDER_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
  
  // Expo Push Notifications
  EXPO_ACCESS_TOKEN: z.string().optional(),
  
  // CORS (comma-separated list of allowed origins)
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:8081,exp://localhost:8081'),
  
  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const validateEnv = () => {
  const env = envSchema.safeParse(process.env);

  if (!env.success) {
    console.error('❌ Invalid environment variables:');
    console.error(env.error.issues);
    process.exit(1);
  }

  return env.data;
};

export const env = validateEnv();
