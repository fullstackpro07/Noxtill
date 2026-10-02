export type BusinessModuleGroup = 'Core' | 'Growth & channels' | 'AI';

export interface BusinessModuleDef {
  /** Same key as the top-level sidebar entry (`frontend/src/lib/nav-items.ts`). */
  key: string;
  label: string;
  group: BusinessModuleGroup;
  description: string;
}

/**
 * Modules a business can turn off. Dashboard and Settings are always on (Settings is where a module
 * is turned back on). Turning a module off hides it from navigation and its pages for everyone in
 * the business; it never deletes data, and data other modules rely on (e.g. orders created by Fast
 * Sale) keeps flowing.
 */
export const BUSINESS_MODULES: BusinessModuleDef[] = [
  {
    key: 'sales',
    label: 'Fast Sale',
    group: 'Core',
    description: 'Point-of-sale checkout.',
  },
  {
    key: 'orders',
    label: 'Orders',
    group: 'Core',
    description: 'Orders, returns and quotations.',
  },
  {
    key: 'products',
    label: 'Products',
    group: 'Core',
    description: 'Product and service catalog.',
  },
  {
    key: 'inventory',
    label: 'Inventory',
    group: 'Core',
    description: 'Stock, purchases and suppliers.',
  },
  {
    key: 'bookings',
    label: 'Bookings',
    group: 'Core',
    description: 'Appointments and reservations.',
  },
  {
    key: 'credit',
    label: 'Credit',
    group: 'Core',
    description: 'Customer credit and recovery.',
  },
  {
    key: 'customers',
    label: 'Customers',
    group: 'Core',
    description: 'CRM, segments and loyalty.',
  },
  {
    key: 'staff',
    label: 'Staff',
    group: 'Core',
    description: 'Team, shifts and payroll.',
  },
  {
    key: 'branches',
    label: 'Branches',
    group: 'Core',
    description: 'Multi-location management.',
  },
  {
    key: 'deliveries',
    label: 'Delivery & Riders',
    group: 'Core',
    description: 'Deliveries and rider dispatch.',
  },
  {
    key: 'profit',
    label: 'Profit & Analytics',
    group: 'Core',
    description: 'Profit and margin analysis.',
  },
  {
    key: 'reports',
    label: 'Reports',
    group: 'Core',
    description: 'Reports and data exports.',
  },
  {
    key: 'reviews',
    label: 'Reviews',
    group: 'Growth & channels',
    description: 'Review requests and replies.',
  },
  {
    key: 'marketing',
    label: 'Marketing',
    group: 'Growth & channels',
    description: 'Campaigns, content and SEO.',
  },
  {
    key: 'autonomous-commerce',
    label: 'Autonomous Commerce',
    group: 'Growth & channels',
    description: 'Sourcing, listings, fulfillment and store growth.',
  },
  {
    key: 'social',
    label: 'Social Media',
    group: 'Growth & channels',
    description: 'Social posts and inbox.',
  },
  {
    key: 'advertising',
    label: 'Advertising',
    group: 'Growth & channels',
    description: 'Ad campaigns and experiments.',
  },
  {
    key: 'listings',
    label: 'Business Listings',
    group: 'Growth & channels',
    description: 'Local listings and citations.',
  },
  {
    key: 'competitive',
    label: 'Competitive Insights',
    group: 'Growth & channels',
    description: 'Competitor tracking.',
  },
  {
    key: 'integrations',
    label: 'Integrations',
    group: 'Growth & channels',
    description: 'Connected apps and marketplaces.',
  },
  {
    key: 'unified-inbox',
    label: 'Unified Inbox',
    group: 'Growth & channels',
    description: 'All customer messages in one place.',
  },
  {
    key: 'ai-assistant',
    label: 'AI Assistant',
    group: 'AI',
    description: 'Chat assistant for your business.',
  },
  {
    key: 'receptionist',
    label: 'Phone Receptionist',
    group: 'AI',
    description: 'AI phone answering.',
  },
  {
    key: 'digitizer',
    label: 'AI Photo Digitizer',
    group: 'AI',
    description: 'Turn photos of records into data.',
  },
  {
    key: 'business-brain',
    label: 'Business Brain',
    group: 'AI',
    description: 'Business knowledge and memory.',
  },
  {
    key: 'opportunity-radar',
    label: 'Opportunity Radar',
    group: 'AI',
    description: 'Growth opportunities from your data.',
  },
  {
    key: 'business-simulator',
    label: 'Business Simulator',
    group: 'AI',
    description: 'What-if simulations.',
  },
  {
    key: 'diagnosis-center',
    label: 'Diagnosis Center',
    group: 'AI',
    description: 'Find what is holding the business back.',
  },
  {
    key: 'digital-twin',
    label: 'Digital Twin',
    group: 'AI',
    description: 'A live model of your business.',
  },
];

export const BUSINESS_MODULE_KEYS = new Set(BUSINESS_MODULES.map((m) => m.key));

/** Backend route roots owned by each selectable top-level module. More-specific prefixes win. */
export const BUSINESS_MODULE_API_PATHS: ReadonlyArray<{
  prefix: string;
  moduleKey: string;
}> = [
  { prefix: 'integrations/email/campaigns', moduleKey: 'marketing' },
  { prefix: 'integrations/automation', moduleKey: 'marketing' },
  { prefix: 'marketing/kit', moduleKey: 'marketing' },
  { prefix: 'marketing/tasks', moduleKey: 'marketing' },
  { prefix: 'marketing/settings', moduleKey: 'marketing' },
  { prefix: 'seo/citations', moduleKey: 'listings' },
  { prefix: 'seo/heatmap', moduleKey: 'marketing' },
  { prefix: 'ai/what-if', moduleKey: 'business-simulator' },
  { prefix: 'ai/branch-advisor', moduleKey: 'branches' },
  { prefix: 'ai/content', moduleKey: 'social' },
  { prefix: 'ai/insights', moduleKey: 'business-brain' },
  { prefix: 'commerce', moduleKey: 'autonomous-commerce' },
  { prefix: 'sales', moduleKey: 'sales' },
  { prefix: 'cash-reconciliation', moduleKey: 'sales' },
  { prefix: 'cash', moduleKey: 'sales' },
  { prefix: 'cash-register', moduleKey: 'sales' },
  { prefix: 'voice/sales', moduleKey: 'sales' },
  { prefix: 'orders', moduleKey: 'orders' },
  { prefix: 'quotations', moduleKey: 'orders' },
  { prefix: 'returns', moduleKey: 'orders' },
  { prefix: 'receipts', moduleKey: 'orders' },
  { prefix: 'tables', moduleKey: 'orders' },
  { prefix: 'products', moduleKey: 'products' },
  { prefix: 'variants', moduleKey: 'products' },
  { prefix: 'categories', moduleKey: 'products' },
  { prefix: 'suppliers', moduleKey: 'products' },
  { prefix: 'appointments', moduleKey: 'bookings' },
  { prefix: 'booking-link', moduleKey: 'bookings' },
  { prefix: 'public/booking', moduleKey: 'bookings' },
  { prefix: 'public/appt', moduleKey: 'bookings' },
  { prefix: 'deposits', moduleKey: 'bookings' },
  { prefix: 'reminder-rules', moduleKey: 'bookings' },
  { prefix: 'waitlist', moduleKey: 'bookings' },
  { prefix: 'queue', moduleKey: 'bookings' },
  { prefix: 'credit', moduleKey: 'credit' },
  { prefix: 'installments', moduleKey: 'credit' },
  { prefix: 'customers', moduleKey: 'customers' },
  { prefix: 'customer-tags', moduleKey: 'customers' },
  { prefix: 'customer-custom-fields', moduleKey: 'customers' },
  { prefix: 'customer-duplicates', moduleKey: 'customers' },
  { prefix: 'customer-merge-settings', moduleKey: 'customers' },
  { prefix: 'customer-privacy-settings', moduleKey: 'customers' },
  { prefix: 'customer-import', moduleKey: 'customers' },
  { prefix: 'segments', moduleKey: 'customers' },
  { prefix: 'memberships', moduleKey: 'customers' },
  { prefix: 'membership-plans', moduleKey: 'customers' },
  { prefix: 'loyalty-programs', moduleKey: 'customers' },
  { prefix: 'loyalty-members', moduleKey: 'customers' },
  { prefix: 'loyalty', moduleKey: 'customers' },
  { prefix: 'memory-notes', moduleKey: 'customers' },
  { prefix: 'reviews', moduleKey: 'reviews' },
  { prefix: 'feedback', moduleKey: 'reviews' },
  { prefix: 'video-testimonials', moduleKey: 'reviews' },
  { prefix: 'r', moduleKey: 'reviews' },
  { prefix: 'campaigns', moduleKey: 'marketing' },
  { prefix: 'content-items', moduleKey: 'marketing' },
  { prefix: 'keywords', moduleKey: 'marketing' },
  { prefix: 'seo-autopilot', moduleKey: 'marketing' },
  { prefix: 'marketing', moduleKey: 'marketing' },
  { prefix: 'coupons', moduleKey: 'marketing' },
  { prefix: 'vouchers', moduleKey: 'marketing' },
  { prefix: 'referrals', moduleKey: 'marketing' },
  { prefix: 'workflows', moduleKey: 'marketing' },
  { prefix: 'competitors', moduleKey: 'competitive' },
  { prefix: 'competitor-observations', moduleKey: 'competitive' },
  { prefix: 'competitive', moduleKey: 'competitive' },
  { prefix: 'visibility-score', moduleKey: 'competitive' },
  { prefix: 'inventory', moduleKey: 'inventory' },
  { prefix: 'stock', moduleKey: 'inventory' },
  { prefix: 'purchase-orders', moduleKey: 'inventory' },
  { prefix: 'stock-transfers', moduleKey: 'inventory' },
  { prefix: 'staff', moduleKey: 'staff' },
  { prefix: 'shifts', moduleKey: 'staff' },
  { prefix: 'attendance', moduleKey: 'staff' },
  { prefix: 'payroll', moduleKey: 'staff' },
  { prefix: 'advances', moduleKey: 'staff' },
  { prefix: 'time-off', moduleKey: 'staff' },
  { prefix: 'timesheets', moduleKey: 'staff' },
  { prefix: 'roles', moduleKey: 'staff' },
  { prefix: 'branches', moduleKey: 'branches' },
  { prefix: 'rollup', moduleKey: 'branches' },
  { prefix: 'deliveries', moduleKey: 'deliveries' },
  { prefix: 'delivery-insights', moduleKey: 'deliveries' },
  { prefix: 'delivery-settings', moduleKey: 'deliveries' },
  { prefix: 'delivery-overview', moduleKey: 'deliveries' },
  { prefix: 'delivery-zones', moduleKey: 'deliveries' },
  { prefix: 'public/track', moduleKey: 'deliveries' },
  { prefix: 'routes', moduleKey: 'deliveries' },
  { prefix: 'riders', moduleKey: 'deliveries' },
  { prefix: 'profit', moduleKey: 'profit' },
  { prefix: 'expenses', moduleKey: 'profit' },
  { prefix: 'cash-forecast', moduleKey: 'profit' },
  { prefix: 'recurring-obligations', moduleKey: 'profit' },
  { prefix: 'analytics', moduleKey: 'profit' },
  { prefix: 'reports', moduleKey: 'reports' },
  { prefix: 'exports', moduleKey: 'reports' },
  { prefix: 'assistant', moduleKey: 'ai-assistant' },
  { prefix: 'ai', moduleKey: 'ai-assistant' },
  { prefix: 'voice', moduleKey: 'receptionist' },
  { prefix: 'digitizer', moduleKey: 'digitizer' },
  { prefix: 'imports', moduleKey: 'digitizer' },
  { prefix: 'webhooks/social', moduleKey: 'social' },
  { prefix: 'social', moduleKey: 'social' },
  { prefix: 'media', moduleKey: 'social' },
  { prefix: 'ads', moduleKey: 'advertising' },
  { prefix: 'listings', moduleKey: 'listings' },
  { prefix: 'integrations', moduleKey: 'integrations' },
  { prefix: 'api-keys', moduleKey: 'integrations' },
  { prefix: 'outbound-webhooks', moduleKey: 'integrations' },
  { prefix: 'messages', moduleKey: 'unified-inbox' },
  { prefix: 'messaging', moduleKey: 'unified-inbox' },
  { prefix: 'business-brain', moduleKey: 'business-brain' },
  { prefix: 'opportunity-radar', moduleKey: 'opportunity-radar' },
  { prefix: 'business-simulator', moduleKey: 'business-simulator' },
  { prefix: 'diagnosis-center', moduleKey: 'diagnosis-center' },
  { prefix: 'digital-twin', moduleKey: 'digital-twin' },
];

const ORDERED_BUSINESS_MODULE_API_PATHS = [...BUSINESS_MODULE_API_PATHS].sort(
  (a, b) => b.prefix.length - a.prefix.length,
);

/** Widget values are served by the always-on Dashboard API, but individual values still belong to
 * a selectable module. Keep its registry shared so Dashboard can render the available catalog. */
const WIDGET_API_MODULES: Readonly<Record<string, string>> = {
  revenue_today: 'sales',
  orders_today: 'sales',
  avg_order_value_month: 'sales',
  revenue_this_month: 'sales',
  top_products_month: 'products',
  expenses_this_month: 'profit',
  new_customers_month: 'customers',
  lapsed_customers: 'customers',
  vip_customers: 'customers',
  low_stock_count: 'inventory',
  credit_outstanding: 'credit',
  upcoming_appointments: 'bookings',
  no_show_rate_month: 'bookings',
  appointments_completed_month: 'bookings',
  pending_appointments_today: 'bookings',
  reviews_average: 'reviews',
  open_complaints: 'reviews',
  pending_review_requests: 'reviews',
  campaign_performance_month: 'marketing',
  referral_count: 'marketing',
  competitor_comparison: 'competitive',
  staff_leaderboard_month: 'staff',
  staff_count: 'staff',
  attendance_today: 'staff',
  message_quota_usage: 'unified-inbox',
  channel_breakdown_month: 'unified-inbox',
  delivery_rate_month: 'unified-inbox',
};

/**
 * Core business records that several modules read and write. Fast Sale alone touches products,
 * customers, credit, orders, returns, staff shifts, cash and sales; commerce, inventory, bookings and
 * reports read the same rows. These APIs are never blocked by module selection — turning e.g.
 * Products off hides the Products screens, but Fast Sale must still list products and record sales.
 * Matching uses the most specific prefix, so a narrow module feature under a shared root (such as
 * `ai/what-if` → Business Simulator) is still gated.
 */
export const SHARED_DATA_API_PREFIXES: ReadonlySet<string> = new Set([
  'sales',
  'cash',
  'cash-register',
  'cash-reconciliation',
  'voice/sales',
  'orders',
  'quotations',
  'returns',
  'receipts',
  'tables',
  'products',
  'variants',
  'categories',
  'suppliers',
  'customers',
  'customer-tags',
  'customer-custom-fields',
  'segments',
  'credit',
  'installments',
  'inventory',
  'stock',
  'purchase-orders',
  'stock-transfers',
  'staff',
  'shifts',
  'attendance',
  'payroll',
  'advances',
  'time-off',
  'timesheets',
  'roles',
  'branches',
  'rollup',
  'riders',
  'ai',
  'media',
  'integrations',
]);

/** Return the selectable module owning an API path; Dashboard/Settings/unmapped shared APIs pass. */
export function businessModuleForApiPath(pathname: string): string | null {
  const path = normalizeApiPath(pathname);
  if (!path) return null;

  const widgetDataPath = path.match(/^widgets\/([^/]+)$/);
  if (widgetDataPath && widgetDataPath[1] !== 'registry') {
    return WIDGET_API_MODULES[widgetDataPath[1]] ?? null;
  }

  return matchApiPath(path)?.moduleKey ?? null;
}

function normalizeApiPath(pathname: string): string {
  return pathname
    .split(/[?#]/, 1)[0]
    .replace(/^\/api\/v\d+(?=\/|$)/i, '')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase();
}

function matchApiPath(path: string) {
  return ORDERED_BUSINESS_MODULE_API_PATHS.find(
    ({ prefix }) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/**
 * The module whose on/off switch gates this request, or null when it must always pass: always-on
 * routes, unmapped routes, and the shared business data in `SHARED_DATA_API_PREFIXES`.
 */
export function gatedModuleForApiPath(pathname: string): string | null {
  const path = normalizeApiPath(pathname);
  if (!path) return null;
  const widgetDataPath = path.match(/^widgets\/([^/]+)$/);
  if (widgetDataPath) return businessModuleForApiPath(pathname);
  const match = matchApiPath(path);
  if (!match || SHARED_DATA_API_PREFIXES.has(match.prefix)) return null;
  return match.moduleKey;
}
