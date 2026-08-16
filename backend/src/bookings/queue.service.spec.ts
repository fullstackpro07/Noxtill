import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { QueueService } from './queue.service';
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

describe('QueueService (UPD-BE-018)', () => {
  let prisma: PrismaService;
  let queueService: QueueService;
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
    queueService = new QueueService(
      tenantPrisma,
      sendGate as unknown as SendGateService,
    );

    const business = await prisma.business.create({
      data: { name: 'Queue Test Biz', slug: `queue-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const customer = await prisma.customer.create({
      data: { businessId, phone: `+1${Date.now()}`, name: 'Queue Customer' },
    });
    customerId = customer.id;
  });

  afterEach(() => {
    sendGate.send.mockClear();
  });

  afterAll(async () => {
    await prisma.queueToken.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('assigns sequential numbers starting at 1 for the business today', async () => {
    const t1 = await queueService.join(businessId, {
      customerName: 'Walk-in A',
    });
    const t2 = await queueService.join(businessId, {
      customerName: 'Walk-in B',
    });
    const t3 = await queueService.join(businessId, {
      customerId,
      customerName: 'Walk-in C',
    });

    expect(t1.number).toBe(1);
    expect(t2.number).toBe(2);
    expect(t3.number).toBe(3);
  });

  it('call() marks a waiting token called and notifies an identified customer', async () => {
    const token = await queueService.join(businessId, { customerId });
    const called = await queueService.call(businessId, token.id);

    expect(called.status).toBe('called');
    expect(called.calledAt).not.toBeNull();
    expect(sendGate.send).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId,
        customerId,
        templateKey: 'queue_called',
        variables: { number: String(token.number) },
      }),
    );
  });

  it('call() silently skips notification for an anonymous token', async () => {
    const token = await queueService.join(businessId, { customerName: 'Anon' });
    await queueService.call(businessId, token.id);
    expect(sendGate.send).not.toHaveBeenCalled();
  });

  it('serve() marks a called token served', async () => {
    const token = await queueService.join(businessId, {
      customerName: 'Servee',
    });
    await queueService.call(businessId, token.id);
    const served = await queueService.serve(token.id);
    expect(served.status).toBe('served');
    expect(served.servedAt).not.toBeNull();
  });

  it('skip() marks a waiting token skipped', async () => {
    const token = await queueService.join(businessId, {
      customerName: 'Skippy',
    });
    const skipped = await queueService.skip(token.id);
    expect(skipped.status).toBe('skipped');
  });

  it('rejects serving a token that was already served', async () => {
    const token = await queueService.join(businessId, {
      customerName: 'Twice',
    });
    await queueService.serve(token.id);
    await expect(queueService.serve(token.id)).rejects.toBeInstanceOf(
      AppException,
    );
  });

  it("list() returns only today's tokens, ordered by number", async () => {
    const tokens = await queueService.list();
    expect(tokens.length).toBeGreaterThan(0);
    for (let i = 1; i < tokens.length; i++) {
      expect(tokens[i].number).toBeGreaterThan(tokens[i - 1].number);
    }
  });
});
