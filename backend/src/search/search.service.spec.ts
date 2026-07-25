import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { SearchService } from './search.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('SearchService (BE-070)', () => {
  let prisma: PrismaService;
  let service: SearchService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new SearchService(tenantPrisma, cls as unknown as ClsService);

    const business = await prisma.business.create({
      data: { name: 'Search Test Biz', slug: `search-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    await prisma.customer.create({
      data: {
        businessId,
        phone: `+1${Date.now()}`,
        name: 'Zephyrine Search Target',
      },
    });
    await prisma.product.create({
      data: { businessId, kind: 'product', name: 'Zephyrine Widget' },
    });
    await prisma.order.create({
      data: {
        businessId,
        orderNo: 42424,
        status: 'completed',
        orderType: 'counter',
      },
    });
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('finds matching customers and products by trigram similarity, grouped by type', async () => {
    const result = await service.search('Zephyrine');

    expect(
      result.customers.some((c) => c.name === 'Zephyrine Search Target'),
    ).toBe(true);
    expect(result.products.some((p) => p.name === 'Zephyrine Widget')).toBe(
      true,
    );
  });

  it('finds an order by its exact numeric order number', async () => {
    const result = await service.search('42424');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- jest's expect.any(String) types as `any`
    expect(result.orders).toEqual([{ id: expect.any(String), orderNo: 42424 }]);
  });

  it('returns empty groups for a query matching nothing', async () => {
    const result = await service.search('completely-unrelated-nonsense-zzz');
    expect(result.customers).toEqual([]);
    expect(result.products).toEqual([]);
  });
});
