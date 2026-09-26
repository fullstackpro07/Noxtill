import { HttpStatus, Injectable } from '@nestjs/common';
import { InboxConversation, Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { PoliciesService } from '../common/policies/policies.service';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { AppException } from '../common/filters/app.exception';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import {
  channelDef,
  INBOX_ERROR_CODES,
  INBOX_EVENT,
  THREAD_SUMMARY_MIN_MESSAGES,
  normalizeHandle,
} from './inbox.constants';
import { Actor, InboxCoreService } from './inbox-core.service';
import {
  InboxFactsService,
  CustomerFacts,
  ConversationFacts,
} from './inbox-facts.service';
import { InboxSendService } from './inbox-send.service';
import { InboxAiService } from './inbox-ai.service';
import { InboxAutomationService } from './inbox-automation.service';
import { InboxSettingsService } from './inbox-settings.service';
import { workingMinutesBetween } from './inbox-hours.util';
import {
  AssignDto,
  ComposeDto,
  ListConversationsQueryDto,
} from './dto/inbox.dto';

export function initials(name: string): string {
  const parts = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  return (
    parts[0][0] +
    (parts.length > 1 ? parts[parts.length - 1][0] : (parts[0][1] ?? ''))
  ).toUpperCase();
}

export function tagList(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

const hasMoneyTag = (tags: string[]) =>
  tags.some((t) => t.toLowerCase() === 'money');

@Injectable()
export class InboxService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly policies: PoliciesService,
    private readonly core: InboxCoreService,
    private readonly facts: InboxFactsService,
    private readonly sender: InboxSendService,
    private readonly ai: InboxAiService,
    private readonly automation: InboxAutomationService,
    private readonly settings: InboxSettingsService,
  ) {}

  canManage() {
    return this.policies.actorCan(CAPABILITIES.INBOX_MANAGE);
  }

  async actor(user: AuthenticatedUser): Promise<Actor> {
    return {
      userId: user.sub,
      name: await this.core.personName(user.businessId, user.sub),
    };
  }

  /** Without inbox.manage a person sees their own conversations and unassigned ones only. */
  async visibility(
    user: AuthenticatedUser,
  ): Promise<Prisma.InboxConversationWhereInput> {
    if (await this.canManage()) return {};
    return { OR: [{ assigneeUserId: user.sub }, { assigneeUserId: null }] };
  }

  async find(user: AuthenticatedUser, id: string): Promise<InboxConversation> {
    const conv = await this.tenantPrisma.client.inboxConversation.findFirst({
      where: {
        id,
        businessId: user.businessId,
        ...(await this.visibility(user)),
      },
    });
    if (!conv)
      throw new AppException(
        INBOX_ERROR_CODES.CONVERSATION_NOT_FOUND,
        'Conversation not found.',
        HttpStatus.NOT_FOUND,
      );
    return conv;
  }

  private viewWhere(
    view: string | undefined,
    userId: string,
  ): Prisma.InboxConversationWhereInput {
    switch (view) {
      case 'unassigned':
        return { status: 'open', assigneeUserId: null };
      case 'assigned':
        return { status: 'open', assigneeUserId: { not: null } };
      case 'waiting':
        return { status: 'open', awaitingReplySince: null };
      case 'unread':
        return { status: { not: 'closed' }, unreadCount: { gt: 0 } };
      case 'snoozed':
        return { status: 'snoozed' };
      case 'closed':
        return { status: 'closed' };
      case 'mine':
        return { status: { not: 'closed' }, assigneeUserId: userId };
      case 'starred':
        return { starred: true };
      default:
        return { status: 'open' };
    }
  }

  async outstandingByCustomer(
    businessId: string,
    customerIds: string[],
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (customerIds.length === 0) return map;
    const rows = await this.prisma.$queryRaw<
      { customer_id: string; balance: string | number }[]
    >`
      SELECT customer_id, balance FROM v_credit_balances
      WHERE business_id = ${businessId} AND customer_id IN (${Prisma.join(customerIds)}) AND balance > 0
      ORDER BY customer_id
    `;
    for (const r of rows) map.set(r.customer_id, Number(r.balance));
    return map;
  }

  async list(user: AuthenticatedUser, q: ListConversationsQueryDto) {
    const businessId = user.businessId;
    const visible = await this.visibility(user);
    const base: Prisma.InboxConversationWhereInput = {
      businessId,
      ...visible,
      ...(q.channel && q.channel !== 'all' ? { channel: q.channel } : {}),
      ...(q.assignee
        ? { assigneeUserId: q.assignee === 'none' ? null : q.assignee }
        : {}),
    };
    const search = q.q?.trim();
    const where: Prisma.InboxConversationWhereInput = {
      AND: [
        base,
        this.viewWhere(q.view, user.sub),
        ...(q.tag ? [{ tags: { array_contains: [q.tag] } }] : []),
        ...(search
          ? [
              {
                OR: [
                  { contactName: { contains: search } },
                  { contactHandle: { contains: search } },
                  {
                    messages: {
                      some: {
                        kind: { in: ['in', 'out', 'note'] },
                        body: { contains: search },
                      },
                    },
                  },
                ],
              },
            ]
          : []),
      ],
    };
    const sort = q.sort ?? 'newest';
    const orderBy: Prisma.InboxConversationOrderByWithRelationInput[] =
      sort === 'oldest'
        ? [{ lastMessageAt: 'asc' }]
        : sort === 'waiting'
          ? [
              { awaitingReplySince: { sort: 'asc', nulls: 'last' } },
              { lastMessageAt: 'desc' },
            ]
          : [{ pinned: 'desc' }, { lastMessageAt: 'desc' }];

    const rows = await this.tenantPrisma.client.inboxConversation.findMany({
      where,
      orderBy: [...orderBy, { id: 'asc' }],
      take: 200,
    });
    const s = await this.settings.get(businessId);
    const [people, stakes] = await Promise.all([
      this.core.people(businessId),
      this.outstandingByCustomer(businessId, [
        ...new Set(
          rows.map((r) => r.customerId).filter((x): x is string => !!x),
        ),
      ]),
    ]);
    const nameOf = (id: string | null) =>
      id
        ? (people.find((p) => p.userId === id)?.name ?? 'Former staff')
        : 'Unassigned';
    const now = new Date();

    let items = rows.map((c) => {
      const tags = tagList(c.tags);
      const waitingMin = c.awaitingReplySince
        ? workingMinutesBetween(c.awaitingReplySince, now, s.hours, s.timezone)
        : null;
      const needsYou =
        c.status === 'open' &&
        (!!c.flaggedAt ||
          (!c.assigneeUserId &&
            waitingMin !== null &&
            waitingMin >= s.unassignedTargetMin));
      return {
        id: c.id,
        name: c.contactName,
        init: initials(c.contactName),
        channel: c.channel,
        msg: c.lastMessagePreview,
        lastMessageAt: c.lastMessageAt.toISOString(),
        awaitingReplySince: c.awaitingReplySince?.toISOString() ?? null,
        waitingMin,
        owner: nameOf(c.assigneeUserId),
        assigneeUserId: c.assigneeUserId,
        unread: c.unreadCount,
        prio: hasMoneyTag(tags) ? 'Money' : needsYou ? 'Needs you' : '',
        status: c.status,
        starred: c.starred,
        pinned: c.pinned,
        tags,
        stake: c.customerId ? (stakes.get(c.customerId) ?? 0) : 0,
      };
    });
    if (sort === 'money')
      items = [...items].sort(
        (a, b) =>
          b.stake - a.stake || b.lastMessageAt.localeCompare(a.lastMessageAt),
      );

    const countWhere = (extra: Prisma.InboxConversationWhereInput) =>
      this.tenantPrisma.client.inboxConversation.count({
        where: { AND: [base, extra] },
      });
    const views = [
      'open',
      'unassigned',
      'assigned',
      'waiting',
      'unread',
      'snoozed',
      'closed',
    ] as const;
    const counts = Object.fromEntries(
      await Promise.all(
        views.map(
          async (v) =>
            [v, await countWhere(this.viewWhere(v, user.sub))] as const,
        ),
      ),
    );
    return {
      items,
      counts,
      money: { currency: (await this.facts.business(businessId)).currency },
    };
  }

  /** Channel unread totals + tab badges for the Overview rail — respects the same visibility. */
  async railCounts(user: AuthenticatedUser) {
    const visible = await this.visibility(user);
    const grouped = await this.tenantPrisma.client.inboxConversation.groupBy({
      by: ['channel'],
      where: {
        businessId: user.businessId,
        ...visible,
        status: { not: 'closed' },
      },
      _sum: { unreadCount: true },
      _count: { _all: true },
    });
    return grouped.map((g) => ({
      channel: g.channel,
      unread: g._sum.unreadCount ?? 0,
      conversations: g._count._all,
    }));
  }

  customerStatus(c: CustomerFacts | null): { status: string; since: string } {
    if (!c) return { status: 'New enquiry', since: 'No customer record yet' };
    const since = `Customer since ${new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(c.customer.createdAt)}`;
    if (c.outstanding > 0) return { status: 'Credit customer', since };
    if (c.ordersCount > 1) return { status: 'Returning customer', since };
    if (c.ordersCount === 1) return { status: 'First-time customer', since };
    return { status: 'Customer, no orders yet', since };
  }

  private systemCard(
    f: ConversationFacts,
  ): { text: string; sub: string } | null {
    const o = f.customer?.openOrder;
    if (!o) return null;
    const b = f.business;
    const bits = [`Order #${o.orderNo}`];
    if (o.delivery) {
      const d = o.delivery;
      bits.push(
        `delivery ${d.status.replace('_', ' ')}${d.assignedAt ? ` since ${this.facts.time(d.assignedAt, b)}` : ''}`,
      );
      if (d.promisedAt)
        bits.push(`promised by ${this.facts.time(d.promisedAt, b)}`);
    } else bits.push(o.status.replace('_', ' '));
    bits.push(
      o.total - o.paid <= 0.005
        ? `${this.facts.money(o.total, b)} paid`
        : `${this.facts.money(o.total - o.paid, b)} still to pay`,
    );
    return {
      text: bits.join(' · '),
      sub: o.delivery
        ? 'Pulled from Orders and Delivery, not typed by anyone'
        : 'Pulled from Orders, not typed by anyone',
    };
  }

  async detail(user: AuthenticatedUser, id: string) {
    const conv = await this.find(user, id);
    const businessId = user.businessId;
    const [messages, lastIn, s, canManage, canDecide, people] =
      await Promise.all([
        this.tenantPrisma.client.inboxMessage.findMany({
          where: { conversationId: id },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: 300,
        }),
        this.tenantPrisma.client.inboxMessage.findFirst({
          where: { conversationId: id, kind: 'in' },
          orderBy: { createdAt: 'desc' },
        }),
        this.settings.get(businessId),
        this.canManage(),
        this.policies.actorCan(CAPABILITIES.CREDIT_MANAGE),
        this.core.people(businessId),
      ]);
    const f = await this.facts.forConversation(businessId, conv, lastIn?.body);
    const statuses = await this.tenantPrisma.client.message.findMany({
      where: {
        id: {
          in: messages.map((m) => m.messageId).filter((x): x is string => !!x),
        },
      },
      select: { id: true, status: true },
    });
    const draft = await this.tenantPrisma.client.inboxAiDraft.findFirst({
      where: { conversationId: id, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
    const skip =
      !draft && lastIn
        ? await this.tenantPrisma.client.inboxEvent.findFirst({
            where: {
              conversationId: id,
              kind: INBOX_EVENT.AI_SKIPPED,
              createdAt: { gte: lastIn.createdAt },
            },
            orderBy: { createdAt: 'desc' },
          })
        : null;
    const notes = f.customer
      ? await this.tenantPrisma.client.memoryNote.findMany({
          where: { subjectType: 'customer', subjectId: f.customer.customer.id },
          orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
          take: 10,
        })
      : [];
    const noteAuthors = await this.prisma.user.findMany({
      where: {
        id: {
          in: notes.map((n) => n.authorUserId).filter((x): x is string => !!x),
        },
      },
      select: { id: true, name: true },
    });
    const who = (uid: string | null) =>
      uid
        ? (people.find((p) => p.userId === uid)?.name ??
          noteAuthors.find((a) => a.id === uid)?.name ??
          'Former staff')
        : null;
    const b = f.business;
    const c = f.customer;
    const def = channelDef(conv.channel);
    const { status, since } = this.customerStatus(c);
    const threadCount = messages.filter(
      (m) => m.kind === 'in' || m.kind === 'out',
    ).length;

    return {
      id: conv.id,
      name: conv.contactName,
      init: initials(conv.contactName),
      channel: conv.channel,
      handle: conv.contactHandle,
      conversationStatus: conv.status,
      snoozedUntil: conv.snoozedUntil?.toISOString() ?? null,
      owner: conv.assigneeUserId
        ? (who(conv.assigneeUserId) ?? 'Former staff')
        : 'Unassigned',
      assigneeUserId: conv.assigneeUserId,
      starred: conv.starred,
      tags: tagList(conv.tags),
      customerId: conv.customerId,
      status,
      since,
      stats: c
        ? {
            orders: String(c.ordersCount),
            spent: this.facts.money(c.spent, b),
            owes: this.facts.money(c.outstanding, b),
            owesPositive: c.outstanding > 0,
            bookings: String(c.bookingsCount),
          }
        : {
            orders: '0',
            spent: '—',
            owes: '—',
            owesPositive: false,
            bookings: '0',
          },
      context: this.facts.contextCards(f),
      actions: s.aiNextAction ? this.facts.actions(f) : [],
      actionsHidden: !s.aiNextAction,
      contactRows: [
        ...(c
          ? [
              { l: 'Phone', v: c.customer.phone },
              { l: 'Email', v: c.customer.email ?? 'Not recorded' },
              { l: 'Address', v: c.customer.address ?? 'Not recorded' },
            ]
          : [
              {
                l:
                  def.transport === 'social'
                    ? `${def.short} name`
                    : conv.channel === 'email'
                      ? 'Email'
                      : 'Phone',
                v: conv.contactHandle,
              },
            ]),
      ],
      convInfo: [
        { l: 'Channel', v: def.short },
        { l: 'Started', v: this.facts.dateTime(conv.createdAt, b) },
        {
          l: 'Assigned to',
          v: conv.assigneeUserId
            ? (who(conv.assigneeUserId) ?? 'Former staff')
            : 'Nobody yet',
        },
        {
          l: 'First reply',
          v:
            conv.firstReplyMinutes !== null
              ? `${conv.firstReplyMinutes} min${s.hoursSource !== 'none' ? ' (working hours)' : ''}`
              : conv.firstInboundAt
                ? 'Not replied yet'
                : 'Started by you',
        },
        { l: 'Messages', v: String(threadCount) },
      ],
      notes: notes.map((n) => ({
        id: n.id,
        t: n.body,
        who: who(n.authorUserId) ?? 'Team',
        when: n.createdAt.toISOString(),
      })),
      notesTarget: c ? 'customer' : 'none',
      systemCard: this.systemCard(f),
      thread: messages.map((m) => ({
        id: m.id,
        kind: m.kind,
        text: m.body,
        who:
          m.kind === 'in'
            ? conv.contactName
            : (m.authorName ?? (m.kind === 'event' ? null : 'Team')),
        at: m.createdAt.toISOString(),
        delivery: m.messageId
          ? (statuses.find((x) => x.id === m.messageId)?.status ?? null)
          : m.kind === 'out' && m.source === 'social'
            ? 'sent'
            : null,
        error: m.sendError,
        source: m.source,
      })),
      draft: draft
        ? {
            id: draft.id,
            text: draft.text,
            sources: tagList(draft.sources),
            needsDecision: draft.needsDecision,
            warning: draft.warning,
            createdAt: draft.createdAt.toISOString(),
          }
        : null,
      draftSkipped: skip?.detail ?? null,
      cannotSend: await this.sender.cannotSendReason(conv),
      whatsappWindowOpen: await this.sender.whatsappWindowOpen(conv),
      canManage,
      canDecide,
      summaryAvailable:
        s.aiSummarise && threadCount >= THREAD_SUMMARY_MIN_MESSAGES,
      awaitingReplySince: conv.awaitingReplySince?.toISOString() ?? null,
      aiAutoDraft: s.aiAutoDraft,
    };
  }

  async markRead(user: AuthenticatedUser, id: string) {
    await this.find(user, id);
    await this.tenantPrisma.client.inboxConversation.update({
      where: { id },
      data: { unreadCount: 0 },
    });
    return { ok: true };
  }

  async markAllRead(user: AuthenticatedUser) {
    const res = await this.tenantPrisma.client.inboxConversation.updateMany({
      where: {
        businessId: user.businessId,
        ...(await this.visibility(user)),
        unreadCount: { gt: 0 },
      },
      data: { unreadCount: 0 },
    });
    return { updated: res.count };
  }

  async reply(
    user: AuthenticatedUser,
    id: string,
    text: string,
    savedReplyId?: string,
  ) {
    const conv = await this.find(user, id);
    const actor = await this.actor(user);
    let source = 'manual';
    if (savedReplyId) {
      const reply = await this.tenantPrisma.client.inboxSavedReply.findFirst({
        where: { id: savedReplyId, businessId: user.businessId },
      });
      if (reply) {
        source = `saved_reply:${reply.slug}`;
        await this.tenantPrisma.client.inboxSavedReply.update({
          where: { id: reply.id },
          data: { useCount: { increment: 1 }, lastUsedAt: new Date() },
        });
      }
    }
    // A person answered in their own words — any pending draft for this question is now stale.
    await this.tenantPrisma.client.inboxAiDraft.updateMany({
      where: { conversationId: id, status: 'pending' },
      data: { status: 'superseded' },
    });
    await this.sender.send(conv, text.trim(), actor, source);
    return this.detail(user, id);
  }

  async note(user: AuthenticatedUser, id: string, text: string) {
    await this.find(user, id);
    const actor = await this.actor(user);
    await this.tenantPrisma.client.inboxMessage.create({
      data: {
        businessId: user.businessId,
        conversationId: id,
        kind: 'note',
        body: text.trim(),
        authorUserId: actor.userId,
        authorName: actor.name,
      },
    });
    return this.detail(user, id);
  }

  async assign(user: AuthenticatedUser, id: string, dto: AssignDto) {
    const conv = await this.find(user, id);
    const manage = await this.canManage();
    const selfTake =
      dto.userId === user.sub &&
      (!conv.assigneeUserId || conv.assigneeUserId === user.sub);
    const selfRelease = dto.userId === null && conv.assigneeUserId === user.sub;
    if (!manage && !selfTake && !selfRelease) {
      throw new AppException(
        INBOX_ERROR_CODES.NOT_YOURS,
        'Only an Owner or Manager can hand a conversation to someone else.',
        HttpStatus.FORBIDDEN,
      );
    }
    if (dto.userId)
      await this.core.assertAssignable(user.businessId, dto.userId);
    if (dto.userId === conv.assigneeUserId) return this.detail(user, id);

    const actor = await this.actor(user);
    const toName = dto.userId
      ? await this.core.personName(user.businessId, dto.userId)
      : null;
    const fromName = conv.assigneeUserId
      ? await this.core.personName(user.businessId, conv.assigneeUserId)
      : null;
    await this.tenantPrisma.client.inboxConversation.update({
      where: { id },
      data: { assigneeUserId: dto.userId, unassignedNotifiedAt: null },
    });
    const reason = dto.reason?.trim();
    const line = dto.userId
      ? `${dto.userId === user.sub ? `${actor.name} took this conversation` : `Assigned to ${toName} by ${actor.name}`}${fromName ? ` (was ${fromName})` : ''}${reason ? ` — ${reason}` : ''}`
      : `Unassigned by ${actor.name}${reason ? ` — ${reason}` : ''}`;
    await this.core.threadEvent(user.businessId, id, line);
    await this.core.event(user.businessId, INBOX_EVENT.ASSIGNED, {
      conversationId: id,
      actor,
      detail: line,
      data: {
        from: conv.assigneeUserId,
        to: dto.userId,
        reason: reason ?? null,
      },
    });
    if (conv.assigneeUserId && conv.assigneeUserId !== user.sub) {
      await this.core.notifyUser(
        user.businessId,
        conv.assigneeUserId,
        'inbox_reassigned',
        `${conv.contactName} was handed to ${toName ?? 'nobody'}`,
        `${actor.name} moved it${reason ? `: ${reason}` : '.'}`,
      );
    }
    if (dto.userId && dto.userId !== user.sub) {
      await this.core.notifyUser(
        user.businessId,
        dto.userId,
        'inbox_reassigned',
        `${conv.contactName} is now yours`,
        `${actor.name} handed it to you${reason ? `: ${reason}` : '.'}`,
      );
    }
    return this.detail(user, id);
  }

  async snooze(user: AuthenticatedUser, id: string, minutes: number) {
    await this.find(user, id);
    const actor = await this.actor(user);
    const until = new Date(Date.now() + minutes * 60000);
    await this.tenantPrisma.client.inboxConversation.update({
      where: { id },
      data: { status: 'snoozed', snoozedUntil: until },
    });
    const b = await this.facts.business(user.businessId);
    const line = `Snoozed by ${actor.name} until ${this.facts.dateTime(until, b)}`;
    await this.core.threadEvent(user.businessId, id, line);
    await this.core.event(user.businessId, INBOX_EVENT.SNOOZED, {
      conversationId: id,
      actor,
      detail: line,
    });
    return this.detail(user, id);
  }

  async close(user: AuthenticatedUser, id: string) {
    await this.find(user, id);
    const actor = await this.actor(user);
    await this.tenantPrisma.client.inboxConversation.update({
      where: { id },
      data: {
        status: 'closed',
        closedAt: new Date(),
        snoozedUntil: null,
        unreadCount: 0,
        pinned: false,
      },
    });
    await this.tenantPrisma.client.inboxAiDraft.updateMany({
      where: { conversationId: id, status: 'pending' },
      data: { status: 'superseded' },
    });
    await this.core.threadEvent(user.businessId, id, `Closed by ${actor.name}`);
    await this.core.event(user.businessId, INBOX_EVENT.CLOSED, {
      conversationId: id,
      actor,
      detail: `Closed by ${actor.name}`,
    });
    return this.detail(user, id);
  }

  async reopen(user: AuthenticatedUser, id: string) {
    await this.find(user, id);
    const actor = await this.actor(user);
    await this.tenantPrisma.client.inboxConversation.update({
      where: { id },
      data: { status: 'open', closedAt: null, snoozedUntil: null },
    });
    await this.core.threadEvent(
      user.businessId,
      id,
      `Reopened by ${actor.name}`,
    );
    await this.core.event(user.businessId, INBOX_EVENT.REOPENED, {
      conversationId: id,
      actor,
      detail: `Reopened by ${actor.name}`,
    });
    return this.detail(user, id);
  }

  async star(user: AuthenticatedUser, id: string, starred: boolean) {
    await this.find(user, id);
    await this.tenantPrisma.client.inboxConversation.update({
      where: { id },
      data: { starred },
    });
    return { starred };
  }

  async setTags(user: AuthenticatedUser, id: string, tags: string[]) {
    await this.find(user, id);
    const clean = [...new Set(tags.map((t) => t.trim()).filter(Boolean))].slice(
      0,
      12,
    );
    await this.tenantPrisma.client.inboxConversation.update({
      where: { id },
      data: { tags: clean },
    });
    await this.core.event(user.businessId, INBOX_EVENT.TAGGED, {
      conversationId: id,
      actor: await this.actor(user),
      detail: `Tags set to ${clean.join(', ') || 'none'}`,
    });
    return { tags: clean };
  }

  /** Every tag in use, for the tag picker and the list filter. */
  async tagsInUse(user: AuthenticatedUser) {
    const rows = await this.tenantPrisma.client.inboxConversation.findMany({
      where: { businessId: user.businessId },
      select: { tags: true },
      take: 2000,
      orderBy: { lastMessageAt: 'desc' },
    });
    const rules = await this.tenantPrisma.client.inboxRule.findMany({
      where: { businessId: user.businessId, tag: { not: null } },
      select: { tag: true },
    });
    return [
      ...new Set([
        ...rows.flatMap((r) => tagList(r.tags)),
        ...rules.map((r) => r.tag!),
      ]),
    ].sort((a, b) => a.localeCompare(b));
  }

  async compose(user: AuthenticatedUser, dto: ComposeDto) {
    const businessId = user.businessId;
    let handle: string | undefined;
    let name = dto.name?.trim();
    let customerId: string | null = null;
    if (dto.customerId) {
      const customer = await this.tenantPrisma.client.customer.findFirst({
        where: { id: dto.customerId, businessId },
      });
      if (!customer)
        throw new AppException(
          INBOX_ERROR_CODES.CONVERSATION_NOT_FOUND,
          'Customer not found.',
          HttpStatus.NOT_FOUND,
        );
      customerId = customer.id;
      name = name || customer.name;
      handle =
        dto.channel === 'email'
          ? (customer.email ?? undefined)
          : customer.phone;
      if (!handle)
        throw new AppException(
          INBOX_ERROR_CODES.CHANNEL_CANNOT_SEND,
          `${customer.name} has no ${dto.channel === 'email' ? 'email address' : 'phone number'} on record.`,
          HttpStatus.BAD_REQUEST,
        );
    } else {
      handle = (dto.channel === 'email' ? dto.email : dto.phone)?.trim();
      if (!handle)
        throw new AppException(
          INBOX_ERROR_CODES.CHANNEL_CANNOT_SEND,
          dto.channel === 'email'
            ? 'Enter an email address.'
            : 'Enter a phone number.',
          HttpStatus.BAD_REQUEST,
        );
      customerId = await this.automation.matchCustomer(
        businessId,
        dto.channel,
        handle,
      );
    }
    handle = normalizeHandle(dto.channel, handle);
    const existing =
      await this.tenantPrisma.client.inboxConversation.findUnique({
        where: {
          businessId_channel_contactHandle: {
            businessId,
            channel: dto.channel,
            contactHandle: handle,
          },
        },
      });
    const conv =
      existing ??
      (await this.tenantPrisma.client.inboxConversation.create({
        data: {
          businessId,
          channel: dto.channel,
          contactHandle: handle,
          contactName: name || handle,
          customerId,
          assigneeUserId: user.sub,
          lastMessageAt: new Date(),
        },
      }));
    const actor = await this.actor(user);
    await this.sender.send(conv, dto.text.trim(), actor, 'manual');
    return { id: conv.id };
  }

  /** "Create a customer record" — or link to the one that already has this phone number. */
  async createCustomer(
    user: AuthenticatedUser,
    id: string,
    body: { name?: string; phone?: string; email?: string },
  ) {
    const conv = await this.find(user, id);
    if (conv.customerId) return this.detail(user, id);
    const businessId = user.businessId;
    const phone = (
      body.phone?.trim() ||
      (conv.channel === 'whatsapp' || conv.channel === 'sms'
        ? conv.contactHandle
        : '')
    ).trim();
    const email =
      body.email?.trim() ||
      (conv.channel === 'email' ? conv.contactHandle : undefined);
    if (!phone) {
      throw new AppException(
        INBOX_ERROR_CODES.CHANNEL_CANNOT_SEND,
        'A customer record needs a phone number. Add one to create it.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const existing = await this.tenantPrisma.client.customer.findFirst({
      where: { businessId, phone },
    });
    const customer =
      existing ??
      (await this.tenantPrisma.client.customer.create({
        data: {
          businessId,
          name: (body.name?.trim() || conv.contactName).slice(0, 191),
          phone,
          email: email ?? null,
        },
      }));
    await this.tenantPrisma.client.inboxConversation.updateMany({
      where: {
        businessId,
        channel: conv.channel,
        contactHandle: conv.contactHandle,
      },
      data: { customerId: customer.id, contactName: customer.name },
    });
    const actor = await this.actor(user);
    await this.core.threadEvent(
      businessId,
      id,
      existing
        ? `Linked to existing customer ${customer.name} by ${actor.name}`
        : `Customer record created by ${actor.name}`,
    );
    return this.detail(user, id);
  }

  async addCustomerNote(user: AuthenticatedUser, id: string, text: string) {
    const conv = await this.find(user, id);
    if (!conv.customerId) {
      // No customer to attach it to: keep it as an internal note on the conversation instead.
      return this.note(user, id, text);
    }
    await this.tenantPrisma.client.memoryNote.create({
      data: {
        businessId: user.businessId,
        subjectType: 'customer',
        subjectId: conv.customerId,
        body: text.trim(),
        authorUserId: user.sub,
      },
    });
    return this.detail(user, id);
  }

  async draft(user: AuthenticatedUser, id: string) {
    const conv = await this.find(user, id);
    await this.ai.draftFor(conv, await this.actor(user), true);
    return this.detail(user, id);
  }

  private async findDraft(user: AuthenticatedUser, draftId: string) {
    const draft = await this.tenantPrisma.client.inboxAiDraft.findFirst({
      where: { id: draftId, businessId: user.businessId },
    });
    if (!draft)
      throw new AppException(
        INBOX_ERROR_CODES.CONVERSATION_NOT_FOUND,
        'Draft not found.',
        HttpStatus.NOT_FOUND,
      );
    const conv = await this.find(user, draft.conversationId);
    return { draft, conv };
  }

  async sendDraft(user: AuthenticatedUser, draftId: string, text?: string) {
    const { draft, conv } = await this.findDraft(user, draftId);
    await this.ai.sendDraft(
      draft,
      conv,
      await this.actor(user),
      await this.policies.actorCan(CAPABILITIES.CREDIT_MANAGE),
      text,
    );
    return { conversationId: conv.id };
  }

  async discardDraft(user: AuthenticatedUser, draftId: string) {
    const { draft, conv } = await this.findDraft(user, draftId);
    await this.ai.discardDraft(draft, conv, await this.actor(user));
    return { conversationId: conv.id };
  }

  async translate(user: AuthenticatedUser, id: string, text: string) {
    const conv = await this.find(user, id);
    return this.ai.translate(conv, text, await this.actor(user));
  }

  async summary(user: AuthenticatedUser, id: string) {
    const conv = await this.find(user, id);
    return { summary: await this.ai.summarise(conv, await this.actor(user)) };
  }
}
