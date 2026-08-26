import { Role } from '@prisma/client';

/**
 * Roles & Permissions matrix (UPD-BE-035) — the fixed capability vocabulary. Each key here is a
 * direct, faithful translation of a real gate that existed in this codebase before this ticket
 * (one key per feature area, not per literal `@Roles()` decorator — several decorator calls on
 * the same controller collapse into one capability where they gate the same conceptual action).
 * `roles.manage` and `payroll.export`/`staff.manage_schedule` are the only genuinely new gates,
 * introduced this same milestone (UPD-BE-034/031 respectively, and this ticket for `roles.manage`
 * itself) — every other key already existed as an owner-only or owner+manager `@Roles()` gate.
 */
export const CAPABILITIES = {
  BILLING_MANAGE: 'billing.manage',
  CREDIT_WRITE_OFF: 'credit.write_off',
  EXPORTS_GENERATE: 'exports.generate',
  MESSAGING_SEND_TEST: 'messaging.send_test',
  STAFF_MANAGE: 'staff.manage',
  PAYROLL_EXPORT: 'payroll.export',
  ROLES_MANAGE: 'roles.manage',
  CUSTOMERS_ERASE: 'customers.erase',
  INTEGRATIONS_MANAGE: 'integrations.manage',
  AUTOMATIONS_MANAGE: 'automations.manage',
  COUPONS_MANAGE: 'coupons.manage',
  VOUCHERS_MANAGE: 'vouchers.manage',
  REFERRALS_MANAGE: 'referrals.manage',
  /// UPD-BE-106/107/108 fix-it: P&L/products/time/cash-forecast/analytics/expenses had zero
  /// server-side gate despite being financial data — the nav already restricts them to
  /// owner/manager, this makes that real instead of cosmetic.
  PROFIT_VIEW: 'profit.view',
  EXPENSES_MANAGE: 'expenses.manage',
  RETURNS_APPROVE: 'returns.approve',
  PRICING_MANAGE: 'pricing.manage',
  VIDEO_TESTIMONIALS_MODERATE: 'video_testimonials.moderate',
  STAFF_MANAGE_SCHEDULE: 'staff.manage_schedule',
  STOCK_TRANSFERS_APPROVE: 'stock_transfers.approve',
  BRANCHES_MANAGE: 'branches.manage',
  STOCK_COUNTS_APPLY: 'stock_counts.apply',
  LABELS_MANAGE: 'labels.manage',
  OPTIONS_MANAGE: 'options.manage',
  LISTINGS_MANAGE: 'listings.manage',
  SOCIAL_MANAGE: 'social.manage',
  COMPETITIVE_MANAGE: 'competitive.manage',
  VOICE_MANAGE: 'voice.manage',
  DELIVERY_MANAGE: 'delivery.manage',
  ADS_MANAGE: 'ads.manage',
  HEALTH_SCORE_MANAGE: 'health_score.manage',
  BOOKINGS_MANAGE: 'bookings.manage',
  CREDIT_MANAGE: 'credit.manage',
  /// Owner-only by design (never added to OWNER_AND_MANAGER_CAPABILITIES below) — same pattern as
  /// CREDIT_WRITE_OFF, matching the spec's "Recovery Reports: Owner-only" note.
  CREDIT_RECOVERY_REPORT_VIEW: 'credit.recovery_report_view',
} as const;

export type Capability = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

export const ALL_CAPABILITIES: Capability[] = Object.values(CAPABILITIES);

const OWNER_AND_MANAGER_CAPABILITIES: Capability[] = [
  CAPABILITIES.CUSTOMERS_ERASE,
  CAPABILITIES.INTEGRATIONS_MANAGE,
  CAPABILITIES.AUTOMATIONS_MANAGE,
  CAPABILITIES.COUPONS_MANAGE,
  CAPABILITIES.VOUCHERS_MANAGE,
  CAPABILITIES.REFERRALS_MANAGE,
  CAPABILITIES.PROFIT_VIEW,
  CAPABILITIES.EXPENSES_MANAGE,
  CAPABILITIES.RETURNS_APPROVE,
  CAPABILITIES.PRICING_MANAGE,
  CAPABILITIES.VIDEO_TESTIMONIALS_MODERATE,
  CAPABILITIES.STAFF_MANAGE_SCHEDULE,
  CAPABILITIES.STOCK_TRANSFERS_APPROVE,
  CAPABILITIES.STOCK_COUNTS_APPLY,
  CAPABILITIES.LABELS_MANAGE,
  CAPABILITIES.OPTIONS_MANAGE,
  CAPABILITIES.LISTINGS_MANAGE,
  CAPABILITIES.SOCIAL_MANAGE,
  CAPABILITIES.COMPETITIVE_MANAGE,
  CAPABILITIES.VOICE_MANAGE,
  CAPABILITIES.DELIVERY_MANAGE,
  CAPABILITIES.ADS_MANAGE,
  CAPABILITIES.BOOKINGS_MANAGE,
  CAPABILITIES.CREDIT_MANAGE,
];

/**
 * Owner is always the full superset — encoded explicitly here (never derived by enumeration),
 * per the real risk this ticket's own research flagged: a future route gated with a new
 * capability that forgets to add it to owner's set would silently lock the owner out, unlike
 * today's `RolesGuard` where every gate already spells out `Role.owner` explicitly. Manager's
 * set is exactly the historical "owner+manager" gates; staff's is empty, matching the fact that
 * `Role.staff` was never named in any `@Roles()` call before this ticket.
 */
export const SYSTEM_ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  [Role.owner]: ALL_CAPABILITIES,
  [Role.manager]: OWNER_AND_MANAGER_CAPABILITIES,
  [Role.staff]: [],
};
