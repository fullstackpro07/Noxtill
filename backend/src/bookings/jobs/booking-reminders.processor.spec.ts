import { PrismaService } from '../../prisma/prisma.service';
import { SendGateService } from '../../messaging/send-gate.service';
import { BookingRemindersProcessor } from './booking-reminders.processor';

describe('BookingRemindersProcessor (BE-055)', () => {
  let prisma: PrismaService;
  let processor: BookingRemindersProcessor;
  let businessId: string;
  let customerId: string;
  let serviceProductId: string;
  const sendGate = { send: jest.fn().mockResolvedValue(undefined) };

  const now = new Date('2026-08-10T00:00:00Z');

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    processor = new BookingRemindersProcessor(
      prisma,
      sendGate as unknown as SendGateService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Booking Reminders Test Biz',
        slug: `booking-reminders-test-${Date.now()}`,
      },
    });
    businessId = business.id;

    const customer = await prisma.customer.create({
      data: { businessId, phone: `+1${Date.now()}`, name: 'Ivy' },
    });
    customerId = customer.id;

    const svc = await prisma.product.create({
      data: { businessId, kind: 'service', name: 'Consult', durationMin: 30 },
    });
    serviceProductId = svc.id;
  });

  afterEach(() => {
    sendGate.send.mockClear();
  });

  afterAll(async () => {
    // FK-checks-disabled transaction (not just ordered deletes): under the full suite's parallel
    // workers, a plain deleteMany-then-delete sequence has been observed to still hit a FK
    // violation on the business delete — each statement auto-commits on its own pooled
    // connection, so this guards against any stray row from that timing window rather than
    // relying on statement order alone (same fix as sessions.service.spec.ts).
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.appointment.deleteMany({ where: { businessId } });
      await tx.product.deleteMany({ where: { businessId } });
      await tx.customer.deleteMany({ where: { businessId } });
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('reminds an appointment starting in ~24h but not one starting in ~5h', async () => {
    const in24h = await prisma.appointment.create({
      data: {
        businessId,
        serviceId: serviceProductId,
        customerId,
        startsAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        endsAt: new Date(now.getTime() + 24.5 * 60 * 60 * 1000),
        status: 'confirmed',
      },
    });
    const in5h = await prisma.appointment.create({
      data: {
        businessId,
        serviceId: serviceProductId,
        customerId,
        startsAt: new Date(now.getTime() + 5 * 60 * 60 * 1000),
        endsAt: new Date(now.getTime() + 5.5 * 60 * 60 * 1000),
        status: 'confirmed',
      },
    });

    await processor.runReminders(now);

    expect(sendGate.send).toHaveBeenCalledTimes(1);
    expect(sendGate.send).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId,
        customerId,
        templateKey: 'booking_reminder',
      }),
    );

    await prisma.appointment.deleteMany({
      where: { id: { in: [in24h.id, in5h.id] } },
    });
  });

  it('never reminds a cancelled appointment', async () => {
    const appointment = await prisma.appointment.create({
      data: {
        businessId,
        serviceId: serviceProductId,
        customerId,
        startsAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
        endsAt: new Date(now.getTime() + 2.5 * 60 * 60 * 1000),
        status: 'cancelled',
      },
    });

    await processor.runReminders(now);
    expect(sendGate.send).not.toHaveBeenCalled();

    await prisma.appointment.delete({ where: { id: appointment.id } });
  });
});
