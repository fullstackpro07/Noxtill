import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { InventoryService } from './inventory.service';
import { AppException } from '../common/filters/app.exception';
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

describe('InventoryService (BE-033/BE-034)', () => {
  let prisma: PrismaService;
  let inventoryService: InventoryService;
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
    const activity = { record: jest.fn().mockResolvedValue(undefined) };
    inventoryService = new InventoryService(
      tenantPrisma,
      activity as unknown as ActivityService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Inventory Test Biz',
        slug: `inventory-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const product = await prisma.product.create({
      data: {
        businessId,
        kind: 'product',
        name: 'Bolt',
        costPrice: 1,
        sellingPrice: 2,
        stockQty: 10,
        lowStockThreshold: 5,
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await prisma.stockMovement.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('records a purchase, increments stock, and refreshes cost price', async () => {
    await inventoryService.recordPurchase(businessId, {
      productId,
      qty: 20,
      unitCost: 1.5,
      supplier: 'Acme',
    });

    const product = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    expect(product.stockQty).toBe(30);
    expect(Number(product.costPrice)).toBe(1.5);
  });

  it('records wastage and decrements stock', async () => {
    await inventoryService.recordWastage(businessId, {
      productId,
      qty: 5,
      reason: 'Damaged',
      note: 'dropped box',
    });

    const product = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    expect(product.stockQty).toBe(25);

    const movements = await inventoryService.getMovements(productId);
    const wastage = movements.find((m) => m.kind === 'wastage');
    expect(wastage?.reason).toBe('Damaged: dropped box');
  });

  it('rejects wastage greater than on-hand stock', async () => {
    await expect(
      inventoryService.recordWastage(businessId, {
        productId,
        qty: 9999,
        reason: 'Other',
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('lists inventory with computed stock value and status', async () => {
    const inventory = await inventoryService.listInventory();
    const item = inventory.find((i) => i.id === productId);
    expect(item).toBeDefined();
    expect(item?.stockValue).toBeCloseTo(25 * 1.5);
    expect(item?.costPrice).toBe(1.5);
    expect(item?.status).toBe('ok');
  });

  it("surfaces the most recent purchase's supplier on the inventory row", async () => {
    const inventory = await inventoryService.listInventory();
    const item = inventory.find((i) => i.id === productId);
    expect(item?.supplier).toBe('Acme');
  });

  it('accepts a Theft wastage reason (UPD-BE-111)', async () => {
    const movement = await inventoryService.recordWastage(businessId, {
      productId,
      qty: 1,
      reason: 'Theft',
    });
    expect(movement.reason).toBe('Theft');

    const product = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
    });
    expect(product.stockQty).toBe(24); // 25 - 1, matches the wastage cutting real stock
  });

  describe('listMovements (UPD-BE-110)', () => {
    it('computes a real resultingBalance per movement by replaying against current stock, newest first', async () => {
      const movements = await inventoryService.listMovements({ productId });
      // Fixture history for this product, oldest to newest: +20 purchase (10->30), -5 wastage (30->25), -1 theft (25->24).
      expect(movements).toHaveLength(3);
      expect(movements[0].kind).toBe('wastage'); // the -1 theft row, newest
      expect(movements[0].resultingBalance).toBe(24);
      expect(movements[1].resultingBalance).toBe(25); // the -5 wastage row
      expect(movements[2].kind).toBe('purchase');
      expect(movements[2].resultingBalance).toBe(30);
    });

    it('filters by kind', async () => {
      const purchasesOnly = await inventoryService.listMovements({
        productId,
        kind: 'purchase',
      });
      expect(purchasesOnly).toHaveLength(1);
      expect(purchasesOnly[0].resultingBalance).toBe(30);
    });
  });

  describe('listLowStock (UPD-BE-111)', () => {
    let lowStockProductId: string;
    let outOfStockProductId: string;

    beforeAll(async () => {
      const lowStock = await prisma.product.create({
        data: {
          businessId,
          kind: 'product',
          name: 'Low Stock Widget',
          costPrice: 1,
          sellingPrice: 10,
          stockQty: 2,
          lowStockThreshold: 5,
        },
      });
      lowStockProductId = lowStock.id;

      const outOfStock = await prisma.product.create({
        data: {
          businessId,
          kind: 'product',
          name: 'Out Of Stock Widget',
          costPrice: 1,
          sellingPrice: 10,
          stockQty: 0,
          lowStockThreshold: 5,
        },
      });
      outOfStockProductId = outOfStock.id;

      // A real sale that took it to zero 2 days ago, so daysOutOfStock/lostSalesEstimate are computable.
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      await prisma.stockMovement.create({
        data: {
          businessId,
          productId: outOfStockProductId,
          kind: 'sale',
          qty: -3,
          createdAt: twoDaysAgo,
        },
      });
    });

    afterAll(async () => {
      await prisma.stockMovement.deleteMany({
        where: { productId: { in: [lowStockProductId, outOfStockProductId] } },
      });
      await prisma.product.deleteMany({
        where: { id: { in: [lowStockProductId, outOfStockProductId] } },
      });
    });

    it('only returns products below threshold or out of stock', async () => {
      const lowStock = await inventoryService.listLowStock();
      const ids = lowStock.map((p) => p.id);
      expect(ids).toContain(lowStockProductId);
      expect(ids).toContain(outOfStockProductId);
      expect(ids).not.toContain(productId); // 'ok' status, excluded
    });

    it('computes a real, non-negative lostSalesEstimate for an out-of-stock product with real recent sales', async () => {
      const lowStock = await inventoryService.listLowStock();
      const outOfStockRow = lowStock.find((p) => p.id === outOfStockProductId)!;
      expect(outOfStockRow.daysOutOfStock).toBeGreaterThanOrEqual(2);
      expect(outOfStockRow.lostSalesEstimate).toBeGreaterThan(0);

      const lowStockRow = lowStock.find((p) => p.id === lowStockProductId)!;
      expect(lowStockRow.lostSalesEstimate).toBe(0); // not out of stock, no lost-sales estimate
    });
  });
});
