export const MARKETING_ERROR_CODES = {
  QUOTA_EXCEEDED: 'CAMPAIGN_QUOTA_EXCEEDED',
  EMPTY_SEGMENT: 'CAMPAIGN_EMPTY_SEGMENT',
  CAMPAIGN_NOT_FOUND: 'CAMPAIGN_NOT_FOUND',
  COMPETITOR_LIMIT_REACHED: 'COMPETITOR_LIMIT_REACHED',
  COMPETITOR_NOT_FOUND: 'COMPETITOR_NOT_FOUND',
  KEYWORD_LIMIT_REACHED: 'KEYWORD_LIMIT_REACHED',
  KEYWORD_ALREADY_TRACKED: 'KEYWORD_ALREADY_TRACKED',
} as const;

/** Every marketing campaign renders through this single pass-through template (body is the owner's own text). */
export const CAMPAIGN_TEMPLATE_KEY = 'campaign';

export const MAX_COMPETITORS = 5;

export const COMPETITOR_SNAPSHOT_QUEUE = 'competitor-snapshot';

export const MAX_TRACKED_KEYWORDS = 10;

export const KEYWORD_RANK_QUEUE = 'keyword-rank-check';
