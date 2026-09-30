import mongoose, { Schema, Document } from 'mongoose';
import {
  BillingCycle,
  SubscriptionStatus,
  REMINDER_CONFIG,
  BILLING_CYCLES,
  SUBSCRIPTION_STATUS,
} from '../config/constants';

export interface ISubscription extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  cost: number;
  currency: string;
  billingCycle: BillingCycle;
  nextRenewalDate: Date;
  status: SubscriptionStatus;
  remindDaysBefore: number;
  category?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionSchema = new Schema<ISubscription>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    cost: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      default: 'USD',
      uppercase: true,
      trim: true,
    },
    billingCycle: {
      type: String,
      required: true,
      enum: Object.values(BILLING_CYCLES) as BillingCycle[],
    },
    nextRenewalDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(SUBSCRIPTION_STATUS) as SubscriptionStatus[],
      default: SUBSCRIPTION_STATUS.ACTIVE,
    },
    remindDaysBefore: {
      type: Number,
      required: true,
      default: REMINDER_CONFIG.DEFAULT_REMIND_DAYS_BEFORE,
      min: 1,
      max: 30,
    },
    category: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for querying subscriptions by user (required for all subscription queries)
subscriptionSchema.index({ userId: 1 });

// Compound index for reminder job: find active subscriptions with upcoming renewals
subscriptionSchema.index({ userId: 1, nextRenewalDate: 1, status: 1 });

// Index for sorting by renewal date
subscriptionSchema.index({ nextRenewalDate: 1 });

// Index for status filtering
subscriptionSchema.index({ status: 1 });

export const Subscription = mongoose.model<ISubscription>('Subscription', subscriptionSchema);
