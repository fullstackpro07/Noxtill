import { randomUUID } from 'crypto';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppointmentsService } from '../bookings/appointments.service';
import { PublicBookingService } from '../bookings/public-booking.service';
import { VoiceRealtimeToolsService } from './voice-realtime-tools.service';

class BookingCls {
  private values: Record<string, unknown> = {};
  get<T>(key: string) {
    return this.values[key] as T;
  }
  set(key: string, value: unknown) {
    this.values[key] = value;
  }
  run<T>(fn: () => T) {
    return fn();
  }
}
describe('Realtime confirmed booking tools (real Bookings and MySQL)', () => {
  const prisma = new PrismaService();
  const cls = new BookingCls();
  const tenant = new TenantPrismaService(prisma, cls as unknown as ClsService);
  const send = { send: jest.fn().mockResolvedValue(undefined) };
  const waitlist = { tryAutoOffer: jest.fn().mockResolvedValue(undefined) };
  const publicBooking = new PublicBookingService(
    prisma,
    send as never,
    waitlist as never,
  );
  const appointments = new AppointmentsService(
    tenant,
    {} as never,
    {} as never,
    send as never,
    waitlist as never,
    {} as never,
  );
  const tools = new VoiceRealtimeToolsService(
    prisma,
    appointments,
    publicBooking,
    cls as unknown as ClsService,
  );
  let businessId: string, productId: string, sessionId: string;
  const slug = `qa-booking-tools-${randomUUID()}`;
  beforeAll(async () => {
    await prisma.$connect();
    businessId = (
      await prisma.business.create({
        data: {
          name: 'QA booking tools',
          slug,
          timezone: 'UTC',
          workingHours: Object.fromEntries(
            ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day) => [
              day,
              [['09:00', '17:00']],
            ]),
          ),
        },
      })
    ).id;
    productId = (
      await prisma.product.create({
        data: {
          businessId,
          kind: 'service',
          name: 'QA consultation',
          durationMin: 30,
        },
      })
    ).id;
    const agent = await prisma.voiceAiAgent.create({
      data: { businessId, name: 'QA', template: 'booking' },
    });
    const version = await prisma.voiceAiAgentVersion.create({
      data: {
        businessId,
        agentId: agent.id,
        version: 1,
        checksum: 'qa',
        config: { toolPermissions: ['book', 'reschedule'] },
      },
    });
    const call = await prisma.phoneCall.create({
      data: {
        businessId,
        callSid: `CA-${randomUUID()}`,
        fromNumber: '+15550001234',
        voiceAgentVersionId: version.id,
      },
    });
    sessionId = (
      await prisma.voiceRealtimeSession.create({
        data: {
          businessId,
          callId: call.id,
          tokenHash: 'qa',
          expiresAt: new Date(),
          status: 'active',
          model: 'qa',
        },
      })
    ).id;
  });
  afterAll(async () => {
    await prisma.voiceUsageRecord.deleteMany({ where: { businessId } });
    await prisma.auditLog.deleteMany({ where: { businessId } });
    await prisma.phoneCall.deleteMany({ where: { businessId } });
    await prisma.appointment.deleteMany({ where: { businessId } });
    await prisma.slotLock.deleteMany({
      where: { lockKey: { startsWith: businessId } },
    });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.voiceAiAgentVersion.deleteMany({ where: { businessId } });
    await prisma.voiceAiAgent.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });
  it('writes only after confirmation, stores the real booking, and deduplicates the tool request', async () => {
    let startsAt: string | undefined;
    for (let offset = 2; offset < 9 && !startsAt; offset++) {
      const date = new Date(Date.now() + offset * 86400000)
        .toISOString()
        .slice(0, 10);
      startsAt = (
        await publicBooking.getSlots(slug, { service: productId, date })
      ).slots[0];
    }
    expect(startsAt).toBeDefined();
    const args = {
      serviceId: productId,
      startsAt: startsAt!,
      customerName: 'QA caller',
    };
    expect(
      (await tools.execute(sessionId, 'book-qa', 'book', args)).status,
    ).toBe('confirmation_required');
    expect(await prisma.appointment.count({ where: { businessId } })).toBe(0);
    expect(
      (await tools.execute(sessionId, 'book-qa', 'book', args, true)).status,
    ).toBe('completed');
    await tools.execute(sessionId, 'book-qa', 'book', args, true);
    const actual = await prisma.appointment.findMany({
      where: { businessId },
      include: { customer: true },
    });
    expect(actual).toHaveLength(1);
    expect(actual[0].source).toBe('phone');
    expect(actual[0].startsAt.toISOString()).toBe(startsAt);
    expect(actual[0].customer.phone).toBe('+15550001234');
    const call = await prisma.phoneCall.findFirstOrThrow({
      where: { businessId },
    });
    expect(call.appointmentId).toBe(actual[0].id);
    const denied = await tools.execute(
      sessionId,
      'reschedule-bad',
      'reschedule',
      { bookingToken: 'another-customers-token', startsAt: startsAt! },
      true,
    );
    expect(denied.status).toBe('failed');
    expect(
      (
        await prisma.appointment.findUniqueOrThrow({
          where: { id: actual[0].id },
        })
      ).startsAt.toISOString(),
    ).toBe(startsAt);
  });

  it('checks phone reschedule rules after verifying the private reference and caller', async () => {
    const booking = await prisma.appointment.findFirstOrThrow({
      where: { businessId },
    });
    const date = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    const bad = await tools.execute(
      sessionId,
      'reschedule-outside-hours',
      'reschedule',
      {
        bookingToken: booking.rescheduleToken!,
        startsAt: `${date}T20:00:00.000Z`,
      },
      true,
    );
    expect(bad.status).toBe('failed');
    const startsAt = (
      await publicBooking.getSlots(slug, { service: productId, date })
    ).slots[0];
    const args = { bookingToken: booking.rescheduleToken!, startsAt };
    expect(
      (
        await tools.execute(
          sessionId,
          'reschedule-confirmed',
          'reschedule',
          args,
        )
      ).status,
    ).toBe('confirmation_required');
    const changed = await tools.execute(
      sessionId,
      'reschedule-confirmed',
      'reschedule',
      args,
      true,
    );
    expect(changed.status).toBe('completed');
    expect(changed.result).toMatchObject({
      appointmentId: booking.id,
      status: 'confirmed',
      startsAt,
    });
    expect(
      (
        await prisma.appointment.findUniqueOrThrow({
          where: { id: booking.id },
        })
      ).startsAt.toISOString(),
    ).toBe(startsAt);
  });

  it('returns the canonical pending status when staff approval is enabled', async () => {
    await prisma.business.update({
      where: { id: businessId },
      data: { policies: { 'voice.bookingsRequireStaffApproval': true } },
    });
    const date = new Date(Date.now() + 10 * 86400000)
      .toISOString()
      .slice(0, 10);
    const startsAt = (
      await publicBooking.getSlots(slug, { service: productId, date })
    ).slots[0];
    expect(startsAt).toBeDefined();
    const response = await tools.execute(
      sessionId,
      'book-staff-review',
      'book',
      {
        serviceId: productId,
        startsAt,
        customerName: 'QA pending caller',
      },
      true,
    );
    expect(response.status).toBe('completed');
    expect(response.result).toMatchObject({ status: 'requested' });
    expect(JSON.stringify(response.result)).toContain(
      'Do not say it is confirmed',
    );
    expect(
      (
        await prisma.appointment.findFirstOrThrow({
          where: { businessId, startsAt: new Date(startsAt) },
        })
      ).status,
    ).toBe('requested');
  });
});
