import { HttpStatus, Injectable } from '@nestjs/common';
import { BranchScopeService } from '../common/tenancy/branch-scope.service';
import { AppException } from '../common/filters/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { CASH_FORECAST_HISTORY_WINDOW_DAYS } from './cash-forecast.constants';
import {
  OrderStatus,
  RecurringObligation,
  RecurringObligationFrequency,
} from '@prisma/client';

export interface CashForecastDay {
  date: string;
  inflow: number;
  outflow: number;
  obligationsDue: number;
  netFlow: number;
  cumulativeNet: number;
}

export interface CashForecastResult {
  days: number;
  dailyAvgRevenue: number;
  dailyAvgExpense: number;
  projection: CashForecastDay[];
  /** Dates where the real cumulative projected net flow first turns negative — an actionable signal. */
  shortfallDates: string[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function advance(date: Date, frequency: RecurringObligationFrequency): Date {
  const next = new Date(date);
  switch (frequency) {
    case RecurringObligationFrequency.weekly:
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case RecurringObligationFrequency.biweekly:
      next.setUTCDate(next.getUTCDate() + 14);
      break;
    case RecurringObligationFrequency.monthly:
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
    case RecurringObligationFrequency.quarterly:
      next.setUTCMonth(next.getUTCMonth() + 3);
      break;
    case RecurringObligationFrequency.yearly:
      next.setUTCFullYear(next.getUTCFullYear() + 1);
      break;
  }
  return next;
}

/** Every real occurrence of a recurring obligation within `[rangeStart, rangeEnd)` — a pure projection, never mutates the stored `nextDueDate`. */
function occurrencesInRange(
  start: Date,
  frequency: RecurringObligationFrequency,
  rangeStart: Date,
  rangeEnd: Date,
): Date[] {
  const occurrences: Date[] = [];
  let cursor = new Date(start);
  let guard = 0;
  while (cursor < rangeStart && guard++ < 1000)
    cursor = advance(cursor, frequency);
  while (cursor < rangeEnd && guard++ < 1000) {
    occurrences.push(new Date(cursor));
    cursor = advance(cursor, frequency);
  }
  return occurrences;
}

/**
 * Cash Flow forecasting (UPD-BE-078) — a relative day-by-day net-flow projection, not an absolute
 * bank balance (this app has no bank-account integration): inflow/outflow are smoothed real
 * trailing-30-day averages (revenue, expenses), with real `RecurringObligation` occurrences added
 * as discrete spikes on the exact days they fall due. `cumulativeNet` starts at 0 and accumulates
 * `netFlow` day over day. Branch scopes are validated against the caller's business group and
 * cannot mix currencies.
 */
@Injectable()
export class CashForecastService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
  ) {}

  async forecast(
    businessId: string,
    days: number,
    requestedBranchId?: string,
  ): Promise<CashForecastResult> {
    const businessIds = await this.branchScope.resolveIds(
      businessId,
      requestedBranchId,
    );
    const scopedBusinesses = await this.prisma.business.findMany({
      where: { id: { in: businessIds } },
      select: { id: true, currency: true },
    });
    if (scopedBusinesses.length !== businessIds.length) {
      throw new AppException(
        'CASH_FORECAST_SCOPE_UNAVAILABLE',
        'The selected business scope is not available for this forecast.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (
      new Set(scopedBusinesses.map((business) => business.currency)).size > 1
    ) {
      throw new AppException(
        'CASH_FORECAST_CURRENCY_SCOPE_UNSUPPORTED',
        'A cash-flow forecast cannot combine branches with different currencies. Select one branch at a time.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const today = new Date(
      new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z',
    );
    const historyCutoff = new Date(
      today.getTime() - CASH_FORECAST_HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    const [revenueAgg, expenseAgg, obligations] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          businessId: { in: businessIds },
          status: OrderStatus.completed,
          isQuotation: false,
          createdAt: { gte: historyCutoff },
        },
        _sum: { total: true },
      }),
      this.prisma.expense.aggregate({
        where: {
          businessId: { in: businessIds },
          incurredOn: { gte: historyCutoff },
        },
        _sum: { amount: true },
      }),
      this.prisma.recurringObligation.findMany({
        where: { businessId: { in: businessIds }, active: true },
      }),
    ]);

    const dailyAvgRevenue = round2(
      Number(revenueAgg._sum.total ?? 0) / CASH_FORECAST_HISTORY_WINDOW_DAYS,
    );
    const dailyAvgExpense = round2(
      Number(expenseAgg._sum.amount ?? 0) / CASH_FORECAST_HISTORY_WINDOW_DAYS,
    );

    const rangeEnd = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);
    const obligationsDueByDate = this.obligationsDueByDate(
      obligations,
      today,
      rangeEnd,
    );

    const projection: CashForecastDay[] = [];
    const shortfallDates: string[] = [];
    let cumulativeNet = 0;

    for (let i = 0; i < days; i++) {
      const date = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
      const key = dateKey(date);
      const obligationsDue = round2(obligationsDueByDate.get(key) ?? 0);
      const outflow = round2(dailyAvgExpense + obligationsDue);
      const netFlow = round2(dailyAvgRevenue - outflow);
      cumulativeNet = round2(cumulativeNet + netFlow);
      if (cumulativeNet < 0) shortfallDates.push(key);

      projection.push({
        date: key,
        inflow: dailyAvgRevenue,
        outflow,
        obligationsDue,
        netFlow,
        cumulativeNet,
      });
    }

    return {
      days,
      dailyAvgRevenue,
      dailyAvgExpense,
      projection,
      shortfallDates,
    };
  }

  private obligationsDueByDate(
    obligations: RecurringObligation[],
    rangeStart: Date,
    rangeEnd: Date,
  ): Map<string, number> {
    const byDate = new Map<string, number>();
    for (const obligation of obligations) {
      const occurrences = occurrencesInRange(
        new Date(obligation.nextDueDate),
        obligation.frequency,
        rangeStart,
        rangeEnd,
      );
      for (const occurrence of occurrences) {
        const key = dateKey(occurrence);
        byDate.set(key, (byDate.get(key) ?? 0) + Number(obligation.amount));
      }
    }
    return byDate;
  }
}
