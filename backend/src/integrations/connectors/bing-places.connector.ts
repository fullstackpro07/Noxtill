import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  Connector,
  MasterListingData,
  OAuthTokens,
} from '../connector.interface';
import { IntegrationProvider } from '@prisma/client';

const AUTHORIZE_URL =
  'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const SCOPE = 'https://api.bingplaces.com/business.manage offline_access';

interface MicrosoftTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

/**
 * Bing Places connector (UPD-BE-043) — no `GenericOAuth2Connector` base exists in this codebase
 * (confirmed by research; only Google has a shared base, via `GoogleOAuth2Connector`), so this
 * follows `MetaAdsConnector`'s standalone-`Connector`-implementation shape: standard Microsoft
 * identity-platform OAuth2 with a real `refresh_token` grant.
 */
@Injectable()
export class BingPlacesConnector implements Connector {
  readonly provider = IntegrationProvider.bing_places;

  constructor(private readonly config: ConfigService) {}

  private redirectUri(): string {
    const backendUrl =
      this.config.get<string>('BACKEND_URL') ?? 'http://localhost:5000/api/v1';
    return `${backendUrl}/integrations/bing_places/callback`;
  }

  authUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.get<string>('BING_PLACES_CLIENT_ID') ?? '',
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
        client_id: this.config.get<string>('BING_PLACES_CLIENT_ID') ?? '',
        client_secret:
          this.config.get<string>('BING_PLACES_CLIENT_SECRET') ?? '',
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
        client_id: this.config.get<string>('BING_PLACES_CLIENT_ID') ?? '',
        client_secret:
          this.config.get<string>('BING_PLACES_CLIENT_SECRET') ?? '',
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken ?? '',
      }),
    );
    return this.mapTokenResponse(response.data);
  }

  /** Lists the business's stores — the minimal real proof-of-connection call. */
  async sync(tokens: OAuthTokens): Promise<unknown> {
    const response = await axios.get(
      'https://api.bingplaces.com/api/GetAllStores',
      {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      },
    );
    return response.data;
  }

  async pushListing(
    tokens: OAuthTokens,
    listing: MasterListingData,
    meta: Record<string, unknown>,
  ): Promise<unknown> {
    // A previously-synced store carries its Bing-assigned StoreId in `meta` — including it turns
    // this into a real update of the existing store rather than creating a duplicate.
    const response = await axios.post(
      'https://api.bingplaces.com/api/CreateOrUpdateStore',
      {
        StoreId: meta.storeId,
        StoreName: listing.name,
        BusinessPhone: listing.phone,
        Website: listing.website,
        AddressLine1: listing.addressLine1,
        AddressLine2: listing.addressLine2,
        City: listing.city,
        State: listing.state,
        ZipCode: listing.postalCode,
        Country: listing.country,
      },
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    return response.data;
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
