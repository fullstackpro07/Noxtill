import { Injectable } from '@nestjs/common';
import axios from 'axios';
import {
  AudienceContact,
  Connector,
  OAuthTokens,
} from '../connector.interface';
import { IntegrationProvider } from '@prisma/client';

const API = 'https://a.klaviyo.com/api';
const REVISION = '2024-10-15';

/**
 * Klaviyo connector — private API key (pasted by the merchant, verified with a real request to
 * `/api/accounts/` before it is stored). Contacts are created/updated as profiles via
 * `/api/profile-import/`, Klaviyo's own upsert. Only marketing-consented contacts are sent (the
 * caller filters).
 */
@Injectable()
export class KlaviyoConnector implements Connector {
  readonly provider = IntegrationProvider.klaviyo;

  authUrl(): null {
    return null;
  }

  private headers(key: string) {
    return {
      Authorization: `Klaviyo-API-Key ${key}`,
      revision: REVISION,
      accept: 'application/json',
      'content-type': 'application/json',
    };
  }

  async handleCallback(
    _code: string,
    rawQuery: Record<string, string> = {},
  ): Promise<OAuthTokens> {
    const key = rawQuery.privateApiKey;
    if (!key) throw new Error('Klaviyo requires a private API key');
    const response = await axios.get<{
      data: Array<{
        attributes?: { contact_information?: { organization_name?: string } };
      }>;
    }>(`${API}/accounts/`, { headers: this.headers(key) });
    return {
      accessToken: key,
      providerMeta: {
        account:
          response.data.data?.[0]?.attributes?.contact_information
            ?.organization_name ?? null,
      },
    };
  }

  /** A private API key does not expire. */
  // eslint-disable-next-line @typescript-eslint/require-await -- nothing to renew
  async refreshToken(tokens: OAuthTokens): Promise<OAuthTokens> {
    return tokens;
  }

  async sync(tokens: OAuthTokens): Promise<unknown> {
    const response = await axios.get(`${API}/accounts/`, {
      headers: this.headers(tokens.accessToken),
    });
    return response.data;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- the key is revoked from Klaviyo's own settings; the stored copy is discarded
  async disconnect(): Promise<void> {
    return;
  }

  async pushContacts(
    tokens: OAuthTokens,
    _meta: Record<string, unknown>,
    contacts: AudienceContact[],
  ): Promise<{ pushed: number; failed: number }> {
    let pushed = 0;
    let failed = 0;
    for (const c of contacts) {
      if (!c.email && !c.phone) continue;
      try {
        await axios.post(
          `${API}/profile-import/`,
          {
            data: {
              type: 'profile',
              attributes: {
                email: c.email,
                phone_number: c.phone,
                first_name: c.firstName,
                last_name: c.lastName,
              },
            },
          },
          { headers: this.headers(tokens.accessToken) },
        );
        pushed += 1;
      } catch {
        failed += 1;
      }
    }
    return { pushed, failed };
  }
}
