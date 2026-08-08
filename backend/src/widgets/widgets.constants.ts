export const WIDGET_ERROR_CODES = {
  WIDGET_NOT_FOUND: 'WIDGET_NOT_FOUND',
  INVALID_RANGE: 'INVALID_RANGE',
} as const;

/** Widget payloads are cheap aggregates but still worth a short cache (spec: 60s). */
export const WIDGET_CACHE_TTL_MS = 60_000;

/** The only trailing-day windows the dashboard's range selector offers — anything else is rejected, not silently clamped. */
export const WIDGET_RANGE_DAYS = [7, 30, 90] as const;
export type WidgetRangeDays = (typeof WIDGET_RANGE_DAYS)[number];

export type WidgetCategory =
  | 'sales'
  | 'inventory'
  | 'credit'
  | 'bookings'
  | 'reviews'
  | 'marketing'
  | 'staff'
  | 'messaging';
