import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { ReviewRequestsService } from '../reviews/review-requests.service';
import { ActivityService } from '../activity/activity.service';
import { SendGateService } from '../messaging/send-gate.service';
import { WaitlistService } from './waitlist.service';
import { DepositsService } from './deposits.service';
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
  const activity = { record: jest.fn().mockResolvedValue(undefined) };
  const sendGate = {
    send: jest
      .fn<Promise<void>, [Record<string, unknown>]>()
      .mockResolvedValue(undefined),
  };
  const waitlist = { tryAutoOffer: jest.fn().mockResolvedValue(undefined) };
  const deposits = {
    forfeitForAppointment: jest.fn().mockResolvedValue(undefined),
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
      activity as unknown as ActivityService,
      sendGate as unknown as SendGateService,
      waitlist as unknown as WaitlistService,
      deposits as unknown as DepositsService,
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
    sendGate.send.mockClear();
    waitlist.tryAutoOffer.mockClear();
    deposits.forfeitForAppointment.mockClear();
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

  describe('Services formal fields — eligible staff + buffer enforcement (UPD-BE-087)', () => {
    let restrictedServiceId: string;
    let bufferedServiceId: string;
    let eligibleStaffUserId: string;
    let ineligibleStaffUserId: string;

    beforeAll(async () => {
      const eligibleUser = await prisma.user.create({
        data: {
          name: 'Eligible Stylist',
          phone: `+1${Date.now()}e`,
          passwordHash: 'x',
        },
      });
      const eligibleBu = await prisma.businessUser.create({
        data: { businessId, userId: eligibleUser.id, role: 'staff' },
      });
      const ineligibleUser = await prisma.user.create({
        data: {
          name: 'Other Stylist',
          phone: `+1${Date.now()}f`,
          passwordHash: 'x',
        },
      });
      const ineligibleBu = await prisma.businessUser.create({
        data: { businessId, userId: ineligibleUser.id, role: 'staff' },
      });
      eligibleStaffUserId = eligibleBu.id;
      ineligibleStaffUserId = ineligibleBu.id;

      const restricted = await prisma.product.create({
        data: {
          businessId,
          kind: 'service',
          name: 'Restricted Facial',
          durationMin: 30,
          eligibleStaffIds: [eligibleStaffUserId],
        },
      });
      restrictedServiceId = restricted.id;

      const buffered = await prisma.product.create({
        data: {
          businessId,
          kind: 'service',
          name: 'Buffered Massage',
          durationMin: 30,
          bufferBeforeMin: 0,
          bufferAfterMin: 20,
        },
      });
      bufferedServiceId = buffered.id;
    });

    it('rejects booking an ineligible staff member for a restricted service', async () => {
      await expect(
        service.createWalkIn(businessId, {
          serviceId: restrictedServiceId,
          staffId: ineligibleStaffUserId,
          startsAt: '2026-09-01T10:00:00Z',
          customerName: 'Blocked Betty',
          customerPhone: `+1${Date.now()}r1`,
        }),
      ).rejects.toBeInstanceOf(AppException);
    });

    it('allows booking an eligible staff member for the same restricted service', async () => {
      const appt = await service.createWalkIn(businessId, {
        serviceId: restrictedServiceId,
        staffId: eligibleStaffUserId,
        startsAt: '2026-09-01T10:00:00Z',
        customerName: 'Allowed Alice',
        customerPhone: `+1${Date.now()}r2`,
      });
      expect(appt.staffUserId).toBe(eligibleStaffUserId);
    });

    it('an empty eligibleStaffIds (the pre-existing default) allows any staff, unchanged from before this feature', async () => {
      const appt = await service.createWalkIn(businessId, {
        serviceId: serviceProductId,
        staffId: ineligibleStaffUserId,
        startsAt: '2026-09-01T14:00:00Z',
        customerName: 'Anyone Annie',
        customerPhone: `+1${Date.now()}r3`,
      });
      expect(appt.staffUserId).toBe(ineligibleStaffUserId);
    });

    it('a real bufferAfterMin blocks a booking that starts inside the buffer window, even though the two appointments themselves do not overlap', async () => {
      await service.createWalkIn(businessId, {
        serviceId: bufferedServiceId,
        staffId: eligibleStaffUserId,
        startsAt: '2026-09-02T10:00:00Z', // ends 10:30, +20min buffer -> blocked until 10:50
        customerName: 'First Fiona',
        customerPhone: `+1${Date.now()}b1`,
      });

      await expect(
        service.createWalkIn(businessId, {
          serviceId: bufferedServiceId,
          staffId: eligibleStaffUserId,
          startsAt: '2026-09-02T10:35:00Z', // starts before the buffer clears at 10:50
          customerName: 'Second Sara',
          customerPhone: `+1${Date.now()}b2`,
        }),
      ).rejects.toBeInstanceOf(AppException);

      // Confirms this is really the buffer (not just "any conflict") — 10:50 onward is genuinely free.
      const afterBuffer = await service.createWalkIn(businessId, {
        serviceId: bufferedServiceId,
        staffId: eligibleStaffUserId,
        startsAt: '2026-09-02T10:50:00Z',
        customerName: 'Third Tara',
        customerPhone: `+1${Date.now()}b3`,
      });
      expect(afterBuffer.status).toBe('confirmed');
    });
  });

  describe('Booking Requests (UPD-BE-016)', () => {
    it('createRequest() creates an appointment awaiting approval, not booked/confirmed', async () => {
      const requested = await service.createRequest(businessId, {
        serviceId: serviceProductId,
        startsAt: '2026-08-07T10:00:00Z',
        customerName: 'Requester Rita',
        customerPhone: `+1${Date.now()}7`,
      });
      expect(requested.status).toBe('requested');
    });

    it('approve() confirms the appointment and sends booking_confirm', async () => {
      const requested = await service.createRequest(businessId, {
        serviceId: serviceProductId,
        startsAt: '2026-08-07T12:00:00Z',
        customerName: 'Requester Approved',
        customerPhone: `+1${Date.now()}6`,
      });

      const approved = await service.approve(businessId, requested.id);
      expect(approved.status).toBe('confirmed');
      expect(sendGate.send).toHaveBeenCalledWith(
        expect.objectContaining({ templateKey: 'booking_confirm' }),
      );
    });

    it('decline() cancels the appointment and sends booking_declined', async () => {
      const requested = await service.createRequest(businessId, {
        serviceId: serviceProductId,
        startsAt: '2026-08-07T14:00:00Z',
        customerName: 'Requester Declined',
        customerPhone: `+1${Date.now()}5`,
      });

      const declined = await service.decline(businessId, requested.id, {
        reason: 'Fully booked that day',
      });
      expect(declined.status).toBe('cancelled');
      expect(sendGate.send).toHaveBeenCalledWith(
        expect.objectContaining({ templateKey: 'booking_declined' }),
      );
      const [sentArgs] =
        sendGate.send.mock.calls[sendGate.send.mock.calls.length - 1];
      const variables = sentArgs.variables as Record<string, string>;
      expect(variables.reason).toBe('Fully booked that day');
    });

    it('suggestAlternative() sends a proposal without changing the appointment status', async () => {
      const requested = await service.createRequest(businessId, {
        serviceId: serviceProductId,
        startsAt: '2026-08-07T16:00:00Z',
        customerName: 'Requester Alt',
        customerPhone: `+1${Date.now()}4`,
      });

      const result = await service.suggestAlternative(
        businessId,
        requested.id,
        {
          startsAt: '2026-08-08T10:00:00Z',
        },
      );
      expect(result.status).toBe('requested');
      expect(sendGate.send).toHaveBeenCalledWith(
        expect.objectContaining({ templateKey: 'booking_suggest_alternative' }),
      );

      const stillRequested = await prisma.appointment.findUniqueOrThrow({
        where: { id: requested.id },
      });
      expect(stillRequested.status).toBe('requested');
    });

    it('rejects approve/decline/suggest-alternative on an appointment that is not requested', async () => {
      const confirmed = await prisma.appointment.create({
        data: {
          businessId,
          serviceId: serviceProductId,
          customerId,
          startsAt: new Date('2026-08-09T10:00:00Z'),
          endsAt: new Date('2026-08-09T11:00:00Z'),
          status: 'confirmed',
        },
      });

      await expect(
        service.approve(businessId, confirmed.id),
      ).rejects.toBeInstanceOf(AppException);
      await expect(
        service.decline(businessId, confirmed.id, {}),
      ).rejects.toBeInstanceOf(AppException);
      await expect(
        service.suggestAlternative(businessId, confirmed.id, {
          startsAt: '2026-08-10T10:00:00Z',
        }),
      ).rejects.toBeInstanceOf(AppException);
    });
  });

  describe('cancellation/no-show hooks (UPD-BE-017/019)', () => {
    it('cancelling an appointment triggers a best-effort waitlist auto-offer', async () => {
      const appointment = await prisma.appointment.create({
        data: {
          businessId,
          serviceId: serviceProductId,
          customerId,
          startsAt: new Date('2026-08-11T10:00:00Z'),
          endsAt: new Date('2026-08-11T11:00:00Z'),
          status: 'confirmed',
        },
      });

      await service.updateStatus(businessId, appointment.id, 'cancelled');

      expect(waitlist.tryAutoOffer).toHaveBeenCalledWith(
        businessId,
        expect.objectContaining({ serviceId: serviceProductId }),
      );
    });

    it('marking no_show forfeits any deposit tied to the appointment', async () => {
      const appointment = await prisma.appointment.create({
        data: {
          businessId,
          serviceId: serviceProductId,
          customerId,
          startsAt: new Date('2026-08-12T10:00:00Z'),
          endsAt: new Date('2026-08-12T11:00:00Z'),
          status: 'confirmed',
        },
      });

      await service.updateStatus(businessId, appointment.id, 'no_show');

      expect(deposits.forfeitForAppointment).toHaveBeenCalledWith(
        appointment.id,
      );
    });
  });

  describe('No-Shows reporting (UPD-BE-020)', () => {
    it('computes a real overall no-show rate and monthly trend from completed/no_show appointments', async () => {
      await prisma.appointment.create({
        data: {
          businessId,
          serviceId: serviceProductId,
          customerId,
          startsAt: new Date('2026-07-15T10:00:00Z'),
          endsAt: new Date('2026-07-15T11:00:00Z'),
          status: 'completed',
        },
      });
      await prisma.appointment.create({
        data: {
          businessId,
          serviceId: serviceProductId,
          customerId,
          startsAt: new Date('2026-07-16T10:00:00Z'),
          endsAt: new Date('2026-07-16T11:00:00Z'),
          status: 'no_show',
        },
      });

      const report = await service.noShowReport(businessId, 12);
      const julyRow = report.trend.find((r) => r.month === '2026-07');
      expect(julyRow).toBeDefined();
      expect(julyRow!.total).toBeGreaterThanOrEqual(2);
      expect(julyRow!.noShows).toBeGreaterThanOrEqual(1);
      expect(report.overallRate).toBeGreaterThan(0);
    });

    it('flags a repeat offender once the same customer has 2+ no-shows', async () => {
      const repeatCustomer = await prisma.customer.create({
        data: {
          businessId,
          phone: `+1${Date.now()}3`,
          name: 'Repeat Offender',
        },
      });
      for (let i = 0; i < 2; i++) {
        await prisma.appointment.create({
          data: {
            businessId,
            serviceId: serviceProductId,
            customerId: repeatCustomer.id,
            startsAt: new Date(`2026-07-2${i}T10:00:00Z`),
            endsAt: new Date(`2026-07-2${i}T11:00:00Z`),
            status: 'no_show',
          },
        });
      }

      const report = await service.noShowReport(businessId, 12);
      expect(
        report.repeatOffenders.some(
          (o) => o.customerId === repeatCustomer.id && o.noShowCount >= 2,
        ),
      ).toBe(true);
    });
  });
});
