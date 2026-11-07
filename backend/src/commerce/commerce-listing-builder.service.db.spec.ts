import { ClsService } from 'nestjs-cls';
import { ActivityEventType, CommerceListingDraftStatus } from '@prisma/client';
import { AiInfraService } from '../ai/ai-infra.service';
import { ActivityService } from '../activity/activity.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { CommerceListingBuilderService } from './commerce-listing-builder.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

function aiDraft(sourceId = 'product_name') {
  return JSON.stringify({
    title: { text: 'Clear product listing title', sourceIds: [sourceId] },
    bullets: [{ text: 'Product name from catalog', sourceIds: [sourceId] }],
    description: {
      text: 'Description limited to the recorded product name.',
      sourceIds: [sourceId],
    },
    faq: [],
    seo: {
      metaTitle: { text: 'Product title', sourceIds: [sourceId] },
      metaDescription: { text: 'Catalog product title', sourceIds: [sourceId] },
      keywords: [],
    },
  });
}

describe('CommerceListingBuilderService (MySQL)', () => {
  jest.setTimeout(30_000);

  let prisma: PrismaService;
  let service: CommerceListingBuilderService;
  let businessId: string;
  let productId: string;
  let cls: FakeClsService;
  let complete: jest.Mock;
  let recordActivity: jest.Mock;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    complete = jest.fn().mockResolvedValue(aiDraft());
    recordActivity = jest.fn().mockResolvedValue(undefined);
    service = new CommerceListingBuilderService(
      tenantPrisma,
      { complete } as unknown as AiInfraService,
      { record: recordActivity } as unknown as ActivityService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Commerce listing test',
        slug: `commerce-listing-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    const product = await prisma.product.create({
      data: {
        businessId,
        name: 'Verified catalog name',
        category: 'Accessories',
        sellingPrice: 24.5,
        costPrice: 8,
      },
    });
    productId = product.id;
  });

  beforeEach(async () => {
    await prisma.commerceListingDraft.deleteMany({ where: { businessId } });
    complete.mockReset().mockResolvedValue(aiDraft());
    recordActivity.mockClear();
  });

  afterAll(async () => {
    await prisma.commerceListingDraft.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('creates a source-cited version from canonical product data and audits it', async () => {
    const draft = await service.generate(businessId, 'operator_1', {
      productId,
      channel: 'shopify',
      market: 'US',
      language: 'en-US',
      merchantEvidence: [
        { statement: 'Made in Pakistan', reference: 'Supplier label photo' },
      ],
    });

    expect(draft).toMatchObject({
      product: {
        id: productId,
        name: 'Verified catalog name',
        sellingPrice: 24.5,
      },
      channel: 'shopify',
      currentVersion: 1,
      status: CommerceListingDraftStatus.review_required,
      publishStatus: 'approval_required',
      latestVersion: {
        version: 1,
        sources: [
          expect.objectContaining({
            id: 'product_name',
            origin: 'canonical_product',
          }),
          expect.objectContaining({
            id: 'product_category',
            origin: 'canonical_product',
          }),
          expect.objectContaining({
            id: 'product_selling_price',
            origin: 'canonical_product',
          }),
          expect.objectContaining({
            id: 'merchant_1',
            origin: 'merchant_evidence',
            reference: 'Supplier label photo',
          }),
        ],
      },
    });
    expect(draft.product).not.toHaveProperty('costPrice');
    expect(
      await prisma.commerceListingDraftAudit.count({ where: { businessId } }),
    ).toBe(1);
    expect(recordActivity).toHaveBeenCalledWith(
      businessId,
      expect.objectContaining({
        type: ActivityEventType.commerce_listing_draft,
        entityId: draft.id,
      }),
    );
  });

  it('rejects generated content that cites a source not present in the snapshot', async () => {
    complete.mockResolvedValue(aiDraft('invented_source'));

    await expect(
      service.generate(businessId, 'operator_1', {
        productId,
        channel: 'woocommerce',
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_LISTING_CONTENT_INVALID' },
    });
    expect(
      await prisma.commerceListingDraft.count({ where: { businessId } }),
    ).toBe(0);
  });

  it('requires explicit source confirmation, freezes approval, and versions later edits', async () => {
    const draft = await service.generate(businessId, 'operator_1', {
      productId,
      channel: 'shopify',
    });

    await expect(
      service.approve(businessId, 'operator_1', draft.id, {
        expectedVersion: 1,
        confirmedSourceAccuracy: false,
        reason: 'Claims still need checking',
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_LISTING_SOURCE_CONFIRMATION_REQUIRED' },
    });

    const approved = await service.approve(businessId, 'operator_1', draft.id, {
      expectedVersion: 1,
      confirmedSourceAccuracy: true,
      reason: 'Verified all claims against the cited product source',
    });
    expect(approved.status).toBe(CommerceListingDraftStatus.approved);
    expect(approved.latestVersion?.approvedByUserId).toBe('operator_1');

    const edited = await service.edit(businessId, 'operator_2', draft.id, {
      expectedVersion: 1,
      reason: 'Adjust wording after review',
      content: {
        title: { text: 'Edited listing title', sourceIds: ['product_name'] },
        bullets: [
          { text: 'Catalog-backed feature', sourceIds: ['product_name'] },
        ],
        description: {
          text: 'A revised description.',
          sourceIds: ['product_name'],
        },
        faq: [],
        seo: {
          metaTitle: { text: 'Edited title', sourceIds: ['product_name'] },
          metaDescription: {
            text: 'Revised SEO description',
            sourceIds: ['product_name'],
          },
          keywords: [],
        },
      },
    });

    expect(edited).toMatchObject({
      currentVersion: 2,
      status: CommerceListingDraftStatus.review_required,
      latestVersion: {
        version: 2,
        generationMethod: 'manual',
        approvedAt: null,
      },
    });
    const history = await service.history(businessId, draft.id);
    expect(history.versions).toHaveLength(2);
    expect(
      history.versions.find((version) => version.version === 1)?.approvedAt,
    ).not.toBeNull();
    expect(history.audits.map((audit) => audit.action)).toEqual([
      'draft_edited',
      'content_approved',
      'draft_generated',
    ]);
  });

  it('rejects stale version writes and products outside the business', async () => {
    const draft = await service.generate(businessId, 'operator_1', {
      productId,
      channel: 'shopify',
    });
    await service.edit(businessId, 'operator_1', draft.id, {
      expectedVersion: 1,
      reason: 'Create version two',
      content: {
        title: { text: 'Version two', sourceIds: ['product_name'] },
        bullets: [{ text: 'Version two detail', sourceIds: ['product_name'] }],
        description: {
          text: 'Version two description',
          sourceIds: ['product_name'],
        },
        faq: [],
        seo: {
          metaTitle: { text: 'Version two title', sourceIds: ['product_name'] },
          metaDescription: {
            text: 'Version two SEO text',
            sourceIds: ['product_name'],
          },
          keywords: [],
        },
      },
    });

    await expect(
      service.edit(businessId, 'operator_1', draft.id, {
        expectedVersion: 1,
        reason: 'Stale write',
        content: {},
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_LISTING_VERSION_CONFLICT' },
    });

    await expect(
      service.generate(businessId, 'operator_1', {
        productId: 'foreign-product-id',
        channel: 'shopify',
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_LISTING_PRODUCT_NOT_FOUND' },
    });
  });
});
