import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHash } from 'crypto';
import {
  AudienceContact,
  Connector,
  OAuthTokens,
} from '../connector.interface';
import { IntegrationProvider } from '@prisma/client';

const AUTHORIZE_URL = 'https://login.mailchimp.com/oauth2/authorize';
const TOKEN_URL = 'https://login.mailchimp.com/oauth2/token';
const METADATA_URL = 'https://login.mailchimp.com/oauth2/metadata';

interface MailchimpMetadata {
  dc: string;
  api_endpoint: string;
  login: { login_name?: string };
}

/**
 * Mailchimp connector — OAuth2. After the code exchange Mailchimp's metadata endpoint reveals the
 * account's data-center API endpoint, which is stored with the connection. Contacts are upserted
 * (PUT by the md5 of the lower-cased email — Mailchimp's own idempotent member key) into the
 * account's first audience. Only contacts that consented to marketing are ever sent (the caller
 * filters); Mailchimp records them as `subscribed`.
 */
@Injectable()
export class MailchimpConnector implements Connector {
  readonly provider = IntegrationProvider.mailchimp;

  constructor(private readonly config: ConfigService) {}

  private redirectUri(): string {
    const backendUrl =
      this.config.get<string>('BACKEND_URL') ?? 'http://localhost:5000/api/v1';
    return `${backendUrl}/integrations/mailchimp/callback`;
  }

  authUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.get<string>('MAILCHIMP_CLIENT_ID') ?? '',
      redirect_uri: this.redirectUri(),
      state,
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async handleCallback(code: string): Promise<OAuthTokens> {
    const token = await axios.post<{ access_token: string }>(
      TOKEN_URL,
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.config.get<string>('MAILCHIMP_CLIENT_ID') ?? '',
        client_secret: this.config.get<string>('MAILCHIMP_CLIENT_SECRET') ?? '',
        redirect_uri: this.redirectUri(),
        code,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    const metadata = await axios.get<MailchimpMetadata>(METADATA_URL, {
      headers: { Authorization: `OAuth ${token.data.access_token}` },
    });
    return {
      accessToken: token.data.access_token,
      providerMeta: {
        apiEndpoint: metadata.data.api_endpoint,
        dc: metadata.data.dc,
        account: metadata.data.login?.login_name ?? null,
      },
    };
  }

  /** Mailchimp OAuth tokens do not expire. */
  // eslint-disable-next-line @typescript-eslint/require-await -- nothing to renew
  async refreshToken(tokens: OAuthTokens): Promise<OAuthTokens> {
    return tokens;
  }

  private api(tokens: OAuthTokens): string {
    const endpoint = tokens.providerMeta?.apiEndpoint as string | undefined;
    if (!endpoint)
      throw new Error('Mailchimp data-center endpoint is missing — reconnect');
    return `${endpoint}/3.0`;
  }

  async sync(tokens: OAuthTokens): Promise<unknown> {
    const response = await axios.get(
      `${this.api(tokens)}/lists?count=1&fields=lists.id,lists.name`,
      {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      },
    );
    return response.data;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- Mailchimp has no revoke endpoint; the token is discarded
  async disconnect(): Promise<void> {
    return;
  }

  async pushContacts(
    tokens: OAuthTokens,
    meta: Record<string, unknown>,
    contacts: AudienceContact[],
  ): Promise<{ pushed: number; failed: number }> {
    const headers = { Authorization: `Bearer ${tokens.accessToken}` };
    const api = this.api(tokens);
    const lists = await axios.get<{ lists: Array<{ id: string }> }>(
      `${api}/lists?count=1&fields=lists.id`,
      { headers },
    );
    const listId =
      (meta.audienceId as string | undefined) ?? lists.data.lists[0]?.id;
    if (!listId)
      throw new Error('This Mailchimp account has no audience to sync into');

    let pushed = 0;
    let failed = 0;
    for (const c of contacts) {
      if (!c.email) continue;
      const hash = createHash('md5')
        .update(c.email.toLowerCase())
        .digest('hex');
      try {
        await axios.put(
          `${api}/lists/${listId}/members/${hash}`,
          {
            email_address: c.email,
            status_if_new: 'subscribed',
            merge_fields: { FNAME: c.firstName ?? '', LNAME: c.lastName ?? '' },
          },
          { headers },
        );
        pushed += 1;
      } catch {
        failed += 1;
      }
    }
    return { pushed, failed };
  }
}
