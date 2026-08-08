import { ConfigService } from '@nestjs/config';
import { GoogleOAuth2Connector } from './google-oauth2.connector';
import { OAuthTokens } from '../connector.interface';
export declare class MerchantCenterConnector extends GoogleOAuth2Connector {
    readonly provider: "merchant";
    protected readonly scope = "https://www.googleapis.com/auth/content";
    constructor(config: ConfigService);
    sync(tokens: OAuthTokens): Promise<unknown>;
}
