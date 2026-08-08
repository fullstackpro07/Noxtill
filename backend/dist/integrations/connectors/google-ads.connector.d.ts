import { ConfigService } from '@nestjs/config';
import { GoogleOAuth2Connector } from './google-oauth2.connector';
import { OAuthTokens } from '../connector.interface';
export declare class GoogleAdsConnector extends GoogleOAuth2Connector {
    readonly provider: "google_ads";
    protected readonly scope = "https://www.googleapis.com/auth/adwords";
    constructor(config: ConfigService);
    sync(tokens: OAuthTokens): Promise<unknown>;
}
