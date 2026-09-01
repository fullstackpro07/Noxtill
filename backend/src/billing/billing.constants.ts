export const BILLING_ERROR_CODES = {
  PLAN_NOT_FOUND: 'BILLING_PLAN_NOT_FOUND',
  GATEWAY_NOT_CONFIGURED: 'BILLING_GATEWAY_NOT_CONFIGURED',
  GATEWAY_NOT_AVAILABLE: 'BILLING_GATEWAY_NOT_AVAILABLE',
  ADD_ON_NOT_FOUND: 'BILLING_ADD_ON_NOT_FOUND',
  NO_ACTIVE_SUBSCRIPTION: 'BILLING_NO_ACTIVE_SUBSCRIPTION',
} as const;

/**
 * Billing & Plan, extended (UPD-BE-121). Real, persisted opt-in flags (`Business.addOns`) — as
 * disclosed on that column's own doc comment in schema.prisma, these are not (yet) live Stripe
 * subscription line items or metered quota unlocks; toggling one on/off here doesn't itself change
 * `msgQuota`/`aiMonthlyCostCapUsd`/anything else. It's the real, stored record of what a business
 * has opted into, ready for a future ticket to wire actual effects/billing onto.
 */
export const ADD_ON_CATALOG = [
  { key: 'extra_branch', label: 'Extra branch / location' },
  { key: 'priority_support', label: 'Priority support' },
  { key: 'extra_ai_usage', label: 'Extra AI usage' },
  { key: 'extra_messages', label: 'Extra WhatsApp messages' },
] as const;

export type AddOnKey = (typeof ADD_ON_CATALOG)[number]['key'];
export const ADD_ON_KEYS = ADD_ON_CATALOG.map((a) => a.key);

export const TRIAL_EXPIRY_QUEUE = 'trial-expiry';
export const QUOTA_RESET_QUEUE = 'quota-reset';

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
