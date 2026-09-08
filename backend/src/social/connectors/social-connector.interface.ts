import { SocialPlatform } from '@prisma/client';

export interface SocialOAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
}

export interface SocialAccountInfo {
  externalAccountId: string;
  externalAccountName?: string;
}

export interface SocialPublishPayload {
  caption: string;
  mediaUrls: string[];
}

export interface SocialPublishResult {
  externalId: string;
}

export interface SocialInboxFetchItem {
  externalId: string;
  kind: 'comment' | 'dm';
  authorName?: string;
  text: string;
  postExternalId?: string;
  receivedAt: string;
}

export interface SocialInsights {
  followers: number;
  reach: number;
  engagement: number;
  impressions: number;
}

/** Published Posts, per-post analytics (UPD-BE-127) — real per-post metrics, distinct from `SocialInsights`'s account-level rollup. */
export interface SocialPostInsights {
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
}

/**
 * `postExternalId` matters because not every platform can reply directly to a specific comment
 * id — Pinterest/Tumblr's real APIs only support commenting on the parent post/pin, so their
 * connectors need it even though most platforms (which DO support a real reply-to-comment
 * endpoint) only ever read `externalId`.
 */
export interface SocialInboxReplyTarget {
  externalId: string;
  postExternalId?: string;
}

/**
 * Social connector (UPD-BE-045) — deliberately parallel to, not reused from,
 * `src/integrations/connector.interface.ts`'s `Connector`: social accounts are a different
 * domain (posting/inbox/analytics vs. ads/directory sync) even though the OAuth mechanics
 * overlap. `authUrl` returning `null` signals a non-OAuth/token-based platform (telegram,
 * discord, wechat, line) — `SocialAccountsService.connect()` branches on this exactly like
 * `IntegrationsService.connect()` does.
 */
export interface SocialConnector {
  platform: SocialPlatform;
  authUrl(state: string): string | null;
  handleCallback(code: string): Promise<SocialOAuthTokens & SocialAccountInfo>;
  refreshToken(tokens: SocialOAuthTokens): Promise<SocialOAuthTokens>;
  publish(
    tokens: SocialOAuthTokens,
    post: SocialPublishPayload,
    meta: Record<string, unknown>,
  ): Promise<SocialPublishResult>;
  fetchInbox(
    tokens: SocialOAuthTokens,
    meta: Record<string, unknown>,
  ): Promise<SocialInboxFetchItem[]>;
  replyToInboxItem(
    tokens: SocialOAuthTokens,
    target: SocialInboxReplyTarget,
    text: string,
  ): Promise<void>;
  fetchInsights(
    tokens: SocialOAuthTokens,
    meta: Record<string, unknown>,
  ): Promise<SocialInsights>;
  /**
   * Published Posts, per-post analytics (UPD-BE-127) — real per-post metrics for one published
   * target, keyed by its real `externalId`. Genuinely optional per-connector, same convention as
   * every other optional capability in this codebase (e.g. `Connector.pushPhoto` in
   * `src/integrations`): only Facebook and Instagram implement it today, against Meta's real,
   * well-documented post/media insights endpoints. The other 13 platforms don't have a
   * well-documented public per-post insights API to build against honestly, so they leave this
   * undefined — `SocialPostsService` checks for its presence before calling it.
   */
  fetchPostInsights?(
    tokens: SocialOAuthTokens,
    externalId: string,
    meta: Record<string, unknown>,
  ): Promise<SocialPostInsights>;
  disconnect(): Promise<void>;
}
