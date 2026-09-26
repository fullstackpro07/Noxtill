import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  Connector,
  ExternalPaymentInput,
  OAuthTokens,
} from '../connector.interface';
import { IntegrationProvider } from '@prisma/client';

interface PayPalTokenResponse {
  access_token: string;
  expires_in: number;
}

interface PayPalTransaction {
  transaction_info: {
    transaction_id: string;
    transaction_event_code?: string;
    transaction_status?: string;
    transaction_initiation_date: string;
    transaction_amount: { currency_code: string; value: string };
  };
}

/**
 * PayPal connector — not OAuth: the merchant creates a REST app in their own PayPal developer
 * dashboard and pastes its client id and secret (the same manual-credential pattern as
 * WooCommerce). The credentials are verified with a real client-credentials token request before
 * anything is stored. The secret is kept (encrypted, in `refreshToken`) so the short-lived access
 * token can be renewed. Transactions are read-only via the Reporting API.
 *
 * `PAYPAL_API_BASE` selects sandbox (`https://api-m.sandbox.paypal.com`) or live (default).
 */
@Injectable()
export class PayPalConnector implements Connector {
  readonly provider = IntegrationProvider.paypal;

  constructor(private readonly config: ConfigService) {}

  private base(): string {
    return (
      this.config.get<string>('PAYPAL_API_BASE') ?? 'https://api-m.paypal.com'
    );
  }

  authUrl(): null {
    return null;
  }

  private async token(
    clientId: string,
    clientSecret: string,
  ): Promise<OAuthTokens> {
    const response = await axios.post<PayPalTokenResponse>(
      `${this.base()}/v1/oauth2/token`,
      new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        auth: { username: clientId, password: clientSecret },
      },
    );
    return {
      accessToken: response.data.access_token,
      refreshToken: clientSecret,
      expiresAt: new Date(
        Date.now() + response.data.expires_in * 1000,
      ).toISOString(),
      providerMeta: { clientId },
    };
  }

  async handleCallback(
    _code: string,
    rawQuery: Record<string, string> = {},
  ): Promise<OAuthTokens> {
    const { clientId, clientSecret } = rawQuery;
    if (!clientId || !clientSecret) {
      throw new Error('PayPal requires a client ID and a client secret');
    }
    return this.token(clientId, clientSecret);
  }

  async refreshToken(tokens: OAuthTokens): Promise<OAuthTokens> {
    const clientId = tokens.providerMeta?.clientId as string | undefined;
    if (!clientId || !tokens.refreshToken) {
      throw new Error('PayPal credentials are missing — reconnect');
    }
    return this.token(clientId, tokens.refreshToken);
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- the connect step already proved the credentials with a token request
  async sync(): Promise<unknown> {
    return { status: 'ok' };
  }

  async disconnect(): Promise<void> {
    // PayPal REST app credentials are revoked by deleting the app in PayPal; nothing to call here.
  }

  async fetchPayments(
    tokens: OAuthTokens,
    _meta: Record<string, unknown>,
    sinceIso?: string,
  ): Promise<ExternalPaymentInput[]> {
    // The Reporting API allows at most a 31-day window per request.
    const end = new Date();
    const floor = new Date(end.getTime() - 31 * 86_400_000);
    const start =
      sinceIso && new Date(sinceIso) > floor ? new Date(sinceIso) : floor;
    const response = await axios.get<{
      transaction_details?: PayPalTransaction[];
    }>(`${this.base()}/v1/reporting/transactions`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
      params: {
        start_date: start.toISOString(),
        end_date: end.toISOString(),
        fields: 'transaction_info',
        page_size: 100,
      },
    });
    return (response.data.transaction_details ?? []).map((t) => {
      const info = t.transaction_info;
      const value = Number(info.transaction_amount.value);
      // T11xx event codes are reversals/refunds; everything else is money received.
      const refund = (info.transaction_event_code ?? '').startsWith('T11');
      return {
        externalId: info.transaction_id,
        kind: refund ? ('refund' as const) : ('charge' as const),
        status: (info.transaction_status ?? 'unknown').toLowerCase(),
        amount: Math.abs(value),
        currency: info.transaction_amount.currency_code,
        occurredAt: info.transaction_initiation_date,
      };
    });
  }
}
