import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_USER_ID,
} from '../common/tenancy/tenant.constants';
import { TimeOffService } from './time-off.service';
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

describe('TimeOffService (UPD-BE-031)', () => {
  let prisma: PrismaService;
  let service: TimeOffService;
  let cls: FakeClsService;
  let businessId: string;
  let staffUserId: string;
  let businessUserId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new TimeOffService(tenantPrisma, cls as unknown as ClsService);

    const business = await prisma.business.create({
      data: { name: 'Time Off Test Biz', slug: `time-off-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const user = await prisma.user.create({
      data: {
        phone: `+1${Date.now()}`,
        name: 'Self Service Staff',
        passwordHash: 'test-hash',
      },
    });
    staffUserId = user.id;
    const businessUser = await prisma.businessUser.create({
      data: { businessId, userId: user.id, role: Role.staff },
    });
    businessUserId = businessUser.id;

    cls.set(CLS_KEY_USER_ID, staffUserId);
  });

  afterAll(async () => {
    await prisma.timeOff.deleteMany({ where: { businessId } });
    await prisma.businessUser.deleteMany({ where: { businessId } });
    await prisma.user.delete({ where: { id: staffUserId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('self-service create resolves the current user to their own BusinessUser record', async () => {
    const request = await service.create(businessId, {
      startsAt: '2026-10-01T00:00:00.000Z',
      endsAt: '2026-10-03T00:00:00.000Z',
      reason: 'Family trip',
    });
    expect(request.staffUserId).toBe(businessUserId);
    expect(request.approved).toBe(false);
  });

  it('lists, approves, and rejects real time-off requests', async () => {
    const request = await service.create(businessId, {
      staffUserId: businessUserId,
      startsAt: '2026-10-10T00:00:00.000Z',
      endsAt: '2026-10-11T00:00:00.000Z',
    });

    const list = await service.list(businessUserId);
    expect(list.some((r) => r.id === request.id)).toBe(true);

    const approved = await service.approve(request.id);
    expect(approved.approved).toBe(true);
    expect(approved.reviewedByUserId).toBe(staffUserId);

    const rejected = await service.reject(request.id);
    expect(rejected.approved).toBe(false);
    expect(rejected.reviewedByUserId).toBe(staffUserId);
  });

  it('rejects operations on an unknown request', async () => {
    await expect(service.approve('not-a-real-id')).rejects.toThrow();
  });
});
