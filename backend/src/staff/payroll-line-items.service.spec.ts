import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { PayrollLineItemsService } from './payroll-line-items.service';
import { Role } from '@prisma/client';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('PayrollLineItemsService (UPD-BE-STAFF-06)', () => {
  let prisma: PrismaService;
  let service: PayrollLineItemsService;
  let businessId: string;
  let staffUserId: string;
  let userId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new PayrollLineItemsService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Payroll Line Items Test Biz',
        slug: `payroll-line-items-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const user = await prisma.user.create({
      data: {
        phone: `+1${Date.now()}`,
        name: 'Line Item Staff',
        passwordHash: 'test-hash',
      },
    });
    userId = user.id;
    const businessUser = await prisma.businessUser.create({
      data: { businessId, userId, role: Role.staff },
    });
    staffUserId = businessUser.id;
  });

  afterAll(async () => {
    await prisma.payrollLineItem.deleteMany({ where: { businessId } });
    await prisma.businessUser.deleteMany({ where: { businessId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('creates a real line item and lists it for its month with the staff name joined', async () => {
    const created = await service.create(
      businessId,
      staffUserId,
      '2026-09',
      'Bonus',
      100,
      'add',
      userId,
    );
    expect(Number(created.amount)).toBe(100);
    expect(created.type).toBe('add');

    const list = await service.listForMonth('2026-09');
    const row = list.find((r) => r.id === created.id);
    expect(row?.staffUser.user.name).toBe('Line Item Staff');
  });

  it('does not leak into an unrelated month', async () => {
    const list = await service.listForMonth('2099-01');
    expect(list).toHaveLength(0);
  });

  it('deletes a line item', async () => {
    const created = await service.create(
      businessId,
      staffUserId,
      '2026-10',
      'Deductible',
      10,
      'deduct',
    );
    await service.delete(created.id);
    const list = await service.listForMonth('2026-10');
    expect(list.find((r) => r.id === created.id)).toBeUndefined();
  });
});
