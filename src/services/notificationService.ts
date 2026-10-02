import logger from '../config/logger';

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | 'defaultCritical' | boolean | null;
  priority?: 'default' | 'normal' | 'high';
  ttl?: number;
}

interface ExpoPushResponse {
  data: Array<{
    status: 'ok' | 'error';
    message?: string;
    details?: Record<string, unknown>;
  }>;
}

const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';

export async function sendPushNotification(
  expoPushToken: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  if (!expoPushToken) {
    logger.warn('No Expo push token provided');
    return { success: false, error: 'No push token provided' };
  }

  const message: ExpoPushMessage = {
    to: expoPushToken,
    title,
    body,
    data,
    sound: 'default',
    priority: 'high',
    ttl: 86400, // 24 hours in seconds
  };

  try {
    const response = await fetch(EXPO_PUSH_API_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([message]),
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ error: errorText }, 'Expo push API request failed');
      return { success: false, error: 'Push API request failed' };
    }

    const result = await response.json() as ExpoPushResponse;

    if (result.data && result.data.length > 0) {
      const pushResult = result.data[0];
      if (pushResult.status === 'ok') {
        logger.info('Push notification sent successfully');
        return { success: true };
      } else {
        logger.error(
          { error: pushResult.message, details: pushResult.details },
          'Push notification failed'
        );
        return { success: false, error: pushResult.message || 'Push notification failed' };
      }
    }

    return { success: false, error: 'Invalid response from Expo API' };
  } catch (error) {
    logger.error({ err: error }, 'Error sending push notification');
    return { success: false, error: 'Failed to send push notification' };
  }
}

export async function sendBulkPushNotifications(
  messages: Array<{ expoPushToken: string; title: string; body: string; data?: Record<string, unknown> }>
): Promise<{ success: number; failed: number }> {
  const results = await Promise.allSettled(
    messages.map(msg => sendPushNotification(msg.expoPushToken, msg.title, msg.body, msg.data))
  );

  const success = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  const failed = results.length - success;

  logger.info({ success, failed, total: results.length }, 'Bulk push notification results');

  return { success, failed };
}
