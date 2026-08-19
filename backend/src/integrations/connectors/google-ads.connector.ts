import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GoogleOAuth2Connector } from './google-oauth2.connector';
import {
  CreateCampaignParams,
  CreateCampaignResult,
  OAuthTokens,
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
    return { externalId: campaignResponse.data.results[0].resourceName };
  }
}
