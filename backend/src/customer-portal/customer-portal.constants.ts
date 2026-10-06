export const CUSTOMER_PORTAL_FEATURES = [
  'orders',
  'bookings',
  'billing',
  'returns',
  'support',
  'loyalty',
  'account',
] as const;

export type CustomerPortalFeature = (typeof CUSTOMER_PORTAL_FEATURES)[number];

export const CUSTOMER_PORTAL_HOME_CARDS = [
  'orders',
  'bookings',
  'billing',
  'returns',
  'loyalty',
  'support',
] as const;

export type CustomerPortalCard = (typeof CUSTOMER_PORTAL_HOME_CARDS)[number];

export const CUSTOMER_PORTAL_SESSION_DAYS = 30;
export const CUSTOMER_PORTAL_MAX_LOGIN_ATTEMPTS = 6;
export const CUSTOMER_PORTAL_LOCK_MINUTES = 15;
