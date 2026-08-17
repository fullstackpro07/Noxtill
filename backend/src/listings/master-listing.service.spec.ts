import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { MasterListingService } from './master-listing.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('MasterListingService (UPD-BE-041)', () => {
  let prisma: PrismaService;
  let service: MasterListingService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new MasterListingService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Master Listing Test Biz',
        slug: `master-listing-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.masterListing.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('get() returns a default empty view before any record exists — never a 404', async () => {
    const view = await service.get(businessId);
    expect(view.id).toBeNull();
    expect(view.name).toBe('');
    expect(view.categories).toEqual([]);
  });

  it('update() creates a real row on first PATCH', async () => {
    const listing = await service.update(businessId, {
      name: 'Real Business Name',
      phone: '+15550001234',
      addressLine1: '123 Main St',
      city: 'Springfield',
      categories: ['Restaurant', 'Pizza'],
    });
    expect(listing.id).not.toBeNull();
    expect(listing.name).toBe('Real Business Name');
    expect(listing.categories).toEqual(['Restaurant', 'Pizza']);

    const fetched = await service.get(businessId);
    expect(fetched.id).toBe(listing.id);
    expect(fetched.city).toBe('Springfield');
  });

  it('update() upserts in place on a second PATCH rather than duplicating', async () => {
    await service.update(businessId, { name: 'Updated Name' });
    const rows = await prisma.masterListing.findMany({ where: { businessId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Updated Name');
    // Fields not sent on the second PATCH are cleared to undefined-in-input (not touched),
    // Prisma leaves prior values for keys omitted from `data` on update.
    expect(rows[0].addressLine1).toBe('123 Main St');
  });
});
