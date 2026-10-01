import { HttpStatus, Injectable } from '@nestjs/common';
import { FinTaxReturn, Prisma } from '@prisma/client';
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
import { FIN_ERRORS } from './finance.constants';

export interface TaxCalc {
  base: number;
  output: number;
  input: number;
  net: number;
  outputLines: number;
  inputLines: number;
  exceptions: { ref: string; what: string; amount: number }[];
}

export const TAX_STEPS = [
  'Open period',
  'Calculate',
  'Review exceptions',
  'Reconcile control',
  'Review return',
  'Approval',
  'Lock calculation',
  'Export filing pack',
  'File externally',
  'Record evidence',
  'Filed',
];
export const TAX_STEP_AT: Record<string, number> = {
  Open: 0,
  Calculated: 2,
  'Review Required': 2,
  'Approval Required': 5,
  Locked: 7,
  Filed: 11,
};

/**
 * Tax returns, one per branch per month (the filing cadence Noxtill's tax settings use). Output
 * tax comes from posted sales, input tax from posted bills — both read from the ledger's tax
 * accounts. A return is only Filed once a filing reference is recorded.
 */
@Injectable()
export class FinanceTaxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FinanceContextService,
    private readonly journals: FinanceJournalsService,
  ) {}

  async calc(
    rootId: string,
    branchId: string,
    from: Date,
    to: Date,
  ): Promise<TaxCalc> {
    const maps = await this.ctx.accountMaps(rootId);
    const out = maps.byKey.get('output_tax')!;
    const inp = maps.byKey.get('input_tax')!;
    const revenue = maps.all
      .filter((a) => a.type === 'revenue' && !a.isHeader)
      .map((a) => a.id);
    // Lines with no branch (e.g. a bill entered without one) belong to the primary business's return.
    const where = {
      businessId: rootId,
      ...(branchId === rootId
        ? { OR: [{ branchId }, { branchId: null }] }
        : { branchId }),
      postedAt: { not: null },
      date: { gte: from, lte: to },
    };
    const [o, i, rev] = await Promise.all([
      this.prisma.finJournalLine.aggregate({
        where: { ...where, accountId: out.id },
        _sum: { debit: true, credit: true },
        _count: true,
      }),
      this.prisma.finJournalLine.aggregate({
        where: { ...where, accountId: inp.id },
        _sum: { debit: true, credit: true },
        _count: true,
      }),
      this.prisma.finJournalLine.aggregate({
        where: { ...where, accountId: { in: revenue } },
        _sum: { debit: true, credit: true },
      }),
    ]);
    const output = r2(num(o._sum.credit) - num(o._sum.debit));
    const input = r2(num(i._sum.debit) - num(i._sum.credit));
    const exceptions: TaxCalc['exceptions'] = [];
    // Bills posted in the period with lines carrying no tax code.
    const bills = await this.prisma.finBill.findMany({
      where: {
        businessId: rootId,
        ...(branchId === rootId
          ? { OR: [{ branchId }, { branchId: null }] }
          : { branchId }),
        billDate: { gte: from, lte: to },
        status: {
          in: [
            'Posted',
            'Partially Paid',
            'Paid',
            'Approved for Payment',
            'On Hold',
          ],
        },
      },
      include: { lines: true },
    });
    for (const b of bills)
      for (const l of b.lines)
        if (!l.taxCode)
          exceptions.push({
            ref: `${b.number} · ${b.vendorName}`,
            what: 'Missing tax code',
            amount: num(l.amount),
          });
    // Manual journals that touch a tax account bypass the calculation.
    const manual = await this.prisma.finJournalLine.findMany({
      where: {
        ...where,
        accountId: { in: [out.id, inp.id] },
        journal: { sourceType: null },
      },
      include: { journal: { select: { number: true } } },
    });
    for (const l of manual)
      exceptions.push({
        ref: l.journal.number,
        what: `Manual journal touches ${l.accountId === out.id ? out.code : inp.code}`,
        amount: r2(num(l.debit) - num(l.credit)),
      });
    // Sales lines with no tax rate recorded (not assumed zero-rated).
    const unrated = await this.prisma.order.count({
      where: {
        businessId: branchId,
        status: 'completed',
        isQuotation: false,
        createdAt: { gte: from, lte: new Date(to.getTime() + 86_399_999) },
        items: { some: { taxRatePercent: null } },
      },
    });
    if (unrated)
      exceptions.push({
        ref: `${unrated} sale${unrated === 1 ? '' : 's'}`,
        what: 'No tax rate recorded on a line — not assumed zero-rated',
        amount: 0,
      });
    return {
      base: r2(num(rev._sum.credit) - num(rev._sum.debit)),
      output,
      input,
      net: r2(output - input),
      outputLines: o._count,
      inputLines: i._count,
      exceptions,
    };
  }

  /** Make sure a return exists for each branch and each month that has tax activity, through this month. */
  async ensure(rootId: string) {
    const branches = await this.ctx.branches(rootId);
    const maps = await this.ctx.accountMaps(rootId);
    const taxIds = [
      maps.byKey.get('output_tax')!.id,
      maps.byKey.get('input_tax')!.id,
    ];
    const first = await this.prisma.finJournalLine.findFirst({
      where: {
        businessId: rootId,
        accountId: { in: taxIds },
        postedAt: { not: null },
      },
      orderBy: { date: 'asc' },
      select: { date: true },
    });
    const today = dayOf(new Date());
    const start = first ? monthKey(first.date) : monthKey(today);
    const end = monthKey(today);
    const existing = await this.prisma.finTaxReturn.findMany({
      where: { businessId: rootId },
      select: { jurisdiction: true, periodStart: true },
    });
    const have = new Set(
      existing.map(
        (e) => `${e.jurisdiction}|${e.periodStart.toISOString().slice(0, 7)}`,
      ),
    );
    const bizRows = await this.prisma.business.findMany({
      where: { id: { in: branches.map((b) => b.id) } },
      select: {
        id: true,
        name: true,
        taxLabel: true,
        taxRate: true,
        taxFilingDay: true,
      },
    });
    for (const b of bizRows) {
      let { year, month } = start;
      while (year * 12 + month <= end.year * 12 + end.month) {
        const ps = monthStart(year, month);
        const key = `${b.id}|${ps.toISOString().slice(0, 7)}`;
        const used =
          num(b.taxRate) > 0 ||
          (await this.prisma.finJournalLine.count({
            where: {
              businessId: rootId,
              ...(b.id === rootId
                ? { OR: [{ branchId: b.id }, { branchId: null }] }
                : { branchId: b.id }),
              accountId: { in: taxIds },
              postedAt: { not: null },
              date: { gte: ps, lte: monthEnd(year, month) },
            },
          })) > 0;
        if (!have.has(key) && used) {
          const due = new Date(
            Date.UTC(
              month === 12 ? year + 1 : year,
              month === 12 ? 0 : month,
              Math.min(28, b.taxFilingDay || 15),
            ),
          );
          await this.prisma.$transaction(async (tx) => {
            const number = await this.ctx.nextNumber(tx, rootId, 'tax', year);
            await tx.finTaxReturn.create({
              data: {
                businessId: rootId,
                number,
                jurisdiction: b.id,
                periodStart: ps,
                periodEnd: monthEnd(year, month),
                dueOn: due,
                status: 'Open',
              },
            });
          });
          have.add(key);
        }
        month += 1;
        if (month > 12) {
          month = 1;
          year += 1;
        }
      }
    }
  }

  /** Each return with its live figures (or the frozen snapshot once locked/filed). */
  async list(rootId: string) {
    await this.ensure(rootId);
    const rows = await this.prisma.finTaxReturn.findMany({
      where: { businessId: rootId },
      orderBy: [{ periodStart: 'desc' }],
    });
    const biz = await this.prisma.business.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.jurisdiction))] } },
      select: {
        id: true,
        name: true,
        taxLabel: true,
        taxRate: true,
        parentId: true,
      },
    });
    const byId = new Map(biz.map((b) => [b.id, b]));
    const today = dayOf(new Date());
    const out: {
      ret: FinTaxReturn;
      calc: TaxCalc;
      status: string;
      jurisdiction: string;
      taxType: string;
      drift: number;
    }[] = [];
    for (const r of rows) {
      const b = byId.get(r.jurisdiction);
      const live = await this.calc(
        rootId,
        r.jurisdiction,
        r.periodStart,
        r.periodEnd,
      );
      const frozen = ['Locked', 'Filed'].includes(r.status);
      const snap = frozen ? (r.snapshot as unknown as TaxCalc) : null;
      let status = r.status;
      if (
        !frozen &&
        ['Open', 'Calculated', 'Review Required'].includes(r.status)
      )
        status =
          r.periodEnd >= today
            ? 'Open'
            : live.exceptions.length
              ? 'Review Required'
              : 'Calculated';
      out.push({
        ret: r,
        calc: snap ?? live,
        status,
        jurisdiction: b
          ? b.parentId
            ? b.name
            : `${b.name} (primary)`
          : 'Unknown branch',
        taxType: b ? `${b.taxLabel} ${num(b.taxRate)}%` : 'Tax',
        drift: snap ? r2(live.net - snap.net) : 0,
      });
    }
    return out;
  }

  async mustReturn(rootId: string, id: string) {
    const r = await this.prisma.finTaxReturn.findFirst({
      where: { id, businessId: rootId },
    });
    if (!r)
      throw new AppException(
        FIN_ERRORS.NOT_FOUND,
        'Tax return not found',
        HttpStatus.NOT_FOUND,
      );
    return r;
  }

  async submit(actor: FinActor, id: string) {
    this.ctx.need(actor, 'manage', 'Submitting a tax return');
    const r = await this.mustReturn(actor.rootId, id);
    if (['Approval Required', 'Locked', 'Filed'].includes(r.status))
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        `This return is ${r.status}.`,
        HttpStatus.CONFLICT,
      );
    if (r.periodEnd >= dayOf(new Date()))
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        'The period hasn’t ended yet.',
        HttpStatus.CONFLICT,
      );
    const calc = await this.calc(
      actor.rootId,
      r.jurisdiction,
      r.periodStart,
      r.periodEnd,
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.finTaxReturn.update({
        where: { id },
        data: {
          status: 'Approval Required',
          preparedById: actor.userId,
          outputTax: calc.output,
          inputTax: calc.input,
          snapshot: calc as unknown as Prisma.InputJsonValue,
        },
      });
      await this.journals.requestApproval(
        actor.rootId,
        actor,
        {
          subjectType: 'tax',
          subjectId: id,
          title: `Tax return ${r.number} · ${monthLabel(r.periodStart.getUTCFullYear(), r.periodStart.getUTCMonth() + 1)}`,
          amount: calc.net,
          rule: 'Tax return — Owner / Controller approval before it is locked',
          level: 'admin',
        },
        tx,
      );
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'tax.submitted',
      'tax',
      id,
      `Net ${calc.net.toFixed(2)}${calc.exceptions.length ? ` with ${calc.exceptions.length} exception(s) acknowledged` : ''}`,
    );
  }

  async approve(actor: FinActor, id: string) {
    const r = await this.mustReturn(actor.rootId, id);
    if (r.status !== 'Approval Required')
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        'Submit the return first.',
        HttpStatus.CONFLICT,
      );
    const cfg = await this.ctx.config(actor.rootId);
    this.journals.assertCanApprove(
      actor,
      'admin',
      r.preparedById,
      cfg.sod.sod1,
      'Approving a tax return',
    );
    const calc = await this.calc(
      actor.rootId,
      r.jurisdiction,
      r.periodStart,
      r.periodEnd,
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.finTaxReturn.update({
        where: { id },
        data: {
          status: 'Locked',
          approvedById: actor.userId,
          approvedAt: new Date(),
          outputTax: calc.output,
          inputTax: calc.input,
          snapshot: calc as unknown as Prisma.InputJsonValue,
        },
      });
      await this.journals.decide(
        actor.rootId,
        'tax',
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
      'tax.locked',
      'tax',
      id,
      `Calculation locked · net ${calc.net.toFixed(2)}`,
    );
  }

  async reopen(actor: FinActor, id: string, reason: string) {
    this.ctx.need(actor, 'admin', 'Reopening a tax return');
    const r = await this.mustReturn(actor.rootId, id);
    if (!['Approval Required', 'Locked'].includes(r.status))
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        r.status === 'Filed'
          ? 'A filed return can’t be reopened — file an amendment with the authority and record it as a new adjustment.'
          : 'Nothing to reopen.',
        HttpStatus.CONFLICT,
      );
    await this.prisma.finTaxReturn.update({
      where: { id },
      data: {
        status: 'Calculated',
        snapshot: Prisma.DbNull,
        approvedById: null,
        approvedAt: null,
      },
    });
    await this.prisma.finApproval.updateMany({
      where: {
        businessId: actor.rootId,
        subjectType: 'tax',
        subjectId: id,
        status: 'Pending',
      },
      data: { status: 'Cancelled' },
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'tax.reopened',
      'tax',
      id,
      reason,
    );
  }

  /** Filed only with a filing reference; also records it on the branch's Reports › Tax filing history. */
  async filed(
    actor: FinActor,
    id: string,
    dto: {
      filingRef: string;
      filedOn: string;
      attachment?: {
        key: string;
        name: string;
        size: number;
        type: string;
      } | null;
    },
  ) {
    this.ctx.need(actor, 'manage', 'Recording a filing');
    const r = await this.mustReturn(actor.rootId, id);
    if (r.status !== 'Locked')
      throw new AppException(
        FIN_ERRORS.CONFLICT,
        'Lock the calculation (approve the return) before recording the filing.',
        HttpStatus.CONFLICT,
      );
    if (!dto.filingRef?.trim())
      throw new AppException(
        FIN_ERRORS.INVALID,
        'A filing reference or receipt number is required.',
        HttpStatus.BAD_REQUEST,
      );
    const snap = r.snapshot as unknown as TaxCalc;
    const period = r.periodStart.toISOString().slice(0, 7);
    const list = Array.isArray(r.attachments) ? r.attachments : [];
    await this.prisma.$transaction(async (tx) => {
      await tx.finTaxReturn.update({
        where: { id },
        data: {
          status: 'Filed',
          filedAt: dayOf(dto.filedOn),
          filingRef: dto.filingRef.trim().slice(0, 80),
          attachments: dto.attachment
            ? [
                ...list,
                {
                  ...dto.attachment,
                  by: actor.name,
                  at: new Date().toISOString(),
                },
              ]
            : list,
        },
      });
      await tx.taxFiling.upsert({
        where: { businessId_period: { businessId: r.jurisdiction, period } },
        create: {
          businessId: r.jurisdiction,
          period,
          filedOn: dayOf(dto.filedOn),
          reference: dto.filingRef.trim(),
          notes: `Recorded from Finance return ${r.number}`,
          netTaxAtFiling: snap?.net ?? 0,
          filedByUserId: actor.userId,
        },
        update: {
          filedOn: dayOf(dto.filedOn),
          reference: dto.filingRef.trim(),
          netTaxAtFiling: snap?.net ?? 0,
        },
      });
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'tax.filed',
      'tax',
      id,
      `Filed · ref ${dto.filingRef}`,
    );
  }

  async attach(
    actor: FinActor,
    id: string,
    file: { key: string; name: string; size: number; type: string },
  ) {
    const r = await this.mustReturn(actor.rootId, id);
    const list = Array.isArray(r.attachments) ? r.attachments : [];
    await this.prisma.finTaxReturn.update({
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
      'tax.evidence_attached',
      'tax',
      id,
      file.name,
    );
  }
}
