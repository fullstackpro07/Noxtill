export const API_KEY_PREFIX = 'ntk_';
/** Raw random bytes in the generated secret — 24 bytes -> 48 hex chars, plenty of entropy. */
export const API_KEY_SECRET_BYTES = 24;
/** How much of the raw key is kept (hashed key aside) for the key-list UI to identify a row. */
export const API_KEY_VISIBLE_PREFIX_LENGTH = 12;

/** Requests one key may make per clock hour. Above it the API answers 429 with `Retry-After`. */
export const API_KEY_HOURLY_LIMIT = 10_000;

/**
 * Capabilities no API key can be granted: they erase data, change billing/roles or write off
 * money, and a leaked key must never be able to do that. (Owner-only settings stay in the app.)
 */
export const API_KEY_FORBIDDEN_SCOPES = [
  'customers.erase',
  'gdpr.manage',
  'roles.manage',
  'billing.manage',
  'credit.write_off',
  'staff.manage',
  'payroll.export',
  'ai_settings.manage',
] as const;

/** `AuthenticatedUser.sub` of a request made with an API key is `${API_KEY_SUBJECT_PREFIX}<key id>`. */
export const API_KEY_SUBJECT_PREFIX = 'api-key:';
