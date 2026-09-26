import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  Connector,
  ExternalPaymentInput,
  OAuthTokens,
} from '../connector.interface';
import { IntegrationProvider } from '@prisma/client';

const AUTHORIZE_URL = 'https://connect.squareup.com/oauth2/authorize';
const TOKEN_URL = 'https://connect.squareup.com/oauth2/token';
const REVOKE_URL = 'https://connect.squareup.com/oauth2/revoke';
const API = 'https://connect.squareup.com/v2';
const SQUARE_VERSION = '2024-10-17';
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'UGX']);

interface SquareTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
  merchant_id: string;
}
interface SquareMoney {
  amount: number;
  currency: string;
}
interface SquarePayment {
  id: string;
  status: string;
  created_at: string;
  amount_money: SquareMoney;
}
interface SquareRefund {
  id: string;
  status: string;
  created_at: string;
  amount_money: SquareMoney;
}

/**
 * Square connector — OAuth with read-only scopes (`PAYMENTS_READ`, `MERCHANT_PROFILE_READ`).
 * Payments and refunds are read into `ExternalPayment`; nothing in the Square account is changed.
 */
@Injectable()
export class SquareConnector implements Connector {
  readonly provider = IntegrationProvider.square;

  constructor(private readonly config: ConfigService) {}

  private redirectUri(): string {
    const backendUrl =
      this.config.get<string>('BACKEND_URL') ?? 'http://localhost:5000/api/v1';
    return `${backendUrl}/integrations/square/callback`;
  }

  authUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.get<string>('SQUARE_CLIENT_ID') ?? '',
      scope: 'PAYMENTS_READ MERCHANT_PROFILE_READ',
      session: 'false',
      state,
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async handleCallback(code: string): Promise<OAuthTokens> {
    const response = await axios.post<SquareTokenResponse>(TOKEN_URL, {
      client_id: this.config.get<string>('SQUARE_CLIENT_ID') ?? '',
      client_secret: this.config.get<string>('SQUARE_CLIENT_SECRET') ?? '',
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri(),
    });
    return this.map(response.data);
  }

  async refreshToken(tokens: OAuthTokens): Promise<OAuthTokens> {
    if (!tokens.refreshToken) {
      throw new Error('No refresh token available for this connection');
    }
    const response = await axios.post<SquareTokenResponse>(TOKEN_URL, {
      client_id: this.config.get<string>('SQUARE_CLIENT_ID') ?? '',
      client_secret: this.config.get<string>('SQUARE_CLIENT_SECRET') ?? '',
      refresh_token: tokens.refreshToken,
      grant_type: 'refresh_token',
    });
    return {
      ...this.map(response.data),
      providerMeta: tokens.providerMeta ?? this.map(response.data).providerMeta,
    };
  }

  private map(data: SquareTokenResponse): OAuthTokens {
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at,
      providerMeta: { merchantId: data.merchant_id },
    };
  }

  async sync(tokens: OAuthTokens): Promise<unknown> {
    const response = await axios.get(`${API}/merchants/me`, {
      headers: this.headers(tokens),
    });
    return response.data;
  }

  async disconnect(tokens?: OAuthTokens): Promise<void> {
    if (!tokens) return;
    await axios.post(
      REVOKE_URL,
      {
        client_id: this.config.get<string>('SQUARE_CLIENT_ID') ?? '',
        access_token: tokens.accessToken,
      },
      {
        headers: {
          Authorization: `Client ${this.config.get<string>('SQUARE_CLIENT_SECRET') ?? ''}`,
        },
      },
    );
  }

  private headers(tokens: OAuthTokens) {
    return {
      Authorization: `Bearer ${tokens.accessToken}`,
      'Square-Version': SQUARE_VERSION,
    };
  }

  private major(m: SquareMoney): number {
    return ZERO_DECIMAL.has(m.currency) ? m.amount : m.amount / 100;
  }

  async fetchPayments(
    tokens: OAuthTokens,
    _meta: Record<string, unknown>,
    sinceIso?: string,
  ): Promise<ExternalPaymentInput[]> {
    const begin =
      sinceIso ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
    const params = { begin_time: begin, limit: 100, sort_order: 'ASC' };
    const [payments, refunds] = await Promise.all([
      axios.get<{ payments?: SquarePayment[] }>(`${API}/payments`, {
        headers: this.headers(tokens),
        params,
      }),
      axios.get<{ refunds?: SquareRefund[] }>(`${API}/refunds`, {
        headers: this.headers(tokens),
        params,
      }),
    ]);
    return [
      ...(payments.data.payments ?? []).map((p) => ({
        externalId: p.id,
        kind: 'charge' as const,
        status: p.status.toLowerCase(),
        amount: this.major(p.amount_money),
        currency: p.amount_money.currency,
        occurredAt: p.created_at,
      })),
      ...(refunds.data.refunds ?? []).map((r) => ({
        externalId: r.id,
        kind: 'refund' as const,
        status: r.status.toLowerCase(),
        amount: this.major(r.amount_money),
        currency: r.amount_money.currency,
        occurredAt: r.created_at,
      })),
    ];
  }
}
