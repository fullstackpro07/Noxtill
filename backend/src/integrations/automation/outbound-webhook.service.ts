import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { AUTOMATION_PROVIDERS } from './automation.constants';
import { IntegrationProvider, WorkflowTriggerKey } from '@prisma/client';

/**
 * Automation Platforms' subscription CRUD (UPD-BE-074) — a real REST-Hook-style registration, not
 * an OAuth connection: the platform (Zapier/Make/n8n) supplies the `targetUrl` it wants events
 * POSTed to; `secret` (generated here, shown once) is what it uses to verify the HMAC signature on
 * every delivery.
 */
@Injectable()
export class OutboundWebhookService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

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

  async unsubscribe(id: string) {
    const existing = await this.tenantPrisma.client.outboundWebhook.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Outbound webhook not found');
    await this.tenantPrisma.client.outboundWebhook.delete({ where: { id } });
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
}
