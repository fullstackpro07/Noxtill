import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../../common/tenancy/tenant.constants';
import { AccountingMappingService } from './accounting-mapping.service';
import { IntegrationProvider } from '@prisma/client';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('AccountingMappingService (UPD-BE-072)', () => {
  let prisma: PrismaService;
  let service: AccountingMappingService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new AccountingMappingService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Accounting Mapping Test Biz',
        slug: `accounting-mapping-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.accountingMapping.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('creates a real default (catch-all) mapping when productCategory is omitted', async () => {
    const created = await service.upsert(businessId, {
      provider: IntegrationProvider.quickbooks,
      externalAccountCode: 'ACC-DEFAULT',
    });
    expect(created.productCategory).toBeNull();
    expect(created.externalAccountCode).toBe('ACC-DEFAULT');
  });

  it('re-upserting the same default mapping updates the real existing row instead of duplicating it', async () => {
    await service.upsert(businessId, {
      provider: IntegrationProvider.quickbooks,
      externalAccountCode: 'ACC-DEFAULT-V2',
    });

    const rows = await prisma.accountingMapping.findMany({
      where: {
        businessId,
        provider: IntegrationProvider.quickbooks,
        productCategory: null,
      },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].externalAccountCode).toBe('ACC-DEFAULT-V2');
  });

  it('a category-specific mapping is a real distinct row from the default', async () => {
    await service.upsert(businessId, {
      provider: IntegrationProvider.quickbooks,
      productCategory: 'Beverages',
      externalAccountCode: 'ACC-BEVERAGES',
    });

    const rows = await service.list(IntegrationProvider.quickbooks);
    expect(rows.some((r) => r.productCategory === null)).toBe(true);
    expect(
      rows.some(
        (r) =>
          r.productCategory === 'Beverages' &&
          r.externalAccountCode === 'ACC-BEVERAGES',
      ),
    ).toBe(true);
  });

  it('removes a real mapping', async () => {
    const created = await service.upsert(businessId, {
      provider: IntegrationProvider.xero,
      productCategory: 'Removable',
      externalAccountCode: 'ACC-REMOVABLE',
    });
    await service.remove(created.id);
    await expect(service.remove(created.id)).rejects.toThrow();
  });
});
