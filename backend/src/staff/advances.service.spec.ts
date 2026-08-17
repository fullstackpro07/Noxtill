import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { AdvancesService } from './advances.service';
import { AppException } from '../common/filters/app.exception';
import { Role } from '@prisma/client';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('AdvancesService (UPD-BE-033)', () => {
  let prisma: PrismaService;
  let service: AdvancesService;
  let businessId: string;
  let staffUserId: string;
  let userId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new AdvancesService(tenantPrisma);

    const business = await prisma.business.create({
      data: { name: 'Advances Test Biz', slug: `advances-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const user = await prisma.user.create({
      data: {
        phone: `+1${Date.now()}`,
        name: 'Advance Staff',
        passwordHash: 'test-hash',
      },
    });
    userId = user.id;
    const businessUser = await prisma.businessUser.create({
      data: { businessId, userId: user.id, role: Role.staff },
    });
    staffUserId = businessUser.id;
  });

  afterAll(async () => {
    await prisma.staffAdvance.deleteMany({ where: { businessId } });
    await prisma.businessUser.deleteMany({ where: { businessId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('creates and lists real advances', async () => {
    const advance = await service.create(businessId, staffUserId, {
      amount: 100,
      reason: 'Emergency',
    });
    expect(advance.status).toBe('outstanding');
    expect(Number(advance.amount)).toBe(100);

    const list = await service.list(staffUserId);
    expect(list.some((a) => a.id === advance.id)).toBe(true);
  });

  it('updates an outstanding advance but rejects updating a cancelled one', async () => {
    const advance = await service.create(businessId, staffUserId, {
      amount: 50,
    });
    const updated = await service.update(advance.id, { amount: 75 });
    expect(Number(updated.amount)).toBe(75);

    await service.cancel(advance.id);
    await expect(
      service.update(advance.id, { amount: 10 }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('rejects cancelling an already-cancelled advance', async () => {
    const advance = await service.create(businessId, staffUserId, {
      amount: 20,
    });
    await service.cancel(advance.id);
    await expect(service.cancel(advance.id)).rejects.toBeInstanceOf(
      AppException,
    );
  });

  it('rejects operations on an unknown advance', async () => {
    await expect(service.update('not-a-real-id', {})).rejects.toThrow();
  });
});
