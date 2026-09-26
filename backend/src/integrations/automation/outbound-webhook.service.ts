import {
  HttpStatus,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import axios from 'axios';
import { createHmac, randomBytes } from 'crypto';
import { AppException } from '../../common/filters/app.exception';
import { AuditService } from '../../common/audit/audit.service';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { QueueService } from '../../common/queue/queue.service';
import {
  AUTOMATION_PROVIDERS,
  OUTBOUND_WEBHOOK_QUEUE,
  OUTBOUND_WEBHOOK_SIGNATURE_HEADER,
} from './automation.constants';
import { IntegrationProvider, WorkflowTriggerKey } from '@prisma/client';

/**
 * Automation Platforms' subscription CRUD (UPD-BE-074) — a real REST-Hook-style registration, not
 * an OAuth connection: the platform (Zapier/Make/n8n) supplies the `targetUrl` it wants events
 * POSTed to; `secret` (generated here, shown once) is what it uses to verify the HMAC signature on
 * every delivery.
 */
@Injectable()
export class OutboundWebhookService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly queueService: QueueService,
    @InjectQueue(OUTBOUND_WEBHOOK_QUEUE) private readonly queue: Queue,
    @Optional() private readonly audit?: AuditService,
  ) {}

  /** `providers` defaults to the automation-platform set (UPD-BE-074); the Developer & API's own webhooks (UPD-BE-081) pass `[IntegrationProvider.developer]` instead — same table, same delivery pipeline, different provider filter. */
  list(providers: IntegrationProvider[] = AUTOMATION_PROVIDERS) {
    return this.tenantPrisma.client.outboundWebhook.findMany({
      where: { provider: { in: providers } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async subscribe(
    businessId: string,
    dto: {
      provider: IntegrationProvider;
      triggerKey: WorkflowTriggerKey;
      targetUrl: string;
    },
  ) {
    return this.tenantPrisma.client.outboundWebhook.create({
      data: {
        businessId,
        provider: dto.provider,
        triggerKey: dto.triggerKey,
        targetUrl: dto.targetUrl,
        secret: randomBytes(32).toString('hex'),
      },
    });
  }

  /**
   * Developer webhooks (Integrations redesign) — the endpoint is validated before it goes live: a
   * signed `validation` event is POSTed and the endpoint must answer 2xx within 10 seconds, or the
   * subscription is refused and nothing is saved. The signing secret is returned once.
   */
  async subscribeValidated(
    businessId: string,
    dto: {
      provider: IntegrationProvider;
      triggerKey: WorkflowTriggerKey;
      targetUrl: string;
    },
  ) {
    const secret = randomBytes(32).toString('hex');
    const payload = {
      trigger: dto.triggerKey,
      test: true,
      validation: true,
      description: 'Endpoint validation from Noxtill',
      occurredAt: new Date().toISOString(),
    };
    const body = JSON.stringify(payload);
    let responseStatus: number;
    try {
      const response = await axios.post(dto.targetUrl, body, {
        headers: {
          'Content-Type': 'application/json',
          [OUTBOUND_WEBHOOK_SIGNATURE_HEADER]: createHmac('sha256', secret)
            .update(body)
            .digest('hex'),
        },
        timeout: 10_000,
        validateStatus: () => true,
      });
      responseStatus = response.status;
    } catch (error) {
      throw new AppException(
        'WEBHOOK_ENDPOINT_UNREACHABLE',
        `Noxtill could not reach that endpoint: ${(error as Error).message}. Nothing was saved.`,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (responseStatus < 200 || responseStatus >= 300) {
      throw new AppException(
        'WEBHOOK_ENDPOINT_REJECTED',
        `The endpoint answered ${responseStatus}; it must answer 2xx to a validation event. Nothing was saved.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const webhook = await this.tenantPrisma.client.outboundWebhook.create({
      data: {
        businessId,
        provider: dto.provider,
        triggerKey: dto.triggerKey,
        targetUrl: dto.targetUrl,
        secret,
      },
    });
    await this.tenantPrisma.client.outboundWebhookDelivery.create({
      data: {
        webhookId: webhook.id,
        payload,
        status: 'success',
        attempts: 1,
        lastAttemptAt: new Date(),
        responseStatus,
      },
    });
    await this.audit?.log({
      entity: 'Integration',
      entityId: 'webhooks',
      action: 'integration.webhook_created',
      after: { triggerKey: dto.triggerKey, targetUrl: dto.targetUrl },
    });
    return webhook;
  }

  /** Re-attempts one delivery (the per-row "Retry" on the Developer tab) with the same payload. */
  async retryDelivery(deliveryId: string) {
    const delivery =
      await this.tenantPrisma.client.outboundWebhookDelivery.findUnique({
        where: { id: deliveryId },
      });
    if (!delivery) throw new NotFoundException('Delivery not found');
    // The webhook lookup is tenant-scoped, so a delivery of another business is a 404 too.
    const webhook = await this.tenantPrisma.client.outboundWebhook.findUnique({
      where: { id: delivery.webhookId },
    });
    if (!webhook) throw new NotFoundException('Delivery not found');

    await this.tenantPrisma.client.outboundWebhookDelivery.update({
      where: { id: deliveryId },
      data: { status: 'pending', attempts: 0, error: null },
    });
    await this.queueService.addJob(
      this.queue,
      'deliver',
      { deliveryId },
      `retry-${deliveryId}-${Date.now()}`,
    );
    return { retried: true };
  }

  async unsubscribe(id: string) {
    const existing = await this.tenantPrisma.client.outboundWebhook.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Outbound webhook not found');
    // Deliveries reference the webhook with ON DELETE RESTRICT, so its history goes first — the
    // subscription and its delivery log are removed together, never half-way.
    await this.tenantPrisma.client.$transaction([
      this.tenantPrisma.client.outboundWebhookDelivery.deleteMany({
        where: { webhookId: id },
      }),
      this.tenantPrisma.client.outboundWebhook.delete({ where: { id } }),
    ]);
    await this.audit?.log({
      entity: 'Integration',
      entityId:
        existing.provider === IntegrationProvider.developer
          ? 'webhooks'
          : existing.provider,
      action: 'integration.webhook_deleted',
      after: { triggerKey: existing.triggerKey, targetUrl: existing.targetUrl },
    });
    return { success: true };
  }

  async deliveries(webhookId: string) {
    const existing = await this.tenantPrisma.client.outboundWebhook.findUnique({
      where: { id: webhookId },
    });
    if (!existing) throw new NotFoundException('Outbound webhook not found');
    return this.tenantPrisma.client.outboundWebhookDelivery.findMany({
      where: { webhookId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /**
   * Connection Detail / Automation Platforms depth fix — a genuinely real test delivery: the same
   * `OutboundWebhookDelivery` row + BullMQ job + HMAC-signed real HTTP POST to the subscriber's
   * real `targetUrl` that a live trigger would produce, just carrying a payload honestly labelled
   * `test: true` rather than a fabricated real business event.
   */
  async test(webhookId: string) {
    const webhook = await this.tenantPrisma.client.outboundWebhook.findUnique({
      where: { id: webhookId },
    });
    if (!webhook) throw new NotFoundException('Outbound webhook not found');

    const delivery =
      await this.tenantPrisma.client.outboundWebhookDelivery.create({
        data: {
          webhookId,
          payload: {
            trigger: webhook.triggerKey,
            test: true,
            description: 'Test event from Noxtill',
            occurredAt: new Date().toISOString(),
          },
        },
      });
    await this.queueService.addJob(
      this.queue,
      'deliver',
      { deliveryId: delivery.id },
      delivery.id,
    );
    return delivery;
  }

  /**
   * Connection Detail depth fix — the real "Sync now" action for automation platforms: they have
   * no OAuth connection to sync, but a real, meaningful action does exist — re-attempting every
   * real delivery that previously failed, for this business's active subscriptions on this
   * provider. Resets each one to `pending` and re-enqueues it with a fresh idempotency key (a
   * retry, not a duplicate of the original attempt, which BullMQ would otherwise dedupe against).
   */
  async retryFailedDeliveries(
    businessId: string,
    provider: IntegrationProvider,
  ): Promise<{ retried: number }> {
    const subscriptions =
      await this.tenantPrisma.client.outboundWebhook.findMany({
        where: { businessId, provider, active: true },
        select: { id: true },
      });
    if (subscriptions.length === 0) return { retried: 0 };

    const failed =
      await this.tenantPrisma.client.outboundWebhookDelivery.findMany({
        where: {
          webhookId: { in: subscriptions.map((s) => s.id) },
          status: 'failed',
        },
      });

    for (const delivery of failed) {
      await this.tenantPrisma.client.outboundWebhookDelivery.update({
        where: { id: delivery.id },
        data: { status: 'pending', attempts: 0, error: null },
      });
      await this.queueService.addJob(
        this.queue,
        'deliver',
        { deliveryId: delivery.id },
        `retry-${delivery.id}-${Date.now()}`,
      );
    }
    return { retried: failed.length };
  }
}
