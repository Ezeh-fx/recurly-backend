import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validation';
import { authRateLimiter } from '../middleware/security';
import {
  updateProfileSchema,
  changePasswordSchema,
  linkGoogleSchema,
  linkAppleSchema,
} from '../validators';
import {
  getUserProfileController,
  updateProfileController,
  changePasswordController,
  linkGoogleController,
  linkAppleController,
} from '../controllers/userController';

const router = Router();

// All user routes require authentication
router.use(authenticate);

// Get user profile
router.get('/profile', getUserProfileController);

// Update user profile
router.patch('/profile', validate(updateProfileSchema), updateProfileController);

// Change password
router.post('/change-password', authRateLimiter, validate(changePasswordSchema), changePasswordController);

// Link Google account
router.post('/link-google', authRateLimiter, validate(linkGoogleSchema), linkGoogleController);

// Link Apple account
router.post('/link-apple', authRateLimiter, validate(linkAppleSchema), linkAppleController);

export default router;
