import { HttpStatus, Injectable } from '@nestjs/common';
import { ProcurementRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { FinanceBudgetsService } from '../finance/finance-budgets.service';
import { FinanceContextService } from '../finance/finance-context.service';
import { FinanceLedgerService } from '../finance/finance-ledger.service';
import { PROCUREMENT_ERROR_CODES } from './procurement.service';

const round = (n: number) => Math.round(n * 100) / 100;

/** Request statuses whose budget code is still relevant to spend control. */
const LIVE_STATUSES = [
  ProcurementRequestStatus.draft,
  ProcurementRequestStatus.submitted,
  ProcurementRequestStatus.approved,
  ProcurementRequestStatus.sourcing,
  ProcurementRequestStatus.converted,
];

export interface BudgetLine {
  code: string;
  account: { code: string; name: string } | null;
  budget: number;
  actual: number;
  remaining: number;
}

/**
 * Procurement budget checks read Finance › Budgets. A procurement budget code is a Finance account
 * code: the check uses Finance's own budget-vs-actual (the approved budget version for the fiscal
 * year, else the newest, against posted ledger actuals) for that account, fiscal year to date.
 * Nothing here writes to Finance, and a business with no Finance ledger is never set one up.
 */
@Injectable()
export class ProcurementBudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceContextService,
    private readonly ledger: FinanceLedgerService,
    private readonly budgets: FinanceBudgetsService,
  ) {}

  /** Group root + the branch filter Finance uses (null = whole group). */
  private async scope(businessId: string) {
    const b = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { id: true, parentId: true },
    });
    return { rootId: b.parentId ?? b.id, branchId: b.parentId ? b.id : null };
  }

  /**
   * Budget vs actual per budget code, fiscal year to date as of `asOf`. Returns why it can't when
   * Finance isn't set up or has no budget for the year.
   */
  private async lines(businessId: string, codes: string[], asOf: Date) {
    const { rootId, branchId } = await this.scope(businessId);
    if (
      !(await this.prisma.finSettings.findUnique({
        where: { businessId: rootId },
      }))
    )
      return {
        ok: false as const,
        reason:
          'Finance & Accounting is not set up for this business, so there is no budget to check against.',
      };
    const cfg = await this.finance.config(rootId);
    const from = this.ledger.fyStartFor(cfg, asOf);
    const to = new Date(
      Date.UTC(
        asOf.getUTCFullYear(),
        asOf.getUTCMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      ),
    );
    const range = {
      key: 'procurement-fytd',
      label: 'Fiscal year to date',
      from,
      to,
      prior: { from, to, label: '' },
      fyStart: from,
    };
    const budget = await this.budgets.activeFor(rootId, range);
    if (!budget)
      return {
        ok: false as const,
        reason: 'There is no budget in Finance › Budgets for this fiscal year.',
      };
    const [rows, accounts, currency] = await Promise.all([
      this.budgets.bva(rootId, budget.id, range, branchId),
      this.finance.accounts(rootId),
      this.finance.baseCurrency(rootId),
    ]);
    const lines: BudgetLine[] = [...new Set(codes)].map((code) => {
      const account = accounts.find(
        (a) => a.code === code && !a.isHeader && a.active,
      );
      const row = account
        ? rows.find((r) => r.account.id === account.id)
        : undefined;
      const b = row?.budget ?? 0;
      const actual = row?.actual ?? 0;
      return {
        code,
        account: account ? { code: account.code, name: account.name } : null,
        budget: b,
        actual,
        remaining: round(b - actual),
      };
    });
    return {
      ok: true as const,
      budgetVersion: {
        name: budget.name,
        version: budget.version,
        status: budget.status,
        fiscalYear: budget.fiscalYear,
      },
      period: { from: from.toISOString(), to: to.toISOString() },
      currency,
      lines,
    };
  }

  /** The budget check shown on one purchase request. */
  async forRequest(businessId: string, requestId: string) {
    const request = await this.prisma.procurementRequest.findFirst({
      where: { id: requestId, businessId },
      select: {
        budgetCode: true,
        currency: true,
        createdAt: true,
        submittedAt: true,
        items: { select: { quantity: true, estimatedUnitCost: true } },
      },
    });
    if (!request)
      throw new AppException(
        PROCUREMENT_ERROR_CODES.REQUEST_NOT_FOUND,
        'Purchase request not found.',
        HttpStatus.NOT_FOUND,
      );
    const code = request.budgetCode?.trim();
    if (!code)
      return {
        available: false,
        reason:
          'Add a budget code (a Finance account code) to check this request against Finance › Budgets.',
      };
    const result = await this.lines(
      businessId,
      [code],
      request.submittedAt ?? request.createdAt,
    );
    if (!result.ok) return { available: false, reason: result.reason };
    const line = result.lines[0];
    if (!line.account)
      return {
        available: false,
        reason: `“${code}” is not an active posting account in Finance › Chart of accounts. Use a Finance account code as the budget code.`,
      };
    const estimate = round(
      request.items.reduce(
        (sum, item) =>
          sum + Number(item.quantity) * Number(item.estimatedUnitCost),
        0,
      ),
    );
    const sameCurrency = request.currency === result.currency;
    return {
      available: true,
      budgetVersion: result.budgetVersion,
      period: result.period,
      currency: result.currency,
      ...line,
      estimate,
      estimateCurrency: request.currency,
      /** null when the request is in another currency (no FX conversion is applied here). */
      fits: sameCurrency ? estimate <= line.remaining : null,
    };
  }

  /** Budget codes used on live requests this fiscal year, for the overview and spend control. */
  async summary(businessId: string) {
    const requests = await this.prisma.procurementRequest.findMany({
      where: {
        businessId,
        status: { in: LIVE_STATUSES },
        budgetCode: { not: null },
      },
      select: { budgetCode: true },
    });
    const codes = requests
      .map((r) => r.budgetCode?.trim())
      .filter((c): c is string => Boolean(c));
    if (!codes.length)
      return {
        available: false,
        reason:
          'No open purchase request has a budget code yet. Use a Finance account code as the budget code.',
      };
    const result = await this.lines(businessId, codes, new Date());
    if (!result.ok) return { available: false, reason: result.reason };
    const matched = result.lines.filter((l) => l.account);
    const budget = round(matched.reduce((s, l) => s + l.budget, 0));
    const actual = round(matched.reduce((s, l) => s + l.actual, 0));
    return {
      available: true,
      budgetVersion: result.budgetVersion,
      period: result.period,
      currency: result.currency,
      totals: {
        budget,
        actual,
        remaining: round(budget - actual),
        percentUsed: budget > 0 ? round((actual / budget) * 100) : null,
      },
      lines: result.lines,
      unmatchedCodes: result.lines.filter((l) => !l.account).map((l) => l.code),
    };
  }
}
