import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { AdCreativesService } from './ad-creatives.service';
import { IntegrationProvider } from '@prisma/client';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('AdCreativesService (UPD-BE-070)', () => {
  let prisma: PrismaService;
  let service: AdCreativesService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new AdCreativesService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Ad Creatives Test Biz',
        slug: `ad-creatives-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.adCreative.deleteMany({ where: { businessId } });
    await prisma.externalReview.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('creates, lists, updates, and removes a real manual creative', async () => {
    const created = await service.create(businessId, {
      provider: IntegrationProvider.meta_ads,
      headline: 'Big Sale',
      body: 'Everything 20% off this week.',
    });
    expect(created.status).toBe('draft');

    const listed = await service.list();
    expect(listed.some((c) => c.id === created.id)).toBe(true);

    const updated = await service.update(created.id, { status: 'approved' });
    expect(updated.status).toBe('approved');

    await service.remove(created.id);
    await expect(service.findOne(created.id)).rejects.toThrow();
  });

  it('builds real ad copy from a real customer review, never inventing praise', async () => {
    const review = await prisma.externalReview.create({
      data: {
        businessId,
        platform: 'google',
        externalId: `ext-${Date.now()}`,
        stars: 5,
        text: 'Best haircut I have ever had, the staff were amazing!',
      },
    });

    const creative = await service.createFromReview(businessId, {
      reviewId: review.id,
      provider: IntegrationProvider.meta_ads,
    });

    expect(creative.sourceReviewId).toBe(review.id);
    expect(creative.body).toBe(
      'Best haircut I have ever had, the staff were amazing!',
    );
    expect(creative.headline).toContain('★★★★★');
  });

  it('falls back to a real star-rating summary when the review has no text', async () => {
    const review = await prisma.externalReview.create({
      data: {
        businessId,
        platform: 'google',
        externalId: `ext-no-text-${Date.now()}`,
        stars: 4,
      },
    });

    const creative = await service.createFromReview(businessId, {
      reviewId: review.id,
      provider: IntegrationProvider.meta_ads,
    });
    expect(creative.body).toBe('Rated 4/5 on google.');
  });

  it('rejects a review id that does not exist', async () => {
    await expect(
      service.createFromReview(businessId, {
        reviewId: 'no-such-review',
        provider: IntegrationProvider.meta_ads,
      }),
    ).rejects.toThrow();
  });
});
