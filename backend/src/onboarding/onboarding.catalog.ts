/**
 * Auth & Onboarding catalog — ported from `docs/Logo asset and green panel/Noxtill Auth &
 * Onboarding.dc.html`. Served to the frontend by `GET /onboarding/catalog` so the Step 2 questions,
 * the activity → module mapping and the module list exist in exactly one place, and the backend
 * re-derives (never trusts) the recommendation from the stored answers at analysis time.
 *
 * Icons are keys into the frontend's icon-path map, not SVG.
 */

export interface CatalogActivity {
  name: string;
  group: string;
  icon: string;
  mods: string[];
}

export interface CatalogOption {
  label: string;
  acts: CatalogActivity[];
}

export interface CatalogQuestion {
  id: string;
  q: string;
  hint?: string;
  showIf?: { id: string; any: string[] };
  options: CatalogOption[];
}

export interface CatalogModule {
  id: string;
  name: string;
  desc: string;
  icon: string;
  color: string;
  tint: string;
  /** `lib/nav-items.ts` keys this module turns on in the sidebar. */
  navKeys: string[];
  /** Honest one-liner shown in the Step 5 preview once the module is enabled. */
  readyCopy: string;
}

const A = (
  name: string,
  group: string,
  icon: string,
  mods: string[],
): CatalogActivity => ({ name, group, icon, mods });

export const CATEGORIES: { name: string; icon: string }[] = [
  { name: 'Salon & Beauty', icon: 'scissors' },
  { name: 'Restaurant & Food', icon: 'utensils' },
  { name: 'Retail & Stores', icon: 'bag' },
  { name: 'Health & Wellness', icon: 'heart' },
  { name: 'Professional Services', icon: 'briefcase' },
  { name: 'Home Services', icon: 'home' },
  { name: 'Other Business', icon: 'dots' },
];

export const SUBCATS: Record<string, string[]> = {
  'Salon & Beauty': [
    'Hair Salon',
    'Beauty Studio',
    'Barber Shop',
    'Nail Salon',
    'Spa',
  ],
  'Retail & Stores': [
    'Clothing Store',
    'Electronics Store',
    'Grocery Store',
    'General Merchandise',
    'Online Shop',
  ],
  'Restaurant & Food': ['Restaurant', 'Cafe', 'Bakery', 'Takeaway', 'Catering'],
  'Health & Wellness': [
    'Clinic',
    'Therapy Practice',
    'Dental',
    'Fitness Studio',
  ],
  'Professional Services': ['Agency', 'Consultancy', 'Accounting', 'Legal'],
  'Home Services': [
    'Repair & Maintenance',
    'Cleaning',
    'Installation',
    'Field Service',
  ],
  'Other Business': ['Education', 'Automotive', 'Real Estate', 'Other'],
};

export const REQ_LABEL: Record<string, string> = {
  pos: 'Record daily sales',
  products: 'Manage product information',
  orders: 'Manage customer orders',
  inventory: 'Track available stock',
  crm: 'Manage customer records',
  bookings: 'Manage appointments and bookings',
  staff: 'Manage staff and schedules',
  marketing: 'Send reminders and promotions',
  reviews: 'Collect customer reviews',
  analytics: 'See business performance',
  projects: 'Run projects and tasks',
  inbox: 'Handle customer conversations in one inbox',
  credit: 'Track customer credit and balances',
  ai_assistant: 'Let AI help with replies and admin',
  ai_insights: 'Let AI explain my business numbers',
  ai_phone: 'Let AI answer customer calls',
  ai_photo: 'Turn paper records into data',
  automations: 'Automate repetitive work',
};

export const DISCOVERY: Record<
  string,
  { base: CatalogActivity[]; questions: CatalogQuestion[] }
> = {
  'Clothing Store': {
    base: [
      A('Manage clothing products', 'PRODUCTS', 'tag', ['products']),
      A('Manage sizes and colours', 'PRODUCTS', 'grid', ['products']),
    ],
    questions: [
      {
        id: 'channels',
        q: 'How do you sell your products?',
        hint: 'Pick every channel you actually use.',
        options: [
          {
            label: 'Physical store',
            acts: [
              A('Record counter sales', 'SALES & PAYMENTS', 'cart', ['pos']),
            ],
          },
          {
            label: 'Online website',
            acts: [
              A('Manage online orders', 'SALES & PAYMENTS', 'box', ['orders']),
            ],
          },
          {
            label: 'Social media',
            acts: [
              A('Take orders from messages', 'SALES & PAYMENTS', 'send', [
                'orders',
              ]),
            ],
          },
          {
            label: 'Wholesale',
            acts: [
              A(
                'Bulk orders and customer accounts',
                'SALES & PAYMENTS',
                'file',
                ['orders', 'crm'],
              ),
            ],
          },
        ],
      },
      {
        id: 'pos_how',
        q: 'How do you record in-store sales today?',
        showIf: { id: 'channels', any: ['Physical store'] },
        options: [
          {
            label: 'Paper or notebook',
            acts: [A('Create invoices', 'SALES & PAYMENTS', 'file', ['pos'])],
          },
          {
            label: 'Cash register',
            acts: [
              A('Daily sales totals', 'SALES & PAYMENTS', 'chart', ['pos']),
            ],
          },
          {
            label: 'Another app',
            acts: [
              A('Move sales history into Noxtill', 'SALES & PAYMENTS', 'box', [
                'pos',
              ]),
            ],
          },
        ],
      },
      {
        id: 'web_orders',
        q: 'Should website orders be managed inside Noxtill?',
        showIf: { id: 'channels', any: ['Online website', 'Social media'] },
        options: [
          {
            label: 'Yes, order status and fulfilment',
            acts: [
              A('Track order status', 'ORDERS & DELIVERY', 'box', ['orders']),
            ],
          },
          {
            label: 'Yes, plus deliveries',
            acts: [
              A('Organize deliveries', 'ORDERS & DELIVERY', 'send', ['orders']),
            ],
          },
          { label: 'No, I handle them elsewhere', acts: [] },
        ],
      },
      {
        id: 'stock',
        q: 'Do you need to track stock and returns?',
        options: [
          {
            label: 'Track stock levels',
            acts: [A('Track stock', 'OPERATIONS', 'box', ['inventory'])],
          },
          {
            label: 'Manage returns',
            acts: [A('Manage returns', 'OPERATIONS', 'file', ['inventory'])],
          },
          {
            label: 'Keep customer records',
            acts: [A('Keep customer records', 'CUSTOMERS', 'user', ['crm'])],
          },
          { label: 'None of these', acts: [] },
        ],
      },
    ],
  },
  Restaurant: {
    base: [A('Manage the menu', 'PRODUCTS', 'list', ['products'])],
    questions: [
      {
        id: 'service',
        q: 'How do customers order from you?',
        options: [
          {
            label: 'Dine-in',
            acts: [
              A('Table and counter orders', 'SALES & PAYMENTS', 'cart', [
                'pos',
              ]),
            ],
          },
          {
            label: 'Takeaway',
            acts: [A('Takeaway orders', 'SALES & PAYMENTS', 'box', ['orders'])],
          },
          {
            label: 'Delivery',
            acts: [
              A('Delivery orders', 'ORDERS & DELIVERY', 'send', ['orders']),
            ],
          },
          {
            label: 'Table reservations',
            acts: [
              A('Table reservations', 'BOOKINGS', 'calendar', ['bookings']),
            ],
          },
        ],
      },
      {
        id: 'delivery_how',
        q: 'How do you handle deliveries?',
        showIf: { id: 'service', any: ['Delivery'] },
        options: [
          {
            label: 'Own drivers',
            acts: [
              A(
                'Assign drivers and track delivery',
                'ORDERS & DELIVERY',
                'pin',
                ['orders'],
              ),
            ],
          },
          {
            label: 'Delivery partners',
            acts: [
              A('Consolidate partner orders', 'ORDERS & DELIVERY', 'box', [
                'orders',
              ]),
            ],
          },
        ],
      },
      {
        id: 'kitchen',
        q: 'What do you need to keep on top of in the back of house?',
        options: [
          {
            label: 'Kitchen order tracking',
            acts: [A('Kitchen order tickets', 'OPERATIONS', 'list', ['pos'])],
          },
          {
            label: 'Ingredient stock',
            acts: [
              A('Track ingredient stock', 'OPERATIONS', 'box', ['inventory']),
            ],
          },
          {
            label: 'Staff shifts',
            acts: [A('Manage staff shifts', 'OPERATIONS', 'users', ['staff'])],
          },
          { label: 'Nothing yet', acts: [] },
        ],
      },
    ],
  },
  'Hair Salon': {
    base: [A('Offer multiple services', 'SERVICES', 'list', ['bookings'])],
    questions: [
      {
        id: 'booking',
        q: 'How do customers come to you?',
        options: [
          {
            label: 'They book appointments',
            acts: [
              A('Customers book appointments', 'BOOKINGS', 'calendar', [
                'bookings',
              ]),
            ],
          },
          {
            label: 'Walk-ins',
            acts: [
              A('Handle walk-in customers', 'BOOKINGS', 'users', ['bookings']),
            ],
          },
        ],
      },
      {
        id: 'reminders',
        q: 'Do you want to reduce no-shows?',
        showIf: { id: 'booking', any: ['They book appointments'] },
        options: [
          {
            label: 'Send appointment reminders',
            acts: [
              A('Send appointment reminders', 'CUSTOMERS', 'clock', [
                'bookings',
                'marketing',
              ]),
            ],
          },
          { label: 'Not right now', acts: [] },
        ],
      },
      {
        id: 'retail',
        q: 'Do you sell anything besides services?',
        options: [
          {
            label: 'Yes, beauty products',
            acts: [
              A('Sell products at the counter', 'SALES & PAYMENTS', 'cart', [
                'pos',
                'inventory',
              ]),
            ],
          },
          { label: 'No, services only', acts: [] },
        ],
      },
      {
        id: 'ops',
        q: "Anything else you'd like to keep organized?",
        options: [
          {
            label: 'Customer records and history',
            acts: [A('Keep customer records', 'CUSTOMERS', 'user', ['crm'])],
          },
          {
            label: 'Staff schedules',
            acts: [A('Schedule staff', 'OPERATIONS', 'users', ['staff'])],
          },
          {
            label: 'Reviews',
            acts: [A('Collect reviews', 'CUSTOMERS', 'star', ['reviews'])],
          },
          { label: 'Nothing else', acts: [] },
        ],
      },
    ],
  },
  Consultancy: {
    base: [A('Keep client records', 'CLIENTS', 'user', ['crm'])],
    questions: [
      {
        id: 'work',
        q: 'How does your client work run?',
        options: [
          {
            label: 'Scheduled consultations',
            acts: [
              A('Book consultations', 'BOOKINGS', 'calendar', ['bookings']),
            ],
          },
          {
            label: 'Projects over weeks or months',
            acts: [
              A('Run projects and tasks', 'PROJECTS', 'list', ['projects']),
            ],
          },
          {
            label: 'On-site visits',
            acts: [A('Schedule site visits', 'BOOKINGS', 'pin', ['bookings'])],
          },
        ],
      },
      {
        id: 'billing',
        q: 'How do you get paid?',
        options: [
          {
            label: 'Invoices after work',
            acts: [A('Create invoices', 'SALES & PAYMENTS', 'file', ['pos'])],
          },
          {
            label: 'Retainers or subscriptions',
            acts: [A('Recurring billing', 'SALES & PAYMENTS', 'card', ['pos'])],
          },
          {
            label: 'Quotes then invoices',
            acts: [
              A('Prepare quotations', 'SALES & PAYMENTS', 'file', ['pos']),
            ],
          },
        ],
      },
      {
        id: 'comms',
        q: 'What should Noxtill help you follow up on?',
        options: [
          {
            label: 'Client follow-ups',
            acts: [A('Client follow-ups', 'CLIENTS', 'clock', ['crm'])],
          },
          {
            label: 'New enquiries',
            acts: [A('Track enquiries and leads', 'CLIENTS', 'send', ['crm'])],
          },
          {
            label: 'Business performance',
            acts: [
              A('Track business performance', 'OPERATIONS', 'chart', [
                'analytics',
              ]),
            ],
          },
          { label: 'Nothing yet', acts: [] },
        ],
      },
    ],
  },
};

/** Asked for every business type — communications, credit and AI are evaluated like any other module. */
export const COMMON_QUESTIONS: CatalogQuestion[] = [
  {
    id: 'ch_contact',
    q: 'How do customers contact you?',
    hint: 'Every channel you actually reply on.',
    options: [
      {
        label: 'WhatsApp',
        acts: [A('Reply on WhatsApp', 'CONVERSATIONS', 'send', ['inbox'])],
      },
      {
        label: 'Instagram or Facebook',
        acts: [
          A('Reply on social messages', 'CONVERSATIONS', 'send', ['inbox']),
        ],
      },
      {
        label: 'SMS or email',
        acts: [A('Reply by SMS and email', 'CONVERSATIONS', 'card', ['inbox'])],
      },
      {
        label: 'Phone calls',
        acts: [
          A('Take customer calls', 'CONVERSATIONS', 'clock', ['ai_phone']),
        ],
      },
    ],
  },
  {
    id: 'ch_calls',
    q: "Do you miss calls when you're busy?",
    showIf: { id: 'ch_contact', any: ['Phone calls'] },
    options: [
      {
        label: "Yes — I'd like calls answered automatically",
        acts: [
          A('Answer and triage calls automatically', 'CONVERSATIONS', 'clock', [
            'ai_phone',
          ]),
        ],
      },
      { label: 'No, we answer everything', acts: [] },
    ],
  },
  {
    id: 'ch_credit',
    q: 'Do customers ever buy now and pay later?',
    options: [
      {
        label: 'Yes, we track what they owe',
        acts: [
          A('Track customer credit and balances', 'SALES & PAYMENTS', 'file', [
            'credit',
          ]),
        ],
      },
      { label: 'No, payment is always upfront', acts: [] },
    ],
  },
  {
    id: 'ch_ai',
    q: 'Where would you like AI to help?',
    hint: 'Nothing here switches on by itself — you still approve each module.',
    options: [
      {
        label: 'Draft replies and daily admin',
        acts: [
          A('Let AI draft replies and admin', 'AI', 'sparkle', [
            'ai_assistant',
          ]),
        ],
      },
      {
        label: 'Spot trends in my numbers',
        acts: [
          A('Surface trends and anomalies', 'AI', 'chart', ['ai_insights']),
        ],
      },
      {
        label: 'Turn paper records into data',
        acts: [
          A('Digitize paper records and receipts', 'AI', 'file', ['ai_photo']),
        ],
      },
      {
        label: 'Automate repetitive steps',
        acts: [A('Automate repetitive steps', 'AI', 'gear', ['automations'])],
      },
      { label: 'Nothing for now', acts: [] },
    ],
  },
];

export const DISCOVERY_ALIAS: Record<string, string> = {
  'Beauty Studio': 'Hair Salon',
  'Barber Shop': 'Hair Salon',
  'Nail Salon': 'Hair Salon',
  Spa: 'Hair Salon',
  Clinic: 'Hair Salon',
  'Therapy Practice': 'Hair Salon',
  Dental: 'Hair Salon',
  'Fitness Studio': 'Hair Salon',
  'Electronics Store': 'Clothing Store',
  'Grocery Store': 'Clothing Store',
  'General Merchandise': 'Clothing Store',
  'Online Shop': 'Clothing Store',
  Cafe: 'Restaurant',
  Bakery: 'Restaurant',
  Takeaway: 'Restaurant',
  Catering: 'Restaurant',
  Agency: 'Consultancy',
  Accounting: 'Consultancy',
  Legal: 'Consultancy',
  'Repair & Maintenance': 'Consultancy',
  Cleaning: 'Consultancy',
  Installation: 'Consultancy',
  'Field Service': 'Consultancy',
  Education: 'Consultancy',
  Automotive: 'Consultancy',
  'Real Estate': 'Consultancy',
  Other: 'Consultancy',
};

export const MODULES: CatalogModule[] = [
  {
    id: 'bookings',
    name: 'Bookings',
    desc: 'Manage appointments, calendar and scheduling.',
    icon: 'calendar',
    color: '#E11D48',
    tint: '#FFE4E6',
    navKeys: ['bookings'],
    readyCopy: 'Calendar ready — share your public booking link anytime',
  },
  {
    id: 'crm',
    name: 'Customers (CRM)',
    desc: 'Store customer records and manage relationships.',
    icon: 'users',
    color: '#0B8A49',
    tint: '#DCF3E5',
    navKeys: ['customers'],
    readyCopy: 'Ready to use — empty until you add customers',
  },
  {
    id: 'pos',
    name: 'Fast Sale (POS)',
    desc: 'Take payments and manage counter sales.',
    icon: 'cart',
    color: '#2563EB',
    tint: '#DBEAFE',
    navKeys: ['sales'],
    readyCopy: 'Counter sales ready',
  },
  {
    id: 'inbox',
    name: 'Unified Inbox',
    desc: 'WhatsApp, Instagram, Messenger, SMS and email in one thread.',
    icon: 'send',
    color: '#0EA5E9',
    tint: '#E0F2FE',
    navKeys: ['unified-inbox'],
    readyCopy: 'Awaiting your channel connections',
  },
  {
    id: 'credit',
    name: 'Credit Management',
    desc: 'Track what customers owe and settle balances.',
    icon: 'file',
    color: '#B45309',
    tint: '#FEF3C7',
    navKeys: ['credit'],
    readyCopy: 'Credit ledger — empty until you add balances',
  },
  {
    id: 'ai_assistant',
    name: 'AI Business Assistant',
    desc: 'Drafts replies, summaries and daily admin for you.',
    icon: 'sparkle',
    color: '#7C3AED',
    tint: '#EDE9FE',
    navKeys: ['ai-assistant'],
    readyCopy: 'Ask about your sales, bookings and customers',
  },
  {
    id: 'ai_insights',
    name: 'AI Insights',
    desc: 'Explains trends and flags anomalies in your numbers.',
    icon: 'chart',
    color: '#4F46E5',
    tint: '#E0E7FF',
    navKeys: ['business-brain'],
    readyCopy: 'Insights appear once you have sales data',
  },
  {
    id: 'ai_phone',
    name: 'AI Phone Receptionist',
    desc: 'Answers calls, books and routes to the right person.',
    icon: 'clock',
    color: '#0891B2',
    tint: '#CFFAFE',
    navKeys: ['receptionist'],
    readyCopy: 'Needs a phone number before it can answer calls',
  },
  {
    id: 'ai_photo',
    name: 'AI Photo Digitizer',
    desc: 'Turns photos of records and receipts into data.',
    icon: 'file',
    color: '#DB2777',
    tint: '#FCE7F3',
    navKeys: ['digitizer'],
    readyCopy: 'Capture receipts and paper records as data',
  },
  {
    id: 'automations',
    name: 'Automations & Workflows',
    desc: 'Runs repetitive steps automatically.',
    icon: 'gear',
    color: '#475569',
    tint: '#F1F5F9',
    navKeys: ['integrations'],
    readyCopy: 'No workflows switched on yet',
  },
  {
    id: 'products',
    name: 'Products & Services',
    desc: 'Your catalog, variants and pricing.',
    icon: 'tag',
    color: '#0F766E',
    tint: '#CCFBF1',
    navKeys: ['products'],
    readyCopy: 'Catalog ready',
  },
  {
    id: 'projects',
    name: 'Projects & Tasks',
    desc: 'Plan client work, tasks and deadlines.',
    icon: 'list',
    color: '#4338CA',
    tint: '#E0E7FF',
    navKeys: ['projects'],
    readyCopy: 'Ready — no projects yet',
  },
  {
    id: 'orders',
    name: 'Orders & Delivery',
    desc: 'Track online orders, status and delivery.',
    icon: 'send',
    color: '#7C3AED',
    tint: '#EDE9FE',
    navKeys: ['orders', 'deliveries'],
    readyCopy: 'Order statuses: pending, confirmed, in progress, completed',
  },
  {
    id: 'inventory',
    name: 'Inventory',
    desc: 'Track stock, low items and product management.',
    icon: 'box',
    color: '#D97706',
    tint: '#FEF3C7',
    navKeys: ['inventory'],
    readyCopy: 'Stock tracking and low-stock alerts ready',
  },
  {
    id: 'marketing',
    name: 'Marketing & Campaigns',
    desc: 'Send promotions, offers and automated messages.',
    icon: 'send',
    color: '#DB2777',
    tint: '#FCE7F3',
    navKeys: ['marketing'],
    readyCopy: 'Ready — no campaigns sent yet',
  },
  {
    id: 'reviews',
    name: 'Reviews & Reputation',
    desc: 'Collect and manage customer reviews.',
    icon: 'star',
    color: '#CA8A04',
    tint: '#FEF9C3',
    navKeys: ['reviews'],
    readyCopy: 'Send review requests after each visit',
  },
  {
    id: 'staff',
    name: 'Staff',
    desc: 'Manage team members, roles and schedules.',
    icon: 'user',
    color: '#64748B',
    tint: '#F1F5F9',
    navKeys: ['staff'],
    readyCopy: 'Team roles ready — invite staff anytime',
  },
  {
    id: 'analytics',
    name: 'Profit & Analytics',
    desc: 'Track sales, profit and business performance.',
    icon: 'chart',
    color: '#0891B2',
    tint: '#CFFAFE',
    navKeys: ['profit', 'reports'],
    readyCopy: 'Reports fill in as you record sales',
  },
];

/** Sidebar entries every workspace keeps regardless of the modules chosen. */
export const ALWAYS_ON_NAV_KEYS = ['dashboard', 'settings'];

export const MIN_MODULES = 5;

export const ANALYSIS_STAGES = [
  {
    title: 'Analyzing business information',
    sub: 'Business name, location and industry',
    icon: 'store',
  },
  {
    title: 'Understanding your description',
    sub: 'Products, services and how you work',
    icon: 'file',
  },
  {
    title: 'Detecting business activities',
    sub: 'Matching with Noxtill modules',
    icon: 'shield',
  },
  {
    title: 'Identifying your goals',
    sub: 'Finding the right tools and features',
    icon: 'target',
  },
  {
    title: 'Creating personalized recommendations',
    sub: 'Preparing your workspace setup',
    icon: 'list',
  },
];

export const SETUP_STAGES = [
  {
    title: 'Creating your business profile',
    sub: 'Saving your business information',
    icon: 'store',
  },
  {
    title: 'Setting up your selected modules',
    sub: 'Configuring tools and features',
    icon: 'box',
  },
  {
    title: 'Preparing your services and products',
    sub: 'Creating initial drafts from your description',
    icon: 'file',
  },
  {
    title: 'Configuring your settings',
    sub: 'Business hours, currency and preferences',
    icon: 'gear',
  },
  { title: 'Finalizing your workspace', sub: 'Almost ready…', icon: 'sparkle' },
];

export function catalogPayload() {
  return {
    categories: CATEGORIES,
    subcats: SUBCATS,
    reqLabel: REQ_LABEL,
    discovery: DISCOVERY,
    commonQuestions: COMMON_QUESTIONS,
    discoveryAlias: DISCOVERY_ALIAS,
    modules: MODULES.map(({ readyCopy: _r, ...m }) => m),
    analysisStages: ANALYSIS_STAGES,
    setupStages: SETUP_STAGES,
    minModules: MIN_MODULES,
  };
}
