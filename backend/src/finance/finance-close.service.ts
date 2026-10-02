import { HttpStatus, Injectable } from '@nestjs/common';
import { FinCloseRun, FinCloseTask, FinPeriod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import {
  FinActor,
  FinanceContextService,
  dayOf,
  monthEnd,
  monthKey,
  monthLabel,
  monthStart,
  num,
  r2,
} from './finance-context.service';
import { FinanceJournalsService } from './finance-journals.service';
import { FinanceLedgerService } from './finance-ledger.service';
import { FinanceReceivablesService } from './finance-receivables.service';
import { FinancePayablesService } from './finance-payables.service';
import { FinanceAssetsService } from './finance-assets.service';
import { FinanceTaxService } from './finance-tax.service';
import { FinanceFxService } from './finance-fx.service';
import { CLOSE_TEMPLATE, FIN_ERRORS } from './finance.constants';

export interface ControlCheck {
  /** null = no automatic check for this task; '' = passes; text = the exception. */
  exception: string | null;
  na?: string;
  go: string;
}

export interface CloseTaskView {
  task: FinCloseTask;
  status: string;
  exception: string;
  na: string | null;
  go: string;
}

/** Business days after month end for the configured target close day. */
const CLOSE_DAYS: Record<string, number> = {
  '3rd business day': 3,
  '5th business day': 5,
  '10th business day': 10,
};

function addBusinessDays(d: Date, n: number) {
  const x = new Date(d);
  let left = n;
  while (left > 0) {
    x.setUTCDate(x.getUTCDate() + 1);
    const wd = x.getUTCDay();
    if (wd !== 0 && wd !== 6) left -= 1;
  }
  return x;
}

/**
 * Month-end close: a checklist whose controls are checked against the books (bank
 * reconciliations, subledger vs control, unposted documents, depreciation, tax, suspense, FX),
 * evidence on every item, a final approval and then the period lock.
 */
@Injectable()
export class FinanceCloseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FinanceContextService,
    private readonly journals: FinanceJournalsService,
    private readonly ledger: FinanceLedgerService,
    private readonly ar: FinanceReceivablesService,
    private readonly ap: FinancePayablesService,
    private readonly assets: FinanceAssetsService,
    private readonly tax: FinanceTaxService,
    private readonly fx: FinanceFxService,
  ) {}

  /** The period a close would be for: last month until it is locked, then this month. */
  async currentPeriod(rootId: string) {
    const tk = monthKey(dayOf(new Date()));
    const prev =
      tk.month === 1
        ? { year: tk.year - 1, month: 12 }
        : { year: tk.year, month: tk.month - 1 };
    const p = await this.ctx.period(rootId, prev.year, prev.month);
    return p.status === 'locked' ? tk : prev;
  }

  async periods(rootId: string) {
    const today = dayOf(new Date());
    const tk = monthKey(today);
    const out: FinPeriod[] = [];
    for (let i = 0; i < 6; i++) {
      let m = tk.month - i;
      let y = tk.year;
      while (m < 1) {
        m += 12;
        y -= 1;
      }
      out.push(await this.ctx.period(rootId, y, m));
    }
    return out;
  }

  async run(rootId: string, year: number, month: number) {
    return this.prisma.finCloseRun.findUnique({
      where: { businessId_year_month: { businessId: rootId, year, month } },
      include: { tasks: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async start(actor: FinActor, year: number, month: number) {
    this.ctx.need(actor, 'manage', 'Starting the close');
    const existing = await this.run(actor.rootId, year, month);
    if (existing && existing.status !== 'Reopened')
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        `The ${monthLabel(year, month)} close is already ${existing.status}.`,
        HttpStatus.CONFLICT,
      );
    const cfg = await this.ctx.config(actor.rootId);
    const due = addBusinessDays(
      monthEnd(year, month),
      CLOSE_DAYS[cfg.close.closeDay] ?? 5,
    );
    if (existing) {
      await this.prisma.finCloseRun.update({
        where: { id: existing.id },
        data: { status: 'In Progress' },
      });
      await this.ctx.audit(
        actor.rootId,
        actor,
        'close.restarted',
        'close',
        existing.id,
        monthLabel(year, month),
      );
      return existing;
    }
    const r = await this.prisma.finCloseRun.create({
      data: {
        businessId: actor.rootId,
        year,
        month,
        status: 'In Progress',
        startedById: actor.userId,
        tasks: {
          create: CLOSE_TEMPLATE.map(([key, title, area], i) => ({
            businessId: actor.rootId,
            key,
            title,
            area,
            ownerUserId: actor.userId,
            // Every control is due by the close policy's target day; owners can be reassigned.
            dueOn: due,
            status: 'Open',
            sortOrder: i,
          })),
        },
      },
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'close.started',
      'close',
      r.id,
      `${monthLabel(year, month)} close started · target ${due.toISOString().slice(0, 10)}`,
    );
    return r;
  }

  /** Live checks behind each control. */
  async checks(
    rootId: string,
    year: number,
    month: number,
  ): Promise<Record<string, ControlCheck>> {
    const from = monthStart(year, month);
    const to = monthEnd(year, month);
    const maps = await this.ctx.accountMaps(rootId);
    const branches = await this.ctx.branches(rootId);
    const out: Record<string, ControlCheck> = {};
    const fmt = (n: number) => n.toFixed(2);

    const banks = await this.prisma.finBankAccount.findMany({
      where: { businessId: rootId, active: true },
    });
    if (!banks.length)
      out['CL-01'] = {
        exception: '',
        na: 'No bank or cash accounts are set up in Finance',
        go: 'bankacc',
      };
    else {
      const missing: string[] = [];
      for (const b of banks) {
        const ok = await this.prisma.finReconciliation.findFirst({
          where: {
            businessId: rootId,
            bankAccountId: b.id,
            status: 'Locked',
            periodEnd: { gte: to },
          },
        });
        if (!ok) missing.push(b.name);
      }
      out['CL-01'] = {
        exception: missing.length
          ? `Not reconciled to ${to.toISOString().slice(0, 10)}: ${missing.join(', ')}`
          : '',
        go: 'recon',
      };
    }

    const arCtl = this.ledger.bal(
      await this.ledger.totals(rootId, null, null, new Date()),
      maps.byKey.get('ar')!,
    );
    const arSub = r2(
      (await this.ar.items(rootId)).reduce((s, i) => s + i.balanceBase, 0),
    );
    out['CL-02'] = {
      exception: r2(arCtl - arSub)
        ? `Control 1200 ${fmt(arCtl)} differs from subledger ${fmt(arSub)} by ${fmt(r2(arCtl - arSub))}`
        : '',
      go: 'ar',
    };

    const apCtl = this.ledger.bal(
      await this.ledger.totals(rootId, null, null, new Date()),
      maps.byKey.get('ap')!,
    );
    const apSub = r2(
      (await this.ap.openItems(rootId)).reduce((s, i) => s + i.openBase, 0),
    );
    out['CL-03'] = {
      exception: r2(apCtl - apSub)
        ? `Control 2100 ${fmt(apCtl)} differs from subledger ${fmt(apSub)} by ${fmt(r2(apCtl - apSub))}`
        : '',
      go: 'ap',
    };

    const unposted = await this.prisma.finBill.count({
      where: {
        businessId: rootId,
        billDate: { lte: to },
        status: { in: ['Draft', 'Review Required', 'Approved'] },
      },
    });
    out['CL-04'] = {
      exception: unposted
        ? `${unposted} bill${unposted === 1 ? '' : 's'} dated on or before month end not posted`
        : '',
      go: 'bills',
    };

    const js = await this.prisma.finJournal.findMany({
      where: {
        businessId: rootId,
        sourceType: null,
        date: { gte: from, lte: to },
        status: {
          in: [
            'Draft',
            'Pending Review',
            'Approval Required',
            'Ready to Post',
            'Failed',
          ],
        },
      },
      select: { number: true, status: true },
    });
    out['CL-05'] = {
      exception: js.length
        ? js
            .slice(0, 4)
            .map((j) => `${j.number} ${j.status.toLowerCase()}`)
            .join(' · ') + (js.length > 4 ? ` · +${js.length - 4} more` : '')
        : '',
      go: 'journals',
    };
    out['CL-06'] = { exception: null, go: 'coa' };

    const pv = await this.assets.preview(rootId, year, month);
    out['CL-07'] = pv.run
      ? { exception: '', go: 'fa' }
      : pv.rows.length
        ? {
            exception: `${monthLabel(year, month)} depreciation (${fmt(pv.total)}) not posted`,
            go: 'fa',
          }
        : { exception: '', na: 'No assets due for depreciation', go: 'fa' };

    // Cut-off: real items around month end.
    out['CL-08'] = { exception: null, go: 'cutoff' };
    out['CL-09'] = { exception: null, go: 'cutoff' };
    out['CL-10'] = { exception: null, go: 'cutoff' };

    const rets = (await this.tax.list(rootId)).filter(
      (r) => r.ret.periodStart.getTime() === from.getTime(),
    );
    if (!rets.length)
      out['CL-11'] = {
        exception: '',
        na: 'No tax return for this period',
        go: 'taxes',
      };
    else {
      const open = rets.filter((r) => !['Locked', 'Filed'].includes(r.status));
      out['CL-11'] = {
        exception: open.length
          ? `${open.length} return${open.length === 1 ? '' : 's'} not approved and locked`
          : '',
        go: 'taxes',
      };
    }

    const susp = this.ledger.bal(
      await this.ledger.totals(rootId, null, null, to),
      maps.byKey.get('suspense')!,
    );
    out['CL-12'] = {
      exception: susp ? `Suspense 1999 holds ${fmt(susp)} at month end` : '',
      go: 'journals',
    };

    if (branches.length <= 1)
      out['CL-13'] = {
        exception: '',
        na: 'Single business — no branches in scope',
        go: '',
      };
    else {
      const transit = this.ledger.bal(
        await this.ledger.totals(rootId, null, null, to),
        maps.byKey.get('inventory_transit')!,
      );
      out['CL-13'] = {
        exception: transit
          ? `Inventory in transit between branches ${fmt(transit)} — transfers not received`
          : '',
        go: 'gl',
      };
    }

    const fxPv = await this.fx.preview(rootId, year, month);
    const needs = fxPv.rows.filter((r) => r.diff || r.rate == null);
    out['CL-14'] = !fxPv.rows.length
      ? { exception: '', na: 'No foreign-currency balances', go: 'gl' }
      : {
          exception: needs.length
            ? fxPv.missing.length
              ? `Closing rate missing for ${[...new Set(fxPv.missing)].join(', ')}`
              : `${needs.length} balance${needs.length === 1 ? '' : 's'} not revalued to the closing rate`
            : '',
          go: 'gl',
        };
    out['CL-15'] = { exception: null, go: 'statements' };
    return out;
  }

  async view(rootId: string, year: number, month: number) {
    const r = await this.run(rootId, year, month);
    const checks = await this.checks(rootId, year, month);
    const tasks: CloseTaskView[] = (r?.tasks ?? []).map((t) => {
      const c = checks[t.key];
      const na = c?.na ?? null;
      let status = t.status;
      if (na && status !== 'Done') status = 'N/A';
      else if (status !== 'Done' && c?.exception) status = 'Blocked';
      return {
        task: t,
        status,
        exception: c?.exception ?? '',
        na,
        go: c?.go ?? '',
      };
    });
    return { run: r, tasks, checks };
  }

  /** Real cut-off items: activity either side of month end that the period may be missing. */
  async cutoff(rootId: string, year: number, month: number) {
    const to = monthEnd(year, month);
    const ids = (await this.ctx.branches(rootId)).map((b) => b.id);
    const maps = await this.ctx.accountMaps(rootId);
    const out: { ref: string; d: string; m: string }[] = [];
    const grni = this.ledger.bal(
      await this.ledger.totals(rootId, null, null, to),
      maps.byKey.get('grni')!,
    );
    if (grni)
      out.push({
        ref: '2150 GRNI',
        d: `${grni.toFixed(2)} of goods received with no supplier bill posted`,
        m: 'Inventory / Bills',
      });
    const pending = await this.prisma.order.findMany({
      where: {
        businessId: { in: ids },
        isQuotation: false,
        status: { in: ['confirmed', 'in_progress'] },
        createdAt: { lte: new Date(to.getTime() + 86_399_999) },
      },
      select: { orderNo: true, total: true, createdAt: true },
      take: 5,
      orderBy: { createdAt: 'desc' },
    });
    for (const o of pending)
      out.push({
        ref: `Order #${o.orderNo}`,
        d: `Placed ${o.createdAt.toISOString().slice(0, 10)} · ${num(o.total).toFixed(2)} — not completed, so no revenue posted`,
        m: 'Orders',
      });
    const pos = await this.prisma.purchaseOrder.findMany({
      where: {
        businessId: { in: ids },
        status: { in: ['sent', 'confirmed', 'partially_received'] },
        createdAt: { lte: new Date(to.getTime() + 86_399_999) },
      },
      select: { id: true, status: true },
      take: 5,
    });
    for (const p of pos)
      out.push({
        ref: `PO-${p.id.slice(0, 6).toUpperCase()}`,
        d: `Purchase order ${p.status.replace('_', ' ')} — goods not fully received`,
        m: 'Inventory › Purchases',
      });
    const pendingDeposits = await this.prisma.deposit.count({
      where: { businessId: { in: ids }, status: 'pending' },
    });
    if (pendingDeposits)
      out.push({
        ref: 'Deposits',
        d: `${pendingDeposits} booking deposit${pendingDeposits === 1 ? '' : 's'} still pending capture`,
        m: 'Bookings',
      });
    return out;
  }

  async mustTask(rootId: string, id: string) {
    const t = await this.prisma.finCloseTask.findFirst({
      where: { id, businessId: rootId },
      include: { run: true },
    });
    if (!t)
      throw new AppException(
        FIN_ERRORS.NOT_FOUND,
        'Close task not found',
        HttpStatus.NOT_FOUND,
      );
    return t;
  }

  async complete(actor: FinActor, id: string, note?: string) {
    this.ctx.need(actor, 'manage', 'Completing a close task');
    const t = await this.mustTask(actor.rootId, id);
    if (t.run.status === 'Hard Closed')
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        'This period is closed.',
        HttpStatus.CONFLICT,
      );
    const c = (await this.checks(actor.rootId, t.run.year, t.run.month))[t.key];
    if (c?.exception)
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        `Resolve the exception first: ${c.exception}`,
        HttpStatus.CONFLICT,
      );
    const cfg = await this.ctx.config(actor.rootId);
    const ev = (Array.isArray(t.attachments) ? t.attachments : []) as unknown[];
    if (cfg.close.reqEvidence && !ev.length && !note?.trim() && !c?.na)
      throw new AppException(
        FIN_ERRORS.INVALID,
        'Evidence is required: attach a file or write what was checked.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    await this.prisma.finCloseTask.update({
      where: { id },
      data: {
        status: 'Done',
        completedById: actor.userId,
        completedAt: new Date(),
        notes: note?.trim() ? note.trim().slice(0, 2000) : t.notes,
      },
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'close.task_done',
      'close',
      id,
      `${t.key} ${t.title}${note ? ` — ${note}` : ''}`,
    );
  }

  async reopenTask(actor: FinActor, id: string) {
    this.ctx.need(actor, 'manage', 'Reopening a close task');
    const t = await this.mustTask(actor.rootId, id);
    if (t.run.status === 'Hard Closed')
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        'This period is closed.',
        HttpStatus.CONFLICT,
      );
    await this.prisma.finCloseTask.update({
      where: { id },
      data: { status: 'Open', completedById: null, completedAt: null },
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'close.task_reopened',
      'close',
      id,
      t.title,
    );
  }

  async assign(actor: FinActor, id: string, ownerUserId: string) {
    this.ctx.need(actor, 'manage', 'Assigning a close task');
    await this.mustTask(actor.rootId, id);
    await this.prisma.finCloseTask.update({
      where: { id },
      data: { ownerUserId },
    });
  }

  async attach(
    actor: FinActor,
    id: string,
    file: { key: string; name: string; size: number; type: string },
  ) {
    const t = await this.mustTask(actor.rootId, id);
    const list = Array.isArray(t.attachments) ? t.attachments : [];
    await this.prisma.finCloseTask.update({
      where: { id },
      data: {
        attachments: [
          ...list,
          { ...file, by: actor.name, at: new Date().toISOString() },
        ],
      },
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'close.evidence_attached',
      'close',
      id,
      file.name,
    );
  }

  /** Final approval: every control done or not applicable; then lock the period. */
  async finalApprove(actor: FinActor, runId: string) {
    this.ctx.need(actor, 'admin', 'Final close approval');
    const r = await this.prisma.finCloseRun.findFirst({
      where: { id: runId, businessId: actor.rootId },
    });
    if (!r)
      throw new AppException(
        FIN_ERRORS.NOT_FOUND,
        'Close not found',
        HttpStatus.NOT_FOUND,
      );
    if (r.status === 'Hard Closed')
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        'Already closed.',
        HttpStatus.CONFLICT,
      );
    const cfg = await this.ctx.config(actor.rootId);
    if (cfg.sod.sod4 && r.startedById === actor.userId)
      throw new AppException(
        FIN_ERRORS.SOD,
        'Segregation of duties: the person who prepared the close can’t give final approval.',
        HttpStatus.FORBIDDEN,
      );
    const v = await this.view(actor.rootId, r.year, r.month);
    const open = v.tasks.filter(
      (t) => t.status !== 'Done' && t.status !== 'N/A',
    );
    if (open.length)
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        `${open.length} control${open.length === 1 ? '' : 's'} still open: ${open
          .slice(0, 3)
          .map((t) => t.task.title)
          .join(', ')}`,
        HttpStatus.CONFLICT,
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.finCloseRun.update({
        where: { id: runId },
        data: {
          status: cfg.close.lockAfter ? 'Hard Closed' : 'Pending Approval',
          approvedById: actor.userId,
          approvedAt: new Date(),
        },
      });
      if (cfg.close.lockAfter) {
        await this.ctx.period(actor.rootId, r.year, r.month, tx);
        await tx.finPeriod.update({
          where: {
            businessId_year_month: {
              businessId: actor.rootId,
              year: r.year,
              month: r.month,
            },
          },
          data: {
            status: 'locked',
            lockedById: actor.userId,
            lockedAt: new Date(),
          },
        });
      }
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'close.final_approved',
      'close',
      runId,
      `${monthLabel(r.year, r.month)} ${cfg.close.lockAfter ? 'approved and locked' : 'approved'}`,
    );
  }

  async lockPeriod(actor: FinActor, year: number, month: number) {
    this.ctx.need(actor, 'admin', 'Locking a period');
    await this.ctx.period(actor.rootId, year, month);
    await this.prisma.finPeriod.update({
      where: {
        businessId_year_month: { businessId: actor.rootId, year, month },
      },
      data: {
        status: 'locked',
        lockedById: actor.userId,
        lockedAt: new Date(),
      },
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'period.locked',
      'period',
      `${year}-${month}`,
      monthLabel(year, month),
    );
  }

  /** Reopen: Owner/Controller does it directly; anyone else raises a request. */
  async reopen(actor: FinActor, year: number, month: number, reason: string) {
    if (!reason?.trim())
      throw new AppException(
        FIN_ERRORS.INVALID,
        'A reason is required to reopen a period.',
        HttpStatus.BAD_REQUEST,
      );
    const p = await this.ctx.period(actor.rootId, year, month);
    if (p.status !== 'locked')
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        `${monthLabel(year, month)} isn’t locked.`,
        HttpStatus.CONFLICT,
      );
    if (!actor.admin) {
      this.ctx.need(actor, 'manage', 'Requesting a reopen');
      await this.journals.requestApproval(actor.rootId, actor, {
        subjectType: 'period',
        subjectId: p.id,
        title: `Reopen ${monthLabel(year, month)}`,
        amount: null,
        rule: 'Period reopen — Controller / Owner',
        level: 'admin',
        payload: { reason },
      });
      await this.ctx.audit(
        actor.rootId,
        actor,
        'period.reopen_requested',
        'period',
        p.id,
        reason,
      );
      return { requested: true };
    }
    await this.applyReopen(actor, p.id, reason);
    return { requested: false };
  }

  async applyReopen(actor: FinActor, periodId: string, reason: string) {
    const p = await this.prisma.finPeriod.findFirst({
      where: { id: periodId, businessId: actor.rootId },
    });
    if (!p)
      throw new AppException(
        FIN_ERRORS.NOT_FOUND,
        'Period not found',
        HttpStatus.NOT_FOUND,
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.finPeriod.update({
        where: { id: p.id },
        data: {
          status: 'open',
          lockedById: null,
          lockedAt: null,
          note: `Reopened: ${reason}`.slice(0, 500),
        },
      });
      await tx.finCloseRun.updateMany({
        where: { businessId: actor.rootId, year: p.year, month: p.month },
        data: { status: 'Reopened', reopenReason: reason.slice(0, 500) },
      });
      await this.journals.decide(
        actor.rootId,
        'period',
        p.id,
        'Approved',
        actor,
        reason,
        tx,
      );
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'period.reopened',
      'period',
      p.id,
      `${monthLabel(p.year, p.month)} — ${reason}`,
    );
  }

  /** Soft close: once a month is more than N days over, it is soft-closed (only Owner/Controller posts manually). */
  async softCloseSweep(rootId: string) {
    const cfg = await this.ctx.config(rootId);
    if (!cfg.posting.softClose) return;
    const today = dayOf(new Date());
    const open = await this.prisma.finPeriod.findMany({
      where: { businessId: rootId, status: 'open' },
    });
    for (const p of open) {
      const end = monthEnd(p.year, p.month);
      if (
        today.getTime() - end.getTime() >
        cfg.posting.softCloseDays * 86_400_000
      )
        await this.prisma.finPeriod.update({
          where: { id: p.id },
          data: { status: 'soft' },
        });
    }
  }

  static closeDue(
    cfg: { close: { closeDay: string } },
    year: number,
    month: number,
  ) {
    return addBusinessDays(
      monthEnd(year, month),
      CLOSE_DAYS[cfg.close.closeDay] ?? 5,
    );
  }
}

export type CloseRunWithTasks = FinCloseRun & { tasks: FinCloseTask[] };
