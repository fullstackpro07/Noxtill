import { ClsService } from 'nestjs-cls';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { WidgetsService } from '../widgets/widgets.service';
import { BusinessIntelligenceService } from './business-intelligence.service';

class FakeClsService {
  private readonly store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown): void {
    this.store[key] = value;
  }
}

describe('BusinessIntelligenceService overview (MySQL)', () => {
  let prisma: PrismaService;
  let service: BusinessIntelligenceService;
  let businessId: string;
  let otherBusinessId: string;
  let emptyBusinessId: string;
  let cls: FakeClsService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const [business, other, emptyBusiness] = await Promise.all([
      prisma.business.create({
        data: {
          name: 'BI overview integration',
          slug: `bi-overview-${Date.now()}`,
        },
      }),
      prisma.business.create({
        data: {
          name: 'BI overview other tenant',
          slug: `bi-overview-other-${Date.now()}`,
        },
      }),
      prisma.business.create({
        data: {
          name: 'BI overview empty source',
          slug: `bi-overview-empty-${Date.now()}`,
        },
      }),
    ]);
    businessId = business.id;
    otherBusinessId = other.id;
    emptyBusinessId = emptyBusiness.id;

    cls = new FakeClsService();
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    const tenant = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const widgets = new WidgetsService(tenant, cls as unknown as ClsService);
    service = new BusinessIntelligenceService(tenant, widgets);
  });

  afterAll(async () => {
    await prisma.aiInsight.deleteMany({
      where: {
        businessId: { in: [businessId, otherBusinessId, emptyBusinessId] },
      },
    });
    await prisma.order.deleteMany({
      where: {
        businessId: { in: [businessId, otherBusinessId, emptyBusinessId] },
      },
    });
    await prisma.business.deleteMany({
      where: { id: { in: [businessId, otherBusinessId, emptyBusinessId] } },
    });
    await prisma.$disconnect();
  });

  it('uses existing Dashboard metric definitions and scopes insights to the current business', async () => {
    cls.set(CLS_KEY_BUSINESS_ID, emptyBusinessId);
    const empty = await service.overview(emptyBusinessId);
    expect(empty.insights).toEqual([]);
    expect(
      empty.metrics.find((metric) => metric.key === 'orders_today')?.value,
    ).toEqual({ count: 0 });

    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    await prisma.order.create({
      data: {
        businessId,
        orderNo: 910001,
        status: 'completed',
        subtotal: 125,
        total: 125,
        createdAt: new Date(),
      },
    });
    await prisma.order.create({
      data: {
        businessId: otherBusinessId,
        orderNo: 910001,
        status: 'completed',
        subtotal: 900,
        total: 900,
        createdAt: new Date(),
      },
    });
    await prisma.aiInsight.create({
      data: {
        businessId,
        category: 'sales',
        observation: 'Revenue changed in the recorded comparison.',
        sourceFigure: 'Revenue source evidence from the integration test.',
      },
    });
    await prisma.aiInsight.create({
      data: {
        businessId: otherBusinessId,
        category: 'sales',
        observation: 'Other tenant insight.',
        sourceFigure: 'Should not appear.',
      },
    });

    const result = await service.overview(businessId);
    const todayRevenue = result.metrics.find(
      (metric) => metric.key === 'revenue_today',
    );
    expect(todayRevenue?.value).toMatchObject({ revenue: 125, orders: 1 });
    expect(result.insights).toHaveLength(1);
    expect(result.insights[0].sourceFigure).toContain(
      'Revenue source evidence',
    );
    expect(result.insights[0].nextDecisionHref).toBe('/profit');
  });
});
