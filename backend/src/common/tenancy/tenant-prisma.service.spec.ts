import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from './tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from './tenant.constants';
import { Prisma } from '@prisma/client';

/** Minimal stand-in for ClsService: enough for the extension's `cls.get()` calls. */
class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

/** businessId is deliberately omitted — that's the whole point of the isolation test. */
function customerInputWithoutBusinessId(fields: {
  phone: string;
  name: string;
}) {
  return fields as unknown as Prisma.CustomerUncheckedCreateInput;
}

describe('Tenancy isolation (BE-006)', () => {
  let prisma: PrismaService;
  let cls: FakeClsService;
  let tenantPrisma: TenantPrismaService;
  let businessAId: string;
  let businessBId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );

    const [a, b] = await Promise.all([
      prisma.business.create({
        data: { name: 'Tenancy Test A', slug: `tenancy-test-a-${Date.now()}` },
      }),
      prisma.business.create({
        data: { name: 'Tenancy Test B', slug: `tenancy-test-b-${Date.now()}` },
      }),
    ]);
    businessAId = a.id;
    businessBId = b.id;
  });

  afterAll(async () => {
    await prisma.customer.deleteMany({
      where: { businessId: { in: [businessAId, businessBId] } },
    });
    await prisma.business.deleteMany({
      where: { id: { in: [businessAId, businessBId] } },
    });
    await prisma.$disconnect();
  });

  it('auto-injects businessId on create without it being passed explicitly', async () => {
    cls.set(CLS_KEY_BUSINESS_ID, businessAId);

    const customer = await tenantPrisma.client.customer.create({
      data: customerInputWithoutBusinessId({
        phone: '+10000000001',
        name: 'Auto Scoped Customer',
      }),
    });

    expect(customer.businessId).toBe(businessAId);
  });

  it('scopes reads to the bound tenant even when no where.businessId is supplied', async () => {
    cls.set(CLS_KEY_BUSINESS_ID, businessAId);
    await tenantPrisma.client.customer.create({
      data: customerInputWithoutBusinessId({
        phone: '+10000000002',
        name: 'A Only',
      }),
    });

    cls.set(CLS_KEY_BUSINESS_ID, businessBId);
    const asBusinessB = await tenantPrisma.client.customer.findMany({});

    expect(asBusinessB).toHaveLength(0);
  });

  it('blocks a spoofed cross-tenant businessId in the where clause', async () => {
    cls.set(CLS_KEY_BUSINESS_ID, businessAId);
    const [created] = await tenantPrisma.client.customer.findMany({});
    expect(created).toBeDefined();

    cls.set(CLS_KEY_BUSINESS_ID, businessBId);
    const spoofed = await tenantPrisma.client.customer.findMany({
      where: { businessId: businessAId },
    });

    expect(spoofed).toHaveLength(0);
  });

  it('falls back to unscoped query when no tenant is bound (e.g. platform-admin context)', async () => {
    cls.set(CLS_KEY_BUSINESS_ID, undefined);
    const all = await tenantPrisma.client.customer.findMany({
      where: { businessId: { in: [businessAId, businessBId] } },
    });
    expect(all.length).toBeGreaterThan(0);
  });
});
