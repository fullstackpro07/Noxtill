import { SocialAccountInfo, SocialConnector, SocialInboxReplyTarget, SocialOAuthTokens } from './social-connector.interface';
import { SocialPlatform } from '../../../generated/prisma';
export declare abstract class TokenBasedConnector implements SocialConnector {
    abstract readonly platform: SocialPlatform;
    authUrl(): null;
    handleCallback(token: string): Promise<SocialOAuthTokens & SocialAccountInfo>;
    refreshToken(tokens: SocialOAuthTokens): Promise<SocialOAuthTokens>;
    disconnect(): Promise<void>;
    protected abstract verifyToken(token: string): Promise<SocialAccountInfo>;
    abstract publish(tokens: SocialOAuthTokens, post: {
        caption: string;
        mediaUrls: string[];
    }, meta: Record<string, unknown>): ReturnType<SocialConnector['publish']>;
    abstract fetchInbox(tokens: SocialOAuthTokens, meta: Record<string, unknown>): ReturnType<SocialConnector['fetchInbox']>;
    abstract replyToInboxItem(tokens: SocialOAuthTokens, target: SocialInboxReplyTarget, text: string): Promise<void>;
    abstract fetchInsights(tokens: SocialOAuthTokens, meta: Record<string, unknown>): ReturnType<SocialConnector['fetchInsights']>;
}
