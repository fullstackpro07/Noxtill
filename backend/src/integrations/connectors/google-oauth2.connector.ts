import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Connector, OAuthTokens } from '../connector.interface';
import { IntegrationProvider } from '../../../generated/prisma';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

/**
 * Shared base for GMB, Google Ads, and Merchant Center (BE-084/085/086) — all three are genuinely
 * the same Google OAuth2 authorization-code-grant endpoint, differing only in requested scope, so
 * one real implementation backs all three rather than 3 near-duplicates.
 */
export abstract class GoogleOAuth2Connector implements Connector {
  abstract readonly provider: IntegrationProvider;
  protected abstract readonly scope: string;

  constructor(protected readonly config: ConfigService) {}

  protected redirectUri(): string {
    const backendUrl =
      this.config.get<string>('BACKEND_URL') ?? 'http://localhost:5000/api/v1';
    return `${backendUrl}/integrations/${this.provider}/callback`;
  }

  authUrl(state: string): string {
    const clientId = this.config.get<string>('GOOGLE_OAUTH_CLIENT_ID') ?? '';
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: this.redirectUri(),
      response_type: 'code',
      scope: this.scope,
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async handleCallback(code: string): Promise<OAuthTokens> {
    const response = await axios.post<GoogleTokenResponse>(
      TOKEN_URL,
      new URLSearchParams({
        client_id: this.config.get<string>('GOOGLE_OAUTH_CLIENT_ID') ?? '',
        client_secret:
          this.config.get<string>('GOOGLE_OAUTH_CLIENT_SECRET') ?? '',
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri(),
      }).toString(),
      { headers: { 'content-type': 'application/x-www-form-urlencoded' } },
    );
    return this.mapTokenResponse(response.data);
  }

  async refreshToken(tokens: OAuthTokens): Promise<OAuthTokens> {
    if (!tokens.refreshToken) {
      throw new Error('No refresh token available for this connection');
    }
    const response = await axios.post<GoogleTokenResponse>(
      TOKEN_URL,
      new URLSearchParams({
        client_id: this.config.get<string>('GOOGLE_OAUTH_CLIENT_ID') ?? '',
        client_secret:
          this.config.get<string>('GOOGLE_OAUTH_CLIENT_SECRET') ?? '',
        refresh_token: tokens.refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
      { headers: { 'content-type': 'application/x-www-form-urlencoded' } },
    );
    return {
      ...this.mapTokenResponse(response.data),
      refreshToken: tokens.refreshToken,
    };
  }

  abstract sync(tokens: OAuthTokens): Promise<unknown>;

  async disconnect(): Promise<void> {
    // Real revocation would POST to https://oauth2.googleapis.com/revoke?token=... — not
    // essential to the connect/disconnect lifecycle IntegrationsService already handles by
    // clearing the stored token, so left as a documented no-op rather than unverifiable code.
  }

  private mapTokenResponse(data: GoogleTokenResponse): OAuthTokens {
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    };
  }
}
