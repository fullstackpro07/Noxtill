import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { createHmac } from 'crypto';
import axios from 'axios';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  OUTBOUND_WEBHOOK_QUEUE,
  OUTBOUND_WEBHOOK_SIGNATURE_HEADER,
} from '../automation.constants';

export interface OutboundWebhookJobData {
  deliveryId: string;
}

/**
 * Real delivery attempt (UPD-BE-074) — HMAC-SHA256-signs the raw JSON body with the
 * subscription's own `secret` so the receiving platform can verify authenticity, same convention
 * every inbound webhook handler in this codebase already expects from *its* providers. Retry/
 * backoff is BullMQ's own `DEFAULT_JOB_OPTIONS` (5 attempts, exponential backoff) applied when the
 * job was enqueued — this processor's job is real HTTP delivery plus updating the
 * `OutboundWebhookDelivery` row on every attempt so failures are never silent.
 */
@Processor(OUTBOUND_WEBHOOK_QUEUE)
export class OutboundWebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(OutboundWebhookProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<OutboundWebhookJobData>): Promise<void> {
    const delivery = await this.prisma.outboundWebhookDelivery.findUnique({
      where: { id: job.data.deliveryId },
      include: { webhook: true },
    });
    if (!delivery) return; // deleted mid-flight — nothing to deliver

    const body = JSON.stringify(delivery.payload);
    const signature = createHmac('sha256', delivery.webhook.secret)
      .update(body)
      .digest('hex');

    try {
      const response = await axios.post(delivery.webhook.targetUrl, body, {
        headers: {
          'Content-Type': 'application/json',
          [OUTBOUND_WEBHOOK_SIGNATURE_HEADER]: signature,
        },
        timeout: 10_000,
        validateStatus: (status) => status >= 200 && status < 300,
      });

      await this.prisma.outboundWebhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'success',
          attempts: { increment: 1 },
          lastAttemptAt: new Date(),
          responseStatus: response.status,
          error: null,
        },
      });
    } catch (error) {
      const err = error as { message: string; response?: { status: number } };
      const exhausted = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

      await this.prisma.outboundWebhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: exhausted ? 'failed' : 'pending',
          attempts: { increment: 1 },
          lastAttemptAt: new Date(),
          responseStatus: err.response?.status,
          error: err.message,
        },
      });

      if (exhausted) {
        this.logger.warn(
          `Outbound webhook delivery ${delivery.id} exhausted retries: ${err.message}`,
        );
        return; // don't rethrow — BullMQ would otherwise mark this final attempt failed too
      }
      throw error; // rethrow so BullMQ retries with its configured backoff
    }
  }
}
