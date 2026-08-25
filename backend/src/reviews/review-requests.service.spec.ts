import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { SendGateService } from '../messaging/send-gate.service';
import { ReviewRequestsService } from './review-requests.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('ReviewRequestsService (BE-045)', () => {
  let prisma: PrismaService;
  let service: ReviewRequestsService;
  let businessId: string;
  let customerId: string;
  const sendGate = { send: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new ReviewRequestsService(
      tenantPrisma,
      sendGate as unknown as SendGateService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Review Req Test Biz',
        slug: `review-req-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const customer = await prisma.customer.create({
      data: { businessId, phone: `+1${Date.now()}`, name: 'Alice' },
    });
    customerId = customer.id;
  });

  afterEach(() => {
    sendGate.send.mockClear();
  });

  afterAll(async () => {
    await prisma.reviewRequest.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('creates a review request by customerId and schedules a +2h send', async () => {
    const request = await service.create(businessId, {
      customerId,
      source: 'manual',
    });

    expect(request.token).toHaveLength(32);
    /* eslint-disable @typescript-eslint/no-unsafe-assignment -- jest's expect.any(Date) types as `any` */
    expect(sendGate.send).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId,
        customerId,
        templateKey: 'review_request',
        scheduledFor: expect.any(Date),
      }),
    );
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */
  });

  it('resolves a customer by phone when customerId is omitted', async () => {
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
    });
    const request = await service.create(businessId, {
      phone: customer.phone,
      source: 'manual',
    });
    expect(request.customerId).toBe(customerId);
  });

  it('throws when neither customerId nor a matching phone is given', async () => {
    await expect(
      service.create(businessId, { phone: '+10000000000', source: 'manual' }),
    ).rejects.toThrow();
  });

  it('scheduleSend never throws even if the send gate rejects', async () => {
    sendGate.send.mockRejectedValueOnce(new Error('boom'));
    await expect(
      service.scheduleSend(businessId, customerId, 'sometoken'),
    ).resolves.toBeUndefined();
  });

  describe('bulkCreate (UPD-FE-085)', () => {
    it('sends to every valid customerId and skips ones that fail individually', async () => {
      const result = await service.bulkCreate(
        businessId,
        [customerId, 'not-a-real-customer-id'],
        'bulk',
      );
      expect(result).toEqual({ requested: 2, sent: 1 });
    });

    it('blocks the whole batch atomically when it would exceed the remaining quota', async () => {
      await prisma.business.update({
        where: { id: businessId },
        data: { msgQuota: 5, msgUsed: 4 },
      });

      await expect(
        service.bulkCreate(
          businessId,
          [customerId, customerId, customerId],
          'bulk',
        ),
      ).rejects.toThrow();
      expect(sendGate.send).not.toHaveBeenCalled();

      await prisma.business.update({
        where: { id: businessId },
        data: { msgQuota: 600, msgUsed: 0 },
      });
    });
  });
});
