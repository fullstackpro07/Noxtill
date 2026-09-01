import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TaxRulesService } from './tax-rules.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('TaxRulesService (UPD-BE-120)', () => {
  let prisma: PrismaService;
  let service: TaxRulesService;
  let businessId: string;
  let otherBusinessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new TaxRulesService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Tax Rules Test Biz',
        slug: `tax-rules-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const otherBusiness = await prisma.business.create({
      data: {
        name: 'Other Biz',
        slug: `tax-rules-other-${Date.now()}`,
      },
    });
    otherBusinessId = otherBusiness.id;
  });

  afterAll(async () => {
    await prisma.taxRule.deleteMany({
      where: { businessId: { in: [businessId, otherBusinessId] } },
    });
    await prisma.business.deleteMany({
      where: { id: { in: [businessId, otherBusinessId] } },
    });
    await prisma.$disconnect();
  });

  it('create() persists a real category-specific rule', async () => {
    const rule = await service.create(businessId, {
      category: 'Beverages',
      label: 'Beverage VAT',
      rate: 12,
    });
    expect(rule.category).toBe('Beverages');
    expect(Number(rule.rate)).toBe(12);
    expect(rule.active).toBe(true);
    expect(rule.taxInclusive).toBe(false);
  });

  it('create() with no category persists a real catch-all (null-category) rule', async () => {
    const rule = await service.create(businessId, {
      label: 'Standard VAT',
      rate: 7,
    });
    expect(rule.category).toBeNull();
  });

  it("list() returns only this business's rules", async () => {
    await service.create(otherBusinessId, { label: 'Other rate', rate: 99 });

    const rules = await service.list(businessId);
    expect(rules.length).toBe(2);
    expect(rules.every((r) => r.businessId === businessId)).toBe(true);
  });

  it('update() really persists a changed rate and can flip active off', async () => {
    const created = await service.create(businessId, {
      category: 'Snacks',
      label: 'Snack VAT',
      rate: 15,
    });
    const updated = await service.update(businessId, created.id, {
      rate: 18,
      active: false,
    });
    expect(Number(updated.rate)).toBe(18);
    expect(updated.active).toBe(false);
  });

  it('update() rejects a rule id belonging to another business', async () => {
    const foreignRule = await service.create(otherBusinessId, {
      label: 'Foreign',
      rate: 5,
    });
    await expect(
      service.update(businessId, foreignRule.id, { rate: 1 }),
    ).rejects.toThrow();
  });

  it('remove() really deletes the row, scoped to the owning business', async () => {
    const created = await service.create(businessId, {
      category: 'Removable',
      label: 'Removable rate',
      rate: 3,
    });
    await service.remove(businessId, created.id);

    const rules = await service.list(businessId);
    expect(rules.some((r) => r.id === created.id)).toBe(false);
  });

  it('remove() rejects a rule id belonging to another business', async () => {
    const foreignRule = await service.create(otherBusinessId, {
      label: 'Foreign 2',
      rate: 5,
    });
    await expect(service.remove(businessId, foreignRule.id)).rejects.toThrow();
  });
});
