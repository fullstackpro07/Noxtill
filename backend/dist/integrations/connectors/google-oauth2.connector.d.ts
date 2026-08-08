import { ConfigService } from '@nestjs/config';
import { Connector, OAuthTokens } from '../connector.interface';
import { IntegrationProvider } from '../../../generated/prisma';
export declare abstract class GoogleOAuth2Connector implements Connector {
    protected readonly config: ConfigService;
    abstract readonly provider: IntegrationProvider;
    protected abstract readonly scope: string;
    constructor(config: ConfigService);
    protected redirectUri(): string;
    authUrl(state: string): string;
    handleCallback(code: string): Promise<OAuthTokens>;
    refreshToken(tokens: OAuthTokens): Promise<OAuthTokens>;
    abstract sync(tokens: OAuthTokens): Promise<unknown>;
    disconnect(): Promise<void>;
    private mapTokenResponse;
}
