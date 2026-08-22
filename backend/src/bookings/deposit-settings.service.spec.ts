import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { DepositSettingsService } from './deposit-settings.service';
import { DEFAULT_DEPOSIT_SETTINGS } from './bookings.constants';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('DepositSettingsService (UPD-BE-091)', () => {
  let prisma: PrismaService;
  let service: DepositSettingsService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new DepositSettingsService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Deposit Settings Test Biz',
        slug: `deposit-settings-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.depositSettings.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('defaults to "not required" before any row exists', async () => {
    const settings = await service.get(businessId);
    expect(settings).toMatchObject(DEFAULT_DEPOSIT_SETTINGS);
  });

  it('persists a trigger rule and preserves the other defaults', async () => {
    const updated = await service.update(businessId, {
      required: true,
      triggerAfterNoShows: 2,
      amountType: 'percent',
      amountValue: 20,
    });
    expect(updated.required).toBe(true);
    expect(updated.triggerAfterNoShows).toBe(2);
    expect(updated.amountType).toBe('percent');
    expect(Number(updated.amountValue)).toBe(20);
    expect((updated.applicableServiceIds as string[]).length).toBe(0);

    const reread = await service.get(businessId);
    expect(reread).toMatchObject({ required: true, triggerAfterNoShows: 2 });
  });

  it('scopes applicableServiceIds to the services passed', async () => {
    const updated = await service.update(businessId, {
      applicableServiceIds: ['svc-1', 'svc-2'],
    });
    expect(updated.applicableServiceIds).toEqual(['svc-1', 'svc-2']);
  });
});
