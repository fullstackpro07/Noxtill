import { ConfigService } from '@nestjs/config';
import { StandardOAuth2Config, StandardOAuth2Connector } from './standard-oauth2.connector';
import { SocialAccountInfo, SocialInboxFetchItem, SocialInboxReplyTarget, SocialInsights, SocialOAuthTokens, SocialPublishPayload, SocialPublishResult } from './social-connector.interface';
export declare class RedditConnector extends StandardOAuth2Connector {
    readonly platform: "reddit";
    protected readonly oauth: StandardOAuth2Config;
    constructor(config: ConfigService);
    protected fetchAccountInfo(tokens: SocialOAuthTokens): Promise<SocialAccountInfo>;
    publish(tokens: SocialOAuthTokens, post: SocialPublishPayload, meta: Record<string, unknown>): Promise<SocialPublishResult>;
    fetchInbox(tokens: SocialOAuthTokens, meta: Record<string, unknown>): Promise<SocialInboxFetchItem[]>;
    replyToInboxItem(tokens: SocialOAuthTokens, target: SocialInboxReplyTarget, text: string): Promise<void>;
    fetchInsights(tokens: SocialOAuthTokens, meta: Record<string, unknown>): Promise<SocialInsights>;
}
