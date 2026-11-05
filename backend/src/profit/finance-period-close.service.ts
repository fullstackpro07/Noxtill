import { HttpStatus, Injectable } from '@nestjs/common';
import {
  IntegrationProvider,
  IntegrationStatus,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { BranchScopeService } from '../common/tenancy/branch-scope.service';
import { PrismaService } from '../prisma/prisma.service';

type DecimalTotal = Prisma.Decimal;

function monthRange(month: string): { start: Date; end: Date } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) {
    throw new AppException(
      'FINANCE_PERIOD_INVALID',
      'Choose a valid month in YYYY-MM format.',
      HttpStatus.BAD_REQUEST,
    );
  }
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) {
    throw new AppException(
      'FINANCE_PERIOD_INVALID',
      'Choose a valid month in YYYY-MM format.',
      HttpStatus.BAD_REQUEST,
    );
  }
  return {
    start: new Date(Date.UTC(year, monthNumber - 1, 1)),
    end: new Date(Date.UTC(year, monthNumber, 1)),
  };
}

function total(values: Array<DecimalTotal | null | undefined>): string {
  let sum = new Prisma.Decimal(0);
  for (const value of values) sum = sum.plus(value ?? 0);
  return sum.toFixed(2);
}

/** Read-only month preparation based on canonical Orders, Expenses, Returns, Xero sync records,
 * and the manual Noxtill journal ledger. It is deliberately partial: it cannot claim that a period
 * is reconciled or closed by an accounting authority.
 */
@Injectable()
export class FinancePeriodCloseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
  ) {}

  async readiness(
    businessId: string,
    month: string,
    requestedBranchId?: string,
  ) {
    const range = monthRange(month);
    const businessIds = await this.branchScope.resolveIds(
      businessId,
      requestedBranchId,
    );
    const businesses = await this.prisma.business.findMany({
      where: { id: { in: businessIds } },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, currency: true },
    });
    if (businesses.length !== businessIds.length) {
      throw new AppException(
        'FINANCE_PERIOD_SCOPE_UNAVAILABLE',
        'The selected business scope is not available for this review.',
        HttpStatus.NOT_FOUND,
      );
    }

    const [
      orders,
      expenses,
      returns,
      integrations,
      journalEntries,
      lockedPeriods,
      statementImports,
      statementLines,
    ] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          businessId: { in: businessIds },
          createdAt: { gte: range.start, lt: range.end },
          isQuotation: false,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          businessId: true,
          status: true,
          total: true,
          accountingSyncedAt: true,
        },
      }),
      this.prisma.expense.findMany({
        where: {
          businessId: { in: businessIds },
          incurredOn: { gte: range.start, lt: range.end },
        },
        orderBy: [{ incurredOn: 'asc' }, { id: 'asc' }],
        select: { id: true, businessId: true, amount: true, receiptKey: true },
      }),
      this.prisma.return.findMany({
        where: {
          businessId: { in: businessIds },
          createdAt: { gte: range.start, lt: range.end },
          status: 'pending',
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, businessId: true, refundAmount: true },
      }),
      this.prisma.integration.findMany({
        where: {
          businessId: { in: businessIds },
          provider: IntegrationProvider.xero,
        },
        select: { businessId: true, status: true, lastSyncAt: true },
      }),
      this.prisma.financeJournalEntry.findMany({
        where: {
          businessId: { in: businessIds },
          entryDate: { gte: range.start, lt: range.end },
        },
        orderBy: [{ entryDate: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          businessId: true,
          status: true,
          totalDebits: true,
          totalCredits: true,
          lines: { select: { debit: true, credit: true } },
        },
      }),
      this.prisma.financeAccountingPeriod.findMany({
        where: {
          businessId: { in: businessIds },
          monthStart: range.start,
          status: 'closed',
        },
        orderBy: [{ businessId: 'asc' }, { id: 'asc' }],
        select: {
          businessId: true,
          closeReason: true,
          closedAt: true,
        },
      }),
      this.prisma.financeBankStatementImport.groupBy({
        by: ['businessId'],
        where: {
          businessId: { in: businessIds },
          periodStart: { lt: range.end },
          periodEnd: { gte: range.start },
        },
        _count: { _all: true },
      }),
      this.prisma.financeBankStatementLine.groupBy({
        by: ['businessId', 'status'],
        where: {
          businessId: { in: businessIds },
          statementDate: { gte: range.start, lt: range.end },
        },
        _count: { _all: true },
      }),
    ]);

    const integrationByBusiness = new Map(
      integrations.map((row) => [row.businessId, row]),
    );
    const periodLockByBusiness = new Map(
      lockedPeriods.map((row) => [row.businessId, row]),
    );
    const statementImportCountByBusiness = new Map(
      statementImports.map((row) => [row.businessId, row._count._all]),
    );
    const statementLinesByBusiness = new Map<
      string,
      {
        lineCount: number;
        matchedCount: number;
        unmatchedCount: number;
        noMatchCount: number;
        otherCount: number;
      }
    >();
    for (const row of statementLines) {
      const summary = statementLinesByBusiness.get(row.businessId) ?? {
        lineCount: 0,
        matchedCount: 0,
        unmatchedCount: 0,
        noMatchCount: 0,
        otherCount: 0,
      };
      const count = row._count._all;
      summary.lineCount += count;
      if (row.status === 'matched') summary.matchedCount += count;
      else if (row.status === 'unmatched') summary.unmatchedCount += count;
      else if (row.status === 'no_match') summary.noMatchCount += count;
      else summary.otherCount += count;
      statementLinesByBusiness.set(row.businessId, summary);
    }
    return {
      month,
      generatedAt: new Date().toISOString(),
      scope: 'businesses kept separate; no cross-currency totals',
      coverage: 'partial' as const,
      businesses: businesses.map((business) => {
        const businessOrders = orders.filter(
          (row) => row.businessId === business.id,
        );
        const businessExpenses = expenses.filter(
          (row) => row.businessId === business.id,
        );
        const businessReturns = returns.filter(
          (row) => row.businessId === business.id,
        );
        const businessJournals = journalEntries.filter(
          (row) => row.businessId === business.id,
        );
        const postedJournals = businessJournals.filter(
          (row) => row.status === 'posted',
        );
        const balancedPostedJournals = postedJournals.filter((entry) => {
          const lineDebits = total(entry.lines.map((line) => line.debit));
          const lineCredits = total(entry.lines.map((line) => line.credit));
          return (
            new Prisma.Decimal(lineDebits).equals(entry.totalDebits) &&
            new Prisma.Decimal(lineCredits).equals(entry.totalCredits) &&
            new Prisma.Decimal(entry.totalDebits).equals(entry.totalCredits)
          );
        });
        const unresolvedJournals = businessJournals.filter((row) =>
          ['draft', 'pending_approval', 'approved'].includes(row.status),
        );
        const xero = integrationByBusiness.get(business.id);
        const periodLock = periodLockByBusiness.get(business.id);
        const statementLineSummary = statementLinesByBusiness.get(
          business.id,
        ) ?? {
          lineCount: 0,
          matchedCount: 0,
          unmatchedCount: 0,
          noMatchCount: 0,
          otherCount: 0,
        };
        const xeroConnected = xero?.status === IntegrationStatus.connected;
        const completedOrders = businessOrders.filter(
          (row) => row.status === OrderStatus.completed,
        );
        const openOrders = businessOrders.filter(
          (row) =>
            row.status !== OrderStatus.completed &&
            row.status !== OrderStatus.cancelled,
        );
        const withoutReceipt = businessExpenses.filter(
          (row) => !row.receiptKey,
        );
        const unsyncedOrders = xeroConnected
          ? businessOrders.filter(
              (row) =>
                row.status !== OrderStatus.cancelled &&
                row.accountingSyncedAt === null,
            )
          : null;
        return {
          businessId: business.id,
          businessName: business.name,
          currency: business.currency,
          sales: {
            orderCount: businessOrders.length,
            completedOrderCount: completedOrders.length,
            completedOrderTotal: total(completedOrders.map((row) => row.total)),
            openOrderCount: openOrders.length,
            cancelledOrderCount: businessOrders.filter(
              (row) => row.status === OrderStatus.cancelled,
            ).length,
            source:
              'completed, non-quotation Order rows; order totals are sales values, not cash settlement',
          },
          expenses: {
            count: businessExpenses.length,
            recordedTotal: total(businessExpenses.map((row) => row.amount)),
            withoutAttachedReceiptCount: withoutReceipt.length,
            withoutAttachedReceiptTotal: total(
              withoutReceipt.map((row) => row.amount),
            ),
            source:
              'Expense rows by incurred date; no attached receipt is evidence status, not proof an expense is invalid',
          },
          pendingReturns: {
            count: businessReturns.length,
            refundAmount: total(businessReturns.map((row) => row.refundAmount)),
            source: 'pending Return rows created during the selected month',
          },
          xeroSync: {
            status: xeroConnected
              ? ('connected' as const)
              : ('not_connected' as const),
            lastSyncAt: xero?.lastSyncAt?.toISOString() ?? null,
            unsyncedOrderCount: unsyncedOrders?.length ?? null,
            source: xeroConnected ? 'Order.accountingSyncedAt' : null,
          },
          manualJournals: {
            postedCount: postedJournals.length,
            balancedPostedCount: balancedPostedJournals.length,
            unbalancedPostedCount:
              postedJournals.length - balancedPostedJournals.length,
            unresolvedCount: unresolvedJournals.length,
            postingLocked: Boolean(periodLock),
            lockReason: periodLock?.closeReason ?? null,
            lockedAt: periodLock?.closedAt?.toISOString() ?? null,
            source:
              'Noxtill manual journal entries and stored journal lines for the selected business and month; excludes external accounting ledgers and automatic postings',
          },
          statementReview: {
            importCount: statementImportCountByBusiness.get(business.id) ?? 0,
            ...statementLineSummary,
            source:
              'Imported FinanceBankStatementLine rows dated in the selected month; matched means a human accepted a suggested Noxtill manual-journal match',
          },
        };
      }),
      unavailable: [
        {
          key: 'bank_reconciliation',
          label: 'Native bank feeds and complete bank reconciliation',
          status: 'not_available' as const,
        },
        {
          key: 'certified_close',
          label: 'Bank reconciliation and an authoritative accounting close',
          status: 'not_available' as const,
        },
      ],
      note: 'This is a source-record preparation checklist with Noxtill manual-journal checks and a Noxtill-only posting lock. It does not reconcile bank activity or certify an accounting close.',
    };
  }
}
