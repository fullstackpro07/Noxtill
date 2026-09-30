import { Injectable } from '@nestjs/common';
import axios from 'axios';
import {
  Connector,
  EcommerceListingDraftInput,
  EcommerceListingDraftResult,
  EcommerceOrder,
  EcommerceProduct,
  OAuthTokens,
} from '../connector.interface';
import { IntegrationProvider } from '@prisma/client';
import { plainTextAsProductHtml } from '../ecommerce/listing-content.util';

interface WooCommerceVariation {
  sku: string;
  stock_quantity: number | null;
}

interface WooCommerceProduct {
  id: number;
  sku: string;
  stock_quantity: number | null;
  date_modified_gmt: string;
  variations?: number[];
}

interface WooCommerceOrderLine {
  sku: string;
  name: string;
  quantity: number;
  price: number;
}

interface WooCommerceOrder {
  id: number;
  status: string;
  total: string;
  total_tax: string;
  date_created_gmt: string;
  line_items: WooCommerceOrderLine[];
}

interface WooCommerceListingProduct {
  id: number;
  sku: string;
  type?: string;
  meta_data?: Array<{ key: string; value: unknown }>;
}

/**
 * WooCommerce connector (UPD-BE-073) — deliberately not OAuth2. WooCommerce's real interactive
 * authorization flow (`/wc-auth/v1/authorize`) has its store's server POST the issued consumer
 * key/secret directly to a callback URL rather than redirecting the browser with a `code` — a
 * fundamentally different shape from every other connector's GET-redirect callback. Rather than
 * build a second callback mechanism for one provider, this reuses the existing non-OAuth path
 * (`authUrl` returns `null`, same as Email/Apple Business Connect): the merchant enters their
 * store URL + consumer key/secret (generated once, manually, in their own WP admin — the far more
 * common real-world WooCommerce integration method) directly into `POST /integrations/woocommerce/connect`,
 * which `IntegrationsService.connect()` forwards to `handleCallback` as `rawQuery`.
 */
@Injectable()
export class WooCommerceConnector implements Connector {
  readonly provider = IntegrationProvider.woocommerce;

  authUrl(): null {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- credentials arrive synchronously via rawQuery, no real exchange call
  async handleCallback(
    _code: string,
    rawQuery: Record<string, string> = {},
  ): Promise<OAuthTokens> {
    const { storeUrl, consumerKey, consumerSecret } = rawQuery;
    if (!storeUrl || !consumerKey || !consumerSecret) {
      throw new Error(
        'WooCommerce requires storeUrl, consumerKey, and consumerSecret',
      );
    }
    return {
      accessToken: consumerKey,
      refreshToken: consumerSecret,
      providerMeta: { storeUrl: storeUrl.replace(/\/$/, '') },
    };
  }

  /** Consumer key/secret pairs don't expire in WooCommerce — a no-op by design. */
  // eslint-disable-next-line @typescript-eslint/require-await -- no refresh grant exists for this provider
  async refreshToken(tokens: OAuthTokens): Promise<OAuthTokens> {
    return tokens;
  }

  async sync(tokens: OAuthTokens): Promise<unknown> {
    const storeUrl = tokens.providerMeta?.storeUrl as string | undefined;
    if (!storeUrl) return { connected: false };
    const response = await axios.get(
      `${storeUrl}/wp-json/wc/v3/system_status`,
      {
        auth: {
          username: tokens.accessToken,
          password: tokens.refreshToken ?? '',
        },
      },
    );
    return response.data;
  }

  async disconnect(): Promise<void> {
    // No real revocation endpoint — the merchant deletes the key from their own WP admin;
    // clearing our stored copy is the real action available here.
  }

  async fetchProducts(
    tokens: OAuthTokens,
    meta: Record<string, unknown>,
  ): Promise<EcommerceProduct[]> {
    const storeUrl = meta.storeUrl as string | undefined;
    if (!storeUrl)
      throw new Error('No WooCommerce store connected for this business');
    const auth = {
      username: tokens.accessToken,
      password: tokens.refreshToken ?? '',
    };
    const response = await axios.get<WooCommerceProduct[]>(
      `${storeUrl}/wp-json/wc/v3/products`,
      { auth, params: { per_page: 100 } },
    );

    const results: EcommerceProduct[] = [];
    for (const product of response.data) {
      if (product.sku) {
        results.push({
          sku: product.sku,
          quantity: product.stock_quantity ?? 0,
          updatedAt: product.date_modified_gmt,
        });
        continue;
      }
      if (!product.variations?.length) continue;
      const variations = await axios.get<WooCommerceVariation[]>(
        `${storeUrl}/wp-json/wc/v3/products/${product.id}/variations`,
        { auth },
      );
      for (const variation of variations.data) {
        if (!variation.sku) continue;
        results.push({
          sku: variation.sku,
          quantity: variation.stock_quantity ?? 0,
          updatedAt: product.date_modified_gmt,
        });
      }
    }
    return results;
  }

  async pushInventory(
    tokens: OAuthTokens,
    meta: Record<string, unknown>,
    sku: string,
    qty: number,
  ): Promise<void> {
    const storeUrl = meta.storeUrl as string | undefined;
    if (!storeUrl)
      throw new Error('No WooCommerce store connected for this business');
    const auth = {
      username: tokens.accessToken,
      password: tokens.refreshToken ?? '',
    };
    const lookup = await axios.get<WooCommerceProduct[]>(
      `${storeUrl}/wp-json/wc/v3/products`,
      { auth, params: { sku } },
    );
    const product = lookup.data[0];
    if (!product) return; // no matching WooCommerce product for this SKU — nothing to push

    await axios.put(
      `${storeUrl}/wp-json/wc/v3/products/${product.id}`,
      { stock_quantity: qty },
      { auth },
    );
  }

  async fetchOrders(
    tokens: OAuthTokens,
    meta: Record<string, unknown>,
    sinceIso?: string,
  ): Promise<EcommerceOrder[]> {
    const storeUrl = meta.storeUrl as string | undefined;
    if (!storeUrl)
      throw new Error('No WooCommerce store connected for this business');
    const response = await axios.get<WooCommerceOrder[]>(
      `${storeUrl}/wp-json/wc/v3/orders`,
      {
        auth: {
          username: tokens.accessToken,
          password: tokens.refreshToken ?? '',
        },
        params: { per_page: 100, ...(sinceIso ? { after: sinceIso } : {}) },
      },
    );
    return response.data.map((order) => ({
      externalId: String(order.id),
      status: order.status,
      subtotal: Number(order.total) - Number(order.total_tax),
      tax: Number(order.total_tax),
      total: Number(order.total),
      createdAt: order.date_created_gmt,
      lines: order.line_items.map((line) => ({
        sku: line.sku || undefined,
        name: line.name,
        qty: line.quantity,
        price: line.price,
      })),
    }));
  }

  async upsertListingDraft(
    tokens: OAuthTokens,
    meta: Record<string, unknown>,
    input: EcommerceListingDraftInput,
    externalProductId?: string,
  ): Promise<EcommerceListingDraftResult> {
    const storeUrl = meta.storeUrl as string | undefined;
    if (!storeUrl)
      throw new Error('No WooCommerce store connected for this business');
    const auth = {
      username: tokens.accessToken,
      password: tokens.refreshToken ?? '',
    };
    const createPayload = {
      type: 'simple',
      name: input.title,
      description: plainTextAsProductHtml(input.description),
      sku: input.sku,
      regular_price: input.sellingPrice.toFixed(2),
      status: 'draft',
      meta_data: [
        { key: '_noxtill_business_id', value: input.businessId },
        { key: '_noxtill_product_id', value: input.productId },
      ],
    };
    const ownsProduct = (product: WooCommerceListingProduct) => {
      const metadata = new Map(
        (product.meta_data ?? []).map(({ key, value }) => [key, String(value)]),
      );
      return (
        metadata.get('_noxtill_business_id') === input.businessId &&
        metadata.get('_noxtill_product_id') === input.productId
      );
    };

    let existing: WooCommerceListingProduct | undefined;
    if (externalProductId) {
      const response = await axios.get<WooCommerceListingProduct>(
        `${storeUrl}/wp-json/wc/v3/products/${encodeURIComponent(externalProductId)}`,
        { auth },
      );
      existing = response.data;
    } else {
      const response = await axios.get<WooCommerceListingProduct[]>(
        `${storeUrl}/wp-json/wc/v3/products`,
        { auth, params: { sku: input.sku } },
      );
      if (response.data.length > 1) {
        throw new Error('WooCommerce returned multiple products for this SKU');
      }
      existing = response.data[0];
    }

    if (existing) {
      if (!ownsProduct(existing)) {
        throw new Error(
          'This SKU is already used by a WooCommerce product not linked to this Noxtill product.',
        );
      }
      if (existing.type && existing.type !== 'simple') {
        throw new Error(
          'The linked WooCommerce product is not a simple product. Variant-preserving updates are not supported for this product.',
        );
      }
      const updated = await axios.put<WooCommerceListingProduct>(
        `${storeUrl}/wp-json/wc/v3/products/${existing.id}`,
        {
          name: createPayload.name,
          description: createPayload.description,
          regular_price: createPayload.regular_price,
        },
        { auth },
      );
      return { externalProductId: String(updated.data.id) };
    }

    const created = await axios.post<WooCommerceListingProduct>(
      `${storeUrl}/wp-json/wc/v3/products`,
      createPayload,
      { auth },
    );
    return { externalProductId: String(created.data.id) };
  }
}
