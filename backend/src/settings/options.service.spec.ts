import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { OptionsService } from './options.service';
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

describe('OptionsService (UPD-BE-039)', () => {
  let prisma: PrismaService;
  let service: OptionsService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new OptionsService(tenantPrisma);

    const business = await prisma.business.create({
      data: { name: 'Options Test Biz', slug: `options-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.option.deleteMany({ where: { optionSet: { businessId } } });
    await prisma.optionSet.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('creates a real set and rejects a duplicate setKey for the same business', async () => {
    const set = await service.createSet(businessId, {
      setKey: 'product_category',
      label: 'Product Categories',
    });
    expect(set.setKey).toBe('product_category');

    await expect(
      service.createSet(businessId, {
        setKey: 'product_category',
        label: 'Duplicate',
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('appends options with increasing sort order, renames, hides, and removes them', async () => {
    await service.addOption('product_category', { value: 'Electronics' });
    await service.addOption('product_category', { value: 'Groceries' });
    const third = await service.addOption('product_category', {
      value: 'Clothing',
    });
    expect(third.sortOrder).toBe(2);

    const renamed = await service.updateOption('product_category', third.id, {
      value: 'Apparel',
    });
    expect(renamed.value).toBe('Apparel');

    const hidden = await service.updateOption('product_category', third.id, {
      hidden: true,
    });
    expect(hidden.hidden).toBe(true);

    await service.removeOption('product_category', third.id);
    await expect(
      service.updateOption('product_category', third.id, { value: 'x' }),
    ).rejects.toThrow();
  });

  it('reorder() re-sequences to match the given order exactly, and rejects a mismatched list', async () => {
    const set = await service.createSet(businessId, {
      setKey: 'expense_category',
      label: 'Expense Categories',
    });
    const a = await service.addOption('expense_category', { value: 'Rent' });
    const b = await service.addOption('expense_category', {
      value: 'Utilities',
    });
    const c = await service.addOption('expense_category', {
      value: 'Supplies',
    });

    const reordered = await service.reorder('expense_category', {
      orderedIds: [c.id, a.id, b.id],
    });
    expect(reordered.map((o) => o.id)).toEqual([c.id, a.id, b.id]);
    expect(reordered.map((o) => o.sortOrder)).toEqual([0, 1, 2]);

    await expect(
      service.reorder('expense_category', { orderedIds: [a.id, b.id] }), // missing c.id
    ).rejects.toBeInstanceOf(AppException);

    expect(set.label).toBe('Expense Categories');
  });

  it('listAll() returns every set with its options in real sort order', async () => {
    const sets = await service.listAll();
    const expenseSet = sets.find((s) => s.setKey === 'expense_category')!;
    expect(expenseSet.options.map((o) => o.value)).toEqual([
      'Supplies',
      'Rent',
      'Utilities',
    ]);
  });

  it('rejects operating on an option from the wrong set', async () => {
    const productOption = await service.addOption('product_category', {
      value: 'Toys',
    });
    await expect(
      service.updateOption('expense_category', productOption.id, {
        value: 'x',
      }),
    ).rejects.toThrow();
  });
});
