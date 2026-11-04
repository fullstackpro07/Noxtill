import { ClsService } from 'nestjs-cls';
import { PoliciesService } from '../common/policies/policies.service';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { ProductsService } from './products.service';
import type { S3Service } from '../common/storage/s3.service';

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
  const s3 = {
    getSignedDownloadUrl: jest
      .fn()
      .mockResolvedValue('https://signed.example/photo.jpg'),
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new ProductsService(
      tenantPrisma,
      s3 as unknown as S3Service,
      new PoliciesService(prisma, cls as unknown as ClsService, {} as unknown as CapabilitiesService),
    );

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
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
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
    expect(product.purchasePackSize).toBeNull();
    expect(product.minimumReorderQty).toBeNull();
  });

  it('stores, updates and clears a product-wide minimum reorder quantity in stock units', async () => {
    const product = await service.create({
      kind: 'product',
      name: 'Minimum reorder product',
      costPrice: 2,
      sellingPrice: 4,
      minimumReorderQty: 24,
    });
    expect(product.minimumReorderQty).toBe(24);

    const updated = await service.update(product.id, {
      minimumReorderQty: 12,
    });
    expect(updated.minimumReorderQty).toBe(12);

    const cleared = await service.update(product.id, {
      minimumReorderQty: null,
    });
    expect(cleared.minimumReorderQty).toBeNull();
  });

  it('rejects invalid or service-only minimum reorder quantities', async () => {
    await expect(
      service.create({
        kind: 'product',
        name: 'Fractional minimum reorder product',
        costPrice: 2,
        sellingPrice: 4,
        minimumReorderQty: 1.5,
      }),
    ).rejects.toMatchObject({
      response: { code: 'PRODUCT_MINIMUM_REORDER_INVALID' },
      status: 400,
    });

    await expect(
      service.create({
        kind: 'service',
        name: 'Service with product minimum',
        costPrice: 0,
        sellingPrice: 10,
        minimumReorderQty: 2,
      }),
    ).rejects.toMatchObject({
      response: { code: 'PRODUCT_MINIMUM_REORDER_PRODUCT_ONLY' },
      status: 400,
    });
  });

  it('stores validated product purchase units, supports partial edits, and clears them together', async () => {
    const product = await service.create({
      kind: 'product',
      name: 'Pack configured shampoo',
      costPrice: 2,
      sellingPrice: 4,
      stockUnitLabel: ' bottle ',
      purchaseUnitLabel: ' case ',
      purchasePackSize: 12,
    });
    expect(product).toMatchObject({
      stockUnitLabel: 'bottle',
      purchaseUnitLabel: 'case',
      purchasePackSize: 12,
    });

    const updated = await service.update(product.id, {
      purchasePackSize: 6,
    });
    expect(updated).toMatchObject({
      stockUnitLabel: 'bottle',
      purchaseUnitLabel: 'case',
      purchasePackSize: 6,
    });

    const cleared = await service.update(product.id, {
      stockUnitLabel: null,
      purchaseUnitLabel: null,
      purchasePackSize: null,
    });
    expect(cleared).toMatchObject({
      stockUnitLabel: null,
      purchaseUnitLabel: null,
      purchasePackSize: null,
    });
  });

  it('rejects incomplete purchase-unit configuration', async () => {
    await expect(
      service.create({
        kind: 'product',
        name: 'Incomplete pack product',
        costPrice: 2,
        sellingPrice: 4,
        stockUnitLabel: 'bottle',
        purchasePackSize: 12,
      }),
    ).rejects.toMatchObject({
      response: { code: 'PRODUCT_PURCHASE_PACK_INCOMPLETE' },
      status: 400,
    });
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
