import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { SuppliersService } from './suppliers.service';
import { ActivityService } from '../activity/activity.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('SuppliersService (UPD-BE-014)', () => {
  let prisma: PrismaService;
  let suppliersService: SuppliersService;
  let businessId: string;
  let productAId: string;
  let productBId: string;
  const activity = { record: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    suppliersService = new SuppliersService(
      tenantPrisma,
      activity as unknown as ActivityService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Suppliers Test Biz',
        slug: `suppliers-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const productA = await prisma.product.create({
      data: {
        businessId,
        kind: 'product',
        name: 'Flour',
        costPrice: 2,
        sellingPrice: 5,
        stockQty: 10,
      },
    });
    productAId = productA.id;
    const productB = await prisma.product.create({
      data: {
        businessId,
        kind: 'product',
        name: 'Sugar',
        costPrice: 1,
        sellingPrice: 3,
        stockQty: 20,
      },
    });
    productBId = productB.id;
  });

  afterEach(() => {
    activity.record.mockClear();
  });

  afterAll(async () => {
    await prisma.stockMovement.deleteMany({ where: { businessId } });
    await prisma.supplier.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('creates a supplier', async () => {
    const supplier = await suppliersService.create({ name: 'Acme Wholesale' });
    expect(supplier.name).toBe('Acme Wholesale');
  });

  it('a quick PO records a stock movement per line, increments stock, and overwrites cost price', async () => {
    const supplier = await suppliersService.create({
      name: 'Bulk Bakery Supply',
    });

    const result = await suppliersService.quickPurchaseOrder(
      businessId,
      supplier.id,
      {
        items: [
          { productId: productAId, qty: 5, unitCost: 2.5 },
          { productId: productBId, qty: 10, unitCost: 1.2 },
        ],
      },
    );

    expect(result.lines).toHaveLength(2);

    const productA = await prisma.product.findUniqueOrThrow({
      where: { id: productAId },
    });
    expect(productA.stockQty).toBe(15); // 10 + 5
    expect(Number(productA.costPrice)).toBe(2.5);

    const movements = await prisma.stockMovement.findMany({
      where: { businessId, supplierId: supplier.id },
    });
    expect(movements).toHaveLength(2);
    expect(movements.every((m) => m.kind === 'purchase')).toBe(true);

    expect(activity.record).toHaveBeenCalledWith(
      businessId,
      expect.objectContaining({ type: 'stock', entityType: 'Supplier' }),
    );
  });

  it('rejects a quick PO referencing a product that does not exist', async () => {
    const supplier = await suppliersService.create({ name: 'Ghost Supplier' });
    await expect(
      suppliersService.quickPurchaseOrder(businessId, supplier.id, {
        items: [{ productId: 'not-a-real-id', qty: 1, unitCost: 1 }],
      }),
    ).rejects.toThrow();
  });
});
