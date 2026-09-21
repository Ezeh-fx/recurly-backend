export const APP_NAME = "recurly-backend";
export const API_PREFIX = "/api/v1";

export const DEFAULT_PORT = 5000;
export const REQUEST_BODY_LIMIT = "100kb";
export const REQUEST_TIMEOUT_MS = 30_000;

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const SUPPORTED_CURRENCIES = ["NGN", "USD"] as const;

export const DATABASE = {
  MAX_POOL_SIZE: 10,
  SERVER_SELECTION_TIMEOUT_MS: 10_000,
} as const;
