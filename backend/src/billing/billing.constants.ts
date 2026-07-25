export const BILLING_ERROR_CODES = {
  PLAN_NOT_FOUND: 'BILLING_PLAN_NOT_FOUND',
  GATEWAY_NOT_CONFIGURED: 'BILLING_GATEWAY_NOT_CONFIGURED',
  GATEWAY_NOT_AVAILABLE: 'BILLING_GATEWAY_NOT_AVAILABLE',
} as const;

export const TRIAL_EXPIRY_QUEUE = 'trial-expiry';

/** Every new signup gets 14 trial days with no card required (auth.service.ts). Falls back to this plan on expiry. */
export const BASIC_PLAN_KEY = 'basic';

/** Seeded once at boot if missing — key/name/price/msgQuota/userLimit for the 4 canonical plans (spec §10). */
export const DEFAULT_PLANS = [
  { key: 'basic', name: 'Basic', price: 0, msgQuota: 200, userLimit: 2 },
  { key: 'starter', name: 'Starter', price: 19, msgQuota: 1000, userLimit: 5 },
  { key: 'pro', name: 'Pro', price: 49, msgQuota: 5000, userLimit: 15 },
  {
    key: 'premium',
    name: 'Premium',
    price: 99,
    msgQuota: 20000,
    userLimit: 50,
  },
] as const;
