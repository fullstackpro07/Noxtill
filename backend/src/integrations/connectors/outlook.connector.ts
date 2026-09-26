import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  CalendarEventInput,
  Connector,
  OAuthTokens,
} from '../connector.interface';
import { IntegrationProvider } from '@prisma/client';

const AUTHORIZE_URL =
  'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPE = 'offline_access Calendars.ReadWrite User.Read';

interface MicrosoftTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

/**
 * Outlook Calendar connector — Microsoft identity platform (v2) with delegated
 * `Calendars.ReadWrite`. Creates, updates and removes one event per Noxtill booking through
 * Microsoft Graph. Outbound only: edits made in Outlook are not read back.
 */
@Injectable()
export class OutlookConnector implements Connector {
  readonly provider = IntegrationProvider.outlook;

  constructor(private readonly config: ConfigService) {}

  private redirectUri(): string {
    const backendUrl =
      this.config.get<string>('BACKEND_URL') ?? 'http://localhost:5000/api/v1';
    return `${backendUrl}/integrations/outlook/callback`;
  }

  authUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.get<string>('MICROSOFT_GRAPH_CLIENT_ID') ?? '',
      response_type: 'code',
      redirect_uri: this.redirectUri(),
      response_mode: 'query',
      scope: SCOPE,
      state,
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  private async token(form: Record<string, string>): Promise<OAuthTokens> {
    const response = await axios.post<MicrosoftTokenResponse>(
      TOKEN_URL,
      new URLSearchParams({
        client_id: this.config.get<string>('MICROSOFT_GRAPH_CLIENT_ID') ?? '',
        client_secret:
          this.config.get<string>('MICROSOFT_GRAPH_CLIENT_SECRET') ?? '',
        scope: SCOPE,
        redirect_uri: this.redirectUri(),
        ...form,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresAt: new Date(
        Date.now() + response.data.expires_in * 1000,
      ).toISOString(),
    };
  }

  handleCallback(code: string): Promise<OAuthTokens> {
    return this.token({ grant_type: 'authorization_code', code });
  }

  async refreshToken(tokens: OAuthTokens): Promise<OAuthTokens> {
    if (!tokens.refreshToken) {
      throw new Error('No refresh token available for this connection');
    }
    const refreshed = await this.token({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
    });
    return {
      ...refreshed,
      refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
    };
  }

  async sync(tokens: OAuthTokens): Promise<unknown> {
    const response = await axios.get(
      `${GRAPH}/me?$select=displayName,userPrincipalName`,
      {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      },
    );
    return response.data;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- Microsoft has no token-revocation endpoint for delegated tokens; the app is removed from the user's account page
  async disconnect(): Promise<void> {
    return;
  }

  private body(event: CalendarEventInput) {
    return {
      subject: event.title,
      body: { contentType: 'text', content: event.description ?? '' },
      start: { dateTime: event.startsAt.replace(/Z$/, ''), timeZone: 'UTC' },
      end: { dateTime: event.endsAt.replace(/Z$/, ''), timeZone: 'UTC' },
    };
  }

  async createCalendarEvent(
    tokens: OAuthTokens,
    _meta: Record<string, unknown>,
    event: CalendarEventInput,
  ): Promise<{ externalId: string }> {
    const response = await axios.post<{ id: string }>(
      `${GRAPH}/me/events`,
      this.body(event),
      {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      },
    );
    return { externalId: response.data.id };
  }

  async updateCalendarEvent(
    tokens: OAuthTokens,
    _meta: Record<string, unknown>,
    externalId: string,
    event: CalendarEventInput,
  ): Promise<void> {
    await axios.patch(
      `${GRAPH}/me/events/${encodeURIComponent(externalId)}`,
      this.body(event),
      {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      },
    );
  }

  async deleteCalendarEvent(
    tokens: OAuthTokens,
    _meta: Record<string, unknown>,
    externalId: string,
  ): Promise<void> {
    await axios.delete(`${GRAPH}/me/events/${encodeURIComponent(externalId)}`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
  }
}
