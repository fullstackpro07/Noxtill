export const SOCIAL_ERROR_CODES = {
  NOT_TOKEN_BASED: 'SOCIAL_NOT_TOKEN_BASED',
  INVALID_CREDENTIAL: 'SOCIAL_INVALID_CREDENTIAL',
  INVALID_OAUTH_STATE: 'SOCIAL_INVALID_OAUTH_STATE',
  ACCOUNT_NOT_CONNECTED: 'SOCIAL_ACCOUNT_NOT_CONNECTED',
  POST_NOT_FOUND: 'SOCIAL_POST_NOT_FOUND',
  POST_ALREADY_PUBLISHED: 'SOCIAL_POST_ALREADY_PUBLISHED',
  INBOX_ITEM_NOT_FOUND: 'SOCIAL_INBOX_ITEM_NOT_FOUND',
  MEDIA_ASSET_NOT_FOUND: 'SOCIAL_MEDIA_ASSET_NOT_FOUND',
  TARGET_NOT_FOUND: 'SOCIAL_TARGET_NOT_FOUND',
  TARGET_NOT_FAILED: 'SOCIAL_TARGET_NOT_FAILED',
  BOOST_UNSUPPORTED_PLATFORM: 'SOCIAL_BOOST_UNSUPPORTED_PLATFORM',
  BOOST_TARGET_NOT_PUBLISHED: 'SOCIAL_BOOST_TARGET_NOT_PUBLISHED',
  POST_NOT_EDITABLE: 'SOCIAL_POST_NOT_EDITABLE',
} as const;

/**
 * Published Posts, "Boost as ad" handoff (UPD-BE-127) — maps a social platform to its real ad
 * counterpart in `IntegrationProvider`. Only the 7 platforms with a real, existing ad-platform
 * connector (see `src/integrations/connector-registry.ts`) can be boosted; the other 8 social
 * platforms (youtube, threads, tumblr, telegram, discord, wechat, line — plus twitter, which has
 * no ad-platform connector in this codebase either) have no real handoff target, a disclosed gap.
 */
export const BOOST_PROVIDER_MAP: Partial<Record<string, string>> = {
  facebook: 'meta_ads',
  instagram: 'meta_ads',
  tiktok: 'tiktok_ads',
  linkedin: 'linkedin_ads',
  pinterest: 'pinterest_ads',
  snapchat: 'snapchat_ads',
  reddit: 'reddit_ads',
};

export const SOCIAL_PUBLISH_QUEUE = 'social-post-publish';
export const SOCIAL_ANALYTICS_QUEUE = 'social-analytics-pull';
export const SOCIAL_WEBHOOK_QUEUE = 'social-webhook-events';

/**
 * Platforms sharing Meta's webhook envelope (`entry[].changes[]`/`entry[].messaging[]`) and
 * `X-Hub-Signature-256` HMAC scheme. The other 12 platforms' native raw webhook formats aren't
 * individually parsed by this ticket — `SocialWebhookController` accepts an already-normalized
 * payload shape for them instead, a disclosed scope simplification.
 */
export const META_FAMILY_PLATFORMS = [
  'facebook',
  'instagram',
  'threads',
] as const;
