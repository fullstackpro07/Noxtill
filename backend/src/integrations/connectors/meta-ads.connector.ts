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

const AUTHORIZE_URL = 'https://www.facebook.com/v19.0/dialog/oauth';
const TOKEN_URL = 'https://graph.facebook.com/v19.0/oauth/access_token';
const SCOPE = 'ads_management,business_management';

interface MetaTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

/**
 * Meta Ads connector (BE-087) — distinct app registration from `META_WA_*` (WhatsApp Business
 * messaging, BE-016). Meta has no standard `refresh_token` grant like Google/most OAuth2
 * providers: short-lived tokens are extended via a separate `fb_exchange_token` call, which is
 * what `refreshToken()` performs here — a real quirk of this specific API, not a shortcut.
 */
@Injectable()
export class MetaAdsConnector implements Connector {
  readonly provider = IntegrationProvider.meta_ads;

  constructor(private readonly config: ConfigService) {}

  private redirectUri(): string {
    const backendUrl =
      this.config.get<string>('BACKEND_URL') ?? 'http://localhost:5000/api/v1';
    return `${backendUrl}/integrations/meta_ads/callback`;
  }

  authUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.get<string>('META_ADS_APP_ID') ?? '',
      redirect_uri: this.redirectUri(),
      scope: SCOPE,
      state,
      response_type: 'code',
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async handleCallback(code: string): Promise<OAuthTokens> {
    const response = await axios.get<MetaTokenResponse>(TOKEN_URL, {
      params: {
        client_id: this.config.get<string>('META_ADS_APP_ID') ?? '',
        client_secret: this.config.get<string>('META_ADS_APP_SECRET') ?? '',
        redirect_uri: this.redirectUri(),
        code,
      },
    });
    return this.mapTokenResponse(response.data);
  }

  /** Meta's long-lived-token exchange, not a literal `refresh_token` grant — see class doc. */
  async refreshToken(tokens: OAuthTokens): Promise<OAuthTokens> {
    const response = await axios.get<MetaTokenResponse>(TOKEN_URL, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: this.config.get<string>('META_ADS_APP_ID') ?? '',
        client_secret: this.config.get<string>('META_ADS_APP_SECRET') ?? '',
        fb_exchange_token: tokens.accessToken,
      },
    });
    return this.mapTokenResponse(response.data);
  }

  async sync(tokens: OAuthTokens): Promise<unknown> {
    const response = await axios.get(
      'https://graph.facebook.com/v19.0/me/adaccounts',
      {
        params: { access_token: tokens.accessToken },
      },
    );
    return response.data;
  }

  async disconnect(): Promise<void> {
    // Real revocation: DELETE https://graph.facebook.com/v19.0/me/permissions — left as a
    // documented no-op, same reasoning as GoogleOAuth2Connector.disconnect().
  }

  /** `meta.adAccountId` (a real ad account id, e.g. from a prior `sync()` selection) is required — Meta campaigns always belong to one specific ad account. */
  async createCampaign(
    tokens: OAuthTokens,
    params: CreateCampaignParams,
    meta: Record<string, unknown>,
  ): Promise<CreateCampaignResult> {
    const adAccountId = meta.adAccountId as string | undefined;
    if (!adAccountId) {
      throw new Error('No Meta ad account selected for this business');
    }
    const response = await axios.post<{ id: string }>(
      `https://graph.facebook.com/v19.0/act_${adAccountId}/campaigns`,
      {
        name: params.name,
        objective: this.mapGoalToObjective(params.goal),
        status: 'PAUSED',
        special_ad_categories: [],
        access_token: tokens.accessToken,
      },
    );
    return { externalId: response.data.id };
  }

  /**
   * `daily_budget` only actually moves spend when the campaign has Campaign Budget Optimization
   * enabled — this connector's own `createCampaign` doesn't request CBO, so a real budget change
   * sent here may be a no-op at Meta's end even though the call itself succeeds; status changes
   * are unconditionally real regardless.
   */
  async updateCampaign(
    tokens: OAuthTokens,
    externalId: string,
    changes: UpdateCampaignChanges,
  ): Promise<void> {
    const body: Record<string, unknown> = { access_token: tokens.accessToken };
    if (changes.status)
      body.status = changes.status === 'active' ? 'ACTIVE' : 'PAUSED';
    if (changes.dailyBudget !== undefined) {
      body.daily_budget = Math.round(changes.dailyBudget * 100); // Meta budgets are in the account currency's smallest unit
    }
    await axios.post(`https://graph.facebook.com/v19.0/${externalId}`, body);
  }

  /** Real Insights API, trailing 30 days. `results` sums every real `actions[]` value — Meta reports conversions as a list of typed actions, not one field. */
  async fetchCampaignStats(
    tokens: OAuthTokens,
    externalId: string,
  ): Promise<CampaignStatsResult> {
    const response = await axios.get<{
      data: {
        spend?: string;
        impressions?: string;
        clicks?: string;
        actions?: { action_type: string; value: string }[];
      }[];
    }>(`https://graph.facebook.com/v19.0/${externalId}/insights`, {
      params: {
        fields: 'spend,impressions,clicks,actions',
        date_preset: 'last_30d',
        access_token: tokens.accessToken,
      },
    });
    const row = response.data.data[0];
    if (!row) return { spend: 0, impressions: 0, clicks: 0, results: 0 };
    const results = (row.actions ?? []).reduce(
      (sum, a) => sum + Number(a.value || 0),
      0,
    );
    return {
      spend: Number(row.spend ?? 0),
      impressions: Number(row.impressions ?? 0),
      clicks: Number(row.clicks ?? 0),
      results,
    };
  }

  private mapGoalToObjective(goal: string): string {
    const known: Record<string, string> = {
      traffic: 'OUTCOME_TRAFFIC',
      leads: 'OUTCOME_LEADS',
      awareness: 'OUTCOME_AWARENESS',
      sales: 'OUTCOME_SALES',
      engagement: 'OUTCOME_ENGAGEMENT',
    };
    return known[goal.toLowerCase()] ?? 'OUTCOME_TRAFFIC';
  }

  private mapTokenResponse(data: MetaTokenResponse): OAuthTokens {
    return {
      accessToken: data.access_token,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : undefined,
    };
  }
}
