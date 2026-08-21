import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { SalesHistoryService } from './sales-history.service';
import { OrderStatus, PaymentMethod, Role } from '@prisma/client';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('SalesHistoryService (UPD-BE-084)', () => {
  let prisma: PrismaService;
  let service: SalesHistoryService;
  let businessId: string;
  let staffAStaffId: string;
  let staffAUserId: string;
  let staffBUserId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new SalesHistoryService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Sales History Test Biz',
        slug: `sales-history-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const phoneSuffix = String(Date.now()).slice(-4);
    const staffA = await prisma.user.create({
      data: {
        name: 'Staff A',
        phone: `+1415661${phoneSuffix}`,
        passwordHash: 'x',
      },
    });
    const staffB = await prisma.user.create({
      data: {
        name: 'Staff B',
        phone: `+1415662${phoneSuffix}`,
        passwordHash: 'x',
      },
    });
    staffAUserId = staffA.id;
    staffBUserId = staffB.id;
    const staffABu = await prisma.businessUser.create({
      data: { businessId, userId: staffA.id, role: Role.staff },
    });
    const staffBBu = await prisma.businessUser.create({
      data: { businessId, userId: staffB.id, role: Role.staff },
    });
    staffAStaffId = staffABu.id;

    await prisma.order.create({
      data: {
        businessId,
        orderNo: 101,
        status: OrderStatus.completed,
        orderType: 'counter',
        total: 100,
        cogs: 40,
        discount: 5,
        staffUserId: staffABu.id,
        items: { create: [{ name: 'A', price: 100, cost: 40, qty: 1 }] },
        payments: { create: [{ method: PaymentMethod.cash, amount: 100 }] },
      },
    });
    await prisma.order.create({
      data: {
        businessId,
        orderNo: 102,
        status: OrderStatus.completed,
        orderType: 'delivery',
        total: 50,
        cogs: 20,
        staffUserId: staffBBu.id,
        items: { create: [{ name: 'B', price: 50, cost: 20, qty: 1 }] },
        payments: { create: [{ method: PaymentMethod.card, amount: 50 }] },
      },
    });
    await prisma.order.create({
      data: {
        businessId,
        orderNo: 103,
        status: OrderStatus.pending,
        orderType: 'counter',
        total: 30,
        staffUserId: staffABu.id,
        items: { create: [{ name: 'C', price: 30, cost: 10, qty: 1 }] },
      },
    });
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { order: { businessId } } });
    await prisma.orderItem.deleteMany({ where: { order: { businessId } } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.businessUser.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.user.deleteMany({
      where: { id: { in: [staffAUserId, staffBUserId] } },
    });
    await prisma.$disconnect();
  });

  it('lists only real completed/cancelled sales, excluding pending orders', async () => {
    const rows = await service.list(businessId, Role.owner, null, {});
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === 'completed')).toBe(true);
  });

  it('computes real profit as total minus cogs', async () => {
    const rows = await service.list(businessId, Role.owner, null, {});
    const row = rows.find((r) => r.orderNo === 101)!;
    expect(row.profit).toBe(60); // 100 - 40
  });

  it('staff see only their own real sales', async () => {
    const rows = await service.list(businessId, Role.staff, staffAStaffId, {});
    expect(rows).toHaveLength(1);
    expect(rows[0].staffName).toBe('Staff A');
  });

  it('filters by real payment method', async () => {
    const rows = await service.list(businessId, Role.owner, null, {
      paymentMethod: PaymentMethod.card,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].orderNo).toBe(102);
  });

  it('filters by real amount range', async () => {
    const rows = await service.list(businessId, Role.owner, null, {
      minAmount: 60,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].orderNo).toBe(101);
  });

  it('dailyRevenue() sums real completed-order totals per real day', async () => {
    const daily = await service.dailyRevenue(businessId, Role.owner, null, {});
    const today = new Date().toISOString().slice(0, 10);
    const todayRow = daily.find((d) => d.date === today);
    expect(todayRow?.revenue).toBe(150); // 100 + 50, the two completed orders
  });

  it('findOne() returns the real order with its items and staff name', async () => {
    const rows = await service.list(businessId, Role.owner, null, {});
    const target = rows.find((r) => r.orderNo === 101)!;
    const found = await service.findOne(businessId, target.id);
    expect(found?.staffUser?.user.name).toBe('Staff A');
    expect(found?.items).toHaveLength(1);
  });
});
