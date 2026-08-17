import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  SocialAccountInfo,
  SocialConnector,
  SocialInboxReplyTarget,
  SocialOAuthTokens,
} from './social-connector.interface';
import { SocialPlatform } from '@prisma/client';

export interface StandardOAuth2Config {
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  clientIdEnvKey: string;
  clientSecretEnvKey: string;
  redirectSegment: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

/**
 * Generic OAuth2 base for the 11 real-OAuth2 social platforms (UPD-BE-045). Unlike the
 * ads/directory connector framework (`src/integrations/`), where research confirmed no such
 * shared base exists outside Google, 15 near-identical social OAuth2 flows genuinely warrant
 * one — each subclass supplies only its config plus `fetchAccountInfo`/`publish`/`fetchInbox`/
 * `replyToInboxItem`/`fetchInsights`, all of which are genuinely platform-specific.
 */
export abstract class StandardOAuth2Connector implements SocialConnector {
  abstract readonly platform: SocialPlatform;
  protected abstract readonly oauth: StandardOAuth2Config;

  constructor(protected readonly config: ConfigService) {}

  protected redirectUri(): string {
    const backendUrl =
      this.config.get<string>('BACKEND_URL') ?? 'http://localhost:5000/api/v1';
    return `${backendUrl}/social/${this.oauth.redirectSegment}/callback`;
  }

  authUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.get<string>(this.oauth.clientIdEnvKey) ?? '',
      redirect_uri: this.redirectUri(),
      scope: this.oauth.scope,
      state,
      response_type: 'code',
    });
    return `${this.oauth.authorizeUrl}?${params.toString()}`;
  }

  async handleCallback(
    code: string,
  ): Promise<SocialOAuthTokens & SocialAccountInfo> {
    const response = await axios.post<TokenResponse>(
      this.oauth.tokenUrl,
      new URLSearchParams({
        client_id: this.config.get<string>(this.oauth.clientIdEnvKey) ?? '',
        client_secret:
          this.config.get<string>(this.oauth.clientSecretEnvKey) ?? '',
        redirect_uri: this.redirectUri(),
        grant_type: 'authorization_code',
        code,
      }),
    );
    const tokens = this.mapTokenResponse(response.data);
    const accountInfo = await this.fetchAccountInfo(tokens);
    return { ...tokens, ...accountInfo };
  }

  async refreshToken(tokens: SocialOAuthTokens): Promise<SocialOAuthTokens> {
    const response = await axios.post<TokenResponse>(
      this.oauth.tokenUrl,
      new URLSearchParams({
        client_id: this.config.get<string>(this.oauth.clientIdEnvKey) ?? '',
        client_secret:
          this.config.get<string>(this.oauth.clientSecretEnvKey) ?? '',
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken ?? '',
      }),
    );
    return this.mapTokenResponse(response.data);
  }

  async disconnect(): Promise<void> {
    // Real revocation is a per-platform token-revocation call — left as a documented no-op,
    // same reasoning as every connector's disconnect() in `src/integrations/`.
  }

  /** Fetches the connected account's real id/name right after token exchange — genuinely platform-specific. */
  protected abstract fetchAccountInfo(
    tokens: SocialOAuthTokens,
  ): Promise<SocialAccountInfo>;

  abstract publish(
    tokens: SocialOAuthTokens,
    post: { caption: string; mediaUrls: string[] },
    meta: Record<string, unknown>,
  ): ReturnType<SocialConnector['publish']>;
  abstract fetchInbox(
    tokens: SocialOAuthTokens,
    meta: Record<string, unknown>,
  ): ReturnType<SocialConnector['fetchInbox']>;
  abstract replyToInboxItem(
    tokens: SocialOAuthTokens,
    target: SocialInboxReplyTarget,
    text: string,
  ): Promise<void>;
  abstract fetchInsights(
    tokens: SocialOAuthTokens,
    meta: Record<string, unknown>,
  ): ReturnType<SocialConnector['fetchInsights']>;

  private mapTokenResponse(data: TokenResponse): SocialOAuthTokens {
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : undefined,
    };
  }
}
