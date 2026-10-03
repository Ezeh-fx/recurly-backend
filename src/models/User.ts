import mongoose, { Schema, Document } from 'mongoose';
import { OTP_CONFIG, BCRYPT_CONFIG, AuthProvider } from '../config/constants';
import bcrypt from 'bcrypt';

export interface IUser extends Document {
  email: string;
  passwordHash: string | null;
  isEmailVerified: boolean;
  otpCodeHash: string | null;
  otpExpiresAt: Date | null;
  otpAttempts: number;
  authProviders: AuthProvider[];
  providerIds: {
    google?: { sub: string };
    apple?: { sub: string };
  };
  refreshTokenHash: string | null;
  expoPushToken?: string;
  timezone?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      select: false,
      default: null,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    otpCodeHash: {
      type: String,
      select: false,
      default: null,
    },
    otpExpiresAt: {
      type: Date,
      default: null,
    },
    otpAttempts: {
      type: Number,
      default: 0,
      max: OTP_CONFIG.MAX_ATTEMPTS,
    },
    authProviders: {
      type: [String],
      enum: ['email', 'google', 'apple'],
      default: [],
    },
    providerIds: {
      google: {
        sub: { type: String },
      },
      apple: {
        sub: { type: String },
      },
    },
    refreshTokenHash: {
      type: String,
      select: false,
      default: null,
    },
    expoPushToken: {
      type: String,
      trim: true,
    },
    timezone: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for auth provider lookups (unique and sparse to prevent duplicate provider IDs)
userSchema.index({ 'providerIds.google.sub': 1 }, { unique: true, sparse: true });
userSchema.index({ 'providerIds.apple.sub': 1 }, { unique: true, sparse: true });

// Index for OTP cleanup (find expired OTPs)
userSchema.index({ otpExpiresAt: 1 });

// Pre-save hook to hash password before saving
userSchema.pre('save', async function () {
  const user = this as any;

  // Only hash the password if it has been modified (or is new)
  if (!user.isModified('passwordHash') || !user.passwordHash) {
    return;
  }

  try {
    const salt = await bcrypt.genSalt(BCRYPT_CONFIG.COST);
    user.passwordHash = await bcrypt.hash(user.passwordHash, salt);
  } catch (error) {
    throw error;
  }
});

// Password compare method
userSchema.methods.comparePassword = async function (password: string) {
  return bcrypt.compare(password, this.passwordHash || '');
};

export const User = mongoose.model<IUser>('User', userSchema);
