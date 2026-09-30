import mongoose, { Schema, Document } from 'mongoose';
import { ReminderStatus, REMINDER_STATUS } from '../config/constants';

export interface IReminderLog extends Document {
  subscriptionId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  reminderDate: Date;
  renewalDate: Date;
  status: ReminderStatus;
  errorMessage?: string;
  createdAt: Date;
}

const reminderLogSchema = new Schema<IReminderLog>(
  {
    subscriptionId: {
      type: Schema.Types.ObjectId,
      ref: 'Subscription',
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reminderDate: {
      type: Date,
      required: true,
    },
    renewalDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(REMINDER_STATUS) as ReminderStatus[],
    },
    errorMessage: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Unique compound index to prevent duplicate reminders for the same subscription and renewal date
reminderLogSchema.index(
  { subscriptionId: 1, renewalDate: 1 },
  { unique: true }
);

// Index for querying by user
reminderLogSchema.index({ userId: 1 });

// Index for querying by reminder date (for cleanup job)
reminderLogSchema.index({ reminderDate: 1 });

// Index for querying failed reminders (for retry logic)
reminderLogSchema.index({ status: 1 });

export const ReminderLog = mongoose.model<IReminderLog>('ReminderLog', reminderLogSchema);
