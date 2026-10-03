import { Request, Response, NextFunction } from 'express';
import {
  register,
  verifyOtp,
  resendOtp,
  login,
  googleAuth,
  appleAuth,
  refreshToken as newRefreshToken,
} from '../services/authService';

export const registerController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, password } = req.body;
    const result = await register(email, password);
    
    res.status(201).json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const verifyOtpController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, otp } = req.body;
    const result = await verifyOtp(email, otp);
    
    res.status(200).json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const resendOtpController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email } = req.body;
    const result = await resendOtp(email);
    
    res.status(200).json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const loginController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, password } = req.body;
    const result = await login(email, password);
    
    res.status(200).json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const googleAuthController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { idToken } = req.body;
    const result = await googleAuth(idToken);
    
    res.status(200).json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const appleAuthController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { identityToken } = req.body;
    const result = await appleAuth(identityToken);
    
    res.status(200).json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const refreshTokenController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { refreshToken } = req.body;
    const result = await newRefreshToken(refreshToken);
    
    res.status(200).json({
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
