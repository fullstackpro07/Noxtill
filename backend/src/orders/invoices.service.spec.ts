import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { LocaleService } from '../common/localization/locale.service';
import { SendGateService } from '../messaging/send-gate.service';
import { InvoicesService } from './invoices.service';
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

describe('InvoicesService (UPD-BE-085)', () => {
  let prisma: PrismaService;
  let service: InvoicesService;
  let businessId: string;
  let staffAStaffId: string;
  let staffAUserId: string;
  let staffBUserId: string;
  let paidOrderId: string;
  let unpaidOrderId: string;
  let overdueOrderId: string;
  const sendGate = { send: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new InvoicesService(
      tenantPrisma,
      new LocaleService(),
      sendGate as unknown as SendGateService,
    );

    const business = await prisma.business.create({
      data: { name: 'Invoices Test Biz', slug: `invoices-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const phoneSuffix = String(Date.now()).slice(-4);
    const staffA = await prisma.user.create({
      data: {
        name: 'Staff A',
        phone: `+1415671${phoneSuffix}`,
        passwordHash: 'x',
      },
    });
    const staffB = await prisma.user.create({
      data: {
        name: 'Staff B',
        phone: `+1415672${phoneSuffix}`,
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

    const customer1 = await prisma.customer.create({
      data: {
        businessId,
        name: 'Paying Customer',
        phone: `+1415673${phoneSuffix}`,
      },
    });
    const customer2 = await prisma.customer.create({
      data: {
        businessId,
        name: 'Overdue Customer',
        phone: `+1415674${phoneSuffix}`,
        optedOut: true,
      },
    });
    const paidOrder = await prisma.order.create({
      data: {
        businessId,
        orderNo: 201,
        status: OrderStatus.completed,
        orderType: 'counter',
        total: 100,
        staffUserId: staffABu.id,
        customerId: customer1.id,
        items: { create: [{ name: 'Item', price: 100, cost: 40, qty: 1 }] },
        payments: { create: [{ method: PaymentMethod.cash, amount: 100 }] },
      },
    });
    paidOrderId = paidOrder.id;

    const unpaidOrder = await prisma.order.create({
      data: {
        businessId,
        orderNo: 202,
        status: OrderStatus.completed,
        orderType: 'counter',
        total: 50,
        staffUserId: staffBBu.id,
        customerId: customer1.id,
        items: { create: [{ name: 'Item', price: 50, cost: 20, qty: 1 }] },
        payments: { create: [{ method: PaymentMethod.cash, amount: 20 }] },
      },
    });
    unpaidOrderId = unpaidOrder.id;

    const overdueOrder = await prisma.order.create({
      data: {
        businessId,
        orderNo: 203,
        status: OrderStatus.completed,
        orderType: 'counter',
        total: 80,
        staffUserId: staffABu.id,
        customerId: customer2.id,
        items: { create: [{ name: 'Item', price: 80, cost: 30, qty: 1 }] },
      },
    });
    overdueOrderId = overdueOrder.id;

    // Not a real sale — a pending draft-like order that must never appear as an invoice.
    await prisma.order.create({
      data: {
        businessId,
        orderNo: 204,
        status: OrderStatus.pending,
        orderType: 'counter',
        total: 30,
        items: { create: [{ name: 'Item', price: 30, cost: 10, qty: 1 }] },
      },
    });

    const creditEntry = await prisma.creditEntry.create({
      data: {
        businessId,
        customerId: customer2.id,
        orderId: overdueOrder.id,
        kind: 'credit',
        amount: 80,
      },
    });
    const plan = await prisma.installmentPlan.create({
      data: { businessId, customerId: customer2.id, totalAmount: 80 },
    });
    await prisma.installment.create({
      data: {
        businessId,
        planId: plan.id,
        seq: 1,
        amount: 80,
        dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        status: 'pending',
        creditEntryId: creditEntry.id,
      },
    });
  });

  afterEach(() => {
    sendGate.send.mockClear();
  });

  afterAll(async () => {
    await prisma.installment.deleteMany({ where: { businessId } });
    await prisma.installmentPlan.deleteMany({ where: { businessId } });
    await prisma.creditEntry.deleteMany({ where: { businessId } });
    await prisma.payment.deleteMany({ where: { order: { businessId } } });
    await prisma.orderItem.deleteMany({ where: { order: { businessId } } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.businessUser.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.user.deleteMany({
      where: { id: { in: [staffAUserId, staffBUserId] } },
    });
    await prisma.$disconnect();
  });

  it('derives paid/unpaid/overdue purely from real Payment and Installment rows, excluding non-completed orders', async () => {
    const rows = await service.list(businessId, Role.owner, null, {});
    expect(rows).toHaveLength(3);

    const paid = rows.find((r) => r.id === paidOrderId)!;
    expect(paid.status).toBe('paid');
    expect(paid.amountDue).toBe(0);

    const unpaid = rows.find((r) => r.id === unpaidOrderId)!;
    expect(unpaid.status).toBe('unpaid');
    expect(unpaid.amountDue).toBe(30);

    const overdue = rows.find((r) => r.id === overdueOrderId)!;
    expect(overdue.status).toBe('overdue');
    expect(overdue.amountDue).toBe(80);
  });

  it('filters by status', async () => {
    const overdueOnly = await service.list(businessId, Role.owner, null, {
      status: 'overdue',
    });
    expect(overdueOnly).toHaveLength(1);
    expect(overdueOnly[0].id).toBe(overdueOrderId);
  });

  it('staff see only their own real invoices', async () => {
    const rows = await service.list(businessId, Role.staff, staffAStaffId, {});
    expect(rows).toHaveLength(2);
    expect(
      rows.every((r) => r.id === paidOrderId || r.id === overdueOrderId),
    ).toBe(true);
  });

  it('recordPayment() writes a real Payment row that moves an unpaid invoice toward paid', async () => {
    await service.recordPayment(businessId, unpaidOrderId, {
      amount: 30,
      method: 'cash',
    });
    const rows = await service.list(businessId, Role.owner, null, {});
    const updated = rows.find((r) => r.id === unpaidOrderId)!;
    expect(updated.status).toBe('paid');
    expect(updated.amountDue).toBe(0);
  });

  it('rejects recording a non-positive payment amount', async () => {
    await expect(
      service.recordPayment(businessId, paidOrderId, {
        amount: 0,
        method: 'cash',
      }),
    ).rejects.toThrow();
  });

  it('summary() aggregates real counts, totals, and a per-day trend', async () => {
    const summary = await service.summary(businessId, Role.owner, null, {});
    expect(summary.counts.overdue).toBe(1);
    expect(summary.totals.overdue).toBe(80);
    const today = new Date().toISOString().slice(0, 10);
    const todayTrend = summary.trend.find((t) => t.date === today);
    expect(todayTrend).toBeDefined();
    expect(todayTrend!.paidAmount).toBeGreaterThan(0);
  });

  it('remindAll() sends only to real, opted-in customers with a genuine unpaid/overdue invoice', async () => {
    // unpaidOrderId was fully paid off by an earlier test in this file — only the overdue,
    // opted-out customer2 invoice remains due, and customer2 is opted out, so nothing sends.
    const result = await service.remindAll(businessId, Role.owner, null);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect(sendGate.send).not.toHaveBeenCalled();
  });
});
