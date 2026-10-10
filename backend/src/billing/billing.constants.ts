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

/**
 * The plans sold on the pricing page (frontend `/pricing`, docs/Noxtill pricing page built) plus the
 * free `basic` fallback an expired trial drops to. Seeded at boot (upsert by `key`). `price` is the
 * month-to-month USD price shown on the pricing page; `userLimit` is that plan's included users.
 * `msgQuota` is the internal WhatsApp send allowance (the pricing page publishes no figure for it —
 * Meta bills messages to the business directly), carried over from the tier each plan replaced.
 */
export const DEFAULT_PLANS = [
  { key: 'basic', name: 'Basic', price: 0, msgQuota: 200, userLimit: 2 },
  { key: 'starter', name: 'Starter', price: 39, msgQuota: 1000, userLimit: 2 },
  { key: 'growth', name: 'Growth', price: 79, msgQuota: 5000, userLimit: 5 },
  {
    key: 'professional',
    name: 'Professional',
    price: 159,
    msgQuota: 20000,
    userLimit: 15,
  },
  {
    key: 'business',
    name: 'Business',
    price: 319,
    msgQuota: 20000,
    userLimit: 40,
  },
] as const;

/**
 * Plan keys from the previous lineup (Starter $19 / Pro $49 / Premium $99) → the plan that replaced
 * each. The seed renames the existing row so businesses already on it stay attached.
 */
export const LEGACY_PLAN_KEYS: Record<string, string> = {
  pro: 'growth',
  premium: 'professional',
};
