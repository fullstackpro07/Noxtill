import { Injectable, Logger } from '@nestjs/common';
import {
  HelpdeskEscalationRule,
  HelpdeskQueue,
  HelpdeskTicket,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { Agent, HelpdeskContextService } from './helpdesk-context.service';
import { HelpdeskOpsService, SYSTEM } from './helpdesk-ops.service';
import { HelpdeskDeliveryService } from './helpdesk-delivery.service';
import { TRow } from './helpdesk-loader.service';
import {
  CLOSED_STATUSES,
  HelpdeskConfig,
  RAISE_PRIORITY,
} from './helpdesk.constants';
import type { Attachment } from './helpdesk-tickets.service';

const UNASSIGNED_MINUTES = 30;
const YEARS: Record<string, number> = {
  '1 year': 1,
  '2 years': 2,
  '3 years': 3,
  '5 years': 5,
  '7 years': 7,
};

export interface JobReport {
  sla: number;
  escalations: number;
  csatSent: number;
  autoClosed: number;
  reassigned: number;
  purged: number;
}

/**
 * Everything Helpdesk does on its own, run every minute per helpdesk (and on "Refresh"). Every
 * step is idempotent: SLA/escalation triggers fire once per ticket (the ticket's `fired` flags),
 * CSAT rows move scheduled → sent/failed once, and closes/purges only touch rows still due.
 */
@Injectable()
export class HelpdeskJobsService {
  private readonly logger = new Logger(HelpdeskJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: HelpdeskContextService,
    private readonly ops: HelpdeskOpsService,
    private readonly delivery: HelpdeskDeliveryService,
    private readonly s3: S3Service,
  ) {}

  async helpdesks(): Promise<string[]> {
    return (
      await this.prisma.helpdeskSettings.findMany({
        select: { businessId: true },
      })
    ).map((r) => r.businessId);
  }

  async run(rootId: string): Promise<JobReport> {
    const cfg = await this.ctx.config(rootId);
    const report: JobReport = {
      sla: 0,
      escalations: 0,
      csatSent: 0,
      autoClosed: 0,
      reassigned: 0,
      purged: 0,
    };
    const step = async (name: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (e) {
        this.logger.warn(
          `helpdesk ${name} failed for ${rootId}: ${(e as Error).message}`,
        );
      }
    };
    await step(
      'leave',
      async () => (report.reassigned = await this.reassignOnLeave(rootId, cfg)),
    );
    await step('triggers', async () =>
      Object.assign(report, await this.triggers(rootId, cfg)),
    );
    await step(
      'csat',
      async () => (report.csatSent = await this.sendCsat(rootId, cfg)),
    );
    await step(
      'autoclose',
      async () => (report.autoClosed = await this.autoClose(rootId, cfg)),
    );
    await step(
      'retention',
      async () => (report.purged = await this.retention(rootId, cfg)),
    );
    return report;
  }

  // ── SLA + escalation triggers ────────────────────────────────────────────

  private async triggers(rootId: string, cfg: HelpdeskConfig) {
    const { all, queues, agents } = await this.ops.loadAll(rootId, cfg);
    const rules = await this.prisma.helpdeskEscalationRule.findMany({
      where: { businessId: rootId, active: true },
      orderBy: { createdAt: 'asc' },
    });
    let sla = 0;
    let escalations = 0;
    const now = Date.now();
    for (const row of all) {
      if (!row.open) continue;
      const fired = { ...row.fired };
      const trig: Array<[string, string, HelpdeskEscalationRule[]]> = [];
      const k = row.sla.k;
      if (k === 'At Risk' && !fired.risk)
        trig.push([
          'risk',
          'SLA At Risk',
          rules.filter((r) => r.trigger === 'SLA At Risk'),
        ]);
      if (k === 'Breached' && !fired.breach) {
        if (!fired.risk) fired.risk = 1;
        trig.push([
          'breach',
          'SLA Breached',
          rules.filter((r) => r.trigger === 'SLA Breached'),
        ]);
      }
      if (
        !row.agentUserId &&
        !fired.unas &&
        now - new Date(row.createdAt).getTime() > UNASSIGNED_MINUTES * 60000
      )
        trig.push([
          'unas',
          'No Agent Assigned',
          rules.filter((r) => r.trigger === 'No Agent Assigned'),
        ]);
      if (row.priority === 'Urgent' && !fired.urg)
        trig.push([
          'urg',
          'Priority = Urgent',
          rules.filter((r) => r.trigger === 'Priority = Urgent'),
        ]);
      for (const r of rules.filter(
        (x) => x.trigger === 'Ticket Age' && x.ageHours,
      )) {
        const key = `age:${r.id}`;
        if (
          !fired[key] &&
          now - new Date(row.createdAt).getTime() > r.ageHours! * 3600000
        )
          trig.push([key, 'Ticket Age', [r]]);
      }
      if (!trig.length) continue;
      for (const [fk] of trig) fired[fk] = 1;
      // Mark first so a crash mid-way can never fire the same trigger twice.
      await this.prisma.helpdeskTicket.update({
        where: { id: row.id },
        data: { fired },
      });
      let t = await this.ops.fresh(row.id);
      for (const [fk, name, matched] of trig) {
        if (fk === 'risk' || fk === 'breach') {
          sla++;
          await this.ops.sys(
            t,
            SYSTEM,
            `SLA job: ${fk === 'risk' ? 'at risk' : 'breach'} detected (${row.sla.policyName ?? 'no policy'})`,
          );
          await this.ctx.log(
            rootId,
            SYSTEM,
            fk === 'risk' ? 'SLA at risk' : 'SLA breached',
            `${row.number} · ${row.sla.policyName ?? ''} · ${row.sla.sub}`,
            row.id,
          );
          await this.ctx.notify(
            rootId,
            [row.agentUserId, ...row.followers],
            fk === 'risk' ? 'SLA risk' : 'SLA breach',
            {
              title: `${row.number}: SLA ${fk === 'risk' ? 'at risk' : 'breached'}`,
              body: `${row.subject} · ${row.sla.sub}`,
              link: `/helpdesk/tickets/${row.number}`,
            },
            { cfg },
          );
        }
        for (const rule of matched) {
          escalations++;
          await this.runRule(rootId, cfg, rule, t, name, row, queues, agents);
          t = await this.ops.fresh(row.id);
        }
      }
    }
    return { sla, escalations };
  }

  /** Performs one rule's action on one ticket and logs the real outcome. Also used by "Retry action". */
  async runRule(
    rootId: string,
    cfg: HelpdeskConfig,
    rule: HelpdeskEscalationRule,
    t: HelpdeskTicket,
    trigger: string,
    row: Pick<TRow, 'number' | 'subject' | 'sla'>,
    queues: HelpdeskQueue[],
    agents: Agent[],
    existingLogId?: string,
  ): Promise<{ ok: boolean; result: string }> {
    const q =
      rule.targetType === 'Queue'
        ? queues.find((x) => x.id === rule.targetId)
        : undefined;
    const person =
      rule.targetType !== 'Queue'
        ? agents.find((a) => a.id === rule.targetId)
        : undefined;
    const targetLabel = q?.name ?? person?.name ?? 'Unknown target';
    let ok = true;
    let result = '';
    try {
      if (rule.action === 'Move queue' || rule.action === 'Reassign') {
        if (t.status === 'Waiting on Internal Team' && t.escalated) {
          ok = false;
          result =
            'Queue move rejected: ticket locked by internal review (escalated and waiting on the internal team)';
        } else if (!q || !q.active) {
          ok = false;
          result = `Target queue “${targetLabel}” is unavailable`;
        } else {
          let cur = await this.ops.setQueue(t, q.id, SYSTEM);
          cur = await this.prisma.helpdeskTicket.update({
            where: { id: t.id },
            data: { escalated: true },
          });
          if (rule.action === 'Reassign') {
            if (cur.agentUserId)
              cur = await this.ops.assign(
                cur,
                null,
                SYSTEM,
                cfg,
                `(rule “${rule.name}”)`,
              );
            cur = await this.ops.autoAssign(cur, cfg);
            result = `Moved to ${q.name}${cur.agentUserId ? ` and assigned to ${await this.ctx.userName(cur.agentUserId)}` : ' — waiting for assignment'}`;
          } else result = `Moved to ${q.name}`;
        }
      } else if (rule.action === 'Raise priority') {
        const next = RAISE_PRIORITY[t.priority] ?? t.priority;
        if (next === t.priority) result = `Already ${t.priority}`;
        else {
          await this.ops.setPriority(t, next, SYSTEM);
          result = `Priority raised to ${next}`;
        }
      } else {
        const to = q
          ? ((q.members as string[]) ?? [])
          : person
            ? [person.id]
            : [];
        if (!to.length) {
          ok = false;
          result = `Nobody to notify — ${q ? `${q.name} has no members` : 'the target is no longer a Helpdesk agent'}`;
        } else {
          const alert = rule.action === 'Create internal alert';
          const sent = await this.ctx.notify(
            rootId,
            to,
            'Escalation',
            {
              title: `${alert ? 'Alert' : 'Escalation'}: ${row.number} · ${trigger}`,
              body: `${row.subject} · ${row.sla.sub}`,
              link: `/helpdesk/tickets/${row.number}`,
            },
            { cfg },
          );
          ok = sent.ok;
          result = (alert ? 'Internal alert · ' : '') + sent.summary;
        }
      }
    } catch (e) {
      ok = false;
      result = (e as Error).message;
    }
    await this.ops.sys(
      t,
      SYSTEM,
      `Escalation “${rule.name}” → ${result}${ok ? '' : ' · not marked complete'}`,
    );
    const data = {
      ticketId: t.id,
      ruleId: rule.id,
      ruleName: rule.name,
      trigger,
      target: targetLabel.slice(0, 191),
      result: result.slice(0, 500),
      status: ok ? 'Succeeded' : 'Failed',
    };
    if (existingLogId)
      await this.prisma.helpdeskEscalation.update({
        where: { id: existingLogId },
        data: { ...data, result: `${data.result} (retry)`.slice(0, 500) },
      });
    else
      await this.prisma.helpdeskEscalation.create({
        data: { businessId: rootId, ...data },
      });
    return { ok, result };
  }

  // ── CSAT ─────────────────────────────────────────────────────────────────

  private async sendCsat(rootId: string, cfg: HelpdeskConfig): Promise<number> {
    const due = await this.prisma.helpdeskCsat.findMany({
      where: {
        businessId: rootId,
        status: 'scheduled',
        sendAt: { lte: new Date() },
      },
      take: 50,
    });
    let n = 0;
    for (const c of due) {
      const t = await this.prisma.helpdeskTicket.findUnique({
        where: { id: c.ticketId },
      });
      if (!t || (t.status !== 'Resolved' && t.status !== 'Closed')) {
        // Reopened before the survey went out — don't survey an unresolved ticket.
        await this.prisma.helpdeskCsat.delete({ where: { id: c.id } });
        if (t)
          await this.ops.sys(
            t,
            SYSTEM,
            'CSAT survey cancelled — the ticket was reopened before it was sent',
          );
        continue;
      }
      if (!cfg.csat.enabled) {
        await this.prisma.helpdeskCsat.update({
          where: { id: c.id },
          data: {
            status: 'failed',
            failReason: 'Surveys were turned off before sending',
          },
        });
        continue;
      }
      const link = `${this.delivery.portalUrl(t.portalToken)}?rate=1`;
      if (c.channel === 'Portal') {
        await this.prisma.helpdeskCsat.update({
          where: { id: c.id },
          data: { status: 'sent', sentAt: new Date() },
        });
        await this.ops.sys(
          t,
          SYSTEM,
          'CSAT survey shown in the customer portal',
        );
        n++;
        continue;
      }
      const scale =
        cfg.csat.scale === 'Good / Bad'
          ? 'Good or Bad'
          : cfg.csat.scale === '1–10'
            ? 'from 1 to 10'
            : 'from 1 to 5 stars';
      const r = await this.delivery.notice(
        t,
        csatInvite(cfg.comms.lang, t.number, scale, link),
      );
      const ok = r.delivery !== 'failed';
      await this.prisma.helpdeskCsat.update({
        where: { id: c.id },
        data: ok
          ? { status: 'sent', sentAt: new Date() }
          : {
              status: 'failed',
              failReason: r.note.replace(/^✕ [^—]*— /, '').slice(0, 300),
            },
      });
      await this.ops.sys(
        t,
        SYSTEM,
        ok
          ? `CSAT survey sent via ${r.via}`
          : `CSAT survey not sent — ${r.note.replace(/^✕ [^—]*— /, '')}`,
      );
      if (ok) n++;
    }
    return n;
  }

  // ── auto-close, leave, retention ─────────────────────────────────────────

  private async autoClose(
    rootId: string,
    cfg: HelpdeskConfig,
  ): Promise<number> {
    const m = /^(\d+) days/.exec(cfg.general.autoClose);
    if (!m) return 0;
    const days = Number(m[1]);
    const due = await this.prisma.helpdeskTicket.findMany({
      where: {
        businessId: rootId,
        status: 'Resolved',
        resolvedAt: { lte: new Date(Date.now() - days * 86400000) },
      },
      take: 200,
    });
    for (const t of due) {
      await this.prisma.helpdeskTicket.update({
        where: { id: t.id },
        data: { status: 'Closed', closedAt: new Date() },
      });
      await this.ops.sys(t, SYSTEM, `Auto-closed ${days} days after Resolved`);
      await this.ctx.log(
        rootId,
        SYSTEM,
        'Auto-closed',
        `${t.number} · ${days} days after Resolved`,
        t.id,
      );
    }
    return due.length;
  }

  /** Settings › Assignment › "Reassign when agent goes on leave" (approved Staff time off). */
  private async reassignOnLeave(
    rootId: string,
    cfg: HelpdeskConfig,
  ): Promise<number> {
    if (!cfg.assignment.reassignOnLeave) return 0;
    const away = (await this.ctx.agents(rootId))
      .filter((a) => a.status === 'Away')
      .map((a) => a.id);
    if (!away.length) return 0;
    const tickets = await this.prisma.helpdeskTicket.findMany({
      where: {
        businessId: rootId,
        agentUserId: { in: away },
        status: { notIn: CLOSED_STATUSES },
      },
    });
    for (const t of tickets) {
      const cur = await this.ops.assign(
        t,
        null,
        SYSTEM,
        cfg,
        '— agent is on approved leave (Staff › Time off)',
      );
      await this.ops.autoAssign(cur, cfg);
    }
    return tickets.length;
  }

  /** Settings › Data Retention. Runs once a month per helpdesk (guarded by its audit row). */
  private async retention(
    rootId: string,
    cfg: HelpdeskConfig,
  ): Promise<number> {
    const month = new Date().toISOString().slice(0, 7);
    const marker = `Retention run ${month}`;
    if (
      await this.prisma.helpdeskAudit.findFirst({
        where: {
          businessId: rootId,
          action: 'Retention purge',
          detail: { startsWith: marker },
        },
      })
    )
      return 0;
    const years = YEARS[cfg.retention.closed] ?? 3;
    const cutoff = new Date(Date.now() - years * 365 * 86400000);
    const old = await this.prisma.helpdeskTicket.findMany({
      where: { businessId: rootId, status: 'Closed', closedAt: { lt: cutoff } },
      select: { id: true },
      take: 500,
    });
    let files = 0;
    const attDays =
      cfg.retention.attachments === '90 days after close'
        ? 90
        : cfg.retention.attachments === '1 year after close'
          ? 365
          : years * 365;
    const attCutoff = new Date(Date.now() - attDays * 86400000);
    const withFiles = await this.prisma.helpdeskMessage.findMany({
      where: {
        businessId: rootId,
        ticket: { status: 'Closed', closedAt: { lt: attCutoff } },
        NOT: { attachments: { equals: [] } },
      },
      select: { id: true, attachments: true },
      take: 500,
    });
    for (const m of withFiles) {
      for (const a of (m.attachments as unknown as Attachment[]) ?? []) {
        await this.s3.delete(a.key).catch(() => undefined);
        files++;
      }
      await this.prisma.helpdeskMessage.update({
        where: { id: m.id },
        data: { attachments: [] },
      });
    }
    if (old.length) {
      await this.prisma.helpdeskCsat.deleteMany({
        where: { ticketId: { in: old.map((o) => o.id) } },
      });
      await this.prisma.helpdeskTicket.deleteMany({
        where: { id: { in: old.map((o) => o.id) } },
      });
    }
    await this.ctx.log(
      rootId,
      SYSTEM,
      'Retention purge',
      `${marker} · ${old.length} closed tickets older than ${cfg.retention.closed} deleted · ${files} attachments removed`,
    );
    return old.length;
  }
}

/** Settings › Customer Communication › Languages decides the survey invitation language. */
export function csatInvite(
  lang: string,
  number: string,
  scale: string,
  link: string,
): string {
  const en = `How did we do with ${number}? Rate us ${scale}: ${link}`;
  const ur = `${number} میں ہماری مدد کیسی رہی؟ براہِ کرم ریٹنگ دیں: ${link}`;
  if (lang === 'Urdu') return ur;
  if (lang === 'English + Urdu')
    return `${en}

${ur}`;
  return en;
}
