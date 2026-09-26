import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Connector, OAuthTokens } from '../connector.interface';
import { IntegrationProvider } from '@prisma/client';

/**
 * WhatsApp Business connector — the business's own WhatsApp Cloud API credentials (phone-number
 * id + a permanent system-user access token, pasted from Meta's API setup page). They are verified
 * with a real Graph API request before being stored, and once connected `WhatsappService` sends
 * that business's messages from its own number instead of the shared platform one. Message
 * templates must be approved in the business's own WhatsApp Business account.
 */
@Injectable()
export class WhatsAppConnector implements Connector {
  readonly provider = IntegrationProvider.whatsapp;

  constructor(private readonly config: ConfigService) {}

  authUrl(): null {
    return null;
  }

  private version(): string {
    return this.config.get<string>('META_WA_API_VERSION') ?? 'v19.0';
  }

  async handleCallback(
    _code: string,
    rawQuery: Record<string, string> = {},
  ): Promise<OAuthTokens> {
    const { phoneNumberId, accessToken } = rawQuery;
    if (!phoneNumberId || !accessToken) {
      throw new Error(
        'WhatsApp requires a phone number ID and an access token',
      );
    }
    const response = await axios.get<{
      display_phone_number?: string;
      verified_name?: string;
    }>(`https://graph.facebook.com/${this.version()}/${phoneNumberId}`, {
      params: { fields: 'display_phone_number,verified_name' },
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return {
      accessToken,
      providerMeta: {
        phoneNumberId,
        displayPhoneNumber: response.data.display_phone_number ?? null,
        verifiedName: response.data.verified_name ?? null,
      },
    };
  }

  /** A permanent system-user token does not expire. */
  // eslint-disable-next-line @typescript-eslint/require-await -- nothing to renew
  async refreshToken(tokens: OAuthTokens): Promise<OAuthTokens> {
    return tokens;
  }

  async sync(tokens: OAuthTokens): Promise<unknown> {
    const phoneNumberId = tokens.providerMeta?.phoneNumberId as
      string | undefined;
    if (!phoneNumberId) return { connected: false };
    const response = await axios.get(
      `https://graph.facebook.com/${this.version()}/${phoneNumberId}`,
      {
        params: { fields: 'display_phone_number,verified_name,quality_rating' },
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      },
    );
    return response.data;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- the token is revoked from Meta's own settings; the stored copy is discarded
  async disconnect(): Promise<void> {
    return;
  }
}
