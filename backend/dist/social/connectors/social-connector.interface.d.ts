import { SocialPlatform } from '../../../generated/prisma';
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
export interface SocialInboxReplyTarget {
    externalId: string;
    postExternalId?: string;
}
export interface SocialConnector {
    platform: SocialPlatform;
    authUrl(state: string): string | null;
    handleCallback(code: string): Promise<SocialOAuthTokens & SocialAccountInfo>;
    refreshToken(tokens: SocialOAuthTokens): Promise<SocialOAuthTokens>;
    publish(tokens: SocialOAuthTokens, post: SocialPublishPayload, meta: Record<string, unknown>): Promise<SocialPublishResult>;
    fetchInbox(tokens: SocialOAuthTokens, meta: Record<string, unknown>): Promise<SocialInboxFetchItem[]>;
    replyToInboxItem(tokens: SocialOAuthTokens, target: SocialInboxReplyTarget, text: string): Promise<void>;
    fetchInsights(tokens: SocialOAuthTokens, meta: Record<string, unknown>): Promise<SocialInsights>;
    disconnect(): Promise<void>;
}
