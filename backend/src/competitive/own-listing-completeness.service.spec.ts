import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { OwnListingCompletenessService } from './own-listing-completeness.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('OwnListingCompletenessService', () => {
  let prisma: PrismaService;
  let service: OwnListingCompletenessService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    service = new OwnListingCompletenessService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
    );
    const business = await prisma.business.create({
      data: { name: 'Completeness Biz', slug: `own-complete-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.listingPhoto.deleteMany({ where: { businessId } });
    await prisma.masterListing.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('returns null — not 0% — when there is no Master Record yet', async () => {
    expect(await service.get(businessId)).toBeNull();
  });

  it('scores the Master Record on the same seven public checks a competitor is scored on', async () => {
    await prisma.masterListing.create({
      data: {
        businessId,
        name: 'Completeness Biz',
        phone: '+92 300 0000000',
        website: null,
        addressLine1: '1 Test Road',
        categories: ['Salon'],
        hours: { mon: [['09:00', '17:00']] },
      },
    });

    const result = await service.get(businessId);
    // name, phone, address, category, hours present; website and photos missing → 5 of 7.
    expect(result?.percent).toBe(71);
    expect(result?.checks.find((c) => c.key === 'website')?.present).toBe(
      false,
    );
    expect(result?.checks.find((c) => c.key === 'photos')?.present).toBe(false);
  });

  it('counts a listing photo once one exists', async () => {
    await prisma.listingPhoto.create({
      data: {
        businessId,
        url: 'https://example.com/p.jpg',
        category: 'interior',
      },
    });
    const result = await service.get(businessId);
    expect(result?.checks.find((c) => c.key === 'photos')?.present).toBe(true);
    expect(result?.percent).toBe(86);
  });
});
