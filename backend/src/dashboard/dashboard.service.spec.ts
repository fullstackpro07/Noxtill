import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { DashboardService } from './dashboard.service';
import { WidgetsService } from '../widgets/widgets.service';
import { DASHBOARD_TODAY_WIDGET_KEYS } from './dashboard.constants';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('DashboardService (BE-068)', () => {
  let prisma: PrismaService;
  let service: DashboardService;
  let businessId: string;
  const widgetsService = {
    getWidgetData: jest.fn().mockResolvedValue({ ok: true }),
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new DashboardService(
      tenantPrisma,
      widgetsService as unknown as WidgetsService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Dashboard Test Biz',
        slug: `dashboard-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterEach(() => {
    widgetsService.getWidgetData.mockClear();
  });

  afterAll(async () => {
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('persists and returns the dashboard config JSON', async () => {
    const config = { layout: ['revenue_today', 'orders_today'] };
    await service.updateConfig(businessId, { config });

    const stored = await service.getConfig(businessId);
    expect(stored).toEqual(config);
  });

  it('aggregates every "today" widget key into one object', async () => {
    const result = await service.today();

    expect(widgetsService.getWidgetData).toHaveBeenCalledTimes(
      DASHBOARD_TODAY_WIDGET_KEYS.length,
    );
    for (const key of DASHBOARD_TODAY_WIDGET_KEYS) {
      expect(result).toHaveProperty(key, { ok: true });
    }
  });
});
