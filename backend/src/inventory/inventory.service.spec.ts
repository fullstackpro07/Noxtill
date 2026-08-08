import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { InventoryService } from './inventory.service';
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
    inventoryService = new InventoryService(tenantPrisma);

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
});
