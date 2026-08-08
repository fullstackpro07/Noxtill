import { IntegrationProvider } from '../../generated/prisma';

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
}

/**
 * Connector interface (BE-082) — every provider (OAuth-based or not) implements this.
 * `authUrl` returning `null` signals a non-OAuth provider (Email): `IntegrationsService.connect`
 * branches on this to skip the redirect entirely and connect directly.
 */
export interface Connector {
  provider: IntegrationProvider;
  authUrl(state: string): string | null;
  handleCallback(code: string): Promise<OAuthTokens>;
  refreshToken(tokens: OAuthTokens): Promise<OAuthTokens>;
  /** A minimal real API call proving the connection works (e.g. "list accessible accounts"). */
  sync(tokens: OAuthTokens): Promise<unknown>;
  disconnect(): Promise<void>;
}
