import { PrismaService } from '../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { ReviewPlatformDestinationsService } from './review-platform-destinations.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('ReviewPlatformDestinationsService (UPD-BE-M31)', () => {
  let prisma: PrismaService;
  let service: ReviewPlatformDestinationsService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new ReviewPlatformDestinationsService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Platform Destinations Test Biz',
        slug: `platform-destinations-test-${Date.now()}`,
      },
    });
    businessId = business.id;
  });

  afterAll(async () => {
    await prisma.reviewPlatformDestination.deleteMany({
      where: { businessId },
    });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('starts empty', async () => {
    expect(await service.list(businessId)).toEqual([]);
  });

  it('creates a real destination and normalizes the platform key to lowercase', async () => {
    const created = await service.upsert(businessId, {
      platform: 'Facebook',
      url: 'https://facebook.com/test/reviews',
    });
    expect(created.platform).toBe('facebook');

    const list = await service.list(businessId);
    expect(list).toHaveLength(1);
    expect(list[0].url).toBe('https://facebook.com/test/reviews');
  });

  it('upserting the same platform again updates the url instead of duplicating', async () => {
    await service.upsert(businessId, {
      platform: 'facebook',
      url: 'https://facebook.com/test/reviews-updated',
    });

    const list = await service.list(businessId);
    expect(list).toHaveLength(1);
    expect(list[0].url).toBe('https://facebook.com/test/reviews-updated');
  });

  it('removes a real destination', async () => {
    await service.remove(businessId, 'facebook');
    expect(await service.list(businessId)).toEqual([]);
  });

  it('404s removing a platform that was never added', async () => {
    await expect(service.remove(businessId, 'yelp')).rejects.toThrow();
  });
});
