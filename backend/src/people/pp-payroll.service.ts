import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma, StaffAdvanceStatus } from '@prisma/client';
import ExcelJS from 'exceljs';
import { FinanceSourcesService } from '../finance/finance-sources.service';
import { dayKey } from '../field-service/fs-time';
import {
  PpActor,
  PpContextService,
  notFound,
  num,
  ppErr,
} from './pp-context.service';
import { PpBridgeService } from './pp-bridge.service';
import {
  Calc,
  Data,
  Inp,
  PpDataService,
  PpScope,
  RunExc,
  RuleVer,
  Snapshot,
  addDays,
  monthBounds,
  periodLabel,
} from './pp-data.service';
import {
  PP_ERRORS,
  RULE_TYPES,
  RUN_T,
  TAX_TREATMENTS,
  TaxTable,
} from './pp.constants';

type Run = Prisma.PpRunGetPayload<{ include: { lines: true } }>;
type Snap = Snapshot & { table: TaxTable | null };
const r2 = (n: number) => Math.round(n * 100) / 100;
const nowIso = () => new Date().toISOString();
const esc = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!,
  );

export const scope0 = (tab = 'payroll'): PpScope => ({
  tab,
  branch: '',
  dept: '',
  f: {},
  page: {},
  view: {},
  run: '',
});

/**
 * Payroll runs (pp-core.js RUN_T): lock inputs into a hashed snapshot → calculate → exceptions →
 * approval with separation of duties → finalize (payslips, advances recovered, commissions settled)
 * → Finance posting (the ledger's payroll source) → bank transfer file → bank confirmation recorded
 * per employee. Finalized runs are immutable; corrections are separate runs that pay the difference.
 */
@Injectable()
export class PpPayrollService {
  private readonly log = new Logger(PpPayrollService.name);

  constructor(
    private readonly ctx: PpContextService,
    private readonly X: PpDataService,
    private readonly bridge: PpBridgeService,
    private readonly finance: FinanceSourcesService,
  ) {}

  private get db() {
    return this.ctx.db;
  }

  async run(a: PpActor, id: string): Promise<Run> {
    const r = await this.db.ppRun.findFirst({
      where: { businessId: a.rootId, OR: [{ id }, { number: id }] },
      include: { lines: true },
    });
    if (!r) throw notFound('Payroll run');
    return r;
  }

  private histAdd(
    r: { history: Prisma.JsonValue },
    t: string,
    by: string,
    extra: Record<string, unknown> = {},
  ) {
    return [
      ...((r.history as unknown as object[]) ?? []),
      { t, by, at: nowIso(), ...extra },
    ] as Prisma.InputJsonValue;
  }

  private move(r: Run, to: string) {
    if (!(RUN_T[r.status] ?? []).includes(to))
      throw ppErr(
        PP_ERRORS.STATUS,
        `INVALID_STATUS_TRANSITION — ${r.status} → ${to}.`,
      );
  }

  async start(a: PpActor, period?: string) {
    this.ctx.need(a, 'payroll', 'Starting payroll');
    const biz = await this.ctx.business(a.rootId);
    const ym =
      period && /^\d{4}-\d{2}$/.test(period)
        ? period
        : dayKey(new Date(), biz.timezone || 'UTC').slice(0, 7);
    const open = await this.db.ppRun.findFirst({
      where: {
        businessId: a.rootId,
        period: ym,
        correctionOf: null,
        status: { not: 'Cancelled' },
      },
    });
    if (open) return { id: open.id, number: open.number, existing: true };
    const d = await this.X.load(a, scope0());
    const number = `PR-${ym}`;
    const taken = await this.db.ppRun.count({
      where: { businessId: a.rootId, number: { startsWith: number } },
    });
    const r = await this.db.ppRun.create({
      data: {
        businessId: a.rootId,
        number: taken ? `${number}-R${taken}` : number,
        period: ym,
        payDate: new Date(`${this.X.payDate(d, ym)}T00:00:00Z`),
        status: 'Draft',
        preparedById: a.userId,
        exceptions: [],
        excluded: [],
        history: [{ t: 'Run created', by: a.name, at: nowIso() }],
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Payroll run created',
      'run',
      r.id,
      `${r.number} · ${periodLabel(ym)}`,
    );
    return { id: r.id, number: r.number, existing: false };
  }

  async correction(a: PpActor, srcId: string, uids: string[]) {
    this.ctx.need(a, 'payroll', 'Creating correction runs');
    const src = await this.run(a, srcId);
    if (!src.finalizedAt)
      throw ppErr(
        PP_ERRORS.STATUS,
        `${src.number} isn’t finalized — fix it in place instead.`,
      );
    if (!uids.length)
      throw ppErr(PP_ERRORS.INVALID, 'Pick at least one employee to correct.');
    const n = await this.db.ppRun.count({ where: { correctionOf: src.id } });
    const r = await this.db.ppRun.create({
      data: {
        businessId: a.rootId,
        number: `${src.number}-C${n + 1}`.slice(0, 30),
        period: src.period,
        payDate: src.payDate,
        status: 'Draft',
        correctionOf: src.id,
        preparedById: a.userId,
        exceptions: [],
        excluded: [],
        snapshot: { only: uids },
        history: [
          {
            t: `Correction run for ${src.number} — the original stays immutable`,
            by: a.name,
            at: nowIso(),
          },
        ],
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Correction run created',
      'run',
      r.id,
      `${r.number} · ${uids.length} employee(s)`,
    );
    return { id: r.id, number: r.number };
  }

  private only(r: Run): string[] | undefined {
    const s = r.snapshot as unknown as { only?: string[] } | null;
    return r.correctionOf ? (s?.only ?? []) : undefined;
  }

  /** Previous finalized lines for the same period (correction runs pay only the difference). */
  private async prior(r: Run) {
    if (!r.correctionOf) return new Map<string, Calc[]>();
    const runs = await this.db.ppRun.findMany({
      where: {
        businessId: r.businessId,
        period: r.period,
        finalizedAt: { not: null },
        id: { not: r.id },
      },
      include: { lines: true },
    });
    const m = new Map<string, Calc[]>();
    for (const x of runs)
      for (const l of x.lines)
        m.set(l.userId, [
          ...(m.get(l.userId) ?? []),
          l.calc as unknown as Calc,
        ]);
    return m;
  }

  async act(
    a: PpActor,
    id: string,
    act: string,
    body: {
      override?: string;
      reason?: string;
      typed?: string;
      results?: { uid: string; status: string; ref?: string }[];
    } = {},
  ) {
    const r = await this.run(a, id);
    const cfg = await this.ctx.config(a.rootId);
    const save = async (
      to: string,
      t: string,
      extra: Prisma.PpRunUncheckedUpdateInput = {},
      hx: Record<string, unknown> = {},
    ) => {
      await this.db.$transaction(async (tx) => {
        await tx.ppRun.update({
          where: { id: r.id },
          data: {
            status: to,
            version: { increment: 1 },
            history: this.histAdd(r, t, a.name, hx),
            ...extra,
          },
        });
        await this.ctx.audit(
          a.rootId,
          a,
          `Payroll ${to.toLowerCase()}`.slice(0, 80),
          'run',
          r.id,
          `${r.number} · ${t}`,
          { tx },
        );
      });
      return { status: to };
    };
    switch (act) {
      case 'lock': {
        this.ctx.need(a, 'payroll', 'Locking payroll inputs');
        this.move(r, 'Inputs Locked');
        const d = await this.X.load(a, scope0());
        const snap: Snap = {
          ...(await this.X.snapshot(d, r.period, this.only(r))),
          table: this.X.taxTable(d),
        };
        if (!snap.emps.length)
          throw ppErr(
            PP_ERRORS.INVALID,
            'Nobody is in payroll for this period — give staff a payroll profile with “In payroll” on.',
          );
        const blk = (await this.X.readiness(d, r.period)).filter(
          (x) => x.st === 'Blocking',
        );
        if (blk.length && a.owner && body.override === undefined)
          throw ppErr(
            PP_ERRORS.BLOCKING,
            `PAYROLL_BLOCKING_EXCEPTION — ${blk.map((x) => x.t).join(', ')}. Give an override reason to lock anyway (audited); blocked employees stay flagged.`,
          );
        return save(
          'Inputs Locked',
          `Inputs locked · snapshot ${snap.hash} · ${snap.engine} · ${snap.tax}${blk.length ? ` · ${blk.length} blocking input(s) flagged` : ''}${body.override ? ` · OVERRIDE: ${body.override}` : ''}`,
          {
            snapshot: {
              ...snap,
              only: this.only(r),
            } as unknown as Prisma.InputJsonValue,
            preparedById: a.userId,
          },
        );
      }
      case 'calc':
      case 'recalc': {
        this.ctx.need(a, 'payroll', 'Calculating payroll');
        if (
          act === 'calc' &&
          !['Inputs Locked', 'Exceptions'].includes(r.status)
        )
          throw ppErr(
            PP_ERRORS.STATUS,
            r.status === 'Draft'
              ? 'Lock inputs first.'
              : `INVALID_STATUS_TRANSITION — ${r.status} can’t be calculated.`,
          );
        if (
          act === 'recalc' &&
          ![
            'Calculated',
            'Exceptions',
            'Approval Required',
            'Approved',
          ].includes(r.status)
        )
          throw ppErr(
            PP_ERRORS.STATUS,
            `INVALID_STATUS_TRANSITION — ${r.status} can’t be recalculated.`,
          );
        return this.calculate(
          a,
          r,
          act === 'recalc' || r.status === 'Exceptions',
          cfg.payroll.overtimeWarnHours,
          cfg.payroll.advanceWarnAmount,
        );
      }
      case 'submit': {
        this.ctx.need(a, 'payroll', 'Submitting payroll');
        this.move(r, 'Approval Required');
        if (this.blocking(r).length)
          throw ppErr(
            PP_ERRORS.BLOCKING,
            'PAYROLL_BLOCKING_EXCEPTION — resolve or exclude blocked employees first.',
          );
        const res = await save(
          'Approval Required',
          `Submitted for approval by ${a.name}`,
        );
        await this.ctx.notify(
          a.rootId,
          await this.ctx.ownerIds(a.rootId),
          `Payroll awaiting approval: ${r.number}`,
          `${periodLabel(r.period)} · prepared by ${a.name}`,
          '/people/payroll/runs',
          a.userId,
        );
        return res;
      }
      case 'approve': {
        this.ctx.need(a, 'payApprove', 'Approving payroll');
        this.move(r, 'Approved');
        const own =
          cfg.payroll.separationOfDuties && r.preparedById === a.userId;
        if (own && !a.owner)
          throw ppErr(
            PP_ERRORS.SOD,
            `SEPARATION_OF_DUTIES — you prepared ${r.number}, so someone else must approve it.`,
          );
        if (own && !(body.override ?? '').trim())
          throw ppErr(
            PP_ERRORS.SOD,
            'SEPARATION_OF_DUTIES — you prepared this run. Give an Owner override reason to approve it yourself (audited).',
          );
        return save(
          'Approved',
          `Approved by ${a.name}${own ? ` · OWNER OVERRIDE: ${body.override}` : ''} · approved ≠ paid`,
          { approvedById: a.userId },
        );
      }
      case 'reject':
        this.ctx.need(a, 'payApprove', 'Rejecting payroll');
        this.move(r, 'Calculated');
        if (!(body.reason ?? '').trim())
          throw ppErr(PP_ERRORS.INVALID, 'Say what needs to change.');
        return save('Calculated', `Rejected by ${a.name}: ${body.reason}`, {
          approvedById: null,
        });
      case 'finalize':
        return this.finalize(
          a,
          r,
          body.typed ?? '',
          cfg.payroll.separationOfDuties,
        );
      case 'post': {
        this.ctx.need(a, 'payroll', 'Requesting finance posting');
        this.move(r, 'Finance Posting Pending');
        await save('Finance Posting Pending', 'Finance posting requested');
        return this.postCheck(a, r.id);
      }
      case 'postcheck':
        this.ctx.need(a, 'payroll', 'Checking finance posting');
        if (r.status !== 'Finance Posting Pending')
          throw ppErr(PP_ERRORS.STATUS, `${r.number} is ${r.status}.`);
        return this.postCheck(a, r.id);
      case 'payout':
        return this.payout(a, r, false);
      case 'retry':
        return this.payout(a, r, true);
      case 'paycheck':
        return this.record(a, r, body.results ?? []);
      case 'rollback': {
        this.ctx.need(a, 'payroll', 'Rolling back payroll');
        if (!['Inputs Locked', 'Calculated', 'Exceptions'].includes(r.status))
          throw ppErr(
            PP_ERRORS.STATUS,
            `Only unapproved runs can be rolled back — ${r.number} is ${r.status}.`,
          );
        await this.db.ppRunLine.deleteMany({ where: { runId: r.id } });
        return save('Draft', 'Rolled back to draft — calculations cleared', {
          snapshot: r.correctionOf ? { only: this.only(r) } : Prisma.JsonNull,
          exceptions: [],
          excluded: [],
          approvedById: null,
        });
      }
      case 'cancel':
        this.ctx.need(a, 'payroll', 'Cancelling payroll');
        this.move(r, 'Cancelled');
        if (!(body.reason ?? '').trim())
          throw ppErr(PP_ERRORS.INVALID, 'Reason required.');
        return save('Cancelled', `Cancelled: ${body.reason}`);
      default:
        throw ppErr(PP_ERRORS.INVALID, 'Unknown payroll step.');
    }
  }

  private blocking(r: Run) {
    return ((r.exceptions as unknown as RunExc[]) ?? []).filter(
      (x) => x.sev === 'Blocking' && !x.ok,
    );
  }

  private async calculate(
    a: PpActor,
    r: Run,
    fresh: boolean,
    otWarn: number,
    advWarn: number | null,
  ) {
    const d = await this.X.load(a, scope0());
    let snap = r.snapshot as unknown as Snap | null;
    if (fresh || !snap?.emps)
      snap = {
        ...(await this.X.snapshot(d, r.period, this.only(r))),
        table: this.X.taxTable(d),
      };
    const excl = (r.excluded as unknown as string[]) ?? [];
    const prev = await this.prior(r);
    const oldExc = (r.exceptions as unknown as RunExc[]) ?? [];
    const exc: RunExc[] = [];
    const lines: { uid: string; c: Calc }[] = [];
    for (const e of snap.emps.filter((x) => !excl.includes(x.uid))) {
      let c = this.X.calc(d, e.inp, snap.table);
      const p = prev.get(e.uid);
      if (p?.length) c = this.diff(c, p);
      lines.push({ uid: e.uid, c });
      const i: Inp = e.inp;
      const add = (key: string, msg: string, sev: 'Blocking' | 'Warning') =>
        exc.push({
          uid: e.uid,
          key,
          msg,
          sev,
          ok:
            sev === 'Warning' &&
            oldExc.some((o) => o.uid === e.uid && o.key === key && o.ok),
        });
      if (i.basis == null || (i.basis !== 'Commission only' && !i.rate))
        add('rate', 'No pay basis or rate on the payroll profile', 'Blocking');
      if (i.tsNeeded && !i.tsOk)
        add(
          'ts',
          'Timesheet not approved in Staff — hours unverified',
          'Blocking',
        );
      if (i.taxp !== 'Exempt' && !i.taxp)
        add(
          'tax',
          'Missing tax profile — withholding cannot be calculated',
          'Blocking',
        );
      if (i.taxp !== 'Exempt' && i.taxp && !snap.table)
        add(
          'table',
          'No tax table configured — withholding cannot be calculated',
          'Blocking',
        );
      if (!i.bank)
        add('bank', 'No payout/bank setup — payout will fail', 'Blocking');
      if (i.ot > otWarn)
        add(
          'ot',
          `${i.ot} overtime hours (above ${otWarn} h policy)`,
          'Warning',
        );
      const advSum = c.adv;
      if (advWarn && advSum > advWarn)
        add(
          'adv',
          `Advance recovery ${d.fmt.money(advSum)} (above warning level)`,
          'Warning',
        );
      if (c.net != null && c.net < 0)
        add('neg', 'Net pay is negative', 'Blocking');
      if (i.commPaidOutside)
        add(
          'comm',
          'Commission already marked paid in Staff — not paid again',
          'Warning',
        );
    }
    const blk = exc.some((x) => x.sev === 'Blocking' && !x.ok);
    const to = blk ? 'Exceptions' : 'Calculated';
    await this.db.$transaction(async (tx) => {
      await tx.ppRunLine.deleteMany({ where: { runId: r.id } });
      for (const l of lines)
        await tx.ppRunLine.create({
          data: {
            runId: r.id,
            userId: l.uid,
            calc: l.c as unknown as Prisma.InputJsonValue,
            gross: l.c.gross,
            net: l.c.net,
            tax: l.c.tax,
            employer: l.c.er,
          },
        });
      await tx.ppRun.update({
        where: { id: r.id },
        data: {
          status: to,
          snapshot: {
            ...snap,
            only: this.only(r),
          } as unknown as Prisma.InputJsonValue,
          exceptions: exc as unknown as Prisma.InputJsonValue,
          approvedById: null,
          version: { increment: 1 },
          history: this.histAdd(
            r,
            `${fresh ? `Recalculated (controlled) · new snapshot ${snap.hash}` : 'Calculated'} · ${lines.length} employees · ${exc.filter((x) => !x.ok).length} open exceptions`,
            a.name,
          ),
        },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        fresh ? 'Payroll recalculated' : 'Payroll calculated',
        'run',
        r.id,
        `${r.number} · ${lines.length} employees · ${to}`,
        { tx },
      );
    });
    return {
      status: to,
      employees: lines.length,
      open: exc.filter((x) => !x.ok).length,
    };
  }

  /** Correction lines pay only what changed against the finalized lines already paid. */
  private diff(c: Calc, prev: Calc[]): Calc {
    const s = (k: keyof Calc) =>
      r2(prev.reduce((a, p) => a + (Number(p[k]) || 0), 0));
    const out = { ...c };
    for (const k of [
      'regular',
      'leaveImp',
      'ot',
      'comm',
      'bonus',
      'allow',
      'gross',
      'pre',
      'pf',
      'post',
      'er',
      'cost',
    ] as const)
      (out as Record<string, unknown>)[k] = r2(c[k] - s(k));
    out.tax = c.tax == null ? null : r2(c.tax - s('tax'));
    out.net =
      out.tax == null
        ? null
        : r2(out.gross - out.pre - out.tax - out.post - out.adv);
    out.f = {
      ...c.f,
      regular: `${c.f.regular} − already paid`,
      tax: `${c.f.tax} − already withheld`,
    };
    return out;
  }

  async exception(
    a: PpActor,
    id: string,
    idx: number,
    how: 'exclude' | 'accept',
  ) {
    this.ctx.need(a, 'payroll', 'Resolving payroll exceptions');
    const r = await this.run(a, id);
    if (!['Exceptions', 'Calculated', 'Inputs Locked'].includes(r.status))
      throw ppErr(PP_ERRORS.STATUS, `${r.number} is ${r.status}.`);
    const exc = [...((r.exceptions as unknown as RunExc[]) ?? [])];
    const x = exc[idx];
    if (!x) throw notFound('Exception');
    if (how === 'accept') {
      if (x.sev !== 'Warning')
        throw ppErr(
          PP_ERRORS.INVALID,
          'Blocking exceptions can’t be accepted — fix the input or exclude the employee.',
        );
      exc[idx] = { ...x, ok: true };
      await this.db.ppRun.update({
        where: { id: r.id },
        data: {
          exceptions: exc as unknown as Prisma.InputJsonValue,
          history: this.histAdd(r, `Warning accepted: ${x.msg}`, a.name),
          version: { increment: 1 },
        },
      });
    } else {
      const excl = [
        ...new Set([...((r.excluded as unknown as string[]) ?? []), x.uid]),
      ];
      const next = exc.map((e) =>
        e.uid === x.uid
          ? {
              ...e,
              ok: true,
              msg: e.msg.includes('excluded')
                ? e.msg
                : `${e.msg} · excluded from this run`,
            }
          : e,
      );
      const blk = next.some((e) => e.sev === 'Blocking' && !e.ok);
      await this.db.$transaction(async (tx) => {
        await tx.ppRunLine.deleteMany({
          where: { runId: r.id, userId: x.uid },
        });
        await tx.ppRun.update({
          where: { id: r.id },
          data: {
            excluded: excl,
            exceptions: next as unknown as Prisma.InputJsonValue,
            status: r.status === 'Exceptions' && !blk ? 'Calculated' : r.status,
            history: this.histAdd(
              r,
              `Excluded ${x.uid.slice(0, 8)} (${x.msg}) — pay them in a correction run once fixed`,
              a.name,
            ),
            version: { increment: 1 },
          },
        });
      });
    }
    await this.ctx.audit(
      a.rootId,
      a,
      how === 'accept'
        ? 'Payroll warning accepted'
        : 'Employee excluded from run',
      'run',
      r.id,
      `${r.number} · ${x.msg}`,
    );
    return { ok: true };
  }

  private async finalize(a: PpActor, r: Run, typed: string, sod: boolean) {
    this.ctx.need(a, 'payApprove', 'Finalizing payroll');
    this.move(r, 'Finalized');
    const want = `FINALIZE ${periodLabel(r.period).toUpperCase()}`;
    if (typed.trim() !== want)
      throw ppErr(PP_ERRORS.INVALID, `Type exactly: ${want}`);
    if (sod && r.preparedById === a.userId && !a.owner)
      throw ppErr(
        PP_ERRORS.SOD,
        'SEPARATION_OF_DUTIES — the preparer can’t finalize their own run.',
      );
    if (!r.lines.length) throw ppErr(PP_ERRORS.INVALID, 'Nothing calculated.');
    if (r.lines.some((l) => l.net == null))
      throw ppErr(
        PP_ERRORS.BLOCKING,
        'PAYROLL_BLOCKING_EXCEPTION — some employees have no net pay (tax couldn’t be calculated).',
      );
    return this.ctx.once(
      a.rootId,
      `finalize_${r.id}_v${r.version}`,
      async () => {
        const members = await this.ctx.members(a.rootId, true);
        await this.db.$transaction(async (tx) => {
          let advN = 0;
          for (const l of r.lines) {
            const c = l.calc as unknown as Calc;
            if (c.advIds?.length)
              advN += (
                await tx.staffAdvance.updateMany({
                  where: {
                    id: { in: c.advIds },
                    status: StaffAdvanceStatus.outstanding,
                  },
                  data: {
                    status: StaffAdvanceStatus.deducted,
                    deductedInMonth: r.period,
                  },
                })
              ).count;
            if (c.comm > 0) {
              const m = members.find((x) => x.id === l.userId);
              for (const bu of m?.buIds ?? []) {
                const b = await tx.businessUser.findUnique({
                  where: { id: bu },
                  select: { businessId: true },
                });
                if (b)
                  await tx.commissionPayment.upsert({
                    where: {
                      businessId_staffUserId_month: {
                        businessId: b.businessId,
                        staffUserId: bu,
                        month: r.period,
                      },
                    },
                    create: {
                      businessId: b.businessId,
                      staffUserId: bu,
                      month: r.period,
                      paidByUserId: a.userId,
                    },
                    update: {},
                  });
              }
            }
          }
          await tx.ppRunLine.updateMany({
            where: { runId: r.id },
            data: { slipStatus: 'Generated' },
          });
          await tx.ppRun.update({
            where: { id: r.id },
            data: {
              status: 'Finalized',
              finalizedAt: new Date(),
              version: { increment: 1 },
              history: this.histAdd(
                r,
                `Finalized — ${r.lines.length} payslips generated · ${advN} Staff advance(s) recovered · commissions settled in Staff`,
                a.name,
              ),
            },
          });
          await this.ctx.audit(
            a.rootId,
            a,
            'Payroll finalized',
            'run',
            r.id,
            `${r.number} · ${r.lines.length} employees`,
            { tx },
          );
        });
        return { status: 'Finalized' };
      },
    );
  }

  private async postCheck(a: PpActor, id: string) {
    const r = await this.run(a, id);
    let err = '';
    try {
      const rep = await this.finance.sweep(a.rootId, false);
      err = rep.errors.filter((e) => e.startsWith('payroll')).join(' · ');
    } catch (e) {
      err = (e as Error).message;
    }
    const j = await this.db.finJournal.findFirst({
      where: {
        businessId: a.rootId,
        sourceType: 'payroll',
        sourceId: r.id,
        sourceEvent: 'accrual',
        superseded: false,
      },
      orderBy: { sourceRev: 'desc' },
    });
    if (j?.status === 'Posted') {
      await this.db.ppRun.update({
        where: { id: r.id },
        data: {
          status: 'Finance Posted',
          journalRef: j.number,
          history: this.histAdd(
            r,
            `Finance posted · journal ${j.number} (created by Finance & Accounting)`,
            'Finance & Accounting',
          ),
          version: { increment: 1 },
        },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'Payroll posted to Finance',
        'run',
        r.id,
        `${r.number} · ${j.number}`,
      );
      return { status: 'Finance Posted', journal: j.number };
    }
    return {
      status: 'Finance Posting Pending',
      journal: null,
      why:
        err ||
        (j
          ? `Journal ${j.number} is ${j.status}`
          : 'The ledger sweep didn’t post it yet'),
    };
  }

  private async payout(a: PpActor, r: Run, retry: boolean) {
    this.ctx.need(a, 'payout', 'Creating payout batches');
    if (!retry && r.status !== 'Finance Posted')
      throw ppErr(
        PP_ERRORS.STATUS,
        r.status === 'Finance Posting Pending'
          ? 'Wait for Finance to post the journal first.'
          : `INVALID_STATUS_TRANSITION — ${r.status} → Payout Submitted.`,
      );
    if (retry && !['Partially Paid', 'Payout Failed'].includes(r.status))
      throw ppErr(PP_ERRORS.STATUS, 'No failed payouts to retry.');
    const lines = r.lines.filter((l) =>
      retry ? l.payout === 'Failed' : num(l.net) > 0,
    );
    if (!lines.length)
      throw ppErr(
        PP_ERRORS.INVALID,
        retry ? 'No failed payouts.' : 'No positive net pay to pay out.',
      );
    const profs = await this.db.ppEmployee.findMany({
      where: { businessId: a.rootId },
    });
    const members = await this.ctx.members(a.rootId, true);
    const prof = (uid: string) => {
      const m = members.find((x) => x.id === uid);
      return profs.find((p) => m?.buIds.includes(p.businessUserId));
    };
    const missing = lines.filter((l) => !prof(l.userId)?.bankAccountEnc);
    if (missing.length)
      throw ppErr(
        'PAYOUT_SETUP_MISSING',
        `PAYOUT_SETUP_MISSING — ${missing.map((l) => members.find((m) => m.id === l.userId)?.name ?? l.userId).join(', ')} ${missing.length > 1 ? 'have' : 'has'} no bank account on their payroll profile.`,
      );
    const n =
      ((r.history as unknown as { file?: string }[]) ?? []).filter(
        (h) => h.file,
      ).length + 1;
    const batch = `PB-${r.period}-${n}`;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Payout');
    ws.columns = [
      { header: 'Employee', key: 'n', width: 28 },
      { header: 'Bank', key: 'b', width: 20 },
      { header: 'Account / IBAN', key: 'acc', width: 30 },
      { header: 'Account title', key: 't', width: 28 },
      { header: 'Amount', key: 'amt', width: 14 },
      { header: 'Reference', key: 'ref', width: 26 },
    ];
    for (const l of lines) {
      const p = prof(l.userId)!;
      const acc = this.ctx.decrypt(p.bankAccountEnc);
      if (!acc)
        throw ppErr(
          PP_ERRORS.NOT_CONFIGURED,
          'A bank account couldn’t be decrypted — check the server encryption key (INTEGRATIONS_TOKEN_KEY).',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      ws.addRow({
        n: members.find((m) => m.id === l.userId)?.name ?? '',
        b: p.bankName ?? '',
        acc,
        t: p.bankTitle ?? '',
        amt: num(l.net),
        ref: `${r.number} ${batch}`.slice(0, 26),
      });
    }
    const key = `people/${a.rootId}/payouts/${batch}-${Date.now()}.xlsx`;
    const url = await this.bridge.upload(
      key,
      Buffer.from(await wb.xlsx.writeBuffer()),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    await this.db.$transaction(async (tx) => {
      await tx.ppRunLine.updateMany({
        where: { id: { in: lines.map((l) => l.id) } },
        data: { payout: 'Processing', payoutRef: null },
      });
      await tx.ppRun.update({
        where: { id: r.id },
        data: {
          status: retry ? r.status : 'Payout Submitted',
          batchRef: batch,
          version: { increment: 1 },
          history: this.histAdd(
            r,
            `${retry ? 'Retry' : 'Payout'} batch ${batch} · ${lines.length} transfer(s) · bank file created — upload it to your bank`,
            a.name,
            { file: key },
          ),
        },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        retry ? 'Payout retry batch created' : 'Payout batch created',
        'run',
        r.id,
        `${r.number} · ${batch} · ${lines.length} transfer(s)`,
        { tx },
      );
    });
    return { status: retry ? r.status : 'Payout Submitted', batch, url };
  }

  async bankFile(a: PpActor, id: string) {
    this.ctx.need(a, 'payout', 'Downloading bank files');
    const r = await this.run(a, id);
    const f = [...((r.history as unknown as { file?: string }[]) ?? [])]
      .reverse()
      .find((h) => h.file)?.file;
    if (!f)
      throw ppErr(
        PP_ERRORS.NOT_FOUND,
        'No bank file yet.',
        HttpStatus.NOT_FOUND,
      );
    await this.ctx.audit(
      a.rootId,
      a,
      'Bank file downloaded',
      'run',
      r.id,
      r.number,
    );
    return {
      url: await this.bridge.signed(f),
      name: f.split('/').pop() ?? 'payout.xlsx',
    };
  }

  private async record(
    a: PpActor,
    r: Run,
    results: { uid: string; status: string; ref?: string }[],
  ) {
    this.ctx.need(a, 'payout', 'Recording bank confirmations');
    if (
      !['Payout Submitted', 'Partially Paid', 'Payout Failed'].includes(
        r.status,
      )
    )
      throw ppErr(PP_ERRORS.STATUS, `${r.number} is ${r.status}.`);
    const todo = results.filter((x) => ['Paid', 'Failed'].includes(x.status));
    if (!todo.length)
      throw ppErr(
        PP_ERRORS.INVALID,
        'Record at least one result from the bank.',
      );
    for (const x of todo) {
      const l = r.lines.find((y) => y.userId === x.uid);
      if (!l || l.payout !== 'Processing')
        throw ppErr(
          PP_ERRORS.INVALID,
          'Only transfers in the current batch can be confirmed.',
        );
      if (x.status === 'Paid' && !(x.ref ?? '').trim())
        throw ppErr(
          PP_ERRORS.INVALID,
          'Each paid transfer needs the bank’s reference.',
        );
    }
    const now = new Date();
    const after = r.lines.map(
      (l) => todo.find((x) => x.uid === l.userId)?.status ?? l.payout,
    );
    const st = after.every((s) => s === 'Paid')
      ? 'Paid'
      : after.some((s) => s === 'Processing')
        ? r.status
        : after.some((s) => s === 'Paid')
          ? 'Partially Paid'
          : 'Payout Failed';
    await this.db.$transaction(async (tx) => {
      for (const x of todo)
        await tx.ppRunLine.update({
          where: { runId_userId: { runId: r.id, userId: x.uid } },
          data: {
            payout: x.status,
            payoutRef: (x.ref ?? '').trim().slice(0, 80) || null,
            paidAt: x.status === 'Paid' ? now : null,
          },
        });
      await tx.ppRun.update({
        where: { id: r.id },
        data: {
          status: st,
          version: { increment: 1 },
          history: this.histAdd(
            r,
            `Bank result recorded: ${todo.filter((x) => x.status === 'Paid').length} paid · ${todo.filter((x) => x.status === 'Failed').length} failed${st === 'Paid' ? ' · every transfer confirmed' : ''}`,
            a.name,
          ),
        },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'Payout results recorded',
        'run',
        r.id,
        `${r.number} · ${st}`,
        { tx },
      );
    });
    this.finance
      .sweep(a.rootId, false)
      .catch((e) =>
        this.log.warn(`payroll payout posting: ${(e as Error).message}`),
      );
    return { status: st };
  }

  // ── payslips ──────────────────────────────────────────────────────────

  private async line(a: PpActor, runId: string, uid: string) {
    const r = await this.run(a, runId);
    const l = r.lines.find((x) => x.userId === uid);
    if (!l || !l.slipStatus) throw notFound('Payslip');
    if (uid !== a.userId && !a.salary && !a.payroll)
      throw ppErr(
        PP_ERRORS.FORBIDDEN,
        'PERMISSION_DENIED — payslips are visible to payroll roles and the employee only.',
        HttpStatus.FORBIDDEN,
      );
    return { r, l };
  }

  async deliver(a: PpActor, runId: string, uid: string) {
    this.ctx.need(a, 'payroll', 'Delivering payslips');
    const { r, l } = await this.line(a, runId, uid);
    const n = await this.ctx.notify(
      a.rootId,
      [uid],
      `Your payslip for ${periodLabel(r.period)}`,
      `Net pay is ready to view in People & Payroll › Payslips (${r.number}).`,
      '/people/payslips',
    );
    const ok = n > 0;
    await this.db.ppRunLine.update({
      where: { id: l.id },
      data: {
        slipStatus: ok ? 'Delivered' : 'Delivery Failed',
        slipDeliveredAt: ok ? new Date() : null,
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      ok ? 'Payslip delivered' : 'Payslip delivery failed',
      'run',
      r.id,
      `${r.number} · ${uid.slice(0, 8)}${ok ? '' : ' · no active Staff login to deliver to'}`,
    );
    return { status: ok ? 'Delivered' : 'Delivery Failed' };
  }

  async deliverAll(a: PpActor) {
    this.ctx.need(a, 'payroll', 'Delivering payslips');
    const lines = await this.db.ppRunLine.findMany({
      where: { slipStatus: 'Generated', run: { businessId: a.rootId } },
      select: { runId: true, userId: true },
    });
    let ok = 0;
    for (const l of lines)
      if ((await this.deliver(a, l.runId, l.userId)).status === 'Delivered')
        ok++;
    return { delivered: ok, failed: lines.length - ok };
  }

  async viewed(a: PpActor, runId: string, uid: string) {
    if (uid !== a.userId) return;
    const { l } = await this.line(a, runId, uid);
    if (!l.slipViewedAt)
      await this.db.ppRunLine.update({
        where: { id: l.id },
        data: { slipViewedAt: new Date() },
      });
  }

  async slipPdf(a: PpActor, runId: string, uid: string) {
    const { r, l } = await this.line(a, runId, uid);
    const d = await this.X.load(a, scope0());
    const c = l.calc as unknown as Calc;
    const e = this.X.emp(d, uid);
    const m = (v: number | null) => esc(d.fmt.money(v));
    const tr = (k: string, v: string) =>
      `<tr><td style="padding:5px 0;color:#475467">${esc(k)}</td><td style="padding:5px 0;text-align:right;font-weight:600">${v}</td></tr>`;
    const html = `<html><head><meta charset="utf-8"/></head><body style="font-family:sans-serif;color:#101828;font-size:12px;padding:24px">
<h1 style="font-size:18px;margin:0">${esc(d.biz.name)}</h1><div style="color:#667085">${esc(d.biz.address ?? '')}</div>
<h2 style="font-size:15px;margin:18px 0 4px">Payslip · ${esc(periodLabel(r.period))}</h2><div style="color:#667085">${esc(r.number)} · pay date ${esc(dayKey(r.payDate, 'UTC'))}</div>
<table style="width:100%;margin-top:14px">${tr('Employee', esc(e?.name ?? ''))}${tr('Title', esc(e?.title ?? ''))}${tr('Department', esc(e?.dept || '—'))}</table>
<h3 style="font-size:13px;margin:16px 0 4px">Earnings</h3><table style="width:100%">${tr('Basic / regular', m(c.regular))}${tr('Overtime', m(c.ot))}${tr('Commission', m(c.comm))}${tr('Bonus / additions', m(c.bonus))}${tr('Allowances', m(c.allow))}${c.leaveImp ? tr('Unpaid leave', m(c.leaveImp)) : ''}${tr('Gross', m(c.gross))}</table>
<h3 style="font-size:13px;margin:16px 0 4px">Deductions</h3><table style="width:100%">${c.lines
      .filter((x) => x.kind === 'pre-tax' || x.kind === 'post-tax')
      .map((x) => tr(x.name, m(x.amount)))
      .join(
        '',
      )}${tr('Income tax', m(c.tax))}${tr('Advance recovery', m(c.adv))}${tr('Net pay', `<b>${m(c.net)}</b>`)}</table>
<p style="margin-top:20px;color:#667085">Computed with ${esc(c.ver)} and ${esc(c.taxVer)}. This payslip reflects the finalized payroll run and cannot be edited.</p></body></html>`;
    const pdf = await this.bridge.renderPdf(html);
    const url = await this.bridge.upload(
      `people/${a.rootId}/payslips/${r.number}-${uid}-${Date.now()}.pdf`,
      pdf,
      'application/pdf',
    );
    await this.ctx.audit(
      a.rootId,
      a,
      'Payslip downloaded',
      'run',
      r.id,
      `${r.number} · ${e?.name ?? uid}`,
    );
    return { url, name: `payslip-${r.number}.pdf` };
  }

  // ── benefit & deduction rules ─────────────────────────────────────────

  private async rule(a: PpActor, id: string) {
    const r = await this.db.ppRule.findFirst({
      where: { businessId: a.rootId, OR: [{ id }, { number: id }] },
    });
    if (!r) throw notFound('Rule');
    return r;
  }
  private amount(method: string, v: unknown) {
    if (v === '' || v == null) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0)
      throw ppErr(PP_ERRORS.INVALID, 'Shares must be zero or more.');
    if (method.startsWith('Percentage') && n > 100)
      throw ppErr(PP_ERRORS.INVALID, 'A percentage can’t exceed 100.');
    return r2(n);
  }

  async createRule(
    a: PpActor,
    i: {
      name?: string;
      type?: string;
      method?: string;
      pp?: string;
      cls?: string;
      fin?: string;
      prov?: string;
      elig?: string;
      ee?: unknown;
      er?: unknown;
      from?: string;
      why?: string;
    },
  ) {
    this.ctx.need(a, 'benefits', 'Creating benefit rules');
    const name = (i.name ?? '').trim();
    if (!name) throw ppErr(PP_ERRORS.INVALID, 'Rule name required.');
    if (!RULE_TYPES.includes(i.type ?? ''))
      throw ppErr(PP_ERRORS.INVALID, 'Pick a rule type.');
    if (!TAX_TREATMENTS.includes(i.pp ?? ''))
      throw ppErr(PP_ERRORS.INVALID, 'Pick a tax treatment.');
    const method =
      i.method === 'Percentage of base' ? 'Percentage of base' : 'Fixed';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(i.from ?? ''))
      throw ppErr(PP_ERRORS.INVALID, 'Pick the effective date.');
    if (!(i.why ?? '').trim())
      throw ppErr(PP_ERRORS.INVALID, 'Reason required.');
    const ee = this.amount(method, i.ee);
    const er = this.amount(method, i.er);
    if (!ee && !er)
      throw ppErr(PP_ERRORS.INVALID, 'Set an employee or employer share.');
    const v: RuleVer = {
      ver: 1,
      from: i.from!,
      to: null,
      ee,
      er,
      by: a.userId,
      at: nowIso(),
      why: i.why!.trim(),
    };
    const r = await this.db.$transaction(async (tx) => {
      const number = await this.ctx.number(a.rootId, 'rule', tx);
      const x = await tx.ppRule.create({
        data: {
          businessId: a.rootId,
          number,
          name: name.slice(0, 120),
          type: i.type!,
          classification: (i.cls ?? '').trim().slice(0, 80) || 'Internal',
          taxTreatment: i.pp!,
          method,
          eligibility:
            (i.elig ?? '').trim().slice(0, 120) || 'Assigned employees',
          financeAccount: (i.fin ?? '').trim().slice(0, 80) || null,
          provider: (i.prov ?? '').trim().slice(0, 120) || null,
          versions: [v] as unknown as Prisma.InputJsonValue,
          assigned: [],
          status: 'Active',
        },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'Rule created',
        'rule',
        x.id,
        `${number} · ${name} · from ${i.from} · ${i.why}`,
        { tx },
      );
      return x;
    });
    return { id: r.id, number: r.number };
  }

  /** Impact of a proposed version (live inputs for the current period). */
  async ruleImpact(
    a: PpActor,
    id: string,
    i: { ee?: unknown; er?: unknown; from?: string },
  ) {
    this.ctx.need(a, 'benefits', 'Previewing rule changes');
    const r = await this.rule(a, id);
    const d = await this.X.load(a, scope0('benefits'));
    const rr = this.X.rule(r, d.today);
    const ee = this.amount(r.method, i.ee);
    const er = this.amount(r.method, i.er);
    const cur =
      this.X.ruleVer(rr.versions, i.from ?? d.today) ??
      rr.versions[rr.versions.length - 1];
    const inp = await this.X.inputs(d, d.period);
    let est = 0;
    const who = rr.assigned.filter((u) => inp.has(u));
    for (const u of who) {
      const ip = inp.get(u)!;
      const base =
        ip.basis === 'Salaried'
          ? (ip.rate ?? 0)
          : ip.basis === 'Hourly'
            ? Math.max(0, ip.hours - ip.ot) * (ip.rate ?? 0)
            : 0;
      const val = (x: number | null) =>
        x == null
          ? 0
          : r.method.startsWith('Percentage')
            ? (base * x) / 100
            : x;
      est += val(ee) + val(er) - val(cur?.ee ?? null) - val(cur?.er ?? null);
    }
    return {
      lines: [
        `Affected employees in payroll: ${who.length}${
          who.length
            ? ` (${who
                .slice(0, 6)
                .map((u) => this.X.name(d, u))
                .join(', ')}${who.length > 6 ? '…' : ''})`
            : ''
        }`,
        `Current version: v${cur?.ver ?? '—'} · employee ${cur?.ee ?? '—'} / employer ${cur?.er ?? '—'}${r.method.startsWith('Percentage') ? ' %' : ''}`,
        `New version: employee ${ee ?? '—'} / employer ${er ?? '—'}${r.method.startsWith('Percentage') ? ' %' : ''}`,
        `Estimated monthly payroll impact: ${d.fmt.money(r2(est))} (from this month’s live inputs)`,
        `Effective from: ${i.from ?? '—'} — earlier and finalized runs keep the version they used`,
      ],
    };
  }

  async scheduleChange(
    a: PpActor,
    id: string,
    i: { ee?: unknown; er?: unknown; from?: string; why?: string },
  ) {
    this.ctx.need(a, 'benefits', 'Changing benefit rules');
    const r = await this.rule(a, id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(i.from ?? ''))
      throw ppErr(PP_ERRORS.INVALID, 'Pick the effective date.');
    if (!(i.why ?? '').trim())
      throw ppErr(PP_ERRORS.INVALID, 'Reason required.');
    const vs = [...((r.versions as unknown as RuleVer[]) ?? [])].sort(
      (x, y) => x.ver - y.ver,
    );
    const last = vs[vs.length - 1];
    if (last && i.from! <= last.from)
      throw ppErr(
        PP_ERRORS.INVALID,
        `The new version must start after v${last.ver} (${last.from}).`,
      );
    const finalized = await this.db.ppRun.findFirst({
      where: {
        businessId: a.rootId,
        finalizedAt: { not: null },
        period: { gte: i.from!.slice(0, 7) },
      },
    });
    if (finalized)
      throw ppErr(
        PP_ERRORS.STATUS,
        `${finalized.number} is already finalized for ${periodLabel(finalized.period)} — the change must start in a later period.`,
      );
    if (last && (last.to == null || last.to >= i.from!))
      last.to = addDays(i.from!, -1);
    vs.push({
      ver: (last?.ver ?? 0) + 1,
      from: i.from!,
      to: null,
      ee: this.amount(r.method, i.ee),
      er: this.amount(r.method, i.er),
      by: a.userId,
      at: nowIso(),
      why: i.why!.trim(),
    });
    await this.db.$transaction(async (tx) => {
      await tx.ppRule.update({
        where: { id: r.id },
        data: {
          versions: vs as unknown as Prisma.InputJsonValue,
          status: 'Active',
        },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'Rule change scheduled',
        'rule',
        r.id,
        `${r.number} → v${vs[vs.length - 1].ver} from ${i.from} · ${i.why}`,
        { tx },
      );
    });
    return { ver: vs[vs.length - 1].ver };
  }

  async deactivate(a: PpActor, id: string, to: string) {
    this.ctx.need(a, 'benefits', 'Ending benefit rules');
    const r = await this.rule(a, id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(to))
      throw ppErr(PP_ERRORS.INVALID, 'Pick the last effective date.');
    const vs = ((r.versions as unknown as RuleVer[]) ?? [])
      .filter((v) => v.from <= to)
      .map((v) => (v.to == null || v.to > to ? { ...v, to } : v));
    if (!vs.length)
      throw ppErr(PP_ERRORS.INVALID, 'That date is before the rule starts.');
    await this.db.ppRule.update({
      where: { id: r.id },
      data: { versions: vs as unknown as Prisma.InputJsonValue },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Rule end-dated',
      'rule',
      r.id,
      `${r.number} → ${to}`,
    );
    return { ok: true };
  }

  async assign(a: PpActor, id: string, uids: string[], on: boolean) {
    this.ctx.need(a, 'benefits', 'Assigning benefits');
    const r = await this.rule(a, id);
    const members = await this.ctx.members(a.rootId);
    const ok = uids.filter((u) => members.some((m) => m.id === u));
    const cur = (r.assigned as unknown as string[]) ?? [];
    const next = on
      ? [...new Set([...cur, ...ok])]
      : cur.filter((u) => !ok.includes(u));
    await this.db.ppRule.update({
      where: { id: r.id },
      data: { assigned: next },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      on ? 'Benefit assigned' : 'Benefit removed',
      'rule',
      r.id,
      `${r.number} · ${ok.length} employee(s) · applies from the next calculation`,
    );
    return { assigned: next.length };
  }

  async assignDept(a: PpActor, id: string, dept: string) {
    const d = await this.X.load(a, scope0('benefits'));
    const uids = d.emps
      .filter((e) => e.status !== 'Exited' && e.dept === dept)
      .map((e) => e.id);
    if (!uids.length) throw ppErr(PP_ERRORS.INVALID, `Nobody is in ${dept}.`);
    return this.assign(a, id, uids, true);
  }

  /** Readiness fixes owned elsewhere — asks the right person in-app (nothing changes here). */
  async requestFix(a: PpActor, kind: string, uids: string[]) {
    this.ctx.need(a, 'payroll', 'Requesting input fixes');
    const d = await this.X.load(a, scope0());
    const ids = uids.filter((u) => this.X.emp(d, u));
    if (!ids.length) throw ppErr(PP_ERRORS.INVALID, 'Nobody to ask.');
    let n = 0;
    if (kind === 'ts') {
      const mgrs = [
        ...new Set(
          ids.map((u) => this.X.emp(d, u)?.mgr).filter((x): x is string => !!x),
        ),
      ];
      n = await this.ctx.notify(
        a.rootId,
        mgrs.length ? mgrs : await this.ctx.ownerIds(a.rootId),
        `Approve ${periodLabel(d.period)} timesheets`,
        `Payroll is waiting on: ${ids.map((u) => this.X.name(d, u)).join(', ')}`,
        '/staff/timesheets',
        a.userId,
      );
    } else
      n = await this.ctx.notify(
        a.rootId,
        ids,
        kind === 'bank'
          ? 'Add your bank details for payroll'
          : 'Complete your tax status for payroll',
        'Open People & Payroll › More… › My payroll profile',
        '/people/payslips',
        a.userId,
      );
    await this.ctx.audit(
      a.rootId,
      a,
      'Input fix requested',
      'run',
      a.rootId,
      `${kind} · ${ids.length} employee(s) · ${n} notified`,
    );
    return { notified: n };
  }

  monthLast(ym: string) {
    return monthBounds(ym).lastKey;
  }
}

export type { Data };
