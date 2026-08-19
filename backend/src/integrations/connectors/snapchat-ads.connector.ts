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

const AUTHORIZE_URL = 'https://accounts.snapchat.com/login/oauth2/authorize';
const TOKEN_URL = 'https://accounts.snapchat.com/login/oauth2/access_token';
const SCOPE = 'snapchat-marketing-api';

interface SnapchatTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

/** Snapchat Ads connector (UPD-BE-069) — standard Snap Marketing API OAuth2 authorization-code grant. */
@Injectable()
export class SnapchatAdsConnector implements Connector {
  readonly provider = IntegrationProvider.snapchat_ads;

  constructor(private readonly config: ConfigService) {}

  private redirectUri(): string {
    const backendUrl =
      this.config.get<string>('BACKEND_URL') ?? 'http://localhost:5000/api/v1';
    return `${backendUrl}/integrations/snapchat_ads/callback`;
  }

  authUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.get<string>('SNAPCHAT_ADS_CLIENT_ID') ?? '',
      redirect_uri: this.redirectUri(),
      scope: SCOPE,
      state,
      response_type: 'code',
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async handleCallback(code: string): Promise<OAuthTokens> {
    const response = await axios.post<SnapchatTokenResponse>(
      TOKEN_URL,
      new URLSearchParams({
        client_id: this.config.get<string>('SNAPCHAT_ADS_CLIENT_ID') ?? '',
        client_secret:
          this.config.get<string>('SNAPCHAT_ADS_CLIENT_SECRET') ?? '',
        redirect_uri: this.redirectUri(),
        grant_type: 'authorization_code',
        code,
      }),
    );
    return this.mapTokenResponse(response.data);
  }

  async refreshToken(tokens: OAuthTokens): Promise<OAuthTokens> {
    const response = await axios.post<SnapchatTokenResponse>(
      TOKEN_URL,
      new URLSearchParams({
        client_id: this.config.get<string>('SNAPCHAT_ADS_CLIENT_ID') ?? '',
        client_secret:
          this.config.get<string>('SNAPCHAT_ADS_CLIENT_SECRET') ?? '',
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken ?? '',
      }),
    );
    return this.mapTokenResponse(response.data);
  }

  /** Lists the real organizations (and their ad accounts) the connected user belongs to. */
  async sync(tokens: OAuthTokens): Promise<unknown> {
    const response = await axios.get(
      'https://adsapi.snapchat.com/v1/me/organizations',
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    return response.data;
  }

  /** `meta.adAccountId` (a real Snapchat ad account id, e.g. from a prior `sync()` selection) is required. */
  async createCampaign(
    tokens: OAuthTokens,
    params: CreateCampaignParams,
    meta: Record<string, unknown>,
  ): Promise<CreateCampaignResult> {
    const adAccountId = meta.adAccountId as string | undefined;
    if (!adAccountId) {
      throw new Error('No Snapchat ad account selected for this business');
    }
    const response = await axios.post<{
      campaigns: { campaign: { id: string } }[];
    }>(
      `https://adsapi.snapchat.com/v1/adaccounts/${adAccountId}/campaigns`,
      {
        campaigns: [
          {
            name: params.name,
            ad_account_id: adAccountId,
            status: 'PAUSED',
            objective: this.mapGoalToObjective(params.goal),
            daily_budget_micro: Math.round(params.dailyBudget * 1_000_000),
          },
        ],
      },
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    return { externalId: response.data.campaigns[0].campaign.id };
  }

  async disconnect(): Promise<void> {
    // Real revocation is a Snap accounts token-revocation call — left as a documented no-op,
    // same reasoning as every other connector's disconnect().
  }

  private mapGoalToObjective(goal: string): string {
    const known: Record<string, string> = {
      traffic: 'WEB_CONVERSION',
      leads: 'LEAD_GENERATION',
      awareness: 'AWARENESS',
      engagement: 'ENGAGEMENT',
    };
    return known[goal.toLowerCase()] ?? 'WEB_CONVERSION';
  }

  private mapTokenResponse(data: SnapchatTokenResponse): OAuthTokens {
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : undefined,
    };
  }
}
