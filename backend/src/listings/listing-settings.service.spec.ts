import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { ListingSettingsService } from './listing-settings.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('ListingSettingsService (UPD-BE-125)', () => {
  let prisma: PrismaService;
  let service: ListingSettingsService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new ListingSettingsService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Listing Settings Test Biz',
        slug: `listing-settings-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.listingSettings.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('get() returns real defaults before any row exists — never a 404', async () => {
    const settings = await service.get(businessId);
    expect(settings.id).toBeNull();
    expect(settings.autoSyncEnabled).toBe(false);
    expect(settings.autoSyncFrequencyHours).toBe(24);
    expect(settings.conflictResolution).toBe('master_wins');
    expect(settings.fieldMapping).toEqual({});
  });

  it('findFieldMapping() returns {} before any row exists', async () => {
    const mapping = await service.findFieldMapping(businessId);
    expect(mapping).toEqual({});
  });

  it('update() really persists on first call and can be refetched', async () => {
    const updated = await service.update(businessId, {
      autoSyncEnabled: true,
      autoSyncFrequencyHours: 6,
      fieldMapping: { gmb: ['phone'] },
      conflictResolution: 'directory_wins',
    });
    expect(updated.autoSyncEnabled).toBe(true);
    expect(updated.autoSyncFrequencyHours).toBe(6);
    expect(updated.fieldMapping).toEqual({ gmb: ['phone'] });
    expect(updated.conflictResolution).toBe('directory_wins');

    const refetched = await service.get(businessId);
    expect(refetched.autoSyncEnabled).toBe(true);
    expect(refetched.fieldMapping).toEqual({ gmb: ['phone'] });

    const mapping = await service.findFieldMapping(businessId);
    expect(mapping).toEqual({ gmb: ['phone'] });
  });

  it('a partial update() merges over the existing row rather than resetting it', async () => {
    await service.update(businessId, { autoSyncFrequencyHours: 12 });
    const refetched = await service.get(businessId);
    expect(refetched.autoSyncFrequencyHours).toBe(12);
    // Untouched fields from the previous update survive.
    expect(refetched.autoSyncEnabled).toBe(true);
    expect(refetched.fieldMapping).toEqual({ gmb: ['phone'] });
  });
});
