import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappWindowService } from '../whatsapp/whatsapp-window.service';
import { WEBHOOK_EVENTS_QUEUE } from './webhooks.constants';
import { EmailEventType, MessageChannel, MessageStatus } from '@prisma/client';
import { normalizePhoneE164 } from '../common/utils/phone.util';

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

const TELNYX_STATUS_MAP: Record<string, MessageStatus> = {
  queued: MessageStatus.sent,
  sending: MessageStatus.sent,
  sent: MessageStatus.sent,
  delivered: MessageStatus.delivered,
  read: MessageStatus.read,
  failed: MessageStatus.failed,
  delivery_failed: MessageStatus.failed,
};

const RESEND_STATUS_MAP: Record<string, MessageStatus> = {
  'email.sent': MessageStatus.sent,
  'email.delivered': MessageStatus.delivered,
  'email.opened': MessageStatus.read,
  'email.bounced': MessageStatus.failed,
  'email.complained': MessageStatus.failed,
};

/** Resend webhook event → campaign funnel event. */
const RESEND_CAMPAIGN_EVENT_MAP: Record<string, EmailEventType> = {
  'email.delivered': EmailEventType.delivered,
  'email.opened': EmailEventType.open,
  'email.clicked': EmailEventType.click,
  'email.bounced': EmailEventType.bounce,
};

const STATUS_ORDER: Record<MessageStatus, number> = {
  [MessageStatus.queued]: 0,
  [MessageStatus.sent]: 1,
  [MessageStatus.failed]: 2,
  [MessageStatus.delivered]: 3,
  [MessageStatus.read]: 4,
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
        return this.handleMetaInbound(
          job.data as { from?: string; context?: { id?: string } },
        );
      case 'twilio-status':
        return this.handleTwilioStatus(
          job.data as {
            MessageSid?: string;
            SmsSid?: string;
            MessageStatus: string;
          },
        );
      case 'telnyx-inbound':
        return this.handleTelnyxInbound(
          job.data as { type?: string; from?: string },
        );
      case 'telnyx-status':
        return this.handleTelnyxStatus(
          job.data as {
            messageId?: string;
            status?: string;
            hasErrors: boolean;
            type?: string;
          },
        );
      case 'email-event':
        return this.handleEmailEvent(
          job.data as { type?: string; data?: { email_id?: string } },
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
    await this.applyProviderStatus(status.id, MessageChannel.whatsapp, mapped);
  }

  private async handleMetaInbound(message: {
    from?: string;
    context?: { id?: string };
  }): Promise<void> {
    const sender = message.from?.trim();
    if (!sender) return;

    const contextMessageId = message.context?.id?.trim();
    if (!contextMessageId) {
      await this.refreshUniqueCustomerWindow(sender);
      return;
    }

    // Meta supplies context.id when an inbound WhatsApp message replies to an earlier
    // message. Resolve that provider reference to the exact tenant/customer instead of
    // guessing from a phone number that may exist in more than one business.
    const candidates = await this.prisma.message.findMany({
      where: {
        providerRef: contextMessageId,
        channel: MessageChannel.whatsapp,
        customerId: { not: null },
      },
      orderBy: [{ id: 'asc' }],
      take: 2,
      select: {
        businessId: true,
        customer: { select: { id: true, phone: true, status: true } },
        business: { select: { country: true } },
      },
    });
    if (candidates.length !== 1) return;

    const [candidate] = candidates;
    const customer = candidate.customer;
    if (!customer || customer.status !== 'active') return;
    const senderE164 = normalizePhoneE164(
      sender,
      candidate.business.country ?? undefined,
    );
    const customerE164 = normalizePhoneE164(
      customer.phone,
      candidate.business.country ?? undefined,
    );
    if (!senderE164 || senderE164 !== customerE164) return;

    await this.whatsappWindow.refresh(candidate.businessId, customer.id);
  }

  private async handleTwilioStatus(body: {
    MessageSid?: string;
    SmsSid?: string;
    MessageStatus: string;
  }): Promise<void> {
    const mapped = TWILIO_STATUS_MAP[body.MessageStatus];
    const providerRef = body.MessageSid ?? body.SmsSid;
    if (!mapped || !providerRef) return;
    await this.applyProviderStatus(providerRef, MessageChannel.sms, mapped);
  }

  private async handleTelnyxInbound(message: {
    type?: string;
    from?: string;
  }): Promise<void> {
    if (!message.from) return;
    // Telnyx's WhatsApp product rides the same messaging window rule as Meta's — SMS/MMS have no
    // such window, so only refresh it for whatsapp-typed inbound messages.
    if (message.type === 'whatsapp') {
      await this.refreshUniqueCustomerWindow(message.from);
    }
  }

  /**
   * There is no inbound-phone-number-to-business mapping yet. Customer.phone is only unique
   * inside a business, so refresh the WhatsApp window only when exactly one active CRM customer
   * owns the sender number. Ambiguous phone matches must not refresh an arbitrary tenant's window.
   */
  private async refreshUniqueCustomerWindow(phone: string) {
    const customers = await this.prisma.customer.findMany({
      where: { phone, status: 'active' },
      orderBy: [{ id: 'asc' }],
      take: 2,
      select: { id: true, businessId: true },
    });
    if (customers.length !== 1) return;
    const customer = customers[0];
    await this.whatsappWindow.refresh(customer.businessId, customer.id);
  }

  private async handleTelnyxStatus(body: {
    messageId?: string;
    status?: string;
    hasErrors: boolean;
    type?: string;
  }): Promise<void> {
    if (!body.messageId) return;
    const channel = this.telnyxChannel(body.type);
    if (!channel) return;
    const mapped = body.hasErrors
      ? MessageStatus.failed
      : body.status
        ? TELNYX_STATUS_MAP[body.status]
        : undefined;
    if (!mapped) return;
    await this.applyProviderStatus(body.messageId, channel, mapped);
  }

  private telnyxChannel(type?: string): MessageChannel | null {
    const normalized = type?.trim().toLowerCase();
    if (normalized?.includes('whatsapp')) return MessageChannel.whatsapp;
    if (
      normalized === 'sms' ||
      normalized === 'mms' ||
      normalized?.includes('sms') ||
      normalized?.includes('mms')
    ) {
      return MessageChannel.sms;
    }
    return null;
  }

  /**
   * Provider callbacks can arrive late or out of order. Advance only to an equal or
   * stronger persisted state, and constrain matching by channel because provider IDs
   * belong to different namespaces. A confirmed delivery/read cannot regress to sent
   * or failed; a later provider-confirmed delivery can correct an earlier failure.
   */
  private async applyProviderStatus(
    providerRef: string,
    channel: MessageChannel,
    next: MessageStatus,
  ) {
    const allowedPrevious = Object.values(MessageStatus).filter(
      (current) => STATUS_ORDER[current] <= STATUS_ORDER[next],
    );
    await this.prisma.message.updateMany({
      where: {
        providerRef,
        channel,
        status: { in: allowedPrevious },
      },
      data: { status: next },
    });
  }

  private async handleEmailEvent(body: {
    type?: string;
    data?: { email_id?: string };
  }): Promise<void> {
    const emailId = body.data?.email_id;
    if (!emailId || !body.type) return;
    const mapped = RESEND_STATUS_MAP[body.type];
    if (mapped) {
      await this.applyProviderStatus(emailId, MessageChannel.email, mapped);
    }
    await this.recordCampaignEmailEvent(emailId, body.type);
  }

  /**
   * Campaign funnel (delivered / opened / clicked / bounced): maps the provider message id back to
   * the campaign's `sent` row and records one event per type per sent email.
   */
  private async recordCampaignEmailEvent(
    emailId: string,
    providerType: string,
  ): Promise<void> {
    const type = RESEND_CAMPAIGN_EVENT_MAP[providerType];
    if (!type) return;
    const sent = await this.prisma.emailEvent.findFirst({
      where: { providerRef: emailId, type: EmailEventType.sent },
      select: { emailCampaignId: true, recipient: true },
    });
    if (!sent) return;
    const existing = await this.prisma.emailEvent.findFirst({
      where: { providerRef: emailId, type },
      select: { id: true },
    });
    if (existing) return;
    await this.prisma.emailEvent.create({
      data: {
        emailCampaignId: sent.emailCampaignId,
        recipient: sent.recipient,
        type,
        providerRef: emailId,
      },
    });
  }
}
