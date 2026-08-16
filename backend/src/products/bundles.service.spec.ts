import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { BundlesService } from './bundles.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('BundlesService (UPD-BE-013)', () => {
  let prisma: PrismaService;
  let bundlesService: BundlesService;
  let businessId: string;
  let productAId: string;
  let productBId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    bundlesService = new BundlesService(tenantPrisma);

    const business = await prisma.business.create({
      data: { name: 'Bundles Test Biz', slug: `bundles-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const productA = await prisma.product.create({
      data: {
        businessId,
        kind: 'product',
        name: 'Shampoo',
        costPrice: 3,
        sellingPrice: 10,
      },
    });
    productAId = productA.id;
    const productB = await prisma.product.create({
      data: {
        businessId,
        kind: 'product',
        name: 'Conditioner',
        costPrice: 4,
        sellingPrice: 12,
      },
    });
    productBId = productB.id;
  });

  afterAll(async () => {
    await prisma.bundleItem.deleteMany({ where: { bundle: { businessId } } });
    await prisma.bundle.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('creates a bundle with a real, sellable backing product whose cost is the rolled-up component cost', async () => {
    const bundle = await bundlesService.create({
      name: 'Hair Care Combo',
      sellingPrice: 18,
      items: [
        { productId: productAId, qty: 1 },
        { productId: productBId, qty: 1 },
      ],
    });

    expect(bundle.items).toHaveLength(2);
    expect(Number(bundle.product.sellingPrice)).toBe(18);
    expect(Number(bundle.product.costPrice)).toBe(7); // 3 + 4
    expect(bundle.product.kind).toBe('product');
    expect(bundle.product.stockQty).toBe(0);
  });

  it('rejects a bundle referencing a component product that does not exist', async () => {
    await expect(
      bundlesService.create({
        name: 'Bad Bundle',
        sellingPrice: 5,
        items: [{ productId: 'not-a-real-id', qty: 1 }],
      }),
    ).rejects.toThrow();
  });

  it('removing a bundle deactivates its backing product rather than deleting it', async () => {
    const bundle = await bundlesService.create({
      name: 'To Remove',
      sellingPrice: 20,
      items: [{ productId: productAId, qty: 2 }],
    });

    await bundlesService.remove(bundle.id);

    await expect(bundlesService.findOne(bundle.id)).rejects.toThrow();
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: bundle.productId },
    });
    expect(product.active).toBe(false);
  });
});
