/** Curated overrides for names naive title-casing gets wrong; everything else falls back to a generic title-case of the raw provider/platform string. */
const OVERRIDES: Record<string, string> = {
  gmb: "Google My Business",
  merchant: "Google Merchant Center",
  google_ads: "Google Ads",
  meta_ads: "Meta Ads",
  tiktok_ads: "TikTok Ads",
  tiktok: "TikTok",
  linkedin_ads: "LinkedIn Ads",
  linkedin: "LinkedIn",
  pinterest_ads: "Pinterest Ads",
  snapchat_ads: "Snapchat Ads",
  microsoft_ads: "Microsoft Advertising",
  amazon_ads: "Amazon Ads",
  reddit_ads: "Reddit Ads",
  bing_places: "Bing Places",
  apple_business_connect: "Apple Business Connect",
  quickbooks: "QuickBooks",
  woocommerce: "WooCommerce",
  n8n: "n8n",
  youtube: "YouTube",
  wechat: "WeChat",
};

/** A readable display name for any real `IntegrationProvider`/`SocialPlatform` string, without needing to hand-map every value. */
export function providerLabel(provider: string): string {
  if (OVERRIDES[provider]) return OVERRIDES[provider];
  return provider
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export const CATEGORY_LABELS: Record<string, string> = {
  ads: "Advertising",
  directories: "Business Listings",
  social: "Social Media",
  accounting: "Accounting",
  ecommerce: "E-commerce",
  automation: "Automation Platforms",
  other: "Other",
};
