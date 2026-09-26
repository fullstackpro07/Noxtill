import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappWindowService } from '../whatsapp/whatsapp-window.service';
import { InboxAutomationService } from '../unified-inbox/inbox-automation.service';
import { WEBHOOK_EVENTS_QUEUE } from './webhooks.constants';
import { MessageStatus } from '@prisma/client';

interface MetaInboundMessage {
  from: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: { caption?: string };
  video?: { caption?: string };
  document?: { caption?: string; filename?: string };
  button?: { text?: string };
  interactive?: {
    button_reply?: { title?: string };
    list_reply?: { title?: string };
  };
  phoneNumberId?: string;
  contactName?: string;
}

/** Non-text WhatsApp messages are recorded honestly as what they were — media itself is not stored. */
function metaMessageText(m: MetaInboundMessage): string {
  if (m.text?.body) return m.text.body;
  if (m.button?.text) return m.button.text;
  const choice =
    m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title;
  if (choice) return choice;
  const caption =
    m.image?.caption ?? m.video?.caption ?? m.document?.caption ?? '';
  const kind = m.type ?? 'message';
  return `(sent ${kind === 'image' ? 'a photo' : kind === 'audio' ? 'a voice note' : `a ${kind}`} — media is not shown in Noxtill)${caption ? ` ${caption}` : ''}`;
}

function phoneHandle(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits ? `+${digits}` : raw;
}

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
    private readonly inbox: InboxAutomationService,
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
        return this.handleMetaInbound(job.data as MetaInboundMessage);
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
          job.data as {
            type?: string;
            from?: string;
            id?: string;
            text?: string;
          },
        );
      case 'telnyx-status':
        return this.handleTelnyxStatus(
          job.data as {
            messageId?: string;
            status?: string;
            hasErrors: boolean;
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
    await this.prisma.message
      .updateMany({
        where: { providerRef: status.id },
        data: { status: mapped },
      })
      .catch(() => undefined);
  }

  private async handleMetaInbound(message: MetaInboundMessage): Promise<void> {
    // Customer.phone is only unique per-business, so the cross-tenant phone match is best-effort.
    // Meta sends `from` as bare digits while customer phones are stored in E.164 (`+…`).
    const customer = await this.prisma.customer.findFirst({
      where: { phone: { in: [message.from, phoneHandle(message.from)] } },
    });
    if (customer) {
      await this.whatsappWindow.refresh(customer.businessId, customer.id);
    }

    // Unified Inbox: a business that connected its own WhatsApp number is identified exactly by
    // phone_number_id; on the shared platform number only a known customer ties it to a business.
    const own = message.phoneNumberId
      ? await this.prisma.integration.findFirst({
          where: {
            provider: 'whatsapp',
            status: 'connected',
            meta: { path: '$.phoneNumberId', equals: message.phoneNumberId },
          },
          select: { businessId: true },
        })
      : null;
    const businessId = own?.businessId ?? customer?.businessId;
    if (!businessId) return;
    const conversation = await this.inbox.ingest({
      businessId,
      channel: 'whatsapp',
      contactHandle: phoneHandle(message.from),
      contactName: message.contactName,
      text: metaMessageText(message),
      externalKey: message.id ? `whatsapp:${message.id}` : undefined,
      receivedAt: message.timestamp
        ? new Date(Number(message.timestamp) * 1000)
        : undefined,
      customerId: customer?.businessId === businessId ? customer.id : undefined,
    });
    if (conversation?.customerId && conversation.customerId !== customer?.id) {
      await this.whatsappWindow.refresh(businessId, conversation.customerId);
    }
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

  private async handleTelnyxInbound(message: {
    type?: string;
    from?: string;
    id?: string;
    text?: string;
  }): Promise<void> {
    if (!message.from) return;
    const customer = await this.prisma.customer.findFirst({
      where: { phone: { in: [message.from, phoneHandle(message.from)] } },
    });
    if (!customer) return;
    // Telnyx's WhatsApp product rides the same messaging window rule as Meta's — SMS/MMS have no
    // such window, so only refresh it for whatsapp-typed inbound messages.
    if (message.type === 'whatsapp') {
      await this.whatsappWindow.refresh(customer.businessId, customer.id);
    }
    await this.inbox.ingest({
      businessId: customer.businessId,
      channel: message.type === 'whatsapp' ? 'whatsapp' : 'sms',
      contactHandle: phoneHandle(message.from),
      text: message.text ?? '(message with no text)',
      externalKey: message.id ? `telnyx:${message.id}` : undefined,
      customerId: customer.id,
    });
  }

  private async handleTelnyxStatus(body: {
    messageId?: string;
    status?: string;
    hasErrors: boolean;
  }): Promise<void> {
    if (!body.messageId) return;
    const mapped = body.hasErrors
      ? MessageStatus.failed
      : body.status
        ? TELNYX_STATUS_MAP[body.status]
        : undefined;
    if (!mapped) return;
    await this.prisma.message
      .updateMany({
        where: { providerRef: body.messageId },
        data: { status: mapped },
      })
      .catch(() => undefined);
  }

  private async handleEmailEvent(body: {
    type?: string;
    data?: { email_id?: string };
  }): Promise<void> {
    const emailId = body.data?.email_id;
    if (!emailId || !body.type) return;
    const mapped = RESEND_STATUS_MAP[body.type];
    if (!mapped) return;
    await this.prisma.message
      .updateMany({
        where: { providerRef: emailId },
        data: { status: mapped },
      })
      .catch(() => undefined);
  }
}
