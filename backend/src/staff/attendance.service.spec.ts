import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { AttendanceService } from './attendance.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('AttendanceService (BE-057)', () => {
  let prisma: PrismaService;
  let service: AttendanceService;
  let businessId: string;
  let userId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new AttendanceService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Attendance Test Biz',
        slug: `attendance-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const user = await prisma.user.create({
      data: {
        name: 'Clock Person',
        email: `clock-${Date.now()}@example.com`,
        passwordHash: 'x',
      },
    });
    userId = user.id;
    await prisma.businessUser.create({
      data: { businessId, userId, role: 'staff' },
    });
  });

  afterAll(async () => {
    await prisma.attendance.deleteMany({ where: { businessId } });
    await prisma.businessUser.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('toggles check-in then check-out', async () => {
    const checkIn = await service.toggle(businessId, userId);
    expect(checkIn.checkOut).toBeNull();

    const checkOut = await service.toggle(businessId, userId);
    expect(checkOut.id).toBe(checkIn.id);
    expect(checkOut.checkOut).not.toBeNull();
  });

  it('opens a new attendance row after a completed one', async () => {
    const second = await service.toggle(businessId, userId);
    expect(second.checkOut).toBeNull();
    await service.toggle(businessId, userId);

    const rows = await prisma.attendance.findMany({ where: { businessId } });
    expect(rows).toHaveLength(2);
  });

  it('list() returns real rows with the staff user/name joined, newest first, filterable by staffUserId (UPD-BE-113)', async () => {
    const businessUser = await prisma.businessUser.findFirstOrThrow({
      where: { businessId, userId },
    });

    const all = await service.list();
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(all[0].staffUser.user.name).toBe('Clock Person');
    // Newest first — checkIn timestamps must be non-increasing down the list.
    for (let i = 1; i < all.length; i++) {
      expect(all[i - 1].checkIn.getTime()).toBeGreaterThanOrEqual(
        all[i].checkIn.getTime(),
      );
    }

    const filtered = await service.list(businessUser.id);
    expect(filtered.every((r) => r.staffUserId === businessUser.id)).toBe(true);
    expect(filtered.length).toBe(all.length);
  });
});
