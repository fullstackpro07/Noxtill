import axios from 'axios';
import { WooCommerceConnector } from './woocommerce.connector';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('WooCommerce listing draft sync', () => {
  const connector = new WooCommerceConnector();
  const tokens = {
    accessToken: 'consumer-key',
    refreshToken: 'consumer-secret',
  };
  const meta = { storeUrl: 'https://shop.example' };
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
    mockedAxios.get.mockReset();
    mockedAxios.post.mockReset();
    mockedAxios.put.mockReset();
  });

  it('creates an unpublished simple product with Noxtill ownership markers', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [] });
    mockedAxios.post.mockResolvedValueOnce({ data: { id: 42 } });

    await expect(
      connector.upsertListingDraft(tokens, meta, input),
    ).resolves.toEqual({ externalProductId: '42' });
    const [, payload] = mockedAxios.post.mock.calls[0] as [
      string,
      Record<string, unknown>,
      unknown,
    ];
    expect(payload).toMatchObject({
      type: 'simple',
      name: 'Safe title',
      description: '<p>A &amp; &lt;thing&gt;</p>',
      sku: 'SKU-1',
      regular_price: '19.50',
      status: 'draft',
      meta_data: [
        { key: '_noxtill_business_id', value: 'business-1' },
        { key: '_noxtill_product_id', value: 'product-1' },
      ],
    });
  });

  it('updates only a linked simple product without changing its publication state', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        id: 42,
        sku: 'SKU-1',
        type: 'simple',
        meta_data: [
          { key: '_noxtill_business_id', value: 'business-1' },
          { key: '_noxtill_product_id', value: 'product-1' },
        ],
      },
    });
    mockedAxios.put.mockResolvedValueOnce({ data: { id: 42 } });

    await connector.upsertListingDraft(tokens, meta, input, '42');
    const [, payload] = mockedAxios.put.mock.calls[0] as [
      string,
      Record<string, unknown>,
      unknown,
    ];
    expect(payload).toEqual({
      name: 'Safe title',
      description: '<p>A &amp; &lt;thing&gt;</p>',
      regular_price: '19.50',
    });
    expect(payload).not.toHaveProperty('status');
  });

  it('does not overwrite another product that already uses the canonical SKU', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: [
        {
          id: 99,
          sku: 'SKU-1',
          meta_data: [
            { key: '_noxtill_product_id', value: 'different-product' },
          ],
        },
      ],
    });

    await expect(
      connector.upsertListingDraft(tokens, meta, input),
    ).rejects.toThrow('already used by a WooCommerce product not linked');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.put).not.toHaveBeenCalled();
  });
});
