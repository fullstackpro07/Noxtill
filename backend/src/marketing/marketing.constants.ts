export const MARKETING_ERROR_CODES = {
  QUOTA_EXCEEDED: 'CAMPAIGN_QUOTA_EXCEEDED',
  EMPTY_SEGMENT: 'CAMPAIGN_EMPTY_SEGMENT',
  CAMPAIGN_NOT_FOUND: 'CAMPAIGN_NOT_FOUND',
  COMPETITOR_LIMIT_REACHED: 'COMPETITOR_LIMIT_REACHED',
  COMPETITOR_NOT_FOUND: 'COMPETITOR_NOT_FOUND',
  KEYWORD_LIMIT_REACHED: 'KEYWORD_LIMIT_REACHED',
  KEYWORD_ALREADY_TRACKED: 'KEYWORD_ALREADY_TRACKED',
  KEYWORD_NOT_FOUND: 'KEYWORD_NOT_FOUND',
  KEYWORD_UPDATE_EMPTY: 'KEYWORD_UPDATE_EMPTY',
  SERP_PROVIDER_NOT_CONFIGURED: 'SERP_PROVIDER_NOT_CONFIGURED',
  SERP_PROVIDER_UNAVAILABLE: 'SERP_PROVIDER_UNAVAILABLE',
  SEO_SITE_NOT_CONFIGURED: 'SEO_SITE_NOT_CONFIGURED',
  SEO_SITE_URL_INVALID: 'SEO_SITE_URL_INVALID',
} as const;

/** Every marketing campaign renders through this single pass-through template (body is the owner's own text). */
export const CAMPAIGN_TEMPLATE_KEY = 'campaign';

export const MAX_COMPETITORS = 5;

/** How closely the owner watches a competitor (Competitive Insights). */
export const COMPETITOR_PRIORITIES = [
  'watch_closely',
  'keep_an_eye',
  'background',
] as const;

/** What an owner can record about a competitor by hand (`CompetitorObservation.kind`). */
export const COMPETITOR_OBSERVATION_KINDS = [
  'price',
  'service',
  'offer',
] as const;

export const COMPETITOR_SNAPSHOT_QUEUE = 'competitor-snapshot';

export const MAX_TRACKED_KEYWORDS = 10;

export const KEYWORD_RANK_QUEUE = 'keyword-rank-check';

export const SEO_AUDIT_QUEUE = 'seo-audit-schedule';
