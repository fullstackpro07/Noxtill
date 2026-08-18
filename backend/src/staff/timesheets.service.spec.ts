import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TimesheetsService } from './timesheets.service';
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

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_WEEK = 7 * 24 * MS_PER_HOUR;

function weekBucket(date: Date): number {
  return Math.floor(date.getTime() / MS_PER_WEEK);
}

/** Finds a checkIn timestamp in November 2026 whose whole `durationHours` span stays inside one rolling 7-day bucket (see TimesheetsService's bucketing doc). */
function findSameBucketCheckIn(durationHours: number): Date {
  let checkIn = new Date('2026-11-02T00:00:00.000Z');
  const durationMs = durationHours * MS_PER_HOUR;
  while (
    weekBucket(checkIn) !== weekBucket(new Date(checkIn.getTime() + durationMs))
  ) {
    checkIn = new Date(checkIn.getTime() + 24 * MS_PER_HOUR);
  }
  return checkIn;
}

describe('TimesheetsService (UPD-BE-032)', () => {
  let prisma: PrismaService;
  let service: TimesheetsService;
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
    service = new TimesheetsService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Timesheets Test Biz',
        slug: `timesheets-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const user = await prisma.user.create({
      data: {
        phone: `+1${Date.now()}`,
        name: 'Timesheet Staff',
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
    await prisma.timesheetApproval.deleteMany({ where: { businessId } });
    await prisma.attendance.deleteMany({ where: { businessId } });
    await prisma.staffShift.deleteMany({ where: { businessId } });
    await prisma.businessUser.deleteMany({ where: { businessId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('computes real hours worked and overtime against the default 40h/week threshold', async () => {
    const checkIn = findSameBucketCheckIn(45);
    const checkOut = new Date(checkIn.getTime() + 45 * MS_PER_HOUR);
    await prisma.attendance.create({
      data: { businessId, staffUserId, checkIn, checkOut },
    });

    // An open (unclosed) attendance row must never count toward hours worked.
    await prisma.attendance.create({
      data: {
        businessId,
        staffUserId,
        checkIn: new Date('2026-11-15T00:00:00.000Z'),
        checkOut: null,
      },
    });

    await prisma.staffShift.create({
      data: {
        businessId,
        staffUserId,
        startsAt: new Date('2026-11-05T09:00:00.000Z'),
        endsAt: new Date('2026-11-05T17:00:00.000Z'),
      },
    });

    const report = await service.report(businessId, '2026-11');
    const row = report.find((r) => r.businessUserId === staffUserId);
    expect(row).toBeDefined();
    expect(row!.hoursWorked).toBe(45);
    expect(row!.overtimeHours).toBe(5); // 45 - 40
    expect(row!.scheduledShiftCount).toBe(1);
    expect(row!.approved).toBe(false);
  });

  it('approve() persists a real approval and report() reflects it afterward', async () => {
    const approved = await service.approve(
      businessId,
      staffUserId,
      '2026-11',
      'reviewer-user-id',
    );
    expect(approved.approvedByUserId).toBe('reviewer-user-id');

    const report = await service.report(businessId, '2026-11');
    const row = report.find((r) => r.businessUserId === staffUserId);
    expect(row!.approved).toBe(true);
    expect(row!.approvedByUserId).toBe('reviewer-user-id');

    // Re-approving (a different reviewer) updates the same row rather than duplicating it.
    await service.approve(
      businessId,
      staffUserId,
      '2026-11',
      'second-reviewer',
    );
    const approvals = await prisma.timesheetApproval.findMany({
      where: { businessId, staffUserId, month: '2026-11' },
    });
    expect(approvals).toHaveLength(1);
    expect(approvals[0].approvedByUserId).toBe('second-reviewer');
  });

  it('reports zero hours for a month with no real attendance', async () => {
    const report = await service.report(businessId, '2026-01');
    const row = report.find((r) => r.businessUserId === staffUserId);
    expect(row!.hoursWorked).toBe(0);
    expect(row!.overtimeHours).toBe(0);
    expect(row!.approved).toBe(false);
  });
});
