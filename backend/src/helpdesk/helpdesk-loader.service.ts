import { Injectable } from '@nestjs/common';
import { HelpdeskQueue, HelpdeskTicket } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  Agent,
  Branch,
  HdActor,
  HelpdeskContextService,
} from './helpdesk-context.service';
import { HelpdeskConfig, isOpenStatus } from './helpdesk.constants';
import {
  Calendar,
  SlaPolicyLite,
  SlaState,
  evaluateSla,
} from './helpdesk-sla.util';

export interface TRow {
  id: string;
  number: string;
  subject: string;
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  segment: string | null;
  branchId: string;
  branchName: string;
  channel: string;
  conversationId: string | null;
  category: string;
  subcategory: string | null;
  priority: string;
  status: string;
  open: boolean;
  agentUserId: string | null;
  agentName: string;
  queueId: string | null;
  queueName: string;
  tags: string[];
  followers: string[];
  escalated: boolean;
  reopenCount: number;
  mergedInto: string | null;
  createdAt: string;
  updatedAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  /** Minutes from creation to the first public reply. */
  frMins: number | null;
  /** Minutes from creation to resolved/closed. */
  resMins: number | null;
  lastKind: string | null;
  fired: Record<string, number>;
  sla: SlaState;
}

export interface Loaded {
  cfg: HelpdeskConfig;
  /** Every ticket the actor may see (branch filter applied). */
  rows: TRow[];
  /** Every ticket in the helpdesk, unscoped (internal use: workload, capacity, jobs). */
  all: TRow[];
  queues: HelpdeskQueue[];
  branches: Branch[];
  agents: Agent[];
  policies: SlaPolicyLite[];
  calendar: Calendar | null;
  raw: Map<string, HelpdeskTicket>;
}

type PauseTuple = [string, string, string];

@Injectable()
export class HelpdeskLoaderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: HelpdeskContextService,
  ) {}

  /** Whether the actor may see this ticket (Settings › Permissions: view all / view assigned). */
  canSee(
    actor: HdActor,
    cfg: HelpdeskConfig,
    t: Pick<TRow, 'agentUserId' | 'queueId' | 'followers'>,
    queues: HelpdeskQueue[],
  ): boolean {
    if (this.ctx.can(actor, cfg, 'View all tickets')) return true;
    if (!this.ctx.can(actor, cfg, 'View assigned tickets')) return false;
    if (t.agentUserId === actor.userId) return true;
    if (t.followers.includes(actor.userId)) return true;
    if (!t.agentUserId) {
      const q = queues.find((x) => x.id === t.queueId);
      if (!q || q.systemKey === 'unassigned') return true;
      return ((q.members as string[]) ?? []).includes(actor.userId);
    }
    return false;
  }

  async load(
    actor: HdActor,
    opts: { branch?: string | null; where?: object } = {},
  ): Promise<Loaded> {
    const rootId = actor.rootId;
    const cfg = await this.ctx.config(rootId);
    const [tickets, queues, branches, agents, policies] = await Promise.all([
      this.prisma.helpdeskTicket.findMany({
        where: { businessId: rootId, ...(opts.where ?? {}) },
        orderBy: { lastActivityAt: 'desc' },
      }),
      this.prisma.helpdeskQueue.findMany({
        where: { businessId: rootId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.ctx.branches(rootId),
      this.ctx.agents(rootId),
      this.ctx.policies(rootId),
    ]);
    const calendar = await this.ctx.calendar(rootId, cfg);
    const all = await this.rows(tickets, {
      cfg,
      queues,
      branches,
      agents,
      policies,
      calendar,
    });
    const branch = opts.branch && opts.branch !== 'all' ? opts.branch : null;
    const rows = all.filter(
      (t) =>
        (!branch || t.branchId === branch) &&
        this.canSee(actor, cfg, t, queues),
    );
    return {
      cfg,
      rows,
      all,
      queues,
      branches,
      agents,
      policies,
      calendar,
      raw: new Map(tickets.map((t) => [t.id, t])),
    };
  }

  /** Projects raw tickets to list rows with live SLA state. */
  async rows(
    tickets: HelpdeskTicket[],
    c: {
      cfg: HelpdeskConfig;
      queues: HelpdeskQueue[];
      branches: Branch[];
      agents: Agent[];
      policies: SlaPolicyLite[];
      calendar: Calendar | null;
    },
    now = new Date(),
  ): Promise<TRow[]> {
    if (!tickets.length) return [];
    const custIds = [...new Set(tickets.map((t) => t.customerId))];
    const needSegments = c.policies.some(
      (p) => p.active && p.applies === 'Customer Segment',
    );
    const [customers, segMap] = await Promise.all([
      this.prisma.customer.findMany({
        where: { id: { in: custIds } },
        select: { id: true, name: true, email: true, phone: true, tags: true },
      }),
      needSegments
        ? this.ctx.segmentsOf(custIds)
        : Promise.resolve(new Map<string, string[]>()),
    ]);
    const cust = new Map(customers.map((x) => [x.id, x]));
    const agentName = new Map(c.agents.map((a) => [a.id, a.name]));
    const missing = [
      ...new Set(
        tickets
          .map((t) => t.agentUserId)
          .filter((x): x is string => !!x && !agentName.has(x)),
      ),
    ];
    if (missing.length) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: missing } },
        select: { id: true, name: true },
      });
      for (const u of users) agentName.set(u.id, u.name);
    }
    const qName = new Map(c.queues.map((q) => [q.id, q.name]));
    const bName = new Map(c.branches.map((b) => [b.id, b.name]));
    const byId = new Map(tickets.map((t) => [t.id, t.number]));
    const mins = (a: Date | null, b: Date) =>
      a ? Math.max(0, Math.round((a.getTime() - b.getTime()) / 60000)) : null;
    return tickets.map((t) => {
      const cu = cust.get(t.customerId);
      const tags = (Array.isArray(cu?.tags) ? (cu.tags as unknown[]) : []).map(
        (x) => String(x),
      );
      const segments = [
        ...(segMap.get(t.customerId) ?? []),
        ...tags.map((x) => x.toLowerCase()),
      ];
      const sla = evaluateSla(
        {
          status: t.status,
          priority: t.priority,
          category: t.category,
          queueName: t.queueId ? (qName.get(t.queueId) ?? null) : null,
          branchName: bName.get(t.branchId) ?? null,
          segments,
          createdAt: t.createdAt,
          firstResponseAt: t.firstResponseAt,
          slaMissed: t.slaMissed,
          pauses: (t.pauses as unknown as PauseTuple[]) ?? [],
          pausedSince: t.pausedSince,
        },
        c.policies,
        c.calendar,
        now,
      );
      return {
        id: t.id,
        number: t.number,
        subject: t.subject,
        customerId: t.customerId,
        customerName: cu?.name ?? 'Deleted customer',
        customerEmail: cu?.email ?? null,
        customerPhone: cu?.phone ?? null,
        segment: tags.find((x) => /^(vip|b2b)$/i.test(x)) ?? null,
        branchId: t.branchId,
        branchName: bName.get(t.branchId) ?? 'Other branch',
        channel: t.channel,
        conversationId: t.conversationId,
        category: t.category,
        subcategory: t.subcategory,
        priority: t.priority,
        status: t.status,
        open: isOpenStatus(t.status),
        agentUserId: t.agentUserId,
        agentName: t.agentUserId
          ? (agentName.get(t.agentUserId) ?? 'Former staff member')
          : 'Unassigned',
        queueId: t.queueId,
        queueName: t.queueId ? (qName.get(t.queueId) ?? '—') : '—',
        tags: (t.tags as string[]) ?? [],
        followers: (t.followers as string[]) ?? [],
        escalated: t.escalated,
        reopenCount: t.reopenCount,
        mergedInto: t.mergedIntoId ? (byId.get(t.mergedIntoId) ?? null) : null,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.lastActivityAt.toISOString(),
        firstResponseAt: t.firstResponseAt?.toISOString() ?? null,
        resolvedAt: (t.resolvedAt ?? t.closedAt)?.toISOString() ?? null,
        frMins: mins(t.firstResponseAt, t.createdAt),
        resMins: mins(t.resolvedAt ?? t.closedAt, t.createdAt),
        lastKind: t.lastKind,
        fired: (t.fired as Record<string, number>) ?? {},
        sla,
      };
    });
  }

  /** Open tickets, urgent and SLA-risk counts per agent (for capacity and workload). */
  workload(all: TRow[], agentId: string) {
    const L = all.filter((t) => t.agentUserId === agentId && t.open);
    return {
      open: L.length,
      urgent: L.filter((t) => t.priority === 'Urgent').length,
      risk: L.filter((t) => t.sla.k === 'At Risk' || t.sla.k === 'Breached')
        .length,
    };
  }
}
