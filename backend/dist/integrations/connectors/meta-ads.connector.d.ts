import { ConfigService } from '@nestjs/config';
import { Connector, OAuthTokens } from '../connector.interface';
export declare class MetaAdsConnector implements Connector {
    private readonly config;
    readonly provider: "meta_ads";
    constructor(config: ConfigService);
    private redirectUri;
    authUrl(state: string): string;
    handleCallback(code: string): Promise<OAuthTokens>;
    refreshToken(tokens: OAuthTokens): Promise<OAuthTokens>;
    sync(tokens: OAuthTokens): Promise<unknown>;
    disconnect(): Promise<void>;
    private mapTokenResponse;
}
