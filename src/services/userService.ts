import { OAuth2Client } from "google-auth-library";
import crypto from "crypto";
import { env } from "../config/env";
import { User } from "../models/User";
import { AppError } from "../middleware/errorHandler";
import { HTTP_STATUS, ERROR_CODES, AUTH_PROVIDERS } from "../config/constants";
import logger from "../config/logger";
import { createRemoteJWKSet, jwtVerify } from "jose";

// Google OAuth client
const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

// Apple JWKS client (created once for reuse)
const appleJWKS = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys"),
);

// Get user profile
export const getUserProfile = async (userId: string) => {
  const user = await User.findById(userId).select(
    "-passwordHash -otpCodeHash -refreshTokenHash",
  );

  if (!user) {
    throw new AppError(
      HTTP_STATUS.NOT_FOUND,
      ERROR_CODES.NOT_FOUND,
      "User not found",
    );
  }

  return {
    id: user._id,
    email: user.email,
    isEmailVerified: user.isEmailVerified,
    authProviders: user.authProviders,
    expoPushToken: user.expoPushToken,
    timezone: user.timezone,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

// Update user profile
export const updateUserProfile = async (
  userId: string,
  updates: {
    email?: string;
    timezone?: string;
    expoPushToken?: string;
  },
) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError(
      HTTP_STATUS.NOT_FOUND,
      ERROR_CODES.NOT_FOUND,
      "User not found",
    );
  }

  // If email is being updated, check if it's already taken
  if (
    updates.email &&
    updates.email.toLowerCase() !== user.email.toLowerCase()
  ) {
    const existingUser = await User.findOne({
      email: updates.email.toLowerCase(),
    });
    if (existingUser) {
      throw new AppError(
        HTTP_STATUS.CONFLICT,
        ERROR_CODES.CONFLICT,
        "Email already in use",
      );
    }

    // Email change requires re-verification
    user.email = updates.email.toLowerCase();
    user.isEmailVerified = false;
    // TODO: Generate and send new OTP for email verification
    logger.info(
      { userId: user._id },
      "Email changed, re-verification required",
    );
  }

  if (updates.timezone !== undefined) {
    user.timezone = updates.timezone;
  }

  if (updates.expoPushToken !== undefined) {
    user.expoPushToken = updates.expoPushToken;
  }

  await user.save();

  return {
    id: user._id,
    email: user.email,
    isEmailVerified: user.isEmailVerified,
    authProviders: user.authProviders,
    expoPushToken: user.expoPushToken,
    timezone: user.timezone,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};

// Change password
export const changePassword = async (
  userId: string,
  currentPassword: string,
  newPassword: string,
) => {
  const user = await User.findById(userId).select("+passwordHash");

  if (!user) {
    throw new AppError(
      HTTP_STATUS.NOT_FOUND,
      ERROR_CODES.NOT_FOUND,
      "User not found",
    );
  }

  // Check if user has a password (social auth users might not)
  if (!user.passwordHash) {
    throw new AppError(
      HTTP_STATUS.BAD_REQUEST,
      ERROR_CODES.VALIDATION_ERROR,
      "User does not have a password. Please use social authentication.",
    );
  }

  // Verify current password
  const isPasswordValid = await (user as any).comparePassword(currentPassword);

  if (!isPasswordValid) {
    throw new AppError(
      HTTP_STATUS.UNAUTHORIZED,
      ERROR_CODES.INVALID_CREDENTIALS,
      "Current password is incorrect",
    );
  }

  // Update password (will be hashed by pre-save hook)
  user.passwordHash = newPassword;
  await user.save();

  logger.info({ userId: user._id }, "Password changed successfully");

  return {
    message: "Password changed successfully",
  };
};

// Link Google account
export const linkGoogleAccount = async (userId: string, idToken: string) => {
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
        "Invalid Google token",
      );
    }

    // Validate that Google has verified the email
    if (!payload.email_verified) {
      throw new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.INVALID_CREDENTIALS,
        "Email not verified by Google",
      );
    }

    const email = payload.email.toLowerCase();
    const googleSub = payload.sub;

    // Get the user attempting to link
    const user = await User.findById(userId);

    if (!user) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        "User not found",
      );
    }

    // Check if Google is already linked to this user
    if (user.authProviders.includes(AUTH_PROVIDERS.GOOGLE)) {
      throw new AppError(
        HTTP_STATUS.CONFLICT,
        ERROR_CODES.CONFLICT,
        "Google account is already linked to this account",
      );
    }

    // Check if this Google account is already linked to another user
    const existingGoogleUser = await User.findOne({
      "providerIds.google.sub": googleSub,
    });
    if (existingGoogleUser) {
      throw new AppError(
        HTTP_STATUS.CONFLICT,
        ERROR_CODES.CONFLICT,
        "This Google account is already linked to another account",
      );
    }

    // Security check: Only allow linking if the email matches the user's current email
    // Domain ownership alone is not sufficient for authorization
    const isSameEmail = email === user.email.toLowerCase();

    if (!isSameEmail) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.FORBIDDEN,
        "Cannot link Google account: email address does not match your account email. Please use the same email address.",
      );
    }

    // Link Google account
    user.authProviders.push(AUTH_PROVIDERS.GOOGLE);
    user.providerIds = {
      ...user.providerIds,
      google: { sub: googleSub },
    };

    await user.save();

    logger.info(
      { userId: user._id, googleEmail: email },
      "Google account linked successfully",
    );

    return {
      message: "Google account linked successfully",
      user: {
        id: user._id,
        email: user.email,
        isEmailVerified: user.isEmailVerified,
        authProviders: user.authProviders,
      },
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    // Handle MongoDB duplicate key error (race condition on provider linking)
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      throw new AppError(
        HTTP_STATUS.CONFLICT,
        ERROR_CODES.CONFLICT,
        'This Google account is already linked to another account',
      );
    }

    logger.error({ err: error }, "Google account linking failed");
    throw new AppError(
      HTTP_STATUS.UNAUTHORIZED,
      ERROR_CODES.INVALID_CREDENTIALS,
      "Invalid Google token",
    );
  }
};

// Link Apple account
export const linkAppleAccount = async (
  userId: string,
  identityToken: string,
) => {
  try {
    // Verify Apple token using the cached JWKS
    const { payload } = await jwtVerify(identityToken, appleJWKS, {
      issuer: "https://appleid.apple.com",
      audience: env.APPLE_CLIENT_ID,
    });

    if (!payload.email || !payload.sub) {
      throw new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.INVALID_CREDENTIALS,
        "Invalid Apple token",
      );
    }

    // Validate that Apple has verified the email
    const emailVerified =
      payload.email_verified === true || payload.email_verified === "true";
    if (!emailVerified) {
      throw new AppError(
        HTTP_STATUS.UNAUTHORIZED,
        ERROR_CODES.INVALID_CREDENTIALS,
        "Email not verified by Apple",
      );
    }

    const email = (payload.email as string).toLowerCase();
    const appleSub = payload.sub;

    // Get the user attempting to link
    const user = await User.findById(userId);

    if (!user) {
      throw new AppError(
        HTTP_STATUS.NOT_FOUND,
        ERROR_CODES.NOT_FOUND,
        "User not found",
      );
    }

    // Check if Apple is already linked to this user
    if (user.authProviders.includes(AUTH_PROVIDERS.APPLE)) {
      throw new AppError(
        HTTP_STATUS.CONFLICT,
        ERROR_CODES.CONFLICT,
        "Apple account is already linked to this account",
      );
    }

    // Check if this Apple account is already linked to another user
    const existingAppleUser = await User.findOne({
      "providerIds.apple.sub": appleSub,
    });
    if (existingAppleUser) {
      throw new AppError(
        HTTP_STATUS.CONFLICT,
        ERROR_CODES.CONFLICT,
        "This Apple account is already linked to another account",
      );
    }

    // Security check: Only allow linking if the email matches the user's current email
    // Domain ownership alone is not sufficient for authorization
    const isSameEmail = email === user.email.toLowerCase();

    if (!isSameEmail) {
      throw new AppError(
        HTTP_STATUS.FORBIDDEN,
        ERROR_CODES.FORBIDDEN,
        "Cannot link Apple account: email address does not match your account email. Please use the same email address.",
      );
    }

    // Link Apple account
    user.authProviders.push(AUTH_PROVIDERS.APPLE);
    user.providerIds = {
      ...user.providerIds,
      apple: { sub: appleSub },
    };

    await user.save();

    logger.info(
      { userId: user._id, appleEmail: email },
      "Apple account linked successfully",
    );

    return {
      message: "Apple account linked successfully",
      user: {
        id: user._id,
        email: user.email,
        isEmailVerified: user.isEmailVerified,
        authProviders: user.authProviders,
      },
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    // Handle MongoDB duplicate key error (race condition on provider linking)
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      throw new AppError(
        HTTP_STATUS.CONFLICT,
        ERROR_CODES.CONFLICT,
        'This Apple account is already linked to another account',
      );
    }

    logger.error({ err: error }, "Apple account linking failed");
    throw new AppError(
      HTTP_STATUS.UNAUTHORIZED,
      ERROR_CODES.INVALID_CREDENTIALS,
      "Invalid Apple token",
    );
  }
};
