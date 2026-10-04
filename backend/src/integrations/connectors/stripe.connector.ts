import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  Connector,
  ExternalPaymentInput,
  OAuthTokens,
} from '../connector.interface';
import { IntegrationProvider } from '@prisma/client';

const AUTHORIZE_URL = 'https://connect.stripe.com/oauth/authorize';
const TOKEN_URL = 'https://connect.stripe.com/oauth/token';
const DEAUTHORIZE_URL = 'https://connect.stripe.com/oauth/deauthorize';
const API = 'https://api.stripe.com/v1';

/** Currencies Stripe expresses in whole units rather than hundredths. */
const ZERO_DECIMAL = new Set([
  'bif',
  'clp',
  'djf',
  'gnf',
  'jpy',
  'kmf',
  'krw',
  'mga',
  'pyg',
  'rwf',
  'ugx',
  'vnd',
  'vuv',
  'xaf',
  'xof',
  'xpf',
]);

interface StripeTokenResponse {
  access_token: string;
  refresh_token?: string;
  stripe_user_id: string;
  livemode: boolean;
  scope?: string;
}

interface StripeList<T> {
  data: T[];
  has_more: boolean;
}
interface StripeCharge {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created: number;
}
interface StripeRefund {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created: number;
}
interface StripePayout {
  id: string;
  amount: number;
  currency: string;
  status: string;
  arrival_date: number;
}

/**
 * Stripe connector — Stripe Connect (standard) with the `read_write` scope, so Payments & Billing
 * can take payments, capture, refund, answer disputes and read payouts on the business's own
 * account (the platform key acts on it through the Stripe-Account header). The platform's secret
 * key for this mode authenticates the OAuth token exchange (Stripe's documented Connect flow).
 * Connections made before the read_write upgrade keep `scope: read_only` in their meta and stay
 * read-only until reconnected. `StripeTestConnector` is the same flow in Stripe test mode.
 */
@Injectable()
export class StripeConnector implements Connector {
  readonly provider: IntegrationProvider = IntegrationProvider.stripe;
  protected readonly mode: 'live' | 'test' = 'live';

  constructor(protected readonly config: ConfigService) {}

  protected clientId(): string {
    return (
      this.config.get<string>(
        this.mode === 'test'
          ? 'STRIPE_CONNECT_CLIENT_ID_TEST'
          : 'STRIPE_CONNECT_CLIENT_ID',
      ) ?? ''
    );
  }

  protected secretKey(): string {
    return (
      this.config.get<string>(
        this.mode === 'test' ? 'STRIPE_TEST_SECRET_KEY' : 'STRIPE_SECRET_KEY',
      ) ?? ''
    );
  }

  private redirectUri(): string {
    const backendUrl =
      this.config.get<string>('BACKEND_URL') ?? 'http://localhost:5000/api/v1';
    return `${backendUrl}/integrations/${this.provider}/callback`;
  }

  authUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId(),
      scope: 'read_write',
      redirect_uri: this.redirectUri(),
      state,
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async handleCallback(code: string): Promise<OAuthTokens> {
    const response = await axios.post<StripeTokenResponse>(
      TOKEN_URL,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        auth: {
          username: this.secretKey(),
          password: '',
        },
      },
    );
    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      providerMeta: {
        accountId: response.data.stripe_user_id,
        livemode: response.data.livemode,
        scope: response.data.scope ?? 'read_write',
      },
    };
  }

  /** Standard-account Connect access tokens do not expire, so there is nothing to renew. */
  // eslint-disable-next-line @typescript-eslint/require-await -- no refresh grant is needed for a non-expiring token
  async refreshToken(tokens: OAuthTokens): Promise<OAuthTokens> {
    return tokens;
  }

  async sync(tokens: OAuthTokens): Promise<unknown> {
    const response = await axios.get(`${API}/balance`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    return response.data;
  }

  async disconnect(tokens?: OAuthTokens): Promise<void> {
    const accountId = tokens?.providerMeta?.accountId as string | undefined;
    if (!accountId) return;
    await axios.post(
      DEAUTHORIZE_URL,
      new URLSearchParams({
        client_id: this.clientId(),
        stripe_user_id: accountId,
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        auth: {
          username: this.secretKey(),
          password: '',
        },
      },
    );
  }

  private major(amount: number, currency: string): number {
    return ZERO_DECIMAL.has(currency.toLowerCase()) ? amount : amount / 100;
  }

  async fetchPayments(
    tokens: OAuthTokens,
    _meta: Record<string, unknown>,
    sinceIso?: string,
  ): Promise<ExternalPaymentInput[]> {
    const since = Math.floor(
      (sinceIso ? new Date(sinceIso).getTime() : Date.now() - 30 * 86_400_000) /
        1000,
    );
    const headers = { Authorization: `Bearer ${tokens.accessToken}` };
    const params = { limit: 100, 'created[gte]': since };

    const [charges, refunds, payouts] = await Promise.all([
      axios.get<StripeList<StripeCharge>>(`${API}/charges`, {
        headers,
        params,
      }),
      axios.get<StripeList<StripeRefund>>(`${API}/refunds`, {
        headers,
        params,
      }),
      axios.get<StripeList<StripePayout>>(`${API}/payouts`, {
        headers,
        params,
      }),
    ]);

    return [
      ...charges.data.data.map((c) => ({
        externalId: c.id,
        kind: 'charge' as const,
        status: c.status,
        amount: this.major(c.amount, c.currency),
        currency: c.currency.toUpperCase(),
        occurredAt: new Date(c.created * 1000).toISOString(),
      })),
      ...refunds.data.data.map((r) => ({
        externalId: r.id,
        kind: 'refund' as const,
        status: r.status,
        amount: this.major(r.amount, r.currency),
        currency: r.currency.toUpperCase(),
        occurredAt: new Date(r.created * 1000).toISOString(),
      })),
      ...payouts.data.data.map((p) => ({
        externalId: p.id,
        kind: 'payout' as const,
        status: p.status,
        amount: this.major(p.amount, p.currency),
        currency: p.currency.toUpperCase(),
        occurredAt: new Date(p.arrival_date * 1000).toISOString(),
      })),
    ];
  }
}

/** The same Stripe Connect flow in Stripe test mode (sandbox keys, test data only). */
@Injectable()
export class StripeTestConnector extends StripeConnector {
  override readonly provider: IntegrationProvider =
    IntegrationProvider.stripe_test;
  protected override readonly mode = 'test' as const;
}
