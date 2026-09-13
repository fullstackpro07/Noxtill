import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { AdSettingsService } from './ad-settings.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('AdSettingsService (UPD-BE-131, Advertising Settings)', () => {
  let prisma: PrismaService;
  let service: AdSettingsService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new AdSettingsService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Ad Settings Test Biz',
        slug: `ad-settings-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.adSettings.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('get() returns a real default-empty view before any row exists, without creating one', async () => {
    const result = await service.get(businessId);
    expect(result.defaultDailyBudgetCap).toBeNull();
    expect(result.autoPauseCostPerResult).toBeNull();
    expect(result.requireApproval).toBe(false);

    const stored = await prisma.adSettings.findUnique({
      where: { businessId },
    });
    expect(stored).toBeNull();
  });

  it('update() upserts a real row and persists every field', async () => {
    const updated = await service.update(businessId, {
      defaultDailyBudgetCap: 50,
      autoPauseCostPerResult: 12.5,
      requireApproval: true,
    });
    expect(Number(updated.defaultDailyBudgetCap)).toBe(50);
    expect(Number(updated.autoPauseCostPerResult)).toBe(12.5);
    expect(updated.requireApproval).toBe(true);

    const fetched = await service.get(businessId);
    expect(Number(fetched.autoPauseCostPerResult)).toBe(12.5);

    // A second update() upserts the same row rather than creating a duplicate.
    await service.update(businessId, { autoPauseCostPerResult: null });
    const rows = await prisma.adSettings.findMany({ where: { businessId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].autoPauseCostPerResult).toBeNull();
  });
});
