import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../../common/tenancy/tenant.constants';
import { OutboundWebhookService } from './outbound-webhook.service';
import { IntegrationProvider, WorkflowTriggerKey } from '@prisma/client';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('OutboundWebhookService (UPD-BE-074)', () => {
  let prisma: PrismaService;
  let service: OutboundWebhookService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new OutboundWebhookService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Outbound Webhook Test Biz',
        slug: `outbound-webhook-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.outboundWebhookDelivery.deleteMany({
      where: { webhook: { businessId } },
    });
    await prisma.outboundWebhook.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('subscribes with a real generated secret, never a blank/predictable one', async () => {
    const sub = await service.subscribe(businessId, {
      provider: IntegrationProvider.zapier,
      triggerKey: WorkflowTriggerKey.sale,
      targetUrl: 'https://hooks.zapier.com/hooks/catch/123/abc',
    });
    expect(sub.secret).toHaveLength(64); // 32 random bytes, hex-encoded
    expect(sub.active).toBe(true);

    const listed = await service.list();
    expect(listed.some((w) => w.id === sub.id)).toBe(true);
  });

  it('lists real deliveries for a subscription, most recent first', async () => {
    const sub = await service.subscribe(businessId, {
      provider: IntegrationProvider.make,
      triggerKey: WorkflowTriggerKey.low_stock,
      targetUrl: 'https://hook.make.com/abc',
    });
    await prisma.outboundWebhookDelivery.create({
      data: { webhookId: sub.id, payload: { first: true }, status: 'success' },
    });
    await prisma.outboundWebhookDelivery.create({
      data: { webhookId: sub.id, payload: { second: true }, status: 'failed' },
    });

    const deliveries = await service.deliveries(sub.id);
    expect(deliveries).toHaveLength(2);
    expect((deliveries[0].payload as Record<string, unknown>).second).toBe(
      true,
    );
  });

  it('rejects deliveries lookup for a subscription that does not exist', async () => {
    await expect(service.deliveries('no-such-id')).rejects.toThrow();
  });

  it('unsubscribes a real webhook and rejects removing it twice', async () => {
    const sub = await service.subscribe(businessId, {
      provider: IntegrationProvider.n8n,
      triggerKey: WorkflowTriggerKey.birthday,
      targetUrl: 'https://n8n.example.com/webhook/xyz',
    });
    await service.unsubscribe(sub.id);
    await expect(service.unsubscribe(sub.id)).rejects.toThrow();
  });
});
