import { ConfigService } from '@nestjs/config';
import { GoogleOAuth2Connector } from './google-oauth2.connector';
import { MasterListingData, OAuthTokens } from '../connector.interface';
export declare class GmbConnector extends GoogleOAuth2Connector {
    readonly provider: "gmb";
    protected readonly scope = "https://www.googleapis.com/auth/business.manage";
    constructor(config: ConfigService);
    sync(tokens: OAuthTokens): Promise<unknown>;
    listLocations(tokens: OAuthTokens, accountName: string): Promise<unknown>;
    pushListing(tokens: OAuthTokens, listing: MasterListingData, meta: Record<string, unknown>): Promise<unknown>;
}
