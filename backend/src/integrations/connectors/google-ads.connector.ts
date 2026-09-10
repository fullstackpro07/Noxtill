import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GoogleOAuth2Connector } from './google-oauth2.connector';
import {
  CampaignStatsResult,
  CreateCampaignParams,
  CreateCampaignResult,
  OAuthTokens,
  UpdateCampaignChanges,
} from '../connector.interface';
import { IntegrationProvider } from '@prisma/client';

/** Google Ads connector (BE-085). Every Google Ads API call needs a developer token header in addition to the OAuth bearer token — a real quirk of this API, not shared by GMB/Merchant Center. */
@Injectable()
export class GoogleAdsConnector extends GoogleOAuth2Connector {
  readonly provider = IntegrationProvider.google_ads;
  protected readonly scope = 'https://www.googleapis.com/auth/adwords';

  constructor(config: ConfigService) {
    super(config);
  }

  async sync(tokens: OAuthTokens): Promise<unknown> {
    const response = await axios.get(
      'https://googleads.googleapis.com/v17/customers:listAccessibleCustomers',
      {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          'developer-token':
            this.config.get<string>('GOOGLE_ADS_DEVELOPER_TOKEN') ?? '',
        },
      },
    );
    return response.data;
  }

  /**
   * Google Ads has no single "create a campaign" call — a real Campaign always references a
   * `CampaignBudget` resource, so this is a genuine 2-step mutate (budget, then campaign), not a
   * shortcut. `meta.customerId` (a real Google Ads customer id, e.g. from a prior `sync()`
   * selection) is required.
   */
  async createCampaign(
    tokens: OAuthTokens,
    params: CreateCampaignParams,
    meta: Record<string, unknown>,
  ): Promise<CreateCampaignResult> {
    const customerId = meta.customerId as string | undefined;
    if (!customerId) {
      throw new Error('No Google Ads customer selected for this business');
    }
    const headers = {
      Authorization: `Bearer ${tokens.accessToken}`,
      'developer-token':
        this.config.get<string>('GOOGLE_ADS_DEVELOPER_TOKEN') ?? '',
      'content-type': 'application/json',
    };
    const microBudget = Math.round(params.dailyBudget * 1_000_000);

    const budgetResponse = await axios.post<{
      results: { resourceName: string }[];
    }>(
      `https://googleads.googleapis.com/v17/customers/${customerId}/campaignBudgets:mutate`,
      {
        operations: [
          {
            create: {
              name: `${params.name} Budget`,
              amountMicros: microBudget,
              deliveryMethod: 'STANDARD',
            },
          },
        ],
      },
      { headers },
    );
    const budgetResourceName = budgetResponse.data.results[0].resourceName;

    const campaignResponse = await axios.post<{
      results: { resourceName: string }[];
    }>(
      `https://googleads.googleapis.com/v17/customers/${customerId}/campaigns:mutate`,
      {
        operations: [
          {
            create: {
              name: params.name,
              status: 'PAUSED',
              advertisingChannelType: 'SEARCH',
              campaignBudget: budgetResourceName,
            },
          },
        ],
      },
      { headers },
    );
    return {
      externalId: campaignResponse.data.results[0].resourceName,
      // Campaign management actions (UPD-BE-130) depth fix — persisted so a later budget-adjust
      // can real-mutate the actual resource that carries the amount, not the campaign itself.
      providerMeta: { budgetResourceName },
    };
  }

  /**
   * Two independent real mutates when both are requested: status is a field directly on the
   * Campaign resource; budget lives on the separate `CampaignBudget` resource named in
   * `meta.budgetResourceName` (persisted by `createCampaign` for exactly this). A campaign created
   * before this fix has no `budgetResourceName` on record — its budget change still applies
   * locally, honestly, but this call has nothing real to mutate for it.
   */
  async updateCampaign(
    tokens: OAuthTokens,
    externalId: string,
    changes: UpdateCampaignChanges,
    meta: Record<string, unknown>,
  ): Promise<void> {
    const customerId = externalId.split('/')[1];
    const headers = {
      Authorization: `Bearer ${tokens.accessToken}`,
      'developer-token':
        this.config.get<string>('GOOGLE_ADS_DEVELOPER_TOKEN') ?? '',
      'content-type': 'application/json',
    };

    if (changes.status) {
      await axios.post(
        `https://googleads.googleapis.com/v17/customers/${customerId}/campaigns:mutate`,
        {
          operations: [
            {
              update: {
                resourceName: externalId,
                status: changes.status === 'active' ? 'ENABLED' : 'PAUSED',
              },
              updateMask: 'status',
            },
          ],
        },
        { headers },
      );
    }

    const budgetResourceName = meta.budgetResourceName as string | undefined;
    if (changes.dailyBudget !== undefined && budgetResourceName) {
      await axios.post(
        `https://googleads.googleapis.com/v17/customers/${customerId}/campaignBudgets:mutate`,
        {
          operations: [
            {
              update: {
                resourceName: budgetResourceName,
                amountMicros: Math.round(changes.dailyBudget * 1_000_000),
              },
              updateMask: 'amountMicros',
            },
          ],
        },
        { headers },
      );
    }
  }

  /** Real GAQL search, trailing 30 days. */
  async fetchCampaignStats(
    tokens: OAuthTokens,
    externalId: string,
  ): Promise<CampaignStatsResult> {
    const customerId = externalId.split('/')[1];
    const headers = {
      Authorization: `Bearer ${tokens.accessToken}`,
      'developer-token':
        this.config.get<string>('GOOGLE_ADS_DEVELOPER_TOKEN') ?? '',
      'content-type': 'application/json',
    };
    const response = await axios.post<{
      results?: {
        metrics: {
          costMicros?: string;
          impressions?: string;
          clicks?: string;
          conversions?: number;
        };
      }[];
    }>(
      `https://googleads.googleapis.com/v17/customers/${customerId}/googleAds:search`,
      {
        query: `SELECT metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign WHERE campaign.resource_name = '${externalId}' AND segments.date DURING LAST_30_DAYS`,
      },
      { headers },
    );
    const metrics = response.data.results?.[0]?.metrics;
    if (!metrics) return { spend: 0, impressions: 0, clicks: 0, results: 0 };
    return {
      spend: Number(metrics.costMicros ?? 0) / 1_000_000,
      impressions: Number(metrics.impressions ?? 0),
      clicks: Number(metrics.clicks ?? 0),
      results: Math.round(metrics.conversions ?? 0),
    };
  }
}
