import { PrismaService } from '../prisma/prisma.service';
import { SendGateService } from '../messaging/send-gate.service';
import { PublicBookingService } from './public-booking.service';
import { AppException } from '../common/filters/app.exception';

// Always at least 30 days out and a Wednesday, so this test never becomes a
// ticking time bomb as the real "now" (the slot computation's default) advances.
function futureWednesday(): string {
  const d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  while (d.getUTCDay() !== 3) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

describe('PublicBookingService (BE-051/052/053/055)', () => {
  let prisma: PrismaService;
  let service: PublicBookingService;
  let businessId: string;
  let slug: string;
  let serviceProductId: string;
  const testDate = futureWednesday();
  const sendGate = { send: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new PublicBookingService(
      prisma,
      sendGate as unknown as SendGateService,
    );

    slug = `booking-test-${Date.now()}`;
    const business = await prisma.business.create({
      data: {
        name: 'Booking Test Biz',
        slug,
        timezone: 'UTC',
        workingHours: { wed: [['09:00', '17:00']], thu: [['09:00', '17:00']] },
      },
    });
    businessId = business.id;

    const svc = await prisma.product.create({
      data: {
        businessId,
        kind: 'service',
        name: 'Haircut',
        durationMin: 30,
        sellingPrice: 20,
      },
    });
    serviceProductId = svc.id;
  });

  afterEach(() => {
    sendGate.send.mockClear();
  });

  afterAll(async () => {
    await prisma.appointment.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('lists only active services', async () => {
    const services = await service.listServices(slug);
    expect(services.map((s) => s.id)).toContain(serviceProductId);
  });

  it('returns computed slots for a configured working day', async () => {
    const result = await service.getSlots(slug, {
      service: serviceProductId,
      date: testDate,
    });
    expect(result.slots).toContain(`${testDate}T09:00:00.000Z`);
  });

  it('books a slot, marks it unavailable afterward, and confirms via send gate', async () => {
    const booking = await service.createBooking(slug, {
      serviceId: serviceProductId,
      startsAt: `${testDate}T09:00:00.000Z`,
      customerPhone: `+1${Date.now()}`,
      customerName: 'Dana',
    });
    expect(booking.status).toBe('booked');
    expect(sendGate.send).toHaveBeenCalledWith(
      expect.objectContaining({ businessId, templateKey: 'booking_confirm' }),
    );

    const result = await service.getSlots(slug, {
      service: serviceProductId,
      date: testDate,
    });
    expect(result.slots).not.toContain(`${testDate}T09:00:00.000Z`);
  });

  it('rejects a second booking for the same already-taken slot with a 409', async () => {
    await expect(
      service.createBooking(slug, {
        serviceId: serviceProductId,
        startsAt: `${testDate}T09:00:00.000Z`,
        customerPhone: `+1${Date.now()}`,
        customerName: 'Eve',
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('reschedules a booking to a free slot via its token', async () => {
    const booking = await service.createBooking(slug, {
      serviceId: serviceProductId,
      startsAt: `${testDate}T11:00:00.000Z`,
      customerPhone: `+1${Date.now()}`,
      customerName: 'Frank',
    });

    const rescheduled = await service.reschedule(
      booking.rescheduleToken!,
      `${testDate}T13:00:00.000Z`,
    );
    expect(rescheduled.startsAt.toISOString()).toBe(
      `${testDate}T13:00:00.000Z`,
    );
  });

  it('rejects rescheduling onto a slot already taken by another booking', async () => {
    const fixed = await service.createBooking(slug, {
      serviceId: serviceProductId,
      startsAt: `${testDate}T10:00:00.000Z`,
      customerPhone: `+1${Date.now()}1`,
      customerName: 'Holly',
    });
    const movable = await service.createBooking(slug, {
      serviceId: serviceProductId,
      startsAt: `${testDate}T14:00:00.000Z`,
      customerPhone: `+1${Date.now()}2`,
      customerName: 'Ian',
    });

    await expect(
      service.reschedule(movable.rescheduleToken!, fixed.startsAt.toISOString()),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('returns business name and branding for the public booking page header', async () => {
    const info = await service.getBusinessInfo(slug);
    expect(info.businessName).toBe('Booking Test Biz');
  });

  it('cancels a booking via its token, freeing the slot', async () => {
    const booking = await service.createBooking(slug, {
      serviceId: serviceProductId,
      startsAt: `${testDate}T15:00:00.000Z`,
      customerPhone: `+1${Date.now()}`,
      customerName: 'Grace',
    });

    const cancelled = await service.cancel(booking.rescheduleToken!);
    expect(cancelled.status).toBe('cancelled');

    const result = await service.getSlots(slug, {
      service: serviceProductId,
      date: testDate,
    });
    expect(result.slots).toContain(`${testDate}T15:00:00.000Z`);
  });
});
