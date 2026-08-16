import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { VariantsService } from './variants.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('VariantsService (UPD-BE-012)', () => {
  let prisma: PrismaService;
  let variantsService: VariantsService;
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
    variantsService = new VariantsService(tenantPrisma);

    const business = await prisma.business.create({
      data: { name: 'Variants Test Biz', slug: `variants-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const product = await prisma.product.create({
      data: {
        businessId,
        kind: 'product',
        name: 'Plain Shirt',
        costPrice: 5,
        sellingPrice: 15,
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await prisma.variantOption.deleteMany({
      where: { variantSet: { businessId } },
    });
    await prisma.variantSet.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('creates a variant set with options', async () => {
    const set = await variantsService.create({
      name: 'Size',
      options: [{ name: 'Small' }, { name: 'Large', priceOverride: 3 }],
    });
    expect(set.name).toBe('Size');
    expect(set.options).toHaveLength(2);
  });

  it('applies a variant set onto a product, writing the existing informal `variations` JSON shape', async () => {
    const set = await variantsService.create({
      name: 'Color',
      options: [{ name: 'Red' }, { name: 'Blue' }],
    });

    const [updated] = await variantsService.apply(set.id, {
      productIds: [productId],
    });

    expect(updated.variations).toEqual([
      { label: 'Color', options: [{ name: 'Red' }, { name: 'Blue' }] },
    ]);
  });

  it('re-applying replaces the prior entry for the same label rather than duplicating it', async () => {
    const set = await variantsService.create({
      name: 'Material',
      options: [{ name: 'Cotton' }],
    });
    await variantsService.apply(set.id, { productIds: [productId] });

    const updatedSet = await variantsService.update(set.id, {
      options: [{ name: 'Cotton' }, { name: 'Linen', priceOverride: 4 }],
    });
    const [applied] = await variantsService.apply(updatedSet.id, {
      productIds: [productId],
    });

    const materialEntries = (applied.variations as { label: string }[]).filter(
      (v) => v.label === 'Material',
    );
    expect(materialEntries).toHaveLength(1);
    expect(materialEntries[0]).toEqual({
      label: 'Material',
      options: [{ name: 'Cotton' }, { name: 'Linen', priceOverride: 4 }],
    });
  });

  it('rejects applying to a product id that does not exist', async () => {
    const set = await variantsService.create({
      name: 'Bogus',
      options: [{ name: 'X' }],
    });
    await expect(
      variantsService.apply(set.id, { productIds: ['not-a-real-id'] }),
    ).rejects.toThrow();
  });

  it('removing a variant set deletes its options', async () => {
    const set = await variantsService.create({
      name: 'ToRemove',
      options: [{ name: 'X' }],
    });
    await variantsService.remove(set.id);
    await expect(variantsService.findOne(set.id)).rejects.toThrow();
  });
});
