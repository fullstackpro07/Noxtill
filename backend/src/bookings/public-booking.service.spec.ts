import { PrismaService } from '../prisma/prisma.service';
import { SendGateService } from '../messaging/send-gate.service';
import { PublicBookingService } from './public-booking.service';
import { AppException } from '../common/filters/app.exception';

describe('PublicBookingService (BE-051/052/053/055)', () => {
  let prisma: PrismaService;
  let service: PublicBookingService;
  let businessId: string;
  let slug: string;
  let serviceProductId: string;
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
      date: '2026-07-22', // Wednesday, far enough in the future to not be "past"
    });
    expect(result.slots).toContain('2026-07-22T09:00:00.000Z');
  });

  it('books a slot, marks it unavailable afterward, and confirms via send gate', async () => {
    const booking = await service.createBooking(slug, {
      serviceId: serviceProductId,
      startsAt: '2026-07-22T09:00:00.000Z',
      customerPhone: `+1${Date.now()}`,
      customerName: 'Dana',
    });
    expect(booking.status).toBe('booked');
    expect(sendGate.send).toHaveBeenCalledWith(
      expect.objectContaining({ businessId, templateKey: 'booking_confirm' }),
    );

    const result = await service.getSlots(slug, {
      service: serviceProductId,
      date: '2026-07-22',
    });
    expect(result.slots).not.toContain('2026-07-22T09:00:00.000Z');
  });

  it('rejects a second booking for the same already-taken slot with a 409', async () => {
    await expect(
      service.createBooking(slug, {
        serviceId: serviceProductId,
        startsAt: '2026-07-22T09:00:00.000Z',
        customerPhone: `+1${Date.now()}`,
        customerName: 'Eve',
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('reschedules a booking to a free slot via its token', async () => {
    const booking = await service.createBooking(slug, {
      serviceId: serviceProductId,
      startsAt: '2026-07-22T11:00:00.000Z',
      customerPhone: `+1${Date.now()}`,
      customerName: 'Frank',
    });

    const rescheduled = await service.reschedule(
      booking.rescheduleToken!,
      '2026-07-22T13:00:00.000Z',
    );
    expect(rescheduled.startsAt.toISOString()).toBe('2026-07-22T13:00:00.000Z');
  });

  it('cancels a booking via its token, freeing the slot', async () => {
    const booking = await service.createBooking(slug, {
      serviceId: serviceProductId,
      startsAt: '2026-07-22T15:00:00.000Z',
      customerPhone: `+1${Date.now()}`,
      customerName: 'Grace',
    });

    const cancelled = await service.cancel(booking.rescheduleToken!);
    expect(cancelled.status).toBe('cancelled');

    const result = await service.getSlots(slug, {
      service: serviceProductId,
      date: '2026-07-22',
    });
    expect(result.slots).toContain('2026-07-22T15:00:00.000Z');
  });
});
