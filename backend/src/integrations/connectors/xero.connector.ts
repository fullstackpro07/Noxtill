import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  AccountingInvoiceInput,
  AccountingInvoiceResult,
  Connector,
  OAuthTokens,
} from '../connector.interface';
import { IntegrationProvider } from '@prisma/client';

const AUTHORIZE_URL = 'https://login.xero.com/identity/connect/authorize';
const TOKEN_URL = 'https://identity.xero.com/connect/token';
const REVOKE_URL = 'https://identity.xero.com/connect/revocation';
const SCOPE =
  'openid profile email accounting.transactions accounting.contacts offline_access';

interface XeroTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface XeroConnection {
  tenantId: string;
  tenantName: string;
}

/**
 * Xero connector (UPD-BE-072) — unlike QuickBooks, Xero's OAuth2 callback never delivers the
 * tenant id directly: `handleCallback` makes a real, immediate follow-up call to
 * `GET /connections` (using the freshly-issued access token) to discover it, taking the first
 * authorized tenant. Also unlike QuickBooks, Xero's Invoice API accepts a bare `Contact.Name` and
 * auto-matches-or-creates the contact server-side — no local customer sync or pre-configured
 * default contact id is required, a real and deliberate asymmetry between the two providers.
 */
@Injectable()
export class XeroConnector implements Connector {
  readonly provider = IntegrationProvider.xero;

  constructor(private readonly config: ConfigService) {}

  private redirectUri(): string {
    const backendUrl =
      this.config.get<string>('BACKEND_URL') ?? 'http://localhost:5000/api/v1';
    return `${backendUrl}/integrations/xero/callback`;
  }

  authUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.get<string>('XERO_CLIENT_ID') ?? '',
      redirect_uri: this.redirectUri(),
      scope: SCOPE,
      state,
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async handleCallback(code: string): Promise<OAuthTokens> {
    const response = await axios.post<XeroTokenResponse>(
      TOKEN_URL,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri(),
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        auth: {
          username: this.config.get<string>('XERO_CLIENT_ID') ?? '',
          password: this.config.get<string>('XERO_CLIENT_SECRET') ?? '',
        },
      },
    );
    const tokens = this.mapTokenResponse(response.data);

    const connections = await axios.get<XeroConnection[]>(
      'https://api.xero.com/connections',
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    const tenantId = connections.data[0]?.tenantId;
    return {
      ...tokens,
      providerMeta: tenantId ? { tenantId } : undefined,
    };
  }

  async refreshToken(tokens: OAuthTokens): Promise<OAuthTokens> {
    const response = await axios.post<XeroTokenResponse>(
      TOKEN_URL,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken ?? '',
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        auth: {
          username: this.config.get<string>('XERO_CLIENT_ID') ?? '',
          password: this.config.get<string>('XERO_CLIENT_SECRET') ?? '',
        },
      },
    );
    return this.mapTokenResponse(response.data);
  }

  async sync(tokens: OAuthTokens): Promise<unknown> {
    const response = await axios.get<XeroConnection[]>(
      'https://api.xero.com/connections',
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    return response.data;
  }

  async disconnect(tokens?: OAuthTokens): Promise<void> {
    if (!tokens?.refreshToken) return;
    await axios
      .post(
        REVOKE_URL,
        new URLSearchParams({
          token: tokens.refreshToken,
        }).toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          auth: {
            username: this.config.get<string>('XERO_CLIENT_ID') ?? '',
            password: this.config.get<string>('XERO_CLIENT_SECRET') ?? '',
          },
        },
      )
      .catch(() => undefined);
  }

  async pushInvoice(
    tokens: OAuthTokens,
    meta: Record<string, unknown>,
    invoice: AccountingInvoiceInput,
  ): Promise<AccountingInvoiceResult> {
    const tenantId = meta.tenantId as string | undefined;
    if (!tenantId) {
      throw new Error('No Xero organisation connected for this business');
    }

    const response = await axios.post<{
      Invoices: { InvoiceID: string }[];
    }>(
      'https://api.xero.com/api.xro/2.0/Invoices',
      {
        Invoices: [
          {
            Type: 'ACCREC',
            Contact: { Name: invoice.customerName ?? 'Walk-in Customer' },
            LineItems: invoice.lines.map((line) => ({
              Description: line.description,
              Quantity: line.qty,
              UnitAmount: line.unitAmount,
              AccountCode: line.accountCode,
              ...(line.taxCode ? { TaxType: line.taxCode } : {}),
            })),
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          'Xero-tenant-id': tenantId,
        },
      },
    );
    return { externalId: response.data.Invoices[0].InvoiceID };
  }

  private mapTokenResponse(data: XeroTokenResponse): OAuthTokens {
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    };
  }
}
