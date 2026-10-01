import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { User, Subscription, ReminderLog } from '../../src/models';
import { OTP_CONFIG, REMINDER_CONFIG, SUBSCRIPTION_STATUS, AUTH_PROVIDERS } from '../../src/config/constants';

describe('Models', () => {
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

  afterEach(async () => {
    await User.deleteMany({});
    await Subscription.deleteMany({});
    await ReminderLog.deleteMany({});
  });

  describe('User Model', () => {
    it('should create a user with email and password', async () => {
      const user = await User.create({
        email: 'test@example.com',
        passwordHash: 'plaintextpassword123',
      });

      expect(user.email).toBe('test@example.com');
      expect(user.passwordHash).not.toBe('plaintextpassword123'); // Should be hashed
      expect(user.isEmailVerified).toBe(false);
      expect(user.otpAttempts).toBe(0);
    });

    it('should enforce unique email', async () => {
      await User.create({
        email: 'test@example.com',
        passwordHash: 'plaintextpassword123',
      });

      await expect(
        User.create({
          email: 'test@example.com',
          passwordHash: 'anotherpassword',
        })
      ).rejects.toThrow();
    });

    it('should store OTP fields', async () => {
      const user = await User.create({
        email: 'test@example.com',
        passwordHash: 'hashedpassword123',
        otpCodeHash: 'otphash123',
        otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      expect(user.otpCodeHash).toBe('otphash123');
      expect(user.otpExpiresAt).toBeDefined();
    });

    it('should store auth providers', async () => {
      const user = await User.create({
        email: 'test@example.com',
        passwordHash: null,
        authProviders: [AUTH_PROVIDERS.GOOGLE],
        providerIds: {
          google: { sub: 'google-sub-123' },
        },
      });

      expect(user.authProviders).toContain(AUTH_PROVIDERS.GOOGLE);
      expect(user.providerIds.google?.sub).toBe('google-sub-123');
    });

    it('should not return passwordHash by default', async () => {
      await User.create({
        email: 'test@example.com',
        passwordHash: 'plaintextpassword123',
      });

      const user = await User.findOne({ email: 'test@example.com' });
      expect(user?.passwordHash).toBeUndefined();
    });

    it('should return passwordHash when explicitly selected', async () => {
      await User.create({
        email: 'test@example.com',
        passwordHash: 'plaintextpassword123',
      });

      const user = await User.findOne({ email: 'test@example.com' }).select('+passwordHash');
      expect(user?.passwordHash).toBeDefined();
      expect(user?.passwordHash).not.toBe('plaintextpassword123'); // Should be hashed
      expect(user?.passwordHash?.length).toBeGreaterThan(50); // Bcrypt hashes are long
    });

    it('should support email provider', async () => {
      const user = await User.create({
        email: 'test@example.com',
        passwordHash: 'plaintextpassword123',
        authProviders: [AUTH_PROVIDERS.EMAIL],
      });

      expect(user.authProviders).toContain(AUTH_PROVIDERS.EMAIL);
    });

    it('should support apple provider', async () => {
      const user = await User.create({
        email: 'test@example.com',
        passwordHash: null,
        authProviders: [AUTH_PROVIDERS.APPLE],
        providerIds: {
          apple: { sub: 'apple-sub-123' },
        },
      });

      expect(user.authProviders).toContain(AUTH_PROVIDERS.APPLE);
      expect(user.providerIds.apple?.sub).toBe('apple-sub-123');
    });

    it('should store timezone', async () => {
      const user = await User.create({
        email: 'test@example.com',
        passwordHash: 'plaintextpassword123',
        timezone: 'America/New_York',
      });

      expect(user.timezone).toBe('America/New_York');
    });

    it('should allow user without timezone', async () => {
      const user = await User.create({
        email: 'test@example.com',
        passwordHash: 'plaintextpassword123',
      });

      expect(user.timezone).toBeUndefined();
    });

    it('should store expoPushToken', async () => {
      const user = await User.create({
        email: 'test@example.com',
        passwordHash: 'plaintextpassword123',
        expoPushToken: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
      });

      expect(user.expoPushToken).toBe('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]');
    });

    it('should allow user without expoPushToken', async () => {
      const user = await User.create({
        email: 'test@example.com',
        passwordHash: 'plaintextpassword123',
      });

      expect(user.expoPushToken).toBeUndefined();
    });
  });

  describe('Subscription Model', () => {
    let userId: mongoose.Types.ObjectId;

    beforeEach(async () => {
      const user = await User.create({
        email: 'test@example.com',
        passwordHash: 'plaintextpassword123',
        authProviders: [AUTH_PROVIDERS.EMAIL],
      });
      userId = user._id;
    }, 30000);

    it('should create a subscription', async () => {
      const subscription = await Subscription.create({
        userId,
        name: 'Netflix',
        cost: 1599,
        currency: 'USD',
        billingCycle: 'monthly',
        nextRenewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      expect(subscription.name).toBe('Netflix');
      expect(subscription.cost).toBe(1599);
      expect(subscription.status).toBe('active');
      expect(subscription.remindDaysBefore).toBe(REMINDER_CONFIG.DEFAULT_REMIND_DAYS_BEFORE);
    });

    it('should require userId', async () => {
      await expect(
        Subscription.create({
          name: 'Netflix',
          cost: 1599,
          currency: 'USD',
          billingCycle: 'monthly',
          nextRenewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        })
      ).rejects.toThrow();
    });

    it('should validate billingCycle enum', async () => {
      await expect(
        Subscription.create({
          userId,
          name: 'Netflix',
          cost: 1599,
          currency: 'USD',
          billingCycle: 'invalid' as any,
          nextRenewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        })
      ).rejects.toThrow();
    });

    it('should validate status enum', async () => {
      await expect(
        Subscription.create({
          userId,
          name: 'Netflix',
          cost: 1599,
          currency: 'USD',
          billingCycle: 'monthly',
          nextRenewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          status: 'invalid' as any,
        })
      ).rejects.toThrow();
    });

    it('should support paused status', async () => {
      const subscription = await Subscription.create({
        userId,
        name: 'Netflix',
        cost: 1599,
        currency: 'USD',
        billingCycle: 'monthly',
        nextRenewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: SUBSCRIPTION_STATUS.PAUSED,
      });

      expect(subscription.status).toBe(SUBSCRIPTION_STATUS.PAUSED);
    });

    it('should allow optional category and notes', async () => {
      const subscription = await Subscription.create({
        userId,
        name: 'Netflix',
        cost: 1599,
        currency: 'USD',
        billingCycle: 'monthly',
        nextRenewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        category: 'Entertainment',
        notes: 'Premium plan',
      });

      expect(subscription.category).toBe('Entertainment');
      expect(subscription.notes).toBe('Premium plan');
    });

    it('should reject fractional cost values', async () => {
      await expect(
        Subscription.create({
          userId,
          name: 'Netflix',
          cost: 15.99,
          currency: 'USD',
          billingCycle: 'monthly',
          nextRenewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        })
      ).rejects.toThrow();
    });

    it('should reject invalid ISO currency codes', async () => {
      await expect(
        Subscription.create({
          userId,
          name: 'Netflix',
          cost: 1599,
          currency: 'XXX',
          billingCycle: 'monthly',
          nextRenewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        })
      ).rejects.toThrow();
    });

    it('should accept valid ISO currency codes', async () => {
      const subscription = await Subscription.create({
        userId,
        name: 'Netflix',
        cost: 1599,
        currency: 'EUR',
        billingCycle: 'monthly',
        nextRenewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      expect(subscription.currency).toBe('EUR');
    });
  });

  describe('ReminderLog Model', () => {
    let userId: mongoose.Types.ObjectId;
    let subscriptionId: mongoose.Types.ObjectId;

    beforeEach(async () => {
      const user = await User.create({
        email: 'test@example.com',
        passwordHash: 'plaintextpassword123',
        authProviders: [AUTH_PROVIDERS.EMAIL],
      });
      userId = user._id;

      const subscription = await Subscription.create({
        userId,
        name: 'Netflix',
        cost: 1599,
        currency: 'USD',
        billingCycle: 'monthly',
        nextRenewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      subscriptionId = subscription._id;
    }, 30000);

    it('should create a reminder log', async () => {
      const reminderDate = new Date();
      const renewalDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const reminderLog = await ReminderLog.create({
        subscriptionId,
        userId,
        reminderDate,
        renewalDate,
        status: 'sent',
      });

      expect(reminderLog.subscriptionId).toEqual(subscriptionId);
      expect(reminderLog.userId).toEqual(userId);
      expect(reminderLog.status).toBe('sent');
    });

    it('should enforce unique subscriptionId + renewalDate', async () => {
      const reminderDate = new Date();
      const renewalDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await ReminderLog.create({
        subscriptionId,
        userId,
        reminderDate,
        renewalDate,
        status: 'sent',
      });

      await expect(
        ReminderLog.create({
          subscriptionId,
          userId,
          reminderDate: new Date(reminderDate.getTime() + 1000), // Different reminderDate
          renewalDate, // Same renewalDate
          status: 'sent',
        })
      ).rejects.toThrow();
    });

    it('should allow same subscription on different renewal dates', async () => {
      const reminderDate = new Date();

      await ReminderLog.create({
        subscriptionId,
        userId,
        reminderDate,
        renewalDate: new Date('2024-01-01'),
        status: 'sent',
      });

      await ReminderLog.create({
        subscriptionId,
        userId,
        reminderDate,
        renewalDate: new Date('2024-02-01'),
        status: 'sent',
      });

      const count = await ReminderLog.countDocuments({ subscriptionId });
      expect(count).toBe(2);
    });

    it('should store error message for failed reminders', async () => {
      const reminderDate = new Date();
      const renewalDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const reminderLog = await ReminderLog.create({
        subscriptionId,
        userId,
        reminderDate,
        renewalDate,
        status: 'failed',
        errorMessage: 'Push notification failed',
      });

      expect(reminderLog.status).toBe('failed');
      expect(reminderLog.errorMessage).toBe('Push notification failed');
    });
  });
});
