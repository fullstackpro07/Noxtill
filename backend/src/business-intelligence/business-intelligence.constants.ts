/** BI references the existing Dashboard widget registry; it does not define new KPI formulas. */
export const BI_OVERVIEW_WIDGETS = [
  'revenue_today',
  'orders_today',
  'revenue_this_month',
  'low_stock_count',
  'new_customers_month',
] as const;
