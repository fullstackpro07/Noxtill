import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GoogleOAuth2Connector } from './google-oauth2.connector';
import { OAuthTokens } from '../connector.interface';
import { IntegrationProvider } from '../../../generated/prisma';

/** Google Merchant Center connector (BE-086), via the Content API for Shopping. */
@Injectable()
export class MerchantCenterConnector extends GoogleOAuth2Connector {
  readonly provider = IntegrationProvider.merchant;
  protected readonly scope = 'https://www.googleapis.com/auth/content';

  constructor(config: ConfigService) {
    super(config);
  }

  /** authinfo returns the merchant accounts the connected identity has access to. */
  async sync(tokens: OAuthTokens): Promise<unknown> {
    const response = await axios.get(
      'https://shoppingcontent.googleapis.com/content/v2.1/accounts/authinfo',
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    return response.data;
  }
}
