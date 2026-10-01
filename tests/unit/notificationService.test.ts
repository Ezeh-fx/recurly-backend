import { sendPushNotification, sendBulkPushNotifications } from '../../src/services/notificationService';

// Mock fetch globally
global.fetch = jest.fn();

describe('Notification Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendPushNotification', () => {
    it('should send a push notification successfully', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          data: [{ status: 'ok' }],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await sendPushNotification(
        'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
        'Test Title',
        'Test Body'
      );

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://exp.host/--/api/v2/push/send',
        {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify([
            {
              to: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
              title: 'Test Title',
              body: 'Test Body',
              data: undefined,
              sound: 'default',
              priority: 'high',
              ttl: 86400,
            },
          ]),
        }
      );
    });

    it('should return error when no token is provided', async () => {
      const result = await sendPushNotification('', 'Test Title', 'Test Body');

      expect(result.success).toBe(false);
      expect(result.error).toBe('No push token provided');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle Expo API error response', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          data: [{ status: 'error', message: 'Invalid token' }],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await sendPushNotification(
        'ExponentPushToken[invalid]',
        'Test Title',
        'Test Body'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid token');
    });

    it('should handle network error', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await sendPushNotification(
        'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
        'Test Title',
        'Test Body'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to send push notification');
    });

    it('should handle HTTP error response', async () => {
      const mockResponse = {
        ok: false,
        text: async () => 'Server error',
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await sendPushNotification(
        'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
        'Test Title',
        'Test Body'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Push API request failed');
    });

    it('should include data in notification payload', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          data: [{ status: 'ok' }],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await sendPushNotification(
        'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
        'Test Title',
        'Test Body',
        { subscriptionId: '12345' }
      );

      expect(result.success).toBe(true);
      const requestBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(requestBody[0].data).toEqual({ subscriptionId: '12345' });
    });
  });

  describe('sendBulkPushNotifications', () => {
    it('should send multiple notifications', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          data: [{ status: 'ok' }],
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const messages = [
        {
          expoPushToken: 'ExponentPushToken[token1]',
          title: 'Title 1',
          body: 'Body 1',
        },
        {
          expoPushToken: 'ExponentPushToken[token2]',
          title: 'Title 2',
          body: 'Body 2',
        },
      ];

      const result = await sendBulkPushNotifications(messages);

      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should handle mixed success and failure', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [{ status: 'ok' }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [{ status: 'error', message: 'Failed' }] }),
        });

      const messages = [
        {
          expoPushToken: 'ExponentPushToken[token1]',
          title: 'Title 1',
          body: 'Body 1',
        },
        {
          expoPushToken: 'ExponentPushToken[token2]',
          title: 'Title 2',
          body: 'Body 2',
        },
      ];

      const result = await sendBulkPushNotifications(messages);

      expect(result.success).toBe(1);
      expect(result.failed).toBe(1);
    });

    it('should handle empty message array', async () => {
      const result = await sendBulkPushNotifications([]);

      expect(result.success).toBe(0);
      expect(result.failed).toBe(0);
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
