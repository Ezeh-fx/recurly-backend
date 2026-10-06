// Auth Providers
export const AUTH_PROVIDERS = {
  EMAIL: 'email',
  GOOGLE: 'google',
  APPLE: 'apple',
} as const;

export type AuthProvider = (typeof AUTH_PROVIDERS)[keyof typeof AUTH_PROVIDERS];

// Billing Cycles
export const BILLING_CYCLES = {
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
  WEEKLY: 'weekly',
  QUARTERLY: 'quarterly',
} as const;

export type BillingCycle = (typeof BILLING_CYCLES)[keyof typeof BILLING_CYCLES];

// Subscription Categories
export const SUBSCRIPTION_CATEGORIES = {
  ENTERTAINMENT: 'entertainment',
  PRODUCTIVITY: 'productivity',
  UTILITIES: 'utilities',
  HEALTH_FITNESS: 'health_fitness',
  EDUCATION: 'education',
  FINANCE: 'finance',
  NEWS: 'news',
  GAMING: 'gaming',
  MUSIC: 'music',
  VIDEO_STREAMING: 'video_streaming',
  SOFTWARE: 'software',
  OTHER: 'other',
} as const;

export type SubscriptionCategory =
  (typeof SUBSCRIPTION_CATEGORIES)[keyof typeof SUBSCRIPTION_CATEGORIES];

// Subscription Statuses
export const SUBSCRIPTION_STATUS = {
  ACTIVE: 'active',
  CANCELLED: 'cancelled',
  TRIAL: 'trial',
  EXPIRED: 'expired',
  PAUSED: 'paused',
} as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUS)[keyof typeof SUBSCRIPTION_STATUS];

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

// Error Codes
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  OTP_INVALID: 'OTP_INVALID',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_TOO_MANY_ATTEMPTS: 'OTP_TOO_MANY_ATTEMPTS',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  EMAIL_ALREADY_VERIFIED: 'EMAIL_ALREADY_VERIFIED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

// OTP Configuration
export const OTP_CONFIG = {
  LENGTH: 6,
  EXPIRY_MINUTES: 10,
  MAX_ATTEMPTS: 5,
  RESEND_COOLDOWN_SECONDS: 60, // 1 minute cooldown between resends
  MAX_RESENDS_PER_HOUR: 3, // Maximum 3 resends per hour
} as const;

// JWT Configuration
export const JWT_CONFIG = {
  ACCESS_TOKEN_EXPIRES_IN: '15m',
  REFRESH_TOKEN_EXPIRES_IN: '7d',
} as const;

// Rate Limiting Configuration
export const RATE_LIMIT = {
  // Auth endpoints (stricter)
  AUTH_MAX_REQUESTS: 5,
  AUTH_WINDOW_MS: 15 * 60 * 1000, // 15 minutes

  // Global (looser)
  GLOBAL_MAX_REQUESTS: 100,
  GLOBAL_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
} as const;

// Reminder Job Configuration
export const REMINDER_CONFIG = {
  // Default days before renewal to remind
  DEFAULT_REMIND_DAYS_BEFORE: 3,
  // Cron schedule for daily job (runs at 9 AM UTC)
  CRON_SCHEDULE: '0 9 * * *',
} as const;

// Reminder Status
export const REMINDER_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  FAILED: 'failed',
} as const;

export type ReminderStatus = (typeof REMINDER_STATUS)[keyof typeof REMINDER_STATUS];

// Bcrypt Configuration
export const BCRYPT_CONFIG = {
  COST: 12,
} as const;

// ISO 4217 Currency Codes
export const ISO_CURRENCY_CODES = [
  'AED', 'AFN', 'ALL', 'AMD', 'ANG', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN',
  'BAM', 'BBD', 'BDT', 'BGN', 'BHD', 'BIF', 'BMD', 'BND', 'BOB', 'BRL',
  'BSD', 'BTN', 'BWP', 'BYN', 'BZD', 'CAD', 'CDF', 'CHF', 'CLP', 'CNY',
  'COP', 'CRC', 'CUC', 'CUP', 'CVE', 'CZK', 'DJF', 'DKK', 'DOP', 'DZD',
  'EGP', 'ERN', 'ETB', 'EUR', 'FJD', 'FKP', 'GBP', 'GEL', 'GGP', 'GHS',
  'GIP', 'GMD', 'GNF', 'GTQ', 'GYD', 'HKD', 'HNL', 'HRK', 'HTG', 'HUF',
  'IDR', 'ILS', 'IMP', 'INR', 'IQD', 'IRR', 'ISK', 'JEP', 'JMD', 'JOD',
  'JPY', 'KES', 'KGS', 'KHR', 'KMF', 'KPW', 'KRW', 'KWD', 'KYD', 'KZT',
  'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'LYD', 'MAD', 'MDL', 'MGA', 'MKD',
  'MMK', 'MNT', 'MOP', 'MRU', 'MUR', 'MVR', 'MWK', 'MXN', 'MYR', 'MZN',
  'NAD', 'NGN', 'NIO', 'NOK', 'NPR', 'NZD', 'OMR', 'PAB', 'PEN', 'PGK',
  'PHP', 'PKR', 'PLN', 'PYG', 'QAR', 'RON', 'RSD', 'RUB', 'RWF', 'SAR',
  'SBD', 'SCR', 'SDG', 'SEK', 'SGD', 'SHP', 'SLL', 'SOS', 'SPL', 'SRD',
  'STN', 'SVC', 'SYP', 'SZL', 'THB', 'TJS', 'TMT', 'TND', 'TOP', 'TRY',
  'TTD', 'TVD', 'TWD', 'TZS', 'UAH', 'UGX', 'USD', 'UYU', 'UZS', 'VEF',
  'VND', 'VUV', 'WST', 'XAF', 'XCD', 'XDR', 'XOF', 'XPF', 'YER', 'ZAR',
  'ZMW', 'ZWL',
] as const;

export type CurrencyCode = typeof ISO_CURRENCY_CODES[number];

// Response Envelope Structure
export const RESPONSE_ENVELOPE = {
  SUCCESS: 'success',
  ERROR: 'error',
} as const;
