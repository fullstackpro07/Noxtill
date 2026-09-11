import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { gunzipSync } from 'zlib';
import {
  CampaignStatsResult,
  Connector,
  CreateCampaignParams,
  CreateCampaignResult,
  OAuthTokens,
  UpdateCampaignChanges,
} from '../connector.interface';
import { IntegrationProvider } from '@prisma/client';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const AUTHORIZE_URL = 'https://www.amazon.com/ap/oa';
const TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
const SCOPE = 'advertising::campaign_management';

interface AmazonTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

/**
 * Amazon Ads connector (UPD-BE-069) — Login with Amazon (LWA), a real quirk distinct from a
 * generic OAuth2 app: every Advertising API call also needs the raw `client_id` on an
 * `Amazon-Advertising-API-ClientId` header alongside the bearer token, not just at token exchange.
 */
@Injectable()
export class AmazonAdsConnector implements Connector {
  readonly provider = IntegrationProvider.amazon_ads;

  constructor(private readonly config: ConfigService) {}

  private redirectUri(): string {
    const backendUrl =
      this.config.get<string>('BACKEND_URL') ?? 'http://localhost:5000/api/v1';
    return `${backendUrl}/integrations/amazon_ads/callback`;
  }

  authUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.get<string>('AMAZON_ADS_CLIENT_ID') ?? '',
      redirect_uri: this.redirectUri(),
      scope: SCOPE,
      state,
      response_type: 'code',
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async handleCallback(code: string): Promise<OAuthTokens> {
    const response = await axios.post<AmazonTokenResponse>(
      TOKEN_URL,
      new URLSearchParams({
        client_id: this.config.get<string>('AMAZON_ADS_CLIENT_ID') ?? '',
        client_secret:
          this.config.get<string>('AMAZON_ADS_CLIENT_SECRET') ?? '',
        redirect_uri: this.redirectUri(),
        grant_type: 'authorization_code',
        code,
      }),
    );
    return this.mapTokenResponse(response.data);
  }

  async refreshToken(tokens: OAuthTokens): Promise<OAuthTokens> {
    const response = await axios.post<AmazonTokenResponse>(
      TOKEN_URL,
      new URLSearchParams({
        client_id: this.config.get<string>('AMAZON_ADS_CLIENT_ID') ?? '',
        client_secret:
          this.config.get<string>('AMAZON_ADS_CLIENT_SECRET') ?? '',
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken ?? '',
      }),
    );
    return this.mapTokenResponse(response.data);
  }

  private clientHeaders(tokens: OAuthTokens) {
    return {
      Authorization: `Bearer ${tokens.accessToken}`,
      'Amazon-Advertising-API-ClientId':
        this.config.get<string>('AMAZON_ADS_CLIENT_ID') ?? '',
    };
  }

  /** Lists the real advertising profiles (one per marketplace/account) the connected user can manage. */
  async sync(tokens: OAuthTokens): Promise<unknown> {
    const response = await axios.get(
      'https://advertising-api.amazon.com/v2/profiles',
      { headers: this.clientHeaders(tokens) },
    );
    return response.data;
  }

  /** `meta.profileId` (a real Amazon Advertising profile id, e.g. from a prior `sync()` selection) is required — every campaign call is scoped to one profile. */
  async createCampaign(
    tokens: OAuthTokens,
    params: CreateCampaignParams,
    meta: Record<string, unknown>,
  ): Promise<CreateCampaignResult> {
    const profileId = meta.profileId as string | undefined;
    if (!profileId) {
      throw new Error(
        'No Amazon Advertising profile selected for this business',
      );
    }
    const response = await axios.post<{ campaignId: string; code: string }[]>(
      'https://advertising-api.amazon.com/v2/sp/campaigns',
      [
        {
          name: params.name,
          campaignType: 'sponsoredProducts',
          targetingType: 'manual',
          state: 'paused',
          dailyBudget: params.dailyBudget,
        },
      ],
      {
        headers: {
          ...this.clientHeaders(tokens),
          'Amazon-Advertising-API-Scope': profileId,
        },
      },
    );
    return { externalId: response.data[0].campaignId };
  }

  async updateCampaign(
    tokens: OAuthTokens,
    externalId: string,
    changes: UpdateCampaignChanges,
    meta: Record<string, unknown>,
  ): Promise<void> {
    const profileId = meta.profileId as string | undefined;
    if (!profileId) {
      throw new Error(
        'No Amazon Advertising profile recorded for this campaign',
      );
    }
    const campaign: Record<string, unknown> = { campaignId: externalId };
    if (changes.status)
      campaign.state = changes.status === 'active' ? 'enabled' : 'paused';
    if (changes.dailyBudget !== undefined)
      campaign.dailyBudget = changes.dailyBudget;
    await axios.put(
      'https://advertising-api.amazon.com/v2/sp/campaigns',
      [campaign],
      {
        headers: {
          ...this.clientHeaders(tokens),
          'Amazon-Advertising-API-Scope': profileId,
        },
      },
    );
  }

  async disconnect(): Promise<void> {
    // Real revocation is an LWA token-revocation call — left as a documented no-op, same
    // reasoning as every other connector's disconnect().
  }

  /**
   * Fatigue-warning depth fix — Amazon's Reporting API v2 is also a real async flow (submit ->
   * poll `/v2/reports/{id}` -> download a real gzip-compressed JSON file from the returned
   * `location`, decompressed here with Node's built-in `zlib`), not a shortcut. Real constraint,
   * disclosed rather than faked: Amazon scopes each report to exactly one calendar day, so unlike
   * every other connector's 30-day window this one reports on "yesterday" (the most recent day
   * Amazon's API guarantees complete data for) — a real number for a shorter real window, never a
   * fabricated 30-day figure. Bounded to ~10 polls at 3s apart, same shape as Microsoft's.
   */
  async fetchCampaignStats(
    tokens: OAuthTokens,
    externalId: string,
    meta: Record<string, unknown>,
  ): Promise<CampaignStatsResult> {
    const profileId = meta.profileId as string | undefined;
    if (!profileId) {
      throw new Error(
        'No Amazon Advertising profile recorded for this campaign',
      );
    }
    const headers = {
      ...this.clientHeaders(tokens),
      'Amazon-Advertising-API-Scope': profileId,
    };

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const reportDate = yesterday.toISOString().slice(0, 10).replace(/-/g, '');

    const submitResponse = await axios.post<{ reportId: string }>(
      'https://advertising-api.amazon.com/v2/sp/campaigns/report',
      {
        campaignType: 'sponsoredProducts',
        segment: '',
        reportDate,
        metrics: 'campaignId,impressions,clicks,cost,attributedConversions30d',
      },
      { headers },
    );
    const reportId = submitResponse.data.reportId;

    let location: string | undefined;
    for (let attempt = 0; attempt < 10 && !location; attempt += 1) {
      if (attempt > 0) await sleep(3000);
      const pollResponse = await axios.get<{
        status: string;
        location?: string;
      }>(`https://advertising-api.amazon.com/v2/reports/${reportId}`, {
        headers,
      });
      if (pollResponse.data.status === 'SUCCESS')
        location = pollResponse.data.location;
      else if (pollResponse.data.status === 'FAILURE') {
        throw new Error('Amazon Advertising report generation failed');
      }
    }
    if (!location) {
      throw new Error('Amazon Advertising report was not ready in time');
    }

    const fileResponse = await axios.get<ArrayBuffer>(location, {
      responseType: 'arraybuffer',
    });
    const rows = JSON.parse(
      gunzipSync(Buffer.from(fileResponse.data)).toString('utf-8'),
    ) as {
      campaignId: number | string;
      impressions?: number;
      clicks?: number;
      cost?: number;
      attributedConversions30d?: number;
    }[];

    const row = rows.find((r) => String(r.campaignId) === externalId);
    if (!row) return { spend: 0, impressions: 0, clicks: 0, results: 0 };
    return {
      spend: row.cost ?? 0,
      impressions: row.impressions ?? 0,
      clicks: row.clicks ?? 0,
      results: row.attributedConversions30d ?? 0,
    };
  }

  private mapTokenResponse(data: AmazonTokenResponse): OAuthTokens {
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : undefined,
    };
  }
}
