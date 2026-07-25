export const WIDGET_ERROR_CODES = {
  WIDGET_NOT_FOUND: 'WIDGET_NOT_FOUND',
} as const;

/** Widget payloads are cheap aggregates but still worth a short cache (spec: 60s). */
export const WIDGET_CACHE_TTL_MS = 60_000;

export type WidgetCategory =
  | 'sales'
  | 'inventory'
  | 'credit'
  | 'bookings'
  | 'reviews'
  | 'marketing'
  | 'staff'
  | 'messaging';
