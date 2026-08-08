import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Connector, OAuthTokens } from '../connector.interface';
import { IntegrationProvider } from '../../../generated/prisma';

const AUTHORIZE_URL = 'https://business-api.tiktok.com/portal/auth';
const TOKEN_URL = 'https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/';

interface TikTokTokenEnvelope {
  code: number;
  message: string;
  data: { access_token: string; advertiser_ids: string[]; scope: number[] };
}

/**
 * TikTok Ads connector (BE-088) — genuinely different API shape from every other connector here:
 * JSON POST bodies (not form-urlencoded), an `app_id`/`secret`/`auth_code` field naming
 * convention instead of the standard `client_id`/`client_secret`/`code`, and every response
 * wrapped in a `{code, message, data}` envelope rather than a bare OAuth2 token response. Access
 * tokens are long-lived with no `refresh_token` grant in TikTok's Marketing API, unlike Google/Meta.
 */
@Injectable()
export class TikTokAdsConnector implements Connector {
  readonly provider = IntegrationProvider.tiktok_ads;

  constructor(private readonly config: ConfigService) {}

  private redirectUri(): string {
    const backendUrl = this.config.get<string>('BACKEND_URL') ?? 'http://localhost:5000/api/v1';
    return `${backendUrl}/integrations/tiktok_ads/callback`;
  }

  authUrl(state: string): string {
    const params = new URLSearchParams({
      app_id: this.config.get<string>('TIKTOK_ADS_APP_ID') ?? '',
      redirect_uri: this.redirectUri(),
      state,
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async handleCallback(code: string): Promise<OAuthTokens> {
    const response = await axios.post<TikTokTokenEnvelope>(TOKEN_URL, {
      app_id: this.config.get<string>('TIKTOK_ADS_APP_ID') ?? '',
      secret: this.config.get<string>('TIKTOK_ADS_APP_SECRET') ?? '',
      auth_code: code,
      grant_type: 'authorization_code',
    });
    return { accessToken: response.data.data.access_token };
  }

  /** TikTok's Marketing API access tokens are long-lived with no refresh grant — a no-op by design, not a shortcut. */
  async refreshToken(tokens: OAuthTokens): Promise<OAuthTokens> {
    return tokens;
  }

  async sync(tokens: OAuthTokens): Promise<unknown> {
    const response = await axios.get<TikTokTokenEnvelope>(
      'https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/',
      {
        headers: { 'Access-Token': tokens.accessToken },
        params: {
          app_id: this.config.get<string>('TIKTOK_ADS_APP_ID') ?? '',
          secret: this.config.get<string>('TIKTOK_ADS_APP_SECRET') ?? '',
        },
      },
    );
    return response.data;
  }

  async disconnect(): Promise<void> {
    // TikTok's Marketing API has no token-revocation endpoint — clearing the stored token
    // (handled by IntegrationsService) is the only real action available here.
  }
}
