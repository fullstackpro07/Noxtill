import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

const API_VERSION = '2024-01';
const GRAPHQL_API_VERSION = '2026-07';
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

interface ShopifyGraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

interface ShopifyProductSetPayload {
  productSet?: {
    product?: { id: string } | null;
    userErrors?: Array<{ field?: string[] | null; message: string }>;
  };
  productByHandle?: {
    id: string;
    metafields: { nodes: Array<{ key: string; value: string }> };
    variants: {
      nodes: Array<{
        id: string;
        sku: string | null;
        selectedOptions: Array<{ name: string; value: string }>;
      }>;
    };
  } | null;
  product?: {
    id: string;
    variants: {
      nodes: Array<{
        id: string;
        sku: string | null;
        selectedOptions: Array<{ name: string; value: string }>;
      }>;
    };
  } | null;
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

  async upsertListingDraft(
    tokens: OAuthTokens,
    meta: Record<string, unknown>,
    input: EcommerceListingDraftInput,
    externalProductId?: string,
  ): Promise<EcommerceListingDraftResult> {
    const shop = meta.shop as string | undefined;
    if (!shop) throw new Error('No Shopify store connected for this business');
    const endpoint = `https://${shop}/admin/api/${GRAPHQL_API_VERSION}/graphql.json`;
    const headers = {
      'X-Shopify-Access-Token': tokens.accessToken,
      'Content-Type': 'application/json',
    };

    let identifier: { id: string } | { handle: string };
    let existingProduct: ShopifyProductSetPayload['productByHandle'] | null =
      null;
    if (externalProductId) {
      const existing = await axios.post<
        ShopifyGraphqlResponse<ShopifyProductSetPayload>
      >(
        endpoint,
        {
          query: `query NoxtillProductById($id: ID!) {
            product(id: $id) {
              id
              variants(first: 2) { nodes { id sku selectedOptions { name value } } }
            }
          }`,
          variables: { id: externalProductId },
        },
        { headers },
      );
      const lookupError = existing.data.errors?.[0]?.message;
      if (lookupError)
        throw new Error(`Shopify listing lookup failed: ${lookupError}`);
      const product = existing.data.data?.product;
      if (!product)
        throw new Error('The linked Shopify product no longer exists');
      existingProduct = {
        ...product,
        metafields: { nodes: [] },
      };
      identifier = { id: externalProductId };
    } else {
      const existing = await axios.post<
        ShopifyGraphqlResponse<ShopifyProductSetPayload>
      >(
        endpoint,
        {
          query: `query NoxtillProductByHandle($handle: String!) {
            productByHandle(handle: $handle) {
              id
              metafields(first: 10, namespace: "noxtill") { nodes { key value } }
              variants(first: 2) { nodes { id sku selectedOptions { name value } } }
            }
          }`,
          variables: { handle: input.handle },
        },
        { headers },
      );
      const lookupError = existing.data.errors?.[0]?.message;
      if (lookupError)
        throw new Error(`Shopify listing lookup failed: ${lookupError}`);
      const product = existing.data.data?.productByHandle;
      if (product) {
        const markers = new Map(
          product.metafields.nodes.map(({ key, value }) => [key, value]),
        );
        if (
          markers.get('business_id') !== input.businessId ||
          markers.get('product_id') !== input.productId
        ) {
          throw new Error(
            'The generated Shopify handle is already used by a product not linked to this Noxtill product.',
          );
        }
        existingProduct = product;
        identifier = { id: product.id };
      } else {
        identifier = { handle: input.handle };
      }
    }

    const creating = identifier && 'handle' in identifier;
    let variants: Array<Record<string, unknown>> | undefined;
    if (existingProduct) {
      if (existingProduct.variants.nodes.length !== 1) {
        throw new Error(
          'The linked Shopify product has multiple variants. Variant-preserving updates are not supported for this product.',
        );
      }
      const currentVariant = existingProduct.variants.nodes[0];
      if (
        currentVariant.sku !== input.sku ||
        currentVariant.selectedOptions.length === 0
      ) {
        throw new Error(
          'The linked Shopify variant no longer matches the canonical SKU and cannot be safely updated.',
        );
      }
      variants = [
        {
          id: currentVariant.id,
          sku: input.sku,
          price: input.sellingPrice.toFixed(2),
          optionValues: currentVariant.selectedOptions.map((option) => ({
            optionName: option.name,
            name: option.value,
          })),
        },
      ];
    } else {
      variants = [
        {
          sku: input.sku,
          price: input.sellingPrice.toFixed(2),
          optionValues: [{ optionName: 'Title', name: 'Default Title' }],
        },
      ];
    }

    const productInput: Record<string, unknown> = {
      handle: input.handle,
      title: input.title,
      descriptionHtml: plainTextAsProductHtml(input.description),
      variants,
    };
    if (creating) {
      productInput.status = 'DRAFT';
      productInput.productOptions = [
        { name: 'Title', values: [{ name: 'Default Title' }] },
      ];
      productInput.metafields = [
        {
          namespace: 'noxtill',
          key: 'business_id',
          type: 'single_line_text_field',
          value: input.businessId,
        },
        {
          namespace: 'noxtill',
          key: 'product_id',
          type: 'single_line_text_field',
          value: input.productId,
        },
      ];
    }

    const response = await axios.post<
      ShopifyGraphqlResponse<ShopifyProductSetPayload>
    >(
      endpoint,
      {
        query: `mutation NoxtillProductSet($input: ProductSetInput!, $identifier: ProductSetIdentifiers) {
          productSet(input: $input, identifier: $identifier, synchronous: true) {
            product { id }
            userErrors { field message }
          }
        }`,
        variables: {
          identifier,
          input: productInput,
        },
      },
      { headers },
    );
    const graphqlError = response.data.errors?.[0]?.message;
    if (graphqlError)
      throw new Error(`Shopify listing sync failed: ${graphqlError}`);
    const payload = response.data.data?.productSet;
    const userError = payload?.userErrors?.[0]?.message;
    if (userError) throw new Error(`Shopify listing sync failed: ${userError}`);
    const returnedId = payload?.product?.id;
    if (!returnedId) throw new Error('Shopify did not return a product ID');
    return { externalProductId: returnedId };
  }
}
