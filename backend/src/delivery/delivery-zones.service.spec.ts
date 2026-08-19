import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { DeliveryZonesService } from './delivery-zones.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('DeliveryZonesService (UPD-BE-068)', () => {
  let prisma: PrismaService;
  let service: DeliveryZonesService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new DeliveryZonesService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Delivery Zones Test Biz',
        slug: `delivery-zones-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.deliveryZone.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('creates, lists, updates, and removes a real delivery zone', async () => {
    const created = await service.create(businessId, {
      name: 'Downtown',
      chargeType: 'flat',
      flatAmount: 5,
    });
    expect(Number(created.flatAmount)).toBe(5);

    const listed = await service.list();
    expect(listed.some((z) => z.id === created.id)).toBe(true);

    const updated = await service.update(created.id, {
      chargeType: 'by_distance',
      perKmAmount: 1.5,
    });
    expect(updated.chargeType).toBe('by_distance');
    expect(Number(updated.perKmAmount)).toBe(1.5);

    await service.remove(created.id);
    await expect(service.findOne(created.id)).rejects.toThrow();
  });

  it('rejects updating or removing an unknown zone', async () => {
    await expect(service.findOne('no-such-zone')).rejects.toThrow();
    await expect(
      service.update('no-such-zone', { name: 'x' }),
    ).rejects.toThrow();
    await expect(service.remove('no-such-zone')).rejects.toThrow();
  });
});
