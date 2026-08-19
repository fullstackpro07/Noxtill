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

const AUTHORIZE_URL = 'https://www.amazon.com/ap/oa';
const TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
const SCOPE = 'advertising::campaign_management';

interface AmazonTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

/**
 * Amazon Ads connector (UPD-BE-069) — Login with Amazon (LWA), a real quirk distinct from a
 * generic OAuth2 app: every Advertising API call also needs the raw `client_id` on an
 * `Amazon-Advertising-API-ClientId` header alongside the bearer token, not just at token exchange.
 */
@Injectable()
export class AmazonAdsConnector implements Connector {
  readonly provider = IntegrationProvider.amazon_ads;

  constructor(private readonly config: ConfigService) {}

  private redirectUri(): string {
    const backendUrl =
      this.config.get<string>('BACKEND_URL') ?? 'http://localhost:5000/api/v1';
    return `${backendUrl}/integrations/amazon_ads/callback`;
  }

  authUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.get<string>('AMAZON_ADS_CLIENT_ID') ?? '',
      redirect_uri: this.redirectUri(),
      scope: SCOPE,
      state,
      response_type: 'code',
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async handleCallback(code: string): Promise<OAuthTokens> {
    const response = await axios.post<AmazonTokenResponse>(
      TOKEN_URL,
      new URLSearchParams({
        client_id: this.config.get<string>('AMAZON_ADS_CLIENT_ID') ?? '',
        client_secret:
          this.config.get<string>('AMAZON_ADS_CLIENT_SECRET') ?? '',
        redirect_uri: this.redirectUri(),
        grant_type: 'authorization_code',
        code,
      }),
    );
    return this.mapTokenResponse(response.data);
  }

  async refreshToken(tokens: OAuthTokens): Promise<OAuthTokens> {
    const response = await axios.post<AmazonTokenResponse>(
      TOKEN_URL,
      new URLSearchParams({
        client_id: this.config.get<string>('AMAZON_ADS_CLIENT_ID') ?? '',
        client_secret:
          this.config.get<string>('AMAZON_ADS_CLIENT_SECRET') ?? '',
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken ?? '',
      }),
    );
    return this.mapTokenResponse(response.data);
  }

  private clientHeaders(tokens: OAuthTokens) {
    return {
      Authorization: `Bearer ${tokens.accessToken}`,
      'Amazon-Advertising-API-ClientId':
        this.config.get<string>('AMAZON_ADS_CLIENT_ID') ?? '',
    };
  }

  /** Lists the real advertising profiles (one per marketplace/account) the connected user can manage. */
  async sync(tokens: OAuthTokens): Promise<unknown> {
    const response = await axios.get(
      'https://advertising-api.amazon.com/v2/profiles',
      { headers: this.clientHeaders(tokens) },
    );
    return response.data;
  }

  /** `meta.profileId` (a real Amazon Advertising profile id, e.g. from a prior `sync()` selection) is required — every campaign call is scoped to one profile. */
  async createCampaign(
    tokens: OAuthTokens,
    params: CreateCampaignParams,
    meta: Record<string, unknown>,
  ): Promise<CreateCampaignResult> {
    const profileId = meta.profileId as string | undefined;
    if (!profileId) {
      throw new Error(
        'No Amazon Advertising profile selected for this business',
      );
    }
    const response = await axios.post<{ campaignId: string; code: string }[]>(
      'https://advertising-api.amazon.com/v2/sp/campaigns',
      [
        {
          name: params.name,
          campaignType: 'sponsoredProducts',
          targetingType: 'manual',
          state: 'paused',
          dailyBudget: params.dailyBudget,
        },
      ],
      {
        headers: {
          ...this.clientHeaders(tokens),
          'Amazon-Advertising-API-Scope': profileId,
        },
      },
    );
    return { externalId: response.data[0].campaignId };
  }

  async disconnect(): Promise<void> {
    // Real revocation is an LWA token-revocation call — left as a documented no-op, same
    // reasoning as every other connector's disconnect().
  }

  private mapTokenResponse(data: AmazonTokenResponse): OAuthTokens {
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : undefined,
    };
  }
}
