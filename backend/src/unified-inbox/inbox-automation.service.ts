import { Injectable, Logger } from '@nestjs/common';
import { InboxConversation, InboxRule, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  INBOX_EVENT,
  MONEY_WORDS,
  isMessagingChannel,
  mentionsAny,
  normalizeHandle,
} from './inbox.constants';
import { InboxCoreService } from './inbox-core.service';
import { InboxSettingsService } from './inbox-settings.service';
import { InboxSendService } from './inbox-send.service';
import { InboxAiService } from './inbox-ai.service';
import {
  hasHours,
  isWithinHours,
  workingMinutesBetween,
} from './inbox-hours.util';

export interface InboundInput {
  businessId: string;
  channel: string;
  contactHandle: string;
  contactName?: string | null;
  text: string;
  externalKey?: string;
  socialInboxItemId?: string;
  receivedAt?: Date;
  customerId?: string | null;
  /** Old history being mirrored in (social backfill): tag it, but don't alert, auto-reply or draft. */
  backfill?: boolean;
}

const ONE_HOUR = 3600000;

/**
 * Everything that happens on its own: taking a customer message in, the rules that run on it, and
 * the two-minute tick (unanswered flags, unassigned alerts, snooze wake-ups, social mirroring).
 * Raw PrismaService + explicit businessId — this runs from webhook and queue processors.
 */
@Injectable()
export class InboxAutomationService {
  private readonly logger = new Logger(InboxAutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly core: InboxCoreService,
    private readonly settings: InboxSettingsService,
    private readonly sender: InboxSendService,
    private readonly ai: InboxAiService,
  ) {}

  async ingest(input: InboundInput): Promise<InboxConversation | null> {
    const { businessId } = input;
    const text = input.text.trim() || '(empty message)';
    const receivedAt = input.receivedAt ?? new Date();
    const handle = normalizeHandle(input.channel, input.contactHandle).slice(
      0,
      191,
    );
    if (!handle) return null;

    if (
      input.externalKey &&
      (await this.prisma.inboxMessage.findUnique({
        where: { externalKey: input.externalKey },
      }))
    )
      return null;
    if (
      input.socialInboxItemId &&
      (await this.prisma.inboxMessage.findUnique({
        where: { socialInboxItemId: input.socialInboxItemId },
      }))
    )
      return null;

    const customerId =
      input.customerId ??
      (await this.matchCustomer(businessId, input.channel, handle));
    const customerName = customerId
      ? (
          await this.prisma.customer.findUnique({
            where: { id: customerId },
            select: { name: true },
          })
        )?.name
      : null;
    const contactName = (
      input.contactName?.trim() ||
      customerName ||
      handle
    ).slice(0, 191);

    const existing = await this.prisma.inboxConversation.findUnique({
      where: {
        businessId_channel_contactHandle: {
          businessId,
          channel: input.channel,
          contactHandle: handle,
        },
      },
    });

    let conversation: InboxConversation;
    if (!existing) {
      const assigneeUserId = await this.pickAssignee(businessId);
      conversation = await this.prisma.inboxConversation.create({
        data: {
          businessId,
          channel: input.channel,
          contactHandle: handle,
          contactName,
          customerId,
          assigneeUserId,
          lastMessageAt: receivedAt,
          lastMessagePreview: text.slice(0, 280),
          awaitingReplySince: receivedAt,
          firstInboundAt: receivedAt,
          unreadCount: 1,
        },
      });
      if (assigneeUserId) {
        const name = await this.core.personName(businessId, assigneeUserId);
        await this.core.event(businessId, INBOX_EVENT.ASSIGNED, {
          conversationId: conversation.id,
          detail: `Assigned to ${name} — fewest open conversations`,
          data: { to: assigneeUserId, auto: true },
        });
      }
    } else {
      const reopening = existing.status !== 'open';
      conversation = await this.prisma.inboxConversation.update({
        where: { id: existing.id },
        data: {
          lastMessageAt:
            receivedAt > existing.lastMessageAt
              ? receivedAt
              : existing.lastMessageAt,
          lastMessagePreview:
            receivedAt >= existing.lastMessageAt
              ? text.slice(0, 280)
              : existing.lastMessagePreview,
          unreadCount: { increment: 1 },
          awaitingReplySince: existing.awaitingReplySince ?? receivedAt,
          firstInboundAt: existing.firstInboundAt ?? receivedAt,
          customerId: existing.customerId ?? customerId,
          ...(input.contactName &&
          existing.contactName === existing.contactHandle
            ? { contactName }
            : {}),
          ...(reopening
            ? {
                status: 'open',
                snoozedUntil: null,
                closedAt: null,
                awaySentAt: null,
              }
            : {}),
        },
      });
      if (reopening) {
        await this.core.threadEvent(
          businessId,
          conversation.id,
          `Reopened — ${contactName} wrote again`,
        );
        await this.core.event(businessId, INBOX_EVENT.REOPENED, {
          conversationId: conversation.id,
          detail: `${contactName} wrote again`,
        });
      }
    }

    await this.prisma.inboxMessage.create({
      data: {
        businessId,
        conversationId: conversation.id,
        kind: 'in',
        body: text,
        authorName: contactName,
        externalKey: input.externalKey,
        socialInboxItemId: input.socialInboxItemId,
        createdAt: receivedAt,
      },
    });
    if (
      input.channel === 'whatsapp' &&
      conversation.customerId &&
      Date.now() - receivedAt.getTime() < 24 * 3600000
    ) {
      await this.sender.refreshWhatsappWindow(
        businessId,
        conversation.customerId,
      );
    }

    conversation = await this.applyKeywordRules(
      conversation,
      text,
      input.backfill === true,
    );

    const recent =
      !input.backfill && Date.now() - receivedAt.getTime() < ONE_HOUR;
    if (recent) {
      const s = await this.settings.get(businessId);
      if (s.notifyMoney) {
        const word = mentionsAny(text, MONEY_WORDS);
        if (word)
          await this.core.notifyManagers(
            businessId,
            'inbox_money_question',
            `Money question from ${contactName}`,
            `"${text.slice(0, 140)}" — mentions "${word}".`,
          );
      }
      conversation = await this.applyAwayRule(conversation, receivedAt);
      await this.ai.autoDraft(conversation);
    }
    return conversation;
  }

  /** Links a WhatsApp/SMS/email contact to an existing customer by phone or email — never creates one. */
  async matchCustomer(
    businessId: string,
    channel: string,
    handle: string,
  ): Promise<string | null> {
    if (!isMessagingChannel(channel)) return null;
    if (channel === 'email') {
      const c = await this.prisma.customer.findFirst({
        where: { businessId, email: handle },
        select: { id: true },
      });
      return c?.id ?? null;
    }
    const digits = handle.replace(/\D/g, '');
    if (digits.length < 7) return null;
    const exact = await this.prisma.customer.findFirst({
      where: { businessId, phone: { in: [handle, digits, `+${digits}`] } },
      select: { id: true },
    });
    if (exact) return exact.id;
    const tail = digits.slice(-10);
    const byTail = await this.prisma.customer.findMany({
      where: { businessId, phone: { endsWith: tail } },
      select: { id: true },
      take: 2,
    });
    return byTail.length === 1 ? byTail[0].id : null; // ambiguous tail matches are not guessed
  }

  private async pickAssignee(businessId: string): Promise<string | null> {
    const s = await this.settings.get(businessId);
    if (s.assignMode !== 'free') return null;
    const people = await this.core.people(businessId);
    if (people.length === 0) return null;
    const load = await this.prisma.inboxConversation.groupBy({
      by: ['assigneeUserId'],
      where: {
        businessId,
        status: 'open',
        assigneeUserId: { in: people.map((p) => p.userId) },
      },
      _count: { _all: true },
    });
    const count = (id: string) =>
      load.find((l) => l.assigneeUserId === id)?._count._all ?? 0;
    return [...people].sort((a, b) => count(a.userId) - count(b.userId))[0]
      .userId;
  }

  private async bumpRule(rule: InboxRule) {
    await this.prisma.inboxRule.update({
      where: { id: rule.id },
      data: { runCount: { increment: 1 }, lastRunAt: new Date() },
    });
  }

  private async applyKeywordRules(
    conversation: InboxConversation,
    text: string,
    backfill: boolean,
  ): Promise<InboxConversation> {
    const rules = await this.prisma.inboxRule.findMany({
      where: {
        businessId: conversation.businessId,
        trigger: 'keyword',
        active: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    let conv = conversation;
    for (const rule of rules) {
      const word = mentionsAny(text, (rule.keywords as string[]) ?? []);
      if (!word) continue;
      const data: Prisma.InboxConversationUpdateInput = {};
      const tags = Array.isArray(conv.tags) ? (conv.tags as string[]) : [];
      const did: string[] = [];
      if (rule.tag && !tags.includes(rule.tag)) {
        data.tags = [...tags, rule.tag];
        did.push(`tagged ${rule.tag}`);
      }
      if (rule.pinToTop && !conv.pinned) {
        data.pinned = true;
        did.push('moved to the top');
      }
      if (rule.assigneeUserId && !conv.assigneeUserId) {
        data.assigneeUserId = rule.assigneeUserId;
        const name = await this.core.personName(
          conv.businessId,
          rule.assigneeUserId,
        );
        did.push(`assigned to ${name}`);
        await this.core.event(conv.businessId, INBOX_EVENT.RULE_ROUTED, {
          conversationId: conv.id,
          ruleId: rule.id,
          detail: `${rule.name}: assigned to ${name}`,
          data: { to: rule.assigneeUserId },
        });
      }
      if (rule.flag && !conv.flaggedAt && !backfill) {
        data.flaggedAt = new Date();
        did.push('flagged on Attention');
        await this.core.event(conv.businessId, INBOX_EVENT.RULE_FLAGGED, {
          conversationId: conv.id,
          ruleId: rule.id,
          detail: `${rule.name}: flagged`,
        });
      }
      if (did.length === 0) continue;
      conv = await this.prisma.inboxConversation.update({
        where: { id: conv.id },
        data,
      });
      if (rule.tag && did.some((d) => d.startsWith('tagged'))) {
        await this.core.event(conv.businessId, INBOX_EVENT.RULE_TAGGED, {
          conversationId: conv.id,
          ruleId: rule.id,
          detail: `${rule.name}: tagged ${rule.tag} (matched "${word}")`,
        });
      }
      await this.bumpRule(rule);
    }
    return conv;
  }

  private async applyAwayRule(
    conversation: InboxConversation,
    receivedAt: Date,
  ): Promise<InboxConversation> {
    if (conversation.awaySentAt) return conversation;
    const rule = await this.prisma.inboxRule.findFirst({
      where: {
        businessId: conversation.businessId,
        trigger: 'out_of_hours',
        active: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!rule?.message) return conversation;
    const s = await this.settings.get(conversation.businessId);
    if (!hasHours(s.hours) || isWithinHours(receivedAt, s.hours, s.timezone))
      return conversation;
    try {
      if (await this.sender.cannotSendReason(conversation)) return conversation;
      await this.sender.send(
        conversation,
        rule.message,
        { userId: null, name: 'Away message' },
        'away',
      );
      const updated = await this.prisma.inboxConversation.update({
        where: { id: conversation.id },
        // The away message is not a real answer — the customer is still waiting on a person.
        data: {
          awaySentAt: new Date(),
          awaitingReplySince: conversation.awaitingReplySince ?? receivedAt,
          firstReplyAt: conversation.firstReplyAt,
          firstReplyMinutes: conversation.firstReplyMinutes,
          unreadCount: conversation.unreadCount,
        },
      });
      await this.core.event(conversation.businessId, INBOX_EVENT.RULE_AWAY, {
        conversationId: conversation.id,
        ruleId: rule.id,
        detail: `${rule.name}: away message sent to ${conversation.contactName}`,
      });
      await this.bumpRule(rule);
      return updated;
    } catch (error) {
      this.logger.warn(
        `Away message failed for ${conversation.id}: ${(error as Error).message}`,
      );
      return conversation;
    }
  }

  /** Mirrors `SocialInboxItem` rows (social DMs/comments) that are not in the inbox yet. */
  async syncSocial(businessId: string): Promise<number> {
    const items = await this.prisma.socialInboxItem.findMany({
      where: { businessId },
      orderBy: { receivedAt: 'desc' },
      take: 300,
    });
    if (items.length === 0) return 0;
    const mirrored = await this.prisma.inboxMessage.findMany({
      where: { socialInboxItemId: { in: items.map((i) => i.id) } },
      select: { socialInboxItemId: true },
    });
    const done = new Set(mirrored.map((m) => m.socialInboxItemId));
    const todo = items.filter((i) => !done.has(i.id)).reverse();
    for (const item of todo) {
      const conv = await this.ingest({
        businessId,
        channel: item.platform,
        contactHandle: item.authorName?.trim() || `${item.platform} user`,
        contactName: item.authorName,
        text: item.kind === 'comment' ? `(comment) ${item.text}` : item.text,
        socialInboxItemId: item.id,
        receivedAt: item.receivedAt,
        backfill: Date.now() - item.receivedAt.getTime() > ONE_HOUR,
      });
      if (!conv) continue;
      if (item.repliedText && item.repliedAt) {
        await this.prisma.inboxMessage.create({
          data: {
            businessId,
            conversationId: conv.id,
            kind: 'out',
            body: item.repliedText,
            authorName: 'Replied in Social',
            source: 'social',
            createdAt: item.repliedAt,
          },
        });
        const fresh = await this.prisma.inboxConversation.findUniqueOrThrow({
          where: { id: conv.id },
        });
        await this.core.afterOutbound(fresh, item.repliedText, item.repliedAt);
      } else if (item.status === 'read') {
        await this.prisma.inboxConversation.update({
          where: { id: conv.id },
          data: { unreadCount: 0 },
        });
      }
    }
    return todo.length;
  }

  /** The two-minute tick for one business. */
  async tick(businessId: string, now = new Date()) {
    // Snoozes that have ended come back to the queue.
    const woke = await this.prisma.inboxConversation.findMany({
      where: { businessId, status: 'snoozed', snoozedUntil: { lte: now } },
      select: { id: true },
    });
    for (const w of woke) {
      await this.prisma.inboxConversation.update({
        where: { id: w.id },
        data: { status: 'open', snoozedUntil: null },
      });
      await this.core.threadEvent(
        businessId,
        w.id,
        'Snooze ended — back in the queue',
      );
    }

    const s = await this.settings.get(businessId);
    const waiting = await this.prisma.inboxConversation.findMany({
      where: { businessId, status: 'open', awaitingReplySince: { not: null } },
      take: 500,
    });

    const unanswered = await this.prisma.inboxRule.findMany({
      where: { businessId, trigger: 'unanswered', active: true },
      orderBy: { createdAt: 'asc' },
    });
    for (const rule of unanswered) {
      if (!rule.minutes) continue;
      let ran = false;
      for (const conv of waiting) {
        if (conv.flaggedAt) continue;
        const mins = workingMinutesBetween(
          conv.awaitingReplySince!,
          now,
          s.hours,
          s.timezone,
        );
        if (mins < rule.minutes) continue;
        await this.prisma.inboxConversation.update({
          where: { id: conv.id },
          data: {
            flaggedAt: now,
            ...(rule.tag
              ? {
                  tags: [
                    ...new Set([...((conv.tags as string[]) ?? []), rule.tag]),
                  ],
                }
              : {}),
          },
        });
        conv.flaggedAt = now;
        await this.core.event(businessId, INBOX_EVENT.RULE_FLAGGED, {
          conversationId: conv.id,
          ruleId: rule.id,
          detail: `${rule.name}: ${conv.contactName} unanswered for ${mins} min`,
        });
        const title = `${conv.contactName} has waited ${mins} min`;
        const body = `No reply for ${mins} minutes (${rule.name}).`;
        if (conv.assigneeUserId)
          await this.core.notifyUser(
            businessId,
            conv.assigneeUserId,
            'inbox_flagged',
            title,
            body,
          );
        else
          await this.core.notifyManagers(
            businessId,
            'inbox_flagged',
            title,
            body,
          );
        ran = true;
      }
      if (ran) await this.bumpRule(rule);
    }

    if (s.notifyUnassigned) {
      for (const conv of waiting) {
        if (conv.assigneeUserId || conv.unassignedNotifiedAt) continue;
        const since = conv.firstInboundAt ?? conv.createdAt;
        const mins = workingMinutesBetween(since, now, s.hours, s.timezone);
        if (mins < s.unassignedTargetMin) continue;
        await this.prisma.inboxConversation.update({
          where: { id: conv.id },
          data: { unassignedNotifiedAt: now },
        });
        await this.core.notifyManagers(
          businessId,
          'inbox_unassigned',
          `Nobody has picked up ${conv.contactName}`,
          `Unassigned for ${mins} minutes.`,
        );
      }
    }
  }

  /** Businesses with anything for the tick to do. */
  async businessesToTick(): Promise<string[]> {
    const [convs, social] = await Promise.all([
      this.prisma.inboxConversation.findMany({
        where: { status: { in: ['open', 'snoozed'] } },
        distinct: ['businessId'],
        select: { businessId: true },
      }),
      this.prisma.socialAccount.findMany({
        where: { status: 'connected' },
        distinct: ['businessId'],
        select: { businessId: true },
      }),
    ]);
    return [
      ...new Set([
        ...convs.map((c) => c.businessId),
        ...social.map((s) => s.businessId),
      ]),
    ];
  }
}
