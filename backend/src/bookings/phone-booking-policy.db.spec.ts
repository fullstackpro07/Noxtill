import { randomUUID } from 'crypto';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { AppointmentsService } from './appointments.service';
import { PublicBookingService } from './public-booking.service';

class PhoneBookingCls {
  businessId = '';
  get(key: string) {
    return key === CLS_KEY_BUSINESS_ID ? this.businessId : undefined;
  }
}

describe('Canonical phone booking policies (real MySQL)', () => {
  const prisma = new PrismaService();
  const cls = new PhoneBookingCls();
  const tenant = new TenantPrismaService(prisma, cls as unknown as ClsService);
  const service = new AppointmentsService(
    tenant,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const publicBooking = new PublicBookingService(
    prisma,
    {} as never,
    {} as never,
  );
  let businessId: string, serviceId: string, otherServiceId: string;
  let otherBusinessId: string, foreignStaffId: string, userId: string;
  const workingHours = Object.fromEntries(
    ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((key) => [
      key,
      [['09:00', '17:00']],
    ]),
  );
  const day = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const request = (time = '10:00', product = serviceId) => ({
    serviceId: product,
    startsAt: `${day}T${time}:00.000Z`,
    customerName: 'QA phone booking',
    customerPhone: '+15550007770',
  });
  const book = (time = '10:00', product = serviceId) =>
    service.createWalkIn(businessId, request(time, product), 'phone');

  beforeAll(async () => {
    await prisma.$connect();
    businessId = (
      await prisma.business.create({
        data: {
          name: 'QA phone booking policy',
          slug: `qa-phone-policy-${randomUUID()}`,
          timezone: 'UTC',
          workingHours,
        },
      })
    ).id;
    cls.businessId = businessId;
    serviceId = (
      await prisma.product.create({
        data: {
          businessId,
          name: 'QA consultation',
          kind: 'service',
          durationMin: 30,
        },
      })
    ).id;
    otherServiceId = (
      await prisma.product.create({
        data: {
          businessId,
          name: 'QA alternate service',
          kind: 'service',
          durationMin: 30,
        },
      })
    ).id;
    otherBusinessId = (
      await prisma.business.create({
        data: {
          name: 'QA other tenant',
          slug: `qa-phone-other-${randomUUID()}`,
        },
      })
    ).id;
    userId = (
      await prisma.user.create({
        data: {
          name: 'QA staff fixture',
          email: `qa-phone-${randomUUID()}@example.com`,
          passwordHash: 'qa-not-a-login',
        },
      })
    ).id;
    foreignStaffId = (
      await prisma.businessUser.create({
        data: { businessId: otherBusinessId, userId },
      })
    ).id;
  });

  beforeEach(async () => {
    await prisma.deposit.deleteMany({ where: { businessId } });
    await prisma.appointment.deleteMany({ where: { businessId } });
    await prisma.business.update({
      where: { id: businessId },
      data: { policies: {} },
    });
    await prisma.product.update({
      where: { id: serviceId },
      data: {
        active: true,
        durationMin: 30,
        depositRequired: false,
        depositAmount: null,
        eligibleStaffIds: [],
        bufferBeforeMin: 0,
        bufferAfterMin: 0,
      },
    });
  });

  afterAll(async () => {
    // A failed setup must never turn an undefined tenant filter into a global delete.
    if (!businessId) {
      await prisma.$disconnect();
      return;
    }
    await prisma.deposit.deleteMany({ where: { businessId } });
    await prisma.appointment.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    if (otherBusinessId) {
      await prisma.businessUser.deleteMany({
        where: { businessId: otherBusinessId },
      });
    }
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.slotLock.deleteMany({
      where: { lockKey: { startsWith: businessId } },
    });
    await prisma.business.deleteMany({
      where: { id: { in: [businessId, otherBusinessId].filter(Boolean) } },
    });
    await prisma.$disconnect();
  });

  it('confirms an eligible phone booking and creates a private change reference', async () => {
    const actual = await book();
    expect(actual.status).toBe('confirmed');
    expect(actual.source).toBe('phone');
    expect(actual.rescheduleToken).toMatch(/^[a-f0-9]{32}$/);
  });

  it('keeps a required deposit pending, never inventing a captured cash payment', async () => {
    await prisma.product.update({
      where: { id: serviceId },
      data: { depositRequired: true, depositAmount: 25 },
    });
    const actual = await service.createWalkIn(
      businessId,
      { ...request(), depositAmount: 100 },
      'phone',
    );
    expect(actual.status).toBe('requested');
    expect(Number(actual.depositPaid)).toBe(0);
    expect(await prisma.deposit.count({ where: { businessId } })).toBe(0);
  });

  it('honors the owner approval policy and leaves the existing walk-in behavior intact', async () => {
    await prisma.business.update({
      where: { id: businessId },
      data: { policies: { 'voice.bookingsRequireStaffApproval': true } },
    });
    expect((await book()).status).toBe('requested');
    expect(
      (await service.createWalkIn(businessId, request('11:00'))).status,
    ).toBe('confirmed');
  });

  it('rejects a time outside business hours and a non-slot-aligned time', async () => {
    await expect(book('20:00')).rejects.toMatchObject({
      response: { code: 'BOOKING_SLOT_UNAVAILABLE' },
    });
    await expect(book('10:05')).rejects.toMatchObject({
      response: { code: 'BOOKING_SLOT_UNAVAILABLE' },
    });
    expect(await prisma.appointment.count({ where: { businessId } })).toBe(0);
  });

  it('refuses missing business hours rather than inventing availability', async () => {
    await prisma.business.update({
      where: { id: businessId },
      data: { workingHours: {} },
    });
    try {
      await expect(book()).rejects.toMatchObject({
        response: { code: 'BOOKING_SLOT_UNAVAILABLE' },
      });
    } finally {
      await prisma.business.update({
        where: { id: businessId },
        data: { workingHours },
      });
    }
  });

  it('rejects a zero-duration service without entering the slot generator', async () => {
    await prisma.product.update({
      where: { id: serviceId },
      data: { durationMin: 0 },
    });
    await expect(book()).rejects.toMatchObject({
      response: { code: 'INVALID_SERVICE_DURATION' },
    });
  });

  it('enforces notice and advance windows', async () => {
    await prisma.business.update({
      where: { id: businessId },
      data: { policies: { 'bookings.minAdvanceHours': 400 } },
    });
    await expect(book()).rejects.toMatchObject({
      response: { code: 'BOOKING_TOO_SOON' },
    });
    await prisma.business.update({
      where: { id: businessId },
      data: { policies: { 'bookings.maxAdvanceDays': 1 } },
    });
    await expect(book()).rejects.toMatchObject({
      response: { code: 'BOOKING_TOO_FAR' },
    });
  });

  it('rejects inactive services and staff from a different tenant', async () => {
    await prisma.product.update({
      where: { id: serviceId },
      data: { active: false },
    });
    await expect(book()).rejects.toMatchObject({
      response: { code: 'BOOKING_SERVICE_NOT_FOUND' },
    });
    await prisma.product.update({
      where: { id: serviceId },
      data: { active: true },
    });
    await expect(
      service.createWalkIn(
        businessId,
        { ...request(), staffId: foreignStaffId },
        'phone',
      ),
    ).rejects.toMatchObject({
      response: { code: 'BOOKING_STAFF_NOT_ELIGIBLE' },
    });
  });

  it('requires review when a service needs eligible staff but none was assigned', async () => {
    await prisma.product.update({
      where: { id: serviceId },
      data: { eligibleStaffIds: [randomUUID()] },
    });
    expect((await book()).status).toBe('requested');
  });

  it('enforces service buffers even without an assigned staff member', async () => {
    await prisma.product.update({
      where: { id: serviceId },
      data: { bufferAfterMin: 30 },
    });
    await book();
    await expect(book('10:30')).rejects.toMatchObject({
      response: { code: 'BOOKING_SLOT_UNAVAILABLE' },
    });
    expect((await book('11:00')).status).toBe('confirmed');
  });

  it('serializes different service/time requests against the business daily cap', async () => {
    await prisma.business.update({
      where: { id: businessId },
      data: { policies: { 'bookings.maxDailyBookings': 1 } },
    });
    const results = await Promise.allSettled([
      book('10:00'),
      book('11:00', otherServiceId),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(await prisma.appointment.count({ where: { businessId } })).toBe(1);
  });

  it('serializes overlapping starts, not just requests for the identical start', async () => {
    await prisma.product.update({
      where: { id: serviceId },
      data: { durationMin: 60 },
    });
    const results = await Promise.allSettled([
      book('10:00'),
      book('10:30', otherServiceId),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(await prisma.appointment.count({ where: { businessId } })).toBe(1);
  });

  it('enforces hours, buffers and approval on verified phone reschedules', async () => {
    const original = await book();
    await expect(
      publicBooking.reschedule(
        original.rescheduleToken!,
        request('20:00').startsAt,
        { phone: true },
      ),
    ).rejects.toMatchObject({ response: { code: 'BOOKING_SLOT_UNAVAILABLE' } });
    await prisma.product.update({
      where: { id: serviceId },
      data: { bufferAfterMin: 30 },
    });
    await book('12:00');
    await expect(
      publicBooking.reschedule(
        original.rescheduleToken!,
        request('12:30').startsAt,
        { phone: true },
      ),
    ).rejects.toMatchObject({ response: { code: 'BOOKING_SLOT_UNAVAILABLE' } });
    await prisma.business.update({
      where: { id: businessId },
      data: { policies: { 'voice.bookingsRequireStaffApproval': true } },
    });
    const moved = await publicBooking.reschedule(
      original.rescheduleToken!,
      request('13:00').startsAt,
      { phone: true },
    );
    expect(moved.status).toBe('requested');
    expect(moved.startsAt.toISOString()).toBe(request('13:00').startsAt);
    expect(moved.id).toBe(original.id);
  });

  it('cannot resurrect a cancelled appointment through a phone time change', async () => {
    const original = await book();
    await prisma.appointment.update({
      where: { id: original.id },
      data: { status: 'cancelled' },
    });
    await expect(
      publicBooking.reschedule(
        original.rescheduleToken!,
        request('11:00').startsAt,
        { phone: true },
      ),
    ).rejects.toMatchObject({
      response: { code: 'BOOKING_INVALID_STATUS_TRANSITION' },
    });
    expect(
      (
        await prisma.appointment.findUniqueOrThrow({
          where: { id: original.id },
        })
      ).status,
    ).toBe('cancelled');
  });
});
