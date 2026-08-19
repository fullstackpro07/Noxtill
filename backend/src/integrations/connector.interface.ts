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
}
