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

const AUTHORIZE_URL = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/token/revoke';
const SCOPE = 'com.intuit.quickbooks.accounting';

interface QuickBooksTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/**
 * QuickBooks connector (UPD-BE-072) — a real quirk unlike every other connector in this codebase:
 * the callback redirect delivers `realmId` (the QuickBooks company id every API call is scoped
 * under) as its own sibling query param, not inside the token response — `handleCallback` reads
 * it straight off `rawQuery` and carries it forward via `providerMeta`. Invoicing further requires
 * a real, existing QuickBooks Customer id (`meta.defaultCustomerRef`) — QBO's API rejects an
 * Invoice with no `CustomerRef.value`, and this codebase has no QuickBooks customer sync yet, so
 * that id must be configured once per business (a disclosed scope boundary, same reasoning as
 * `AdCampaign.meta.adAccountId` requiring a prior manual selection in UPD-BE-069).
 */
@Injectable()
export class QuickBooksConnector implements Connector {
  readonly provider = IntegrationProvider.quickbooks;

  constructor(private readonly config: ConfigService) {}

  private redirectUri(): string {
    const backendUrl =
      this.config.get<string>('BACKEND_URL') ?? 'http://localhost:5000/api/v1';
    return `${backendUrl}/integrations/quickbooks/callback`;
  }

  private apiBase(realmId: string): string {
    const base =
      this.config.get<string>('QUICKBOOKS_API_BASE') ??
      'https://sandbox-quickbooks.api.intuit.com';
    return `${base}/v3/company/${realmId}`;
  }

  authUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.get<string>('QUICKBOOKS_CLIENT_ID') ?? '',
      redirect_uri: this.redirectUri(),
      scope: SCOPE,
      state,
      response_type: 'code',
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async handleCallback(
    code: string,
    rawQuery: Record<string, string> = {},
  ): Promise<OAuthTokens> {
    const response = await axios.post<QuickBooksTokenResponse>(
      TOKEN_URL,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri(),
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        auth: {
          username: this.config.get<string>('QUICKBOOKS_CLIENT_ID') ?? '',
          password: this.config.get<string>('QUICKBOOKS_CLIENT_SECRET') ?? '',
        },
      },
    );
    return {
      ...this.mapTokenResponse(response.data),
      providerMeta: rawQuery.realmId
        ? { realmId: rawQuery.realmId }
        : undefined,
    };
  }

  async refreshToken(tokens: OAuthTokens): Promise<OAuthTokens> {
    const response = await axios.post<QuickBooksTokenResponse>(
      TOKEN_URL,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken ?? '',
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        auth: {
          username: this.config.get<string>('QUICKBOOKS_CLIENT_ID') ?? '',
          password: this.config.get<string>('QUICKBOOKS_CLIENT_SECRET') ?? '',
        },
      },
    );
    return this.mapTokenResponse(response.data);
  }

  /** OpenID Connect userinfo — proves the token works without needing `realmId`, unlike every other real QBO call. */
  async sync(tokens: OAuthTokens): Promise<unknown> {
    const response = await axios.get(
      'https://accounts.platform.intuit.com/v1/openid_connect/userinfo',
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    return response.data;
  }

  async disconnect(tokens?: OAuthTokens): Promise<void> {
    if (!tokens?.refreshToken) return;
    await axios
      .post(
        REVOKE_URL,
        { token: tokens.refreshToken },
        {
          auth: {
            username: this.config.get<string>('QUICKBOOKS_CLIENT_ID') ?? '',
            password: this.config.get<string>('QUICKBOOKS_CLIENT_SECRET') ?? '',
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
    const realmId = meta.realmId as string | undefined;
    if (!realmId) {
      throw new Error(
        'No QuickBooks company (realmId) connected for this business',
      );
    }
    const defaultCustomerRef = meta.defaultCustomerRef as string | undefined;
    if (!defaultCustomerRef) {
      throw new Error(
        'No default QuickBooks customer configured for this business (meta.defaultCustomerRef)',
      );
    }

    const response = await axios.post<{ Invoice: { Id: string } }>(
      `${this.apiBase(realmId)}/invoice`,
      {
        CustomerRef: { value: defaultCustomerRef },
        Line: invoice.lines.map((line) => ({
          DetailType: 'SalesItemLineDetail',
          Amount: Math.round(line.qty * line.unitAmount * 100) / 100,
          Description: line.description,
          SalesItemLineDetail: {
            Qty: line.qty,
            UnitPrice: line.unitAmount,
            ItemRef: { value: line.accountCode },
            ...(line.taxCode ? { TaxCodeRef: { value: line.taxCode } } : {}),
          },
        })),
      },
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    return { externalId: response.data.Invoice.Id };
  }

  private mapTokenResponse(data: QuickBooksTokenResponse): OAuthTokens {
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    };
  }
}
