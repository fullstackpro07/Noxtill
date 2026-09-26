import axios from 'axios';
import { ClsService } from 'nestjs-cls';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../../common/tenancy/tenant.constants';
import { QueueService } from '../../common/queue/queue.service';
import { OutboundWebhookService } from './outbound-webhook.service';
import { IntegrationProvider, WorkflowTriggerKey } from '@prisma/client';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('OutboundWebhookService — validated endpoints, retry and delete (Integrations redesign)', () => {
  let prisma: PrismaService;
  let service: OutboundWebhookService;
  let businessId: string;
  const addJob = jest.fn();
  const audit = { log: jest.fn() };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new OutboundWebhookService(
      tenantPrisma,
      { addJob } as unknown as QueueService,
      {} as unknown as Queue,
      audit as never,
    );
    const business = await prisma.business.create({
      data: {
        name: 'Validated Webhook Biz',
        slug: `validated-webhook-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterEach(() => jest.clearAllMocks());

  afterAll(async () => {
    await prisma.outboundWebhookDelivery.deleteMany({
      where: { webhook: { businessId } },
    });
    await prisma.outboundWebhook.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  const dto = {
    provider: IntegrationProvider.developer,
    triggerKey: WorkflowTriggerKey.sale,
    targetUrl: 'https://api.example.com/hook',
  };

  it('saves the webhook only after the endpoint answers 2xx to a signed validation event', async () => {
    mockedAxios.post.mockResolvedValue({ status: 204 });
    const webhook = await service.subscribeValidated(businessId, dto);
    expect(webhook.active).toBe(true);
    expect(webhook.secret).toHaveLength(64);

    const [url, body, options] = mockedAxios.post.mock.calls[0] as [
      string,
      string,
      { headers: Record<string, string>; timeout: number },
    ];
    expect(url).toBe(dto.targetUrl);
    expect(JSON.parse(body)).toMatchObject({
      test: true,
      validation: true,
      trigger: 'sale',
    });
    expect(options.headers['X-Noxtill-Signature']).toMatch(/^[0-9a-f]{64}$/);
    expect(options.timeout).toBe(10_000);

    // The validation is kept as the first, successful delivery.
    const deliveries = await prisma.outboundWebhookDelivery.findMany({
      where: { webhookId: webhook.id },
    });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      status: 'success',
      responseStatus: 204,
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'integration.webhook_created' }),
    );
  });

  it('saves nothing when the endpoint answers with an error status', async () => {
    const before = await prisma.outboundWebhook.count({
      where: { businessId },
    });
    mockedAxios.post.mockResolvedValue({ status: 500 });
    await expect(
      service.subscribeValidated(businessId, dto),
    ).rejects.toMatchObject({
      response: { code: 'WEBHOOK_ENDPOINT_REJECTED' },
    });
    expect(await prisma.outboundWebhook.count({ where: { businessId } })).toBe(
      before,
    );
  });

  it('saves nothing when the endpoint cannot be reached', async () => {
    const before = await prisma.outboundWebhook.count({
      where: { businessId },
    });
    mockedAxios.post.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(
      service.subscribeValidated(businessId, dto),
    ).rejects.toMatchObject({
      response: { code: 'WEBHOOK_ENDPOINT_UNREACHABLE' },
    });
    expect(await prisma.outboundWebhook.count({ where: { businessId } })).toBe(
      before,
    );
  });

  it('retries one failed delivery with the same payload under a fresh queue key', async () => {
    const webhook = await prisma.outboundWebhook.findFirstOrThrow({
      where: { businessId },
    });
    const failed = await prisma.outboundWebhookDelivery.create({
      data: {
        webhookId: webhook.id,
        payload: { trigger: 'sale' },
        status: 'failed',
        attempts: 5,
        error: 'timeout',
      },
    });
    await service.retryDelivery(failed.id);
    const after = await prisma.outboundWebhookDelivery.findUniqueOrThrow({
      where: { id: failed.id },
    });
    expect(after).toMatchObject({
      status: 'pending',
      attempts: 0,
      error: null,
    });
    expect(addJob).toHaveBeenCalledWith(
      expect.anything(),
      'deliver',
      { deliveryId: failed.id },
      expect.stringContaining(`retry-${failed.id}-`),
    );
  });

  it('cannot retry a delivery that does not exist', async () => {
    await expect(
      service.retryDelivery('00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow('Delivery not found');
  });

  it('deleting a webhook removes its delivery history with it instead of failing on the foreign key', async () => {
    const webhook = await prisma.outboundWebhook.findFirstOrThrow({
      where: { businessId },
    });
    expect(
      await prisma.outboundWebhookDelivery.count({
        where: { webhookId: webhook.id },
      }),
    ).toBeGreaterThan(0);
    await service.unsubscribe(webhook.id);
    expect(
      await prisma.outboundWebhook.count({ where: { id: webhook.id } }),
    ).toBe(0);
    expect(
      await prisma.outboundWebhookDelivery.count({
        where: { webhookId: webhook.id },
      }),
    ).toBe(0);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'integration.webhook_deleted' }),
    );
  });
});
