import { ClsService } from 'nestjs-cls';
import {
  CommerceChannelListingStatus,
  IntegrationProvider,
  IntegrationStatus,
} from '@prisma/client';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import type { ConnectorRegistry } from '../integrations/connector-registry';
import type { IntegrationsService } from '../integrations/integrations.service';
import { PrismaService } from '../prisma/prisma.service';
import { CommerceReconciliationService } from './commerce-reconciliation.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('CommerceReconciliationService (MySQL)', () => {
  let prisma: PrismaService;
  let service: CommerceReconciliationService;
  let businessId: string;
  const fetchProducts = jest.fn();
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    service = new CommerceReconciliationService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
      {
        getTokens: jest.fn().mockResolvedValue({ accessToken: 't' }),
      } as unknown as IntegrationsService,
      {
        get: (provider: IntegrationProvider) =>
          provider === IntegrationProvider.shopify ? { fetchProducts } : {},
      } as unknown as ConnectorRegistry,
    );
    businessId = (
      await prisma.business.create({
        data: { name: 'Recon Co', slug: `recon-${stamp}` },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    await prisma.integration.create({
      data: {
        businessId,
        provider: IntegrationProvider.shopify,
        status: IntegrationStatus.connected,
        meta: { shop: 'recon.myshopify.com' },
      },
    });
    const listing = async (
      name: string,
      sku: string | null,
      stockQty: number,
      provider: IntegrationProvider = IntegrationProvider.shopify,
    ) => {
      const product = await prisma.product.create({
        data: {
          businessId,
          name,
          sku: sku ? `${sku}-${stamp}` : null,
          stockQty,
        },
      });
      const draft = await prisma.commerceListingDraft.create({
        data: { businessId, productId: product.id, channel: provider },
      });
      await prisma.commerceChannelListing.create({
        data: {
          businessId,
          draftId: draft.id,
          productId: product.id,
          provider,
          status: CommerceChannelListingStatus.synced,
        },
      });
    };
    await listing('Matches', 'A', 5);
    await listing('Gone', 'B', 3);
    await listing('Drifted', 'C', 9);
    await listing('No SKU', null, 1);
    await listing('Woo item', 'D', 2, IntegrationProvider.woocommerce);
  });

  afterAll(async () => {
    await prisma.commerceReconciliationItem.deleteMany({
      where: { businessId },
    });
    await prisma.commerceReconciliationRun.deleteMany({
      where: { businessId },
    });
    await prisma.commerceChannelListing.deleteMany({ where: { businessId } });
    await prisma.commerceListingDraft.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.integration.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('records discrepancies per provider without touching canonical data', async () => {
    fetchProducts.mockResolvedValueOnce([
      { sku: `A-${stamp}`, quantity: 5, updatedAt: '' },
      { sku: `c-${stamp}`, quantity: 4, updatedAt: '' },
    ]);
    const { runs } = await service.run(businessId, 'owner');
    const shopify = runs.find(
      (run) => run.provider === IntegrationProvider.shopify,
    )!;
    const woo = runs.find(
      (run) => run.provider === IntegrationProvider.woocommerce,
    )!;
    expect(shopify).toMatchObject({
      status: 'completed',
      listingsChecked: 4,
      discrepancies: 3,
    });
    expect(woo).toMatchObject({ status: 'skipped', listingsChecked: 0 });
    expect(woo.detail).toMatch(/not connected/);

    const overview = await service.overview(businessId);
    const kinds = overview.items.map((item) => item.kind).sort();
    expect(kinds).toEqual(['missing_on_provider', 'no_sku', 'stock_mismatch']);
    const drift = overview.items.find(
      (item) => item.kind === 'stock_mismatch',
    )!;
    expect(drift.remote).toMatchObject({ quantity: 4 });
    expect(overview.checks.notChecked).toMatch(/price, title/);

    const drifted = await prisma.product.findFirstOrThrow({
      where: { businessId, name: 'Drifted' },
    });
    expect(drifted.stockQty).toBe(9); // never overwritten

    await expect(
      service.decide(businessId, 'owner', drift.id, 'resolved', ' '),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_RECON_NOTE_REQUIRED' },
    });
    await service.decide(
      businessId,
      'owner',
      drift.id,
      'resolved',
      'Recounted shelf; store was right',
    );
    await expect(
      service.decide(businessId, 'owner', drift.id, 'dismissed', 'again'),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_RECON_ITEM_CLOSED' },
    });
    expect((await service.overview(businessId)).openItems).toBe(2);
  });

  it('records a failed run when the provider read fails', async () => {
    fetchProducts.mockRejectedValueOnce(new Error('HTTP 401'));
    const { runs } = await service.run(businessId, 'owner');
    expect(
      runs.find((run) => run.provider === IntegrationProvider.shopify),
    ).toMatchObject({
      status: 'failed',
      discrepancies: 0,
    });
  });
});
