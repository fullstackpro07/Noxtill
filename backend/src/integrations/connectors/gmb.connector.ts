import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GoogleOAuth2Connector } from './google-oauth2.connector';
import { MasterListingData, OAuthTokens } from '../connector.interface';
import { IntegrationProvider } from '../../../generated/prisma';

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
}
