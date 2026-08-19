import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  Connector,
  CreateCampaignParams,
  CreateCampaignResult,
  OAuthTokens,
} from '../connector.interface';
import { IntegrationProvider } from '@prisma/client';

const AUTHORIZE_URL =
  'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const SCOPE = 'https://ads.microsoft.com/msads.manage offline_access';

interface MicrosoftTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

/**
 * Microsoft Advertising (Bing Ads) connector (UPD-BE-069) — same Microsoft identity-platform
 * OAuth2 mechanics as `BingPlacesConnector`, but a distinct real app registration/scope: this one
 * additionally needs `MICROSOFT_ADS_DEVELOPER_TOKEN` on every Campaign Management API call, a real
 * quirk of Microsoft's advertising APIs specifically (not shared with Bing Places).
 */
@Injectable()
export class MicrosoftAdsConnector implements Connector {
  readonly provider = IntegrationProvider.microsoft_ads;

  constructor(private readonly config: ConfigService) {}

  private redirectUri(): string {
    const backendUrl =
      this.config.get<string>('BACKEND_URL') ?? 'http://localhost:5000/api/v1';
    return `${backendUrl}/integrations/microsoft_ads/callback`;
  }

  authUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.get<string>('MICROSOFT_ADS_CLIENT_ID') ?? '',
      redirect_uri: this.redirectUri(),
      scope: SCOPE,
      state,
      response_type: 'code',
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async handleCallback(code: string): Promise<OAuthTokens> {
    const response = await axios.post<MicrosoftTokenResponse>(
      TOKEN_URL,
      new URLSearchParams({
        client_id: this.config.get<string>('MICROSOFT_ADS_CLIENT_ID') ?? '',
        client_secret:
          this.config.get<string>('MICROSOFT_ADS_CLIENT_SECRET') ?? '',
        redirect_uri: this.redirectUri(),
        grant_type: 'authorization_code',
        code,
      }),
    );
    return this.mapTokenResponse(response.data);
  }

  async refreshToken(tokens: OAuthTokens): Promise<OAuthTokens> {
    const response = await axios.post<MicrosoftTokenResponse>(
      TOKEN_URL,
      new URLSearchParams({
        client_id: this.config.get<string>('MICROSOFT_ADS_CLIENT_ID') ?? '',
        client_secret:
          this.config.get<string>('MICROSOFT_ADS_CLIENT_SECRET') ?? '',
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken ?? '',
      }),
    );
    return this.mapTokenResponse(response.data);
  }

  private developerHeaders(tokens: OAuthTokens) {
    return {
      AuthenticationToken: tokens.accessToken,
      DeveloperToken:
        this.config.get<string>('MICROSOFT_ADS_DEVELOPER_TOKEN') ?? '',
      'Content-Type': 'application/json',
    };
  }

  /** Lists the real advertiser accounts the connected user can manage. */
  async sync(tokens: OAuthTokens): Promise<unknown> {
    const response = await axios.post(
      'https://clientcenter.api.bingads.microsoft.com/CustomerManagement/v13/Accounts/Search',
      { PageInfo: { Index: 0, Size: 100 }, Predicates: [] },
      { headers: this.developerHeaders(tokens) },
    );
    return response.data;
  }

  /** `meta.accountId`/`meta.customerId` (real Microsoft Advertising ids, e.g. from a prior `sync()` selection) are required. */
  async createCampaign(
    tokens: OAuthTokens,
    params: CreateCampaignParams,
    meta: Record<string, unknown>,
  ): Promise<CreateCampaignResult> {
    const accountId = meta.accountId as string | undefined;
    const customerId = meta.customerId as string | undefined;
    if (!accountId || !customerId) {
      throw new Error(
        'No Microsoft Advertising account selected for this business',
      );
    }
    const response = await axios.post<{ CampaignIds: string[] }>(
      'https://campaign.api.bingads.microsoft.com/CampaignManagement/v13/Campaigns',
      {
        Campaigns: [
          {
            Name: params.name,
            CampaignType: 'Search',
            Status: 'Paused',
            DailyBudget: params.dailyBudget,
            BudgetType: 'DailyBudgetStandard',
          },
        ],
      },
      {
        headers: {
          ...this.developerHeaders(tokens),
          CustomerAccountId: accountId,
          CustomerId: customerId,
        },
      },
    );
    return { externalId: response.data.CampaignIds[0] };
  }

  async disconnect(): Promise<void> {
    // Real revocation is a Microsoft identity-platform token-revocation call — left as a
    // documented no-op, same reasoning as every other connector's disconnect().
  }

  private mapTokenResponse(data: MicrosoftTokenResponse): OAuthTokens {
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : undefined,
    };
  }
}
