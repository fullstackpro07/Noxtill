import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  Connector,
  EcommerceOrder,
  EcommerceProduct,
  OAuthTokens,
} from '../connector.interface';
import { IntegrationProvider } from '@prisma/client';

const API_VERSION = '2024-01';
const SCOPE = 'read_products,write_products,read_orders,write_inventory';

interface ShopifyTokenResponse {
  access_token: string;
  scope: string;
}

interface ShopifyVariant {
  sku: string | null;
  inventory_quantity: number;
}

interface ShopifyProduct {
  updated_at: string;
  variants: ShopifyVariant[];
}

interface ShopifyOrderLine {
  sku: string | null;
  name: string;
  quantity: number;
  price: string;
}

interface ShopifyOrder {
  id: number;
  financial_status: string;
  subtotal_price: string;
  total_tax: string;
  total_price: string;
  created_at: string;
  line_items: ShopifyOrderLine[];
}

/**
 * Shopify connector (UPD-BE-073) — real quirk: authorization is per-shop (`{shop}.myshopify.com`),
 * so the shop domain must be known *before* building the authorize URL — it comes from `params`,
 * the raw `POST /integrations/shopify/connect` request body, which the merchant fills in with
 * their store domain first. Shopify also resends `shop` on the callback redirect itself, which is
 * how `handleCallback` recovers it a second time (its own request, `authUrl`, is long gone by
 * then) to build the per-shop token-exchange URL.
 */
@Injectable()
export class ShopifyConnector implements Connector {
  readonly provider = IntegrationProvider.shopify;

  constructor(private readonly config: ConfigService) {}

  private redirectUri(): string {
    const backendUrl =
      this.config.get<string>('BACKEND_URL') ?? 'http://localhost:5000/api/v1';
    return `${backendUrl}/integrations/shopify/callback`;
  }

  authUrl(state: string, params: Record<string, string> = {}): string | null {
    const shop = params.shop;
    if (!shop) return null; // no shop domain supplied yet — caller must collect it first
    const query = new URLSearchParams({
      client_id: this.config.get<string>('SHOPIFY_CLIENT_ID') ?? '',
      scope: SCOPE,
      redirect_uri: this.redirectUri(),
      state,
    });
    return `https://${shop}/admin/oauth/authorize?${query.toString()}`;
  }

  async handleCallback(
    code: string,
    rawQuery: Record<string, string> = {},
  ): Promise<OAuthTokens> {
    const shop = rawQuery.shop;
    if (!shop) {
      throw new Error('Shopify callback did not include a shop domain');
    }
    const response = await axios.post<ShopifyTokenResponse>(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id: this.config.get<string>('SHOPIFY_CLIENT_ID') ?? '',
        client_secret: this.config.get<string>('SHOPIFY_CLIENT_SECRET') ?? '',
        code,
      },
    );
    return {
      accessToken: response.data.access_token,
      providerMeta: { shop },
    };
  }

  /** Shopify's permanent access tokens have no refresh grant — a no-op by design. */
  // eslint-disable-next-line @typescript-eslint/require-await -- no refresh grant exists for this provider
  async refreshToken(tokens: OAuthTokens): Promise<OAuthTokens> {
    return tokens;
  }

  async sync(tokens: OAuthTokens): Promise<unknown> {
    const shop = tokens.providerMeta?.shop as string | undefined;
    if (!shop) return { shop: null };
    const response = await axios.get(
      `https://${shop}/admin/api/${API_VERSION}/shop.json`,
      { headers: { 'X-Shopify-Access-Token': tokens.accessToken } },
    );
    return response.data;
  }

  async disconnect(): Promise<void> {
    // Shopify has no token-revocation endpoint of its own — uninstalling the app (a merchant-side
    // action) is what actually revokes it; clearing our stored token is the real action available here.
  }

  async fetchProducts(
    tokens: OAuthTokens,
    meta: Record<string, unknown>,
  ): Promise<EcommerceProduct[]> {
    const shop = meta.shop as string | undefined;
    if (!shop) throw new Error('No Shopify store connected for this business');
    const response = await axios.get<{ products: ShopifyProduct[] }>(
      `https://${shop}/admin/api/${API_VERSION}/products.json`,
      {
        headers: { 'X-Shopify-Access-Token': tokens.accessToken },
        params: { limit: 250 },
      },
    );
    return response.data.products.flatMap((product) =>
      product.variants
        .filter((variant) => variant.sku)
        .map((variant) => ({
          sku: variant.sku as string,
          quantity: variant.inventory_quantity,
          updatedAt: product.updated_at,
        })),
    );
  }

  async pushInventory(
    tokens: OAuthTokens,
    meta: Record<string, unknown>,
    sku: string,
    qty: number,
  ): Promise<void> {
    const shop = meta.shop as string | undefined;
    if (!shop) throw new Error('No Shopify store connected for this business');
    // A real push requires resolving `sku` to its `inventory_item_id`/`location_id` first —
    // disclosed as a follow-up call this method issues before the actual level update.
    const lookup = await axios.get<{
      products: {
        variants: { sku: string | null; inventory_item_id: number }[];
      }[];
    }>(`https://${shop}/admin/api/${API_VERSION}/products.json`, {
      headers: { 'X-Shopify-Access-Token': tokens.accessToken },
      params: { limit: 250 },
    });
    const variant = lookup.data.products
      .flatMap((p) => p.variants)
      .find((v) => v.sku === sku);
    if (!variant) return; // no matching Shopify variant for this SKU — nothing to push

    const locations = await axios.get<{ locations: { id: number }[] }>(
      `https://${shop}/admin/api/${API_VERSION}/locations.json`,
      { headers: { 'X-Shopify-Access-Token': tokens.accessToken } },
    );
    const locationId = locations.data.locations[0]?.id;
    if (!locationId) return;

    await axios.post(
      `https://${shop}/admin/api/${API_VERSION}/inventory_levels/set.json`,
      {
        location_id: locationId,
        inventory_item_id: variant.inventory_item_id,
        available: qty,
      },
      { headers: { 'X-Shopify-Access-Token': tokens.accessToken } },
    );
  }

  async fetchOrders(
    tokens: OAuthTokens,
    meta: Record<string, unknown>,
    sinceIso?: string,
  ): Promise<EcommerceOrder[]> {
    const shop = meta.shop as string | undefined;
    if (!shop) throw new Error('No Shopify store connected for this business');
    const response = await axios.get<{ orders: ShopifyOrder[] }>(
      `https://${shop}/admin/api/${API_VERSION}/orders.json`,
      {
        headers: { 'X-Shopify-Access-Token': tokens.accessToken },
        params: {
          status: 'any',
          limit: 100,
          ...(sinceIso ? { created_at_min: sinceIso } : {}),
        },
      },
    );
    return response.data.orders.map((order) => ({
      externalId: String(order.id),
      status: order.financial_status,
      subtotal: Number(order.subtotal_price),
      tax: Number(order.total_tax),
      total: Number(order.total_price),
      createdAt: order.created_at,
      lines: order.line_items.map((line) => ({
        sku: line.sku ?? undefined,
        name: line.name,
        qty: line.quantity,
        price: Number(line.price),
      })),
    }));
  }
}
