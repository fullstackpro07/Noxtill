import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { DeliverySettingsService } from './delivery-settings.service';
import { DEFAULT_DELIVERY_SETTINGS } from './delivery.constants';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('DeliverySettingsService (on-time-rate depth fix)', () => {
  let prisma: PrismaService;
  let service: DeliverySettingsService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new DeliverySettingsService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Delivery Settings Test Biz',
        slug: `delivery-settings-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.deliverySettings.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('get() returns the real default before any row exists, without creating one', async () => {
    const result = await service.get(businessId);
    expect(result.defaultSlaMinutes).toBe(
      DEFAULT_DELIVERY_SETTINGS.defaultSlaMinutes,
    );

    const stored = await prisma.deliverySettings.findUnique({
      where: { businessId },
    });
    expect(stored).toBeNull();
  });

  it('getSlaMinutes() returns the default when no row exists', async () => {
    const minutes = await service.getSlaMinutes(businessId);
    expect(minutes).toBe(DEFAULT_DELIVERY_SETTINGS.defaultSlaMinutes);
  });

  it('update() upserts a real row and get()/getSlaMinutes() reflect it afterwards', async () => {
    const updated = await service.update(businessId, {
      defaultSlaMinutes: 30,
    });
    expect(updated.defaultSlaMinutes).toBe(30);

    const fetched = await service.get(businessId);
    expect(fetched.defaultSlaMinutes).toBe(30);
    expect(await service.getSlaMinutes(businessId)).toBe(30);

    // A second update() upserts the same row rather than creating a duplicate.
    await service.update(businessId, { defaultSlaMinutes: 60 });
    const rows = await prisma.deliverySettings.findMany({
      where: { businessId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].defaultSlaMinutes).toBe(60);
  });
});
