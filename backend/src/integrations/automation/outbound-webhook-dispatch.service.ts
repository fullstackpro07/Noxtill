import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { QueueService } from '../../common/queue/queue.service';
import { mapActivityEventToTriggerKey } from '../../marketing/automations/workflow-trigger-map.util';
import { OUTBOUND_WEBHOOK_QUEUE } from './automation.constants';
import { ActivityEventType } from '@prisma/client';

export interface OutboundWebhookTriggerEvent {
  description: string;
  entityType?: string | null;
  entityId?: string | null;
  amount?: number | null;
}

/**
 * Automation Platforms' dispatch (UPD-BE-074) — called from `ActivityService.record()` exactly
 * like `WorkflowTriggerService`, fire-and-forget for the same reason (see that class's doc
 * comment): a business's outbound webhook target being slow/unreachable must never block the real
 * mutation that triggered it. Delivery itself (retry/backoff/logging) happens in the BullMQ
 * processor, not here — this only decides *which* subscriptions match and enqueues one delivery
 * job per match.
 */
@Injectable()
export class OutboundWebhookDispatchService {
  private readonly logger = new Logger(OutboundWebhookDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    @InjectQueue(OUTBOUND_WEBHOOK_QUEUE) private readonly queue: Queue,
  ) {}

  async dispatch(
    businessId: string,
    type: ActivityEventType,
    event: OutboundWebhookTriggerEvent,
  ): Promise<void> {
    const triggerKey = mapActivityEventToTriggerKey(type, event.description);
    if (!triggerKey) return;

    const subscriptions = await this.prisma.outboundWebhook.findMany({
      where: { businessId, triggerKey, active: true },
    });
    if (subscriptions.length === 0) return;

    for (const subscription of subscriptions) {
      const delivery = await this.prisma.outboundWebhookDelivery.create({
        data: {
          webhookId: subscription.id,
          payload: {
            trigger: triggerKey,
            description: event.description,
            entityType: event.entityType ?? null,
            entityId: event.entityId ?? null,
            amount: event.amount ?? null,
            occurredAt: new Date().toISOString(),
          },
        },
      });

      await this.queueService
        .addJob(this.queue, 'deliver', { deliveryId: delivery.id }, delivery.id)
        .catch((error: Error) =>
          this.logger.warn(
            `Failed to enqueue outbound webhook delivery ${delivery.id}: ${error.message}`,
          ),
        );
    }
  }
}
