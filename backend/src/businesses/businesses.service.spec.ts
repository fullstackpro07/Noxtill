import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { BusinessesService } from './businesses.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('BusinessesService (UPD-FE-M16 fix-it)', () => {
  let prisma: PrismaService;
  let service: BusinessesService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new BusinessesService(tenantPrisma);

    const business = await prisma.business.create({
      data: { name: 'Profile Test Biz', slug: `profile-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('getProfile() returns real business fields, including the previously-unpersisted phone/address', async () => {
    const profile = await service.getProfile(businessId);
    expect(profile.name).toBe('Profile Test Biz');
    expect(profile.phone).toBeNull();
    expect(profile.address).toBeNull();
    expect(profile.taxLabel).toBe('Tax');
    expect(profile.taxRate).toBe(0);
  });

  it('updateProfile() really persists name/phone/address/currency/timezone/country', async () => {
    const updated = await service.updateProfile(businessId, {
      name: 'Renamed Biz',
      phone: '+14155551234',
      address: '1 Market St',
      currency: 'GBP',
      timezone: 'Europe/London',
      country: 'GB',
    });
    expect(updated).toEqual({
      id: businessId,
      name: 'Renamed Biz',
      phone: '+14155551234',
      address: '1 Market St',
      currency: 'GBP',
      timezone: 'Europe/London',
      country: 'GB',
      taxLabel: 'Tax',
      taxRate: 0,
    });

    const refetched = await service.getProfile(businessId);
    expect(refetched.phone).toBe('+14155551234');
  });

  it('updateProfile() really persists taxLabel/taxRate — the previously-unpersisted flat default (UPD-BE-120)', async () => {
    const updated = await service.updateProfile(businessId, {
      taxLabel: 'VAT',
      taxRate: 8.5,
    });
    expect(updated.taxLabel).toBe('VAT');
    expect(updated.taxRate).toBe(8.5);

    const refetched = await service.getProfile(businessId);
    expect(refetched.taxLabel).toBe('VAT');
    expect(refetched.taxRate).toBe(8.5);
  });

  it('updateProfile() with a partial DTO leaves other fields untouched', async () => {
    await service.updateProfile(businessId, { name: 'Twice-Renamed Biz' });
    const profile = await service.getProfile(businessId);
    expect(profile.name).toBe('Twice-Renamed Biz');
    expect(profile.phone).toBe('+14155551234');
  });
});
