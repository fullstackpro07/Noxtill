import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import type { NotificationsService } from '../notifications/notifications.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { CommissionsService } from './commissions.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('CommissionsService (BE-058)', () => {
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let service: CommissionsService;
  let businessId: string;
  let staffBusinessUserId: string;
  let serviceProductId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    tenantPrisma = new TenantPrismaService(prisma, cls as unknown as ClsService);
    const audit = new AuditService(tenantPrisma, cls as unknown as ClsService);
    const notifications = { create: jest.fn() } as unknown as NotificationsService;
    service = new CommissionsService(tenantPrisma, audit, notifications);

    const business = await prisma.business.create({
      data: {
        name: 'Commissions Test Biz',
        slug: `commissions-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const user = await prisma.user.create({
      data: {
        name: 'Percent Staff',
        email: `pct-${Date.now()}@example.com`,
        passwordHash: 'x',
      },
    });
    const businessUser = await prisma.businessUser.create({
      data: {
        businessId,
        userId: user.id,
        role: 'staff',
        commissionRule: { type: 'percent', value: 10 },
      },
    });
    staffBusinessUserId = businessUser.id;

    const svc = await prisma.product.create({
      data: { businessId, kind: 'service', name: 'Facial', durationMin: 45 },
    });
    serviceProductId = svc.id;
  });

  afterAll(async () => {
    await prisma.appointment.deleteMany({ where: { businessId } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.commissionPayment.deleteMany({ where: { businessId } });
    await prisma.staffAdvance.deleteMany({ where: { businessId } });
    await prisma.businessUser.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('computes a percent commission from sales attributed to that staff member', async () => {
    await prisma.order.create({
      data: {
        businessId,
        orderNo: 1,
        status: 'completed',
        orderType: 'counter',
        staffUserId: staffBusinessUserId,
        total: 500,
        subtotal: 500,
        createdAt: new Date('2026-05-15T00:00:00Z'),
      },
    });
    // A sale outside the requested month must not count.
    await prisma.order.create({
      data: {
        businessId,
        orderNo: 2,
        status: 'completed',
        orderType: 'counter',
        staffUserId: staffBusinessUserId,
        total: 1000,
        subtotal: 1000,
        createdAt: new Date('2026-06-15T00:00:00Z'),
      },
    });

    const report = await service.report('2026-05');
    const row = report.find((r) => r.businessUserId === staffBusinessUserId)!;
    expect(row.totalSales).toBe(500);
    expect(row.commission).toBe(50);
  });

  it('computes a per-service commission from completed appointments', async () => {
    const user = await prisma.user.create({
      data: {
        name: 'Per Service Staff',
        email: `perservice-${Date.now()}@example.com`,
        passwordHash: 'x',
      },
    });
    const businessUser = await prisma.businessUser.create({
      data: {
        businessId,
        userId: user.id,
        role: 'staff',
        commissionRule: {
          type: 'per_service',
          amounts: { [serviceProductId]: 15 },
        },
      },
    });

    const customer = await prisma.customer.create({
      data: { businessId, phone: `+1${Date.now()}`, name: 'Client' },
    });

    await prisma.appointment.create({
      data: {
        businessId,
        serviceId: serviceProductId,
        staffUserId: businessUser.id,
        customerId: customer.id,
        startsAt: new Date('2026-05-10T10:00:00Z'),
        endsAt: new Date('2026-05-10T11:00:00Z'),
        status: 'completed',
      },
    });

    const report = await service.report('2026-05');
    const row = report.find((r) => r.businessUserId === businessUser.id)!;
    expect(row.commission).toBe(15);
  });

  it('reports ruleLabel, advancesOutstanding and paid alongside the sales figures', async () => {
    await prisma.staffAdvance.create({
      data: {
        businessId,
        staffUserId: staffBusinessUserId,
        amount: 2000,
        status: 'outstanding',
      },
    });

    const before = await service.report('2026-05');
    const rowBefore = before.find((r) => r.businessUserId === staffBusinessUserId)!;
    expect(rowBefore.ruleLabel).toBe('10% of sales');
    expect(rowBefore.advancesOutstanding).toBe(2000);
    expect(rowBefore.paid).toBe(false);

    await service.markPaid(businessId, staffBusinessUserId, '2026-05');

    const after = await service.report('2026-05');
    const rowAfter = after.find((r) => r.businessUserId === staffBusinessUserId)!;
    expect(rowAfter.paid).toBe(true);
    // A different month is unaffected by this month's payment.
    const juneReport = await service.report('2026-06');
    expect(juneReport.find((r) => r.businessUserId === staffBusinessUserId)!.paid).toBe(false);

    await prisma.staffAdvance.deleteMany({ where: { businessId } });
  });

  it('markPaid() is idempotent and writes a real audit log entry', async () => {
    await service.markPaid(businessId, staffBusinessUserId, '2026-07', 'some-user-id');
    await service.markPaid(businessId, staffBusinessUserId, '2026-07', 'some-user-id');

    const count = await prisma.commissionPayment.count({
      where: { businessId, staffUserId: staffBusinessUserId, month: '2026-07' },
    });
    expect(count).toBe(1);

    const auditRow = await prisma.auditLog.findFirst({
      where: { businessId, entity: 'commission_payment', action: 'commission.mark_paid' },
    });
    expect(auditRow).not.toBeNull();
  });

  it('sendStatement() sends a real notification with this month\'s real figures', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'notif-1' });
    const serviceWithSpy = new CommissionsService(
      tenantPrisma,
      { log: jest.fn() } as unknown as AuditService,
      { create } as unknown as NotificationsService,
    );

    await serviceWithSpy.sendStatement(businessId, staffBusinessUserId, '2026-05');

    expect(create).toHaveBeenCalledTimes(1);
    const [calledBusinessId, calledUserId, input] = create.mock.calls[0];
    expect(calledBusinessId).toBe(businessId);
    expect(typeof calledUserId).toBe('string');
    expect(input.title).toContain('2026-05');
    expect(input.body).toContain('50');
  });
});
