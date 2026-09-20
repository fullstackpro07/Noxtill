/** Maps a real tool name (see `assistant-tools.ts`) to the same module grouping AI Settings'
 * "What the assistant can read" list already uses — Chat History's "Topic" column is this, not a
 * fabricated per-row classification. A conversation whose first assistant turn called no tool
 * (answered from general knowledge) has no real topic to report. */
export const TOOL_TOPIC: Record<string, string> = {
  get_revenue_today: 'Sales',
  get_orders_today: 'Sales',
  get_revenue_this_month: 'Sales',
  get_order_by_number: 'Sales',
  get_top_products_month: 'Sales',
  get_expenses_this_month: 'Profit',
  get_low_stock_count: 'Inventory',
  get_low_stock_products: 'Inventory',
  get_credit_outstanding: 'Credit',
  get_top_debtors: 'Credit',
  get_upcoming_appointments: 'Bookings',
  get_todays_bookings: 'Bookings',
  get_bookings_on_date: 'Bookings',
  get_no_show_rate: 'Bookings',
  get_reviews_average: 'Reviews',
  get_open_complaints: 'Reviews',
  get_campaign_performance: 'Marketing',
  get_message_quota_usage: 'Marketing',
  get_staff_leaderboard: 'Staff',
  get_new_customers_this_month: 'Customers',
  find_customer_by_phone: 'Customers',
  get_top_customers: 'Customers',
  search_help_docs: 'Help',
};

/** Real per-action grouping for a confirmed/pending Voice Assistant command — the action itself
 * (`VoiceCommandDraft.action`) is the only real signal available, so this is a direct, honest
 * relabeling of it rather than an invented classification. */
export const VOICE_TOPIC: Record<string, string> = {
  record_wastage: 'Inventory',
  add_expense: 'Profit',
  add_customer: 'Customers',
  record_cash_movement: 'Cash',
};

export type HistoryKind = 'business' | 'help' | 'voice';

export const HISTORY_KINDS: HistoryKind[] = ['business', 'help', 'voice'];
