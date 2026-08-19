import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { RecurringObligationsService } from './recurring-obligations.service';
import { RecurringObligationFrequency } from '@prisma/client';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('RecurringObligationsService (UPD-BE-078)', () => {
  let prisma: PrismaService;
  let service: RecurringObligationsService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new RecurringObligationsService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Recurring Obligations Test Biz',
        slug: `recurring-obligations-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.recurringObligation.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('creates, lists, updates, and removes a real obligation', async () => {
    const created = await service.create(businessId, {
      name: 'Rent',
      amount: 2000,
      frequency: RecurringObligationFrequency.monthly,
      nextDueDate: '2026-09-01',
    });
    expect(created.active).toBe(true);

    const listed = await service.list();
    expect(listed.some((o) => o.id === created.id)).toBe(true);

    const updated = await service.update(created.id, { amount: 2200 });
    expect(Number(updated.amount)).toBe(2200);

    await service.remove(created.id);
    await expect(service.update(created.id, { amount: 1 })).rejects.toThrow();
  });

  it('rejects updating/removing an obligation that does not exist', async () => {
    await expect(service.update('no-such-id', { amount: 1 })).rejects.toThrow();
    await expect(service.remove('no-such-id')).rejects.toThrow();
  });
});
