import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { ShopifyConnector } from './shopify.connector';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Shopify listing draft sync', () => {
  const connector = new ShopifyConnector(new ConfigService());
  const tokens = { accessToken: 'shop-token' };
  const meta = { shop: 'store.myshopify.com' };
  const input = {
    businessId: 'business-1',
    productId: 'product-1',
    handle: 'noxtill-business-1-product-1',
    sku: 'SKU-1',
    title: 'Safe title',
    description: 'A & <thing>',
    sellingPrice: 19.5,
  };

  beforeEach(() => {
    mockedAxios.post.mockReset();
  });

  it('creates an unpublished product draft with escaped description and canonical SKU/price', async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: { data: { productByHandle: null } } })
      .mockResolvedValueOnce({
        data: {
          data: {
            productSet: {
              product: { id: 'gid://shopify/Product/123' },
              userErrors: [],
            },
          },
        },
      });

    await expect(
      connector.upsertListingDraft(tokens, meta, input),
    ).resolves.toEqual({ externalProductId: 'gid://shopify/Product/123' });
    const [, body] = mockedAxios.post.mock.calls[1] as [
      string,
      { variables: { input: Record<string, unknown> } },
      unknown,
    ];
    expect(body.variables.input).toMatchObject({
      handle: input.handle,
      title: input.title,
      descriptionHtml: '<p>A &amp; &lt;thing&gt;</p>',
      status: 'DRAFT',
      variants: [
        {
          sku: 'SKU-1',
          price: '19.50',
          optionValues: [{ optionName: 'Title', name: 'Default Title' }],
        },
      ],
    });
  });

  it('updates only a linked one-variant product and preserves its live/draft status', async () => {
    mockedAxios.post
      .mockResolvedValueOnce({
        data: {
          data: {
            product: {
              id: 'gid://shopify/Product/123',
              variants: {
                nodes: [
                  {
                    id: 'gid://shopify/ProductVariant/456',
                    sku: 'SKU-1',
                    selectedOptions: [
                      { name: 'Title', value: 'Default Title' },
                    ],
                  },
                ],
              },
            },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: {
            productSet: {
              product: { id: 'gid://shopify/Product/123' },
              userErrors: [],
            },
          },
        },
      });

    await connector.upsertListingDraft(
      tokens,
      meta,
      input,
      'gid://shopify/Product/123',
    );
    const [, body] = mockedAxios.post.mock.calls[1] as [
      string,
      { variables: { input: Record<string, unknown> } },
      unknown,
    ];
    expect(body.variables.input).not.toHaveProperty('status');
    expect(body.variables.input).not.toHaveProperty('metafields');
    expect(body.variables.input.variants).toEqual([
      {
        id: 'gid://shopify/ProductVariant/456',
        sku: 'SKU-1',
        price: '19.50',
        optionValues: [{ optionName: 'Title', name: 'Default Title' }],
      },
    ]);
  });

  it('refuses to overwrite an unrelated product that happens to use the generated handle', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        data: {
          productByHandle: {
            id: 'gid://shopify/Product/789',
            metafields: {
              nodes: [{ key: 'product_id', value: 'another-product' }],
            },
            variants: { nodes: [] },
          },
        },
      },
    });

    await expect(
      connector.upsertListingDraft(tokens, meta, input),
    ).rejects.toThrow('already used by a product not linked');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });
});
