import { z } from 'zod';

// Update profile schema
export const updateProfileSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address').optional(),
    timezone: z.string().trim().optional(),
    expoPushToken: z.string().trim().optional(),
  }),
});

// Change password schema
export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string()
      .min(8, 'New password must be at least 8 characters')
      .max(128, 'New password must not exceed 128 characters'),
  }),
});

// Link Google account schema
export const linkGoogleSchema = z.object({
  body: z.object({
    idToken: z.string().min(1, 'Google ID token is required'),
  }),
});

// Link Apple account schema
export const linkAppleSchema = z.object({
  body: z.object({
    identityToken: z.string().min(1, 'Apple identity token is required'),
  }),
});
