import { Router } from 'express';
import authRoutes from './authRoutes';

const router = Router();

// Mount auth routes under /api/v1/auth
router.use('/auth', authRoutes);

export default router;
