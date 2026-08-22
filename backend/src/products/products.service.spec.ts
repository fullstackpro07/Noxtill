import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { ProductsService } from './products.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('ProductsService (BE-023 + UPD-BE-087/088)', () => {
  let prisma: PrismaService;
  let service: ProductsService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new ProductsService(tenantPrisma);

    const business = await prisma.business.create({
      data: { name: 'Products Test Biz', slug: `products-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.priceHistory.deleteMany({
      where: { product: { businessId } },
    });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.category.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('creates a real product with the new fields defaulting sensibly (empty eligibleStaffIds, no deposit)', async () => {
    const product = await service.create({
      kind: 'product',
      name: 'Basic Widget',
      costPrice: 5,
      sellingPrice: 12,
    });
    expect(product.eligibleStaffIds).toEqual([]);
    expect(product.depositRequired).toBe(false);
    expect(product.bufferBeforeMin).toBeNull();
  });

  it('creates a real service with staff/buffer/deposit fields set (UPD-BE-087)', async () => {
    const service_ = await service.create({
      kind: 'service',
      name: 'Deep Tissue Massage',
      costPrice: 0,
      sellingPrice: 80,
      durationMin: 60,
      eligibleStaffIds: ['bu-1', 'bu-2'],
      bufferBeforeMin: 5,
      bufferAfterMin: 15,
      depositRequired: true,
      depositAmount: 20,
    });
    expect(service_.eligibleStaffIds).toEqual(['bu-1', 'bu-2']);
    expect(service_.bufferBeforeMin).toBe(5);
    expect(service_.bufferAfterMin).toBe(15);
    expect(service_.depositRequired).toBe(true);
    expect(Number(service_.depositAmount)).toBe(20);
  });

  it('links a real product to a real category via categoryId (UPD-BE-088)', async () => {
    const category = await prisma.category.create({
      data: { businessId, name: 'Spa Services' },
    });
    const product = await service.create({
      kind: 'service',
      name: 'Facial',
      costPrice: 0,
      sellingPrice: 40,
      categoryId: category.id,
    });
    expect(product.categoryId).toBe(category.id);

    const filtered = await service.findAll({ categoryId: category.id });
    expect(filtered.map((p) => p.id)).toContain(product.id);
  });

  it('update() overwrites eligibleStaffIds and buffer fields with a real new value', async () => {
    const created = await service.create({
      kind: 'service',
      name: 'Consultation',
      costPrice: 0,
      sellingPrice: 0,
      eligibleStaffIds: ['bu-1'],
      bufferBeforeMin: 10,
    });

    const updated = await service.update(created.id, {
      eligibleStaffIds: ['bu-2', 'bu-3'],
      bufferBeforeMin: 0,
      bufferAfterMin: 10,
    });
    expect(updated.eligibleStaffIds).toEqual(['bu-2', 'bu-3']);
    expect(updated.bufferBeforeMin).toBe(0);
    expect(updated.bufferAfterMin).toBe(10);
  });

  it('rejects creating a second product with the same SKU', async () => {
    const sku = `SKU-${Date.now()}`;
    await service.create({
      kind: 'product',
      name: 'First',
      costPrice: 1,
      sellingPrice: 2,
      sku,
    });
    await expect(
      service.create({
        kind: 'product',
        name: 'Second',
        costPrice: 1,
        sellingPrice: 2,
        sku,
      }),
    ).rejects.toThrow();
  });
});
