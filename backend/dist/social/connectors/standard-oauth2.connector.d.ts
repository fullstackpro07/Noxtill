import { ConfigService } from '@nestjs/config';
import { SocialAccountInfo, SocialConnector, SocialInboxReplyTarget, SocialOAuthTokens } from './social-connector.interface';
import { SocialPlatform } from '../../../generated/prisma';
export interface StandardOAuth2Config {
    authorizeUrl: string;
    tokenUrl: string;
    scope: string;
    clientIdEnvKey: string;
    clientSecretEnvKey: string;
    redirectSegment: string;
}
export declare abstract class StandardOAuth2Connector implements SocialConnector {
    protected readonly config: ConfigService;
    abstract readonly platform: SocialPlatform;
    protected abstract readonly oauth: StandardOAuth2Config;
    constructor(config: ConfigService);
    protected redirectUri(): string;
    authUrl(state: string): string;
    handleCallback(code: string): Promise<SocialOAuthTokens & SocialAccountInfo>;
    refreshToken(tokens: SocialOAuthTokens): Promise<SocialOAuthTokens>;
    disconnect(): Promise<void>;
    protected abstract fetchAccountInfo(tokens: SocialOAuthTokens): Promise<SocialAccountInfo>;
    abstract publish(tokens: SocialOAuthTokens, post: {
        caption: string;
        mediaUrls: string[];
    }, meta: Record<string, unknown>): ReturnType<SocialConnector['publish']>;
    abstract fetchInbox(tokens: SocialOAuthTokens, meta: Record<string, unknown>): ReturnType<SocialConnector['fetchInbox']>;
    abstract replyToInboxItem(tokens: SocialOAuthTokens, target: SocialInboxReplyTarget, text: string): Promise<void>;
    abstract fetchInsights(tokens: SocialOAuthTokens, meta: Record<string, unknown>): ReturnType<SocialConnector['fetchInsights']>;
    private mapTokenResponse;
}
