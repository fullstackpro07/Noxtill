export type ConnectorKey =
  | "email"
  | "gmb"
  | "google_ads"
  | "merchant_center"
  | "meta_ads"
  | "tiktok_ads"
  | "bing_places"
  | "apple_business_connect"
  | "yelp";
export type ConnectorStatus = "not_connected" | "connected" | "needs_attention";

export interface Connector {
  key: ConnectorKey;
  name: string;
  description: string;
  status: ConnectorStatus;
  href: string;
}

/** Mock connector roster — real OAuth + token lifecycle is BE-082, live wiring is INT-013. */
export const CONNECTORS: Connector[] = [
  { key: "email", name: "Email Marketing", description: "Segment campaigns, templates, and list health.", status: "connected", href: "/integrations/email" },
  { key: "gmb", name: "Google My Business", description: "Profile health, posts, photos, and Q&A.", status: "needs_attention", href: "/integrations/gmb" },
  { key: "google_ads", name: "Google Ads", description: "Smart campaigns with a live spend forecast.", status: "connected", href: "/integrations/google-ads" },
  { key: "merchant_center", name: "Google Merchant Center", description: "Product feed built from your catalog.", status: "not_connected", href: "/integrations/merchant-center" },
  { key: "meta_ads", name: "Meta Ads", description: "Facebook & Instagram, including review-to-ad.", status: "connected", href: "/integrations/meta-ads" },
  { key: "tiktok_ads", name: "TikTok Ads", description: "Slideshow creatives from your product photos.", status: "not_connected", href: "/integrations/tiktok-ads" },
  { key: "bing_places", name: "Bing Places", description: "Keep your listing in sync on Bing Maps and search.", status: "not_connected", href: "/listings" },
  { key: "apple_business_connect", name: "Apple Business Connect", description: "Keep your listing in sync on Apple Maps.", status: "not_connected", href: "/listings" },
  { key: "yelp", name: "Yelp", description: "Keep your listing in sync on Yelp.", status: "not_connected", href: "/listings" },
];

export const STATUS_LABELS: Record<ConnectorStatus, string> = {
  not_connected: "Not connected",
  connected: "Connected",
  needs_attention: "Needs attention",
};

export function connectorByKey(key: ConnectorKey): Connector | undefined {
  return CONNECTORS.find((c) => c.key === key);
}
