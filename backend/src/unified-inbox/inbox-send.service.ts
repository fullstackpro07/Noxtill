import { HttpStatus, Injectable } from '@nestjs/common';
import {
  InboxConversation,
  InboxMessage,
  MessageChannel,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SendGateService } from '../messaging/send-gate.service';
import { SocialInboxService } from '../social/social-inbox.service';
import { WhatsappWindowService } from '../whatsapp/whatsapp-window.service';
import { AppException } from '../common/filters/app.exception';
import {
  channelDef,
  INBOX_ERROR_CODES,
  isMessagingChannel,
} from './inbox.constants';
import { Actor, InboxCoreService } from './inbox-core.service';

/**
 * The only way anything leaves the inbox. WhatsApp/SMS/email go through `SendGateService` (quota,
 * template approval, channel resolution, the send queue); social replies go through the social
 * connector via `SocialInboxService.reply`. No new sending path exists here.
 */
@Injectable()
export class InboxSendService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sendGate: SendGateService,
    private readonly socialInbox: SocialInboxService,
    private readonly window: WhatsappWindowService,
    private readonly core: InboxCoreService,
  ) {}

  /** Why this conversation cannot receive a reply right now, or null when it can. */
  async cannotSendReason(
    conversation: InboxConversation,
  ): Promise<string | null> {
    const def = channelDef(conversation.channel);
    if (def.transport === 'none')
      return `${def.label} has no connection in Noxtill, so replies cannot be sent from here.`;
    if (def.transport === 'social') {
      const latest = await this.latestSocialItem(conversation.id);
      if (!latest)
        return 'There is no incoming message on this conversation to reply to.';
      const account = await this.prisma.socialAccount.findFirst({
        where: {
          businessId: conversation.businessId,
          platform: def.platform,
          status: 'connected',
        },
      });
      if (!account)
        return `${def.short} is not connected, so a reply cannot be posted.`;
    }
    return null;
  }

  /** WhatsApp only: whether a free-form reply is inside Meta's 24-hour customer-service window. */
  async whatsappWindowOpen(
    conversation: InboxConversation,
  ): Promise<boolean | null> {
    if (conversation.channel !== 'whatsapp') return null;
    if (!conversation.customerId) return null;
    return this.window.isOpen(conversation.businessId, conversation.customerId);
  }

  /** A customer WhatsApp message opens Meta's 24-hour free-form reply window. */
  refreshWhatsappWindow(businessId: string, customerId: string) {
    return this.window.refresh(businessId, customerId);
  }

  async send(
    conversation: InboxConversation,
    text: string,
    actor: Actor,
    source: string,
  ): Promise<InboxMessage> {
    const reason = await this.cannotSendReason(conversation);
    if (reason)
      throw new AppException(
        INBOX_ERROR_CODES.CHANNEL_CANNOT_SEND,
        reason,
        HttpStatus.BAD_REQUEST,
      );

    const businessId = conversation.businessId;
    let messageId: string | null = null;
    let note: string | null = null;

    try {
      if (isMessagingChannel(conversation.channel)) {
        const channel = conversation.channel;
        const customer = conversation.customerId
          ? await this.prisma.customer.findFirst({
              where: { id: conversation.customerId, businessId },
              select: { id: true, phone: true, email: true },
            })
          : null;
        const customerReachable =
          customer &&
          (channel === 'email' ? !!customer.email : !!customer.phone);
        const queued = await this.sendGate.send({
          businessId,
          templateKey: 'inbox_reply',
          variables: { message: text },
          channel,
          ...(customerReachable
            ? { customerId: customer.id }
            : {
                to:
                  channel === 'email'
                    ? { email: conversation.contactHandle }
                    : { phone: conversation.contactHandle },
              }),
        });
        messageId = queued.id;
        if (queued.channel !== channel)
          note = `Sent by ${queued.channel} because this contact has no ${channel} details.`;
      } else {
        const item = await this.latestSocialItem(conversation.id);
        await this.socialInbox.reply(
          businessId,
          item!.socialInboxItemId!,
          text,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sending failed';
      await this.prisma.inboxMessage.create({
        data: {
          businessId,
          conversationId: conversation.id,
          kind: 'out',
          body: text,
          authorUserId: actor.userId,
          authorName: actor.name,
          source,
          sendError: message.slice(0, 500),
        },
      });
      throw error;
    }

    const out = await this.prisma.inboxMessage.create({
      data: {
        businessId,
        conversationId: conversation.id,
        kind: 'out',
        body: text,
        authorUserId: actor.userId,
        authorName: actor.name,
        messageId,
        source,
      },
    });
    if (note) await this.core.threadEvent(businessId, conversation.id, note);
    await this.core.afterOutbound(conversation, text, out.createdAt);
    return out;
  }

  private latestSocialItem(conversationId: string) {
    return this.prisma.inboxMessage.findFirst({
      where: { conversationId, kind: 'in', socialInboxItemId: { not: null } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
