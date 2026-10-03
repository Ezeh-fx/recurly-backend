import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env';
import { User } from '../models/User';
import { AppError } from '../middleware/errorHandler';
import { HTTP_STATUS, ERROR_CODES, OTP_CONFIG, BCRYPT_CONFIG, AUTH_PROVIDERS } from '../config/constants';
import logger from '../config/logger';

// Conditionally import jose for Apple auth (ESM module)
let jose: any;
try {
  jose = require('jose');
} catch (e) {
  logger.warn('jose library not available - Apple auth will be disabled');
}

// Google OAuth client
const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

// Generate OTP
const generateOtp = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Hash OTP
const hashOtp = async (otp: string): Promise<string> => {
  const salt = await bcrypt.genSalt(BCRYPT_CONFIG.COST);
  return bcrypt.hash(otp, salt);
};

// Generate tokens
const generateTokens = (userId: string, email: string) => {
  const accessToken = jwt.sign(
    { userId, email },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN } as jwt.SignOptions,
  );

  const refreshToken = jwt.sign(
    { userId, email },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN } as jwt.SignOptions,
  );

  return { accessToken, refreshToken };
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

  // Create user with password (pre-save hook will hash it)
  const user = await User.create({
    email: email.toLowerCase(),
    passwordHash: password, // Will be hashed by pre-save hook
    isEmailVerified: false,
    authProviders: [AUTH_PROVIDERS.EMAIL],
  });

  // Generate and hash OTP
  const otp = generateOtp();
  const otpHash = await hashOtp(otp);
  const otpExpiresAt = new Date(Date.now() + OTP_CONFIG.EXPIRY_MINUTES * 60 * 1000);

  // Update user with OTP
  user.otpCodeHash = otpHash;
  user.otpExpiresAt = otpExpiresAt;
  user.otpAttempts = 0;
  await user.save();

  // TODO: Send OTP email (implement email service)
  logger.info({ email: user.email }, 'OTP generated for email verification');

  return {
    message: 'Registration successful. Please check your email for OTP verification.',
    otpExpiresAt: user.otpExpiresAt,
    otp, // For testing purposes; remove in production
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

  // Check OTP attempts
  if (user.otpAttempts >= OTP_CONFIG.MAX_ATTEMPTS) {
    throw new AppError(
      HTTP_STATUS.UNAUTHORIZED,
      ERROR_CODES.OTP_TOO_MANY_ATTEMPTS,
      'Too many failed attempts. Please request a new OTP.',
    );
  }

  // Verify OTP
  const isOtpValid = await bcrypt.compare(otp, user.otpCodeHash || '');
  
  if (!isOtpValid) {
    user.otpAttempts = (user.otpAttempts || 0) + 1;
    await user.save();
    
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
  user.otpAttempts = 0;
  await user.save();

  // Generate tokens
  const { accessToken, refreshToken } = generateTokens(user._id.toString(), user.email);

  // Hash and store refresh token
  const refreshTokenHash = await hashOtp(refreshToken);
  user.refreshTokenHash = refreshTokenHash;
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

  // Generate new OTP
  const otp = generateOtp();
  const otpHash = await hashOtp(otp);
  const otpExpiresAt = new Date(Date.now() + OTP_CONFIG.EXPIRY_MINUTES * 60 * 1000);

  // Update user with new OTP
  user.otpCodeHash = otpHash;
  user.otpExpiresAt = otpExpiresAt;
  user.otpAttempts = 0;
  await user.save();

  // TODO: Send OTP email (implement email service)
  logger.info({ email: user.email }, 'New OTP generated for email verification');

  return {
    message: 'New OTP sent successfully',
    otpExpiresAt: user.otpExpiresAt,
    otp, // For testing purposes; remove in production
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
  const refreshTokenHash = await hashOtp(refreshToken);
  user.refreshTokenHash = refreshTokenHash;
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

    const email = payload.email.toLowerCase();
    const googleSub = payload.sub;

    // Check if user exists with this Google provider ID
    let user = await User.findOne({ 'providerIds.google.sub': googleSub });

    if (user) {
      // User exists with this Google account
      // Generate tokens
      const { accessToken, refreshToken } = generateTokens(user._id.toString(), user.email);

      // Hash and store refresh token
      const refreshTokenHash = await hashOtp(refreshToken);
      user.refreshTokenHash = refreshTokenHash;
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
    }

    // Check if user exists with this email
    user = await User.findOne({ email });

    if (user) {
      // User exists with this email but not linked to Google
      // Only link if email is from Gmail (Google authoritative)
      if (email.endsWith('@gmail.com') || email.endsWith('@googlemail.com')) {
        // Link Google provider
        if (!user.authProviders.includes(AUTH_PROVIDERS.GOOGLE)) {
          user.authProviders.push(AUTH_PROVIDERS.GOOGLE);
        }
        user.providerIds = user.providerIds || {};
        user.providerIds.google = { sub: googleSub };
        user.isEmailVerified = true; // Google already verified
        await user.save();

        // Generate tokens
        const { accessToken, refreshToken } = generateTokens(user._id.toString(), user.email);

        // Hash and store refresh token
        const refreshTokenHash = await hashOtp(refreshToken);
        user.refreshTokenHash = refreshTokenHash;
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
      } else {
        // Email is not from Gmail - don't link
        throw new AppError(
          HTTP_STATUS.CONFLICT,
          ERROR_CODES.CONFLICT,
          'An account with this email already exists. Please sign in with your password or link your account through settings.',
        );
      }
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

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id.toString(), user.email);

    // Hash and store refresh token
    const refreshTokenHash = await hashOtp(refreshToken);
    user.refreshTokenHash = refreshTokenHash;
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
  if (!jose) {
    throw new AppError(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      ERROR_CODES.INTERNAL_ERROR,
      'Apple authentication is not available',
    );
  }

  try {
    // Apple's public keys for token verification
    const appleKeysUrl = 'https://appleid.apple.com/auth/keys';
    const JWKS = jose.createRemoteJWKSet(new URL(appleKeysUrl));

    // Verify Apple token
    const { payload } = await jose.jwtVerify(identityToken, JWKS, {
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

    const email = (payload.email as string).toLowerCase();
    const appleSub = payload.sub;

    // Check if user exists with this Apple provider ID
    let user = await User.findOne({ 'providerIds.apple.sub': appleSub });

    if (user) {
      // User exists with this Apple account
      // Generate tokens
      const { accessToken, refreshToken } = generateTokens(user._id.toString(), user.email);

      // Hash and store refresh token
      const refreshTokenHash = await hashOtp(refreshToken);
      user.refreshTokenHash = refreshTokenHash;
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
    }

    // Check if user exists with this email
    user = await User.findOne({ email });

    if (user) {
      // User exists with this email but not linked to Apple
      // Apple is authoritative for iCloud emails (@icloud.com, @me.com, @mac.com)
      if (email.endsWith('@icloud.com') || email.endsWith('@me.com') || email.endsWith('@mac.com')) {
        // Link Apple provider
        if (!user.authProviders.includes(AUTH_PROVIDERS.APPLE)) {
          user.authProviders.push(AUTH_PROVIDERS.APPLE);
        }
        user.providerIds = user.providerIds || {};
        user.providerIds.apple = { sub: appleSub };
        user.isEmailVerified = true; // Apple already verified
        await user.save();

        // Generate tokens
        const { accessToken, refreshToken } = generateTokens(user._id.toString(), user.email);

        // Hash and store refresh token
        const refreshTokenHash = await hashOtp(refreshToken);
        user.refreshTokenHash = refreshTokenHash;
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
      } else {
        // Email is not from iCloud - don't link
        throw new AppError(
          HTTP_STATUS.CONFLICT,
          ERROR_CODES.CONFLICT,
          'An account with this email already exists. Please sign in with your password or link your account through settings.',
        );
      }
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

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id.toString(), user.email);

    // Hash and store refresh token
    const refreshTokenHash = await hashOtp(refreshToken);
    user.refreshTokenHash = refreshTokenHash;
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
    // Verify refresh token
    const decoded = jwt.verify(refreshTokenValue, env.JWT_REFRESH_SECRET) as {
      userId: string;
      email: string;
    };

    // Get user
    const user = await User.findById(decoded.userId).select('+refreshTokenHash');
    
    if (!user) {
      throw new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.INVALID_CREDENTIALS,
        'Invalid credentials',
      );
    }

    // Verify refresh token hash
    const isTokenValid = await bcrypt.compare(refreshTokenValue, user.refreshTokenHash || '');
    
    if (!isTokenValid) {
      throw new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.INVALID_CREDENTIALS,
        'Invalid credentials',
      );
    }

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user._id.toString(), user.email);

    // Hash and store new refresh token
    const newRefreshTokenHash = await hashOtp(newRefreshToken);
    user.refreshTokenHash = newRefreshTokenHash;
    await user.save();

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
    console.log('Decoded refresh token:', error);
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
