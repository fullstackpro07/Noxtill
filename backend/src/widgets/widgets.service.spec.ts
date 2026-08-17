import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { WidgetsService } from './widgets.service';
import { AppException } from '../common/filters/app.exception';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('WidgetsService (BE-067)', () => {
  let prisma: PrismaService;
  let service: WidgetsService;
  let businessId: string;
  let productId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new WidgetsService(tenantPrisma, cls as unknown as ClsService);

    const business = await prisma.business.create({
      data: { name: 'Widgets Test Biz', slug: `widgets-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const product = await prisma.product.create({
      data: {
        businessId,
        kind: 'product',
        name: 'Widget Product',
        stockQty: 2,
        lowStockThreshold: 5,
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('lists the widget registry with only key/title/category (no data)', () => {
    const registry = service.listRegistry();
    expect(registry.length).toBeGreaterThanOrEqual(20);
    expect(registry.find((w) => w.key === 'low_stock_count')).toEqual({
      key: 'low_stock_count',
      title: 'Low Stock Items',
      category: 'inventory',
    });
  });

  it('computes low_stock_count from real product data', async () => {
    const result = await service.getWidgetData('low_stock_count');
    expect(result).toEqual({ count: 1 });
  });

  it('caches a widget result for subsequent calls within the TTL', async () => {
    const first = await service.getWidgetData('low_stock_count');

    await prisma.product.update({
      where: { id: productId },
      data: { stockQty: 100 },
    });
    const second = await service.getWidgetData('low_stock_count');

    expect(second).toEqual(first); // still cached, doesn't reflect the update yet
  });

  it('throws a typed not-found error for an unknown widget key', async () => {
    await expect(
      service.getWidgetData('does_not_exist'),
    ).rejects.toBeInstanceOf(AppException);
  });

  describe('range-aware "(this month)" widgets', () => {
    let rangeBusinessId: string;

    beforeAll(async () => {
      const business = await prisma.business.create({
        data: {
          name: 'Widgets Range Test Biz',
          slug: `widgets-range-test-${Date.now()}`,
        },
      });
      rangeBusinessId = business.id;

      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      await prisma.customer.create({
        data: {
          businessId: rangeBusinessId,
          name: 'Range Test Customer',
          phone: `+1555${Date.now()}`,
          createdAt: tenDaysAgo,
        },
      });
    });

    afterAll(async () => {
      await prisma.customer.deleteMany({
        where: { businessId: rangeBusinessId },
      });
      await prisma.business.delete({ where: { id: rangeBusinessId } });
    });

    it('excludes a customer created 10 days ago from a 7-day window', async () => {
      const cls = new FakeClsService();
      cls.set(CLS_KEY_BUSINESS_ID, rangeBusinessId);
      const tenantPrisma = new TenantPrismaService(
        prisma,
        cls as unknown as ClsService,
      );
      const scopedService = new WidgetsService(
        tenantPrisma,
        cls as unknown as ClsService,
      );

      const result = await scopedService.getWidgetData(
        'new_customers_month',
        7,
      );
      expect(result).toEqual({ count: 0 });
    });

    it('includes the same customer in a 30-day window', async () => {
      const cls = new FakeClsService();
      cls.set(CLS_KEY_BUSINESS_ID, rangeBusinessId);
      const tenantPrisma = new TenantPrismaService(
        prisma,
        cls as unknown as ClsService,
      );
      const scopedService = new WidgetsService(
        tenantPrisma,
        cls as unknown as ClsService,
      );

      const result = await scopedService.getWidgetData(
        'new_customers_month',
        30,
      );
      expect(result).toEqual({ count: 1 });
    });

    it('rejects a days value outside the allowed set', async () => {
      await expect(
        service.getWidgetData('new_customers_month', 45 as never),
      ).rejects.toBeInstanceOf(AppException);
    });

    it('a snapshot widget (not range-aware) ignores days entirely', async () => {
      const withDays = await service.getWidgetData('staff_count', 7);
      const withoutDays = await service.getWidgetData('staff_count');
      expect(withDays).toEqual(withoutDays);
    });
  });
});
