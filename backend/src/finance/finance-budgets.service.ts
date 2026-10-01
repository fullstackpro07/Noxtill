import { HttpStatus, Injectable } from '@nestjs/common';
import { FinAccount, FinBudget } from '@prisma/client';
import ExcelJS from 'exceljs';
import { parse as csvParse } from 'csv-parse/sync';

const parse = csvParse as unknown as (
  input: string,
  opts: Record<string, unknown>,
) => Record<string, string>[];
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import {
  FinActor,
  FinanceContextService,
  monthEnd,
  monthStart,
  num,
  r2,
} from './finance-context.service';
import { FinanceJournalsService } from './finance-journals.service';
import { FinanceLedgerService, Range, natural } from './finance-ledger.service';
import { FIN_ERRORS, MONTHS, PL_TYPES } from './finance.constants';

export interface BvaRow {
  account: FinAccount;
  department: string | null;
  budget: number;
  actual: number;
  variance: number;
  pct: number;
  favorable: boolean;
  material: boolean;
  explanation: string | null;
}

/**
 * Budgets and forecasts as versions. Approved versions are never edited — a change is a new
 * revision (Draft → Submitted → Approved), and approving it locks the version it replaces.
 * Actuals are posted ledger movements for the same accounts and months.
 */
@Injectable()
export class FinanceBudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FinanceContextService,
    private readonly ledger: FinanceLedgerService,
    private readonly journals: FinanceJournalsService,
  ) {}

  async list(rootId: string) {
    return this.prisma.finBudget.findMany({
      where: { businessId: rootId },
      orderBy: [{ fiscalYear: 'desc' }, { version: 'desc' }],
      include: { _count: { select: { lines: true } } },
    });
  }

  async mustBudget(rootId: string, id: string) {
    const b = await this.prisma.finBudget.findFirst({
      where: { id, businessId: rootId },
      include: { lines: true },
    });
    if (!b)
      throw new AppException(
        FIN_ERRORS.NOT_FOUND,
        'Budget not found',
        HttpStatus.NOT_FOUND,
      );
    return b;
  }

  /** Calendar months (year, month) making up a fiscal year. */
  async fyMonths(rootId: string, fy: number) {
    const cfg = await this.ctx.config(rootId);
    const sm = this.ledger.fyStartMonth(cfg);
    const out: { year: number; month: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const m0 = sm - 1 + i;
      out.push({
        year: (sm === 1 ? fy : fy - 1) + Math.floor(m0 / 12),
        month: (m0 % 12) + 1,
      });
    }
    return out;
  }

  async create(
    actor: FinActor,
    dto: {
      name: string;
      fiscalYear: number;
      basis: 'empty' | 'actuals' | 'copy';
      copyFromId?: string;
      upliftPct?: number;
      branchId?: string | null;
      notes?: string;
    },
  ) {
    this.ctx.need(actor, 'manage', 'Creating a budget');
    const rootId = actor.rootId;
    const months = await this.fyMonths(rootId, dto.fiscalYear);
    const lines: {
      accountId: string;
      year: number;
      month: number;
      amount: number;
      department: string | null;
    }[] = [];
    const uplift = 1 + (dto.upliftPct ?? 0) / 100;
    let basedOnId: string | null = null;
    if (dto.basis === 'copy') {
      const src = await this.mustBudget(rootId, dto.copyFromId ?? '');
      basedOnId = src.id;
      const shift = dto.fiscalYear - src.fiscalYear;
      for (const l of src.lines)
        lines.push({
          accountId: l.accountId,
          year: l.year + shift,
          month: l.month,
          amount: r2(num(l.amount) * uplift),
          department: l.department,
        });
    } else if (dto.basis === 'actuals') {
      const accounts = (await this.ctx.accounts(rootId)).filter(
        (a) => PL_TYPES.has(a.type) && !a.isHeader,
      );
      for (const m of months) {
        const t = await this.ledger.totals(
          rootId,
          dto.branchId ?? null,
          monthStart(m.year - 1, m.month),
          monthEnd(m.year - 1, m.month),
        );
        for (const a of accounts) {
          const x = t.get(a.id);
          if (!x) continue;
          const v = natural(a, x.dr, x.cr);
          if (v)
            lines.push({
              accountId: a.id,
              year: m.year,
              month: m.month,
              amount: r2(v * uplift),
              department: null,
            });
        }
      }
    }
    const prior = await this.prisma.finBudget.findFirst({
      where: { businessId: rootId, fiscalYear: dto.fiscalYear },
      orderBy: { version: 'desc' },
    });
    const b = await this.prisma.finBudget.create({
      data: {
        businessId: rootId,
        name: dto.name.slice(0, 120),
        fiscalYear: dto.fiscalYear,
        version: (prior?.version ?? 0) + 1,
        status: 'Draft',
        basedOnId,
        branchId: dto.branchId ?? null,
        notes: dto.notes ?? null,
        createdById: actor.userId,
        lines: { create: lines.map((l) => ({ ...l, businessId: rootId })) },
      },
    });
    await this.ctx.audit(
      rootId,
      actor,
      'budget.created',
      'budget',
      b.id,
      `${b.name} v${b.version} (${dto.basis}${dto.upliftPct ? `, ${dto.upliftPct}%` : ''}) · ${lines.length} lines`,
    );
    return b;
  }

  async revise(actor: FinActor, id: string) {
    const src = await this.mustBudget(actor.rootId, id);
    return this.create(actor, {
      name: src.name.replace(/\s*\(rev.*\)$/, '') + ` (rev ${src.version + 1})`,
      fiscalYear: src.fiscalYear,
      basis: 'copy',
      copyFromId: src.id,
      branchId: src.branchId,
    });
  }

  async setLine(
    actor: FinActor,
    id: string,
    dto: {
      accountId: string;
      year: number;
      month: number;
      amount: number;
      department?: string | null;
    },
  ) {
    this.ctx.need(actor, 'manage', 'Editing a budget');
    const b = await this.mustBudget(actor.rootId, id);
    if (b.status !== 'Draft')
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        `${b.name} is ${b.status} — create a revision to change it.`,
        HttpStatus.CONFLICT,
      );
    await this.prisma.finBudgetLine.deleteMany({
      where: {
        budgetId: id,
        accountId: dto.accountId,
        year: dto.year,
        month: dto.month,
        department: dto.department ?? null,
      },
    });
    if (dto.amount)
      await this.prisma.finBudgetLine.create({
        data: {
          businessId: actor.rootId,
          budgetId: id,
          accountId: dto.accountId,
          year: dto.year,
          month: dto.month,
          amount: r2(dto.amount),
          department: dto.department ?? null,
        },
      });
  }

  async explain(
    actor: FinActor,
    id: string,
    accountId: string,
    from: Date,
    to: Date,
    text: string,
  ) {
    this.ctx.need(actor, 'manage', 'Explaining a variance');
    const b = await this.mustBudget(actor.rootId, id);
    const lines = b.lines.filter(
      (l) =>
        l.accountId === accountId &&
        monthStart(l.year, l.month) >=
          monthStart(from.getUTCFullYear(), from.getUTCMonth() + 1) &&
        monthStart(l.year, l.month) <= to,
    );
    if (!lines.length)
      await this.prisma.finBudgetLine.create({
        data: {
          businessId: actor.rootId,
          budgetId: id,
          accountId,
          year: to.getUTCFullYear(),
          month: to.getUTCMonth() + 1,
          amount: 0,
          explanation: text.slice(0, 500),
        },
      });
    else
      await this.prisma.finBudgetLine.updateMany({
        where: { id: { in: lines.map((l) => l.id) } },
        data: { explanation: text.slice(0, 500) },
      });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'budget.variance_explained',
      'budget',
      id,
      text,
    );
  }

  async submit(actor: FinActor, id: string) {
    this.ctx.need(actor, 'manage', 'Submitting a budget');
    const b = await this.mustBudget(actor.rootId, id);
    if (b.status !== 'Draft')
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        `${b.name} is ${b.status}.`,
        HttpStatus.CONFLICT,
      );
    if (!b.lines.length)
      throw new AppException(
        FIN_ERRORS.INVALID,
        'The budget has no lines.',
        HttpStatus.BAD_REQUEST,
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.finBudget.update({
        where: { id },
        data: { status: 'Submitted' },
      });
      await this.journals.requestApproval(
        actor.rootId,
        actor,
        {
          subjectType: 'budget',
          subjectId: id,
          title: `${b.name} v${b.version}`,
          amount: null,
          rule: 'Budgets are approved by the Owner / Controller',
          level: 'admin',
        },
        tx,
      );
    });
    await this.ctx.audit(actor.rootId, actor, 'budget.submitted', 'budget', id);
  }

  async approve(actor: FinActor, id: string) {
    const b = await this.mustBudget(actor.rootId, id);
    if (b.status !== 'Submitted')
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        'Submit the budget first.',
        HttpStatus.CONFLICT,
      );
    this.journals.assertCanApprove(
      actor,
      'admin',
      b.createdById,
      false,
      'Approving a budget',
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.finBudget.updateMany({
        where: {
          businessId: actor.rootId,
          fiscalYear: b.fiscalYear,
          status: 'Approved',
          branchId: b.branchId,
        },
        data: { status: 'Locked' },
      });
      await tx.finBudget.update({
        where: { id },
        data: {
          status: 'Approved',
          approvedById: actor.userId,
          approvedAt: new Date(),
        },
      });
      await this.journals.decide(
        actor.rootId,
        'budget',
        id,
        'Approved',
        actor,
        undefined,
        tx,
      );
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'budget.approved',
      'budget',
      id,
      `${b.name} v${b.version} is now the active budget`,
    );
  }

  async reject(actor: FinActor, id: string, reason: string) {
    this.ctx.need(actor, 'admin', 'Rejecting a budget');
    const b = await this.mustBudget(actor.rootId, id);
    if (b.status !== 'Submitted')
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        `${b.name} isn’t submitted.`,
        HttpStatus.CONFLICT,
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.finBudget.update({ where: { id }, data: { status: 'Draft' } });
      await this.journals.decide(
        actor.rootId,
        'budget',
        id,
        'Rejected',
        actor,
        reason,
        tx,
      );
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'budget.rejected',
      'budget',
      id,
      reason,
    );
  }

  /**
   * Import a spreadsheet as a new Draft version. Accepts either long format (Account, Month,
   * Amount[, Department]) or wide format (Account + one column per month). Every row is validated;
   * nothing is created if any row is invalid.
   */
  async importFile(
    actor: FinActor,
    file: { buffer: Buffer; originalname: string },
    dto: { name: string; fiscalYear: number },
  ) {
    this.ctx.need(actor, 'manage', 'Importing a budget');
    let rows: Record<string, string>[];
    if (/\.xlsx$/i.test(file.originalname)) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(file.buffer as unknown as ArrayBuffer);
      const ws = wb.worksheets[0];
      const head: string[] = [];
      ws.getRow(1).eachCell(
        (c, i) =>
          (head[i] = (
            typeof c.value === 'string' || typeof c.value === 'number'
              ? String(c.value)
              : ''
          )
            .trim()
            .toLowerCase()),
      );
      rows = [];
      ws.eachRow((r, n) => {
        if (n === 1) return;
        const o: Record<string, string> = {};
        r.eachCell((c, i) => {
          const v = c.value as unknown;
          o[head[i]] =
            v && typeof v === 'object' && 'result' in v
              ? String((v as { result: string | number }).result)
              : typeof v === 'string' || typeof v === 'number'
                ? String(v)
                : '';
        });
        rows.push(o);
      });
    } else
      rows = parse(file.buffer.toString('utf8').replace(/^\uFEFF/, ''), {
        columns: (h: string[]) => h.map((x) => x.trim().toLowerCase()),
        skip_empty_lines: true,
        trim: true,
      });
    if (!rows.length)
      throw new AppException(
        FIN_ERRORS.INVALID,
        'The file has no rows.',
        HttpStatus.BAD_REQUEST,
      );
    const accounts = await this.ctx.accounts(actor.rootId);
    const byCode = new Map(accounts.map((a) => [a.code, a]));
    const months = await this.fyMonths(actor.rootId, dto.fiscalYear);
    const monthIdx = (s: string) => {
      const t = s.trim().toLowerCase();
      const n = Number(t);
      if (n >= 1 && n <= 12) return n;
      const i = MONTHS.findIndex((m) =>
        m.toLowerCase().startsWith(t.slice(0, 3)),
      );
      return i >= 0 ? i + 1 : 0;
    };
    const errors: string[] = [];
    const lines: {
      accountId: string;
      year: number;
      month: number;
      amount: number;
      department: string | null;
    }[] = [];
    const cols = Object.keys(rows[0]);
    const wide =
      cols.filter((c) => monthIdx(c) > 0 && !/^\d+$/.test(c)).length >= 2;
    rows.forEach((r, i) => {
      const n = i + 2;
      const code = String(r['account'] ?? r['account code'] ?? r['code'] ?? '')
        .trim()
        .split(/\s+/)[0];
      const a = byCode.get(code);
      if (!a)
        return void errors.push(
          `Row ${n}: account “${code || '(blank)'}” isn’t in the chart of accounts.`,
        );
      if (a.isHeader || !PL_TYPES.has(a.type))
        return void errors.push(
          `Row ${n}: ${a.code} ${a.name} isn’t a postable P&L account.`,
        );
      const dept = (r['department'] ?? '').trim() || null;
      const push = (mi: number, raw: string, label: string) => {
        if (raw == null || String(raw).trim() === '') return;
        const v = Number(String(raw).replace(/[,$\s]/g, ''));
        if (Number.isNaN(v))
          return void errors.push(
            `Row ${n}: ${label} amount “${raw}” isn’t a number.`,
          );
        const m = months.find((x) => x.month === mi)!;
        if (v)
          lines.push({
            accountId: a.id,
            year: m.year,
            month: m.month,
            amount: r2(v),
            department: dept,
          });
      };
      if (wide) {
        for (const c of cols)
          if (monthIdx(c) > 0 && !/^\d+$/.test(c)) push(monthIdx(c), r[c], c);
      } else {
        const mi = monthIdx(String(r['month'] ?? ''));
        if (!mi)
          return void errors.push(
            `Row ${n}: month “${r['month'] ?? ''}” isn’t a month (use 1–12 or a month name).`,
          );
        push(mi, r['amount'], MONTHS[mi - 1]);
      }
    });
    if (errors.length)
      return {
        created: null as FinBudget | null,
        errors: errors.slice(0, 50),
        rows: rows.length,
      };
    const prior = await this.prisma.finBudget.findFirst({
      where: { businessId: actor.rootId, fiscalYear: dto.fiscalYear },
      orderBy: { version: 'desc' },
    });
    const b = await this.prisma.finBudget.create({
      data: {
        businessId: actor.rootId,
        name: dto.name.slice(0, 120),
        fiscalYear: dto.fiscalYear,
        version: (prior?.version ?? 0) + 1,
        status: 'Draft',
        notes: `Imported from ${file.originalname}`,
        createdById: actor.userId,
        lines: {
          create: lines.map((l) => ({ ...l, businessId: actor.rootId })),
        },
      },
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'budget.imported',
      'budget',
      b.id,
      `${file.originalname}: ${lines.length} lines`,
    );
    return { created: b, errors: [], rows: rows.length };
  }

  /** The version shown by default: the approved one for the range's fiscal year, else the newest. */
  async activeFor(rootId: string, range: Range) {
    const cfg = await this.ctx.config(rootId);
    const fyStart = this.ledger.fyStartFor(cfg, range.to);
    const fy =
      this.ledger.fyStartMonth(cfg) === 1
        ? fyStart.getUTCFullYear()
        : fyStart.getUTCFullYear() + 1;
    return (
      (await this.prisma.finBudget.findFirst({
        where: { businessId: rootId, fiscalYear: fy, status: 'Approved' },
        orderBy: { version: 'desc' },
      })) ??
      (await this.prisma.finBudget.findFirst({
        where: { businessId: rootId, fiscalYear: fy },
        orderBy: { version: 'desc' },
      }))
    );
  }

  async bva(
    rootId: string,
    budgetId: string,
    range: Range,
    branchId: string | null,
  ): Promise<BvaRow[]> {
    const b = await this.mustBudget(rootId, budgetId);
    const cfg = await this.ctx.config(rootId);
    const accounts = await this.ctx.accounts(rootId);
    const fromK =
      range.from.getUTCFullYear() * 12 + range.from.getUTCMonth() + 1;
    const toK = range.to.getUTCFullYear() * 12 + range.to.getUTCMonth() + 1;
    const inRange = b.lines.filter((l) => {
      const k = l.year * 12 + l.month;
      return k >= fromK && k <= toK;
    });
    const t = await this.ledger.totals(rootId, branchId, range.from, range.to);
    const ids = new Set([
      ...inRange.map((l) => l.accountId),
      ...accounts
        .filter((a) => PL_TYPES.has(a.type) && t.has(a.id))
        .map((a) => a.id),
    ]);
    const rows: BvaRow[] = [];
    for (const a of accounts.filter((x) => ids.has(x.id) && !x.isHeader)) {
      const ls = inRange.filter((l) => l.accountId === a.id);
      const budget = r2(ls.reduce((s, l) => s + num(l.amount), 0));
      const x = t.get(a.id);
      const actual = x ? natural(a, x.dr, x.cr) : 0;
      if (!budget && !actual) continue;
      const variance = r2(actual - budget);
      const income = a.type === 'revenue' || a.type === 'other_inc';
      const pct = budget
        ? (variance / Math.abs(budget)) * 100
        : actual
          ? 100
          : 0;
      rows.push({
        account: a,
        department: ls.find((l) => l.department)?.department ?? null,
        budget,
        actual,
        variance,
        pct: r2(pct),
        favorable: income ? variance >= 0 : variance <= 0,
        material:
          Math.abs(pct) > cfg.materialPct &&
          Math.abs(variance) > cfg.materialAmt,
        explanation: ls.find((l) => l.explanation)?.explanation ?? null,
      });
    }
    return rows;
  }
}
