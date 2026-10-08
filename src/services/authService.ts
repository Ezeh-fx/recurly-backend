import jwt from 'jsonwebtoken';
import { timingSafeEqual } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';
import { env } from '../config/env';
import { User } from '../models/User';
import { AppError } from '../middleware/errorHandler';
import { HTTP_STATUS, ERROR_CODES, OTP_CONFIG, AUTH_PROVIDERS, BCRYPT_CONFIG } from '../config/constants';
import logger from '../config/logger';
import { sendOtpEmail } from './emailService';

// Import jose for Apple auth (ESM module)
import { createRemoteJWKSet, jwtVerify } from 'jose';

// Google OAuth client
const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

// Apple JWKS client (created once for reuse)
const appleJWKS = createRemoteJWKSet(
  new URL('https://appleid.apple.com/auth/keys')
);

// Generate OTP
const generateOtp = (): string => {
  // Use cryptographically secure random number generator
  const otp = crypto.randomInt(100000, 1000000);
  return otp.toString();
};

// Hash using SHA-256
const sha256Hash = (data: string): string => {
  return crypto.createHash('sha256').update(data).digest('hex');
};

// Constant-time comparison to prevent timing attacks
const constantTimeCompare = (a: string, b: string): boolean => {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
};

// Generate tokens
const generateTokens = (userId: string, email: string) => {
  const accessJti = crypto.randomBytes(16).toString('hex');
  const refreshJti = crypto.randomBytes(16).toString('hex');
  
  const accessToken = jwt.sign(
    { userId, email, jti: accessJti, tokenType: 'access' },
    env.JWT_ACCESS_SECRET,
    { 
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
      issuer: 'subtrack',
      audience: 'subtrack-api',
      algorithm: 'HS256',
    } as jwt.SignOptions,
  );

  const refreshToken = jwt.sign(
    { userId, email, jti: refreshJti, tokenType: 'refresh' },
    env.JWT_REFRESH_SECRET,
    { 
      expiresIn: env.JWT_REFRESH_EXPIRES_IN,
      issuer: 'subtrack',
      audience: 'subtrack-api',
      algorithm: 'HS256',
    } as jwt.SignOptions,
  );

  return { accessToken, refreshToken, accessJti, refreshJti };
};

// Register
export const register = async (email: string, password: string) => {
  // Check if user already exists
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw new AppError(
      HTTP_STATUS.CONFLICT,
      ERROR_CODES.CONFLICT,
      'User with this email already exists',
    );
  }

  // Generate and hash OTP
  const otp = generateOtp();
  const otpHash = sha256Hash(otp);
  const otpExpiresAt = new Date(Date.now() + OTP_CONFIG.EXPIRY_MINUTES * 60 * 1000);
  const otpCreatedAt = new Date();

  // Create user with password and OTP in one operation
  const user = await User.create({
    email: email.toLowerCase(),
    passwordHash: password, // Will be hashed by pre-save hook
    isEmailVerified: false,
    authProviders: [AUTH_PROVIDERS.EMAIL],
    otpCodeHash: otpHash,
    otpExpiresAt: otpExpiresAt,
    otpCreatedAt: otpCreatedAt,
    otpAttempts: 0,
  });

  // Send OTP email
  await sendOtpEmail({
    email: user.email,
    otp,
    otpExpiresAt,
  });

  logger.info({ userId: user._id }, 'OTP generated and email sent for verification');

  return {
    message: 'Registration successful. Please check your email for OTP verification.',
    otpExpiresAt,
  };
};

// Verify OTP
export const verifyOtp = async (email: string, otp: string) => {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+otpCodeHash');
  
  if (!user) {
    throw new AppError(
      HTTP_STATUS.UNAUTHORIZED,
      ERROR_CODES.INVALID_CREDENTIALS,
      'Invalid credentials',
    );
  }

  // Check if already verified
  if (user.isEmailVerified) {
    throw new AppError(
      HTTP_STATUS.CONFLICT,
      ERROR_CODES.EMAIL_ALREADY_VERIFIED,
      'Email is already verified',
    );
  }

  // Check if OTP is expired
  if (!user.otpExpiresAt || user.otpExpiresAt < new Date()) {
    throw new AppError(
      HTTP_STATUS.UNAUTHORIZED,
      ERROR_CODES.OTP_EXPIRED,
      'OTP has expired. Please request a new one.',
    );
  }

  // Atomically reserve an attempt by incrementing only if below MAX_ATTEMPTS
  const updatedUser = await User.findOneAndUpdate(
    { 
      _id: user._id,
      otpAttempts: { $lt: OTP_CONFIG.MAX_ATTEMPTS },
    },
    { $inc: { otpAttempts: 1 } },
    { new: true }
  ).select('+otpCodeHash');

  if (!updatedUser) {
    // Increment failed because otpAttempts >= MAX_ATTEMPTS
    throw new AppError(
      HTTP_STATUS.UNAUTHORIZED,
      ERROR_CODES.OTP_TOO_MANY_ATTEMPTS,
      'Too many failed attempts. Please request a new OTP.',
    );
  }

  // Verify OTP
  const isOtpValid = constantTimeCompare(sha256Hash(otp), updatedUser.otpCodeHash || '');
  
  if (!isOtpValid) {
    throw new AppError(
      HTTP_STATUS.UNAUTHORIZED,
      ERROR_CODES.OTP_INVALID,
      'Invalid OTP',
    );
  }

  // Mark email as verified
  user.isEmailVerified = true;
  user.otpCodeHash = null;
  user.otpExpiresAt = null;
  user.otpCreatedAt = null;
  user.otpResendWindowStartedAt = null;
  user.otpResendCount = 0;
  user.otpAttempts = 0;

  // Generate tokens
  const { accessToken, refreshToken } = generateTokens(user._id.toString(), user.email);

  // Hash and store refresh token
  const refreshTokenHash = sha256Hash(refreshToken);
  user.refreshTokenHash = refreshTokenHash;

  // Save all changes in one operation
  await user.save();

  return {
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      email: user.email,
      isEmailVerified: user.isEmailVerified,
    },
  };
};

// Resend OTP
export const resendOtp = async (email: string) => {
  const user = await User.findOne({ email: email.toLowerCase() });
  
  if (!user) {
    throw new AppError(
      HTTP_STATUS.UNAUTHORIZED,
      ERROR_CODES.INVALID_CREDENTIALS,
      'Invalid credentials',
    );
  }

  // Check if already verified
  if (user.isEmailVerified) {
    throw new AppError(
      HTTP_STATUS.CONFLICT,
      ERROR_CODES.EMAIL_ALREADY_VERIFIED,
      'Email is already verified',
    );
  }

  // Check resend cooldown (prevent spamming)
  const now = new Date();
  const cooldownEnd = new Date(user.otpCreatedAt || 0);
  cooldownEnd.setSeconds(cooldownEnd.getSeconds() + OTP_CONFIG.RESEND_COOLDOWN_SECONDS);
  
  if (user.otpCreatedAt && now < cooldownEnd) {
    const remainingSeconds = Math.ceil((cooldownEnd.getTime() - now.getTime()) / 1000);
    throw new AppError(
      HTTP_STATUS.TOO_MANY_REQUESTS,
      ERROR_CODES.RATE_LIMIT_EXCEEDED,
      `Please wait ${remainingSeconds} seconds before requesting another OTP.`,
    );
  }

  // Check resend cap per hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const windowStarted = user.otpResendWindowStartedAt;
  const resetCount = !windowStarted || windowStarted <= oneHourAgo;
  
  if (!resetCount && user.otpResendCount >= OTP_CONFIG.MAX_RESENDS_PER_HOUR) {
    throw new AppError(
      HTTP_STATUS.TOO_MANY_REQUESTS,
      ERROR_CODES.RATE_LIMIT_EXCEEDED,
      'Too many OTP requests. Please try again later.',
    );
  }

  // Generate new OTP
  const otp = generateOtp();
  const otpHash = sha256Hash(otp);
  const otpExpiresAt = new Date(Date.now() + OTP_CONFIG.EXPIRY_MINUTES * 60 * 1000);
  const otpCreatedAt = new Date();
  const otpResendWindowStartedAt = resetCount ? new Date() : user.otpResendWindowStartedAt;

  // Update user with new OTP
  // Reset otpAttempts to 0 for each resend (fresh attempt limit)
  // Reset otpResendCount if hour has passed, otherwise increment
  await User.findByIdAndUpdate(user._id, {
    otpCodeHash: otpHash,
    otpExpiresAt: otpExpiresAt,
    otpCreatedAt: otpCreatedAt,
    otpResendWindowStartedAt: otpResendWindowStartedAt,
    otpAttempts: 0,
    otpResendCount: resetCount ? 1 : user.otpResendCount + 1,
  });

  // Send OTP email
  await sendOtpEmail({
    email: user.email,
    otp,
    otpExpiresAt,
  });

  logger.info({ userId: user._id }, 'New OTP generated and email sent');

  return {
    message: 'New OTP sent successfully',
    otpExpiresAt,
  };
};

// Login
export const login = async (email: string, password: string) => {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  
  if (!user) {
    throw new AppError(
      HTTP_STATUS.UNAUTHORIZED,
      ERROR_CODES.INVALID_CREDENTIALS,
      'Invalid credentials',
    );
  }

  // Check if email is verified
  if (!user.isEmailVerified) {
    throw new AppError(
      HTTP_STATUS.UNAUTHORIZED,
      ERROR_CODES.EMAIL_NOT_VERIFIED,
      'Email not verified. Please verify your email first.',
    );
  }

  // Verify password
  const isPasswordValid = await (user as any).comparePassword(password);
  
  if (!isPasswordValid) {
    throw new AppError(
      HTTP_STATUS.UNAUTHORIZED,
      ERROR_CODES.INVALID_CREDENTIALS,
      'Invalid credentials',
    );
  }

  // Generate tokens
  const { accessToken, refreshToken } = generateTokens(user._id.toString(), user.email);

  // Hash and store refresh token
  const refreshTokenHash = sha256Hash(refreshToken);
  await User.findByIdAndUpdate(user._id, { refreshTokenHash });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      email: user.email,
      isEmailVerified: user.isEmailVerified,
    },
  };
};

// Google sign-in
export const googleAuth = async (idToken: string) => {
  try {
    // Verify Google token
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    
    if (!payload || !payload.email || !payload.sub) {
      throw new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.INVALID_CREDENTIALS,
        'Invalid Google token',
      );
    }

    // Validate that Google has verified the email
    if (!payload.email_verified) {
      throw new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.INVALID_CREDENTIALS,
        'Email not verified by Google',
      );
    }

    const email = payload.email.toLowerCase();
    const googleSub = payload.sub;

    // Check if user exists with this Google provider ID
    let user = await User.findOne({ 'providerIds.google.sub': googleSub });

    if (user) {
      // User exists with this Google account
      // Generate tokens
      const { accessToken, refreshToken } = generateTokens(user._id.toString(), user.email);

      // Hash and store refresh token
      const refreshTokenHash = sha256Hash(refreshToken);
      await User.findByIdAndUpdate(user._id, { refreshTokenHash });

      return {
        accessToken,
        refreshToken,
        user: {
          id: user._id,
          email: user.email,
          isEmailVerified: user.isEmailVerified,
        },
      };
    }

    // Check if user exists with this email
    user = await User.findOne({ email });

    if (user) {
      // User exists with this email but not linked to Google
      // Do not automatically link - require explicit linking through settings
      throw new AppError(
        HTTP_STATUS.CONFLICT,
        ERROR_CODES.CONFLICT,
        'An account with this email already exists. Please sign in with your existing method or link your Google account through settings.',
      );
    }

    // Create new user with Google
    user = await User.create({
      email,
      passwordHash: null,
      isEmailVerified: true,
      authProviders: [AUTH_PROVIDERS.GOOGLE],
      providerIds: {
        google: { sub: googleSub },
      },
    });

    // Generate tokens after user creation
    const { accessToken, refreshToken } = generateTokens(user._id.toString(), user.email);
    const refreshTokenHash = sha256Hash(refreshToken);
    await User.findByIdAndUpdate(user._id, { refreshTokenHash });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        isEmailVerified: user.isEmailVerified,
      },
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    
    logger.error({ err: error }, 'Google authentication failed');
    throw new AppError(
      HTTP_STATUS.UNAUTHORIZED,
      ERROR_CODES.INVALID_CREDENTIALS,
      'Invalid Google token',
    );
  }
};

// Apple sign-in
export const appleAuth = async (identityToken: string) => {
  try {
    // Verify Apple token using the cached JWKS
    const { payload } = await jwtVerify(identityToken, appleJWKS, {
      issuer: 'https://appleid.apple.com',
      audience: env.APPLE_CLIENT_ID,
    });

    if (!payload.email || !payload.sub) {
      throw new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.INVALID_CREDENTIALS,
        'Invalid Apple token',
      );
    }

    // Validate that Apple has verified the email
  const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
   if (!emailVerified) {
      throw new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.INVALID_CREDENTIALS,
        'Email not verified by Apple',
      );
    }

    const email = (payload.email as string).toLowerCase();
    const appleSub = payload.sub;

    // Check if user exists with this Apple provider ID
    let user = await User.findOne({ 'providerIds.apple.sub': appleSub });

    if (user) {
      // User exists with this Apple account
      // Generate tokens
      const { accessToken, refreshToken } = generateTokens(user._id.toString(), user.email);

      // Hash and store refresh token
      const refreshTokenHash = sha256Hash(refreshToken);
      await User.findByIdAndUpdate(user._id, { refreshTokenHash });

      return {
        accessToken,
        refreshToken,
        user: {
          id: user._id,
          email: user.email,
          isEmailVerified: user.isEmailVerified,
        },
      };
    }

    // Check if user exists with this email
    user = await User.findOne({ email });

    if (user) {
      // User exists with this email but not linked to Apple
      // Do not automatically link - require explicit linking through settings
      throw new AppError(
        HTTP_STATUS.CONFLICT,
        ERROR_CODES.CONFLICT,
        'An account with this email already exists. Please sign in with your existing method or link your Apple account through settings.',
      );
    }

    // Create new user with Apple
    user = await User.create({
      email,
      passwordHash: null,
      isEmailVerified: true,
      authProviders: [AUTH_PROVIDERS.APPLE],
      providerIds: {
        apple: { sub: appleSub },
      },
    });

    // Generate tokens after user creation
    const { accessToken, refreshToken } = generateTokens(user._id.toString(), user.email);
    const refreshTokenHash = sha256Hash(refreshToken);
    await User.findByIdAndUpdate(user._id, { refreshTokenHash });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        isEmailVerified: user.isEmailVerified,
      },
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    
    logger.error({ err: error }, 'Apple authentication failed');
    throw new AppError(
      HTTP_STATUS.UNAUTHORIZED,
      ERROR_CODES.INVALID_CREDENTIALS,
      'Invalid Apple token',
    );
  }
};

// Refresh token
export const refreshToken = async (refreshTokenValue: string) => {
  try {
    // Verify refresh token with proper validation
    const decoded = jwt.verify(refreshTokenValue, env.JWT_REFRESH_SECRET, {
      issuer: 'subtrack',
      audience: 'subtrack-api',
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;

    // Validate required claims
    if (!decoded.userId || typeof decoded.userId !== 'string') {
      throw new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.TOKEN_INVALID,
        'Invalid token: missing or invalid userId',
      );
    }

    if (!decoded.email || typeof decoded.email !== 'string') {
      throw new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.TOKEN_INVALID,
        'Invalid token: missing or invalid email',
      );
    }

    if (decoded.tokenType !== 'refresh') {
      throw new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.TOKEN_INVALID,
        'Invalid token: expected refresh token',
      );
    }

    if (!decoded.jti || typeof decoded.jti !== 'string') {
      throw new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.TOKEN_INVALID,
        'Invalid token: missing or invalid jti',
      );
    }

    // Get user
    const user = await User.findById(decoded.userId).select('+refreshTokenHash');
    
    if (!user) {
      throw new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.INVALID_CREDENTIALS,
        'Invalid credentials',
      );
    }

    // Verify refresh token hash using constant-time comparison
    const presentedHash = sha256Hash(refreshTokenValue);
    const storedHash = user.refreshTokenHash || '';
    
    if (!constantTimeCompare(presentedHash, storedHash)) {
      // Hash mismatch - could be reuse attack or invalid token
      // Clear the stored hash to invalidate the current token chain
      await User.findByIdAndUpdate(user._id, { refreshTokenHash: null });
      
      throw new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.INVALID_CREDENTIALS,
        'Invalid credentials',
      );
    }

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user._id.toString(), user.email);

    // Hash new refresh token
    const newRefreshTokenHash = sha256Hash(newRefreshToken);

    // Atomic conditional update: only replace if the stored hash still matches
    const updatedUser = await User.findOneAndUpdate(
      {
        _id: user._id,
        refreshTokenHash: storedHash,
      },
      {
        refreshTokenHash: newRefreshTokenHash,
      },
      { new: true }
    ).select('+refreshTokenHash');

    if (!updatedUser) {
      // Update failed - the stored hash was changed (race condition detected)
      // Don't clear the hash, just reject this request
      // The other request will succeed, and this user can retry
      throw new AppError(
        HTTP_STATUS.CONFLICT,
        ERROR_CODES.CONFLICT,
        'Token rotation in progress. Please try again.',
      );
    }

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.TOKEN_EXPIRED,
        'Refresh token has expired',
      );
    }

    if (error instanceof jwt.JsonWebTokenError) {
      throw new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.TOKEN_INVALID,
        'Invalid refresh token',
      );
    }

    logger.error({ err: error }, 'Token refresh failed');
    throw new AppError(
      HTTP_STATUS.UNAUTHORIZED,
      ERROR_CODES.INVALID_CREDENTIALS,
      'Invalid credentials',
    );
  }
};
