import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  Connector,
  MasterListingData,
  OAuthTokens,
} from '../connector.interface';
import { IntegrationProvider } from '../../../generated/prisma';

const AUTHORIZE_URL = 'https://www.yelp.com/oauth2/authorize';
const TOKEN_URL = 'https://api.yelp.com/oauth2/token';
const SCOPE = 'business_management';

interface YelpTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

/**
 * Yelp connector (UPD-BE-043) — same standalone-`Connector` shape as `MetaAdsConnector` (no
 * shared non-Google OAuth2 base exists). Yelp's Partner/Fusion OAuth2 grant does issue a real
 * `refresh_token`, unlike Meta's exchange-based quirk.
 */
@Injectable()
export class YelpConnector implements Connector {
  readonly provider = IntegrationProvider.yelp;

  constructor(private readonly config: ConfigService) {}

  private redirectUri(): string {
    const backendUrl =
      this.config.get<string>('BACKEND_URL') ?? 'http://localhost:5000/api/v1';
    return `${backendUrl}/integrations/yelp/callback`;
  }

  authUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.get<string>('YELP_CLIENT_ID') ?? '',
      redirect_uri: this.redirectUri(),
      scope: SCOPE,
      state,
      response_type: 'code',
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async handleCallback(code: string): Promise<OAuthTokens> {
    const response = await axios.post<YelpTokenResponse>(TOKEN_URL, {
      client_id: this.config.get<string>('YELP_CLIENT_ID') ?? '',
      client_secret: this.config.get<string>('YELP_CLIENT_SECRET') ?? '',
      redirect_uri: this.redirectUri(),
      grant_type: 'authorization_code',
      code,
    });
    return this.mapTokenResponse(response.data);
  }

  async refreshToken(tokens: OAuthTokens): Promise<OAuthTokens> {
    const response = await axios.post<YelpTokenResponse>(TOKEN_URL, {
      client_id: this.config.get<string>('YELP_CLIENT_ID') ?? '',
      client_secret: this.config.get<string>('YELP_CLIENT_SECRET') ?? '',
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken ?? '',
    });
    return this.mapTokenResponse(response.data);
  }

  /** Fetches the connected business's own profile — the minimal real proof-of-connection call. */
  async sync(tokens: OAuthTokens): Promise<unknown> {
    const response = await axios.get(
      'https://api.yelp.com/v3/businesses/managed',
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
    // Yelp's managed-business API scopes the update to whichever Yelp business ID was captured
    // the last time this listing was connected/synced.
    const response = await axios.post(
      'https://api.yelp.com/v3/businesses/managed/update',
      {
        business_id: meta.yelpBusinessId,
        name: listing.name,
        phone: listing.phone,
        website: listing.website,
        location: {
          address1: listing.addressLine1,
          address2: listing.addressLine2,
          city: listing.city,
          state: listing.state,
          zip_code: listing.postalCode,
          country: listing.country,
        },
      },
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    return response.data;
  }

  async disconnect(): Promise<void> {
    // Real revocation is a Yelp OAuth token-revocation call — left as a documented no-op, same
    // reasoning as every other connector's disconnect().
  }

  private mapTokenResponse(data: YelpTokenResponse): OAuthTokens {
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : undefined,
    };
  }
}
