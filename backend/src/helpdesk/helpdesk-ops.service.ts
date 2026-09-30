import { HttpStatus, Injectable } from '@nestjs/common';
import { HelpdeskQueue, HelpdeskTicket, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { Agent, HelpdeskContextService } from './helpdesk-context.service';
import { HelpdeskLoaderService, TRow } from './helpdesk-loader.service';
import {
  CLOSED_STATUSES,
  CSAT_CHANNEL_OF,
  CSAT_DELAYS,
  HD_ERRORS,
  HelpdeskConfig,
  isOpenStatus,
} from './helpdesk.constants';
import { SlaState, fmtM } from './helpdesk-sla.util';

/** Who did something: a person, or the system (jobs, customer portal, inbox). */
export interface Who {
  userId: string | null;
  name: string;
}
export const SYSTEM: Who = { userId: null, name: 'System' };

/** Statuses that don't pause anything: the SLA clock always runs in these. */
const RUNNING = ['New', 'Open', 'In Progress'];

@Injectable()
export class HelpdeskOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: HelpdeskContextService,
    private readonly loader: HelpdeskLoaderService,
  ) {}

  // ── timeline ─────────────────────────────────────────────────────────────

  async sys(t: { id: string; businessId: string }, who: Who, text: string) {
    await this.prisma.helpdeskMessage.create({
      data: {
        businessId: t.businessId,
        ticketId: t.id,
        kind: 'sys',
        authorUserId: who.userId,
        authorName: who.name.slice(0, 191),
        body: text,
      },
    });
    await this.prisma.helpdeskTicket.update({
      where: { id: t.id },
      data: { lastActivityAt: new Date(), lastKind: 'sys' },
    });
  }

  async fresh(id: string) {
    return this.prisma.helpdeskTicket.findUniqueOrThrow({ where: { id } });
  }

  async ticketByNumber(rootId: string, number: string) {
    const t = await this.prisma.helpdeskTicket.findUnique({
      where: { businessId_number: { businessId: rootId, number } },
    });
    if (!t)
      throw new AppException(
        HD_ERRORS.NOT_FOUND,
        `Ticket ${number} doesn’t exist in this business, or was deleted.`,
        HttpStatus.NOT_FOUND,
      );
    return t;
  }

  /** Live SLA state of one ticket. */
  async slaOf(
    t: HelpdeskTicket,
    cfg?: HelpdeskConfig,
  ): Promise<{ row: TRow; sla: SlaState }> {
    const c = cfg ?? (await this.ctx.config(t.businessId));
    const [queues, branches, agents, policies] = await Promise.all([
      this.prisma.helpdeskQueue.findMany({
        where: { businessId: t.businessId },
      }),
      this.ctx.branches(t.businessId),
      this.ctx.agents(t.businessId),
      this.ctx.policies(t.businessId),
    ]);
    const [row] = await this.loader.rows([t], {
      cfg: c,
      queues,
      branches,
      agents,
      policies,
      calendar: await this.ctx.calendar(t.businessId, c),
    });
    return { row, sla: row.sla };
  }

  // ── status ───────────────────────────────────────────────────────────────

  /**
   * Changes status with SLA pause accounting: time spent in a non-running status is recorded as a
   * pause interval (a policy decides which of those statuses stop its clock). Resolving or closing
   * records whether the SLA was already breached, and Resolved schedules the CSAT survey.
   */
  async setStatus(
    t: HelpdeskTicket,
    ns: string,
    who: Who,
    cfg: HelpdeskConfig,
    opts: { silentCsat?: boolean } = {},
  ): Promise<HelpdeskTicket> {
    if (t.status === ns) return t;
    const all = [...cfg.statuses, ...cfg.customStatuses];
    if (!all.includes(ns))
      throw new AppException(
        HD_ERRORS.INVALID,
        `“${ns}” isn’t a ticket status in Settings.`,
        HttpStatus.BAD_REQUEST,
      );
    const now = new Date();
    const data: Prisma.HelpdeskTicketUpdateInput = {
      status: ns,
      lastActivityAt: now,
    };
    const pauses = [
      ...((t.pauses as unknown as Array<[string, string, string]>) ?? []),
    ];
    if (t.pausedSince) {
      pauses.push([t.pausedSince.toISOString(), now.toISOString(), t.status]);
      data.pauses = pauses;
      data.pausedSince = null;
    }
    if (!RUNNING.includes(ns) && !CLOSED_STATUSES.includes(ns))
      data.pausedSince = now;
    if (CLOSED_STATUSES.includes(ns) && isOpenStatus(t.status)) {
      const { sla } = await this.slaOf(t, cfg);
      data.slaMissed = sla.k === 'Breached';
      data.resolvedAt = now;
    }
    if (ns === 'Closed') data.closedAt = now;
    const n = await this.prisma.helpdeskTicket.update({
      where: { id: t.id },
      data,
    });
    await this.sys(n, who, `Status ${t.status} → ${ns}`);
    await this.ctx.log(
      t.businessId,
      who,
      'Status changed',
      `${t.number} · ${t.status} → ${ns}`,
      t.id,
    );
    if (ns === 'Resolved' && !opts.silentCsat) await this.scheduleCsat(n, cfg);
    return this.fresh(t.id);
  }

  async reopen(t: HelpdeskTicket, who: Who, why = ''): Promise<HelpdeskTicket> {
    if (t.mergedIntoId)
      throw new AppException(
        HD_ERRORS.CONFLICT,
        'Merged tickets can’t be reopened — open the ticket it was merged into.',
        HttpStatus.CONFLICT,
      );
    if (isOpenStatus(t.status)) return t;
    const n = await this.prisma.helpdeskTicket.update({
      where: { id: t.id },
      data: {
        status: 'Open',
        reopenCount: { increment: 1 },
        slaMissed: false,
        resolvedAt: null,
        closedAt: null,
        fired: {},
        pausedSince: null,
        lastActivityAt: new Date(),
      },
    });
    await this.sys(
      n,
      who,
      `Reopened (${t.status} → Open)${why ? ' · ' + why : ''}`,
    );
    await this.ctx.log(
      t.businessId,
      who,
      'Reopened',
      `${t.number}${why ? ' · ' + why : ''}`,
      t.id,
    );
    return this.fresh(t.id);
  }

  /** Days after resolution in which a customer reply reopens the ticket (null = never). */
  reopenWindowDays(cfg: HelpdeskConfig): number | null {
    const m = /within (\d+) days/.exec(cfg.general.reopen);
    return m ? Number(m[1]) : null;
  }

  // ── CSAT scheduling ──────────────────────────────────────────────────────

  async scheduleCsat(t: HelpdeskTicket, cfg: HelpdeskConfig) {
    const cs = cfg.csat;
    const ch = CSAT_CHANNEL_OF[t.channel] ?? 'Email';
    const ok = cs.enabled && cs.channels.includes(ch);
    if (!ok) {
      await this.sys(
        t,
        SYSTEM,
        `CSAT survey not scheduled — ${cs.enabled ? `${ch} is not enabled for surveys` : 'surveys are turned off'}`,
      );
      return;
    }
    const existing = await this.prisma.helpdeskCsat.findUnique({
      where: { ticketId: t.id },
    });
    if (existing?.status === 'responded') {
      await this.sys(
        t,
        SYSTEM,
        'CSAT survey not scheduled — the customer already rated this ticket',
      );
      return;
    }
    const sendAt = new Date(
      Date.now() + (CSAT_DELAYS[cs.delay] ?? 120) * 60000,
    );
    const data = {
      channel: ch,
      status: 'scheduled',
      sendAt,
      sentAt: null,
      scale: cs.scale,
      agentUserId: t.agentUserId,
      category: t.category,
      failReason: null,
    };
    await this.prisma.helpdeskCsat.upsert({
      where: { ticketId: t.id },
      create: { businessId: t.businessId, ticketId: t.id, ...data },
      update: data,
    });
    await this.sys(
      t,
      SYSTEM,
      `CSAT survey scheduled ${cs.delay === 'Immediately' ? 'now' : cs.delay + ' after resolution'} via ${ch} (queued — not sent yet)`,
    );
  }

  // ── assignment ───────────────────────────────────────────────────────────

  async assign(
    t: HelpdeskTicket,
    agentId: string | null,
    who: Who,
    cfg: HelpdeskConfig,
    how = '',
  ): Promise<HelpdeskTicket> {
    if ((t.agentUserId ?? null) === (agentId ?? null)) return t;
    const agent = await this.ctx.assertAgent(t.businessId, agentId);
    const [from, to] = [
      await this.ctx.userName(t.agentUserId),
      agent?.name ?? 'Unassigned',
    ];
    const txt = !agentId
      ? `Unassigned from ${from}`
      : t.agentUserId
        ? `Reassigned from ${from} to ${to}`
        : `Assigned to ${to}`;
    const data: Prisma.HelpdeskTicketUpdateInput = {
      agentUserId: agentId,
      lastActivityAt: new Date(),
    };
    if (agentId) {
      const queues = await this.prisma.helpdeskQueue.findMany({
        where: { businessId: t.businessId, active: true },
        orderBy: { sortOrder: 'asc' },
      });
      const cur = queues.find((q) => q.id === t.queueId);
      if (!cur || cur.systemKey === 'unassigned') {
        const mine = queues.filter(
          (q) =>
            !q.systemKey && ((q.members as string[]) ?? []).includes(agentId),
        );
        const target =
          mine.find((q) =>
            ((q.categories as string[]) ?? []).includes(t.category),
          ) ??
          mine[0] ??
          queues.find((q) => !q.systemKey);
        if (target) data.queueId = target.id;
      }
      if (t.status === 'New') data.status = 'Open';
    }
    const n = await this.prisma.helpdeskTicket.update({
      where: { id: t.id },
      data,
    });
    await this.sys(n, who, txt + (how ? ` ${how}` : ''));
    await this.ctx.log(
      t.businessId,
      who,
      t.agentUserId ? 'Reassigned' : 'Assigned',
      `${t.number} · ${txt}`,
      t.id,
    );
    if (agentId)
      await this.ctx.notify(
        t.businessId,
        [agentId],
        'Assignment',
        {
          title: `${t.number} assigned to you`,
          body: `${t.subject}${who.userId ? ` — by ${who.name}` : ''}`,
          link: `/helpdesk/tickets/${t.number}`,
        },
        { except: who.userId, cfg },
      );
    return this.fresh(t.id);
  }

  /** Eligible agent for a ticket under its queue's assignment method, or null with the reason. */
  pick(
    t: HelpdeskTicket,
    queue: HelpdeskQueue | undefined,
    agents: Agent[],
    all: TRow[],
    cfg: HelpdeskConfig,
  ): { agent: Agent | null; why: string } {
    if (cfg.assignment.method === 'Manual everywhere')
      return { agent: null, why: 'assignment is manual everywhere' };
    if (!queue || !queue.active || queue.method === 'Manual')
      return { agent: null, why: 'queue assigns manually' };
    const members = ((queue.members as string[]) ?? [])
      .map((id) => agents.find((a) => a.id === id))
      .filter((a): a is Agent => !!a);
    const load = (a: Agent) =>
      all.filter((x) => x.agentUserId === a.id && x.open).length;
    let pool = members;
    if (cfg.assignment.skipAway)
      pool = pool.filter((a) => a.status === 'Online');
    if (cfg.assignment.respectCapacity)
      pool = pool.filter((a) => load(a) < a.cap);
    if (queue.method === 'Skill Based')
      pool = pool.filter((a) =>
        a.skills.some((s) => s.toLowerCase() === t.category.toLowerCase()),
      );
    if (queue.method === 'Branch Based') {
      if (!queue.branchId)
        return { agent: null, why: 'Branch Based queue has no branch scope' };
      if (queue.branchId !== t.branchId)
        return { agent: null, why: 'ticket is outside the queue’s branch' };
      pool = pool.filter((a) => a.homeBusinessId === t.branchId);
    }
    if (!pool.length)
      return {
        agent: null,
        why: 'no eligible member is online and under capacity',
      };
    if (queue.method === 'Round Robin') {
      const order = (queue.members as string[]) ?? [];
      for (let i = 1; i <= order.length; i++) {
        const id = order[(queue.rrCursor + i + order.length) % order.length];
        const a = pool.find((x) => x.id === id);
        if (a) return { agent: a, why: 'Round Robin' };
      }
      return { agent: null, why: 'no eligible member' };
    }
    const best = [...pool].sort(
      (a, b) => load(a) / a.cap - load(b) / b.cap || load(a) - load(b),
    )[0];
    return { agent: best, why: queue.method };
  }

  /** Assigns a new/unassigned ticket through its queue's method (no-op for manual queues). */
  async autoAssign(
    t: HelpdeskTicket,
    cfg: HelpdeskConfig,
  ): Promise<HelpdeskTicket> {
    if (t.agentUserId || !isOpenStatus(t.status) || !t.queueId) return t;
    const queue = await this.prisma.helpdeskQueue.findUnique({
      where: { id: t.queueId },
    });
    if (!queue || queue.method === 'Manual') return t;
    const agents = await this.ctx.agents(t.businessId);
    const { all } = await this.loadAll(t.businessId, cfg);
    const { agent, why } = this.pick(t, queue, agents, all, cfg);
    if (!agent) {
      await this.sys(
        t,
        SYSTEM,
        `Not auto-assigned by ${queue.method} (${queue.name}) — ${why}`,
      );
      return t;
    }
    if (queue.method === 'Round Robin') {
      const idx = ((queue.members as string[]) ?? []).indexOf(agent.id);
      await this.prisma.helpdeskQueue.update({
        where: { id: queue.id },
        data: { rrCursor: idx },
      });
    }
    return this.assign(
      t,
      agent.id,
      SYSTEM,
      cfg,
      `by ${why} (${queue.name} queue)`,
    );
  }

  async loadAll(rootId: string, cfg: HelpdeskConfig) {
    const tickets = await this.prisma.helpdeskTicket.findMany({
      where: { businessId: rootId, status: { notIn: CLOSED_STATUSES } },
    });
    const [queues, branches, agents, policies] = await Promise.all([
      this.prisma.helpdeskQueue.findMany({ where: { businessId: rootId } }),
      this.ctx.branches(rootId),
      this.ctx.agents(rootId),
      this.ctx.policies(rootId),
    ]);
    const all = await this.loader.rows(tickets, {
      cfg,
      queues,
      branches,
      agents,
      policies,
      calendar: await this.ctx.calendar(rootId, cfg),
    });
    return { all, queues, agents };
  }

  /**
   * The design's rebalance: move non-urgent tickets (newest first) off agents over capacity to the
   * least-loaded Online member of the same queue who still has room.
   */
  rebalancePlan(
    all: TRow[],
    agents: Agent[],
    queues: HelpdeskQueue[],
  ): Array<{ id: string; number: string; from: string; to: string }> {
    const load = new Map(
      agents.map((a) => [
        a.id,
        all.filter((t) => t.agentUserId === a.id && t.open).length,
      ]),
    );
    const plan: Array<{
      id: string;
      number: string;
      from: string;
      to: string;
    }> = [];
    for (const a of agents) {
      let over = (load.get(a.id) ?? 0) - a.cap;
      if (over <= 0) continue;
      const mine = all
        .filter(
          (t) => t.agentUserId === a.id && t.open && t.priority !== 'Urgent',
        )
        .sort((x, y) => y.createdAt.localeCompare(x.createdAt));
      for (const t of mine) {
        if (over <= 0) break;
        const q = queues.find((x) => x.id === t.queueId);
        const members = (q?.members as string[]) ?? [];
        const pool = agents
          .filter(
            (b) =>
              b.id !== a.id &&
              b.status === 'Online' &&
              members.includes(b.id) &&
              (load.get(b.id) ?? 0) < b.cap,
          )
          .sort(
            (x, y) =>
              (load.get(x.id) ?? 0) / x.cap - (load.get(y.id) ?? 0) / y.cap,
          );
        if (!pool.length) continue;
        plan.push({ id: t.id, number: t.number, from: a.id, to: pool[0].id });
        load.set(pool[0].id, (load.get(pool[0].id) ?? 0) + 1);
        load.set(a.id, (load.get(a.id) ?? 0) - 1);
        over--;
      }
    }
    return plan;
  }

  // ── simple field changes ─────────────────────────────────────────────────

  async setPriority(t: HelpdeskTicket, p: string, who: Who) {
    if (t.priority === p) return t;
    if (!['Urgent', 'High', 'Normal', 'Low'].includes(p))
      throw new AppException(
        HD_ERRORS.INVALID,
        'Unknown priority.',
        HttpStatus.BAD_REQUEST,
      );
    const n = await this.prisma.helpdeskTicket.update({
      where: { id: t.id },
      data: { priority: p, lastActivityAt: new Date() },
    });
    await this.sys(n, who, `Priority ${t.priority} → ${p}`);
    await this.ctx.log(
      t.businessId,
      who,
      'Priority changed',
      `${t.number} · ${t.priority} → ${p}`,
      t.id,
    );
    return n;
  }

  async setQueue(t: HelpdeskTicket, queueId: string, who: Who) {
    if (t.queueId === queueId) return t;
    const q = await this.prisma.helpdeskQueue.findFirst({
      where: { id: queueId, businessId: t.businessId },
    });
    if (!q)
      throw new AppException(
        HD_ERRORS.NOT_FOUND,
        'Queue not found.',
        HttpStatus.NOT_FOUND,
      );
    if (!q.active)
      throw new AppException(
        HD_ERRORS.CONFLICT,
        `${q.name} is disabled.`,
        HttpStatus.CONFLICT,
      );
    const old = t.queueId
      ? (
          await this.prisma.helpdeskQueue.findUnique({
            where: { id: t.queueId },
            select: { name: true },
          })
        )?.name
      : '—';
    const n = await this.prisma.helpdeskTicket.update({
      where: { id: t.id },
      data: { queueId, lastActivityAt: new Date() },
    });
    await this.sys(n, who, `Queue ${old ?? '—'} → ${q.name}`);
    await this.ctx.log(
      t.businessId,
      who,
      'Queue moved',
      `${t.number} → ${q.name}`,
      t.id,
    );
    return n;
  }

  async addTag(t: HelpdeskTicket, raw: string, who: Who, add = true) {
    const tag = normalizeTag(raw);
    const tags = (t.tags as string[]) ?? [];
    if (!tag || (add && tags.includes(tag)) || (!add && !tags.includes(tag)))
      return t;
    const n = await this.prisma.helpdeskTicket.update({
      where: { id: t.id },
      data: {
        tags: add ? [...tags, tag] : tags.filter((g) => g !== tag),
        lastActivityAt: new Date(),
      },
    });
    await this.sys(n, who, `${add ? 'Tag added' : 'Tag removed'} #${tag}`);
    return n;
  }

  describe(sla: SlaState) {
    return sla.policyName
      ? `SLA policy “${sla.policyName}” applied · first response ${fmtM(sla.fr ?? 0)} · resolution ${fmtM(sla.res ?? 0)}`
      : 'No SLA policy applies';
  }
}

export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^#/, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
