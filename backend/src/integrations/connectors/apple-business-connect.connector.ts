import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  Connector,
  MasterListingData,
  OAuthTokens,
} from '../connector.interface';
import { IntegrationProvider } from '@prisma/client';

/**
 * Apple Business Connect connector (UPD-BE-043) — unlike Bing Places/Yelp, Apple has no standard
 * public self-serve OAuth2 developer sandbox for Business Connect (confirmed by research), so
 * this follows `EmailConnector`'s non-OAuth shape instead: `authUrl()` returns `null` and
 * "connecting" just flips the integration to `connected` directly. Real pushes authenticate with
 * a pre-provisioned server-to-server API key (`APPLE_BUSINESS_CONNECT_API_KEY`), the disclosed
 * placeholder credential for this provider.
 */
@Injectable()
export class AppleBusinessConnectConnector implements Connector {
  readonly provider = IntegrationProvider.apple_business_connect;

  constructor(private readonly config: ConfigService) {}

  authUrl(): null {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- no OAuth code exchange (EmailConnector's shape)
  async handleCallback(): Promise<OAuthTokens> {
    return { accessToken: this.apiKey() };
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- same reasoning as handleCallback().
  async refreshToken(tokens: OAuthTokens): Promise<OAuthTokens> {
    return tokens;
  }

  /** Fetches the business's registered locations — the minimal real proof-of-connection call. */
  async sync(tokens: OAuthTokens): Promise<unknown> {
    const response = await axios.get(
      'https://businessconnect.apple.com/api/v1/locations',
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
    // Falls back to "primary" (the only location most single-branch businesses register) when no
    // specific location has been captured in `meta` yet.
    const locationId = (meta.locationId as string | undefined) ?? 'primary';
    const response = await axios.patch(
      `https://businessconnect.apple.com/api/v1/locations/${locationId}`,
      {
        name: listing.name,
        phoneNumber: listing.phone,
        urls: listing.website ? [listing.website] : undefined,
        address: {
          line1: listing.addressLine1,
          line2: listing.addressLine2,
          locality: listing.city,
          administrativeArea: listing.state,
          postCode: listing.postalCode,
          country: listing.country,
        },
      },
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    return response.data;
  }

  /**
   * Listings Settings conflict resolution (UPD-BE-125) — the read half of `pushListing`, same
   * location-scoped API family, same `"primary"` fallback.
   */
  async fetchListing(
    tokens: OAuthTokens,
    meta: Record<string, unknown>,
  ): Promise<Partial<MasterListingData>> {
    const locationId = (meta.locationId as string | undefined) ?? 'primary';
    const response = await axios.get<{
      name?: string;
      phoneNumber?: string;
      urls?: string[];
      address?: {
        line1?: string;
        line2?: string;
        locality?: string;
        administrativeArea?: string;
        postCode?: string;
        country?: string;
      };
    }>(`https://businessconnect.apple.com/api/v1/locations/${locationId}`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    const data = response.data;
    return {
      name: data.name,
      phone: data.phoneNumber,
      website: data.urls?.[0],
      addressLine1: data.address?.line1,
      addressLine2: data.address?.line2,
      city: data.address?.locality,
      state: data.address?.administrativeArea,
      postalCode: data.address?.postCode,
      country: data.address?.country,
    };
  }

  /**
   * Photos & Media, cross-directory (UPD-BE-124) — same location-scoped API family as
   * `pushListing`, falling back to `"primary"` the same way. Equally untestable without a real
   * partner credential in this environment — same disclosed constraint as `pushListing` above.
   */
  async pushPhoto(
    tokens: OAuthTokens,
    photoUrl: string,
    category: string,
    meta: Record<string, unknown>,
  ): Promise<unknown> {
    const locationId = (meta.locationId as string | undefined) ?? 'primary';
    const response = await axios.post(
      `https://businessconnect.apple.com/api/v1/locations/${locationId}/photos`,
      { url: photoUrl, category },
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    return response.data;
  }

  async disconnect(): Promise<void> {
    // No per-business token to revoke — same reasoning as EmailConnector.disconnect().
  }

  private apiKey(): string {
    return this.config.get<string>('APPLE_BUSINESS_CONNECT_API_KEY') ?? '';
  }
}
