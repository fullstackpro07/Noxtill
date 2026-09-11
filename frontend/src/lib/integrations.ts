export type ConnectorKey =
  | "email"
  | "gmb"
  | "google_ads"
  | "merchant_center"
  | "meta_ads"
  | "tiktok_ads"
  | "linkedin_ads"
  | "pinterest_ads"
  | "snapchat_ads"
  | "microsoft_ads"
  | "amazon_ads"
  | "reddit_ads"
  | "bing_places"
  | "apple_business_connect"
  | "yelp"
  | "quickbooks"
  | "xero"
  | "shopify"
  | "woocommerce";
export type ConnectorStatus = "not_connected" | "connected" | "needs_attention";

export interface Connector {
  key: ConnectorKey;
  name: string;
  description: string;
  status: ConnectorStatus;
  href: string;
}

/**
 * Connector roster — `status` below is only ever shown as a placeholder before the real
 * `GET /integrations` status loads (`IntegrationsHubView` always overwrites it once that query
 * resolves). Every ad-platform entry's "Manage" link now points at the real Advertising module
 * (`/advertising`) rather than a per-platform page, since that module is the one real, unified
 * place campaigns/creatives/budget for all 9 platforms actually live.
 */
export const CONNECTORS: Connector[] = [
  { key: "email", name: "Email Marketing", description: "Segment campaigns, templates, and list health.", status: "not_connected", href: "/integrations/email" },
  { key: "gmb", name: "Google My Business", description: "Profile health, posts, photos, and Q&A.", status: "not_connected", href: "/integrations/gmb" },
  { key: "google_ads", name: "Google Ads", description: "Smart campaigns with a live spend forecast.", status: "not_connected", href: "/advertising" },
  { key: "merchant_center", name: "Google Merchant Center", description: "Product feed built from your catalog.", status: "not_connected", href: "/integrations/merchant-center" },
  { key: "meta_ads", name: "Meta Ads", description: "Facebook & Instagram, including review-to-ad.", status: "not_connected", href: "/advertising" },
  { key: "tiktok_ads", name: "TikTok Ads", description: "Slideshow creatives from your product photos.", status: "not_connected", href: "/advertising" },
  { key: "linkedin_ads", name: "LinkedIn Ads", description: "B2B campaigns on LinkedIn's sponsored network.", status: "not_connected", href: "/advertising" },
  { key: "pinterest_ads", name: "Pinterest Ads", description: "Shopping and awareness campaigns on Pinterest.", status: "not_connected", href: "/advertising" },
  { key: "snapchat_ads", name: "Snapchat Ads", description: "Reach a younger audience on Snapchat.", status: "not_connected", href: "/advertising" },
  { key: "microsoft_ads", name: "Microsoft Advertising", description: "Search campaigns on Bing and partner sites.", status: "not_connected", href: "/advertising" },
  { key: "amazon_ads", name: "Amazon Ads", description: "Sponsored Products campaigns on Amazon.", status: "not_connected", href: "/advertising" },
  { key: "reddit_ads", name: "Reddit Ads", description: "Community-targeted campaigns on Reddit.", status: "not_connected", href: "/advertising" },
  { key: "bing_places", name: "Bing Places", description: "Keep your listing in sync on Bing Maps and search.", status: "not_connected", href: "/listings" },
  { key: "apple_business_connect", name: "Apple Business Connect", description: "Keep your listing in sync on Apple Maps.", status: "not_connected", href: "/listings" },
  { key: "yelp", name: "Yelp", description: "Keep your listing in sync on Yelp.", status: "not_connected", href: "/listings" },
  { key: "quickbooks", name: "QuickBooks", description: "Push completed orders as real invoices.", status: "not_connected", href: "/integrations/quickbooks" },
  { key: "xero", name: "Xero", description: "Push completed orders as real invoices.", status: "not_connected", href: "/integrations/xero" },
  { key: "shopify", name: "Shopify", description: "Two-way stock sync and online order import.", status: "not_connected", href: "/integrations/shopify" },
  { key: "woocommerce", name: "WooCommerce", description: "Two-way stock sync and online order import.", status: "not_connected", href: "/integrations/woocommerce" },
];

export const STATUS_LABELS: Record<ConnectorStatus, string> = {
  not_connected: "Not connected",
  connected: "Connected",
  needs_attention: "Needs attention",
};

export function connectorByKey(key: ConnectorKey): Connector | undefined {
  return CONNECTORS.find((c) => c.key === key);
}
