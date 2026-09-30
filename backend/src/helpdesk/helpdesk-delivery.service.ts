import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { HelpdeskTicket, InboxConversation } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { InboxSendService } from '../unified-inbox/inbox-send.service';
import { InboxChannelsService } from '../unified-inbox/inbox-channels.service';
import { normalizeHandle } from '../unified-inbox/inbox.constants';

export interface DeliveryResult {
  via: string;
  /** sent | failed | portal */
  delivery: 'sent' | 'failed' | 'portal';
  note: string;
  inboxMessageId: string | null;
  conversationId: string | null;
}

const INBOX_KEY: Record<string, string> = {
  Email: 'email',
  Web: 'email',
  Manual: 'email',
  WhatsApp: 'whatsapp',
  Phone: 'sms',
};
const INBOX_LABEL: Record<string, string> = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
};

/**
 * Everything the Helpdesk sends to a customer goes out through the Unified Inbox connections
 * (never a connection of its own): the ticket's conversation, or one started for the customer on
 * the ticket's channel. Portal tickets are answered in the customer portal only.
 */
@Injectable()
export class HelpdeskDeliveryService {
  private readonly logger = new Logger(HelpdeskDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly sender: InboxSendService,
    private readonly channels: InboxChannelsService,
    private readonly env: ConfigService,
  ) {}

  portalUrl(token: string): string {
    return `${(this.env.get<string>('FRONTEND_URL') ?? '').replace(/\/$/, '')}/support/t/${token}`;
  }

  helpCenterUrl(slug: string): string {
    return `${(this.env.get<string>('FRONTEND_URL') ?? '').replace(/\/$/, '')}/support/h/${slug}`;
  }

  /** Runs `fn` with the request tenant set to `businessId` (the branch that owns the connection). */
  inBusiness<T>(businessId: string, fn: () => Promise<T>): Promise<T> {
    return this.cls.run(async () => {
      this.cls.set(CLS_KEY_BUSINESS_ID, businessId);
      return fn();
    });
  }

  /** How a public reply on this ticket would reach the customer, and whether it can right now. */
  async route(t: HelpdeskTicket): Promise<{
    via: string;
    ok: boolean;
    why: string | null;
    conversationId: string | null;
  }> {
    if (t.channel === 'Portal')
      return {
        via: 'Customer Portal',
        ok: true,
        why: null,
        conversationId: null,
      };
    if (t.conversationId) {
      const conv = await this.prisma.inboxConversation.findUnique({
        where: { id: t.conversationId },
      });
      if (conv) {
        const reason = await this.sender
          .cannotSendReason(conv)
          .catch((e: Error) => e.message);
        return {
          via: this.label(conv.channel),
          ok: !reason,
          why: reason,
          conversationId: conv.id,
        };
      }
    }
    const key = INBOX_KEY[t.channel];
    if (!key)
      return {
        via: 'Social DM',
        ok: false,
        why: 'Social tickets can only be answered on the conversation they came in on, and this ticket has none.',
        conversationId: null,
      };
    const customer = await this.prisma.customer.findUnique({
      where: { id: t.customerId },
      select: { email: true, phone: true, name: true },
    });
    const handle = key === 'email' ? customer?.email : customer?.phone;
    if (!handle)
      return {
        via: INBOX_LABEL[key],
        ok: false,
        why: `${customer?.name ?? 'The customer'} has no ${key === 'email' ? 'email address' : 'phone number'} in Customers (CRM).`,
        conversationId: null,
      };
    const state = (await this.channels.states(t.branchId)).get(key);
    if (state && !state.send.ok)
      return {
        via: INBOX_LABEL[key],
        ok: false,
        why: state.send.how,
        conversationId: null,
      };
    return { via: INBOX_LABEL[key], ok: true, why: null, conversationId: null };
  }

  label(channel: string): string {
    return (
      INBOX_LABEL[channel] ??
      channel.charAt(0).toUpperCase() + channel.slice(1) + ' DM'
    );
  }

  /** The ticket's conversation, or one started for its customer in the ticket's branch. */
  private async conversation(
    t: HelpdeskTicket,
  ): Promise<InboxConversation | null> {
    if (t.conversationId) {
      const c = await this.prisma.inboxConversation.findUnique({
        where: { id: t.conversationId },
      });
      if (c) return c;
    }
    const key = INBOX_KEY[t.channel];
    if (!key) return null;
    const customer = await this.prisma.customer.findUnique({
      where: { id: t.customerId },
    });
    const raw = key === 'email' ? customer?.email : customer?.phone;
    if (!customer || !raw) return null;
    const handle = normalizeHandle(key, raw).slice(0, 191);
    const where = {
      businessId_channel_contactHandle: {
        businessId: t.branchId,
        channel: key,
        contactHandle: handle,
      },
    };
    const existing = await this.prisma.inboxConversation.findUnique({ where });
    if (existing) return existing;
    return this.prisma.inboxConversation.create({
      data: {
        businessId: t.branchId,
        channel: key,
        contactHandle: handle,
        contactName: customer.name.slice(0, 191),
        customerId: customer.businessId === t.branchId ? customer.id : null,
        assigneeUserId: t.agentUserId,
        lastMessageAt: new Date(),
      },
    });
  }

  /**
   * Sends a public reply. Never pretends: a reply that couldn't go out comes back `failed` with the
   * reason, and the ticket shows "Retry delivery".
   */
  async send(
    t: HelpdeskTicket,
    text: string,
    actor: { userId: string | null; name: string },
    hasAttachments = false,
  ): Promise<DeliveryResult> {
    if (t.channel === 'Portal')
      return {
        via: 'Customer Portal',
        delivery: 'portal',
        note: '✓ Posted to the customer portal',
        inboxMessageId: null,
        conversationId: null,
      };
    const route = await this.route(t);
    if (!route.ok)
      return {
        via: route.via,
        delivery: 'failed',
        note: `✕ Not delivered — ${route.why}`,
        inboxMessageId: null,
        conversationId: route.conversationId,
      };
    const conv = await this.conversation(t);
    if (!conv)
      return {
        via: route.via,
        delivery: 'failed',
        note: '✕ Not delivered — no conversation could be started for this customer.',
        inboxMessageId: null,
        conversationId: null,
      };
    const body = hasAttachments
      ? `${text}\n\nAttachments: ${this.portalUrl(t.portalToken)}`
      : text;
    try {
      const out = await this.inBusiness(conv.businessId, () =>
        this.sender.send(
          conv,
          body,
          { userId: actor.userId, name: actor.name },
          'helpdesk',
        ),
      );
      return {
        via: this.label(conv.channel),
        delivery: 'sent',
        note: `✓ Sent via ${this.label(conv.channel)} · Unified Inbox`,
        inboxMessageId: out.id,
        conversationId: conv.id,
      };
    } catch (e) {
      this.logger.warn(
        `helpdesk reply on ${t.number} failed: ${(e as Error).message}`,
      );
      return {
        via: this.label(conv.channel),
        delivery: 'failed',
        note: `✕ Delivery failed — ${(e as Error).message}`,
        inboxMessageId: null,
        conversationId: conv.id,
      };
    }
  }

  /** Plain text to the customer outside a reply (acknowledgement, CSAT survey). */
  async notice(t: HelpdeskTicket, text: string): Promise<DeliveryResult> {
    return this.send(t, text, { userId: null, name: 'Helpdesk' });
  }

  /** Provider status of a sent reply (queued → sent → delivered → read, or failed). */
  async statuses(
    inboxMessageIds: string[],
  ): Promise<Map<string, { status: string; error: string | null }>> {
    const out = new Map<string, { status: string; error: string | null }>();
    if (!inboxMessageIds.length) return out;
    const msgs = await this.prisma.inboxMessage.findMany({
      where: { id: { in: inboxMessageIds } },
      select: { id: true, messageId: true, sendError: true },
    });
    const ids = msgs.map((m) => m.messageId).filter((x): x is string => !!x);
    const rows = ids.length
      ? await this.prisma.message.findMany({
          where: { id: { in: ids } },
          select: { id: true, status: true },
        })
      : [];
    const st = new Map(rows.map((r) => [r.id, r.status as string]));
    for (const m of msgs)
      out.set(m.id, {
        status: m.messageId
          ? (st.get(m.messageId) ?? 'queued')
          : m.sendError
            ? 'failed'
            : 'sent',
        error: m.sendError,
      });
    return out;
  }
}
