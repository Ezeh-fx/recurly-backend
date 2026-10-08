// Test environment setup
import dotenv from 'dotenv';

process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.MONGODB_URI = 'mongodb://localhost:27017/test-subtrack';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-key-32chars-min';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-32chars-min';
process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:8081';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.APPLE_CLIENT_ID = 'test-apple-client-id';

dotenv.config();
