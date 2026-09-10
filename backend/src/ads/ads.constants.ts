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

/** Advertising Settings (UPD-BE-131) — the real hourly auto-pause enforcement job's queue. */
export const AD_AUTO_PAUSE_QUEUE = 'ad-auto-pause';

/**
 * Fatigue-warning depth fix — the real hourly stats-refresh job's queue. Covers 7/9 platforms:
 * Microsoft Ads and Amazon Ads' real reporting APIs are asynchronous multi-step report-generation
 * + file-download flows (not a single request/response call like the other 7), which a single
 * hourly tick can't reliably complete — a disclosed, narrow gap, not a fabricated stats feed for
 * them. Their campaign create/pause/resume/budget-adjust paths are unaffected.
 */
export const AD_STATS_SYNC_QUEUE = 'ad-stats-sync';

/** How many trailing days of real snapshots `computeFatigueWarning` looks back across. */
export const FATIGUE_LOOKBACK_DAYS = 7;
