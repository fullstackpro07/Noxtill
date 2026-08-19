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

const AUTHORIZE_URL = 'https://www.pinterest.com/oauth/';
const TOKEN_URL = 'https://api.pinterest.com/v5/oauth/token';
const SCOPE = 'ads:read,ads:write';

interface PinterestTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

/**
 * Pinterest Ads connector (UPD-BE-069) — a real quirk distinct from most connectors here:
 * Pinterest's v5 token endpoint authenticates the client via an HTTP Basic Auth header
 * (`client_id:client_secret`), not `client_id`/`client_secret` form fields.
 */
@Injectable()
export class PinterestAdsConnector implements Connector {
  readonly provider = IntegrationProvider.pinterest_ads;

  constructor(private readonly config: ConfigService) {}

  private redirectUri(): string {
    const backendUrl =
      this.config.get<string>('BACKEND_URL') ?? 'http://localhost:5000/api/v1';
    return `${backendUrl}/integrations/pinterest_ads/callback`;
  }

  private basicAuth() {
    return {
      username: this.config.get<string>('PINTEREST_ADS_CLIENT_ID') ?? '',
      password: this.config.get<string>('PINTEREST_ADS_CLIENT_SECRET') ?? '',
    };
  }

  authUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.get<string>('PINTEREST_ADS_CLIENT_ID') ?? '',
      redirect_uri: this.redirectUri(),
      scope: SCOPE,
      state,
      response_type: 'code',
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async handleCallback(code: string): Promise<OAuthTokens> {
    const response = await axios.post<PinterestTokenResponse>(
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
    const response = await axios.post<PinterestTokenResponse>(
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
      'https://api.pinterest.com/v5/ad_accounts',
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    return response.data;
  }

  /** `meta.adAccountId` (a real Pinterest ad account id, e.g. from a prior `sync()` selection) is required. */
  async createCampaign(
    tokens: OAuthTokens,
    params: CreateCampaignParams,
    meta: Record<string, unknown>,
  ): Promise<CreateCampaignResult> {
    const adAccountId = meta.adAccountId as string | undefined;
    if (!adAccountId) {
      throw new Error('No Pinterest ad account selected for this business');
    }
    const response = await axios.post<{ id: string }>(
      `https://api.pinterest.com/v5/ad_accounts/${adAccountId}/campaigns`,
      {
        name: params.name,
        objective_type: this.mapGoalToObjective(params.goal),
        status: 'PAUSED',
        daily_spend_cap: Math.round(params.dailyBudget * 1_000_000), // Pinterest uses micro-currency units
      },
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    return { externalId: response.data.id };
  }

  async disconnect(): Promise<void> {
    // Real revocation is a Pinterest token-revocation call — left as a documented no-op, same
    // reasoning as every other connector's disconnect().
  }

  private mapGoalToObjective(goal: string): string {
    const known: Record<string, string> = {
      traffic: 'WEB_CONVERSION',
      leads: 'WEB_CONVERSION',
      awareness: 'AWARENESS',
      engagement: 'CONSIDERATION',
    };
    return known[goal.toLowerCase()] ?? 'CONSIDERATION';
  }

  private mapTokenResponse(data: PinterestTokenResponse): OAuthTokens {
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : undefined,
    };
  }
}
