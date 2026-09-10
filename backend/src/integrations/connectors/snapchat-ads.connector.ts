import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  CampaignStatsResult,
  Connector,
  CreateCampaignParams,
  CreateCampaignResult,
  OAuthTokens,
  UpdateCampaignChanges,
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

  /** Snap's campaign object is addressable by its own id alone — no ad account needed in the URL. */
  async updateCampaign(
    tokens: OAuthTokens,
    externalId: string,
    changes: UpdateCampaignChanges,
  ): Promise<void> {
    const campaign: Record<string, unknown> = { id: externalId };
    if (changes.status)
      campaign.status = changes.status === 'active' ? 'ACTIVE' : 'PAUSED';
    if (changes.dailyBudget !== undefined) {
      campaign.daily_budget_micro = Math.round(changes.dailyBudget * 1_000_000);
    }
    await axios.put(
      `https://adsapi.snapchat.com/v1/campaigns/${externalId}`,
      { campaigns: [campaign] },
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
  }

  /** Real Stats API, trailing 30 days. */
  async fetchCampaignStats(
    tokens: OAuthTokens,
    externalId: string,
  ): Promise<CampaignStatsResult> {
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    const response = await axios.get<{
      campaigns_stats?: {
        campaign_stats?: {
          stats?: {
            spend?: number;
            impressions?: number;
            swipes?: number;
            conversion_purchases?: number;
          };
        };
      }[];
    }>(`https://adsapi.snapchat.com/v1/campaigns/${externalId}/stats`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
      params: {
        fields: 'spend,impressions,swipes,conversion_purchases',
        granularity: 'TOTAL',
        start_time: start.toISOString(),
        end_time: end.toISOString(),
      },
    });
    const stats = response.data.campaigns_stats?.[0]?.campaign_stats?.stats;
    if (!stats) return { spend: 0, impressions: 0, clicks: 0, results: 0 };
    return {
      spend: (stats.spend ?? 0) / 1_000_000, // Snap reports spend in micro-currency, same unit `daily_budget_micro` uses
      impressions: stats.impressions ?? 0,
      clicks: stats.swipes ?? 0,
      results: stats.conversion_purchases ?? 0,
    };
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
