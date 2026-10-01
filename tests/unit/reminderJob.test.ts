import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { User, Subscription, ReminderLog } from '../../src/models';
import { SUBSCRIPTION_STATUS, REMINDER_STATUS } from '../../src/config/constants';
import { sendPushNotification } from '../../src/services/notificationService';
import { processReminders, processSubscriptionReminder } from '../../src/jobs/reminderJob';

// Mock the notification service
jest.mock('../../src/services/notificationService');

describe('Reminder Job', () => {
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
  }, 120000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Subscription.deleteMany({});
    await ReminderLog.deleteMany({});
    jest.clearAllMocks();
  });

  describe('processSubscriptionReminder', () => {
    it('should send reminders for subscriptions due today', async () => {
      const user = await User.create({
        email: 'test@example.com',
        passwordHash: 'hashedpassword',
        expoPushToken: 'ExponentPushToken[testtoken]',
      });

      const today = new Date();
      const subscription = await Subscription.create({
        userId: user._id,
        name: 'Netflix',
        cost: 1599, // $15.99
        currency: 'USD',
        billingCycle: 'monthly',
        nextRenewalDate: today,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        remindDaysBefore: 3,
      });

      (sendPushNotification as jest.Mock).mockResolvedValue({ success: true });

      await processSubscriptionReminder(subscription, today);

      expect(sendPushNotification).toHaveBeenCalledWith(
        'ExponentPushToken[testtoken]',
        'Subscription Renewal Reminder',
        expect.stringContaining('Netflix'),
        expect.objectContaining({
          subscriptionId: subscription._id.toString(),
        })
      );

      const reminderLog = await ReminderLog.findOne({
        subscriptionId: subscription._id,
      });
      expect(reminderLog).toBeTruthy();
      expect(reminderLog?.status).toBe(REMINDER_STATUS.SENT);
    });

    it('should skip users without Expo push tokens', async () => {
      const user = await User.create({
        email: 'test@example.com',
        passwordHash: 'hashedpassword',
      });

      const today = new Date();
      const subscription = await Subscription.create({
        userId: user._id,
        name: 'Netflix',
        cost: 1599,
        currency: 'USD',
        billingCycle: 'monthly',
        nextRenewalDate: today,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        remindDaysBefore: 3,
      });

      await processSubscriptionReminder(subscription, today);

      expect(sendPushNotification).not.toHaveBeenCalled();

      const reminderLog = await ReminderLog.findOne({
        subscriptionId: subscription._id,
      });
      expect(reminderLog).toBeFalsy();
    });

    it('should skip subscriptions already reminded', async () => {
      const user = await User.create({
        email: 'test@example.com',
        passwordHash: 'hashedpassword',
        expoPushToken: 'ExponentPushToken[testtoken]',
      });

      const today = new Date();
      const subscription = await Subscription.create({
        userId: user._id,
        name: 'Netflix',
        cost: 1599,
        currency: 'USD',
        billingCycle: 'monthly',
        nextRenewalDate: today,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        remindDaysBefore: 3,
      });

      await ReminderLog.create({
        subscriptionId: subscription._id,
        userId: user._id,
        reminderDate: today,
        renewalDate: today,
        status: REMINDER_STATUS.SENT,
      });

      await processSubscriptionReminder(subscription, today);

      expect(sendPushNotification).not.toHaveBeenCalled();
    });

    it('should log failed notifications', async () => {
      const user = await User.create({
        email: 'test@example.com',
        passwordHash: 'hashedpassword',
        expoPushToken: 'ExponentPushToken[testtoken]',
      });

      const today = new Date();
      const subscription = await Subscription.create({
        userId: user._id,
        name: 'Netflix',
        cost: 1599,
        currency: 'USD',
        billingCycle: 'monthly',
        nextRenewalDate: today,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        remindDaysBefore: 3,
      });

      (sendPushNotification as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Invalid token',
      });

      await processSubscriptionReminder(subscription, today);

      const reminderLog = await ReminderLog.findOne({
        subscriptionId: subscription._id,
      });
      expect(reminderLog).toBeTruthy();
      expect(reminderLog?.status).toBe(REMINDER_STATUS.FAILED);
      expect(reminderLog?.errorMessage).toBe('Invalid token');
    });
  });
});
