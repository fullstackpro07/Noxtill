import { HttpStatus, Injectable } from '@nestjs/common';
import { FinJournal, FinJournalLine, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import {
  FinActor,
  FinanceContextService,
  Tx,
  dayOf,
  monthKey,
  monthLabel,
  num,
  r2,
  ymd,
} from './finance-context.service';
import { FIN_ERRORS, FinanceConfig } from './finance.constants';

export interface LineInput {
  accountId: string | null;
  description?: string | null;
  /** Transaction currency. */
  debit: number;
  credit: number;
  branchId?: string | null;
  department?: string | null;
  customerId?: string | null;
  supplierId?: string | null;
  assetId?: string | null;
  taxCode?: string | null;
  /** Explicit base-currency amounts (FX settlement / revaluation lines); otherwise txn × rate. */
  baseDebit?: number;
  baseCredit?: number;
}

export interface SourceRef {
  type: string;
  id: string;
  event: string;
  hash: string;
  label: string;
}

export interface JournalInput {
  date: Date;
  type: string;
  reference?: string | null;
  memo?: string | null;
  currency: string;
  fxRate?: number;
  branchId?: string | null;
  department?: string | null;
  status: string;
  preparedById?: string | null;
  source?: SourceRef & { rev: number };
  reversalOfId?: string | null;
  autoReverseOn?: Date | null;
  batchId?: string | null;
  lines: LineInput[];
}

export interface Step {
  k: string;
  l: string;
  ok: boolean;
  d: string;
}

export type JournalWithLines = FinJournal & { lines: FinJournalLine[] };

/** Who must approve a manual journal of this size: nobody, a Finance Manager, or Owner/Controller. */
export function approvalLevel(
  cfg: FinanceConfig,
  amount: number,
  touchesControl: boolean,
): 'none' | 'approve' | 'admin' {
  if (touchesControl || amount > cfg.thresholds.journalOwner) return 'admin';
  if (amount >= cfg.thresholds.journalDirect) return 'approve';
  return 'none';
}
export const APPROVER_LABEL = {
  none: 'No approval needed',
  approve: 'Finance Manager',
  admin: 'Owner / Controller',
};

/**
 * The double-entry engine. A journal is committed only when it balances, every account is active
 * and postable, its period is open and any approval it needs is recorded — all checked inside the
 * same transaction that commits it. Posted journals are never edited: corrections are reversals.
 */
@Injectable()
export class FinancePostingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FinanceContextService,
  ) {}

  // ── creation ─────────────────────────────────────────────────────────────

  async create(tx: Tx, rootId: string, input: JournalInput) {
    const date = dayOf(input.date);
    const rate = input.fxRate ?? 1;
    const lines = input.lines
      .filter(
        (l) =>
          l.accountId ||
          l.debit ||
          l.credit ||
          l.baseDebit ||
          l.baseCredit ||
          l.description,
      )
      .map((l, i) => {
        const debit = r2(l.debit || 0);
        const credit = r2(l.credit || 0);
        return {
          lineNo: i + 1,
          accountId: l.accountId || null,
          description: l.description?.slice(0, 300) || null,
          txnDebit: debit,
          txnCredit: credit,
          debit: l.baseDebit != null ? r2(l.baseDebit) : r2(debit * rate),
          credit: l.baseCredit != null ? r2(l.baseCredit) : r2(credit * rate),
          branchId: l.branchId ?? input.branchId ?? null,
          department: l.department ?? input.department ?? null,
          customerId: l.customerId ?? null,
          supplierId: l.supplierId ?? null,
          assetId: l.assetId ?? null,
          taxCode: l.taxCode ?? null,
        };
      });
    // Conversion can leave a cent of rounding when the transaction itself balances: put it on
    // the largest line so the base-currency entry balances exactly.
    const txnDiff = r2(lines.reduce((a, l) => a + l.txnDebit - l.txnCredit, 0));
    const baseDiff = r2(lines.reduce((a, l) => a + l.debit - l.credit, 0));
    const overridden = input.lines.some(
      (l) => l.baseDebit != null || l.baseCredit != null,
    );
    if (!overridden && txnDiff === 0 && baseDiff !== 0 && lines.length) {
      const big = [...lines].sort(
        (a, b) => b.debit + b.credit - (a.debit + a.credit),
      )[0];
      if (big.debit) big.debit = r2(big.debit - baseDiff);
      else big.credit = r2(big.credit + baseDiff);
    }
    const total = r2(lines.reduce((a, l) => a + l.debit, 0));
    const number = await this.ctx.nextNumber(
      tx,
      rootId,
      'journal',
      date.getUTCFullYear(),
    );
    return tx.finJournal.create({
      data: {
        businessId: rootId,
        number,
        date,
        type: input.type,
        reference: input.reference?.slice(0, 80) || null,
        memo: input.memo || null,
        status: input.status,
        currency: input.currency,
        branchId: input.branchId ?? null,
        department: input.department ?? null,
        total,
        preparedById: input.preparedById ?? null,
        sourceType: input.source?.type ?? null,
        sourceId: input.source?.id ?? null,
        sourceEvent: input.source?.event ?? null,
        sourceRev: input.source?.rev ?? 0,
        sourceHash: input.source?.hash ?? null,
        sourceLabel: input.source?.label?.slice(0, 200) ?? null,
        reversalOfId: input.reversalOfId ?? null,
        autoReverseOn: input.autoReverseOn ?? null,
        batchId: input.batchId ?? null,
        lines: {
          create: lines.map((l) => ({
            ...l,
            businessId: rootId,
            currency: input.currency,
            fxRate: rate,
            date,
          })),
        },
      },
      include: { lines: true },
    });
  }

  /** Replace a draft's header and lines (version-checked). */
  async replaceDraft(
    rootId: string,
    id: string,
    version: number,
    input: Omit<JournalInput, 'status'>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const j = await tx.finJournal.findFirst({
        where: { id, businessId: rootId },
      });
      if (!j)
        throw new AppException(
          FIN_ERRORS.NOT_FOUND,
          'Journal not found',
          HttpStatus.NOT_FOUND,
        );
      if (!['Draft', 'Pending Review', 'Failed'].includes(j.status))
        throw new AppException(
          FIN_ERRORS.CONFLICT,
          `${j.number} is ${j.status} — only drafts can be edited.`,
          HttpStatus.CONFLICT,
        );
      if (j.version !== version)
        throw new AppException(
          FIN_ERRORS.VERSION,
          `${j.number} was changed by someone else (now v${j.version}, you edited v${version}).`,
          HttpStatus.CONFLICT,
        );
      const rate = input.fxRate ?? 1;
      const date = dayOf(input.date);
      await tx.finJournalLine.deleteMany({ where: { journalId: id } });
      const lines = input.lines
        .filter((l) => l.accountId || l.debit || l.credit || l.description)
        .map((l, i) => ({
          businessId: rootId,
          journalId: id,
          lineNo: i + 1,
          accountId: l.accountId || null,
          description: l.description?.slice(0, 300) || null,
          txnDebit: r2(l.debit || 0),
          txnCredit: r2(l.credit || 0),
          debit: r2((l.debit || 0) * rate),
          credit: r2((l.credit || 0) * rate),
          currency: input.currency,
          fxRate: rate,
          branchId: l.branchId ?? input.branchId ?? null,
          department: l.department ?? input.department ?? null,
          customerId: l.customerId ?? null,
          supplierId: l.supplierId ?? null,
          taxCode: l.taxCode ?? null,
          date,
        }));
      if (lines.length) await tx.finJournalLine.createMany({ data: lines });
      return tx.finJournal.update({
        where: { id },
        data: {
          date,
          type: input.type,
          reference: input.reference?.slice(0, 80) || null,
          memo: input.memo || null,
          currency: input.currency,
          branchId: input.branchId ?? null,
          department: input.department ?? null,
          total: r2(lines.reduce((a, l) => a + l.debit, 0)),
          version: { increment: 1 },
          status: j.status === 'Failed' ? 'Draft' : j.status,
          failureReason: null,
          autoReverseOn: input.autoReverseOn ?? null,
        },
        include: { lines: true },
      });
    });
  }

  // ── validation ───────────────────────────────────────────────────────────

  async validate(
    rootId: string,
    j: JournalWithLines,
    actor: FinActor | null,
    opts: { approvalCheck?: boolean; tx?: Tx } = {},
  ): Promise<Step[]> {
    const db = opts.tx ?? this.prisma;
    const steps: Step[] = [];
    const cfg = await this.ctx.config(rootId);
    const lines = j.lines;
    const dr = r2(lines.reduce((a, l) => a + num(l.debit), 0));
    const cr = r2(lines.reduce((a, l) => a + num(l.credit), 0));
    const bad = lines.filter(
      (l) =>
        (num(l.debit) > 0 && num(l.credit) > 0) ||
        num(l.debit) < 0 ||
        num(l.credit) < 0,
    );
    const noAcct = lines.filter(
      (l) => !l.accountId && (num(l.debit) || num(l.credit)),
    );
    let balanceMsg = `Debits ${dr.toFixed(2)} = credits ${cr.toFixed(2)}`;
    let balanced = dr === cr && dr > 0 && lines.length >= 2;
    if (bad.length) {
      balanced = false;
      balanceMsg = `Line ${bad[0].lineNo} has both a debit and a credit (or a negative amount) — use one side per line.`;
    } else if (noAcct.length) {
      balanced = false;
      balanceMsg = `Line ${noAcct[0].lineNo} has an amount but no account.`;
    } else if (dr !== cr)
      balanceMsg = `Debits ${dr.toFixed(2)} and credits ${cr.toFixed(2)} differ by ${Math.abs(r2(dr - cr)).toFixed(2)}.`;
    else if (dr === 0) balanceMsg = 'The journal has no amounts.';
    else if (lines.length < 2)
      balanceMsg = 'A journal needs at least two lines.';
    steps.push({
      k: 'balance',
      l: 'Debits equal credits',
      ok: balanced,
      d: balanceMsg,
    });

    const ids = [
      ...new Set(lines.map((l) => l.accountId).filter(Boolean)),
    ] as string[];
    const accounts = await db.finAccount.findMany({
      where: { businessId: rootId, id: { in: ids } },
    });
    const byId = new Map(accounts.map((a) => [a.id, a]));
    let acctMsg = `${ids.length} active account${ids.length === 1 ? '' : 's'}`;
    let acctOk = true;
    for (const l of lines) {
      if (!l.accountId) continue;
      const a = byId.get(l.accountId);
      if (!a) {
        acctOk = false;
        acctMsg = `Line ${l.lineNo}: account not found.`;
        break;
      }
      if (!a.active) {
        acctOk = false;
        acctMsg = `Account ${a.code} ${a.name} is inactive. Reactivate or remap it, then retry.`;
        break;
      }
      if (a.isHeader) {
        acctOk = false;
        acctMsg = `Account ${a.code} ${a.name} is a header — post to one of its sub-accounts.`;
        break;
      }
      const baseOnly = !num(l.txnDebit) && !num(l.txnCredit);
      if (a.currency && a.currency !== j.currency && !baseOnly) {
        acctOk = false;
        acctMsg = `Account ${a.code} ${a.name} only takes ${a.currency} entries; this journal is ${j.currency}.`;
        break;
      }
    }
    steps.push({
      k: 'accounts',
      l: 'Accounts active and postable',
      ok: acctOk,
      d: acctMsg,
    });

    const { year, month } = monthKey(j.date);
    const p = await this.ctx.period(rootId, year, month, opts.tx);
    const today = dayOf(new Date());
    let perOk =
      p.status === 'open' || (p.status === 'soft' && (!actor || actor.admin));
    let perMsg =
      p.status === 'open'
        ? `${monthLabel(year, month)} is open`
        : p.status === 'soft'
          ? perOk
            ? `${monthLabel(year, month)} is in soft close — posting as Owner/Controller`
            : `${monthLabel(year, month)} is in soft close — only an Owner/Controller can post to it.`
          : `${monthLabel(year, month)} is locked. Choose a date in an open period, or request a reopen.`;
    if (perOk && actor && j.sourceType == null && dayOf(j.date) > today) {
      const fm = monthKey(dayOf(j.date));
      const tm = monthKey(today);
      if (fm.year * 12 + fm.month > tm.year * 12 + tm.month) {
        perOk = false;
        perMsg = `${ymd(dayOf(j.date))} is in a future period. Date it in the current period, or save it as a draft.`;
      }
    }
    steps.push({ k: 'period', l: 'Period open', ok: perOk, d: perMsg });

    if (j.sourceType == null && cfg.posting.reqDept) {
      const missing = lines.find((l) => {
        const a = l.accountId ? byId.get(l.accountId) : null;
        return a && a.type === 'expense' && !l.department;
      });
      steps.push({
        k: 'dims',
        l: 'Required dimensions',
        ok: !missing,
        d: missing
          ? `Line ${missing.lineNo}: expense lines need a department (Settings › Posting controls).`
          : 'Department set on every expense line',
      });
    }

    if (opts.approvalCheck !== false && j.sourceType == null && actor) {
      const touches = accounts.some((a) => !!a.control);
      const level = approvalLevel(cfg, dr, touches);
      const approved = !!j.approvedById;
      const ok = level === 'none' || approved;
      steps.push({
        k: 'approval',
        l: 'Approval',
        ok,
        d:
          level === 'none'
            ? `Under ${cfg.thresholds.journalDirect.toFixed(2)} — no approval needed`
            : approved
              ? 'Approved'
              : `Needs ${APPROVER_LABEL[level]} approval${touches ? ' (touches a control account)' : ''}.`,
      });
    }
    return steps;
  }

  // ── posting ──────────────────────────────────────────────────────────────

  async load(rootId: string, id: string, tx?: Tx): Promise<JournalWithLines> {
    const j = await (tx ?? this.prisma).finJournal.findFirst({
      where: { id, businessId: rootId },
      include: { lines: { orderBy: { lineNo: 'asc' } } },
    });
    if (!j)
      throw new AppException(
        FIN_ERRORS.NOT_FOUND,
        'Journal not found',
        HttpStatus.NOT_FOUND,
      );
    return j;
  }

  /**
   * Validate and commit. On a validation failure nothing is committed; the journal is marked
   * Failed with the real reason (unless the only problem is a missing approval, which is a
   * permission error rather than a failed posting).
   */
  async post(
    rootId: string,
    id: string,
    actor: FinActor | null,
  ): Promise<{ ok: boolean; steps: Step[]; journal: JournalWithLines }> {
    const j = await this.load(rootId, id);
    if (j.status === 'Posted' || j.status === 'Reversed')
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        `${j.number} is already posted.`,
        HttpStatus.CONFLICT,
      );
    if (j.status === 'Voided')
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        `${j.number} was voided.`,
        HttpStatus.CONFLICT,
      );
    const steps = await this.validate(rootId, j, actor);
    const failed = steps.filter((s) => !s.ok);
    if (failed.length === 1 && failed[0].k === 'approval')
      throw new AppException(
        FIN_ERRORS.FORBIDDEN,
        failed[0].d,
        HttpStatus.FORBIDDEN,
      );
    if (failed.length) {
      const why = failed.map((s) => s.d).join(' ');
      await this.prisma.finJournal.update({
        where: { id },
        data: { status: 'Failed', failureReason: why.slice(0, 500) },
      });
      await this.ctx.audit(
        rootId,
        actor,
        'journal.post_failed',
        'journal',
        id,
        why,
      );
      return { ok: false, steps, journal: await this.load(rootId, id) };
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.finJournal.updateMany({
        where: { id, businessId: rootId, status: j.status, version: j.version },
        data: {
          status: 'Posted',
          postedAt: now,
          postedById: actor?.userId ?? null,
          failureReason: null,
        },
      });
      if (res.count !== 1)
        throw new AppException(
          FIN_ERRORS.VERSION,
          `${j.number} changed while posting — reload and try again.`,
          HttpStatus.CONFLICT,
        );
      await tx.finJournalLine.updateMany({
        where: { journalId: id },
        data: { postedAt: now, date: j.date },
      });
      if (j.reversalOfId)
        await tx.finJournal.update({
          where: { id: j.reversalOfId },
          data: { status: 'Reversed', reversedById: id },
        });
    });
    steps.push({
      k: 'commit',
      l: 'Committed to the ledger',
      ok: true,
      d: `${j.lines.length} lines posted`,
    });
    await this.ctx.audit(
      rootId,
      actor,
      'journal.posted',
      'journal',
      id,
      `${j.number} posted`,
    );
    return { ok: true, steps, journal: await this.load(rootId, id) };
  }

  /** Builds (and for system use, posts) the mirror journal of a posted one. */
  async createReversal(
    tx: Tx,
    rootId: string,
    orig: JournalWithLines,
    date: Date,
    memo: string,
    status: string,
    preparedById: string | null,
  ) {
    return this.create(tx, rootId, {
      date,
      type: 'Reversal',
      reference: `REV-${orig.number}`.slice(0, 80),
      memo,
      currency: orig.currency,
      fxRate: Number(orig.lines[0]?.fxRate ?? 1),
      branchId: orig.branchId,
      status,
      preparedById,
      reversalOfId: orig.id,
      lines: orig.lines.map((l) => ({
        accountId: l.accountId,
        description: l.description,
        debit: num(l.txnCredit),
        credit: num(l.txnDebit),
        branchId: l.branchId,
        department: l.department,
        customerId: l.customerId,
        supplierId: l.supplierId,
        assetId: l.assetId,
        taxCode: l.taxCode,
      })),
    });
  }

  // ── system postings (idempotent per source record) ──────────────────────

  /**
   * Post the journal a source record implies. Same source + same content = no-op; changed content
   * reverses the previous journal and posts revision n+1; empty lines = just reverse. Dates in a
   * locked period move to the first open period (the memo says so).
   */
  async postSystem(
    rootId: string,
    src: SourceRef,
    spec: {
      date: Date;
      currency: string;
      fxRate: number;
      branchId: string | null;
      memo: string;
      reference?: string | null;
      lines: LineInput[];
    },
  ): Promise<'same' | 'posted' | 'reposted' | 'reversed' | 'failed'> {
    const prev = await this.prisma.finJournal.findFirst({
      where: {
        businessId: rootId,
        sourceType: src.type,
        sourceId: src.id,
        sourceEvent: src.event,
        superseded: false,
      },
      orderBy: { sourceRev: 'desc' },
      include: { lines: true },
    });
    const lines = spec.lines.filter(
      (l) =>
        r2(l.debit) !== 0 ||
        r2(l.credit) !== 0 ||
        !!l.baseDebit ||
        !!l.baseCredit,
    );
    if (prev && prev.sourceHash === src.hash) {
      if (prev.status === 'Failed') {
        const res = await this.post(rootId, prev.id, null);
        return res.ok ? 'posted' : 'failed';
      }
      return 'same';
    }
    if (!prev && !lines.length) return 'same';
    const rev = prev ? prev.sourceRev + 1 : 0;
    let status: 'posted' | 'reposted' | 'reversed' | 'failed' = prev
      ? lines.length
        ? 'reposted'
        : 'reversed'
      : 'posted';
    let newId: string | null = null;
    await this.prisma.$transaction(async (tx) => {
      if (prev) {
        if (prev.status === 'Posted') {
          // Reverse in the original's period when it is still open (so the period nets to the
          // corrected figure), otherwise on the first day of the next open period.
          const rdate = await this.openDateFrom(rootId, prev.date, tx);
          const revJ = await this.createReversal(
            tx,
            rootId,
            prev,
            rdate,
            `Reversal of ${prev.number} — source ${lines.length ? 'changed' : 'removed or no longer applies'}: ${src.label}`,
            'Posted',
            null,
          );
          const now = new Date();
          await tx.finJournal.update({
            where: { id: revJ.id },
            data: { postedAt: now, sourceLabel: src.label.slice(0, 200) },
          });
          await tx.finJournalLine.updateMany({
            where: { journalId: revJ.id },
            data: { postedAt: now },
          });
          await tx.finJournal.update({
            where: { id: prev.id },
            data: {
              status: 'Reversed',
              reversedById: revJ.id,
              superseded: true,
            },
          });
        } else {
          await tx.finJournal.update({
            where: { id: prev.id },
            data: { status: 'Voided', superseded: true },
          });
        }
      }
      if (!lines.length) return;
      const orig = dayOf(spec.date);
      const date = await this.openDateFrom(rootId, orig, tx);
      let memo = spec.memo;
      if (date.getTime() !== orig.getTime()) {
        const o = monthKey(orig);
        const n = monthKey(date);
        memo += ` (dated ${ymd(orig)}, which is in locked ${monthLabel(o.year, o.month)} — posted to ${monthLabel(n.year, n.month)})`;
      }
      const j = await this.create(tx, rootId, {
        date,
        type: 'System',
        reference: spec.reference ?? null,
        memo,
        currency: spec.currency,
        fxRate: spec.fxRate,
        branchId: spec.branchId,
        status: 'Approved',
        source: { ...src, rev },
        lines,
      });
      newId = j.id;
    });
    if (newId) {
      const res = await this.post(rootId, newId, null);
      if (!res.ok) status = 'failed';
    }
    return status;
  }

  /** `d` when its period isn't locked, else the first day of the next period that isn't. */
  async openDateFrom(rootId: string, d: Date, tx?: Tx): Promise<Date> {
    const day = dayOf(d);
    const { year, month } = monthKey(day);
    const p = await this.ctx.period(rootId, year, month, tx);
    if (p.status !== 'locked') return day;
    const open = await this.ctx.firstOpenFrom(rootId, day, tx);
    return new Date(Date.UTC(open.year, open.month - 1, 1));
  }

  /** Every source record currently backed by a live system journal, for a source type. */
  async liveSources(rootId: string, type: string) {
    return this.prisma.finJournal.findMany({
      where: { businessId: rootId, sourceType: type, superseded: false },
      select: {
        sourceId: true,
        sourceEvent: true,
        sourceHash: true,
        status: true,
      },
    });
  }
}

export const toPrismaDecimal = (n: number) => new Prisma.Decimal(n.toFixed(2));
