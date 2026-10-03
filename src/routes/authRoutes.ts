import { Router } from 'express';
import { authRateLimiter } from '../middleware/security';
import { validate } from '../middleware/validation';
import {
  registerSchema,
  verifyOtpSchema,
  resendOtpSchema,
  loginSchema,
  googleAuthSchema,
  appleAuthSchema,
  refreshTokenSchema,
} from '../validators';
import {
  registerController,
  verifyOtpController,
  resendOtpController,
  loginController,
  googleAuthController,
  appleAuthController,
  refreshTokenController,
} from '../controllers/authController';

const router = Router();

// Apply auth rate limiter to all auth routes
router.use(authRateLimiter);

// Register
router.post('/register', validate(registerSchema), registerController);

// Verify OTP
router.post('/verify-otp', validate(verifyOtpSchema), verifyOtpController);

// Resend OTP
router.post('/resend-otp', validate(resendOtpSchema), resendOtpController);

// Login
router.post('/login', validate(loginSchema), loginController);

// Google sign-in
router.post('/google', validate(googleAuthSchema), googleAuthController);

// Apple sign-in
router.post('/apple', validate(appleAuthSchema), appleAuthController);

// Refresh token
router.post('/refresh', validate(refreshTokenSchema), refreshTokenController);

export default router;
