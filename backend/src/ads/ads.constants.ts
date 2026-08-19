import { IntegrationProvider } from '@prisma/client';

/** Every `IntegrationProvider` that is an ad platform — single source of truth, also used by `MarketingOverviewService`. */
export const AD_PROVIDERS: IntegrationProvider[] = [
  IntegrationProvider.google_ads,
  IntegrationProvider.meta_ads,
  IntegrationProvider.tiktok_ads,
  IntegrationProvider.linkedin_ads,
  IntegrationProvider.pinterest_ads,
  IntegrationProvider.snapchat_ads,
  IntegrationProvider.microsoft_ads,
  IntegrationProvider.amazon_ads,
  IntegrationProvider.reddit_ads,
];

export const AD_ERROR_CODES = {
  UNKNOWN_PROVIDER: 'AD_UNKNOWN_PROVIDER',
  CAMPAIGN_NOT_FOUND: 'AD_CAMPAIGN_NOT_FOUND',
  CREATIVE_NOT_FOUND: 'AD_CREATIVE_NOT_FOUND',
  AUDIENCE_NOT_FOUND: 'AD_AUDIENCE_NOT_FOUND',
  REVIEW_NOT_FOUND: 'AD_SOURCE_REVIEW_NOT_FOUND',
  UNKNOWN_SEGMENT: 'AD_UNKNOWN_SEGMENT',
} as const;

/** Real campaign stats shape (`AdCampaign.stats`) — `results` is the field `MarketingOverviewService` already reads; the rest are additive, not a breaking change to that existing shape. */
export interface AdCampaignStats {
  spend?: number;
  impressions?: number;
  clicks?: number;
  results?: number;
}
