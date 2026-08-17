import { ConfigService } from '@nestjs/config';
import { Connector, MasterListingData, OAuthTokens } from '../connector.interface';
export declare class AppleBusinessConnectConnector implements Connector {
    private readonly config;
    readonly provider: "apple_business_connect";
    constructor(config: ConfigService);
    authUrl(): null;
    handleCallback(): Promise<OAuthTokens>;
    refreshToken(tokens: OAuthTokens): Promise<OAuthTokens>;
    sync(tokens: OAuthTokens): Promise<unknown>;
    pushListing(tokens: OAuthTokens, listing: MasterListingData, meta: Record<string, unknown>): Promise<unknown>;
    disconnect(): Promise<void>;
    private apiKey;
}
