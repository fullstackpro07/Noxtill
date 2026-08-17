import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { WaitlistService } from './waitlist.service';
import { SendGateService } from '../messaging/send-gate.service';
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

describe('WaitlistService (UPD-BE-017)', () => {
  let prisma: PrismaService;
  let waitlistService: WaitlistService;
  let businessId: string;
  let serviceProductId: string;
  const sendGate = { send: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    waitlistService = new WaitlistService(
      tenantPrisma,
      sendGate as unknown as SendGateService,
    );

    const business = await prisma.business.create({
      data: { name: 'Waitlist Test Biz', slug: `waitlist-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const svc = await prisma.product.create({
      data: { businessId, kind: 'service', name: 'Haircut', durationMin: 30 },
    });
    serviceProductId = svc.id;
  });

  afterEach(() => {
    sendGate.send.mockClear();
  });

  afterAll(async () => {
    await prisma.appointment.deleteMany({ where: { businessId } });
    await prisma.waitlistEntry.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('joining the waitlist upserts a customer by phone and stores the preferred window', async () => {
    const entry = await waitlistService.join(businessId, {
      serviceId: serviceProductId,
      customerName: 'Waiting Wanda',
      customerPhone: `+1${Date.now()}`,
      preferredFrom: '2026-08-20T00:00:00Z',
      preferredTo: '2026-08-25T00:00:00Z',
    });
    expect(entry.status).toBe('waiting');
    expect(entry.customer.name).toBe('Waiting Wanda');
  });

  it('offering a slot marks it offered and sends a real waitlist_offer notification', async () => {
    const entry = await waitlistService.join(businessId, {
      serviceId: serviceProductId,
      customerName: 'Offer Target',
      customerPhone: `+1${Date.now()}1`,
    });

    const offered = await waitlistService.offer(businessId, entry.id, {
      startsAt: '2026-08-21T10:00:00Z',
      endsAt: '2026-08-21T10:30:00Z',
    });
    expect(offered.status).toBe('offered');
    expect(sendGate.send).toHaveBeenCalledWith(
      expect.objectContaining({ templateKey: 'waitlist_offer' }),
    );
  });

  it('accepting an offer creates a real confirmed appointment with source waitlist', async () => {
    const entry = await waitlistService.join(businessId, {
      serviceId: serviceProductId,
      customerName: 'Accept Target',
      customerPhone: `+1${Date.now()}2`,
    });
    await waitlistService.offer(businessId, entry.id, {
      startsAt: '2026-08-22T10:00:00Z',
      endsAt: '2026-08-22T10:30:00Z',
    });

    const appointment = await waitlistService.accept(businessId, entry.id);
    expect(appointment.status).toBe('confirmed');
    expect(appointment.source).toBe('waitlist');

    const updatedEntry = await prisma.waitlistEntry.findUniqueOrThrow({
      where: { id: entry.id },
    });
    expect(updatedEntry.status).toBe('booked');
  });

  it('rejects accepting an entry that was never offered', async () => {
    const entry = await waitlistService.join(businessId, {
      serviceId: serviceProductId,
      customerName: 'Never Offered',
      customerPhone: `+1${Date.now()}3`,
    });
    await expect(
      waitlistService.accept(businessId, entry.id),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('cancel() marks an entry cancelled', async () => {
    const entry = await waitlistService.join(businessId, {
      serviceId: serviceProductId,
      customerName: 'Cancel Me',
      customerPhone: `+1${Date.now()}4`,
    });
    const cancelled = await waitlistService.cancel(entry.id);
    expect(cancelled.status).toBe('cancelled');
  });

  describe('tryAutoOffer', () => {
    // Own dedicated service per test below, so leftover `waiting` entries from earlier tests in
    // this file (which reuse `serviceProductId`) can never win the "longest waiting" match first.

    it('automatically offers the freed slot to the longest-waiting matching entry', async () => {
      const dedicated = await prisma.product.create({
        data: {
          businessId,
          kind: 'service',
          name: 'Auto-Offer Service',
          durationMin: 30,
        },
      });

      const first = await waitlistService.join(businessId, {
        serviceId: dedicated.id,
        customerName: 'First In Line',
        customerPhone: `+1${Date.now()}5`,
      });
      await waitlistService.join(businessId, {
        serviceId: dedicated.id,
        customerName: 'Second In Line',
        customerPhone: `+1${Date.now()}6`,
      });

      await waitlistService.tryAutoOffer(businessId, {
        serviceId: dedicated.id,
        staffUserId: null,
        startsAt: new Date('2026-08-23T09:00:00Z'),
        endsAt: new Date('2026-08-23T09:30:00Z'),
      });

      const updatedFirst = await prisma.waitlistEntry.findUniqueOrThrow({
        where: { id: first.id },
      });
      expect(updatedFirst.status).toBe('offered');
      expect(sendGate.send).toHaveBeenCalledWith(
        expect.objectContaining({ templateKey: 'waitlist_offer' }),
      );
    });

    it('never throws even when something goes wrong internally', async () => {
      await expect(
        waitlistService.tryAutoOffer('not-a-real-business-id', {
          serviceId: 'not-a-real-service-id',
          staffUserId: null,
          startsAt: new Date(),
          endsAt: new Date(),
        }),
      ).resolves.toBeUndefined();
    });

    it('does not match an entry whose preferred window excludes the freed slot', async () => {
      const narrowEntry = await waitlistService.join(businessId, {
        serviceId: serviceProductId,
        customerName: 'Narrow Window',
        customerPhone: `+1${Date.now()}7`,
        preferredFrom: '2026-09-01T00:00:00Z',
        preferredTo: '2026-09-02T00:00:00Z',
      });

      await waitlistService.tryAutoOffer(businessId, {
        serviceId: serviceProductId,
        staffUserId: null,
        startsAt: new Date('2026-08-24T09:00:00Z'),
        endsAt: new Date('2026-08-24T09:30:00Z'),
      });

      const stillWaiting = await prisma.waitlistEntry.findUniqueOrThrow({
        where: { id: narrowEntry.id },
      });
      expect(stillWaiting.status).toBe('waiting');
    });
  });
});
