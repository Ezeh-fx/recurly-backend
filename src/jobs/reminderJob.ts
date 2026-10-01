import cron from 'node-cron';
import { Subscription } from '../models/Subscription';
import { ReminderLog } from '../models/ReminderLog';
import { REMINDER_CONFIG, REMINDER_STATUS, SUBSCRIPTION_STATUS } from '../config/constants';
import { sendPushNotification } from '../services/notificationService';
import logger from '../config/logger';

export function startReminderJob(): any {
  const task = cron.schedule(
    REMINDER_CONFIG.CRON_SCHEDULE,
    async () => {
      logger.info('Starting daily reminder job');
      await processReminders();
    },
    {
      timezone: 'UTC',
    }
  );

  logger.info(`Reminder job scheduled with cron: ${REMINDER_CONFIG.CRON_SCHEDULE}`);
  return task;
}

export async function processReminders() {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    logger.info({ date: today.toISOString() }, 'Processing reminders');

    // Find active subscriptions with renewal dates in the reminder window
    const subscriptions = await Subscription.find({
      status: SUBSCRIPTION_STATUS.ACTIVE,
      nextRenewalDate: {
        $gte: today,
        $lte: tomorrow,
      },
    }).populate('userId', 'expoPushToken email');

    logger.info({ count: subscriptions.length }, 'Found subscriptions due for renewal');

    const reminderPromises = subscriptions.map(subscription =>
      processSubscriptionReminder(subscription, today)
    );

    await Promise.allSettled(reminderPromises);

    logger.info('Daily reminder job completed');
  } catch (error) {
    logger.error({ err: error }, 'Error in reminder job');
  }
}

export async function processSubscriptionReminder(
  subscription: any,
  reminderDate: Date
): Promise<void> {
  try {
    const user = subscription.userId;
    if (!user || !user.expoPushToken) {
      logger.info(
        { subscriptionId: subscription._id, userId: user?._id },
        'User does not have Expo push token, skipping reminder'
      );
      return;
    }

    // Check if we've already sent a reminder for this renewal
    const existingReminder = await ReminderLog.findOne({
      subscriptionId: subscription._id,
      renewalDate: subscription.nextRenewalDate,
    });

    if (existingReminder) {
      logger.info(
        { subscriptionId: subscription._id, renewalDate: subscription.nextRenewalDate },
        'Reminder already sent for this renewal date, skipping'
      );
      return;
    }

    // Send push notification
    const daysUntilRenewal = Math.ceil(
      (subscription.nextRenewalDate.getTime() - reminderDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const title = 'Subscription Renewal Reminder';
    const body = `Your subscription to ${subscription.name} will renew in ${daysUntilRenewal} day${daysUntilRenewal > 1 ? 's' : ''}. Cost: ${formatCost(subscription.cost, subscription.currency)}`;

    const result = await sendPushNotification(
      user.expoPushToken,
      title,
      body,
      {
        subscriptionId: subscription._id.toString(),
        renewalDate: subscription.nextRenewalDate.toISOString(),
      }
    );

    // Log the reminder attempt
    await ReminderLog.create({
      subscriptionId: subscription._id,
      userId: user._id,
      reminderDate,
      renewalDate: subscription.nextRenewalDate,
      status: result.success ? REMINDER_STATUS.SENT : REMINDER_STATUS.FAILED,
      errorMessage: result.error,
    });

    if (result.success) {
      logger.info(
        { subscriptionId: subscription._id, userId: user._id },
        'Reminder sent successfully'
      );
    } else {
      logger.warn(
        { subscriptionId: subscription._id, userId: user._id, error: result.error },
        'Failed to send reminder'
      );
    }
  } catch (error) {
    logger.error(
      { err: error, subscriptionId: subscription._id },
      'Error processing subscription reminder'
    );
  }
}

export function formatCost(cost: number, currency: string): string {
  const majorUnits = cost / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(majorUnits);
}
