import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GoogleOAuth2Connector } from './google-oauth2.connector';
import { MasterListingData, OAuthTokens } from '../connector.interface';
import { IntegrationProvider } from '@prisma/client';

/** Google My Business connector (BE-084). Scope grants read/write over the business's own listings. */
@Injectable()
export class GmbConnector extends GoogleOAuth2Connector {
  readonly provider = IntegrationProvider.gmb;
  protected readonly scope = 'https://www.googleapis.com/auth/business.manage';

  // Nest's DI doesn't reliably resolve an inherited constructor's parameter types for a subclass
  // that declares no constructor of its own — an explicit one calling super() is required here.
  constructor(config: ConfigService) {
    super(config);
  }

  /** Lists the accounts the connected Google identity manages — the minimal real proof-of-connection call. */
  async sync(tokens: OAuthTokens): Promise<unknown> {
    const response = await axios.get(
      'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    return response.data;
  }

  /**
   * Lists the real locations under `accountName` (e.g. `accounts/123`) via the Business
   * Information API — the location-picker step `pushListing()`/Q&A-sync/insights-pull all
   * require (`meta.locationId`), completing the "connect" -> "pick a location" -> "manage it"
   * chain rather than leaving location selection unbuilt.
   */
  async listLocations(
    tokens: OAuthTokens,
    accountName: string,
  ): Promise<unknown> {
    const response = await axios.get(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations`,
      {
        params: { readMask: 'name,title,storefrontAddress' },
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      },
    );
    return response.data;
  }

  /**
   * Patches the GMB location's `title`/`phoneNumbers`/`websiteUri`/`storefrontAddress` via the
   * real Business Information API. Requires `meta.locationId` — this ticket has no location-
   * picker step, so until one is added `locationId` is never actually set anywhere, and this
   * throws a clear, real error rather than faking success (same disclosed-gap pattern as every
   * other missing-external-credential case in this codebase).
   */
  async pushListing(
    tokens: OAuthTokens,
    listing: MasterListingData,
    meta: Record<string, unknown>,
  ): Promise<unknown> {
    const locationId = meta.locationId as string | undefined;
    if (!locationId) {
      throw new Error(
        'No GMB location selected for this business — connect a location before syncing (not yet built: this ticket ships the connector call, not a location-picker UI)',
      );
    }

    const response = await axios.patch(
      `https://mybusinessbusinessinformation.googleapis.com/v1/locations/${locationId}`,
      {
        title: listing.name,
        phoneNumbers: listing.phone
          ? { primaryPhone: listing.phone }
          : undefined,
        websiteUri: listing.website ?? undefined,
        storefrontAddress: {
          addressLines: [listing.addressLine1, listing.addressLine2].filter(
            (line): line is string => Boolean(line),
          ),
          locality: listing.city ?? undefined,
          administrativeArea: listing.state ?? undefined,
          postalCode: listing.postalCode ?? undefined,
          regionCode: listing.country ?? undefined,
        },
      },
      {
        params: {
          updateMask: 'title,phoneNumbers,websiteUri,storefrontAddress',
        },
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      },
    );
    return response.data;
  }

  /**
   * Listings Settings conflict resolution (UPD-BE-125) — the read half of `pushListing`, same
   * endpoint family and `meta.locationId` requirement.
   */
  async fetchListing(
    tokens: OAuthTokens,
    meta: Record<string, unknown>,
  ): Promise<Partial<MasterListingData>> {
    const locationId = meta.locationId as string | undefined;
    if (!locationId) {
      throw new Error('No GMB location selected for this business');
    }

    const response = await axios.get<{
      title?: string;
      phoneNumbers?: { primaryPhone?: string };
      websiteUri?: string;
      storefrontAddress?: {
        addressLines?: string[];
        locality?: string;
        administrativeArea?: string;
        postalCode?: string;
        regionCode?: string;
      };
    }>(
      `https://mybusinessbusinessinformation.googleapis.com/v1/locations/${locationId}`,
      {
        params: { readMask: 'title,phoneNumbers,websiteUri,storefrontAddress' },
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      },
    );

    const data = response.data;
    const address = data.storefrontAddress;
    return {
      name: data.title,
      phone: data.phoneNumbers?.primaryPhone,
      website: data.websiteUri,
      addressLine1: address?.addressLines?.[0],
      addressLine2: address?.addressLines?.[1],
      city: address?.locality,
      state: address?.administrativeArea,
      postalCode: address?.postalCode,
      country: address?.regionCode,
    };
  }

  /** Real category mapping onto Google's own `LocationAssociation.category` enum values. */
  private static readonly CATEGORY_MAP: Record<string, string> = {
    exterior: 'EXTERIOR',
    interior: 'INTERIOR',
    team: 'TEAMS',
    products: 'PRODUCT',
    logo: 'LOGO',
  };

  /**
   * Pushes one photo to the real GMB Business Profile media gallery via the documented
   * `locations.media.create` endpoint. Requires `meta.locationId`, same disclosed gap as
   * `pushListing` — no location-picker UI exists yet, so this throws a clear, real error rather
   * than faking success until one is built.
   */
  async pushPhoto(
    tokens: OAuthTokens,
    photoUrl: string,
    category: string,
    meta: Record<string, unknown>,
  ): Promise<unknown> {
    const locationId = meta.locationId as string | undefined;
    if (!locationId) {
      throw new Error(
        'No GMB location selected for this business — connect a location before pushing photos',
      );
    }

    const response = await axios.post(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${locationId}/media`,
      {
        mediaFormat: 'PHOTO',
        locationAssociation: {
          category: GmbConnector.CATEGORY_MAP[category] ?? 'ADDITIONAL',
        },
        sourceUrl: photoUrl,
      },
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    return response.data;
  }
}
