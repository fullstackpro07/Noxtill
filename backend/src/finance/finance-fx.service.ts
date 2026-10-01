import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import {
  FinActor,
  FinanceContextService,
  dayOf,
  monthEnd,
  monthLabel,
  num,
  r2,
  ymd,
} from './finance-context.service';
import { FinancePostingService, LineInput } from './finance-posting.service';
import { FIN_ERRORS } from './finance.constants';

/**
 * Exchange rates (maintained by hand — Noxtill has no rate feed) and month-end revaluation of
 * foreign-currency monetary balances (bank, receivables, payables) to the closing rate.
 */
@Injectable()
export class FinanceFxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: FinanceContextService,
    private readonly posting: FinancePostingService,
  ) {}

  async rates(rootId: string) {
    return this.prisma.finExchangeRate.findMany({
      where: { businessId: rootId },
      orderBy: [{ currency: 'asc' }, { effectiveOn: 'desc' }],
    });
  }

  /** Currencies the ledger needs a rate for: branch currencies and foreign bank accounts. */
  async needed(rootId: string) {
    const base = await this.ctx.baseCurrency(rootId);
    const set = new Set<string>();
    for (const b of await this.ctx.branches(rootId))
      if (b.currency !== base) set.add(b.currency);
    for (const a of await this.prisma.finBankAccount.findMany({
      where: { businessId: rootId },
    }))
      if (a.currency !== base) set.add(a.currency);
    return [...set];
  }

  async setRate(
    actor: FinActor,
    dto: { currency: string; rate: number; effectiveOn: string; note?: string },
  ) {
    this.ctx.need(actor, 'admin', 'Setting an exchange rate');
    const currency = dto.currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency))
      throw new AppException(
        FIN_ERRORS.INVALID,
        'Use a 3-letter currency code.',
        HttpStatus.BAD_REQUEST,
      );
    if (currency === (await this.ctx.baseCurrency(actor.rootId)))
      throw new AppException(
        FIN_ERRORS.INVALID,
        'That is the base currency.',
        HttpStatus.BAD_REQUEST,
      );
    if (!(dto.rate > 0))
      throw new AppException(
        FIN_ERRORS.INVALID,
        'Rate must be positive.',
        HttpStatus.BAD_REQUEST,
      );
    const effectiveOn = dayOf(dto.effectiveOn);
    const row = await this.prisma.finExchangeRate.upsert({
      where: {
        businessId_currency_effectiveOn: {
          businessId: actor.rootId,
          currency,
          effectiveOn,
        },
      },
      create: {
        businessId: actor.rootId,
        currency,
        rate: dto.rate,
        effectiveOn,
        note: dto.note?.slice(0, 200) ?? null,
        createdById: actor.userId,
      },
      update: {
        rate: dto.rate,
        note: dto.note?.slice(0, 200) ?? null,
        createdById: actor.userId,
      },
    });
    await this.ctx.audit(
      actor.rootId,
      actor,
      'fx.rate_set',
      'fx',
      row.id,
      `1 ${currency} = ${dto.rate} from ${ymd(effectiveOn)}`,
    );
    return row;
  }

  /** What revaluing to the closing rate would post, per account and currency. */
  async preview(rootId: string, year: number, month: number) {
    const asAt = monthEnd(year, month);
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const base = await this.ctx.baseCurrency(rootId);
    const maps = await this.ctx.accountMaps(rootId);
    const rows = await this.prisma.finJournalLine.groupBy({
      by: ['accountId', 'currency'],
      where: {
        businessId: rootId,
        postedAt: { not: null },
        date: { lte: asAt },
        currency: { not: base },
        accountId: { not: null },
      },
      _sum: { txnDebit: true, txnCredit: true, debit: true, credit: true },
    });
    const out: {
      accountId: string;
      code: string;
      name: string;
      currency: string;
      txn: number;
      booked: number;
      rate: number | null;
      target: number | null;
      diff: number;
    }[] = [];
    for (const r of rows) {
      const a = maps.byId.get(r.accountId!);
      // Monetary items only: cash/bank, receivables, payables, clearing, deposits.
      if (
        !a ||
        !['asset', 'liability'].includes(a.type) ||
        ['inventory', 'fa'].includes(a.control ?? '') ||
        ['prepaid', 'inventory_transit'].includes(a.systemKey ?? '')
      )
        continue;
      // Revaluation lines are base-only; include them in "booked" via the base sums below.
      const txn = r2(num(r._sum.txnDebit) - num(r._sum.txnCredit));
      const rate = await this.ctx.rateOn(rootId, r.currency, asAt, base);
      const target = rate == null ? null : r2(txn * rate);
      out.push({
        accountId: a.id,
        code: a.code,
        name: a.name,
        currency: r.currency,
        txn,
        booked: 0,
        rate,
        target,
        diff: 0,
      });
    }
    // Booked base per account includes earlier base-only revaluation lines (posted in base currency).
    for (const o of out) {
      const all = await this.prisma.finJournalLine.aggregate({
        where: {
          businessId: rootId,
          postedAt: { not: null },
          date: { lte: asAt },
          accountId: o.accountId,
          OR: [
            { currency: o.currency },
            {
              journal: {
                sourceType: 'fx',
                sourceEvent: o.currency,
                superseded: false,
                sourceId: { not: key },
              },
            },
          ],
        },
        _sum: { debit: true, credit: true },
      });
      o.booked = r2(num(all._sum.debit) - num(all._sum.credit));
      o.diff = o.target == null ? 0 : r2(o.target - o.booked);
    }
    return {
      asAt,
      rows: out,
      missing: out.filter((o) => o.rate == null).map((o) => o.currency),
    };
  }

  async revalue(
    actor: FinActor | null,
    rootId: string,
    year: number,
    month: number,
  ) {
    if (actor) this.ctx.need(actor, 'manage', 'Running FX revaluation');
    const pv = await this.preview(rootId, year, month);
    if (pv.missing.length)
      throw new AppException(
        FIN_ERRORS.FX_MISSING,
        `Add a closing rate for ${[...new Set(pv.missing)].join(', ')} on or before ${ymd(pv.asAt)}.`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    const maps = await this.ctx.accountMaps(rootId);
    const fx = maps.byKey.get('fx')!;
    const byCur = new Map<string, LineInput[]>();
    for (const r of pv.rows) {
      if (!r.diff) continue;
      const lines = byCur.get(r.currency) ?? [];
      lines.push(
        r.diff > 0
          ? {
              accountId: r.accountId,
              debit: 0,
              credit: 0,
              baseDebit: r.diff,
              description: `Revalue ${r.currency} ${r.txn.toFixed(2)} @ ${r.rate}`,
            }
          : {
              accountId: r.accountId,
              debit: 0,
              credit: 0,
              baseCredit: -r.diff,
              description: `Revalue ${r.currency} ${r.txn.toFixed(2)} @ ${r.rate}`,
            },
      );
      lines.push(
        r.diff > 0
          ? {
              accountId: fx.id,
              debit: 0,
              credit: 0,
              baseCredit: r.diff,
              description: `Unrealized FX gain · ${r.code}`,
            }
          : {
              accountId: fx.id,
              debit: 0,
              credit: 0,
              baseDebit: -r.diff,
              description: `Unrealized FX loss · ${r.code}`,
            },
      );
      byCur.set(r.currency, lines);
    }
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const base = await this.ctx.baseCurrency(rootId);
    let posted = 0;
    for (const [cur, lines] of byCur) {
      await this.posting.postSystem(
        rootId,
        {
          type: 'fx',
          id: key,
          event: cur,
          hash: lines
            .map((l) => `${l.baseDebit ?? 0}/${l.baseCredit ?? 0}`)
            .join(','),
          label: `FX revaluation ${cur} · ${monthLabel(year, month)}`,
        },
        {
          date: pv.asAt,
          currency: base,
          fxRate: 1,
          branchId: null,
          memo: `Month-end revaluation of ${cur} balances to the closing rate`,
          reference: `FXR-${key}-${cur}`,
          lines,
        },
      );
      posted += 1;
    }
    await this.ctx.audit(
      rootId,
      actor,
      'fx.revalued',
      'fx',
      key,
      posted
        ? `${posted} currenc${posted === 1 ? 'y' : 'ies'} revalued`
        : 'No foreign-currency differences',
    );
    return { posted, rows: pv.rows };
  }

  async revalued(rootId: string, year: number, month: number) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    return this.prisma.finJournal.count({
      where: {
        businessId: rootId,
        sourceType: 'fx',
        sourceId: key,
        superseded: false,
        status: 'Posted',
      },
    });
  }
}
