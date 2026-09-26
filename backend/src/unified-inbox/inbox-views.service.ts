import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InboxConversation, Role } from '@prisma/client';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import {
  CAPABILITIES,
  Capability,
  SYSTEM_ROLE_CAPABILITIES,
} from '../common/capabilities/capabilities.constants';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import {
  channelDef,
  INBOX_CHANNELS,
  INBOX_ERROR_CODES,
  INBOX_EVENT,
} from './inbox.constants';
import { InboxCoreService } from './inbox-core.service';
import { InboxFactsService, ConversationFacts } from './inbox-facts.service';
import {
  InboxSettingsService,
  ResolvedInboxSettings,
} from './inbox-settings.service';
import { InboxService, initials, tagList } from './inbox.service';
import {
  describeWeeklyHours,
  hasHours,
  workingMinutesBetween,
} from './inbox-hours.util';

const DAY = 86400000;

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export function fmtMinutes(min: number | null): string {
  if (min === null) return '—';
  if (min < 60) return `${Math.max(0, Math.round(min))} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h >= 48) return `${Math.round(h / 24)} days`;
  return m && h < 10
    ? `${h} hr${h > 1 ? 's' : ''} ${m} min`
    : `${h} hr${h > 1 ? 's' : ''}`;
}

type Tone = 'Holding' | 'Slipping' | 'Broken' | 'No data';

@Injectable()
export class InboxViewsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly core: InboxCoreService,
    private readonly facts: InboxFactsService,
    private readonly settings: InboxSettingsService,
    private readonly inbox: InboxService,
  ) {}

  private targetFor(
    conv: Pick<InboxConversation, 'channel'>,
    s: ResolvedInboxSettings,
  ) {
    return conv.channel === 'email'
      ? s.emailReplyTargetMin
      : s.firstReplyTargetMin;
  }

  private dayLabel(date: Date, b: ConversationFacts['business']): string {
    const fmt = (d: Date) =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: b.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
    const key = fmt(date);
    if (key === fmt(new Date())) return 'Today';
    if (key === fmt(new Date(Date.now() - DAY))) return 'Yesterday';
    return new Intl.DateTimeFormat(b.locale, {
      day: 'numeric',
      month: 'short',
      timeZone: b.timezone,
    }).format(date);
  }

  // ─── Channels ─────────────────────────────────────────────────────────

  /** Real connection state per channel — never "healthy" for something that is not connected. */
  async channelStates(businessId: string) {
    const [integration, accounts] = await Promise.all([
      this.prisma.integration.findUnique({
        where: { businessId_provider: { businessId, provider: 'whatsapp' } },
      }),
      this.prisma.socialAccount.findMany({ where: { businessId } }),
    ]);
    const env = (k: string) => !!this.config.get<string>(k);
    const map = new Map<
      string,
      { st: string; handle: string; cta: string | null; href: string | null }
    >();
    for (const def of INBOX_CHANNELS) {
      if (def.key === 'whatsapp') {
        const meta = (integration?.meta ?? {}) as Record<string, unknown>;
        const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
        const number = str(meta.displayPhoneNumber) ?? str(meta.verifiedName);
        if (integration?.status === 'connected' && !integration.pausedAt) {
          map.set(def.key, {
            st: 'Connected',
            handle: number ?? 'Your WhatsApp Business number',
            cta: 'Manage',
            href: '/integrations/whatsapp',
          });
        } else if (integration?.status === 'needs_attention') {
          map.set(def.key, {
            st: 'Reconnect needed',
            handle: number ?? 'Your WhatsApp Business number',
            cta: 'Reconnect',
            href: '/integrations/whatsapp',
          });
        } else if (env('META_WA_TOKEN') && env('META_WA_PHONE_ID')) {
          map.set(def.key, {
            st: 'Connected',
            handle: 'Noxtill shared number',
            cta: 'Use your own number',
            href: '/integrations/whatsapp',
          });
        } else {
          map.set(def.key, {
            st: 'Not configured',
            handle: 'No WhatsApp number',
            cta: 'Connect',
            href: '/integrations/whatsapp',
          });
        }
      } else if (def.key === 'sms') {
        const ok =
          env('TWILIO_ACCOUNT_SID') &&
          env('TWILIO_AUTH_TOKEN') &&
          env('TWILIO_FROM_NUMBER');
        map.set(def.key, {
          st: ok ? 'Connected' : 'Not configured',
          handle: ok
            ? String(this.config.get('TWILIO_FROM_NUMBER'))
            : 'No sending number set up',
          cta: null,
          href: null,
        });
      } else if (def.key === 'email') {
        const ok = env('EMAIL_PROVIDER_KEY') && env('EMAIL_FROM_ADDRESS');
        map.set(def.key, {
          st: ok ? 'Sending only' : 'Not configured',
          handle: ok
            ? String(this.config.get('EMAIL_FROM_ADDRESS'))
            : 'No sending address set up',
          cta: null,
          href: null,
        });
      } else if (def.transport === 'social') {
        const acc = accounts.find((a) => a.platform === def.platform);
        const st =
          acc?.status === 'connected'
            ? 'Connected'
            : acc?.status === 'needs_attention'
              ? 'Reconnect needed'
              : 'Not connected';
        map.set(def.key, {
          st,
          handle: acc?.externalAccountName ?? 'Not connected',
          cta:
            st === 'Connected'
              ? 'Manage'
              : st === 'Reconnect needed'
                ? 'Reconnect'
                : 'Connect',
          href: '/social/accounts',
        });
      } else {
        map.set(def.key, {
          st: 'Not available',
          handle: 'Not available',
          cta: null,
          href: null,
        });
      }
    }
    return map;
  }

  async overview(user: AuthenticatedUser) {
    const businessId = user.businessId;
    const [states, rail, people, tags, canManage, attention, me] =
      await Promise.all([
        this.channelStates(businessId),
        this.inbox.railCounts(user),
        this.core.people(businessId),
        this.inbox.tagsInUse(user),
        this.inbox.canManage(),
        this.attentionItems(user),
        this.core.personName(businessId, user.sub),
      ]);
    const unreadOf = (k: string) =>
      rail.find((r) => r.channel === k)?.unread ?? 0;
    const known = new Set(INBOX_CHANNELS.map((c) => c.key));
    const extra = rail
      .filter((r) => !known.has(r.channel))
      .map((r) => channelDef(r.channel));
    const channels = [...INBOX_CHANNELS, ...extra].map((def) => {
      const st = states.get(def.key)?.st ?? 'Connected';
      const warn = st === 'Connected' || st === 'Sending only' ? '' : st;
      return {
        key: def.key,
        n: def.short,
        icon: def.icon,
        init: def.initials,
        unread: unreadOf(def.key),
        warn,
        hasConversations: rail.some((r) => r.channel === def.key),
      };
    });
    const totalUnread = rail.reduce((s, r) => s + r.unread, 0);
    const myRole = people.find((p) => p.userId === user.sub);
    return {
      channels,
      totalUnread,
      attentionCount: attention.length,
      people: people.map((p) => ({
        userId: p.userId,
        name: p.name,
        roleLabel: p.roleLabel,
      })),
      tags,
      canManage,
      me: {
        userId: user.sub,
        name: me ?? 'You',
        roleLabel: myRole?.roleLabel ?? user.role,
      },
    };
  }

  async channels(user: AuthenticatedUser) {
    const businessId = user.businessId;
    const since7 = new Date(Date.now() - 7 * DAY);
    const since30 = new Date(Date.now() - 30 * DAY);
    const [states, vol, replied] = await Promise.all([
      this.channelStates(businessId),
      this.prisma.$queryRaw<{ channel: string; n: bigint | number }[]>`
        SELECT c.channel AS channel, COUNT(*) AS n FROM inbox_messages m
        JOIN inbox_conversations c ON c.id = m.conversation_id
        WHERE m.business_id = ${businessId} AND m.kind = 'in' AND m.created_at >= ${since7}
        GROUP BY c.channel ORDER BY c.channel
      `,
      this.tenantPrisma.client.inboxConversation.findMany({
        where: {
          businessId,
          firstReplyAt: { gte: since30 },
          firstReplyMinutes: { not: null },
        },
        select: { channel: true, firstReplyMinutes: true },
      }),
    ]);
    const s = await this.settings.get(businessId);
    return {
      cards: INBOX_CHANNELS.map((def) => {
        const state = states.get(def.key)!;
        const n = Number(vol.find((v) => v.channel === def.key)?.n ?? 0);
        const med = median(
          replied
            .filter((r) => r.channel === def.key)
            .map((r) => r.firstReplyMinutes!),
        );
        const target =
          def.key === 'email' ? s.emailReplyTargetMin : s.firstReplyTargetMin;
        return {
          key: def.key,
          n: def.label,
          icon: def.icon,
          init: def.initials,
          handle: state.handle,
          st: state.st,
          note: def.note,
          vol: def.transport === 'none' ? '—' : n.toLocaleString('en-US'),
          resp: fmtMinutes(med),
          respLate: med !== null && med > target,
          cta: state.cta,
          href: state.href,
        };
      }),
    };
  }

  // ─── Team ─────────────────────────────────────────────────────────────

  async team(user: AuthenticatedUser) {
    const businessId = user.businessId;
    const s = await this.settings.get(businessId);
    const visible = await this.inbox.visibility(user);
    const now = new Date();
    const [open, people, replies30, me] = await Promise.all([
      this.tenantPrisma.client.inboxConversation.findMany({
        where: { businessId, status: 'open', ...visible },
        orderBy: { lastMessageAt: 'desc' },
        take: 1000,
      }),
      this.core.people(businessId),
      this.tenantPrisma.client.inboxMessage.findMany({
        where: {
          businessId,
          kind: 'out',
          authorUserId: { not: null },
          createdAt: { gte: new Date(Date.now() - 30 * DAY) },
        },
        select: { authorUserId: true, conversationId: true, createdAt: true },
      }),
      this.core.personName(businessId, user.sub),
    ]);
    const firstReplies =
      await this.tenantPrisma.client.inboxConversation.findMany({
        where: {
          businessId,
          firstReplyAt: { gte: new Date(Date.now() - 30 * DAY) },
          firstReplyMinutes: { not: null },
        },
        select: { assigneeUserId: true, firstReplyMinutes: true },
      });

    const waitMin = (c: InboxConversation) =>
      c.awaitingReplySince
        ? workingMinutesBetween(c.awaitingReplySince, now, s.hours, s.timezone)
        : null;
    const pastPromise = (c: InboxConversation) => {
      const w = waitMin(c);
      return w !== null && w > this.targetFor(c, s)
        ? w - this.targetFor(c, s)
        : null;
    };
    const unassigned = open
      .filter((c) => !c.assigneeUserId)
      .sort((a, b) => (waitMin(b) ?? -1) - (waitMin(a) ?? -1));
    const over = open.map(pastPromise).filter((x): x is number => x !== null);
    const assignees = new Set(
      open.map((c) => c.assigneeUserId).filter(Boolean),
    );

    // "What this person usually handles in a day": distinct conversations they replied in, per day they replied at all.
    const usual = (uid: string) => {
      const mine = replies30.filter((r) => r.authorUserId === uid);
      const days = new Set(
        mine.map((r) => r.createdAt.toISOString().slice(0, 10)),
      );
      const convDays = new Set(
        mine.map(
          (r) =>
            `${r.createdAt.toISOString().slice(0, 10)}:${r.conversationId}`,
        ),
      );
      return days.size ? convDays.size / days.size : 0;
    };
    const openCount = (uid: string) =>
      open.filter((c) => c.assigneeUserId === uid).length;
    const lightest = [...people].sort(
      (a, b) => openCount(a.userId) - openCount(b.userId),
    )[0];

    // Who has handled this customer before — a real reason to suggest them.
    const priorOwners = new Map<string, string>();
    const customerIds = unassigned
      .map((c) => c.customerId)
      .filter((x): x is string => !!x);
    if (customerIds.length) {
      const prior = await this.tenantPrisma.client.inboxConversation.findMany({
        where: {
          businessId,
          customerId: { in: customerIds },
          assigneeUserId: { not: null },
        },
        orderBy: { lastMessageAt: 'desc' },
        select: { customerId: true, assigneeUserId: true },
      });
      for (const p of prior)
        if (!priorOwners.has(p.customerId!))
          priorOwners.set(p.customerId!, p.assigneeUserId!);
    }

    const rows = people.map((p) => {
      const mine = open.filter((c) => c.assigneeUserId === p.userId);
      const u = usual(p.userId);
      const resp = median(
        firstReplies
          .filter((f) => f.assigneeUserId === p.userId)
          .map((f) => f.firstReplyMinutes!),
      );
      const load = Math.min(
        100,
        Math.round((mine.length / Math.max(u, 1)) * 100),
      );
      return {
        userId: p.userId,
        n: p.name,
        r: p.roleLabel,
        init: initials(p.name),
        open: mine.length,
        waiting: mine.filter((c) => !c.awaitingReplySince).length,
        over: mine.filter((c) => pastPromise(c) !== null).length,
        resp: fmtMinutes(resp),
        respLate: resp !== null && resp > s.firstReplyTargetMin,
        load,
      };
    });

    const oldest = unassigned.length ? waitMin(unassigned[0]) : null;
    return {
      kpis: [
        {
          l: 'Nobody has these',
          v: String(unassigned.length),
          sub: unassigned.length
            ? `oldest is ${fmtMinutes(oldest)}`
            : 'every open conversation has an owner',
          tone: unassigned.length ? 'red' : 'neutral',
        },
        {
          l: 'Yours',
          v: String(openCount(user.sub)),
          sub: `assigned to ${me ?? 'you'}`,
          tone: 'neutral',
        },
        {
          l: 'Team open',
          v: String(open.length),
          sub: `across ${assignees.size} ${assignees.size === 1 ? 'person' : 'people'}`,
          tone: 'neutral',
        },
        {
          l: 'Past their promise',
          v: String(over.length),
          sub: over.length
            ? `worst is ${fmtMinutes(Math.max(...over))} over`
            : 'nothing past its reply target',
          tone: over.length ? 'amber' : 'neutral',
        },
      ],
      unassigned: await Promise.all(
        unassigned.slice(0, 20).map(async (c) => {
          const f = await this.facts.forConversation(businessId, c);
          const prior = c.customerId
            ? priorOwners.get(c.customerId)
            : undefined;
          const priorName = prior
            ? people.find((p) => p.userId === prior)?.name
            : undefined;
          return {
            id: c.id,
            n: c.contactName,
            ch: channelDef(c.channel).short,
            age: fmtMinutes(waitMin(c)),
            why: this.facts.contextCards(f)[0]?.t ?? c.lastMessagePreview,
            sug:
              prior && priorName
                ? {
                    userId: prior,
                    text: `${priorName} — handled this customer before`,
                  }
                : lightest
                  ? {
                      userId: lightest.userId,
                      text: `${lightest.name} — lightest load right now`,
                    }
                  : null,
          };
        }),
      ),
      rows,
      teams: [...new Set(people.map((p) => p.roleLabel))],
      people: people.map((p) => ({
        userId: p.userId,
        name: p.name,
        roleLabel: p.roleLabel,
        open: openCount(p.userId),
      })),
      conversations: open.map((c) => ({
        id: c.id,
        name: c.contactName,
        channel: channelDef(c.channel).short,
        assigneeUserId: c.assigneeUserId,
      })),
    };
  }

  // ─── Attention ────────────────────────────────────────────────────────

  async attentionItems(user: AuthenticatedUser) {
    const businessId = user.businessId;
    const s = await this.settings.get(businessId);
    const visible = await this.inbox.visibility(user);
    const now = new Date();
    const open = await this.tenantPrisma.client.inboxConversation.findMany({
      where: { businessId, status: 'open', ...visible },
      take: 1000,
    });
    const stakes = await this.inbox.outstandingByCustomer(businessId, [
      ...new Set(open.map((c) => c.customerId).filter((x): x is string => !!x)),
    ]);
    const out: {
      conv: InboxConversation;
      reasons: string[];
      tag: string;
      stake: number;
      wait: number | null;
    }[] = [];
    for (const c of open) {
      const tags = tagList(c.tags);
      const wait = c.awaitingReplySince
        ? workingMinutesBetween(c.awaitingReplySince, now, s.hours, s.timezone)
        : null;
      const reasons: string[] = [];
      let tag = '';
      const money = tags.some((t) => t.toLowerCase() === 'money');
      const stake = c.customerId ? (stakes.get(c.customerId) ?? 0) : 0;
      if (money && wait !== null) {
        reasons.push(
          'Tagged Money by your rules and still waiting on a reply.',
        );
        tag = 'Money';
      }
      if (!c.assigneeUserId && wait !== null && wait >= s.unassignedTargetMin) {
        reasons.push(
          `Nobody has been assigned for ${fmtMinutes(wait)} — the target is ${s.unassignedTargetMin} min.`,
        );
        tag = tag || 'Nobody owns this';
      }
      if (c.flaggedAt) {
        reasons.push('Flagged by an automation rule for going unanswered.');
        tag = tag || 'Flagged';
      }
      const target = this.targetFor(c, s);
      if (wait !== null && wait > target && !reasons.length) {
        reasons.push(
          `Waiting ${fmtMinutes(wait)} against a ${fmtMinutes(target)} reply target.`,
        );
        tag = 'Past promise';
      }
      if (!reasons.length) continue;
      if (stake > 0)
        reasons.push(
          `${this.facts.money(stake, await this.facts.business(businessId))} is outstanding on their credit record.`,
        );
      out.push({ conv: c, reasons, tag, stake, wait });
    }
    return out.sort(
      (a, b) =>
        b.stake - a.stake ||
        (b.tag === 'Money' ? 1 : 0) - (a.tag === 'Money' ? 1 : 0) ||
        (b.wait ?? 0) - (a.wait ?? 0),
    );
  }

  async attention(user: AuthenticatedUser) {
    const businessId = user.businessId;
    const s = await this.settings.get(businessId);
    const items = await this.attentionItems(user);
    const lastIns = await this.tenantPrisma.client.inboxMessage.findMany({
      where: {
        conversationId: { in: items.map((i) => i.conv.id) },
        kind: 'in',
      },
      orderBy: { createdAt: 'desc' },
      select: { conversationId: true, body: true },
    });
    const since30 = new Date(Date.now() - 30 * DAY);
    const replied = await this.tenantPrisma.client.inboxConversation.findMany({
      where: {
        businessId,
        firstReplyAt: { gte: since30 },
        firstReplyMinutes: { not: null },
      },
      select: { channel: true, firstReplyMinutes: true, tags: true },
    });
    const chat = median(
      replied
        .filter((r) => r.channel !== 'email')
        .map((r) => r.firstReplyMinutes!),
    );
    const email = median(
      replied
        .filter((r) => r.channel === 'email')
        .map((r) => r.firstReplyMinutes!),
    );
    const money = median(
      replied
        .filter((r) => tagList(r.tags).some((t) => t.toLowerCase() === 'money'))
        .map((r) => r.firstReplyMinutes!),
    );
    const now = new Date();
    const unassignedOpen =
      await this.tenantPrisma.client.inboxConversation.findMany({
        where: {
          businessId,
          status: 'open',
          assigneeUserId: null,
          awaitingReplySince: { not: null },
        },
        select: { firstInboundAt: true, createdAt: true },
      });
    const longestUnassigned = unassignedOpen.length
      ? Math.max(
          ...unassignedOpen.map((c) =>
            workingMinutesBetween(
              c.firstInboundAt ?? c.createdAt,
              now,
              s.hours,
              s.timezone,
            ),
          ),
        )
      : null;
    const state = (
      actual: number | null,
      target: number,
      zeroIsFine = false,
    ): Tone => {
      if (actual === null) return zeroIsFine ? 'Holding' : 'No data';
      if (actual <= target) return 'Holding';
      if (actual <= target * 2) return 'Slipping';
      return 'Broken';
    };
    const hoursRows = describeWeeklyHours(s.hours);
    return {
      items: items.map((i) => ({
        id: i.conv.id,
        init: initials(i.conv.contactName),
        name: i.conv.contactName,
        tag: i.tag,
        age: i.wait !== null ? `waiting ${fmtMinutes(i.wait)}` : '',
        what:
          lastIns.find((m) => m.conversationId === i.conv.id)?.body ??
          i.conv.lastMessagePreview,
        why: i.reasons.join(' '),
        red: i.tag !== 'Past promise',
        assigneeUserId: i.conv.assigneeUserId,
      })),
      sla: [
        {
          n: 'First reply, WhatsApp, SMS and social',
          target: fmtMinutes(s.firstReplyTargetMin),
          actual: fmtMinutes(chat),
          st: state(chat, s.firstReplyTargetMin),
        },
        {
          n: 'First reply, email',
          target: fmtMinutes(s.emailReplyTargetMin),
          actual: fmtMinutes(email),
          st: state(email, s.emailReplyTargetMin),
        },
        {
          n: 'Money questions answered',
          target: fmtMinutes(s.moneyReplyTargetMin),
          actual: fmtMinutes(money),
          st: state(money, s.moneyReplyTargetMin),
        },
        {
          n: 'Nothing left unassigned',
          target: fmtMinutes(s.unassignedTargetMin),
          actual:
            longestUnassigned === null
              ? 'None waiting'
              : fmtMinutes(longestUnassigned),
          st: state(longestUnassigned, s.unassignedTargetMin, true),
        },
      ],
      targets: {
        firstReplyTargetMin: s.firstReplyTargetMin,
        emailReplyTargetMin: s.emailReplyTargetMin,
        moneyReplyTargetMin: s.moneyReplyTargetMin,
        unassignedTargetMin: s.unassignedTargetMin,
      },
      clockNote: hasHours(s.hours)
        ? `Outside working hours nothing is counted as late — the clock only runs during your hours (${hoursRows
            .filter((r) => r.ranges)
            .map((r) => `${r.days} ${r.ranges}`)
            .join('; ')}).`
        : 'No working hours are set, so waiting time is counted around the clock. Set hours in Settings to stop the clock overnight.',
    };
  }

  // ─── Analytics ────────────────────────────────────────────────────────

  async analytics(user: AuthenticatedUser) {
    const businessId = user.businessId;
    const s = await this.settings.get(businessId);
    const since30 = new Date(Date.now() - 30 * DAY);
    const [ins, replied, neverAnswered, convs30] = await Promise.all([
      this.tenantPrisma.client.inboxMessage.findMany({
        where: { businessId, kind: 'in', createdAt: { gte: since30 } },
        select: { createdAt: true },
        take: 50000,
      }),
      this.tenantPrisma.client.inboxConversation.findMany({
        where: {
          businessId,
          firstReplyAt: { gte: since30 },
          firstReplyMinutes: { not: null },
        },
        select: { channel: true, firstReplyMinutes: true },
      }),
      this.tenantPrisma.client.inboxConversation.count({
        where: {
          businessId,
          firstInboundAt: { lte: new Date(Date.now() - 7 * DAY) },
          firstReplyAt: null,
        },
      }),
      this.tenantPrisma.client.inboxConversation.findMany({
        where: {
          businessId,
          lastMessageAt: { gte: since30 },
          firstInboundAt: { not: null },
        },
        select: { tags: true },
      }),
    ]);
    const all = replied.map((r) => r.firstReplyMinutes!);
    const med = median(all);
    const inside = replied.filter(
      (r) =>
        r.firstReplyMinutes! <=
        (r.channel === 'email' ? s.emailReplyTargetMin : s.firstReplyTargetMin),
    ).length;
    const byChannel = [...new Set(replied.map((r) => r.channel))]
      .map((ch) => ({
        ch,
        med: median(
          replied
            .filter((r) => r.channel === ch)
            .map((r) => r.firstReplyMinutes!),
        )!,
        n: replied.filter((r) => r.channel === ch).length,
      }))
      .sort((a, b) => a.med - b.med);
    const slowest =
      byChannel.length > 1 ? byChannel[byChannel.length - 1] : null;
    const maxMed = Math.max(1, ...byChannel.map((c) => c.med));

    // Arrivals by local hour, averaged over the 30 days.
    const hourCounts = new Array<number>(24).fill(0);
    const hf = new Intl.DateTimeFormat('en-US', {
      timeZone: s.timezone,
      hour: '2-digit',
      hourCycle: 'h23',
    });
    for (const m of ins) hourCounts[Number(hf.format(m.createdAt)) % 24]++;
    let from = 8;
    let to = 21;
    if (hasHours(s.hours)) {
      const ranges = Object.values(s.hours).flat();
      from = Math.min(...ranges.map(([a]) => Number(a.slice(0, 2))));
      to = Math.max(
        ...ranges.map(
          ([, b]) => Number(b.slice(0, 2)) - (b.endsWith(':00') ? 1 : 0),
        ),
      );
    }
    const hours: { l: string; v: number; h: string; level: number }[] = [];
    const maxHour = Math.max(1, ...hourCounts.slice(from, to + 1));
    for (let h = from; h <= to; h++) {
      const v = hourCounts[h];
      hours.push({
        l: `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`,
        v: Math.round((v / 30) * 10) / 10,
        h: `${Math.round((v / maxHour) * 100)}%`,
        level: v / maxHour > 0.75 ? 3 : v / maxHour > 0.45 ? 2 : 1,
      });
    }
    const outsideShown = hourCounts.reduce(
      (sum, v, h) => (h < from || h > to ? sum + v : sum),
      0,
    );

    const tagCounts = new Map<string, number>();
    let untagged = 0;
    for (const c of convs30) {
      const t = tagList(c.tags);
      if (t.length === 0) untagged++;
      for (const tag of t) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
    const total = convs30.length;
    const topics = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([n, v]) => ({ n, v }));
    const maxTopic = Math.max(1, ...topics.map((t) => t.v), untagged);
    const pct = (v: number) =>
      total ? `${Math.round((v / total) * 100)}%` : '0%';

    return {
      kpis: [
        {
          l: 'Messages in',
          v: ins.length.toLocaleString('en-US'),
          sub: 'last 30 days, all channels',
          tone: 'neutral',
        },
        {
          l: 'Median first reply',
          v: fmtMinutes(med),
          sub: `target is ${s.firstReplyTargetMin} min`,
          tone:
            med === null
              ? 'neutral'
              : med <= s.firstReplyTargetMin
                ? 'green'
                : 'amber',
        },
        {
          l: 'Answered inside target',
          v: replied.length
            ? `${Math.round((inside / replied.length) * 100)}%`
            : '—',
          sub: replied.length
            ? `${replied.length - inside} were not`
            : 'no replies in 30 days',
          tone: 'neutral',
        },
        {
          l: 'Slowest channel',
          v: slowest ? channelDef(slowest.ch).short : '—',
          sub: slowest
            ? `median ${fmtMinutes(slowest.med)}`
            : 'needs replies on two channels',
          tone: slowest ? 'amber' : 'neutral',
        },
        {
          l: 'Never answered',
          v: String(neverAnswered),
          sub: 'all older than 7 days',
          tone: neverAnswered ? 'red' : 'neutral',
        },
      ],
      channels: byChannel.map((c) => {
        const target =
          c.ch === 'email' ? s.emailReplyTargetMin : s.firstReplyTargetMin;
        return {
          n: channelDef(c.ch).short,
          v: fmtMinutes(c.med),
          w: `${Math.max(4, Math.round((c.med / maxMed) * 100))}%`,
          level:
            c.med <= target ? 'good' : c.med <= target * 2 ? 'warn' : 'bad',
        };
      }),
      targetText: `Median, last 30 days. Target is ${s.firstReplyTargetMin} minutes${s.emailReplyTargetMin !== s.firstReplyTargetMin ? ` (email ${fmtMinutes(s.emailReplyTargetMin)})` : ''}.`,
      hours,
      hoursNote: outsideShown
        ? `${outsideShown} message${outsideShown === 1 ? '' : 's'} arrived outside the hours shown.`
        : null,
      topics: [
        ...topics.map((t) => ({
          n: t.n,
          v: pct(t.v),
          w: `${Math.round((t.v / maxTopic) * 100)}%`,
          untagged: false,
        })),
        ...(total
          ? [
              {
                n: 'Untagged',
                v: pct(untagged),
                w: `${Math.round((untagged / maxTopic) * 100)}%`,
                untagged: true,
              },
            ]
          : []),
      ],
      topicsTotal: total,
    };
  }

  // ─── Customer 360 + Timeline ──────────────────────────────────────────

  async customer360(user: AuthenticatedUser, conversationId: string) {
    const conv = await this.inbox.find(user, conversationId);
    const f = await this.facts.forConversation(user.businessId, conv);
    const b = f.business;
    const c = f.customer;
    const { status, since } = this.inbox.customerStatus(c);
    if (!c) {
      return {
        customer: null,
        name: conv.contactName,
        init: initials(conv.contactName),
        status,
        since,
        handle: conv.contactHandle,
        channel: channelDef(conv.channel).short,
      };
    }
    const notes = await this.tenantPrisma.client.memoryNote.findMany({
      where: { subjectType: 'customer', subjectId: c.customer.id },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      take: 20,
    });
    const authors = await this.prisma.user.findMany({
      where: {
        id: {
          in: notes.map((n) => n.authorUserId).filter((x): x is string => !!x),
        },
      },
      select: { id: true, name: true },
    });
    const orderStatus = (o: (typeof c.recentOrders)[number]) => {
      if (o.status === 'cancelled') return { s: 'Cancelled', tone: 'neutral' };
      if (o.delivery?.status === 'failed')
        return { s: 'Delivery failed', tone: 'red' };
      if (
        o.delivery &&
        ['assigned', 'picked_up', 'en_route'].includes(o.delivery.status)
      )
        return { s: 'Out for delivery', tone: 'blue' };
      if (o.delivery?.status === 'delivered')
        return { s: 'Delivered', tone: 'green' };
      if (o.status === 'completed') return { s: 'Completed', tone: 'green' };
      return {
        s: o.status.replace('_', ' ').replace(/^./, (x) => x.toUpperCase()),
        tone: 'amber',
      };
    };
    return {
      customer: {
        id: c.customer.id,
        name: c.customer.name,
        init: initials(c.customer.name),
        status,
        since,
        phone: c.customer.phone,
        email: c.customer.email ?? 'No email recorded',
        loc: c.customer.address ?? 'No address recorded',
        tags: c.customer.tags,
        stats: [
          { l: 'Orders', v: String(c.ordersCount) },
          { l: 'Total spent', v: this.facts.money(c.spent, b) },
          {
            l: 'Average order',
            v: c.ordersCount
              ? this.facts.money(c.spent / c.ordersCount, b)
              : '—',
          },
          { l: 'Outstanding', v: this.facts.money(c.outstanding, b) },
        ],
        orders: c.recentOrders.map((o) => ({
          id: o.id,
          no: `#${o.orderNo}`,
          d: `${this.dayLabel(o.createdAt, b)}, ${this.facts.time(o.createdAt, b)}`,
          v: this.facts.money(o.total, b),
          ...orderStatus(o),
        })),
        bookings: c.bookings.map((bk) => ({
          id: bk.id,
          t: `${bk.service}${bk.staff ? ` with ${bk.staff}` : ''}`,
          d: this.facts.dateTime(bk.startsAt, b),
          s:
            bk.startsAt.getTime() > Date.now() &&
            ['requested', 'booked', 'confirmed'].includes(bk.status)
              ? 'Upcoming'
              : bk.status
                  .replace('_', ' ')
                  .replace(/^./, (x) => x.toUpperCase()),
          tone:
            bk.status === 'completed'
              ? 'green'
              : bk.status === 'cancelled' || bk.status === 'no_show'
                ? 'red'
                : 'blue',
        })),
        credit: {
          out: this.facts.money(c.outstanding, b),
          over: this.facts.money(c.overdue, b),
          last: c.lastPayment
            ? `${this.facts.money(c.lastPayment.amount, b)} on ${this.dayLabel(c.lastPayment.at, b)}${c.lastPayment.method ? `, ${c.lastPayment.method}` : ''}`
            : 'No payment recorded',
        },
        review: c.lastReview
          ? {
              rating: c.lastReview.stars.toFixed(1),
              when: this.dayLabel(c.lastReview.at, b),
              text: c.lastReview.message
                ? `"${c.lastReview.message}"`
                : 'No written comment.',
            }
          : null,
        notes: notes.map((n) => ({
          id: n.id,
          t: n.body,
          who: authors.find((a) => a.id === n.authorUserId)?.name ?? 'Team',
          when: this.dayLabel(n.createdAt, b),
        })),
      },
    };
  }

  async timeline(
    user: AuthenticatedUser,
    conversationId: string,
    filter = 'Everything',
  ) {
    const conv = await this.inbox.find(user, conversationId);
    const businessId = user.businessId;
    const b = await this.facts.business(businessId);
    type Ev = {
      at: Date;
      kind: string;
      title: string;
      detail: string;
      who: string;
      link: { label: string; kind: string; ref?: string; href?: string } | null;
    };
    const events: Ev[] = [];
    const customerId = conv.customerId;

    const convIds = customerId
      ? (
          await this.tenantPrisma.client.inboxConversation.findMany({
            where: { businessId, customerId },
            select: { id: true },
          })
        ).map((c) => c.id)
      : [conv.id];
    const msgs = await this.tenantPrisma.client.inboxMessage.findMany({
      where: { conversationId: { in: convIds }, kind: { in: ['in', 'out'] } },
      orderBy: { createdAt: 'desc' },
      take: 60,
      include: {
        conversation: { select: { channel: true, contactName: true } },
      },
    });
    for (const m of msgs) {
      const ch = channelDef(m.conversation.channel).short;
      events.push({
        at: m.createdAt,
        kind: 'Messages',
        title:
          m.kind === 'in'
            ? `${m.conversation.contactName} wrote on ${ch}`
            : `${m.authorName ?? 'Team'} replied on ${ch}`,
        detail: m.body.length > 160 ? `${m.body.slice(0, 160)}…` : m.body,
        who:
          m.kind === 'in'
            ? m.conversation.contactName
            : (m.authorName ?? 'Team'),
        link: null,
      });
    }

    if (customerId) {
      const [orders, credit, appts, reviews, automated] = await Promise.all([
        this.tenantPrisma.client.order.findMany({
          where: { businessId, customerId, isQuotation: false },
          orderBy: { createdAt: 'desc' },
          take: 30,
          select: {
            id: true,
            orderNo: true,
            total: true,
            status: true,
            createdAt: true,
            _count: { select: { items: true } },
            payments: {
              select: { id: true, amount: true, method: true, createdAt: true },
            },
            delivery: {
              select: {
                status: true,
                deliveredAt: true,
                assignedAt: true,
                failureReason: true,
                rider: { select: { name: true } },
              },
            },
            staffUser: { select: { user: { select: { name: true } } } },
          },
        }),
        this.tenantPrisma.client.creditEntry.findMany({
          where: { businessId, customerId, kind: 'payment' },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        this.tenantPrisma.client.appointment.findMany({
          where: { businessId, customerId },
          orderBy: { startsAt: 'desc' },
          take: 20,
          select: {
            id: true,
            bookingNo: true,
            startsAt: true,
            status: true,
            createdAt: true,
            service: { select: { name: true } },
            staffUser: { select: { user: { select: { name: true } } } },
          },
        }),
        this.tenantPrisma.client.reviewRequest.findMany({
          where: { businessId, customerId, stars: { not: null } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        this.tenantPrisma.client.message.findMany({
          where: {
            businessId,
            customerId,
            templateKey: { not: 'inbox_reply' },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
      ]);
      for (const o of orders) {
        const link = { label: `#${o.orderNo}`, kind: 'order', ref: o.id };
        events.push({
          at: o.createdAt,
          kind: 'Orders',
          title: 'Order placed',
          detail: `${o._count.items} item${o._count.items === 1 ? '' : 's'} · ${this.facts.money(Number(o.total), b)} · ${o.status.replace('_', ' ')}`,
          who: o.staffUser?.user.name ?? 'Recorded in Noxtill',
          link,
        });
        if (o.delivery?.assignedAt)
          events.push({
            at: o.delivery.assignedAt,
            kind: 'Orders',
            title: 'Order handed to a rider',
            detail: o.delivery.rider?.name ?? 'Rider not recorded',
            who: 'Delivery',
            link,
          });
        if (o.delivery?.deliveredAt && o.delivery.status === 'delivered')
          events.push({
            at: o.delivery.deliveredAt,
            kind: 'Orders',
            title: 'Order delivered',
            detail: o.delivery.rider?.name
              ? `By ${o.delivery.rider.name}`
              : 'Delivered',
            who: 'Delivery',
            link,
          });
        if (o.delivery?.status === 'failed')
          events.push({
            at: o.delivery.deliveredAt ?? o.createdAt,
            kind: 'Orders',
            title: 'Delivery failed',
            detail: o.delivery.failureReason ?? 'No reason recorded',
            who: 'Delivery',
            link,
          });
        for (const p of o.payments.filter((x) => x.method !== 'credit')) {
          events.push({
            at: p.createdAt,
            kind: 'Payments',
            title: `Paid by ${p.method}`,
            detail: `${this.facts.money(Number(p.amount), b)} on order #${o.orderNo}`,
            who: 'Payment recorded',
            link,
          });
        }
      }
      for (const e of credit) {
        events.push({
          at: e.createdAt,
          kind: 'Payments',
          title: 'Credit payment received',
          detail: `${this.facts.money(Number(e.amount), b)}${e.method ? ` by ${e.method}` : ''}${e.note ? ` · ${e.note}` : ''}`,
          who: 'Credit ledger',
          link: {
            label: 'Credit record',
            kind: 'link',
            href: `/credit/${customerId}`,
          },
        });
      }
      for (const a of appts) {
        events.push({
          at: a.status === 'completed' ? a.startsAt : a.createdAt,
          kind: 'Bookings',
          title:
            a.status === 'completed'
              ? 'Booking completed'
              : a.status === 'cancelled'
                ? 'Booking cancelled'
                : a.status === 'no_show'
                  ? 'Did not show up'
                  : `Booked for ${this.facts.dateTime(a.startsAt, b)}`,
          detail: `${a.service.name}${a.staffUser ? ` with ${a.staffUser.user.name}` : ''}`,
          who: a.staffUser?.user.name ?? 'Bookings',
          link: {
            label: a.bookingNo ? `BK-${a.bookingNo}` : 'Bookings',
            kind: 'link',
            href: '/bookings/appointments',
          },
        });
      }
      for (const r of reviews) {
        events.push({
          at: r.respondedAt ?? r.createdAt,
          kind: 'Reviews',
          title: `Left a ${r.stars}-star review`,
          detail: r.message ? `"${r.message}"` : 'No written comment',
          who: conv.contactName,
          link: null,
        });
      }
      for (const m of automated) {
        events.push({
          at: m.createdAt,
          kind: 'Messages',
          title: `Automatic ${m.templateKey.replace(/_/g, ' ')} sent`,
          detail: `By ${m.channel} · ${m.status}`,
          who: 'Noxtill messaging',
          link: null,
        });
      }
    }

    const filtered = events
      .filter((e) => filter === 'Everything' || e.kind === filter)
      .sort((a, b2) => b2.at.getTime() - a.at.getTime())
      .slice(0, 80);
    return {
      name: conv.contactName,
      linked: !!customerId,
      events: filtered.map((e) => ({
        d: this.dayLabel(e.at, b),
        t: this.facts.time(e.at, b),
        kind: e.kind,
        title: e.title,
        detail: e.detail,
        who: e.who,
        link: e.link,
      })),
    };
  }

  // ─── AI Assist / AI Actions ───────────────────────────────────────────

  async aiAssist(user: AuthenticatedUser) {
    const businessId = user.businessId;
    const s = await this.settings.get(businessId);
    const visible = await this.inbox.visibility(user);
    const since30 = new Date(Date.now() - 30 * DAY);
    const [pending, stats, waiting] = await Promise.all([
      this.tenantPrisma.client.inboxAiDraft.findMany({
        where: {
          businessId,
          status: 'pending',
          conversation: { status: { not: 'closed' }, ...visible },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { conversation: true },
      }),
      this.tenantPrisma.client.inboxAiDraft.groupBy({
        by: ['status'],
        where: { businessId, createdAt: { gte: since30 } },
        _count: { _all: true },
      }),
      this.tenantPrisma.client.inboxConversation.findMany({
        where: {
          businessId,
          status: 'open',
          awaitingReplySince: { not: null },
          ...visible,
        },
        select: { id: true, awaitingReplySince: true },
      }),
    ]);
    const skips = waiting.length
      ? await this.tenantPrisma.client.inboxEvent.findMany({
          where: {
            conversationId: { in: waiting.map((w) => w.id) },
            kind: { in: [INBOX_EVENT.AI_SKIPPED, INBOX_EVENT.AI_DRAFTED] },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            conversationId: true,
            kind: true,
            createdAt: true,
            data: true,
          },
        })
      : [];
    const skipCause = (w: (typeof waiting)[number]) => {
      const latest = skips.find((e) => e.conversationId === w.id);
      if (
        latest?.kind !== INBOX_EVENT.AI_SKIPPED ||
        latest.createdAt < w.awaitingReplySince!
      )
        return null;
      return (
        ((latest.data as Record<string, unknown>)?.cause as
          string | undefined) ?? null
      );
    };
    const skippedCount = waiting.filter(
      (w) => skipCause(w) === 'no_facts',
    ).length;
    const unavailableCount = waiting.filter(
      (w) => skipCause(w) === 'ai_unavailable',
    ).length;
    const count = (st: string) =>
      stats.find((x) => x.status === st)?._count._all ?? 0;
    const decided = count('sent') + count('edited') + count('discarded');
    const offered = stats.reduce((sum, x) => sum + x._count._all, 0);
    const pct = (n: number) =>
      decided ? `${Math.round((n / decided) * 100)}%` : '—';
    const b = await this.facts.business(businessId);
    return {
      drafts: pending.map((d) => ({
        id: d.id,
        conversationId: d.conversationId,
        init: initials(d.conversation.contactName),
        name: d.conversation.contactName,
        channel: d.conversation.channel,
        when: d.createdAt.toISOString(),
        text: d.text,
        src: tagList(d.sources).join(' · ') || 'the conversation only',
        needsDecision: d.needsDecision,
        warn: d.warning,
      })),
      skippedCount,
      unavailableCount,
      settings: {
        tone: s.tone,
        language: s.language,
        aiAutoDraft: s.aiAutoDraft,
        aiFactsOnly: s.aiFactsOnly,
        aiNextAction: s.aiNextAction,
        aiSummarise: s.aiSummarise,
      },
      stats: [
        {
          l: 'Drafts offered',
          v: offered.toLocaleString('en-US'),
          tone: 'neutral',
        },
        { l: 'Sent as written', v: pct(count('sent')), tone: 'green' },
        { l: 'Edited before sending', v: pct(count('edited')), tone: 'amber' },
        { l: 'Discarded', v: pct(count('discarded')), tone: 'red' },
        {
          l: 'Replaced before anyone decided',
          v: count('superseded').toLocaleString('en-US'),
          tone: 'neutral',
        },
      ],
      currency: b.currency,
    };
  }

  async aiActions(user: AuthenticatedUser) {
    const businessId = user.businessId;
    const s = await this.settings.get(businessId);
    const tagRules = await this.tenantPrisma.client.inboxRule.count({
      where: { businessId, trigger: 'keyword', active: true },
    });
    const log = await this.tenantPrisma.client.inboxEvent.findMany({
      where: { businessId, kind: { startsWith: 'ai.' } },
      orderBy: { createdAt: 'desc' },
      take: 60,
    });
    const draftIds = log
      .map((l) => (l.data as Record<string, unknown>)?.draftId)
      .filter((x): x is string => typeof x === 'string');
    const drafts = draftIds.length
      ? await this.tenantPrisma.client.inboxAiDraft.findMany({
          where: { id: { in: draftIds } },
          select: { id: true, status: true },
        })
      : [];
    const b = await this.facts.business(businessId);
    const stateOf = (
      l: (typeof log)[number],
    ): { state: string; who: string } => {
      switch (l.kind) {
        case INBOX_EVENT.AI_READ:
          return { state: 'Done', who: 'No approval needed — read only' };
        case INBOX_EVENT.AI_DRAFTED: {
          const d = drafts.find(
            (x) => x.id === (l.data as Record<string, unknown>)?.draftId,
          );
          return d?.status === 'pending'
            ? {
                state: 'Waiting',
                who: (l.data as Record<string, unknown>)?.needsDecision
                  ? 'Waiting on someone who can manage credit'
                  : 'Waiting on a person to send or discard',
              }
            : { state: 'Done', who: 'Draft stored — decided separately below' };
        }
        case INBOX_EVENT.AI_SENT:
          return {
            state: 'Approved',
            who: `Approved and sent by ${l.actorName ?? 'a team member'}`,
          };
        case INBOX_EVENT.AI_EDITED:
          return {
            state: 'Approved',
            who: `Edited, then sent by ${l.actorName ?? 'a team member'}`,
          };
        case INBOX_EVENT.AI_DISCARDED:
          return {
            state: 'Declined',
            who: `Discarded by ${l.actorName ?? 'a team member'}`,
          };
        case INBOX_EVENT.AI_SKIPPED: {
          const cause = (l.data as Record<string, unknown>)?.cause;
          return {
            state: 'Skipped',
            who:
              cause === 'ai_unavailable'
                ? 'No draft made — the AI service could not be reached'
                : cause === 'read_off'
                  ? 'No draft made — reading records is turned off'
                  : 'No draft made — nothing certain to build it from',
          };
        }
        default:
          return {
            state: 'Done',
            who: l.actorName
              ? `Asked for by ${l.actorName}`
              : 'No approval needed',
          };
      }
    };
    return {
      actions: [
        {
          key: 'read',
          t: 'Read order, delivery and stock',
          d: 'Looks things up so a draft is right. Changes nothing.',
          mode: s.aiReadRecords ? 'Automatic' : 'Off',
          locked: false,
          setting: 'aiReadRecords',
          on: s.aiReadRecords,
          icon: 'eye',
        },
        {
          key: 'tag',
          t: 'Tag and sort conversations',
          d: 'Done by your keyword rules — word matching you can read, not AI guessing.',
          mode: tagRules ? 'Automatic' : 'No rules yet',
          locked: false,
          setting: null,
          link: 'automations',
          icon: 'tag',
        },
        {
          key: 'draft',
          t: 'Draft a reply',
          d: 'Writes it. A person reads it and presses send.',
          mode: s.aiAutoDraft ? 'Ask first' : 'Off',
          locked: false,
          setting: 'aiAutoDraft',
          on: s.aiAutoDraft,
          icon: 'pen',
        },
        {
          key: 'order',
          t: 'Create a draft order or quotation',
          d: 'Not something the inbox AI can do. A person creates orders and quotations in Orders.',
          mode: 'Not available',
          locked: true,
          setting: null,
          icon: 'file',
        },
        {
          key: 'money',
          t: 'Agree a payment delay or discount',
          d: 'AI can only draft words. A draft that touches what a customer owes can only be sent by someone who can manage credit.',
          mode: 'Not available',
          locked: true,
          setting: null,
          icon: 'money',
        },
        {
          key: 'refund',
          t: 'Issue a refund',
          d: 'Moves real money. Refunds are only done by a person in Orders → Returns.',
          mode: 'Not available',
          locked: true,
          setting: null,
          icon: 'refund',
        },
        {
          key: 'send',
          t: 'Send anything to a customer',
          d: 'No AI message reaches a customer without a person pressing send.',
          mode: 'Never automatic',
          locked: true,
          setting: null,
          icon: 'send',
        },
      ],
      log: log.map((l) => ({
        id: l.id,
        when: `${this.dayLabel(l.createdAt, b)} ${this.facts.time(l.createdAt, b)}`,
        t: l.detail ?? l.kind,
        conversationId: l.conversationId,
        ...stateOf(l),
      })),
    };
  }

  // ─── Automations ──────────────────────────────────────────────────────

  async automations(user: AuthenticatedUser) {
    const businessId = user.businessId;
    const b = await this.facts.business(businessId);
    const tz = b.timezone;
    const localDay = (d: Date) =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
    const today = localDay(new Date());
    const [rules, people, events, pendingToday] = await Promise.all([
      this.tenantPrisma.client.inboxRule.findMany({
        where: { businessId },
        orderBy: { createdAt: 'asc' },
      }),
      this.core.people(businessId),
      this.tenantPrisma.client.inboxEvent.findMany({
        where: {
          businessId,
          createdAt: { gte: new Date(Date.now() - 2 * DAY) },
          kind: {
            in: [
              INBOX_EVENT.RULE_TAGGED,
              INBOX_EVENT.RULE_ROUTED,
              INBOX_EVENT.RULE_FLAGGED,
              INBOX_EVENT.ASSIGNED,
            ],
          },
        },
        select: { kind: true, createdAt: true, data: true },
      }),
      this.tenantPrisma.client.inboxAiDraft.findMany({
        where: {
          businessId,
          status: 'pending',
          createdAt: { gte: new Date(Date.now() - 2 * DAY) },
        },
        select: { createdAt: true },
      }),
    ]);
    const weekAgo = new Date(Date.now() - 7 * DAY);
    const weekRuns = await this.tenantPrisma.client.inboxEvent.groupBy({
      by: ['ruleId'],
      where: { businessId, ruleId: { not: null }, createdAt: { gte: weekAgo } },
      _count: { _all: true },
    });
    const todays = events.filter((e) => localDay(e.createdAt) === today);
    const nameOf = (uid: string | null) =>
      uid
        ? (people.find((p) => p.userId === uid)?.name ?? 'Former staff')
        : null;
    return {
      rules: rules.map((r) => {
        const keywords = tagList(r.keywords);
        const when =
          r.trigger === 'keyword'
            ? `a message mentions ${keywords.map((k) => `"${k}"`).join(', ') || '(no words yet)'}`
            : r.trigger === 'unanswered'
              ? `nobody has replied for ${r.minutes} minutes in working hours`
              : 'a message arrives outside working hours';
        const then: string[] = [];
        if (r.tag) then.push(`tag it ${r.tag}`);
        if (r.pinToTop) then.push('move it to the top of the queue');
        if (r.assigneeUserId)
          then.push(`assign to ${nameOf(r.assigneeUserId)}`);
        if (r.flag || r.trigger === 'unanswered')
          then.push(
            'flag it on Attention and notify the assigned person (or Owners and Managers)',
          );
        if (r.message) then.push('send the away message once per conversation');
        const runs = weekRuns.find((w) => w.ruleId === r.id)?._count._all ?? 0;
        return {
          id: r.id,
          t: r.name,
          trigger: r.trigger,
          keywords,
          minutes: r.minutes,
          tag: r.tag,
          pinToTop: r.pinToTop,
          assigneeUserId: r.assigneeUserId,
          flag: r.flag,
          message: r.message,
          when,
          then: then.join(', ') || 'nothing yet — add an action',
          st: r.active ? 'On' : 'Paused',
          runs: r.active
            ? `Ran ${runs} time${runs === 1 ? '' : 's'} this week${r.lastRunAt ? ` · last ${this.dayLabel(r.lastRunAt, b).toLowerCase()} ${this.facts.time(r.lastRunAt, b)}` : ' · never run yet'}`
            : `Paused${r.pausedAt ? ` ${this.dayLabel(r.pausedAt, b)}` : ''}${r.pausedByName ? ` by ${r.pausedByName}` : ''}`,
          approval: r.message
            ? 'This one does send on its own. It is a fixed away message with no customer detail in it.'
            : '',
        };
      }),
      stats: [
        {
          v: String(
            todays.filter((e) => e.kind === INBOX_EVENT.RULE_TAGGED).length,
          ),
          l: 'Conversations tagged',
          tone: 'neutral',
        },
        {
          v: String(
            todays.filter(
              (e) =>
                e.kind === INBOX_EVENT.RULE_ROUTED ||
                (e.kind === INBOX_EVENT.ASSIGNED &&
                  (e.data as Record<string, unknown>)?.auto),
            ).length,
          ),
          l: 'Routed to the right person',
          tone: 'neutral',
        },
        {
          v: String(
            pendingToday.filter((d) => localDay(d.createdAt) === today).length,
          ),
          l: 'Drafts held for approval',
          tone: 'amber',
        },
        {
          v: String(
            todays.filter((e) => e.kind === INBOX_EVENT.RULE_FLAGGED).length,
          ),
          l: 'Flagged as running late',
          tone: 'red',
        },
      ],
      people: people.map((p) => ({ userId: p.userId, name: p.name })),
    };
  }

  async ruleHistory(user: AuthenticatedUser, ruleId: string) {
    const rule = await this.tenantPrisma.client.inboxRule.findFirst({
      where: { id: ruleId, businessId: user.businessId },
    });
    if (!rule)
      throw new AppException(
        INBOX_ERROR_CODES.RULE_INVALID,
        'Rule not found.',
        HttpStatus.NOT_FOUND,
      );
    const b = await this.facts.business(user.businessId);
    const events = await this.tenantPrisma.client.inboxEvent.findMany({
      where: { businessId: user.businessId, ruleId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      name: rule.name,
      runs: events.map((e) => ({
        when: `${this.dayLabel(e.createdAt, b)} ${this.facts.time(e.createdAt, b)}`,
        t: e.detail ?? e.kind,
        conversationId: e.conversationId,
      })),
    };
  }

  // ─── Settings ─────────────────────────────────────────────────────────

  async settingsView(user: AuthenticatedUser) {
    const businessId = user.businessId;
    const s = await this.settings.get(businessId);
    const [customRoles, awayRule, canManage] = await Promise.all([
      this.tenantPrisma.client.customRole.findMany({
        where: { businessId },
        select: { name: true, capabilities: true },
        orderBy: { name: 'asc' },
      }),
      this.tenantPrisma.client.inboxRule.findFirst({
        where: { businessId, trigger: 'out_of_hours' },
        orderBy: { createdAt: 'asc' },
      }),
      this.inbox.canManage(),
    ]);
    const holders = (cap: Capability) => {
      const system = (Object.keys(SYSTEM_ROLE_CAPABILITIES) as Role[])
        .filter((r) => SYSTEM_ROLE_CAPABILITIES[r].includes(cap))
        .map((r) => r.charAt(0).toUpperCase() + r.slice(1));
      const custom = customRoles
        .filter(
          (r) =>
            Array.isArray(r.capabilities) &&
            (r.capabilities as string[]).includes(cap),
        )
        .map((r) => r.name);
      return [...system, ...custom].join(', ') || 'Owner';
    };
    const hoursRows = describeWeeklyHours(s.hours);
    return {
      hours: hoursRows.map((r) => ({
        d: r.days,
        t: r.ranges ?? 'Closed',
        closed: !r.ranges,
      })),
      hoursSource: s.hoursSource,
      rawHours: s.hours,
      timezone: s.timezone,
      assignMode: s.assignMode,
      assignModes: [
        {
          key: 'free',
          t: 'Whoever is free',
          d: 'New conversations go to the active team member with the fewest open conversations.',
        },
        {
          key: 'topic',
          t: 'By topic',
          d: 'Only your keyword rules assign (for example bookings to one person). Anything no rule matches lands unassigned.',
        },
        {
          key: 'none',
          t: 'Nobody — pick it up yourself',
          d: 'Everything lands unassigned and staff take what they handle.',
        },
      ],
      perms: [
        {
          t: 'See every conversation',
          who: `${holders(CAPABILITIES.INBOX_MANAGE)}. Everyone else sees only what is assigned to them, plus unassigned conversations.`,
        },
        {
          t: 'Send a reply that touches what a customer owes',
          who: `${holders(CAPABILITIES.CREDIT_MANAGE)} — anyone who can manage credit.`,
        },
        {
          t: 'Issue a refund from a conversation',
          who: `Nobody — refunds are not issued from the inbox. In Orders, returns are approved by ${holders(CAPABILITIES.RETURNS_APPROVE)}.`,
        },
        {
          t: 'Delete a conversation',
          who: 'Nobody. Conversations can be closed, never removed. Erasing a customer blanks their message text.',
        },
        {
          t: 'Change inbox rules, settings and hand-overs',
          who: `${holders(CAPABILITIES.INBOX_MANAGE)}. Connecting social channels needs ${holders(CAPABILITIES.SOCIAL_MANAGE)}.`,
        },
      ],
      toggles: [
        {
          key: 'notifyUnassigned',
          l: 'Notify me when nobody has picked something up',
          d: `After ${s.unassignedTargetMin} minutes, to Owners and Managers, in the app.`,
          on: s.notifyUnassigned,
          locked: false,
        },
        {
          key: 'notifyMoney',
          l: 'Notify me when a money question comes in',
          d: 'Straight away, to Owners and Managers — when a message mentions paying, a refund, an invoice, a balance or a price.',
          on: s.notifyMoney,
          locked: false,
        },
        {
          key: 'away',
          l: 'Send an away message outside hours',
          d: hasHours(s.hours)
            ? 'Once per conversation, not per message. Edit the wording in Automations.'
            : 'Needs working hours first — without them nothing is ever out of hours.',
          on: !!awayRule?.active,
          locked: !hasHours(s.hours) && !awayRule?.active,
        },
        {
          key: 'readReceipts',
          l: 'Show read receipts to customers',
          d: 'Not available — Noxtill does not send read receipts on any channel.',
          on: false,
          locked: true,
        },
        {
          key: 'aiLog',
          l: 'Keep a full record of every AI action',
          d: 'Always on — every AI read, draft and decision is logged with a name against it.',
          on: true,
          locked: true,
        },
      ],
      awayMessage: awayRule?.message ?? null,
      retention:
        'Conversations are kept — nothing is removed automatically. Erasing a customer blanks the text of their messages but keeps their order and payment records.',
      canManage,
    };
  }
}
