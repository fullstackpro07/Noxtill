import { TokenBasedConnector } from './token-based.connector';
import { SocialAccountInfo, SocialInboxFetchItem, SocialInboxReplyTarget, SocialInsights, SocialOAuthTokens, SocialPublishPayload, SocialPublishResult } from './social-connector.interface';
export declare class LineConnector extends TokenBasedConnector {
    readonly platform: "line";
    protected verifyToken(token: string): Promise<SocialAccountInfo>;
    publish(tokens: SocialOAuthTokens, post: SocialPublishPayload, meta: Record<string, unknown>): Promise<SocialPublishResult>;
    fetchInbox(tokens: SocialOAuthTokens, meta: Record<string, unknown>): Promise<SocialInboxFetchItem[]>;
    replyToInboxItem(tokens: SocialOAuthTokens, target: SocialInboxReplyTarget, text: string): Promise<void>;
    fetchInsights(tokens: SocialOAuthTokens, meta: Record<string, unknown>): Promise<SocialInsights>;
}
