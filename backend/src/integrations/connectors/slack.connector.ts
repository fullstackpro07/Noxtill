import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Connector, OAuthTokens } from '../connector.interface';
import { IntegrationProvider } from '@prisma/client';

const AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';
const TOKEN_URL = 'https://slack.com/api/oauth.v2.access';
const REVOKE_URL = 'https://slack.com/api/auth.revoke';

interface SlackAccess {
  ok: boolean;
  error?: string;
  access_token?: string;
  team?: { name?: string };
  incoming_webhook?: { url: string; channel: string };
}

/**
 * Slack connector — OAuth v2 with the single `incoming-webhook` scope: the person who authorises
 * picks one channel and Slack returns a webhook URL for that channel. That is all Noxtill can do —
 * post messages there. It cannot read any channel or message.
 */
@Injectable()
export class SlackConnector implements Connector {
  readonly provider = IntegrationProvider.slack;

  constructor(private readonly config: ConfigService) {}

  private redirectUri(): string {
    const backendUrl =
      this.config.get<string>('BACKEND_URL') ?? 'http://localhost:5000/api/v1';
    return `${backendUrl}/integrations/slack/callback`;
  }

  authUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.get<string>('SLACK_CLIENT_ID') ?? '',
      scope: 'incoming-webhook',
      redirect_uri: this.redirectUri(),
      state,
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async handleCallback(code: string): Promise<OAuthTokens> {
    const response = await axios.post<SlackAccess>(
      TOKEN_URL,
      new URLSearchParams({
        client_id: this.config.get<string>('SLACK_CLIENT_ID') ?? '',
        client_secret: this.config.get<string>('SLACK_CLIENT_SECRET') ?? '',
        code,
        redirect_uri: this.redirectUri(),
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    const data = response.data;
    if (!data.ok || !data.incoming_webhook || !data.access_token) {
      throw new Error(data.error ?? 'Slack did not return an incoming webhook');
    }
    return {
      accessToken: data.access_token,
      providerMeta: {
        webhookUrl: data.incoming_webhook.url,
        channel: data.incoming_webhook.channel,
        team: data.team?.name ?? null,
      },
    };
  }

  /** Slack bot tokens issued this way do not expire. */
  // eslint-disable-next-line @typescript-eslint/require-await -- nothing to renew
  async refreshToken(tokens: OAuthTokens): Promise<OAuthTokens> {
    return tokens;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- the connect step already proved the webhook exists; posting is the only action
  async sync(tokens: OAuthTokens): Promise<unknown> {
    return { channel: tokens.providerMeta?.channel ?? null };
  }

  async disconnect(tokens?: OAuthTokens): Promise<void> {
    if (!tokens) return;
    await axios.post(REVOKE_URL, null, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
  }

  async postMessage(
    tokens: OAuthTokens,
    _meta: Record<string, unknown>,
    text: string,
  ): Promise<void> {
    const url = tokens.providerMeta?.webhookUrl as string | undefined;
    if (!url) throw new Error('No Slack channel is connected — reconnect');
    await axios.post(url, { text }, { timeout: 10_000 });
  }
}
