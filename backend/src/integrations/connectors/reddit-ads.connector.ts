import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  Connector,
  CreateCampaignParams,
  CreateCampaignResult,
  OAuthTokens,
} from '../connector.interface';
import { IntegrationProvider } from '@prisma/client';

const AUTHORIZE_URL = 'https://www.reddit.com/api/v1/authorize';
const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const SCOPE = 'adsread adsedit';

interface RedditTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

/**
 * Reddit Ads connector (UPD-BE-069) — a real quirk shared with Pinterest but distinct from most
 * connectors here: the token endpoint authenticates via HTTP Basic Auth
 * (`client_id:client_secret`), and `duration=permanent` must be requested at authorize time or
 * Reddit never issues a `refresh_token` at all.
 */
@Injectable()
export class RedditAdsConnector implements Connector {
  readonly provider = IntegrationProvider.reddit_ads;

  constructor(private readonly config: ConfigService) {}

  private redirectUri(): string {
    const backendUrl =
      this.config.get<string>('BACKEND_URL') ?? 'http://localhost:5000/api/v1';
    return `${backendUrl}/integrations/reddit_ads/callback`;
  }

  private basicAuth() {
    return {
      username: this.config.get<string>('REDDIT_ADS_CLIENT_ID') ?? '',
      password: this.config.get<string>('REDDIT_ADS_CLIENT_SECRET') ?? '',
    };
  }

  authUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.get<string>('REDDIT_ADS_CLIENT_ID') ?? '',
      redirect_uri: this.redirectUri(),
      scope: SCOPE,
      state,
      response_type: 'code',
      duration: 'permanent',
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async handleCallback(code: string): Promise<OAuthTokens> {
    const response = await axios.post<RedditTokenResponse>(
      TOKEN_URL,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri(),
      }),
      { auth: this.basicAuth() },
    );
    return this.mapTokenResponse(response.data);
  }

  async refreshToken(tokens: OAuthTokens): Promise<OAuthTokens> {
    const response = await axios.post<RedditTokenResponse>(
      TOKEN_URL,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken ?? '',
      }),
      { auth: this.basicAuth() },
    );
    return this.mapTokenResponse(response.data);
  }

  /** Lists the real ad accounts the connected user can administer. */
  async sync(tokens: OAuthTokens): Promise<unknown> {
    const response = await axios.get(
      'https://ads-api.reddit.com/api/v3/ad_accounts',
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    return response.data;
  }

  /** `meta.adAccountId` (a real Reddit ad account id, e.g. from a prior `sync()` selection) is required. */
  async createCampaign(
    tokens: OAuthTokens,
    params: CreateCampaignParams,
    meta: Record<string, unknown>,
  ): Promise<CreateCampaignResult> {
    const adAccountId = meta.adAccountId as string | undefined;
    if (!adAccountId) {
      throw new Error('No Reddit ad account selected for this business');
    }
    const response = await axios.post<{ data: { id: string } }>(
      `https://ads-api.reddit.com/api/v3/ad_accounts/${adAccountId}/campaigns`,
      {
        data: {
          name: params.name,
          objective: this.mapGoalToObjective(params.goal),
          configured_status: 'PAUSED',
          spend_cap: Math.round(params.dailyBudget * 100), // Reddit budgets are in cents
        },
      },
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    return { externalId: response.data.data.id };
  }

  async disconnect(): Promise<void> {
    // Real revocation is https://www.reddit.com/api/v1/revoke_token — left as a documented
    // no-op, same reasoning as every other connector's disconnect().
  }

  private mapGoalToObjective(goal: string): string {
    const known: Record<string, string> = {
      traffic: 'TRAFFIC',
      leads: 'LEAD_GENERATION',
      awareness: 'BRAND_AWARENESS',
      engagement: 'ENGAGEMENT',
    };
    return known[goal.toLowerCase()] ?? 'TRAFFIC';
  }

  private mapTokenResponse(data: RedditTokenResponse): OAuthTokens {
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : undefined,
    };
  }
}
