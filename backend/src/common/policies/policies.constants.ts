/**
 * Business policies — the owner-tunable rules Noxtill actually enforces. Every key here has a
 * consumer (named beside it); a policy nothing reads does not belong in this list. A missing key
 * means the default, so existing businesses behave exactly as they did before a key was added.
 */
export type PolicyKind = 'boolean' | 'number' | 'nullableNumber' | 'time';
export type PolicyValue = boolean | number | string | null;

export interface PolicyDef {
  kind: PolicyKind;
  default: PolicyValue;
  min?: number;
  max?: number;
  /** Whole numbers only. */
  integer?: boolean;
}

export const POLICY_DEFS = {
  // orders.service.ts (createSale)
  'sales.maxDiscountPercent': {
    kind: 'nullableNumber',
    default: null,
    min: 0,
    max: 100,
  },
  'sales.restrictPriceOverride': { kind: 'boolean', default: false },
  // commerce/commerce-pause.util.ts (channel sync, AI listing generation, subscription renewals)
  'commerce.actionsPaused': { kind: 'boolean', default: false },
  // commerce/commerce-agent-tools.service.ts (which tool risk classes agents may use)
  'commerce.autonomyLevel': {
    kind: 'number',
    default: 1,
    min: 0,
    max: 5,
    integer: true,
  },
  'sales.requireCustomer': { kind: 'boolean', default: false },
  'sales.allowNegativeStock': { kind: 'boolean', default: false },
  // orders/tables/quotations/public-ordering (computeOrderTotals) and report reconciliation
  'sales.pricesIncludeTax': { kind: 'boolean', default: false },
  // returns.service.ts
  'returns.refundLimit': {
    kind: 'nullableNumber',
    default: null,
    min: 0,
    max: 100_000_000,
  },
  'returns.refundToOriginalMethod': { kind: 'boolean', default: false },
  // products.service.ts / inventory.service.ts
  'catalog.hideCostFromStaff': { kind: 'boolean', default: false },
  'catalog.defaultLowStockThreshold': {
    kind: 'number',
    default: 5,
    min: 0,
    max: 100_000,
    integer: true,
  },
  // orders.service.ts (credit sales)
  'credit.defaultLimit': {
    kind: 'nullableNumber',
    default: null,
    min: 0,
    max: 100_000_000,
  },
  // appointments.service.ts / public-booking.service.ts
  'bookings.minAdvanceHours': {
    kind: 'nullableNumber',
    default: null,
    min: 0,
    max: 8760,
    integer: true,
  },
  'bookings.maxAdvanceDays': {
    kind: 'nullableNumber',
    default: null,
    min: 1,
    max: 730,
    integer: true,
  },
  'bookings.cancellationWindowHours': {
    kind: 'nullableNumber',
    default: null,
    min: 0,
    max: 720,
    integer: true,
  },
  'bookings.rescheduleWindowHours': {
    kind: 'nullableNumber',
    default: null,
    min: 0,
    max: 720,
    integer: true,
  },
  'bookings.maxDailyBookings': {
    kind: 'nullableNumber',
    default: null,
    min: 1,
    max: 10_000,
    integer: true,
  },
  // campaigns.service.ts
  'marketing.frequencyCapMax': {
    kind: 'nullableNumber',
    default: null,
    min: 1,
    max: 100,
    integer: true,
  },
  'marketing.frequencyCapDays': {
    kind: 'number',
    default: 30,
    min: 1,
    max: 365,
    integer: true,
  },
  'marketing.quietFrom': { kind: 'time', default: null },
  'marketing.quietTo': { kind: 'time', default: null },
  // assistant.service.ts
  'ai.redactContacts': { kind: 'boolean', default: false },
  // digitizer/digitizer-rules.ts (which fields and rows are flagged for review)
  'digitizer.reviewThreshold': {
    kind: 'number',
    default: 0.7,
    min: 0.3,
    max: 0.95,
  },
  // digitizer/digitizer-lookup.service.ts (what counts as an existing match)
  'digitizer.matchOnPhone': { kind: 'boolean', default: true },
  'digitizer.matchOnEmail': { kind: 'boolean', default: true },
  'digitizer.flagNameOnlyMatch': { kind: 'boolean', default: true },
  // digitizer/digitizer-pipeline.service.ts (a photo the model calls unreadable)
  'digitizer.rejectUnreadable': { kind: 'boolean', default: true },
  // marketing/seo-on-page.service.ts (suggest), seo-content.service.ts (generateBrief/generateDraft)
  'seo.aiDraftsEnabled': { kind: 'boolean', default: true },
  // marketing/seo-content.service.ts (opportunities: "improve page" below this rank)
  'seo.improveBelowRank': {
    kind: 'number',
    default: 10,
    min: 1,
    max: 100,
    integer: true,
  },
  // marketing/seo-content.service.ts (refresh queue), seo-workspace/seo-calendar.service.ts
  'seo.refreshDropPositions': {
    kind: 'number',
    default: 5,
    min: 1,
    max: 50,
    integer: true,
  },
  // marketing/automations/automation-governance.util.ts (workflow editor, version restore, Settings toggle)
  'automations.maxActiveWorkflows': {
    kind: 'nullableNumber',
    default: null,
    min: 1,
    max: 1000,
    integer: true,
  },
  'automations.requireApprovalBeforeCustomerMessages': {
    kind: 'boolean',
    default: false,
  },
  // backups (exports/backup.service.ts)
  'backup.enabled': { kind: 'boolean', default: false },
  'backup.retentionDays': {
    kind: 'number',
    default: 30,
    min: 1,
    max: 365,
    integer: true,
  },
} as const satisfies Record<string, PolicyDef>;

export type PolicyKey = keyof typeof POLICY_DEFS;

export function isPolicyKey(key: string): key is PolicyKey {
  return key in POLICY_DEFS;
}
