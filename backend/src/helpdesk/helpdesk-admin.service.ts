import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import {
  HdActor,
  HelpdeskContextService,
  formatNumber,
} from './helpdesk-context.service';
import { HelpdeskOpsService } from './helpdesk-ops.service';
import { HelpdeskJobsService } from './helpdesk-jobs.service';
import { parseHolidays } from './helpdesk-sla.util';
import {
  AUTO_CLOSE_OPTIONS,
  CSAT_CHANNELS,
  CSAT_DELAYS,
  CSAT_FOLLOWUPS,
  CSAT_SCALES,
  DEFAULT_STATUSES,
  HD_CAPS,
  HD_ERRORS,
  HOME_BRANCH,
  HelpdeskConfig,
  NOTIFY_CHANNELS,
  NOTIFY_EVENTS,
  PRIORITIES,
  QUEUE_METHODS,
  QUEUE_PRIORITY_RULES,
  REOPEN_OPTIONS,
  RETENTION_ATTACHMENTS,
  RETENTION_CLOSED,
  RULE_ACTIONS,
  RULE_TRIGGERS,
  SETTINGS_SECTIONS,
  SLA_APPLIES,
  isOpenStatus,
  mergeConfig,
} from './helpdesk.constants';
import {
  AgentProfileDto,
  CsatSettingsDto,
  QueueDto,
  QueueToggleDto,
  RuleDto,
  SlaPolicyDto,
} from './dto/helpdesk.dto';

const bad = (m: string) =>
  new AppException(HD_ERRORS.INVALID, m, HttpStatus.BAD_REQUEST);
const conflict = (m: string) =>
  new AppException(HD_ERRORS.CONFLICT, m, HttpStatus.CONFLICT);
const notFound = (m: string) =>
  new AppException(HD_ERRORS.NOT_FOUND, m, HttpStatus.NOT_FOUND);

@Injectable()
export class HelpdeskAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: HelpdeskContextService,
    private readonly ops: HelpdeskOpsService,
    private readonly jobs: HelpdeskJobsService,
  ) {}

  // ── queues ───────────────────────────────────────────────────────────────

  async saveQueue(actor: HdActor, id: string | null, dto: QueueDto) {
    this.ctx.assertManager(actor, 'Editing queues');
    const rootId = actor.rootId;
    const cfg = await this.ctx.config(rootId);
    const name = dto.name.trim();
    const dup = await this.prisma.helpdeskQueue.findFirst({
      where: { businessId: rootId, name, ...(id ? { NOT: { id } } : {}) },
    });
    if (dup) throw bad('A queue with this name already exists.');
    if (!QUEUE_METHODS.includes(dto.method))
      throw bad('Unknown assignment method.');
    if (!QUEUE_PRIORITY_RULES.includes(dto.priorityRule))
      throw bad('Unknown priority rule.');
    const branchId =
      dto.branchId && dto.branchId !== 'all' ? dto.branchId : null;
    if (
      branchId &&
      !(await this.ctx.branches(rootId)).some((b) => b.id === branchId)
    )
      throw bad('Unknown branch.');
    const cats = dto.categories.filter((c) => cfg.categories.includes(c));
    const agents = await this.ctx.agents(rootId);
    const members = [...new Set(dto.members)].filter((m) =>
      agents.some((a) => a.id === m),
    );
    if (dto.method === 'Skill Based' && !cats.length)
      throw bad(
        'Skill Based needs at least one ticket category to match agent skills.',
      );
    if (dto.method === 'Branch Based' && !branchId)
      throw bad('Branch Based needs a specific branch scope.');
    if (dto.method !== 'Manual' && !members.length)
      throw bad(`${dto.method} needs at least one member.`);
    const data = {
      name,
      description: dto.description?.trim() || null,
      members,
      categories: cats,
      branchId,
      priorityRule: dto.priorityRule,
      method: dto.method,
    };
    if (id) {
      const q = await this.queue(rootId, id);
      if (!dto.active && q.active)
        throw bad('Use Disable queue so its open tickets can be moved first.');
      if (q.systemKey === 'unassigned' && dto.method !== 'Manual')
        throw bad('The Unassigned queue is always manual.');
      await this.prisma.helpdeskQueue.update({
        where: { id },
        data: { ...data, active: q.systemKey ? true : dto.active || q.active },
      });
    } else {
      const max = await this.prisma.helpdeskQueue.aggregate({
        where: { businessId: rootId },
        _max: { sortOrder: true },
      });
      await this.prisma.helpdeskQueue.create({
        data: {
          businessId: rootId,
          ...data,
          active: dto.active,
          sortOrder: (max._max.sortOrder ?? 0) + 1,
        },
      });
    }
    await this.ctx.log(
      rootId,
      actor,
      id ? 'Queue updated' : 'Queue created',
      `${name} · ${dto.method}`,
    );
    return { ok: true };
  }

  private async queue(rootId: string, id: string) {
    const q = await this.prisma.helpdeskQueue.findFirst({
      where: { id, businessId: rootId },
    });
    if (!q) throw notFound('Queue not found.');
    return q;
  }

  async toggleQueue(actor: HdActor, id: string, dto: QueueToggleDto) {
    this.ctx.assertManager(actor, 'Disabling queues');
    const q = await this.queue(actor.rootId, id);
    if (dto.active) {
      await this.prisma.helpdeskQueue.update({
        where: { id },
        data: { active: true },
      });
      await this.ctx.log(actor.rootId, actor, 'Queue enabled', q.name);
      return { ok: true };
    }
    if (q.systemKey) throw conflict('System queues can’t be disabled.');
    const open = await this.prisma.helpdeskTicket.findMany({
      where: {
        businessId: actor.rootId,
        queueId: id,
        status: { notIn: ['Resolved', 'Closed'] },
      },
    });
    if (open.length) {
      if (!dto.moveTo)
        throw bad(
          `${open.length} open tickets are in this queue. Choose where to move them first.`,
        );
      const to = await this.queue(actor.rootId, dto.moveTo);
      if (!to.active || to.id === id) throw bad('Pick another active queue.');
      for (const t of open) await this.ops.setQueue(t, to.id, actor);
    }
    await this.prisma.helpdeskQueue.update({
      where: { id },
      data: { active: false },
    });
    await this.ctx.log(
      actor.rootId,
      actor,
      'Queue disabled',
      `${q.name}${open.length ? ` · ${open.length} tickets moved` : ''}`,
    );
    return { ok: true, moved: open.length };
  }

  async saveAgent(actor: HdActor, userId: string, dto: AgentProfileDto) {
    this.ctx.assertManager(actor, 'Editing agent skills and capacity');
    const a = await this.ctx.assertAgent(actor.rootId, userId);
    const skills = [
      ...new Set(dto.skills.map((s) => s.trim()).filter(Boolean)),
    ];
    await this.prisma.helpdeskAgent.upsert({
      where: { businessId_userId: { businessId: actor.rootId, userId } },
      create: {
        businessId: actor.rootId,
        userId,
        skills,
        capacity: dto.capacity,
      },
      update: { skills, capacity: dto.capacity },
    });
    await this.ctx.log(
      actor.rootId,
      actor,
      'Agent profile updated',
      `${a!.name} · capacity ${dto.capacity} · skills ${skills.join(', ') || 'none'}`,
    );
    return { ok: true };
  }

  // ── SLA policies ─────────────────────────────────────────────────────────

  async savePolicy(actor: HdActor, id: string | null, dto: SlaPolicyDto) {
    const cfg = await this.ctx.config(actor.rootId);
    this.ctx.assert(actor, cfg, 'Manage SLA', 'Changing SLA policies');
    if (!SLA_APPLIES.includes(dto.applies)) throw bad('Unknown “Applies to”.');
    if (!['Any', ...PRIORITIES].includes(dto.priority))
      throw bad('Unknown priority.');
    if (dto.res < dto.fr)
      throw bad(
        'Resolution target must be at least the first response target.',
      );
    const scope = (dto.scope ?? '').trim();
    if (!['All Tickets', 'Specific Priority'].includes(dto.applies) && !scope)
      throw bad(`${dto.applies} needs a scope value.`);
    if (dto.applies === 'Specific Priority' && dto.priority === 'Any')
      throw bad('Specific Priority needs a priority.');
    const statuses = [...cfg.statuses, ...cfg.customStatuses];
    const data = {
      name: dto.name.trim(),
      applies: dto.applies,
      scope: dto.applies === 'Specific Priority' ? dto.priority : scope,
      priority: dto.priority,
      firstResponseMins: dto.fr,
      resolutionMins: dto.res,
      hours: dto.hours,
      pauseStatuses: dto.pause.filter(
        (s) => statuses.includes(s) && isOpenStatus(s),
      ),
      warnPct: dto.warn,
      active: dto.active,
    };
    let before: unknown = null;
    if (id) {
      const p = await this.prisma.helpdeskSlaPolicy.findFirst({
        where: { id, businessId: actor.rootId },
      });
      if (!p) throw notFound('Policy not found.');
      before = p;
      await this.prisma.helpdeskSlaPolicy.update({ where: { id }, data });
    } else {
      const max = await this.prisma.helpdeskSlaPolicy.aggregate({
        where: { businessId: actor.rootId },
        _max: { sortOrder: true },
      });
      await this.prisma.helpdeskSlaPolicy.create({
        data: {
          businessId: actor.rootId,
          ...data,
          sortOrder: (max._max.sortOrder ?? 0) + 1,
        },
      });
    }
    await this.ctx.log(
      actor.rootId,
      actor,
      `SLA policy ${id ? 'updated' : 'created'}`,
      `${data.name} · ${dto.fr}m / ${dto.res}m`,
    );
    await this.ctx.appAudit(
      id ? 'helpdesk.sla.update' : 'helpdesk.sla.create',
      'HelpdeskSlaPolicy',
      id ?? data.name,
      before,
      data,
    );
    return { ok: true };
  }

  async policyAction(
    actor: HdActor,
    id: string,
    action: 'enable' | 'disable' | 'duplicate',
  ) {
    const cfg = await this.ctx.config(actor.rootId);
    this.ctx.assert(actor, cfg, 'Manage SLA', 'Changing SLA policies');
    const p = await this.prisma.helpdeskSlaPolicy.findFirst({
      where: { id, businessId: actor.rootId },
    });
    if (!p) throw notFound('Policy not found.');
    if (action === 'duplicate') {
      const max = await this.prisma.helpdeskSlaPolicy.aggregate({
        where: { businessId: actor.rootId },
        _max: { sortOrder: true },
      });
      await this.prisma.helpdeskSlaPolicy.create({
        data: {
          businessId: actor.rootId,
          name: `${p.name} (copy)`.slice(0, 120),
          applies: p.applies,
          scope: p.scope,
          priority: p.priority,
          firstResponseMins: p.firstResponseMins,
          resolutionMins: p.resolutionMins,
          hours: p.hours,
          pauseStatuses: p.pauseStatuses as Prisma.InputJsonValue,
          warnPct: p.warnPct,
          active: false,
          sortOrder: (max._max.sortOrder ?? 0) + 1,
        },
      });
    } else
      await this.prisma.helpdeskSlaPolicy.update({
        where: { id },
        data: { active: action === 'enable' },
      });
    await this.ctx.log(actor.rootId, actor, `SLA policy ${action}d`, p.name);
    return { ok: true };
  }

  // ── escalation rules ─────────────────────────────────────────────────────

  async saveRule(actor: HdActor, id: string | null, dto: RuleDto) {
    const cfg = await this.ctx.config(actor.rootId);
    this.ctx.assert(actor, cfg, 'Manage SLA', 'Changing escalation rules');
    if (!RULE_TRIGGERS.includes(dto.trigger)) throw bad('Unknown trigger.');
    if (!RULE_ACTIONS.includes(dto.action)) throw bad('Unknown action.');
    const [kind, targetId] = dto.target.split(':');
    let targetType: string;
    if (kind === 'queue') {
      const q = await this.queue(actor.rootId, targetId);
      if (!q.active) throw bad(`${q.name} is disabled.`);
      targetType = 'Queue';
    } else if (kind === 'user') {
      const a = await this.ctx.assertAgent(actor.rootId, targetId);
      targetType = a!.role === 'Agent' ? 'Specific Agent' : 'Manager';
    } else throw bad('Choose who to escalate to.');
    if (
      (dto.action === 'Move queue' || dto.action === 'Reassign') &&
      targetType !== 'Queue'
    )
      throw bad(`${dto.action} needs a queue as the target.`);
    if (dto.trigger === 'Ticket Age' && !dto.ageHours)
      throw bad('Ticket Age needs an age threshold in hours.');
    const data = {
      name: dto.name.trim(),
      trigger: dto.trigger,
      ageHours: dto.trigger === 'Ticket Age' ? dto.ageHours! : null,
      action: dto.action,
      targetType,
      targetId,
      active: dto.active,
    };
    if (id) {
      const r = await this.prisma.helpdeskEscalationRule.findFirst({
        where: { id, businessId: actor.rootId },
      });
      if (!r) throw notFound('Rule not found.');
      await this.prisma.helpdeskEscalationRule.update({ where: { id }, data });
    } else
      await this.prisma.helpdeskEscalationRule.create({
        data: { businessId: actor.rootId, ...data },
      });
    await this.ctx.log(actor.rootId, actor, 'Escalation rule saved', data.name);
    return { ok: true };
  }

  async ruleActive(actor: HdActor, id: string, active: boolean) {
    const cfg = await this.ctx.config(actor.rootId);
    this.ctx.assert(actor, cfg, 'Manage SLA', 'Changing escalation rules');
    const r = await this.prisma.helpdeskEscalationRule.findFirst({
      where: { id, businessId: actor.rootId },
    });
    if (!r) throw notFound('Rule not found.');
    await this.prisma.helpdeskEscalationRule.update({
      where: { id },
      data: { active },
    });
    await this.ctx.log(
      actor.rootId,
      actor,
      `Escalation rule ${active ? 'enabled' : 'disabled'}`,
      r.name,
    );
    return { ok: true };
  }

  async retryEscalation(actor: HdActor, id: string) {
    const cfg = await this.ctx.config(actor.rootId);
    this.ctx.assert(actor, cfg, 'Manage SLA', 'Retrying escalations');
    const log = await this.prisma.helpdeskEscalation.findFirst({
      where: { id, businessId: actor.rootId },
    });
    if (!log) throw notFound('Escalation not found.');
    if (log.status !== 'Failed')
      throw conflict('Only failed escalations can be retried.');
    const rule = log.ruleId
      ? await this.prisma.helpdeskEscalationRule.findUnique({
          where: { id: log.ruleId },
        })
      : null;
    if (!rule)
      throw conflict(
        'The rule behind this escalation was deleted, so it can’t be retried.',
      );
    const t = await this.prisma.helpdeskTicket.findUnique({
      where: { id: log.ticketId },
    });
    if (!t) throw conflict('The ticket no longer exists.');
    const { all, queues, agents } = await this.ops.loadAll(actor.rootId, cfg);
    const row =
      all.find((r) => r.id === t.id) ?? (await this.ops.slaOf(t, cfg)).row;
    const r = await this.jobs.runRule(
      actor.rootId,
      cfg,
      rule,
      t,
      log.trigger,
      row,
      queues,
      agents,
      log.id,
    );
    return { ok: r.ok, result: r.result };
  }

  // ── settings ─────────────────────────────────────────────────────────────

  async saveSettings(
    actor: HdActor,
    version: number,
    incoming: Record<string, unknown>,
  ) {
    const rootId = actor.rootId;
    const row = await this.ctx.settingsRow(rootId);
    const cur = await this.ctx.config(rootId);
    this.ctx.assert(
      actor,
      cur,
      'Manage settings',
      'Changing Helpdesk settings',
    );
    if (version !== row.version)
      throw conflict(
        `Settings were changed by someone else (now v${row.version}). Reload to see their changes, then save again.`,
      );
    const next = mergeConfig(
      { ...cur, ...pick(incoming, SETTINGS_SECTIONS) },
      cur.hours.tz,
    );
    await this.validate(rootId, cur, next);
    const changed = SETTINGS_SECTIONS.filter(
      (k) => JSON.stringify(next[k]) !== JSON.stringify(cur[k]),
    );
    if (!changed.length) return { version: row.version, changed: [] };
    const updated = await this.prisma.helpdeskSettings.update({
      where: { businessId: rootId },
      data: {
        config: next as unknown as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
    });
    await this.retimeSurveys(rootId, cur.csat.delay, next.csat.delay);
    for (const c of changed)
      await this.ctx.log(
        rootId,
        actor,
        'Settings changed',
        `${String(c)} (v${updated.version})`,
      );
    await this.ctx.appAudit(
      'helpdesk.settings.update',
      'HelpdeskSettings',
      rootId,
      pick(cur as unknown as Record<string, unknown>, changed),
      pick(next as unknown as Record<string, unknown>, changed),
    );
    return { version: updated.version, changed };
  }

  async saveCsatSettings(actor: HdActor, dto: CsatSettingsDto) {
    this.ctx.assertManager(actor, 'Changing survey settings');
    const rootId = actor.rootId;
    const cur = await this.ctx.config(rootId);
    const next = { ...cur, csat: { ...dto } };
    await this.validate(rootId, cur, next);
    await this.prisma.helpdeskSettings.update({
      where: { businessId: rootId },
      data: {
        config: next,
        version: { increment: 1 },
      },
    });
    await this.retimeSurveys(rootId, cur.csat.delay, next.csat.delay);
    await this.ctx.log(
      rootId,
      actor,
      'CSAT settings changed',
      dto.enabled ? `On · ${dto.delay} · ${dto.channels.join(', ')}` : 'Off',
    );
    return { ok: true };
  }

  /** A new survey delay applies to surveys still waiting to go out, not just future ones. */
  private async retimeSurveys(rootId: string, from: string, to: string) {
    if (from === to) return;
    const shift =
      ((CSAT_DELAYS[to] ?? 120) - (CSAT_DELAYS[from] ?? 120)) * 60000;
    const pending = await this.prisma.helpdeskCsat.findMany({
      where: { businessId: rootId, status: 'scheduled' },
      select: { id: true, sendAt: true },
    });
    for (const p of pending)
      await this.prisma.helpdeskCsat.update({
        where: { id: p.id },
        data: { sendAt: new Date(p.sendAt.getTime() + shift) },
      });
  }

  private async validate(
    rootId: string,
    cur: HelpdeskConfig,
    n: HelpdeskConfig,
  ) {
    const g = n.general;
    if (!/\{#+\}/.test(g.numberFormat))
      throw bad('Ticket number format must include {#####}.');
    if (g.numberFormat.length > 30)
      throw bad('Ticket number format is too long.');
    formatNumber(g.numberFormat, 1);
    const queues = await this.prisma.helpdeskQueue.findMany({
      where: { businessId: rootId, active: true },
      select: { name: true },
    });
    if (!queues.some((q) => q.name === g.defaultQueue))
      throw bad('Default queue must be an active queue.');
    if (!PRIORITIES.includes(g.defaultPriority as (typeof PRIORITIES)[number]))
      throw bad('Unknown default priority.');
    const branches = await this.ctx.branches(rootId);
    if (
      g.defaultBranch !== HOME_BRANCH &&
      !branches.some((b) => b.name === g.defaultBranch)
    )
      throw bad('Unknown default branch.');
    if (!AUTO_CLOSE_OPTIONS.includes(g.autoClose))
      throw bad('Unknown auto-close option.');
    if (!REOPEN_OPTIONS.includes(g.reopen)) throw bad('Unknown reopen policy.');

    const clean = (arr: string[]) => [
      ...new Set(arr.map((x) => String(x).trim()).filter(Boolean)),
    ];
    n.customStatuses = clean(n.customStatuses).filter(
      (s) => !DEFAULT_STATUSES.includes(s),
    );
    n.categories = clean(n.categories);
    if (!n.categories.length) throw bad('Keep at least one category.');
    for (const s of cur.customStatuses.filter(
      (x) => !n.customStatuses.includes(x),
    )) {
      const inUse = await this.prisma.helpdeskTicket.count({
        where: { businessId: rootId, status: s },
      });
      if (inUse)
        throw conflict(
          `Can’t remove “${s}” — ${inUse} ticket(s) use it. Migrate them first.`,
        );
    }
    for (const c of cur.categories.filter((x) => !n.categories.includes(x))) {
      const inUse = await this.prisma.helpdeskTicket.count({
        where: {
          businessId: rootId,
          category: c,
          status: { notIn: ['Resolved', 'Closed'] },
        },
      });
      if (inUse)
        throw conflict(
          `Can’t remove “${c}” — ${inUse} open ticket(s) use it. Migrate them first.`,
        );
    }
    if (!['Per queue', 'Manual everywhere'].includes(n.assignment.method))
      throw bad('Unknown assignment mode.');
    n.assignment = {
      method: n.assignment.method,
      respectCapacity: !!n.assignment.respectCapacity,
      skipAway: !!n.assignment.skipAway,
      reassignOnLeave: !!n.assignment.reassignOnLeave,
    };

    const h = n.hours;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: h.tz });
    } catch {
      throw bad('Unknown timezone.');
    }
    if (
      !/^\d{2}:\d{2}$/.test(h.open) ||
      !/^\d{2}:\d{2}$/.test(h.close) ||
      h.close <= h.open
    )
      throw bad('Closing time must be after opening time.');
    h.days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].filter((d) =>
      h.days.includes(d),
    );
    if (!h.days.length) throw bad('Choose at least one working day.');
    const hol = String(h.holidays ?? '')
      .split(/[\s,;]+/)
      .filter(Boolean);
    const badDate = hol.find((x) => !/^\d{4}-\d{2}-\d{2}$/.test(x));
    if (badDate)
      throw bad(`Holidays must be dates like 2026-12-25 (got “${badDate}”).`);
    h.holidays = parseHolidays(h.holidays).join(', ');

    n.sla.warn = Math.round(Number(n.sla.warn));
    if (!(n.sla.warn >= 10 && n.sla.warn <= 99))
      throw bad('Warning threshold must be between 10 and 99%.');
    n.sla = {
      warn: n.sla.warn,
      pauseWaiting: !!n.sla.pauseWaiting,
      pauseInternal: !!n.sla.pauseInternal,
    };

    for (const ev of NOTIFY_EVENTS)
      n.notify[ev] = (n.notify[ev] ?? []).filter((c) =>
        NOTIFY_CHANNELS.includes(c),
      );
    n.notify = Object.fromEntries(NOTIFY_EVENTS.map((e) => [e, n.notify[e]]));

    n.comms = {
      signature: String(n.comms.signature ?? '').slice(0, 300),
      ack: !!n.comms.ack,
      ackText: String(n.comms.ackText ?? '').slice(0, 1000),
      lang: String(n.comms.lang ?? 'English'),
    };
    const vars = [
      ...`${n.comms.signature} ${n.comms.ackText}`.matchAll(
        /\{\{\s*([a-z_]+)\s*\}\}/g,
      ),
    ]
      .map((m) => m[1])
      .filter(
        (v) => !['customer_name', 'ticket_number', 'agent_name'].includes(v),
      );
    if (vars.length)
      throw bad(
        `Unsupported variable: {{${vars[0]}}}. Allowed: customer_name, ticket_number, agent_name.`,
      );

    const cs = n.csat;
    if (!(cs.delay in CSAT_DELAYS)) throw bad('Unknown survey delay.');
    if (!CSAT_SCALES.includes(cs.scale)) throw bad('Unknown rating scale.');
    if (!CSAT_FOLLOWUPS.includes(cs.followUp))
      throw bad('Unknown follow-up rule.');
    cs.channels = CSAT_CHANNELS.filter((c) => cs.channels.includes(c));
    if (cs.enabled && !cs.channels.length)
      throw bad('Choose at least one survey channel.');
    n.csat = {
      enabled: !!cs.enabled,
      delay: cs.delay,
      scale: cs.scale,
      comment: !!cs.comment,
      channels: cs.channels,
      followUp: cs.followUp,
    };

    for (const cap of HD_CAPS)
      n.perms[cap] = [1, n.perms[cap]?.[1] ? 1 : 0, n.perms[cap]?.[2] ? 1 : 0];
    if (!RETENTION_CLOSED.includes(n.retention.closed))
      throw bad('Unknown retention period.');
    if (!RETENTION_ATTACHMENTS.includes(n.retention.attachments))
      throw bad('Unknown attachment retention.');
    n.retention = {
      ...cur.retention,
      closed: n.retention.closed,
      attachments: n.retention.attachments,
    };
    n.advanced = {
      ...cur.advanced,
      ticketMerge: !!n.advanced.ticketMerge,
      split: !!n.advanced.split,
      collision: !!n.advanced.collision,
    };
    n.kbCategories = clean(n.kbCategories);
  }
}

function pick(o: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
}
