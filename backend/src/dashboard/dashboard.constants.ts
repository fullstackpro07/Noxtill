/** The widgets bundled into GET /dashboard/today so the first paint needs exactly one call. */
export const DASHBOARD_TODAY_WIDGET_KEYS = [
  'revenue_today',
  'orders_today',
  'low_stock_count',
  'upcoming_appointments',
  'credit_outstanding',
  'reviews_average',
] as const;
