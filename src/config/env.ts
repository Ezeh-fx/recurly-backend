import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  
  // Database
  MONGODB_URI: z.string().url().default('mongodb://localhost:27017/test-subtrack'),
  
  // JWT
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
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
  
  // DNS (comma-separated list of DNS servers for development)
  DNS_SERVERS: z.string().optional(),
  
  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
}).superRefine((data, ctx) => {
  if (data.NODE_ENV === 'production' && data.MONGODB_URI === 'mongodb://localhost:27017/test-subtrack') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'MONGODB_URI must be explicitly provided in production',
      path: ['MONGODB_URI'],
    });
  }
  
  if (data.NODE_ENV === 'production') {
    if (!data.JWT_ACCESS_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'JWT_ACCESS_SECRET must be provided in production',
        path: ['JWT_ACCESS_SECRET'],
      });
    }
    if (!data.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'JWT_REFRESH_SECRET must be provided in production',
        path: ['JWT_REFRESH_SECRET'],
      });
    }
  }
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
