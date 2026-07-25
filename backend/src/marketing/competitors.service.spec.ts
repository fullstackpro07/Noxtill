import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { CompetitorsService } from './competitors.service';
import { AppException } from '../common/filters/app.exception';
import { MAX_COMPETITORS } from './marketing.constants';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('CompetitorsService (BE-063)', () => {
  let prisma: PrismaService;
  let service: CompetitorsService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new CompetitorsService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Competitors Test Biz',
        slug: `competitors-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.competitor.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it(`allows up to ${MAX_COMPETITORS} competitors and rejects the next add`, async () => {
    for (let i = 0; i < MAX_COMPETITORS; i++) {
      await service.create(businessId, { platformRef: `place-${i}` });
    }

    await expect(
      service.create(businessId, { platformRef: 'one-too-many' }),
    ).rejects.toBeInstanceOf(AppException);

    const list = await service.list();
    expect(list).toHaveLength(MAX_COMPETITORS);
  });

  it('removes a competitor, freeing a slot', async () => {
    const list = await service.list();
    await service.remove(list[0].id);

    const created = await service.create(businessId, {
      platformRef: 'replacement',
    });
    expect(created.platformRef).toBe('replacement');
  });
});
