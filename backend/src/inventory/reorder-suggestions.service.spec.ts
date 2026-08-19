import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { ReorderSuggestionsService } from './reorder-suggestions.service';
import { StockMovementKind } from '@prisma/client';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('ReorderSuggestionsService (UPD-BE-077)', () => {
  let prisma: PrismaService;
  let service: ReorderSuggestionsService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new ReorderSuggestionsService(tenantPrisma);

    const business = await prisma.business.create({
      data: { name: 'Reorder Test Biz', slug: `reorder-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.stockMovement.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.supplier.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('suggests a real reorder quantity for a fast-selling, low-stock product, grouped under its real most-recent supplier', async () => {
    const supplier = await prisma.supplier.create({
      data: { businessId, name: 'Real Supplier Co' },
    });
    const product = await prisma.product.create({
      data: {
        businessId,
        name: 'Fast Mover',
        stockQty: 5,
        lowStockThreshold: 10,
      },
    });
    // A real purchase from this supplier, establishing the "last bought from" inference.
    await prisma.stockMovement.create({
      data: {
        businessId,
        productId: product.id,
        supplierId: supplier.id,
        kind: StockMovementKind.purchase,
        qty: 50,
      },
    });
    // Real sales over the last 30 days: 60 units sold -> velocity 2/day.
    await prisma.stockMovement.create({
      data: {
        businessId,
        productId: product.id,
        kind: StockMovementKind.sale,
        qty: -60,
      },
    });

    const groups = await service.list(businessId);
    expect(groups).toHaveLength(1);
    expect(groups[0].supplierId).toBe(supplier.id);
    expect(groups[0].supplierName).toBe('Real Supplier Co');

    const item = groups[0].items.find((i) => i.productId === product.id);
    expect(item).toBeDefined();
    // velocity 2/day * 14-day lead time = 28, + threshold 10 - current stock 5 = 33
    expect(item?.suggestedQty).toBe(33);
    expect(item?.velocityPerDay).toBe(2);
  });

  it('groups a product with no real purchase history under "no supplier on record"', async () => {
    const product = await prisma.product.create({
      data: {
        businessId,
        name: 'No Supplier Product',
        stockQty: 1,
        lowStockThreshold: 10,
      },
    });
    await prisma.stockMovement.create({
      data: {
        businessId,
        productId: product.id,
        kind: StockMovementKind.sale,
        qty: -30,
      },
    });

    const groups = await service.list(businessId);
    const unassigned = groups.find((g) => g.supplierId === 'unassigned');
    expect(unassigned).toBeDefined();
    expect(unassigned?.items.some((i) => i.productId === product.id)).toBe(
      true,
    );
  });

  it('never suggests reordering a well-stocked, slow-moving product', async () => {
    const product = await prisma.product.create({
      data: {
        businessId,
        name: 'Well Stocked',
        stockQty: 500,
        lowStockThreshold: 5,
      },
    });
    await prisma.stockMovement.create({
      data: {
        businessId,
        productId: product.id,
        kind: StockMovementKind.sale,
        qty: -1,
      },
    });

    const groups = await service.list(businessId);
    const allItems = groups.flatMap((g) => g.items);
    expect(allItems.some((i) => i.productId === product.id)).toBe(false);
  });
});
