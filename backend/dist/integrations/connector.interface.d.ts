import { IntegrationProvider } from '../../generated/prisma';
export interface OAuthTokens {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: string;
}
export interface Connector {
    provider: IntegrationProvider;
    authUrl(state: string): string | null;
    handleCallback(code: string): Promise<OAuthTokens>;
    refreshToken(tokens: OAuthTokens): Promise<OAuthTokens>;
    sync(tokens: OAuthTokens): Promise<unknown>;
    disconnect(): Promise<void>;
}
