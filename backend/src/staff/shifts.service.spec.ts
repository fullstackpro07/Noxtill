import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_USER_ID,
} from '../common/tenancy/tenant.constants';
import { ShiftsService } from './shifts.service';
import { AppException } from '../common/filters/app.exception';
import type {
  CreateNotificationInput,
  NotificationsService,
} from '../notifications/notifications.service';
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

describe('ShiftsService (UPD-BE-031)', () => {
  let prisma: PrismaService;
  let service: ShiftsService;
  let cls: FakeClsService;
  let businessId: string;
  let requesterUserId: string;
  let requesterBusinessUserId: string;
  let coveringUserId: string;
  let coveringBusinessUserId: string;
  let notifications: {
    create: jest.Mock<
      Promise<void>,
      [businessId: string, userId: string, input: CreateNotificationInput]
    >;
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    notifications = {
      create: jest.fn<
        Promise<void>,
        [businessId: string, userId: string, input: CreateNotificationInput]
      >(),
    };
    service = new ShiftsService(
      tenantPrisma,
      cls as unknown as ClsService,
      notifications as unknown as NotificationsService,
    );

    const business = await prisma.business.create({
      data: { name: 'Shifts Test Biz', slug: `shifts-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const requesterUser = await prisma.user.create({
      data: {
        phone: `+1${Date.now()}1`,
        name: 'Requester Staff',
        passwordHash: 'test-hash',
      },
    });
    requesterUserId = requesterUser.id;
    const requesterBusinessUser = await prisma.businessUser.create({
      data: { businessId, userId: requesterUser.id, role: Role.staff },
    });
    requesterBusinessUserId = requesterBusinessUser.id;

    const coveringUser = await prisma.user.create({
      data: {
        phone: `+1${Date.now()}2`,
        name: 'Covering Staff',
        passwordHash: 'test-hash',
      },
    });
    coveringUserId = coveringUser.id;
    const coveringBusinessUser = await prisma.businessUser.create({
      data: { businessId, userId: coveringUser.id, role: Role.staff },
    });
    coveringBusinessUserId = coveringBusinessUser.id;

    cls.set(CLS_KEY_USER_ID, requesterUserId);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { businessId } });
    await prisma.staffShift.deleteMany({ where: { businessId } });
    await prisma.businessUser.deleteMany({ where: { businessId } });
    await prisma.user.deleteMany({
      where: { id: { in: [requesterUserId, coveringUserId] } },
    });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('creates, lists, updates, and deletes a real shift', async () => {
    const shift = await service.create(businessId, {
      staffUserId: requesterBusinessUserId,
      startsAt: '2026-09-01T09:00:00.000Z',
      endsAt: '2026-09-01T17:00:00.000Z',
    });
    expect(shift.status).toBe('scheduled');
    // Regression: create() must join staffUser/user like list()/findOne() do — the frontend's
    // toShift() reads staffUser.user.name unconditionally, so a missing include throws client-side
    // on a successful write (shows "Couldn't add this shift" even though the row was created).
    expect(shift.staffUser.user.name).toBe('Requester Staff');

    const list = await service.list(requesterBusinessUserId);
    expect(list.some((s) => s.id === shift.id)).toBe(true);

    const updated = await service.update(shift.id, { status: 'completed' });
    expect(updated.status).toBe('completed');
    expect(updated.staffUser.user.name).toBe('Requester Staff');

    await service.remove(shift.id);
    await expect(service.findOne(shift.id)).rejects.toThrow();
  });

  it('rejects findOne for an unknown shift', async () => {
    await expect(service.findOne('not-a-real-id')).rejects.toThrow();
  });

  it('requests a swap, rejects a second concurrent request, then approves it and reassigns the shift', async () => {
    const shift = await service.create(businessId, {
      staffUserId: requesterBusinessUserId,
      startsAt: '2026-09-02T09:00:00.000Z',
      endsAt: '2026-09-02T17:00:00.000Z',
    });

    const requested = await service.requestSwap(businessId, shift.id, {
      coveringUserId: coveringBusinessUserId,
      reason: 'Doctor appointment',
    });
    expect(requested.swapStatus).toBe('pending');
    expect(requested.swapRequestedByUserId).toBe(requesterBusinessUserId);
    expect(requested.staffUser.user.name).toBe('Requester Staff');

    await expect(
      service.requestSwap(businessId, shift.id, {}),
    ).rejects.toBeInstanceOf(AppException);

    const approved = await service.approveSwap(businessId, shift.id);
    expect(approved.swapStatus).toBe('approved');
    expect(approved.staffUserId).toBe(coveringBusinessUserId);
    // Reassigned to the covering staff member — the joined name must reflect the NEW assignee.
    expect(approved.staffUser.user.name).toBe('Covering Staff');

    const audits = await prisma.auditLog.findMany({
      where: { entityId: shift.id, entity: 'StaffShift' },
    });
    expect(audits).toHaveLength(1);

    // No longer pending — a second approve attempt must fail.
    await expect(
      service.approveSwap(businessId, shift.id),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('rejects approving a swap request with no covering staff proposed yet', async () => {
    const shift = await service.create(businessId, {
      staffUserId: requesterBusinessUserId,
      startsAt: '2026-09-03T09:00:00.000Z',
      endsAt: '2026-09-03T17:00:00.000Z',
    });
    await service.requestSwap(businessId, shift.id, {});

    await expect(
      service.approveSwap(businessId, shift.id),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('rejects a swap request, leaving the shift with the original staff member', async () => {
    const shift = await service.create(businessId, {
      staffUserId: requesterBusinessUserId,
      startsAt: '2026-09-04T09:00:00.000Z',
      endsAt: '2026-09-04T17:00:00.000Z',
    });
    await service.requestSwap(businessId, shift.id, {
      coveringUserId: coveringBusinessUserId,
    });

    const rejected = await service.rejectSwap(shift.id);
    expect(rejected.swapStatus).toBe('rejected');
    expect(rejected.staffUserId).toBe(requesterBusinessUserId);
    expect(rejected.staffUser.user.name).toBe('Requester Staff');
  });

  it('notifies each distinct staff member with a shift in range exactly once, listing all their shifts in one notification', async () => {
    notifications.create.mockClear();
    const shiftA = await service.create(businessId, {
      staffUserId: requesterBusinessUserId,
      startsAt: '2026-09-10T09:00:00.000Z',
      endsAt: '2026-09-10T17:00:00.000Z',
    });
    const shiftB = await service.create(businessId, {
      staffUserId: requesterBusinessUserId,
      startsAt: '2026-09-11T09:00:00.000Z',
      endsAt: '2026-09-11T17:00:00.000Z',
    });
    const shiftC = await service.create(businessId, {
      staffUserId: coveringBusinessUserId,
      startsAt: '2026-09-10T09:00:00.000Z',
      endsAt: '2026-09-10T17:00:00.000Z',
    });

    const result = await service.notify(
      businessId,
      '2026-09-10T00:00:00.000Z',
      '2026-09-12T00:00:00.000Z',
    );

    expect(result.notifiedCount).toBe(2);
    expect(notifications.create).toHaveBeenCalledTimes(2);
    const requesterCall = notifications.create.mock.calls.find(
      (c) => c[1] === requesterUserId,
    );
    expect(requesterCall).toBeDefined();
    expect(requesterCall![2].body).toContain('2 shifts');

    await service.remove(shiftA.id);
    await service.remove(shiftB.id);
    await service.remove(shiftC.id);
  });
});
