import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
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
  let service: CommissionsService;
  let businessId: string;
  let staffBusinessUserId: string;
  let serviceProductId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new CommissionsService(tenantPrisma);

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
    await prisma.businessUser.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
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
});
