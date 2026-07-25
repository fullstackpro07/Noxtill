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
});
