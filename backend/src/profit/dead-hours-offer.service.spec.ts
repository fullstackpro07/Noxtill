import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { ProfitService } from './profit.service';
import { DeadHoursOfferService } from './dead-hours-offer.service';
import { AppException } from '../common/filters/app.exception';
import type { AiInfraService } from '../ai/ai-infra.service';
import type { SegmentsService } from '../customers/segments.service';
import type { SendGateService } from '../messaging/send-gate.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('DeadHoursOfferService (UPD-BE-106)', () => {
  let prisma: PrismaService;
  let service: DeadHoursOfferService;
  let businessId: string;
  let customerId: string;

  const aiInfra = {
    complete: jest
      .fn()
      .mockResolvedValue(
        'Come by {{customerName}} for 15% off during our quiet hours!',
      ),
  };
  const sendGate = { send: jest.fn().mockResolvedValue(undefined) };
  const segments = {
    getSegment: jest.fn(),
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const profitService = new ProfitService(
      tenantPrisma,
      cls as unknown as ClsService,
      aiInfra as unknown as AiInfraService,
    );
    service = new DeadHoursOfferService(
      tenantPrisma,
      aiInfra as unknown as AiInfraService,
      segments as unknown as SegmentsService,
      sendGate as unknown as SendGateService,
      profitService,
      cls as unknown as ClsService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Dead Hours Test Biz',
        slug: `dead-hours-test-${Date.now()}`,
        msgQuota: 600,
        msgUsed: 0,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const customer = await prisma.customer.create({
      data: { businessId, phone: `+1${Date.now()}`, name: 'Dana' },
    });
    customerId = customer.id;
  });

  afterEach(() => {
    aiInfra.complete.mockClear();
    sendGate.send.mockClear();
    segments.getSegment.mockClear();
  });

  afterAll(async () => {
    await prisma.campaign.deleteMany({ where: { businessId } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('reports honestly when there is not enough sales history to find a dead window', async () => {
    const draft = await service.generate();
    expect(draft.windowLabel).toBe('');
    expect(draft.offerText).toMatch(/not enough sales history/i);
    expect(aiInfra.complete).not.toHaveBeenCalled();
  });

  it('drafts a real AI offer grounded in the real slowest hour/day from actual sales', async () => {
    // A 3pm sale on a fixed, known weekday so both hourly and weekday data exist.
    await prisma.order.create({
      data: {
        businessId,
        orderNo: 1,
        status: 'completed',
        orderType: 'counter',
        total: 100,
        subtotal: 100,
        createdAt: new Date('2026-01-06T15:00:00Z'), // a Tuesday
      },
    });

    const draft = await service.generate();
    expect(draft.windowLabel).toContain('15:00');
    expect(draft.offerText).toContain('15% off');
    expect(aiInfra.complete).toHaveBeenCalledWith(
      businessId,
      expect.stringContaining('15:00'),
      0.6,
    );

    await prisma.order.deleteMany({ where: { businessId } });
  });

  it('falls back to an honest message when the AI call fails, never fabricating an offer', async () => {
    await prisma.order.create({
      data: {
        businessId,
        orderNo: 2,
        status: 'completed',
        orderType: 'counter',
        total: 50,
        subtotal: 50,
      },
    });
    aiInfra.complete.mockRejectedValueOnce(new Error('AI down'));

    const draft = await service.generate();
    expect(draft.offerText).toMatch(/isn't available|write your own/i);

    await prisma.order.deleteMany({ where: { businessId } });
  });

  describe('send (the explicit Approve step)', () => {
    it('creates a real Campaign and sends via the real send gate, quota-checked', async () => {
      segments.getSegment.mockResolvedValue({
        key: 'all',
        count: 1,
        members: [{ id: customerId, name: 'Dana', optedOut: false }],
      });

      const campaign = await service.send(
        'all',
        'Come by {{customerName}} for a treat!',
      );

      expect(campaign.body).toBe('Come by {{customerName}} for a treat!');
      expect(campaign.sentCount).toBe(1);
      expect(sendGate.send).toHaveBeenCalledWith(
        expect.objectContaining({
          businessId,
          customerId,
          templateKey: 'campaign',
          variables: { body: 'Come by Dana for a treat!' },
        }),
      );
    });

    it('refuses to send to an empty (all-opted-out) segment', async () => {
      segments.getSegment.mockResolvedValue({
        key: 'all',
        count: 1,
        members: [{ id: customerId, name: 'Dana', optedOut: true }],
      });

      await expect(service.send('all', 'Hello!')).rejects.toBeInstanceOf(
        AppException,
      );
      expect(sendGate.send).not.toHaveBeenCalled();
    });

    it('blocks the whole send atomically when it would exceed the remaining quota', async () => {
      await prisma.business.update({
        where: { id: businessId },
        data: { msgQuota: 1, msgUsed: 1 },
      });
      segments.getSegment.mockResolvedValue({
        key: 'all',
        count: 1,
        members: [{ id: customerId, name: 'Dana', optedOut: false }],
      });

      await expect(service.send('all', 'Hello!')).rejects.toBeInstanceOf(
        AppException,
      );
      expect(sendGate.send).not.toHaveBeenCalled();

      await prisma.business.update({
        where: { id: businessId },
        data: { msgQuota: 600, msgUsed: 0 },
      });
    });
  });
});
