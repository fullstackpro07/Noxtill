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
