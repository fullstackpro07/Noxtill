import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappWindowService } from '../whatsapp/whatsapp-window.service';
import { WEBHOOK_EVENTS_QUEUE } from './webhooks.constants';
import { MessageStatus } from '../../generated/prisma';

const META_STATUS_MAP: Record<string, MessageStatus> = {
  sent: MessageStatus.sent,
  delivered: MessageStatus.delivered,
  read: MessageStatus.read,
  failed: MessageStatus.failed,
};

const TWILIO_STATUS_MAP: Record<string, MessageStatus> = {
  sent: MessageStatus.sent,
  delivered: MessageStatus.delivered,
  read: MessageStatus.read,
  failed: MessageStatus.failed,
  undelivered: MessageStatus.failed,
};

const POSTMARK_STATUS_MAP: Record<string, MessageStatus> = {
  Delivery: MessageStatus.delivered,
  Open: MessageStatus.read,
  Bounce: MessageStatus.failed,
  SpamComplaint: MessageStatus.failed,
};

/**
 * Processes idempotency-gated webhook events off the queue (BE-019) — never
 * inline in the controller. Updates message delivery status by provider_ref,
 * and refreshes the WhatsApp 24h window on inbound customer replies.
 */
@Processor(WEBHOOK_EVENTS_QUEUE)
export class WebhookEventsProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookEventsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappWindow: WhatsappWindowService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'meta-status':
        return this.handleMetaStatus(
          job.data as { id: string; status: string },
        );
      case 'meta-inbound':
        return this.handleMetaInbound(job.data as { from: string });
      case 'twilio-status':
        return this.handleTwilioStatus(
          job.data as {
            MessageSid?: string;
            SmsSid?: string;
            MessageStatus: string;
          },
        );
      case 'email-event':
        return this.handleEmailEvent(
          job.data as { MessageID?: string; RecordType?: string },
        );
      default:
        this.logger.warn(`Unknown webhook job: ${job.name}`);
    }
  }

  private async handleMetaStatus(status: {
    id: string;
    status: string;
  }): Promise<void> {
    const mapped = META_STATUS_MAP[status.status];
    if (!mapped) return;
    await this.prisma.message
      .updateMany({
        where: { providerRef: status.id },
        data: { status: mapped },
      })
      .catch(() => undefined);
  }

  private async handleMetaInbound(message: { from: string }): Promise<void> {
    // No phone_number_id → business mapping yet (Module 18), so we match by phone across all
    // tenants — Customer.phone is only unique per-business, so this is a best-effort lookup.
    const customer = await this.prisma.customer.findFirst({
      where: { phone: message.from },
    });
    if (!customer) return;
    await this.whatsappWindow.refresh(customer.businessId, customer.id);
  }

  private async handleTwilioStatus(body: {
    MessageSid?: string;
    SmsSid?: string;
    MessageStatus: string;
  }): Promise<void> {
    const mapped = TWILIO_STATUS_MAP[body.MessageStatus];
    const providerRef = body.MessageSid ?? body.SmsSid;
    if (!mapped || !providerRef) return;
    await this.prisma.message
      .updateMany({ where: { providerRef }, data: { status: mapped } })
      .catch(() => undefined);
  }

  private async handleEmailEvent(body: {
    MessageID?: string;
    RecordType?: string;
  }): Promise<void> {
    if (!body.MessageID || !body.RecordType) return;
    const mapped = POSTMARK_STATUS_MAP[body.RecordType];
    if (!mapped) return;
    await this.prisma.message
      .updateMany({
        where: { providerRef: body.MessageID },
        data: { status: mapped },
      })
      .catch(() => undefined);
  }
}
