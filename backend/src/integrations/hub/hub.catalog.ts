import { IntegrationProvider, SocialPlatform } from '@prisma/client';

/**
 * Integrations hub catalog — the single source of truth for what the Integrations directory
 * lists. Every entry maps to a real connector / social account / subscription mechanism in this
 * codebase; nothing here is aspirational. Descriptive fields (benefit, modules, permissions) only
 * claim what the corresponding code path actually does — when a connector's real capability is
 * narrower than the marketing line in the design, the entry says the narrower thing.
 */

export type HubCategory =
  | 'Google'
  | 'Meta'
  | 'Microsoft'
  | 'Social'
  | 'Advertising'
  | 'Listings'
  | 'E-commerce'
  | 'Payments'
  | 'Accounting'
  | 'Marketing'
  | 'Automation'
  | 'Communication'
  | 'Developer';

export type HubDirection = 'Inbound' | 'Outbound' | 'Two-way';

/**
 * How a provider is connected from the UI:
 *  - `oauth`       — POST /integrations/:provider/connect returns an `authUrl` to redirect to
 *  - `credentials` — the merchant types credentials into `credentialFields` (POST …/connect body)
 *  - `social`      — POST /social/:platform/connect (OAuth) via the Social accounts service
 *  - `social-token`— POST /social/:platform/connect-with-token
 *  - `automation`  — connected by creating an outbound-webhook subscription (Zapier/Make/n8n)
 *  - `developer`   — REST API / Webhooks: managed from the Developer tab, always available
 *  - `channel`     — a shared channel that is enabled with one click (Email)
 */
export type HubConnectKind =
  | 'oauth'
  | 'credentials'
  | 'social'
  | 'social-token'
  | 'automation'
  | 'developer'
  | 'channel';

export interface HubCredentialField {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
}

/**
 * How a provider's data really moves, taken from the code that does it:
 *  - `manual`    - only when someone runs Sync now
 *  - `scheduled` - also on a schedule (Business Listings auto-sync, hourly ad stats, the
 *                  5-minute booking mirror)
 *  - `event`     - when something happens (a message arrives, a sale is made); there is no sync
 */
export type HubSyncMode = 'manual' | 'scheduled' | 'event';

export type HubSource =
  | { type: 'integration'; provider: IntegrationProvider }
  | { type: 'social'; platform: SocialPlatform }
  | { type: 'virtual'; kind: 'rest_api' | 'webhooks' };

export interface HubProviderDef {
  key: string;
  name: string;
  initials: string;
  category: HubCategory;
  benefit: string;
  direction: HubDirection;
  /** Modules of the app that really read or write this provider's data. */
  modules: string[];
  /** Human description of the access requested — mirrors the connector's real scopes. */
  permissions: string;
  source: HubSource;
  connectKind: HubConnectKind;
  credentialFields?: HubCredentialField[];
  /** Env vars the platform must have for this provider's connect flow to work at all. */
  envKeys?: string[];
  /** Existing app screen that manages this provider's data. */
  workspaceHref?: string;
  /** What the "records" figure counts for this provider (unit shown on the card). */
  recordsUnit: string;
}

export const HUB_CATEGORY_ORDER: Array<{
  label: HubCategory;
  icon: string;
  meta: string;
}> = [
  {
    label: 'Google',
    icon: 'chrome',
    meta: 'Profile, ads, catalog, analytics and calendar',
  },
  {
    label: 'Meta',
    icon: 'message-circle',
    meta: 'Messaging, reviews and ad performance',
  },
  { label: 'Microsoft', icon: 'building-2', meta: 'Listings, ads and mail' },
  {
    label: 'Social',
    icon: 'share-2',
    meta: 'Messages, comments and publishing',
  },
  {
    label: 'Advertising',
    icon: 'target',
    meta: 'Campaigns, spend and results',
  },
  { label: 'Listings', icon: 'map-pinned', meta: 'Keep directories current' },
  {
    label: 'E-commerce',
    icon: 'shopping-bag',
    meta: 'Two-way products, orders and stock',
  },
  {
    label: 'Payments',
    icon: 'wallet-cards',
    meta: 'Charges, refunds and payouts',
  },
  {
    label: 'Accounting',
    icon: 'receipt-text',
    meta: 'Post sales, expenses and taxes',
  },
  {
    label: 'Marketing',
    icon: 'megaphone',
    meta: 'Audiences and campaign results',
  },
  {
    label: 'Automation',
    icon: 'workflow',
    meta: 'Triggers and actions across every module',
  },
  {
    label: 'Communication',
    icon: 'message-square',
    meta: 'Alerts and meeting links',
  },
  {
    label: 'Developer',
    icon: 'key-round',
    meta: 'Build directly against Noxtill',
  },
];

const integ = (provider: IntegrationProvider): HubSource => ({
  type: 'integration',
  provider,
});
const social = (platform: SocialPlatform): HubSource => ({
  type: 'social',
  platform,
});

const GOOGLE_ENV = ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET'];
const ADS_MODULES = ['Advertising'];
const AD_PLATFORM_ENV: Partial<Record<IntegrationProvider, string[]>> = {
  [IntegrationProvider.tiktok_ads]: [
    'TIKTOK_ADS_APP_ID',
    'TIKTOK_ADS_APP_SECRET',
  ],
  [IntegrationProvider.linkedin_ads]: [
    'LINKEDIN_ADS_CLIENT_ID',
    'LINKEDIN_ADS_CLIENT_SECRET',
  ],
  [IntegrationProvider.pinterest_ads]: [
    'PINTEREST_ADS_CLIENT_ID',
    'PINTEREST_ADS_CLIENT_SECRET',
  ],
  [IntegrationProvider.snapchat_ads]: [
    'SNAPCHAT_ADS_CLIENT_ID',
    'SNAPCHAT_ADS_CLIENT_SECRET',
  ],
  [IntegrationProvider.amazon_ads]: [
    'AMAZON_ADS_CLIENT_ID',
    'AMAZON_ADS_CLIENT_SECRET',
  ],
  [IntegrationProvider.reddit_ads]: [
    'REDDIT_ADS_CLIENT_ID',
    'REDDIT_ADS_CLIENT_SECRET',
  ],
};
const SOCIAL_MODULES = ['Social Inbox', 'Social Media'];

export const HUB_CATALOG: HubProviderDef[] = [
  // ── Google ────────────────────────────────────────────────────────────
  {
    key: 'gmb',
    name: 'Google Business Profile',
    initials: 'GB',
    category: 'Google',
    benefit: 'Sync listing details, hours and photos',
    direction: 'Two-way',
    modules: ['Business Listings'],
    permissions: 'Manage your Business Profile — read and write (business.manage)',
    source: integ(IntegrationProvider.gmb),
    connectKind: 'oauth',
    envKeys: GOOGLE_ENV,
    workspaceHref: '/listings',
    recordsUnit: 'syncs',
  },
  {
    key: 'google_ads',
    name: 'Google Ads',
    initials: 'GA',
    category: 'Google',
    benefit: 'Create campaigns and import spend and results',
    direction: 'Two-way',
    modules: ADS_MODULES,
    permissions: 'Manage Google Ads campaigns and read their performance (adwords)',
    source: integ(IntegrationProvider.google_ads),
    connectKind: 'oauth',
    envKeys: [...GOOGLE_ENV, 'GOOGLE_ADS_DEVELOPER_TOKEN'],
    workspaceHref: '/advertising',
    recordsUnit: 'campaigns',
  },
  {
    key: 'merchant',
    name: 'Google Merchant Center',
    initials: 'MC',
    category: 'Google',
    benefit: 'Publish your catalog to Google Shopping',
    direction: 'Outbound',
    modules: ['Products'],
    permissions: 'Manage Merchant Center products',
    source: integ(IntegrationProvider.merchant),
    connectKind: 'oauth',
    envKeys: GOOGLE_ENV,
    recordsUnit: 'products',
  },
  {
    key: 'google_analytics',
    name: 'Google Analytics',
    initials: 'G4',
    category: 'Google',
    benefit: 'Import daily web sessions and conversions',
    direction: 'Inbound',
    modules: ['Integrations'],
    permissions: 'Read sessions and conversions (read-only)',
    source: integ(IntegrationProvider.google_analytics),
    connectKind: 'oauth',
    envKeys: GOOGLE_ENV,
    recordsUnit: 'days of traffic',
  },
  {
    key: 'google_calendar',
    name: 'Google Calendar',
    initials: 'GC',
    category: 'Google',
    benefit: 'Mirror bookings to your calendar',
    direction: 'Outbound',
    modules: ['Bookings'],
    permissions: 'Create, change and delete calendar events (calendar.events)',
    source: integ(IntegrationProvider.google_calendar),
    connectKind: 'oauth',
    envKeys: GOOGLE_ENV,
    recordsUnit: 'events',
  },
  // ── Meta ──────────────────────────────────────────────────────────────
  {
    key: 'whatsapp',
    name: 'WhatsApp Business',
    initials: 'WA',
    category: 'Meta',
    benefit: 'Send customer messages and reminders from your own number',
    direction: 'Outbound',
    modules: ['Bookings', 'Credit', 'Marketing'],
    permissions: 'Send messages from your WhatsApp Business phone number',
    source: integ(IntegrationProvider.whatsapp),
    connectKind: 'credentials',
    credentialFields: [
      {
        key: 'phoneNumberId',
        label: 'Phone number ID',
        placeholder: 'From Meta → WhatsApp → API setup',
      },
      {
        key: 'accessToken',
        label: 'Access token',
        placeholder: 'Permanent system-user token',
        secret: true,
      },
    ],
    recordsUnit: 'messages',
  },
  {
    key: 'facebook',
    name: 'Facebook',
    initials: 'FB',
    category: 'Meta',
    benefit: 'Publish page posts and read comments on them',
    direction: 'Two-way',
    modules: SOCIAL_MODULES,
    permissions: 'Publish page posts · read page engagement and comments (pages_manage_posts, pages_read_engagement, pages_show_list)',
    source: social(SocialPlatform.facebook),
    connectKind: 'social',
    workspaceHref: '/social',
    recordsUnit: 'inbox items',
  },
  {
    key: 'instagram',
    name: 'Instagram',
    initials: 'IG',
    category: 'Meta',
    benefit: 'Publish posts and read comments on them',
    direction: 'Two-way',
    modules: SOCIAL_MODULES,
    permissions: 'Publish content · read basic profile and comments (instagram_basic, instagram_content_publish, pages_show_list)',
    source: social(SocialPlatform.instagram),
    connectKind: 'social',
    workspaceHref: '/social',
    recordsUnit: 'inbox items',
  },
  {
    key: 'meta_ads',
    name: 'Meta Ads',
    initials: 'MA',
    category: 'Meta',
    benefit: 'Create campaigns and import spend and results',
    direction: 'Two-way',
    modules: ADS_MODULES,
    permissions: 'Manage ads and business assets (ads_management, business_management)',
    source: integ(IntegrationProvider.meta_ads),
    connectKind: 'oauth',
    envKeys: ['META_ADS_APP_ID', 'META_ADS_APP_SECRET'],
    workspaceHref: '/advertising',
    recordsUnit: 'campaigns',
  },
  // ── Microsoft ─────────────────────────────────────────────────────────
  {
    key: 'bing_places',
    name: 'Bing Places',
    initials: 'BP',
    category: 'Microsoft',
    benefit: 'Keep your Bing listing current',
    direction: 'Two-way',
    modules: ['Business Listings'],
    permissions: 'Manage your Bing Places business (business.manage)',
    source: integ(IntegrationProvider.bing_places),
    connectKind: 'oauth',
    envKeys: ['BING_PLACES_CLIENT_ID', 'BING_PLACES_CLIENT_SECRET'],
    workspaceHref: '/listings',
    recordsUnit: 'syncs',
  },
  {
    key: 'microsoft_ads',
    name: 'Microsoft Ads',
    initials: 'MS',
    category: 'Microsoft',
    benefit: 'Create campaigns and import performance',
    direction: 'Two-way',
    modules: ADS_MODULES,
    permissions: 'Manage campaigns · read spend',
    source: integ(IntegrationProvider.microsoft_ads),
    connectKind: 'oauth',
    envKeys: ['MICROSOFT_ADS_CLIENT_ID', 'MICROSOFT_ADS_CLIENT_SECRET'],
    workspaceHref: '/advertising',
    recordsUnit: 'campaigns',
  },
  {
    key: 'outlook',
    name: 'Outlook Calendar',
    initials: 'OL',
    category: 'Microsoft',
    benefit: 'Mirror bookings to your Outlook calendar',
    direction: 'Outbound',
    modules: ['Bookings'],
    permissions: 'Read and write your calendars (Calendars.ReadWrite) — Noxtill only creates, updates and removes its own booking events',
    source: integ(IntegrationProvider.outlook),
    connectKind: 'oauth',
    envKeys: ['MICROSOFT_GRAPH_CLIENT_ID', 'MICROSOFT_GRAPH_CLIENT_SECRET'],
    recordsUnit: 'events',
  },
  // ── Social ────────────────────────────────────────────────────────────
  // What each platform's connector really does: the "inbox" is comments/mentions/notes on your
  // posts (or bot messages), never a direct-message inbox unless the platform says so.
  ...(
    [
      ['linkedin', 'LinkedIn', 'LI', 'Publish posts and read comments on them', 'Publish as a member · read organisation social activity (w_member_social, r_organization_social)', 'Two-way'],
      ['tiktok', 'TikTok', 'TT', 'Publish videos and read their comments', 'Publish videos · list videos and comments (video.publish, video.list, user.info.basic)', 'Two-way'],
      ['pinterest', 'Pinterest', 'PI', 'Publish pins and read their comments', 'Read boards and pins · write pins (boards:read, pins:read, pins:write)', 'Two-way'],
      ['twitter', 'X', 'X', 'Publish posts and read mentions', 'Read and write posts (tweet.read, tweet.write, users.read)', 'Two-way'],
      ['youtube', 'YouTube', 'YT', 'Publish videos and read comments on them', 'Manage your YouTube account, including comments (youtube.force-ssl)', 'Two-way'],
      ['snapchat', 'Snapchat', 'SC', 'Create Snapchat ad creatives — Snapchat has no comment or message API to read', 'Snapchat Marketing API (snapchat-marketing-api)', 'Outbound'],
      ['threads', 'Threads', 'TH', 'Publish posts and read replies', 'Publish posts · read and manage replies (threads_basic, threads_content_publish, threads_manage_replies)', 'Two-way'],
      ['reddit', 'Reddit', 'RD', 'Submit posts and read comments and private messages', 'Submit posts · read comments and private messages (identity, submit, read, privatemessages)', 'Two-way'],
      ['tumblr', 'Tumblr', 'TB', 'Publish posts and read notes on them', 'Write posts (write, offline_access)', 'Two-way'],
    ] as Array<[SocialPlatform, string, string, string, string, HubDirection]>
  ).map(([platform, name, initials, benefit, permissions, direction]): HubProviderDef => ({
    key: platform,
    name,
    initials,
    category: 'Social',
    benefit,
    direction,
    modules: platform === 'snapchat' ? ['Social Media'] : SOCIAL_MODULES,
    permissions,
    source: social(platform),
    connectKind: 'social',
    workspaceHref: '/social',
    recordsUnit: 'inbox items',
  })),
  ...(
    [
      ['telegram', 'Telegram', 'TG', 'Send and receive messages through your bot'],
      ['discord', 'Discord', 'DC', 'Send and receive messages through your bot'],
      ['wechat', 'WeChat', 'WX', 'Send messages and reply from your official account; incoming messages arrive by webhook'],
      ['line', 'LINE', 'LN', 'Send and receive messages through your official account'],
    ] as Array<[SocialPlatform, string, string, string]>
  ).map(([platform, name, initials, benefit]): HubProviderDef => ({
    key: platform,
    name,
    initials,
    category: 'Social',
    benefit,
    direction: 'Two-way',
    modules: SOCIAL_MODULES,
    permissions: 'Acts with the bot or account token you provide',
    source: social(platform),
    connectKind: 'social-token',
    workspaceHref: '/social',
    recordsUnit: 'inbox items',
  })),
  // ── Advertising (non-Google/Meta/Microsoft ad platforms) ───────────────
  ...(
    [
      [IntegrationProvider.tiktok_ads, 'TikTok Ads', 'TA'],
      [IntegrationProvider.linkedin_ads, 'LinkedIn Ads', 'LA'],
      [IntegrationProvider.pinterest_ads, 'Pinterest Ads', 'PA'],
      [IntegrationProvider.snapchat_ads, 'Snapchat Ads', 'SA'],
      [IntegrationProvider.amazon_ads, 'Amazon Ads', 'AZ'],
      [IntegrationProvider.reddit_ads, 'Reddit Ads', 'RA'],
    ] as Array<[IntegrationProvider, string, string]>
  ).map(([provider, name, initials]): HubProviderDef => ({
    key: provider,
    name,
    initials,
    category: 'Advertising',
    benefit: 'Create campaigns and import spend and results',
    direction: 'Two-way',
    modules: ADS_MODULES,
    permissions: 'Manage campaigns · read spend and results',
    source: integ(provider),
    connectKind: 'oauth',
    envKeys: AD_PLATFORM_ENV[provider],
    workspaceHref: '/advertising',
    recordsUnit: 'campaigns',
  })),
  // ── Listings ──────────────────────────────────────────────────────────
  {
    key: 'yelp',
    name: 'Yelp',
    initials: 'YP',
    category: 'Listings',
    benefit: 'Keep your Yelp business page current',
    direction: 'Two-way',
    modules: ['Business Listings'],
    permissions: 'Manage your Yelp business (business_management)',
    source: integ(IntegrationProvider.yelp),
    connectKind: 'oauth',
    envKeys: ['YELP_CLIENT_ID', 'YELP_CLIENT_SECRET'],
    workspaceHref: '/listings',
    recordsUnit: 'syncs',
  },
  {
    key: 'apple_business_connect',
    name: 'Apple Business Connect',
    initials: 'AB',
    category: 'Listings',
    benefit: 'Keep your Apple Maps listing current',
    direction: 'Two-way',
    modules: ['Business Listings'],
    permissions: 'Read and write your Apple Maps business details (server-to-server API key)',
    source: integ(IntegrationProvider.apple_business_connect),
    connectKind: 'channel',
    envKeys: ['APPLE_BUSINESS_CONNECT_API_KEY'],
    workspaceHref: '/listings',
    recordsUnit: 'syncs',
  },
  // ── E-commerce ────────────────────────────────────────────────────────
  {
    key: 'shopify',
    name: 'Shopify',
    initials: 'SH',
    category: 'E-commerce',
    benefit: 'Two-way stock, plus online orders into Noxtill',
    direction: 'Two-way',
    modules: ['Orders', 'Products', 'Inventory', 'Reports'],
    permissions: 'Read and write products, read orders, write inventory (read_products, write_products, read_orders, write_inventory) — Noxtill only reads them and updates inventory levels',
    source: integ(IntegrationProvider.shopify),
    connectKind: 'oauth',
    credentialFields: [
      {
        key: 'shop',
        label: 'Shop domain',
        placeholder: 'your-store.myshopify.com',
      },
    ],
    envKeys: ['SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET'],
    recordsUnit: 'records',
  },
  {
    key: 'woocommerce',
    name: 'WooCommerce',
    initials: 'WC',
    category: 'E-commerce',
    benefit: 'Two-way stock, plus online orders into Noxtill',
    direction: 'Two-way',
    modules: ['Orders', 'Products', 'Inventory', 'Reports'],
    permissions: 'Read products and orders · write stock levels',
    source: integ(IntegrationProvider.woocommerce),
    connectKind: 'credentials',
    credentialFields: [
      {
        key: 'storeUrl',
        label: 'Store URL',
        placeholder: 'https://shop.example.com',
      },
      { key: 'consumerKey', label: 'Consumer key', secret: true },
      { key: 'consumerSecret', label: 'Consumer secret', secret: true },
    ],
    recordsUnit: 'records',
  },
  // ── Payments ──────────────────────────────────────────────────────────
  {
    key: 'stripe',
    name: 'Stripe',
    initials: 'ST',
    category: 'Payments',
    benefit: 'Import card charges, refunds and payouts',
    direction: 'Inbound',
    modules: ['Integrations'],
    permissions: 'Read charges, refunds and payouts (read-only)',
    source: integ(IntegrationProvider.stripe),
    connectKind: 'oauth',
    envKeys: ['STRIPE_CONNECT_CLIENT_ID', 'STRIPE_SECRET_KEY'],
    recordsUnit: 'transactions',
  },
  {
    key: 'paypal',
    name: 'PayPal',
    initials: 'PP',
    category: 'Payments',
    benefit: 'Import PayPal transactions',
    direction: 'Inbound',
    modules: ['Integrations'],
    permissions: 'Read transactions (read-only)',
    source: integ(IntegrationProvider.paypal),
    connectKind: 'credentials',
    credentialFields: [
      { key: 'clientId', label: 'Client ID' },
      { key: 'clientSecret', label: 'Client secret', secret: true },
    ],
    recordsUnit: 'transactions',
  },
  {
    key: 'square',
    name: 'Square',
    initials: 'SQ',
    category: 'Payments',
    benefit: 'Import Square payments and refunds',
    direction: 'Inbound',
    modules: ['Integrations'],
    permissions: 'Read payments and refunds (read-only)',
    source: integ(IntegrationProvider.square),
    connectKind: 'oauth',
    envKeys: ['SQUARE_CLIENT_ID', 'SQUARE_CLIENT_SECRET'],
    recordsUnit: 'transactions',
  },
  // ── Accounting ────────────────────────────────────────────────────────
  {
    key: 'quickbooks',
    name: 'QuickBooks',
    initials: 'QB',
    category: 'Accounting',
    benefit: 'Post completed sales as invoices',
    direction: 'Outbound',
    modules: ['Orders'],
    permissions: 'Access your QuickBooks accounting data (com.intuit.quickbooks.accounting) — Noxtill only creates invoices',
    source: integ(IntegrationProvider.quickbooks),
    connectKind: 'oauth',
    envKeys: ['QUICKBOOKS_CLIENT_ID', 'QUICKBOOKS_CLIENT_SECRET'],
    recordsUnit: 'invoices',
  },
  {
    key: 'xero',
    name: 'Xero',
    initials: 'XE',
    category: 'Accounting',
    benefit: 'Post completed sales as invoices',
    direction: 'Outbound',
    modules: ['Orders'],
    permissions: 'Read and write transactions and contacts (accounting.transactions, accounting.contacts) — Noxtill only creates invoices and contacts',
    source: integ(IntegrationProvider.xero),
    connectKind: 'oauth',
    envKeys: ['XERO_CLIENT_ID', 'XERO_CLIENT_SECRET'],
    recordsUnit: 'invoices',
  },
  // ── Marketing ─────────────────────────────────────────────────────────
  {
    key: 'mailchimp',
    name: 'Mailchimp',
    initials: 'MC',
    category: 'Marketing',
    benefit: 'Sync customers to a Mailchimp audience',
    direction: 'Outbound',
    modules: ['Customers', 'Marketing'],
    permissions: 'Write audience members',
    source: integ(IntegrationProvider.mailchimp),
    connectKind: 'oauth',
    envKeys: ['MAILCHIMP_CLIENT_ID', 'MAILCHIMP_CLIENT_SECRET'],
    recordsUnit: 'contacts',
  },
  {
    key: 'klaviyo',
    name: 'Klaviyo',
    initials: 'KL',
    category: 'Marketing',
    benefit: 'Sync customers to Klaviyo profiles',
    direction: 'Outbound',
    modules: ['Customers', 'Marketing'],
    permissions: 'Write profiles (private API key)',
    source: integ(IntegrationProvider.klaviyo),
    connectKind: 'credentials',
    credentialFields: [
      { key: 'privateApiKey', label: 'Private API key', secret: true },
    ],
    recordsUnit: 'profiles',
  },
  {
    key: 'email',
    name: 'Email marketing',
    initials: 'EM',
    category: 'Marketing',
    benefit: 'Send campaigns from Noxtill',
    direction: 'Outbound',
    modules: ['Marketing'],
    permissions: 'Send email through the shared Noxtill account',
    source: integ(IntegrationProvider.email),
    connectKind: 'channel',
    workspaceHref: '/marketing/email',
    recordsUnit: 'campaigns',
  },
  // ── Automation ────────────────────────────────────────────────────────
  ...(
    [
      [
        IntegrationProvider.zapier,
        'Zapier',
        'ZP',
        'Connect Noxtill to 6,000+ apps',
      ],
      [IntegrationProvider.make, 'Make', 'MK', 'Visual scenario automation'],
      [IntegrationProvider.n8n, 'n8n', 'N8', 'Self-hosted workflow automation'],
    ] as Array<[IntegrationProvider, string, string, string]>
  ).map(([provider, name, initials, benefit]): HubProviderDef => ({
    key: provider,
    name,
    initials,
    category: 'Automation',
    benefit,
    direction: 'Outbound',
    modules: [
      'Orders',
      'Bookings',
      'Reviews',
      'Inventory',
      'Credit',
      'Customers',
    ],
    permissions: 'Receive signed events for the triggers you subscribe to',
    source: integ(provider),
    connectKind: 'automation',
    recordsUnit: 'automations',
  })),
  // ── Communication ─────────────────────────────────────────────────────
  {
    key: 'slack',
    name: 'Slack',
    initials: 'SL',
    category: 'Communication',
    benefit: 'Send business alerts to a channel',
    direction: 'Outbound',
    modules: ['Orders', 'Bookings', 'Inventory', 'Reviews', 'Credit'],
    permissions: 'Post messages to the channel you choose',
    source: integ(IntegrationProvider.slack),
    connectKind: 'oauth',
    envKeys: ['SLACK_CLIENT_ID', 'SLACK_CLIENT_SECRET'],
    recordsUnit: 'messages',
  },
  {
    key: 'zoom',
    name: 'Zoom',
    initials: 'ZM',
    category: 'Communication',
    benefit: 'Create a meeting link for each booking',
    direction: 'Outbound',
    modules: ['Bookings'],
    permissions: 'Create meetings',
    source: integ(IntegrationProvider.zoom),
    connectKind: 'oauth',
    envKeys: ['ZOOM_CLIENT_ID', 'ZOOM_CLIENT_SECRET'],
    recordsUnit: 'meetings',
  },
  // ── Developer ─────────────────────────────────────────────────────────
  {
    key: 'rest_api',
    name: 'REST API',
    initials: 'AP',
    category: 'Developer',
    benefit: 'Build directly against Noxtill',
    direction: 'Two-way',
    modules: ['Every module by scope'],
    permissions: 'Scoped read and write per API key',
    source: { type: 'virtual', kind: 'rest_api' },
    connectKind: 'developer',
    recordsUnit: 'requests',
  },
  {
    key: 'webhooks',
    name: 'Webhooks',
    initials: 'WH',
    category: 'Developer',
    benefit: 'Push Noxtill events to your endpoint',
    direction: 'Outbound',
    modules: ['Every module by event'],
    permissions: 'Write events to your endpoints',
    source: { type: 'virtual', kind: 'webhooks' },
    connectKind: 'developer',
    recordsUnit: 'deliveries',
  },
];

export function catalogByKey(key: string): HubProviderDef | undefined {
  return HUB_CATALOG.find((p) => p.key === key);
}

const LISTING_SYNC = 'Runs on your Business Listings auto-sync schedule, and on Sync now.';
const ADS_SYNC = 'Campaign stats refresh hourly for campaigns created in Noxtill, and on Sync now.';
const BOOKING_SYNC = 'New and changed bookings are mirrored every 5 minutes, and on Sync now.';

/** When a provider's data moves — one honest sentence per provider, matching the code that runs it. */
export function syncInfoOf(def: HubProviderDef): { mode: HubSyncMode; note: string } {
  switch (def.key) {
    case 'google_calendar':
    case 'outlook':
      return { mode: 'scheduled', note: BOOKING_SYNC };
    case 'zoom':
      return { mode: 'scheduled', note: 'Meeting links are created for new bookings every 5 minutes, and on Sync now.' };
    case 'whatsapp':
      return { mode: 'event', note: 'Sends messages as they are triggered - nothing is sent until then.' };
    case 'slack':
      return { mode: 'event', note: 'Posts real events to your channel as they happen - nothing is sent until then.' };
    case 'email':
      return { mode: 'event', note: 'Sends the campaigns you create - nothing is sent until then.' };
    case 'rest_api':
      return { mode: 'event', note: 'Answers requests made with your API keys.' };
    case 'webhooks':
      return { mode: 'event', note: 'Delivers events to your endpoints as they fire.' };
    default:
  }
  if (def.category === 'Listings' || ['gmb', 'bing_places'].includes(def.key)) return { mode: 'scheduled', note: LISTING_SYNC };
  if (def.category === 'Advertising' || ['google_ads', 'meta_ads', 'microsoft_ads'].includes(def.key)) return { mode: 'scheduled', note: ADS_SYNC };
  if (def.connectKind === 'automation') return { mode: 'event', note: 'Delivers events to your automation as they fire.' };
  if (def.connectKind === 'social' || def.connectKind === 'social-token') {
    return { mode: 'event', note: 'Receives messages as they arrive and sends replies when you reply.' };
  }
  return { mode: 'manual', note: 'Runs only when you start a sync - the first sync does not run automatically.' };
}
