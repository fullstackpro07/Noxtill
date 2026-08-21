import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TodayBusinessService } from './today-business.service';
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

describe('TodayBusinessService (UPD-BE-082)', () => {
  let prisma: PrismaService;
  let service: TodayBusinessService;
  let businessId: string;
  let staffAUserId: string;
  let staffBUserId: string;
  let staffAStaffId: string;
  let staffBStaffId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new TodayBusinessService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Today Business Test Biz',
        slug: `today-business-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const phoneSuffix = String(Date.now()).slice(-4);
    const staffA = await prisma.user.create({
      data: {
        name: 'Staff A',
        phone: `+1415556${phoneSuffix}`,
        passwordHash: 'x',
      },
    });
    const staffB = await prisma.user.create({
      data: {
        name: 'Staff B',
        phone: `+1415557${phoneSuffix}`,
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
    staffBStaffId = staffBBu.id;

    await prisma.attendance.create({
      data: { businessId, staffUserId: staffAStaffId, checkIn: new Date() },
    });

    await prisma.order.create({
      data: {
        businessId,
        orderNo: 1,
        status: OrderStatus.completed,
        orderType: 'counter',
        total: 100,
        staffUserId: staffAStaffId,
        items: { create: [{ name: 'Haircut', price: 100, cost: 20, qty: 1 }] },
        payments: { create: [{ method: PaymentMethod.cash, amount: 100 }] },
      },
    });
    await prisma.order.create({
      data: {
        businessId,
        orderNo: 2,
        status: OrderStatus.completed,
        orderType: 'counter',
        total: 50,
        staffUserId: staffBStaffId,
        items: { create: [{ name: 'Shave', price: 50, cost: 10, qty: 1 }] },
        payments: { create: [{ method: PaymentMethod.card, amount: 50 }] },
      },
    });
    await prisma.order.create({
      data: {
        businessId,
        orderNo: 3,
        status: OrderStatus.pending,
        orderType: 'counter',
        total: 30,
        staffUserId: staffAStaffId,
        items: { create: [{ name: 'Wash', price: 30, cost: 5, qty: 1 }] },
      },
    });
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { order: { businessId } } });
    await prisma.orderItem.deleteMany({ where: { order: { businessId } } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.attendance.deleteMany({ where: { businessId } });
    await prisma.businessUser.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.user.deleteMany({
      where: { id: { in: [staffAUserId, staffBUserId] } },
    });
    await prisma.$disconnect();
  });

  it('owner sees every real transaction and correct aggregate cards', async () => {
    const result = await service.getDetail(businessId, Role.owner, null, {});
    expect(result.cards.salesCount).toBe(2); // only the 2 completed orders
    expect(result.cards.revenue).toBe(150);
    expect(result.cards.avgTicket).toBe(75);
    expect(result.cards.openOrders).toBe(1);
    expect(result.cards.staffOnDuty).toBe(1);
    expect(result.transactions).toHaveLength(3);
  });

  it("staff see only their own transactions, never another staff member's", async () => {
    const result = await service.getDetail(
      businessId,
      Role.staff,
      staffAStaffId,
      {},
    );
    expect(result.transactions.every((t) => t.staffName === 'Staff A')).toBe(
      true,
    );
    expect(result.transactions).toHaveLength(2); // 1 completed + 1 open, both staffA's
  });

  it('filters by real payment method', async () => {
    const result = await service.getDetail(businessId, Role.owner, null, {
      paymentMethod: PaymentMethod.card,
    });
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].amount).toBe(50);
  });

  it('splits real revenue by payment method for the donut chart', async () => {
    const result = await service.getDetail(businessId, Role.owner, null, {});
    const cash = result.paymentMethodSplit.find(
      (p) => p.method === PaymentMethod.cash,
    );
    const card = result.paymentMethodSplit.find(
      (p) => p.method === PaymentMethod.card,
    );
    expect(cash?.amount).toBe(100);
    expect(card?.amount).toBe(50);
  });

  it('buckets real revenue into a 24-hour running total', async () => {
    const result = await service.getDetail(businessId, Role.owner, null, {});
    expect(result.hourlyRevenue).toHaveLength(24);
    // the running total's final hour must equal total completed revenue
    expect(result.hourlyRevenue[23].revenue).toBe(150);
  });
});
