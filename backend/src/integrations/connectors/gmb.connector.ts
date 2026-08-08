import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GoogleOAuth2Connector } from './google-oauth2.connector';
import { OAuthTokens } from '../connector.interface';
import { IntegrationProvider } from '../../../generated/prisma';

/** Google My Business connector (BE-084). Scope grants read/write over the business's own listings. */
@Injectable()
export class GmbConnector extends GoogleOAuth2Connector {
  readonly provider = IntegrationProvider.gmb;
  protected readonly scope = 'https://www.googleapis.com/auth/business.manage';

  // Nest's DI doesn't reliably resolve an inherited constructor's parameter types for a subclass
  // that declares no constructor of its own — an explicit one calling super() is required here.
  constructor(config: ConfigService) {
    super(config);
  }

  /** Lists the accounts the connected Google identity manages — the minimal real proof-of-connection call. */
  async sync(tokens: OAuthTokens): Promise<unknown> {
    const response = await axios.get(
      'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    return response.data;
  }
}
