import { Request, Response, NextFunction } from 'express';
import {
  getUserProfile,
  updateUserProfile,
  changePassword,
  linkGoogleAccount,
  linkAppleAccount,
  deleteUserAccount,
} from '../services/userService';
import { HTTP_STATUS } from '../config/constants';

// Get user profile
export const getUserProfileController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const profile = await getUserProfile(userId);

    res.status(HTTP_STATUS.OK).json({
      status: 'success',
      data: profile,
    });
  } catch (error) {
    next(error);
  }
};

// Update user profile
export const updateProfileController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const { email, timezone, expoPushToken } = req.body;

    const updatedProfile = await updateUserProfile(userId, {
      email,
      timezone,
      expoPushToken,
    });

    res.status(HTTP_STATUS.OK).json({
      status: 'success',
      data: updatedProfile,
    });
  } catch (error) {
    next(error);
  }
};

// Change password
export const changePasswordController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const { currentPassword, newPassword } = req.body;

    const result = await changePassword(userId, currentPassword, newPassword);

    res.status(HTTP_STATUS.OK).json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// Link Google account
export const linkGoogleController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const { idToken } = req.body;

    const result = await linkGoogleAccount(userId, idToken);

    res.status(HTTP_STATUS.OK).json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// Link Apple account
export const linkAppleController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const { identityToken } = req.body;

    const result = await linkAppleAccount(userId, identityToken);

    res.status(HTTP_STATUS.OK).json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// Delete user account
export const deleteUserAccountController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user!.id;
    const result = await deleteUserAccount(userId);

    res.status(HTTP_STATUS.OK).json({
      status: 'success',
     data: result,
    });
  } catch (error) {
    next(error);
  }
};