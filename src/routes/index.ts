import { Router } from 'express';
import authRoutes from './authRoutes';
import userRoutes from './userRoutes';

const router = Router();

// Mount auth routes under /api/v1/auth
router.use('/auth', authRoutes);

// Mount user routes under /api/v1/users
router.use('/users', userRoutes);

export default router;
