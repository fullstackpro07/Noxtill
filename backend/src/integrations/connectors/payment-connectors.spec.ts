import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { StripeConnector } from './stripe.connector';
import { SquareConnector } from './square.connector';
import { PayPalConnector } from './paypal.connector';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const config = new ConfigService({
  BACKEND_URL: 'http://localhost:5000/api/v1',
  STRIPE_CONNECT_CLIENT_ID: 'ca_test',
  STRIPE_SECRET_KEY: 'sk_test',
  SQUARE_CLIENT_ID: 'sq_id',
  SQUARE_CLIENT_SECRET: 'sq_secret',
});

afterEach(() => jest.resetAllMocks());

describe('StripeConnector', () => {
  const connector = new StripeConnector(config);

  it('builds a Connect authorize URL that asks for read_only access only', () => {
    const url = new URL(connector.authUrl('state-1'));
    expect(url.origin + url.pathname).toBe(
      'https://connect.stripe.com/oauth/authorize',
    );
    expect(url.searchParams.get('scope')).toBe('read_only');
    expect(url.searchParams.get('client_id')).toBe('ca_test');
    expect(url.searchParams.get('state')).toBe('state-1');
  });

  it('exchanges the code with the platform secret key and keeps the connected account id', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        access_token: 'sk_acct',
        refresh_token: 'rt',
        stripe_user_id: 'acct_123',
        livemode: true,
      },
    });
    const tokens = await connector.handleCallback('code-1');
    expect(tokens).toMatchObject({
      accessToken: 'sk_acct',
      providerMeta: { accountId: 'acct_123' },
    });
    const [url, body, options] = mockedAxios.post.mock.calls[0] as unknown as [
      string,
      string,
      { auth: { username: string } },
    ];
    expect(url).toBe('https://connect.stripe.com/oauth/token');
    expect(body).toContain('grant_type=authorization_code');
    expect(options.auth.username).toBe('sk_test');
  });

  it('reads charges, refunds and payouts and converts minor units to major units', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 'ch_1',
              amount: 1250,
              currency: 'usd',
              status: 'succeeded',
              created: 1_700_000_000,
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 're_1',
              amount: 500,
              currency: 'usd',
              status: 'succeeded',
              created: 1_700_000_100,
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 'po_1',
              amount: 5000,
              currency: 'jpy',
              status: 'paid',
              arrival_date: 1_700_000_200,
            },
          ],
        },
      });
    const rows = await connector.fetchPayments({ accessToken: 'tok' }, {});
    expect(rows).toEqual([
      expect.objectContaining({
        externalId: 'ch_1',
        kind: 'charge',
        amount: 12.5,
        currency: 'USD',
      }),
      expect.objectContaining({
        externalId: 're_1',
        kind: 'refund',
        amount: 5,
        currency: 'USD',
      }),
      // Yen has no minor unit — 5000 means ¥5000, not ¥50.00.
      expect.objectContaining({
        externalId: 'po_1',
        kind: 'payout',
        amount: 5000,
        currency: 'JPY',
      }),
    ]);
    const [, options] = mockedAxios.get.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(options.headers.Authorization).toBe('Bearer tok');
  });

  it('deauthorizes the connected account on disconnect', async () => {
    mockedAxios.post.mockResolvedValue({ data: {} });
    await connector.disconnect({
      accessToken: 'x',
      providerMeta: { accountId: 'acct_123' },
    });
    const [url, body] = mockedAxios.post.mock.calls[0] as [string, string];
    expect(url).toBe('https://connect.stripe.com/oauth/deauthorize');
    expect(body).toContain('stripe_user_id=acct_123');
  });
});

describe('SquareConnector', () => {
  const connector = new SquareConnector(config);

  it('requests read-only scopes', () => {
    const url = new URL(connector.authUrl('s'));
    expect(url.origin + url.pathname).toBe(
      'https://connect.squareup.com/oauth2/authorize',
    );
    expect(url.searchParams.get('scope')).toBe(
      'PAYMENTS_READ MERCHANT_PROFILE_READ',
    );
  });

  it('exchanges the code and keeps expiry, refresh token and merchant id', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        access_token: 'sq_tok',
        refresh_token: 'sq_rt',
        expires_at: '2027-01-01T00:00:00Z',
        merchant_id: 'M1',
      },
    });
    const tokens = await connector.handleCallback('c');
    expect(tokens).toMatchObject({
      accessToken: 'sq_tok',
      refreshToken: 'sq_rt',
      expiresAt: '2027-01-01T00:00:00Z',
      providerMeta: { merchantId: 'M1' },
    });
  });

  it('refuses to refresh without a refresh token', async () => {
    await expect(connector.refreshToken({ accessToken: 'x' })).rejects.toThrow(
      'No refresh token',
    );
  });

  it('reads payments and refunds as charges and refunds', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({
        data: {
          payments: [
            {
              id: 'p1',
              status: 'COMPLETED',
              created_at: '2026-09-01T10:00:00Z',
              amount_money: { amount: 4200, currency: 'USD' },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          refunds: [
            {
              id: 'r1',
              status: 'COMPLETED',
              created_at: '2026-09-02T10:00:00Z',
              amount_money: { amount: 700, currency: 'USD' },
            },
          ],
        },
      });
    const rows = await connector.fetchPayments({ accessToken: 'tok' }, {});
    expect(rows).toEqual([
      expect.objectContaining({
        externalId: 'p1',
        kind: 'charge',
        status: 'completed',
        amount: 42,
      }),
      expect.objectContaining({ externalId: 'r1', kind: 'refund', amount: 7 }),
    ]);
  });
});

describe('PayPalConnector', () => {
  const connector = new PayPalConnector(config);

  it('is a manual-credential connector (no OAuth redirect)', () => {
    expect(connector.authUrl()).toBeNull();
  });

  it('refuses to connect without both credentials', async () => {
    await expect(
      connector.handleCallback('', { clientId: 'only-id' }),
    ).rejects.toThrow('client secret');
  });

  it('proves the credentials with a real client-credentials token request before storing anything', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { access_token: 'pp_tok', expires_in: 32400 },
    });
    const tokens = await connector.handleCallback('', {
      clientId: 'cid',
      clientSecret: 'csecret',
    });
    expect(tokens).toMatchObject({
      accessToken: 'pp_tok',
      refreshToken: 'csecret',
      providerMeta: { clientId: 'cid' },
    });
    const [url, body, options] = mockedAxios.post.mock.calls[0] as [
      string,
      string,
      { auth: { username: string; password: string } },
    ];
    expect(url).toBe('https://api-m.paypal.com/v1/oauth2/token');
    expect(body).toBe('grant_type=client_credentials');
    expect(options.auth).toEqual({ username: 'cid', password: 'csecret' });
  });

  it('renews the access token from the stored client credentials', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { access_token: 'pp_new', expires_in: 100 },
    });
    const renewed = await connector.refreshToken({
      accessToken: 'old',
      refreshToken: 'csecret',
      providerMeta: { clientId: 'cid' },
    });
    expect(renewed.accessToken).toBe('pp_new');
  });

  it('reads transactions, treating T11xx event codes as refunds and using absolute amounts', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        transaction_details: [
          {
            transaction_info: {
              transaction_id: 'T1',
              transaction_event_code: 'T0006',
              transaction_status: 'S',
              transaction_initiation_date: '2026-09-01T00:00:00Z',
              transaction_amount: { currency_code: 'USD', value: '30.00' },
            },
          },
          {
            transaction_info: {
              transaction_id: 'T2',
              transaction_event_code: 'T1107',
              transaction_status: 'S',
              transaction_initiation_date: '2026-09-02T00:00:00Z',
              transaction_amount: { currency_code: 'USD', value: '-10.00' },
            },
          },
        ],
      },
    });
    const rows = await connector.fetchPayments({ accessToken: 'tok' }, {});
    expect(rows).toEqual([
      expect.objectContaining({ externalId: 'T1', kind: 'charge', amount: 30 }),
      expect.objectContaining({ externalId: 'T2', kind: 'refund', amount: 10 }),
    ]);
  });
});
