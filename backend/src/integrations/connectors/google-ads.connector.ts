import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GoogleOAuth2Connector } from './google-oauth2.connector';
import { OAuthTokens } from '../connector.interface';
import { IntegrationProvider } from '../../../generated/prisma';

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
          'developer-token': this.config.get<string>('GOOGLE_ADS_DEVELOPER_TOKEN') ?? '',
        },
      },
    );
    return response.data;
  }
}
