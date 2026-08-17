import { IntegrationProvider } from '../../generated/prisma';

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
}

/** The Master Business Record's push-able fields (UPD-BE-041) — see `MasterListing` in schema.prisma. */
export interface MasterListingData {
  name: string;
  phone?: string | null;
  website?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  categories: unknown;
  description?: string | null;
  hours: unknown;
}

/**
 * Connector interface (BE-082) — every provider (OAuth-based or not) implements this.
 * `authUrl` returning `null` signals a non-OAuth provider (Email): `IntegrationsService.connect`
 * branches on this to skip the redirect entirely and connect directly.
 */
export interface Connector {
  provider: IntegrationProvider;
  authUrl(state: string): string | null;
  handleCallback(code: string): Promise<OAuthTokens>;
  refreshToken(tokens: OAuthTokens): Promise<OAuthTokens>;
  /** A minimal real API call proving the connection works (e.g. "list accessible accounts"). */
  sync(tokens: OAuthTokens): Promise<unknown>;
  disconnect(): Promise<void>;
  /**
   * Directory-type connectors only (UPD-BE-041: gmb, bing_places, apple_business_connect, yelp) —
   * pushes the business's Master Listing to the provider. Ad-platform connectors (Google/Meta/
   * TikTok Ads, Merchant Center) never implement this; `ListingSyncService` checks for its
   * presence rather than maintaining a separate hardcoded provider list. `meta` is the connected
   * `Integration.meta` blob (e.g. a previously-selected `locationId`) — connectors that need
   * provider-specific context beyond the raw tokens read it from here.
   */
  pushListing?(
    tokens: OAuthTokens,
    listing: MasterListingData,
    meta: Record<string, unknown>,
  ): Promise<unknown>;
}
