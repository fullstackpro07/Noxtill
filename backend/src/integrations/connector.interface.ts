import { IntegrationProvider } from '@prisma/client';

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  /**
   * Provider-specific context the token exchange itself carries alongside the tokens (UPD-BE-072/
   * 073) — e.g. QuickBooks' `realmId` (read from the callback's own query params), Shopify's
   * `shop` domain, Xero's `tenantId` (fetched via a real follow-up call). `IntegrationsService`
   * merges this into `Integration.meta` — the same blob `pushListing`/`createCampaign` already
   * read provider context from — but only when present, so providers that never set it can't
   * accidentally wipe an existing meta blob (e.g. GMB's `locationId`) on reconnect.
   */
  providerMeta?: Record<string, unknown>;
}

/** Unified Advertising (UPD-BE-069) — the minimal real fields every ad platform's campaign-create call needs. */
export interface CreateCampaignParams {
  name: string;
  /** Free-form goal/objective text (e.g. "traffic", "leads") — each connector maps it to its own real enum. */
  goal: string;
  dailyBudget: number;
}

export interface CreateCampaignResult {
  externalId: string;
  /**
   * Campaign management actions (UPD-BE-130) — extra real context this connector needs later to
   * apply a real update (e.g. Google Ads' separate `CampaignBudget` resource name, which its own
   * campaign resource never carries). Merged into `AdCampaign.providerMeta` alongside the caller's
   * own `meta`, and replayed into `updateCampaign`'s own `meta` param.
   */
  providerMeta?: Record<string, unknown>;
}

/** Campaign management actions (UPD-BE-130) — every field optional; only the fields the caller actually asked to change are ever sent. */
export interface UpdateCampaignChanges {
  status?: 'paused' | 'active';
  dailyBudget?: number;
}

/** Fatigue-warning depth fix — a real rollup over the campaign's real reporting window (each connector's own window, disclosed in its own implementation). */
export interface CampaignStatsResult {
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
}

/** Accounting Sync (UPD-BE-072) — one real invoice line, already resolved against `AccountingMapping`. */
export interface AccountingInvoiceLine {
  description: string;
  qty: number;
  unitAmount: number;
  accountCode: string;
  taxCode?: string;
}

export interface AccountingInvoiceInput {
  orderNo: number;
  customerName?: string;
  lines: AccountingInvoiceLine[];
}

export interface AccountingInvoiceResult {
  externalId: string;
}

/** E-commerce Sync (UPD-BE-073) — the minimal real fields needed for stock/order reconciliation. */
export interface EcommerceProduct {
  sku: string;
  quantity: number;
  updatedAt: string;
}

export interface EcommerceOrderLine {
  sku?: string;
  name: string;
  qty: number;
  price: number;
}

export interface EcommerceOrder {
  externalId: string;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  createdAt: string;
  lines: EcommerceOrderLine[];
}

/** The Master Business Record's push-able fields (UPD-BE-041) — see `MasterListing` in schema.prisma. */
/** A charge, refund or payout read from a payment processor (Stripe, Square, PayPal). */
export interface ExternalPaymentInput {
  externalId: string;
  kind: 'charge' | 'refund' | 'payout';
  status: string;
  /** Major units (e.g. 12.50), never minor units. */
  amount: number;
  currency: string;
  occurredAt: string;
}

/** One day of web traffic from an analytics provider. */
export interface TrafficDayInput {
  /** `YYYY-MM-DD`. */
  day: string;
  sessions: number;
  conversions: number;
}

export interface AudienceContact {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
}

export interface CalendarEventInput {
  title: string;
  description?: string;
  startsAt: string;
  endsAt: string;
}

export interface MeetingInput {
  topic: string;
  startsAt: string;
  durationMinutes: number;
}

export interface CatalogProductInput {
  sku: string;
  title: string;
  description?: string;
  price: number;
  currency: string;
  link: string;
  imageLink?: string;
  inStock: boolean;
}

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
  /**
   * `params` (UPD-BE-073) carries whatever the initiating `POST /integrations/:provider/connect`
   * request body supplied — e.g. Shopify's `shop` domain, required to build a per-shop authorize
   * URL before any token exchange has happened. Every existing connector ignores it; only
   * connectors that genuinely need pre-token context read from it.
   */
  authUrl(state: string, params?: Record<string, string>): string | null;
  /**
   * `rawQuery` (UPD-BE-072/073) is the full callback query string, code/state included — needed
   * because some providers deliver essential context as its own sibling query param rather than
   * inside the token response (QuickBooks' `realmId`, Shopify's `shop`), and non-OAuth providers
   * (Email, WooCommerce's manual key entry) reuse this same parameter to receive connect-time
   * credentials directly, since `connect()`'s non-OAuth branch forwards its request body here.
   */
  handleCallback(
    code: string,
    rawQuery?: Record<string, string>,
  ): Promise<OAuthTokens>;
  refreshToken(tokens: OAuthTokens): Promise<OAuthTokens>;
  /** A minimal real API call proving the connection works (e.g. "list accessible accounts"). */
  sync(tokens: OAuthTokens): Promise<unknown>;
  /**
   * `tokens` (UPD-BE-072) is the connection's last-known decrypted tokens, fetched by
   * `IntegrationsService` before revoking — most connectors' `disconnect()` is a documented
   * no-op and ignore it; QuickBooks/Xero use it for a real revocation call.
   */
  disconnect(tokens?: OAuthTokens): Promise<void>;
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
  /**
   * Photos & Media, cross-directory (UPD-BE-124) — pushes one photo to the provider's real media
   * gallery. Directory-type only. Implemented by all four directory connectors (gmb, bing_places,
   * apple_business_connect, yelp), each against the same API family/host its own `pushListing`
   * already calls — same disclosed "attempted against the real endpoint, untestable without a
   * real partner credential in this environment" constraint that already applies to every
   * connector's `pushListing`, not a new one. `ListingPhotosService` checks for `pushPhoto`'s
   * presence the same way `ListingSyncService` checks for `pushListing`, so a future connector
   * that genuinely can't support this (e.g. a pure ad-platform connector) can still leave it
   * undefined without special-casing anywhere.
   */
  pushPhoto?(
    tokens: OAuthTokens,
    photoUrl: string,
    category: string,
    meta: Record<string, unknown>,
  ): Promise<unknown>;
  /**
   * Listings Settings conflict resolution (UPD-BE-125) — pulls the provider's real CURRENT
   * listing data, the read half of the same API family/endpoint `pushListing` already writes to.
   * Implemented by all four directory connectors. `ListingSyncService.sync()` calls this first,
   * before pushing, only when `ListingSettings.conflictResolution === 'directory_wins'` — the real
   * mechanism that setting was missing until now. Returns only the fields the provider's response
   * actually included (a partial read), never fabricated defaults for missing ones.
   */
  fetchListing?(
    tokens: OAuthTokens,
    meta: Record<string, unknown>,
  ): Promise<Partial<MasterListingData>>;
  /**
   * Ad-platform connectors only (UPD-BE-069) — creates a real campaign on the provider, paused/
   * draft by default (never launches spend without the owner explicitly activating it later).
   * `meta` carries provider-specific context an account selection puts there (e.g. an ad account
   * id), same convention as `pushListing`'s `meta` parameter.
   */
  createCampaign?(
    tokens: OAuthTokens,
    params: CreateCampaignParams,
    meta: Record<string, unknown>,
  ): Promise<CreateCampaignResult>;
  /**
   * Ad-platform connectors only (UPD-BE-130) — applies a real pause/resume and/or budget change
   * directly on the provider for an already-created campaign. `meta` is the same provider-
   * selection context `createCampaign` received, persisted on `AdCampaign.providerMeta` and
   * replayed here so the caller never has to resupply it. Implementations that can't apply every
   * requested change at the provider (e.g. Google Ads' budget lives on a separate resource this
   * app never stored a reference to) apply what they really can and document the rest — the caller
   * always persists the full change locally regardless, the same disclosed-degradation shape as
   * `createCampaign`'s own local-draft fallback.
   */
  updateCampaign?(
    tokens: OAuthTokens,
    externalId: string,
    changes: UpdateCampaignChanges,
    meta: Record<string, unknown>,
  ): Promise<void>;
  /**
   * Fatigue-warning depth fix — a real, current rollup from the provider's own reporting API,
   * never fabricated. Two providers' real reporting APIs (Microsoft, Amazon) are genuinely
   * async — submit a report request, poll for it — so their implementations submit-and-poll once
   * per call; if the report isn't ready yet they throw (the caller skips that campaign this cycle
   * and tries again next hour), rather than returning a guessed number.
   */
  fetchCampaignStats?(
    tokens: OAuthTokens,
    externalId: string,
    meta: Record<string, unknown>,
  ): Promise<CampaignStatsResult>;
  /** Accounting connectors only (UPD-BE-072) — pushes a real invoice, never auto-sent/finalized. */
  pushInvoice?(
    tokens: OAuthTokens,
    meta: Record<string, unknown>,
    invoice: AccountingInvoiceInput,
  ): Promise<AccountingInvoiceResult>;
  /** E-commerce connectors only (UPD-BE-073) — real current stock levels, for conflict-resolved two-way sync. */
  fetchProducts?(
    tokens: OAuthTokens,
    meta: Record<string, unknown>,
  ): Promise<EcommerceProduct[]>;
  /** E-commerce connectors only (UPD-BE-073) — pushes the local stock level when the local side wins a conflict. */
  pushInventory?(
    tokens: OAuthTokens,
    meta: Record<string, unknown>,
    sku: string,
    qty: number,
  ): Promise<void>;
  /** E-commerce connectors only (UPD-BE-073) — real orders placed on the platform, pulled in as local `Order` rows. */
  fetchOrders?(
    tokens: OAuthTokens,
    meta: Record<string, unknown>,
    sinceIso?: string,
  ): Promise<EcommerceOrder[]>;

  /**
   * Payment processors (Stripe/Square/PayPal): every charge, refund and payout since `sinceIso`
   * (or the provider's default window). Read-only — nothing in the processor is modified.
   */
  fetchPayments?(
    tokens: OAuthTokens,
    meta: Record<string, unknown>,
    sinceIso?: string,
  ): Promise<ExternalPaymentInput[]>;

  /** Analytics (GA4): daily sessions and conversions for the last `days` days. */
  fetchTraffic?(
    tokens: OAuthTokens,
    meta: Record<string, unknown>,
    days: number,
  ): Promise<TrafficDayInput[]>;

  /** Email marketing (Mailchimp/Klaviyo): upsert these contacts into the connected audience. */
  pushContacts?(
    tokens: OAuthTokens,
    meta: Record<string, unknown>,
    contacts: AudienceContact[],
  ): Promise<{ pushed: number; failed: number }>;

  /** Calendars (Google Calendar/Outlook): create, update and remove the event mirroring a booking. */
  createCalendarEvent?(
    tokens: OAuthTokens,
    meta: Record<string, unknown>,
    event: CalendarEventInput,
  ): Promise<{ externalId: string }>;
  updateCalendarEvent?(
    tokens: OAuthTokens,
    meta: Record<string, unknown>,
    externalId: string,
    event: CalendarEventInput,
  ): Promise<void>;
  deleteCalendarEvent?(
    tokens: OAuthTokens,
    meta: Record<string, unknown>,
    externalId: string,
  ): Promise<void>;

  /** Video meetings (Zoom): create a meeting and return its join link. */
  createMeeting?(
    tokens: OAuthTokens,
    meta: Record<string, unknown>,
    meeting: MeetingInput,
  ): Promise<{ externalId: string; joinUrl: string }>;

  /** Team chat (Slack): post a message to the channel the business granted. */
  postMessage?(
    tokens: OAuthTokens,
    meta: Record<string, unknown>,
    text: string,
  ): Promise<void>;

  /** Google Merchant Center: insert/update these catalog products. */
  pushProducts?(
    tokens: OAuthTokens,
    meta: Record<string, unknown>,
    products: CatalogProductInput[],
  ): Promise<{ pushed: number; failed: number; errors: string[] }>;
}
