// Test environment setup
import dotenv from 'dotenv';

dotenv.config();

process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/test-subtrack';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret-key-32chars-min';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-key-32chars-min';
process.env.CORS_ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:8081';
