import cron, { ScheduledTask } from 'node-cron';
import { Subscription } from '../models/Subscription';
import { ReminderLog } from '../models/ReminderLog';
import { REMINDER_CONFIG, REMINDER_STATUS, SUBSCRIPTION_STATUS } from '../config/constants';
import { sendPushNotification } from '../services/notificationService';
import logger from '../config/logger';
import { ISubscription } from '../models/Subscription';
import { IUser } from '../models/User';
import { IReminderLog } from '../models/ReminderLog';

interface IPopulatedSubscription extends Omit<ISubscription, 'userId'> {
  userId: Pick<IUser, '_id' | 'expoPushToken' | 'email'>;
}

export function startReminderJob(): ScheduledTask {
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
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    logger.info({ date: today.toISOString() }, 'Processing reminders');

    // Find active subscriptions where today is within the reminder window
    // Window: from (nextRenewalDate - remindDaysBefore) to nextRenewalDate
    const subscriptions = await Subscription.find({
      status: SUBSCRIPTION_STATUS.ACTIVE,
      nextRenewalDate: {
        $gte: today,
      },
    }).populate('userId', 'expoPushToken email');

    logger.info({ count: subscriptions.length }, 'Found active subscriptions to check');

    // Filter to only those within their reminder window
    const subscriptionsInWindow = subscriptions.filter(subscription => {
      const reminderStartDate = new Date(subscription.nextRenewalDate);
      reminderStartDate.setUTCDate(reminderStartDate.getUTCDate() - subscription.remindDaysBefore);
      return today >= reminderStartDate && today <= subscription.nextRenewalDate;
    });

    logger.info({ count: subscriptionsInWindow.length }, 'Found subscriptions in reminder window');

    const reminderPromises = subscriptionsInWindow.map(subscription =>
      processSubscriptionReminder(subscription as unknown as IPopulatedSubscription, today)
    );

    await Promise.allSettled(reminderPromises);

    logger.info('Daily reminder job completed');
  } catch (error) {
    logger.error({ err: error }, 'Error in reminder job');
  }
}

export async function processSubscriptionReminder(
  subscription: IPopulatedSubscription,
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

    // Atomically claim this reminder by creating a PENDING log entry
    let reminderLog: IReminderLog | null = null;
    try {
      reminderLog = await ReminderLog.create({
        subscriptionId: subscription._id,
        userId: user._id,
        reminderDate,
        renewalDate: subscription.nextRenewalDate,
        status: REMINDER_STATUS.PENDING,
      });
    } catch (error: any) {
      // If unique constraint violation, check if we should skip or retry
      if (error.code === 11000) {
        const existingReminder = await ReminderLog.findOne({
          subscriptionId: subscription._id,
          renewalDate: subscription.nextRenewalDate,
          reminderDate,
        });

        if (existingReminder) {
          if (existingReminder.status === REMINDER_STATUS.SENT || existingReminder.status === REMINDER_STATUS.PENDING) {
            logger.info(
              { subscriptionId: subscription._id, renewalDate: subscription.nextRenewalDate, existingStatus: existingReminder.status },
              'Reminder already sent or in progress, skipping'
            );
            return;
          } else if (existingReminder.status === REMINDER_STATUS.FAILED) {
            // Allow retry by deleting the failed log and re-claiming
            await ReminderLog.deleteOne({ _id: existingReminder._id });
            reminderLog = await ReminderLog.create({
              subscriptionId: subscription._id,
              userId: user._id,
              reminderDate,
              renewalDate: subscription.nextRenewalDate,
              status: REMINDER_STATUS.PENDING,
            });
          }
        } else {
          logger.warn(
            { subscriptionId: subscription._id, renewalDate: subscription.nextRenewalDate },
            'Unexpected unique constraint violation, skipping'
          );
          return;
        }
      } else {
        throw error;
      }
    }

    if (!reminderLog) {
      logger.warn(
        { subscriptionId: subscription._id, renewalDate: subscription.nextRenewalDate },
        'Failed to claim reminder log, skipping'
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

    // Update the claimed log with the result
    await ReminderLog.updateOne(
      { _id: reminderLog._id },
      {
        status: result.success ? REMINDER_STATUS.SENT : REMINDER_STATUS.FAILED,
        errorMessage: result.error,
      }
    );

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
