import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { CategoriesService } from './categories.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('CategoriesService (UPD-BE-088)', () => {
  let prisma: PrismaService;
  let service: CategoriesService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new CategoriesService(tenantPrisma, cls as unknown as ClsService);

    const business = await prisma.business.create({
      data: {
        name: 'Categories Test Biz',
        slug: `categories-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.orderItem.deleteMany({ where: { order: { businessId } } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.category.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('creates a real category and rejects a duplicate name', async () => {
    await service.create({ name: 'Beverages' });
    await expect(service.create({ name: 'Beverages' })).rejects.toThrow();
  });

  it('findAll() returns a real product count per category', async () => {
    const category = await service.create({ name: 'Snacks' });
    await prisma.product.create({
      data: {
        businessId,
        kind: 'product',
        name: 'Chips',
        categoryId: category.id,
      },
    });
    await prisma.product.create({
      data: {
        businessId,
        kind: 'product',
        name: 'Pretzels',
        categoryId: category.id,
      },
    });

    const all = await service.findAll();
    const row = all.find((c) => c.id === category.id)!;
    expect(row.productCount).toBe(2);
  });

  it('reorder() writes real new sortOrder values in one pass', async () => {
    const a = await service.create({ name: 'A-Reorder' });
    const b = await service.create({ name: 'B-Reorder' });

    await service.reorder({
      categories: [
        { id: a.id, sortOrder: 5 },
        { id: b.id, sortOrder: 1 },
      ],
    });

    const refreshedA = await prisma.category.findUniqueOrThrow({
      where: { id: a.id },
    });
    const refreshedB = await prisma.category.findUniqueOrThrow({
      where: { id: b.id },
    });
    expect(refreshedA.sortOrder).toBe(5);
    expect(refreshedB.sortOrder).toBe(1);
  });

  it('merge() moves every real product into the target category and preserves the combined count, then deletes the source', async () => {
    const source = await service.create({ name: 'Old Drinks' });
    const target = await service.create({ name: 'New Drinks' });
    await prisma.product.create({
      data: {
        businessId,
        kind: 'product',
        name: 'Soda',
        categoryId: source.id,
      },
    });
    await prisma.product.create({
      data: {
        businessId,
        kind: 'product',
        name: 'Juice',
        categoryId: target.id,
      },
    });

    const result = await service.merge(source.id, target.id);
    expect(result.movedProductCount).toBe(1);

    const targetProducts = await prisma.product.count({
      where: { categoryId: target.id },
    });
    expect(targetProducts).toBe(2); // Soda (moved) + Juice (already there)

    await expect(service.findOne(source.id)).rejects.toThrow();
  });

  it('rejects merging a category into itself', async () => {
    const category = await service.create({ name: 'Self-merge Test' });
    await expect(service.merge(category.id, category.id)).rejects.toThrow();
  });

  it('remove() deletes the category and leaves its former products with a real null categoryId', async () => {
    const category = await service.create({ name: 'Removable' });
    const product = await prisma.product.create({
      data: {
        businessId,
        kind: 'product',
        name: 'Orphaned Item',
        categoryId: category.id,
      },
    });

    await service.remove(category.id);

    const refreshed = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    expect(refreshed.categoryId).toBeNull();
  });

  it('revenueByCategory() sums real revenue from completed sales only, grouped by real category', async () => {
    const category = await service.create({ name: 'Revenue Category' });
    const product = await prisma.product.create({
      data: {
        businessId,
        kind: 'product',
        name: 'Revenue Widget',
        categoryId: category.id,
        sellingPrice: 20,
        costPrice: 5,
      },
    });

    await prisma.order.create({
      data: {
        businessId,
        orderNo: Math.floor(Math.random() * 1_000_000),
        status: 'completed',
        orderType: 'counter',
        total: 40,
        items: {
          create: [
            {
              productId: product.id,
              name: product.name,
              price: 20,
              cost: 5,
              qty: 2,
            },
          ],
        },
      },
    });
    // A pending (not completed) order must never count toward revenue.
    await prisma.order.create({
      data: {
        businessId,
        orderNo: Math.floor(Math.random() * 1_000_000),
        status: 'pending',
        orderType: 'counter',
        total: 20,
        items: {
          create: [
            {
              productId: product.id,
              name: product.name,
              price: 20,
              cost: 5,
              qty: 1,
            },
          ],
        },
      },
    });

    const revenue = await service.revenueByCategory();
    const row = revenue.find((r) => r.categoryId === category.id)!;
    expect(row.revenue).toBe(40);
  });
});
