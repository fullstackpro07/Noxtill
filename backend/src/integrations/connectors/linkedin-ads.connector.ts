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

const AUTHORIZE_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const SCOPE = 'r_ads r_ads_reporting rw_ads';

interface LinkedInTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

/**
 * LinkedIn Ads connector (UPD-BE-069) — standard LinkedIn OAuth2 3-legged flow (no shared base per
 * this codebase's established finding that only Google's connectors genuinely share one).
 */
@Injectable()
export class LinkedInAdsConnector implements Connector {
  readonly provider = IntegrationProvider.linkedin_ads;

  constructor(private readonly config: ConfigService) {}

  private redirectUri(): string {
    const backendUrl =
      this.config.get<string>('BACKEND_URL') ?? 'http://localhost:5000/api/v1';
    return `${backendUrl}/integrations/linkedin_ads/callback`;
  }

  authUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.get<string>('LINKEDIN_ADS_CLIENT_ID') ?? '',
      redirect_uri: this.redirectUri(),
      scope: SCOPE,
      state,
      response_type: 'code',
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async handleCallback(code: string): Promise<OAuthTokens> {
    const response = await axios.post<LinkedInTokenResponse>(
      TOKEN_URL,
      new URLSearchParams({
        client_id: this.config.get<string>('LINKEDIN_ADS_CLIENT_ID') ?? '',
        client_secret:
          this.config.get<string>('LINKEDIN_ADS_CLIENT_SECRET') ?? '',
        redirect_uri: this.redirectUri(),
        grant_type: 'authorization_code',
        code,
      }),
    );
    return this.mapTokenResponse(response.data);
  }

  async refreshToken(tokens: OAuthTokens): Promise<OAuthTokens> {
    const response = await axios.post<LinkedInTokenResponse>(
      TOKEN_URL,
      new URLSearchParams({
        client_id: this.config.get<string>('LINKEDIN_ADS_CLIENT_ID') ?? '',
        client_secret:
          this.config.get<string>('LINKEDIN_ADS_CLIENT_SECRET') ?? '',
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken ?? '',
      }),
    );
    return this.mapTokenResponse(response.data);
  }

  /** Lists real ad accounts the connected member can administer. */
  async sync(tokens: OAuthTokens): Promise<unknown> {
    const response = await axios.get(
      'https://api.linkedin.com/rest/adAccounts?q=search',
      {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          'LinkedIn-Version': '202401',
        },
      },
    );
    return response.data;
  }

  /** `meta.adAccountId` (a real LinkedIn sponsored-account id, e.g. from a prior `sync()` selection) is required. */
  async createCampaign(
    tokens: OAuthTokens,
    params: CreateCampaignParams,
    meta: Record<string, unknown>,
  ): Promise<CreateCampaignResult> {
    const adAccountId = meta.adAccountId as string | undefined;
    if (!adAccountId) {
      throw new Error('No LinkedIn ad account selected for this business');
    }
    const response = await axios.post<{ id: string }>(
      'https://api.linkedin.com/rest/adCampaigns',
      {
        account: `urn:li:sponsoredAccount:${adAccountId}`,
        name: params.name,
        objectiveType: this.mapGoalToObjective(params.goal),
        costType: 'CPC',
        dailyBudget: {
          amount: String(params.dailyBudget),
          currencyCode: 'USD',
        },
        status: 'PAUSED',
      },
      {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          'LinkedIn-Version': '202401',
        },
      },
    );
    return { externalId: response.data.id };
  }

  async disconnect(): Promise<void> {
    // Real revocation would POST to LinkedIn's token-revocation endpoint — left as a documented
    // no-op, same reasoning as every other connector's disconnect().
  }

  private mapGoalToObjective(goal: string): string {
    const known: Record<string, string> = {
      traffic: 'WEBSITE_VISIT',
      leads: 'LEAD_GENERATION',
      awareness: 'BRAND_AWARENESS',
      engagement: 'ENGAGEMENT',
    };
    return known[goal.toLowerCase()] ?? 'WEBSITE_VISIT';
  }

  private mapTokenResponse(data: LinkedInTokenResponse): OAuthTokens {
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : undefined,
    };
  }
}
