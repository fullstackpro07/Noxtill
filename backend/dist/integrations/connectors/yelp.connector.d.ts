import { ConfigService } from '@nestjs/config';
import { Connector, MasterListingData, OAuthTokens } from '../connector.interface';
export declare class YelpConnector implements Connector {
    private readonly config;
    readonly provider: "yelp";
    constructor(config: ConfigService);
    private redirectUri;
    authUrl(state: string): string;
    handleCallback(code: string): Promise<OAuthTokens>;
    refreshToken(tokens: OAuthTokens): Promise<OAuthTokens>;
    sync(tokens: OAuthTokens): Promise<unknown>;
    pushListing(tokens: OAuthTokens, listing: MasterListingData, meta: Record<string, unknown>): Promise<unknown>;
    disconnect(): Promise<void>;
    private mapTokenResponse;
}
