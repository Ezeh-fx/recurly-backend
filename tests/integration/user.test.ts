import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import app from '../../src/server';
import { User } from '../../src/models/User';
import { env } from '../../src/config/env';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  // Set test environment variables before importing server
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-key-32chars-min';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-32chars-min';
  process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
  process.env.APPLE_CLIENT_ID = 'test-apple-client-id';
  process.env.NODE_ENV = 'test';

  // Start in-memory MongoDB
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  // Clean up database after each test
  await User.deleteMany({});
});

// Helper function to create a verified user and return an access token
const createVerifiedUser = async (email: string, password: string) => {
  const user = await User.create({
    email,
    passwordHash: password,
    isEmailVerified: true,
    authProviders: ['email'],
  });

  const accessToken = jwt.sign(
    { 
      userId: user._id.toString(), 
      email: user.email,
      jti: 'test-jti',
      tokenType: 'access',
    },
    String(env.JWT_ACCESS_SECRET),
    { 
      expiresIn: String(env.JWT_ACCESS_EXPIRES_IN),
      issuer: 'subtrack',
      audience: 'subtrack-api',
      algorithm: 'HS256',
    } as any,
  );

  return { user, accessToken };
};

describe('GET /api/v1/users/profile', () => {
  it('should get user profile successfully', async () => {
    const { accessToken } = await createVerifiedUser('test@example.com', 'password123');

    const response = await request(app)
      .get('/api/v1/users/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.data).toHaveProperty('id');
    expect(response.body.data).toHaveProperty('email', 'test@example.com');
    expect(response.body.data).toHaveProperty('isEmailVerified', true);
    expect(response.body.data).not.toHaveProperty('passwordHash');
    expect(response.body.data).not.toHaveProperty('otpCodeHash');
    expect(response.body.data).not.toHaveProperty('refreshTokenHash');
  });

  it('should fail without authentication', async () => {
    const response = await request(app)
      .get('/api/v1/users/profile')
      .expect(401);

    expect(response.body.error).toHaveProperty('code', 'UNAUTHORIZED');
  });

  it('should fail with invalid token', async () => {
    const response = await request(app)
      .get('/api/v1/users/profile')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);

    expect(response.body.error).toHaveProperty('code', 'TOKEN_INVALID');
  });
});

describe('PATCH /api/v1/users/profile', () => {
  it('should update timezone successfully', async () => {
    const { accessToken } = await createVerifiedUser('test@example.com', 'password123');

    const response = await request(app)
      .patch('/api/v1/users/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        timezone: 'America/New_York',
      })
      .expect(200);

    expect(response.body.data).toHaveProperty('timezone', 'America/New_York');
  });

  it('should update expo push token successfully', async () => {
    const { accessToken } = await createVerifiedUser('test@example.com', 'password123');

    const response = await request(app)
      .patch('/api/v1/users/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        expoPushToken: 'ExponentPushToken[xyz123]',
      })
      .expect(200);

    expect(response.body.data).toHaveProperty('expoPushToken', 'ExponentPushToken[xyz123]');
  });

  it('should fail to update email to one already in use', async () => {
    // Create two users
    await createVerifiedUser('existing@example.com', 'password123');
    const { accessToken } = await createVerifiedUser('test@example.com', 'password123');

    const response = await request(app)
      .patch('/api/v1/users/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        email: 'existing@example.com',
      })
      .expect(409);

    expect(response.body.error).toHaveProperty('code', 'CONFLICT');
  });

  it('should fail with invalid email format', async () => {
    const { accessToken } = await createVerifiedUser('test@example.com', 'password123');

    const response = await request(app)
      .patch('/api/v1/users/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        email: 'invalid-email',
      })
      .expect(422);

    expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
  });

  it('should fail without authentication', async () => {
    const response = await request(app)
      .patch('/api/v1/users/profile')
      .send({
        timezone: 'America/New_York',
      })
      .expect(401);

    expect(response.body.error).toHaveProperty('code', 'UNAUTHORIZED');
  });
});

describe('POST /api/v1/users/change-password', () => {
  it('should change password successfully', async () => {
    const { accessToken, user } = await createVerifiedUser('test@example.com', 'password123');

    const response = await request(app)
      .post('/api/v1/users/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        currentPassword: 'password123',
        newPassword: 'newpassword456',
      })
      .expect(200);

    expect(response.body.data).toHaveProperty('message', 'Password changed successfully');

    // Verify password was changed
    const updatedUser = await User.findById(user._id).select('+passwordHash');
    const isMatch = await bcrypt.compare('newpassword456', updatedUser?.passwordHash || '');
    expect(isMatch).toBe(true);
  });

  it('should fail with incorrect current password', async () => {
    const { accessToken } = await createVerifiedUser('test@example.com', 'password123');

    const response = await request(app)
      .post('/api/v1/users/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        currentPassword: 'wrongpassword',
        newPassword: 'newpassword456',
      })
      .expect(401);

    expect(response.body.error).toHaveProperty('code', 'INVALID_CREDENTIALS');
  });

  it('should fail with short new password', async () => {
    const { accessToken } = await createVerifiedUser('test@example.com', 'password123');

    const response = await request(app)
      .post('/api/v1/users/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        currentPassword: 'password123',
        newPassword: 'short',
      })
      .expect(422);

    expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
  });

  it('should fail without authentication', async () => {
    const response = await request(app)
      .post('/api/v1/users/change-password')
      .send({
        currentPassword: 'password123',
        newPassword: 'newpassword456',
      })
      .expect(401);

    expect(response.body.error).toHaveProperty('code', 'UNAUTHORIZED');
  });
});

describe('POST /api/v1/users/link-google', () => {
  it('should fail with missing idToken', async () => {
    const { accessToken } = await createVerifiedUser('test@example.com', 'password123');

    const response = await request(app)
      .post('/api/v1/users/link-google')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(422);

    expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
  });

  it('should fail without authentication', async () => {
    const response = await request(app)
      .post('/api/v1/users/link-google')
      .send({
        idToken: 'some-token',
      })
      .expect(401);

    expect(response.body.error).toHaveProperty('code', 'UNAUTHORIZED');
  });

  // Note: Full Google OAuth linking testing requires mocking the Google Auth Library
  // This would typically be done with jest.mock()
});

describe('POST /api/v1/users/link-apple', () => {
  it('should fail with missing identityToken', async () => {
    const { accessToken } = await createVerifiedUser('test@example.com', 'password123');

    const response = await request(app)
      .post('/api/v1/users/link-apple')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(422);

    expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
  });

  it('should fail without authentication', async () => {
    const response = await request(app)
      .post('/api/v1/users/link-apple')
      .send({
        identityToken: 'some-token',
      })
      .expect(401);

    expect(response.body.error).toHaveProperty('code', 'UNAUTHORIZED');
  });

  // Note: Full Apple OAuth linking testing requires mocking the JWKS verification
  // This would typically be done with jest.mock()
});
