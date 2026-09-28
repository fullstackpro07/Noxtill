export const BRAIN_ERRORS = {
  NOT_FOUND: 'BRAIN_NOT_FOUND',
  GONE: 'BRAIN_FINDING_GONE',
  NO_ACTION: 'BRAIN_NO_ACTION',
  WRONG_STATE: 'BRAIN_WRONG_STATE',
  NOT_ALLOWED: 'BRAIN_NOT_ALLOWED',
  RUN_FAILED: 'BRAIN_RUN_FAILED',
  BAD_WATCH: 'BRAIN_BAD_WATCH',
  BAD_RULE: 'BRAIN_BAD_RULE',
} as const;

export const BRAIN_TICK_QUEUE = 'business-brain';

/** Watch metrics a person can pick, and what each one measures. */
export const WATCH_METRICS = {
  product_stock: {
    label: 'Stock of a product',
    unit: 'units',
    needsSubject: 'product',
  },
  overdue_credit: {
    label: 'Overdue credit',
    unit: 'money',
    needsSubject: null,
  },
  customer_quiet_days: {
    label: 'Days since a customer last bought',
    unit: 'days',
    needsSubject: 'customer',
  },
  revenue_week: {
    label: 'Revenue over the last 7 days',
    unit: 'money',
    needsSubject: null,
  },
  branch_margin_gap: {
    label: 'How far a branch is behind the best branch on margin',
    unit: 'points',
    needsSubject: 'branch',
  },
} as const;

export type WatchMetric = keyof typeof WATCH_METRICS;

/** The Brain's thresholds (all real `Business.policies` keys) shown and edited on Memory & Rules. */
export const BRAIN_RULE_KEYS = [
  {
    key: 'brain.overdueDays',
    label: 'Credit counts as overdue after',
    unit: 'days',
    d: 'How long a balance can stand before it is raised as overdue.',
  },
  {
    key: 'brain.stockCoverDays',
    label: 'Warn when stock covers fewer than',
    unit: 'days',
    d: 'Days of stock left at the 14-day sales rate.',
  },
  {
    key: 'brain.repeatDropPercent',
    label: 'Raise a drop in returning-buyer spend of',
    unit: '%',
    d: 'Compared with the previous period.',
  },
  {
    key: 'brain.marginGapPoints',
    label: 'Raise a branch margin gap of',
    unit: 'points',
    d: 'Between your best and worst branch over 30 days.',
  },
  {
    key: 'brain.notableChangePercent',
    label: 'Report a figure as changed when it moves',
    unit: '%',
    d: 'Anything smaller is treated as normal variation.',
  },
  {
    key: 'brain.lapsedDays',
    label: 'A regular customer has gone quiet after',
    unit: 'days',
    d: 'For customers with two or more past orders.',
  },
] as const;
