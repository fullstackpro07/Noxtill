import { HttpStatus, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { InboxChannelsService } from '../unified-inbox/inbox-channels.service';
import { HdActor, HelpdeskContextService } from './helpdesk-context.service';
import { HelpdeskLoaderService, Loaded, TRow } from './helpdesk-loader.service';
import { HelpdeskOpsService } from './helpdesk-ops.service';
import { HelpdeskDeliveryService } from './helpdesk-delivery.service';
import { AnalyticsQuery } from './dto/helpdesk.dto';
import {
  CHANNELS,
  HD_ERRORS,
  HelpdeskConfig,
  PRIORITY_ORDER,
  VIA,
  isOpenStatus,
} from './helpdesk.constants';
import { localParts } from './helpdesk-sla.util';

const RANGE_DAYS: Record<string, number> = {
  Today: 1,
  '7 days': 7,
  '30 days': 30,
  '90 days': 90,
};
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const avg = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

@Injectable()
export class HelpdeskViewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: HelpdeskContextService,
    private readonly loader: HelpdeskLoaderService,
    private readonly ops: HelpdeskOpsService,
    private readonly channels: InboxChannelsService,
    private readonly delivery: HelpdeskDeliveryService,
  ) {}

  // ── helpers ──────────────────────────────────────────────────────────────

  private dayKey(iso: string | Date, tz: string) {
    const p = localParts(+new Date(iso), tz);
    return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
  }

  /** The last `n` local days (oldest first) as keys and "Sep 15" labels. */
  private days(n: number, tz: string) {
    const p = localParts(Date.now(), tz);
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(Date.UTC(p.y, p.m - 1, p.d - (n - 1 - i)));
      return {
        key: d.toISOString().slice(0, 10),
        label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`,
      };
    });
  }

  private inRange(rows: TRow[], range = '30 days') {
    const d = RANGE_DAYS[range] ?? 30;
    return rows.filter(
      (t) => Date.now() - new Date(t.createdAt).getTime() <= d * 86400000,
    );
  }

  async channelStates(rootId: string) {
    const states = await this.channels.states(rootId);
    const { slug } = await this.prisma.business.findUniqueOrThrow({
      where: { id: rootId },
      select: { slug: true },
    });
    const st = (k: string) => states.get(k);
    const social = [...states.values()].filter(
      (s) => s.def.transport === 'social',
    );
    const socialOn = social.find((s) => s.st === 'Connected') ?? social[0];
    const sms = st('sms');
    return [
      {
        ch: 'Email',
        desc: st('email')?.send.ok
          ? 'Replies go out by email · Noxtill doesn’t receive email, so customers answer in their portal link'
          : 'Email sending isn’t set up',
        status: st('email')?.send.ok
          ? 'Connected'
          : (st('email')?.st ?? 'Not configured'),
        via: 'Unified Inbox',
      },
      {
        ch: 'WhatsApp',
        desc: st('whatsapp')?.handle ?? 'Not connected',
        status: st('whatsapp')?.st ?? 'Not connected',
        via: 'Unified Inbox',
      },
      {
        ch: 'Web',
        desc: `Help center request form · ${this.delivery.helpCenterUrl(slug)}`,
        status: 'Connected',
        via: 'Helpdesk help center',
      },
      {
        ch: 'Portal',
        desc: 'Customer portal ticket links',
        status: 'Built-in',
        via: 'Customer Portal',
      },
      {
        ch: 'Phone',
        desc: sms?.send.ok
          ? 'Logged manually · replies by SMS'
          : 'Logged manually · SMS replies unavailable',
        status: 'Built-in',
        via: sms?.send.ok ? 'Unified Inbox (SMS)' : 'Helpdesk',
      },
      {
        ch: 'Social',
        desc:
          social.map((s) => s.def.short).join(' + ') || 'No social accounts',
        status: socialOn?.st ?? 'Not connected',
        via: 'Unified Inbox',
      },
      {
        ch: 'Manual',
        desc: 'Created by staff',
        status: 'Built-in',
        via: 'Helpdesk',
      },
    ];
  }

  private queueStats(L: Loaded, queueId: string) {
    const all = L.rows.filter((t) => t.queueId === queueId);
    const open = all.filter((t) => t.open);
    const now = Date.now();
    const oldest = open.reduce(
      (m, t) => Math.min(m, new Date(t.createdAt).getTime()),
      Infinity,
    );
    const waiting = open.filter((t) => !t.firstResponseAt);
    return {
      open: open.length,
      risk: open.filter((t) => t.sla.k === 'At Risk' || t.sla.k === 'Breached')
        .length,
      oldestMins: open.length ? Math.round((now - oldest) / 60000) : null,
      waitMins: waiting.length
        ? Math.round(
            avg(
              waiting.map(
                (t) => (now - new Date(t.createdAt).getTime()) / 60000,
              ),
            )!,
          )
        : null,
      frMins: avg(
        all.map((t) => t.frMins).filter((x): x is number => x != null),
      ),
    };
  }

  private orderQueue(rows: TRow[], rule: string) {
    const r = [...rows];
    if (rule === 'Urgent first')
      return r.sort(
        (a, b) =>
          (PRIORITY_ORDER[a.priority] ?? 9) -
            (PRIORITY_ORDER[b.priority] ?? 9) ||
          a.createdAt.localeCompare(b.createdAt),
      );
    if (rule === 'VIP first')
      return r.sort(
        (a, b) =>
          Number(/^vip$/i.test(b.segment ?? '')) -
            Number(/^vip$/i.test(a.segment ?? '')) ||
          a.createdAt.localeCompare(b.createdAt),
      );
    if (rule === 'Oldest first')
      return r.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return r.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  // ── workspace ────────────────────────────────────────────────────────────

  async workspace(actor: HdActor, branch?: string) {
    const L = await this.loader.load(actor, { branch });
    const cfg = L.cfg;
    const row = await this.ctx.settingsRow(actor.rootId);
    const [channels, replies, macros, articles, rules] = await Promise.all([
      this.channelStates(actor.rootId),
      this.prisma.helpdeskSavedReply.findMany({
        where: { businessId: actor.rootId },
        orderBy: { name: 'asc' },
      }),
      this.prisma.helpdeskMacro.findMany({
        where: { businessId: actor.rootId, status: 'Active' },
        orderBy: { name: 'asc' },
      }),
      this.prisma.helpdeskArticle.findMany({
        where: { businessId: actor.rootId, status: 'Published' },
        orderBy: { title: 'asc' },
        select: { id: true, title: true, visibility: true },
      }),
      this.prisma.helpdeskEscalationRule.findMany({
        where: { businessId: actor.rootId },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const counts = await this.prisma.helpdeskTicket.groupBy({
      by: ['status', 'category', 'priority'],
      where: { businessId: actor.rootId },
      _count: { _all: true },
    });
    const sumBy = (f: (c: (typeof counts)[number]) => boolean) =>
      counts.filter(f).reduce((s, c) => s + c._count._all, 0);
    const bName = new Map(L.branches.map((b) => [b.id, b.name]));
    const aName = new Map(L.agents.map((a) => [a.id, a.name]));
    const qName = new Map(L.queues.map((q) => [q.id, q.name]));
    return {
      syncedAt: new Date().toISOString(),
      me: {
        userId: actor.userId,
        name: actor.name,
        role: actor.role,
        ri: actor.ri,
        caps: this.ctx.capMap(actor, cfg),
        isAgent: L.agents.some((a) => a.id === actor.userId),
      },
      settings: {
        version: row.version,
        config: cfg,
        nextNumber: await this.ctx.previewNumber(actor.rootId, cfg),
      },
      branches: L.branches,
      agents: L.agents.map((a) => ({
        ...a,
        ...this.loader.workload(L.all, a.id),
      })),
      queues: L.queues.map((q) => ({
        id: q.id,
        name: q.name,
        desc: q.description ?? '',
        active: q.active,
        sys: q.systemKey,
        members: (q.members as string[]) ?? [],
        categories: (q.categories as string[]) ?? [],
        branchId: q.branchId,
        branchName: q.branchId
          ? (bName.get(q.branchId) ?? 'Unknown branch')
          : 'All branches',
        priorityRule: q.priorityRule,
        method: q.method,
        stats: this.queueStats(L, q.id),
        tickets: this.orderQueue(
          L.rows.filter((t) => t.queueId === q.id && t.open),
          q.priorityRule,
        ).slice(0, 8),
      })),
      policies: L.policies,
      rules: rules.map((r) => ({
        id: r.id,
        name: r.name,
        trigger: r.trigger,
        ageHours: r.ageHours,
        action: r.action,
        targetType: r.targetType,
        target: `${r.targetType === 'Queue' ? 'queue' : 'user'}:${r.targetId}`,
        targetName:
          r.targetType === 'Queue'
            ? (qName.get(r.targetId) ?? 'Deleted queue')
            : (aName.get(r.targetId) ?? 'Former agent'),
        active: r.active,
      })),
      channels,
      chanList: channels
        .filter((c) => !['Not connected', 'Not available'].includes(c.status))
        .map((c) => c.ch),
      allChannels: CHANNELS,
      breached: L.rows.filter((t) => t.open && t.sla.k === 'Breached').length,
      tags: [...new Set(L.rows.flatMap((t) => t.tags))].sort(),
      usage: {
        status: Object.fromEntries(
          [...cfg.statuses, ...cfg.customStatuses].map((s) => [
            s,
            {
              open: isOpenStatus(s) ? sumBy((c) => c.status === s) : 0,
              all: sumBy((c) => c.status === s),
            },
          ]),
        ),
        category: Object.fromEntries(
          cfg.categories.map((x) => [x, sumBy((c) => c.category === x)]),
        ),
        priorityOpen: Object.fromEntries(
          ['Urgent', 'High', 'Normal', 'Low'].map((p) => [
            p,
            sumBy((c) => c.priority === p && isOpenStatus(c.status)),
          ]),
        ),
      },
      composer: {
        replies: replies
          .filter((r) =>
            r.visibility === 'Only me'
              ? r.ownerUserId === actor.userId
              : r.visibility === 'Managers only'
                ? actor.ri <= 1
                : true,
          )
          .map((r) => ({
            id: r.id,
            name: r.name,
            shortcut: r.shortcut,
            team: r.team,
          })),
        macros: macros.map((m) => ({
          id: m.id,
          name: m.name,
          conditions: m.conditions,
        })),
        articles: articles.map((a) => ({
          id: a.id,
          title: a.title,
          visibility: a.visibility,
        })),
      },
      via: VIA,
      helpCenterUrl: this.delivery.helpCenterUrl(
        (
          await this.prisma.business.findUniqueOrThrow({
            where: { id: actor.rootId },
            select: { slug: true },
          })
        ).slug,
      ),
    };
  }

  // ── overview ─────────────────────────────────────────────────────────────

  async overview(actor: HdActor, range = '30 days', branch?: string) {
    const L = await this.loader.load(actor, { branch });
    const tz = L.cfg.hours.tz;
    const act = L.rows.filter((t) => t.open);
    const R = this.inRange(L.rows, range);
    const cnt = (f: (t: TRow) => boolean) => act.filter(f).length;
    const since = new Date(Date.now() - (RANGE_DAYS[range] ?? 30) * 86400000);
    const csat = await this.prisma.helpdeskCsat.findMany({
      where: {
        businessId: actor.rootId,
        status: 'responded',
        respondedAt: { gte: since },
      },
      select: { rating: true, ticketId: true },
    });
    const visible = new Set(L.rows.map((t) => t.id));
    const cs = csat.filter((c) => visible.has(c.ticketId));
    const n = Math.min(14, Math.max(7, RANGE_DAYS[range] ?? 30));
    const days = this.days(n, tz);
    const created = days.map(
      (d) =>
        L.rows.filter((t) => this.dayKey(t.createdAt, tz) === d.key).length,
    );
    const resolved = days.map(
      (d) =>
        L.rows.filter(
          (t) => t.resolvedAt && this.dayKey(t.resolvedAt, tz) === d.key,
        ).length,
    );
    const segs: Record<string, (t: TRow) => boolean> = {
      unassigned: (t) => t.open && !t.agentUserId,
      mine: (t) => t.open && t.agentUserId === actor.userId,
      risk: (t) => t.open && (t.sla.k === 'At Risk' || t.sla.k === 'Breached'),
      escalated: (t) => t.open && t.escalated,
      waiting: (t) => t.status === 'Waiting on Customer',
      recent: () => true,
    };
    const due = (t: TRow) =>
      t.sla.dueAt ? new Date(t.sla.dueAt).getTime() : Infinity;
    return {
      empty: !L.all.length,
      kpis: {
        open: act.length,
        fresh: cnt((t) => t.status === 'New'),
        unassigned: cnt((t) => !t.agentUserId),
        urgent: cnt((t) => t.priority === 'Urgent'),
        wcust: cnt((t) => t.status === 'Waiting on Customer'),
        wteam: cnt((t) => t.status === 'Waiting on Internal Team'),
        risk: cnt((t) => t.sla.k === 'At Risk'),
        breach: cnt((t) => t.sla.k === 'Breached'),
        frt: avg(R.map((t) => t.frMins).filter((x): x is number => x != null)),
        res: avg(R.map((t) => t.resMins).filter((x): x is number => x != null)),
        csat: cs.length
          ? Math.round(
              (cs.filter((c) => (c.rating ?? 0) >= 4).length / cs.length) * 100,
            )
          : null,
        csatN: cs.length,
      },
      trend: { labels: days.map((d) => d.label), created, resolved },
      byPriority: ['Urgent', 'High', 'Normal', 'Low'].map((p) => [
        p,
        act.filter((t) => t.priority === p).length,
      ]),
      byChannel: CHANNELS.map((c) => [
        c,
        R.filter((t) => t.channel === c).length,
      ]),
      segments: Object.fromEntries(
        Object.entries(segs).map(([k, f]) => {
          const list = L.rows.filter(f);
          const sorted =
            k === 'risk'
              ? [...list].sort((a, b) => due(a) - due(b))
              : [...list].sort((a, b) =>
                  b.updatedAt.localeCompare(a.updatedAt),
                );
          return [k, { count: list.length, rows: sorted.slice(0, 8) }];
        }),
      ),
    };
  }

  // ── SLA & escalations ────────────────────────────────────────────────────

  async sla(actor: HdActor, branch?: string) {
    const L = await this.loader.load(actor, { branch });
    const act = L.rows.filter((t) => t.open);
    const bad = L.rows.filter(
      (t) => t.sla.k === 'Breached' || t.sla.k === 'Missed',
    ).length;
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const visible = new Map(L.all.map((t) => [t.id, t]));
    const log = await this.prisma.helpdeskEscalation.findMany({
      where: { businessId: actor.rootId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const month = log.filter((e) => e.createdAt >= monthStart);
    return {
      kpis: {
        compliance: L.rows.length
          ? Math.round((1 - bad / L.rows.length) * 100)
          : null,
        risk: act.filter((t) => t.sla.k === 'At Risk').length,
        breach: act.filter((t) => t.sla.k === 'Breached').length,
        frt: avg(
          L.rows.map((t) => t.frMins).filter((x): x is number => x != null),
        ),
        res: avg(
          L.rows.map((t) => t.resMins).filter((x): x is number => x != null),
        ),
        escMonth: month.length,
        escFailed: month.filter((e) => e.status === 'Failed').length,
      },
      log: log.slice(0, 12).map((e) => ({
        id: e.id,
        ticket: visible.get(e.ticketId)?.number ?? 'Deleted ticket',
        trigger: e.trigger,
        rule: e.ruleName,
        target: e.target,
        at: e.createdAt.toISOString(),
        result: e.result,
        status: e.status,
        retryable: e.status === 'Failed' && !!e.ruleId,
      })),
    };
  }

  // ── CSAT ─────────────────────────────────────────────────────────────────

  async csat(actor: HdActor, branch?: string) {
    const L = await this.loader.load(actor, { branch });
    const cfg = L.cfg;
    const visible = new Map(L.rows.map((t) => [t.id, t]));
    const since = new Date(Date.now() - 90 * 86400000);
    const rows = (
      await this.prisma.helpdeskCsat.findMany({
        where: { businessId: actor.rootId, createdAt: { gte: since } },
        orderBy: { respondedAt: 'desc' },
      })
    ).filter((c) => visible.has(c.ticketId));
    const resp = rows.filter((c) => c.status === 'responded');
    const sent = rows.filter(
      (c) => c.status === 'sent' || c.status === 'responded',
    ).length;
    const band = (r: number) =>
      r >= 4 ? 'Positive' : r === 3 ? 'Neutral' : 'Negative';
    const agents = new Map(L.agents.map((a) => [a.id, a.name]));
    const weeks = Array.from({ length: 8 }, (_, i) => {
      const end = Date.now() - (7 - i) * 7 * 86400000;
      const start = end - 7 * 86400000;
      const w = resp.filter(
        (c) =>
          c.respondedAt &&
          c.respondedAt.getTime() > start &&
          c.respondedAt.getTime() <= end,
      );
      const d = new Date(start + 86400000);
      return {
        label: `${MONTHS[d.getMonth()]} ${d.getDate()}`,
        pct: w.length
          ? Math.round(
              (w.filter((c) => (c.rating ?? 0) >= 4).length / w.length) * 100,
            )
          : null,
        n: w.length,
      };
    });
    const pct = (xs: typeof resp) =>
      xs.length
        ? Math.round(
            (xs.filter((c) => (c.rating ?? 0) >= 4).length / xs.length) * 100,
          )
        : 0;
    const group = (key: (c: (typeof resp)[number]) => string) => {
      const m = new Map<string, typeof resp>();
      for (const c of resp) m.set(key(c), [...(m.get(key(c)) ?? []), c]);
      return [...m]
        .map(([k, xs]) => [k, pct(xs), xs.length] as [string, number, number])
        .sort((a, b) => b[1] - a[1]);
    };
    return {
      windowDays: 90,
      kpis: {
        score: resp.length ? pct(resp) : null,
        responses: resp.length,
        positive: resp.filter((c) => band(c.rating ?? 0) === 'Positive').length,
        neutral: resp.filter((c) => band(c.rating ?? 0) === 'Neutral').length,
        negative: resp.filter((c) => band(c.rating ?? 0) === 'Negative').length,
        rate: sent ? Math.round((resp.length / sent) * 100) : null,
        sent,
        scheduled: rows.filter((c) => c.status === 'scheduled').length,
        failed: rows.filter((c) => c.status === 'failed').length,
      },
      trend: weeks,
      byAgent: group(
        (c) =>
          agents.get(c.agentUserId ?? '') ??
          (c.agentUserId ? 'Former agent' : 'Unassigned'),
      ),
      byCategory: group((c) => c.category),
      byChannel: group((c) => visible.get(c.ticketId)?.channel ?? c.channel),
      responses: resp.map((c) => {
        const t = visible.get(c.ticketId)!;
        return {
          number: t.number,
          customer: t.customerName,
          rating: c.rating ?? 0,
          raw: c.rawRating,
          scale: c.scale,
          comment: c.comment ?? '',
          agentId: c.agentUserId,
          agent: agents.get(c.agentUserId ?? '') ?? 'Unassigned',
          category: c.category,
          channel: t.channel,
          at: (c.respondedAt ?? c.updatedAt).toISOString(),
          followUp: c.followUp,
        };
      }),
      settings: cfg.csat,
    };
  }

  async followUp(
    actor: HdActor,
    number: string,
    note: string,
    ownerId: string,
  ) {
    this.ctx.assertManager(actor, 'Creating CSAT follow-ups');
    const t = await this.ops.ticketByNumber(actor.rootId, number);
    const c = await this.prisma.helpdeskCsat.findUnique({
      where: { ticketId: t.id },
    });
    if (!c || c.status !== 'responded')
      throw new AppException(
        HD_ERRORS.NOT_FOUND,
        'No survey response on this ticket.',
        HttpStatus.NOT_FOUND,
      );
    const owner = await this.ctx.assertAgent(actor.rootId, ownerId);
    const followers = [
      ...new Set([...((t.followers as string[]) ?? []), owner!.id]),
    ];
    await this.prisma.helpdeskTicket.update({
      where: { id: t.id },
      data: { followers, lastActivityAt: new Date(), lastKind: 'note' },
    });
    await this.prisma.helpdeskMessage.create({
      data: {
        businessId: actor.rootId,
        ticketId: t.id,
        kind: 'note',
        authorUserId: actor.userId,
        authorName: actor.name,
        body: `CSAT follow-up (owner ${owner!.name}): ${note}`,
      },
    });
    await this.ops.sys(t, actor, 'Negative CSAT follow-up opened');
    await this.prisma.helpdeskCsat.update({
      where: { id: c.id },
      data: { followUp: 'Open', followUpOwnerId: owner!.id },
    });
    await this.ctx.notify(
      actor.rootId,
      [owner!.id],
      'Negative CSAT',
      {
        title: `CSAT follow-up on ${t.number}`,
        body: note,
        link: `/helpdesk/tickets/${t.number}`,
      },
      { except: actor.userId },
    );
    return { ok: true };
  }

  async followUpState(actor: HdActor, number: string, state: string) {
    this.ctx.assertManager(actor, 'Updating CSAT follow-ups');
    const t = await this.ops.ticketByNumber(actor.rootId, number);
    const c = await this.prisma.helpdeskCsat.findUnique({
      where: { ticketId: t.id },
    });
    if (!c?.followUp)
      throw new AppException(
        HD_ERRORS.NOT_FOUND,
        'No follow-up on this ticket.',
        HttpStatus.NOT_FOUND,
      );
    await this.prisma.helpdeskCsat.update({
      where: { id: c.id },
      data: { followUp: state },
    });
    await this.ops.sys(
      t,
      actor,
      `CSAT follow-up ${state === 'Done' ? 'marked done' : 'reopened'}`,
    );
    return { ok: true };
  }

  // ── analytics ────────────────────────────────────────────────────────────

  private analyticsRows(L: Loaded, q: AnalyticsQuery) {
    return this.inRange(L.rows, q.range).filter(
      (t) =>
        (!q.agent || t.agentUserId === q.agent) &&
        (!q.queue || t.queueId === q.queue) &&
        (!q.cat || t.category === q.cat) &&
        (!q.pri || t.priority === q.pri) &&
        (!q.ch || t.channel === q.ch),
    );
  }

  async analytics(actor: HdActor, q: AnalyticsQuery) {
    const L = await this.loader.load(actor, { branch: q.branch });
    this.ctx.assert(actor, L.cfg, 'View analytics', 'Helpdesk Analytics');
    const cfg: HelpdeskConfig = L.cfg;
    const tz = cfg.hours.tz;
    const rows = this.analyticsRows(L, q);
    const open = rows.filter((t) => t.open);
    const resolved = rows.filter((t) => t.resolvedAt);
    const bad = (t: TRow) => t.sla.k === 'Breached' || t.sla.k === 'Missed';
    const since = new Date(
      Date.now() - (RANGE_DAYS[q.range ?? '30 days'] ?? 30) * 86400000,
    );
    const ids = new Set(rows.map((t) => t.id));
    const csat = (
      await this.prisma.helpdeskCsat.findMany({
        where: {
          businessId: actor.rootId,
          status: 'responded',
          respondedAt: { gte: since },
        },
      })
    ).filter((c) => ids.has(c.ticketId));

    const rangeDays = RANGE_DAYS[q.range ?? '30 days'] ?? 30;
    const weekly = rangeDays > 30;
    const nb = weekly ? 13 : Math.max(7, rangeDays);
    const allDays = this.days(weekly ? 91 : nb, tz);
    const buckets = weekly
      ? Array.from({ length: 13 }, (_, i) => allDays.slice(i * 7, i * 7 + 7))
      : allDays.map((d) => [d]);
    const inB = (iso: string | null, b: typeof allDays) =>
      !!iso && b.some((d) => d.key === this.dayKey(iso, tz));
    const series = buckets.map((b) => {
      const c = rows.filter((t) => inB(t.createdAt, b));
      const r = rows.filter((t) => inB(t.resolvedAt, b));
      const fr = avg(
        c.map((t) => t.frMins).filter((x): x is number => x != null),
      );
      const rs = avg(
        r.map((t) => t.resMins).filter((x): x is number => x != null),
      );
      return {
        label: weekly ? `w/c ${b[0].label}` : b[0].label,
        created: c.length,
        resolved: r.length,
        frt: fr == null ? 0 : Math.round(fr),
        res: rs == null ? 0 : Math.round((rs / 60) * 10) / 10,
        sla: c.length
          ? Math.round((1 - c.filter(bad).length / c.length) * 100)
          : null,
      };
    });
    const agentRows = L.agents.map((a) => {
      const mine = rows.filter((t) => t.agentUserId === a.id);
      const res = mine.filter((t) => t.resolvedAt);
      const cs = csat.filter((c) => c.agentUserId === a.id);
      const fr = avg(
        mine.map((t) => t.frMins).filter((x): x is number => x != null),
      );
      const rt = avg(
        res.map((t) => t.resMins).filter((x): x is number => x != null),
      );
      return {
        id: a.id,
        name: a.name,
        title: a.title,
        assigned: mine.length,
        resolved: res.length,
        frH: fr == null ? null : Math.round((fr / 60) * 10) / 10,
        resH: rt == null ? null : Math.round((rt / 60) * 10) / 10,
        sla: mine.length
          ? Math.round((1 - mine.filter(bad).length / mine.length) * 100)
          : null,
        reopen: mine.length
          ? Math.round(
              (mine.filter((t) => t.reopenCount > 0).length / mine.length) *
                100,
            )
          : null,
        csat: cs.length
          ? Math.round(
              (cs.reduce((s, c) => s + (c.rating ?? 0), 0) / cs.length) * 10,
            ) / 10
          : null,
      };
    });
    const ageH = (t: TRow) =>
      (Date.now() - new Date(t.createdAt).getTime()) / 3600000;
    return {
      weekly,
      kpis: {
        created: rows.length,
        resolved: resolved.length,
        frt: avg(
          rows.map((t) => t.frMins).filter((x): x is number => x != null),
        ),
        res: avg(
          resolved.map((t) => t.resMins).filter((x): x is number => x != null),
        ),
        compliance: rows.length
          ? Math.round((1 - rows.filter(bad).length / rows.length) * 100)
          : null,
        bad: rows.filter(bad).length,
        reopenRate: rows.length
          ? Math.round(
              (rows.filter((t) => t.reopenCount > 0).length / rows.length) *
                100,
            )
          : null,
        reopened: rows.filter((t) => t.reopenCount > 0).length,
        backlog: open.length,
        csat: csat.length
          ? Math.round(
              (csat.filter((c) => (c.rating ?? 0) >= 4).length / csat.length) *
                100,
            )
          : null,
        csatN: csat.length,
      },
      series,
      byCategory: cfg.categories.map((c) => [
        c,
        rows.filter((t) => t.category === c).length,
      ]),
      byChannel: CHANNELS.map((c) => [
        c,
        rows.filter((t) => t.channel === c).length,
      ]),
      byPriority: ['Urgent', 'High', 'Normal', 'Low'].map((p) => [
        p,
        rows.filter((t) => t.priority === p).length,
      ]),
      agents: agentRows,
      bands: [
        ['< 4 hours', open.filter((t) => ageH(t) < 4).length],
        ['4–24 hours', open.filter((t) => ageH(t) >= 4 && ageH(t) < 24).length],
        ['1–3 days', open.filter((t) => ageH(t) >= 24 && ageH(t) < 72).length],
        ['> 3 days', open.filter((t) => ageH(t) >= 72).length],
      ],
      byQueue: L.queues
        .map((qq) => [qq.name, open.filter((t) => t.queueId === qq.id).length])
        .filter((x) => x[1]),
      slaRisk: [
        ['Healthy', open.filter((t) => t.sla.k === 'Healthy').length],
        ['Paused', open.filter((t) => t.sla.k === 'Paused').length],
        ['At risk', open.filter((t) => t.sla.k === 'At Risk').length],
        ['Breached', open.filter((t) => t.sla.k === 'Breached').length],
      ],
      oldest: [...open]
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(0, 5),
      count: rows.length,
    };
  }

  async exportAnalytics(
    actor: HdActor,
    q: AnalyticsQuery,
  ): Promise<{ body: Buffer; type: string; name: string; count: number }> {
    const L = await this.loader.load(actor, { branch: q.branch });
    this.ctx.assert(actor, L.cfg, 'View analytics', 'Exporting analytics');
    const rows = this.analyticsRows(L, q);
    const head = [
      'Ticket',
      'Subject',
      'Customer ID',
      'Channel',
      'Category',
      'Priority',
      'Status',
      'Agent',
      'Queue',
      'Branch',
      'Created',
      'First response (min)',
      'SLA',
    ];
    const data = rows.map((t) => [
      t.number,
      t.subject,
      t.customerId,
      t.channel,
      t.category,
      t.priority,
      t.status,
      t.agentName,
      t.queueName,
      t.branchName,
      t.createdAt,
      t.frMins ?? '',
      t.sla.k,
    ]);
    await this.ctx.log(
      actor.rootId,
      actor,
      'Analytics exported',
      `${(q.kind ?? 'csv').toUpperCase()} · ${rows.length} rows`,
    );
    if (q.kind === 'xlsx') {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Tickets');
      ws.addRow(head).font = { bold: true };
      for (const r of data) ws.addRow(r);
      ws.columns.forEach((c) => (c.width = 18));
      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      return {
        body: buf,
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        name: 'helpdesk-analytics.xlsx',
        count: rows.length,
      };
    }
    const esc = (v: string | number | null | undefined) =>
      '"' + String(v ?? '').replace(/"/g, '""') + '"';
    return {
      body: Buffer.from(
        '﻿' + [head, ...data].map((r) => r.map(esc).join(',')).join('\n'),
      ),
      type: 'text/csv; charset=utf-8',
      name: 'helpdesk-analytics.csv',
      count: rows.length,
    };
  }
}
