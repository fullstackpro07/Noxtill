import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Connector, MeetingInput, OAuthTokens } from '../connector.interface';
import { IntegrationProvider } from '@prisma/client';

const AUTHORIZE_URL = 'https://zoom.us/oauth/authorize';
const TOKEN_URL = 'https://zoom.us/oauth/token';
const REVOKE_URL = 'https://zoom.us/oauth/revoke';
const API = 'https://api.zoom.us/v2';

interface ZoomTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/**
 * Zoom connector — OAuth2 (authorization code). Creates a scheduled meeting for a booking and
 * returns its join link; it does not read recordings, participants or the account's meetings.
 */
@Injectable()
export class ZoomConnector implements Connector {
  readonly provider = IntegrationProvider.zoom;

  constructor(private readonly config: ConfigService) {}

  private redirectUri(): string {
    const backendUrl =
      this.config.get<string>('BACKEND_URL') ?? 'http://localhost:5000/api/v1';
    return `${backendUrl}/integrations/zoom/callback`;
  }

  private basicAuth() {
    return {
      username: this.config.get<string>('ZOOM_CLIENT_ID') ?? '',
      password: this.config.get<string>('ZOOM_CLIENT_SECRET') ?? '',
    };
  }

  authUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.get<string>('ZOOM_CLIENT_ID') ?? '',
      redirect_uri: this.redirectUri(),
      state,
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  private map(data: ZoomTokenResponse): OAuthTokens {
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    };
  }

  async handleCallback(code: string): Promise<OAuthTokens> {
    const response = await axios.post<ZoomTokenResponse>(
      TOKEN_URL,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri(),
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        auth: this.basicAuth(),
      },
    );
    return this.map(response.data);
  }

  async refreshToken(tokens: OAuthTokens): Promise<OAuthTokens> {
    if (!tokens.refreshToken) {
      throw new Error('No refresh token available for this connection');
    }
    const response = await axios.post<ZoomTokenResponse>(
      TOKEN_URL,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken,
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        auth: this.basicAuth(),
      },
    );
    return this.map(response.data);
  }

  async sync(tokens: OAuthTokens): Promise<unknown> {
    const response = await axios.get(`${API}/users/me`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    return response.data;
  }

  async disconnect(tokens?: OAuthTokens): Promise<void> {
    if (!tokens) return;
    await axios.post(
      REVOKE_URL,
      new URLSearchParams({ token: tokens.accessToken }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        auth: this.basicAuth(),
      },
    );
  }

  async createMeeting(
    tokens: OAuthTokens,
    _meta: Record<string, unknown>,
    meeting: MeetingInput,
  ): Promise<{ externalId: string; joinUrl: string }> {
    const response = await axios.post<{ id: number; join_url: string }>(
      `${API}/users/me/meetings`,
      {
        topic: meeting.topic,
        type: 2,
        start_time: meeting.startsAt,
        duration: meeting.durationMinutes,
        timezone: 'UTC',
      },
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    return {
      externalId: String(response.data.id),
      joinUrl: response.data.join_url,
    };
  }
}
