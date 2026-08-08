import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { ReviewRequestsService } from '../reviews/review-requests.service';
import { AppointmentsService } from './appointments.service';
import { AppException } from '../common/filters/app.exception';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('AppointmentsService (BE-054)', () => {
  let prisma: PrismaService;
  let service: AppointmentsService;
  let businessId: string;
  let customerId: string;
  let serviceProductId: string;
  const reviewRequests = {
    scheduleSend: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new AppointmentsService(
      tenantPrisma,
      reviewRequests as unknown as ReviewRequestsService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Appt Service Test Biz',
        slug: `appt-service-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const customer = await prisma.customer.create({
      data: { businessId, phone: `+1${Date.now()}`, name: 'Hank' },
    });
    customerId = customer.id;

    const svc = await prisma.product.create({
      data: { businessId, kind: 'service', name: 'Massage', durationMin: 60 },
    });
    serviceProductId = svc.id;
  });

  afterEach(() => {
    reviewRequests.scheduleSend.mockClear();
  });

  afterAll(async () => {
    const staffUsers = await prisma.businessUser.findMany({
      where: { businessId },
    });
    await prisma.reviewRequest.deleteMany({ where: { businessId } });
    await prisma.appointment.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.businessUser.deleteMany({ where: { businessId } });
    await prisma.user.deleteMany({
      where: { id: { in: staffUsers.map((s) => s.userId) } },
    });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('completing an appointment enqueues a review request', async () => {
    const appointment = await prisma.appointment.create({
      data: {
        businessId,
        serviceId: serviceProductId,
        customerId,
        startsAt: new Date('2026-08-01T10:00:00Z'),
        endsAt: new Date('2026-08-01T11:00:00Z'),
        status: 'confirmed',
      },
    });

    const updated = await service.updateStatus(
      businessId,
      appointment.id,
      'completed',
    );
    expect(updated.status).toBe('completed');

    const request = await prisma.reviewRequest.findFirst({
      where: { sourceId: appointment.id, source: 'appointment' },
    });
    expect(request).not.toBeNull();
    expect(reviewRequests.scheduleSend).toHaveBeenCalledWith(
      businessId,
      customerId,
      expect.any(String),
    );
  });

  it('marking no_show tags the customer', async () => {
    const appointment = await prisma.appointment.create({
      data: {
        businessId,
        serviceId: serviceProductId,
        customerId,
        startsAt: new Date('2026-08-02T10:00:00Z'),
        endsAt: new Date('2026-08-02T11:00:00Z'),
        status: 'booked',
      },
    });

    await service.updateStatus(businessId, appointment.id, 'no_show');

    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
    });
    expect(customer.tags).toContain('No-show');
  });

  it('rejects an illegal status transition', async () => {
    const appointment = await prisma.appointment.create({
      data: {
        businessId,
        serviceId: serviceProductId,
        customerId,
        startsAt: new Date('2026-08-03T10:00:00Z'),
        endsAt: new Date('2026-08-03T11:00:00Z'),
        status: 'completed',
      },
    });

    await expect(
      service.updateStatus(businessId, appointment.id, 'confirmed'),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('reschedules an appointment to a free slot', async () => {
    const appointment = await prisma.appointment.create({
      data: {
        businessId,
        serviceId: serviceProductId,
        customerId,
        startsAt: new Date('2026-08-04T10:00:00Z'),
        endsAt: new Date('2026-08-04T11:00:00Z'),
        status: 'confirmed',
      },
    });

    const updated = await service.reschedule(businessId, appointment.id, {
      startsAt: '2026-08-04T14:00:00Z',
    });
    expect(updated.startsAt.toISOString()).toBe('2026-08-04T14:00:00.000Z');
    expect(updated.endsAt.toISOString()).toBe('2026-08-04T15:00:00.000Z');
  });

  it('rejects a reschedule onto a conflicting slot for the same staff', async () => {
    const staff = await prisma.businessUser.create({
      data: {
        businessId,
        userId: (
          await prisma.user.create({
            data: {
              name: 'Reschedule Staffer',
              email: `reschedule-staff-${Date.now()}@example.com`,
              passwordHash: 'x',
            },
          })
        ).id,
        role: 'staff',
      },
    });

    const fixed = await prisma.appointment.create({
      data: {
        businessId,
        serviceId: serviceProductId,
        staffUserId: staff.id,
        customerId,
        startsAt: new Date('2026-08-05T10:00:00Z'),
        endsAt: new Date('2026-08-05T11:00:00Z'),
        status: 'confirmed',
      },
    });
    const movable = await prisma.appointment.create({
      data: {
        businessId,
        serviceId: serviceProductId,
        staffUserId: staff.id,
        customerId,
        startsAt: new Date('2026-08-05T14:00:00Z'),
        endsAt: new Date('2026-08-05T15:00:00Z'),
        status: 'confirmed',
      },
    });

    await expect(
      service.reschedule(businessId, movable.id, {
        startsAt: fixed.startsAt.toISOString(),
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('creates a confirmed walk-in appointment with source walk_in', async () => {
    const appointment = await service.createWalkIn(businessId, {
      serviceId: serviceProductId,
      startsAt: '2026-08-06T10:00:00Z',
      customerName: 'Walk-in Wendy',
      customerPhone: `+1${Date.now()}9`,
    });

    expect(appointment.status).toBe('confirmed');
    expect(appointment.source).toBe('walk_in');
  });

  it('rejects a walk-in booking for an unknown service', async () => {
    await expect(
      service.createWalkIn(businessId, {
        serviceId: 'not-a-real-service-id',
        startsAt: '2026-08-06T12:00:00Z',
        customerName: 'Nobody',
        customerPhone: `+1${Date.now()}8`,
      }),
    ).rejects.toBeInstanceOf(AppException);
  });
});
