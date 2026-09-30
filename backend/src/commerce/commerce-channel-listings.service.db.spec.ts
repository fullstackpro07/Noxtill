import { ClsService } from 'nestjs-cls';
import {
  CommerceChannelListingStatus,
  CommerceListingDraftStatus,
  IntegrationProvider,
  IntegrationStatus,
  Prisma,
} from '@prisma/client';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { CommerceChannelListingsService } from './commerce-channel-listings.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('CommerceChannelListingsService (MySQL)', () => {
  jest.setTimeout(30_000);

  let prisma: PrismaService;
  let service: CommerceChannelListingsService;
  let businessId: string;
  let productId: string;
  let productSku: string;
  let cls: FakeClsService;
  let syncListing: jest.Mock;
  let getTokens: jest.Mock;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    syncListing = jest.fn();
    getTokens = jest.fn().mockResolvedValue({ accessToken: 'provider-token' });
    service = new CommerceChannelListingsService(
      tenantPrisma,
      { getTokens } as never,
      {
        get: () => ({ upsertListingDraft: syncListing }),
      } as never,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Channel listing test',
        slug: `channel-listing-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    productSku = `channel-${Date.now()}`;
    const product = await prisma.product.create({
      data: {
        businessId,
        name: 'Channel listing test product',
        category: 'Home goods',
        sku: productSku,
        sellingPrice: 31.25,
        costPrice: 7,
        variations: [],
      },
    });
    productId = product.id;
  });

  beforeEach(async () => {
    await prisma.product.update({
      where: { id: productId },
      data: { category: 'Home goods', sellingPrice: 31.25 },
    });
    await prisma.commerceChannelListing.deleteMany({ where: { businessId } });
    await prisma.commerceListingDraft.deleteMany({ where: { businessId } });
    await prisma.integrationSyncLog.deleteMany({ where: { businessId } });
    await prisma.integration.deleteMany({ where: { businessId } });
    syncListing
      .mockReset()
      .mockResolvedValue({ externalProductId: 'external-42' });
    getTokens.mockReset().mockResolvedValue({ accessToken: 'provider-token' });
  });

  afterAll(async () => {
    await prisma.commerceChannelListing.deleteMany({ where: { businessId } });
    await prisma.commerceListingDraft.deleteMany({ where: { businessId } });
    await prisma.integrationSyncLog.deleteMany({ where: { businessId } });
    await prisma.integration.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  async function createDraft(
    status: CommerceListingDraftStatus = CommerceListingDraftStatus.approved,
  ) {
    return prisma.commerceListingDraft.create({
      data: {
        businessId,
        productId,
        channel: 'shopify',
        status,
        currentVersion: 1,
        versions: {
          create: {
            businessId,
            version: 1,
            content: {
              title: { text: 'Verified title', sourceIds: ['product_name'] },
              description: {
                text: 'Verified description',
                sourceIds: ['product_name'],
              },
            },
            sources: [
              {
                id: 'product_name',
                label: 'Canonical product name',
                value: 'Channel listing test product',
                origin: 'canonical_product',
              },
              {
                id: 'product_category',
                label: 'Canonical product category',
                value: 'Home goods',
                origin: 'canonical_product',
              },
              {
                id: 'product_selling_price',
                label: 'Canonical current selling price',
                value: '31.25',
                origin: 'canonical_product',
              },
            ] as Prisma.InputJsonValue,
            generationMethod: 'ai',
            createdByUserId: 'operator-1',
            ...(status === CommerceListingDraftStatus.approved
              ? {
                  approvedByUserId: 'operator-1',
                  approvedAt: new Date(),
                  approvalReason: 'Verified source claims before provider sync',
                }
              : {}),
          },
        },
      },
    });
  }

  async function connectShopify() {
    await prisma.integration.create({
      data: {
        businessId,
        provider: IntegrationProvider.shopify,
        status: IntegrationStatus.connected,
        meta: { shop: 'store.myshopify.com' },
      },
    });
  }

  it('refuses to sync unapproved content before creating a provider call or channel record', async () => {
    const draft = await createDraft(CommerceListingDraftStatus.review_required);
    await connectShopify();

    await expect(
      service.syncApprovedDraft(businessId, 'operator-1', draft.id, 'shopify'),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_LISTING_INVALID_STATE' },
    });
    expect(syncListing).not.toHaveBeenCalled();
    expect(
      await prisma.commerceChannelListing.count({ where: { businessId } }),
    ).toBe(0);
  });

  it('requires fresh approval when canonical product facts changed since the approved snapshot', async () => {
    const draft = await createDraft();
    await connectShopify();
    await prisma.product.update({
      where: { id: productId },
      data: { sellingPrice: 33.5 },
    });

    await expect(
      service.syncApprovedDraft(businessId, 'operator-1', draft.id, 'shopify'),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_LISTING_INVALID_STATE' },
    });
    expect(syncListing).not.toHaveBeenCalled();
  });

  it('syncs only an approved source-cited version and persists provider ID/version/price', async () => {
    const draft = await createDraft();
    await connectShopify();

    const result = await service.syncApprovedDraft(
      businessId,
      'operator-1',
      draft.id,
      'shopify',
    );
    expect(result).toMatchObject({
      provider: IntegrationProvider.shopify,
      externalProductId: 'external-42',
      status: CommerceChannelListingStatus.synced,
      syncedVersion: 1,
      sellingPriceAtSync: 31.25,
      outOfDate: false,
    });
    expect(syncListing).toHaveBeenCalledWith(
      { accessToken: 'provider-token' },
      { shop: 'store.myshopify.com' },
      expect.objectContaining({
        businessId,
        productId,
        sku: productSku,
        title: 'Verified title',
        description: 'Verified description',
        sellingPrice: 31.25,
      }),
      undefined,
    );
    const row = await prisma.commerceChannelListing.findFirstOrThrow({
      where: { businessId, draftId: draft.id },
    });
    expect(row).toMatchObject({
      externalProductId: 'external-42',
      syncedVersion: 1,
      status: CommerceChannelListingStatus.synced,
    });
    expect(Number(row.sellingPriceAtSync)).toBe(31.25);
    expect(
      await prisma.commerceListingDraftAudit.findFirst({
        where: {
          businessId,
          draftId: draft.id,
          action: 'channel_sync_succeeded',
        },
      }),
    ).not.toBeNull();
    expect(
      await prisma.integrationSyncLog.findFirst({
        where: { businessId, provider: IntegrationProvider.shopify },
      }),
    ).toMatchObject({ success: true, recordsProcessed: 1 });

    const [listed] = (await service.list(businessId)).filter(
      (listing) => listing.draftId === draft.id,
    );
    expect(listed).toMatchObject({
      provider: IntegrationProvider.shopify,
      draftStatus: 'approved',
      externalProductId: 'external-42',
      syncedVersion: 1,
      outOfDate: false,
      priceOutOfDate: false,
    });
  });

  it('stores a sanitized provider failure and does not persist secret-bearing error text', async () => {
    const draft = await createDraft();
    await connectShopify();
    syncListing.mockRejectedValue(
      new Error('token=private-secret provider down'),
    );

    await expect(
      service.syncApprovedDraft(businessId, 'operator-1', draft.id, 'shopify'),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_LISTING_PROVIDER_SYNC_FAILED' },
    });
    const row = await prisma.commerceChannelListing.findFirstOrThrow({
      where: { businessId, draftId: draft.id },
    });
    expect(row.status).toBe(CommerceChannelListingStatus.failed);
    expect(row.lastError).not.toContain('private-secret');
    expect(row.lastError).toContain('provider did not confirm');
    expect(
      await prisma.integrationSyncLog.findFirst({
        where: { businessId, provider: IntegrationProvider.shopify },
      }),
    ).toMatchObject({ success: false, recordsProcessed: 0 });
  });

  it('rejects unsupported providers without calling integrations', async () => {
    const draft = await createDraft();
    await expect(
      service.syncApprovedDraft(businessId, 'operator-1', draft.id, 'amazon'),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_LISTING_CHANNEL_NOT_SUPPORTED' },
    });
    expect(getTokens).not.toHaveBeenCalled();
  });
});
