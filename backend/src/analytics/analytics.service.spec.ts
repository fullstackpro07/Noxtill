import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { AnalyticsService } from './analytics.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('AnalyticsService (BE-071)', () => {
  let prisma: PrismaService;
  let service: AnalyticsService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new AnalyticsService(tenantPrisma, cls as unknown as ClsService);

    const business = await prisma.business.create({
      data: {
        name: 'Analytics Test Biz',
        slug: `analytics-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    await prisma.order.create({
      data: {
        businessId,
        orderNo: 1,
        status: 'completed',
        orderType: 'counter',
        total: 200,
        subtotal: 200,
        cogs: 80,
      },
    });
    await prisma.order.create({
      data: {
        businessId,
        orderNo: 2,
        status: 'completed',
        orderType: 'counter',
        total: 100,
        subtotal: 100,
        cogs: 40,
      },
    });
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('computes this-month KPIs from completed orders', async () => {
    const kpis = await service.kpis();
    expect(kpis.ordersThisMonth).toBe(2);
    expect(kpis.revenueThisMonth).toBe(300);
    expect(kpis.grossProfitThisMonth).toBe(180);
    expect(kpis.avgOrderValue).toBe(150);
  });

  it('returns a revenue series from v_daily_close', async () => {
    const series = await service.revenueSeries(7);
    const today = new Date().toISOString().slice(0, 10);
    const todayRow = series.find((r) => r.date === today);
    expect(todayRow).toMatchObject({ orders: 2, revenue: 300 });
  });

  it('returns an empty channel breakdown when no messages exist', async () => {
    const channels = await service.channels(30);
    expect(channels).toEqual({});
  });
});
