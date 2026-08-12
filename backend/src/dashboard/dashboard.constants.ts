/** The widgets bundled into GET /dashboard/today so the first paint needs exactly one call. */
export const DASHBOARD_TODAY_WIDGET_KEYS = [
  'revenue_today',
  'orders_today',
  'low_stock_count',
  'upcoming_appointments',
  'credit_outstanding',
  'reviews_average',
] as const;

/** UPD-BE-001: default equal weighting, each component maxing out at 25 of the 0-100 total. */
export const DEFAULT_HEALTH_SCORE_WEIGHTS = {
  ratingTrend: 25,
  repeatCustomerRate: 25,
  margin: 25,
  creditRecovery: 25,
} as const;

export const HEALTH_SCORE_SNAPSHOT_QUEUE = 'health-score-snapshot';

/** How many weeks of trailing data feed each component's raw 0-100 performance calc. */
export const HEALTH_SCORE_WINDOW_WEEKS = 12;

export const AI_INSIGHTS_QUEUE = 'ai-insights';

/** UPD-BE-003: a week-over-week revenue swing under this magnitude isn't worth surfacing. */
export const SALES_NOTABLE_DELTA_PERCENT = 15;
/** A debtor is only worth flagging once their balance has aged past this many days. */
export const CREDIT_NOTABLE_OVERDUE_DAYS = 30;
/** Flag marketing as quiet if nothing has gone out in this many days. */
export const MARKETING_QUIET_DAYS = 30;
