import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AiInfraService } from '../ai/ai-infra.service';
import { describeAiSummaryProviderFailure } from '../ai/ai-provider-error.util';
import { AppException } from '../common/filters/app.exception';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';
import {
  SpecialistAgentToolGatewayService,
  type RegisteredSpecialistAgentTool,
} from '../common/agents/specialist-agent-tool-gateway.service';
import {
  recordSpecialistAgentRunCreatedEvent,
  recordSpecialistAgentRunTerminalEvent,
} from '../common/agents/specialist-agent-run-events.util';
import {
  SPECIALIST_AGENT_UNTRUSTED_DATA_POLICY,
  specialistAgentUntrustedData,
} from '../common/agents/specialist-agent-prompt.util';
import { BranchScopeService } from '../common/tenancy/branch-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { CashForecastService } from './cash-forecast.service';
import { PNL_PERIODS, PnlPeriod } from './dto/query-pnl.dto';
import { ProfitService } from './profit.service';
import { CreditService } from '../credit/credit.service';
import {
  XeroOpenItemsReview,
  XeroOpenItemsService,
} from '../integrations/accounting/xero-open-items.service';
import {
  XeroBankTransactionStatusReview,
  XeroBankTransactionStatusService,
} from '../integrations/accounting/xero-bank-transaction-status.service';
import { findPotentialExpenseDuplicateGroups } from '../expenses/expense-duplicate-candidates.util';
import { FinancePeriodCloseService } from './finance-period-close.service';
import { FinanceJournalsService } from './finance-journals.service';
import {
  createOrReuseSpecialistAgentRun,
  SPECIALIST_AGENT_RUN_DETAILS_INCLUDE,
} from '../common/agents/specialist-agent-run-idempotency.util';
import { ensureSpecialistAgentConfigVersion } from '../common/agents/specialist-agent-config.util';
import {
  createSpecialistAgentParentRunRef,
  type SpecialistAgentRunOptions,
} from '../common/agents/specialist-agent-run-options';

const AGENT_KEY = 'financial_intelligence';
const AGENT_VERSION = '1.0.0';
const DAY_MS = 86_400_000;
const FINANCE_PROFIT_ANALYTICS_TOOL = 'get_profit_analytics_statement';
const FINANCE_AGENT_TOOLS: readonly RegisteredSpecialistAgentTool[] = [
  {
    key: FINANCE_PROFIT_ANALYTICS_TOOL,
    label: 'Get Profit Analytics statement',
    description:
      'Read the canonical Profit Analytics statement for a month, period and validated business scope.',
    inputs: ['month', 'period', 'branchId'],
    requiredInputs: ['month', 'period'],
    riskClass: 'READ_ONLY',
    executable: true,
    exposedToReadOnlyAssistant: true,
    maxOutputBytes: 1_048_576,
    screen: '/profit',
  },
];

type AiSummary = {
  status: 'ready' | 'not_configured' | 'blocked' | 'unavailable';
  text: string | null;
  message: string | null;
  inputTokens: number;
  outputTokens: number;
};

type ExpenseDuplicateReview = {
  calendarMonth: string;
  candidateGroups: number;
  additionalEntries: number;
  additionalEntryAmount: string;
  scopeBusinessCount: number;
};

type ExpenseCategoryVariance = {
  source: 'Expense';
  currentMonth: string;
  priorMonth: string;
  scopeBusinessCount: number;
  categoryCount: number;
  omittedCategoryCount: number;
  categories: {
    businessName: string;
    category: string;
    currentAmount: string;
    priorAmount: string;
    difference: string;
  }[];
  calculation: string;
};

type ExpenseAnomalyReview = {
  status: 'available' | 'insufficient_history';
  source: 'Expense';
  selectedMonth: string;
  observedThrough: string | null;
  baselineMonths: string[];
  scopedBusinessCount: number;
  eligibleCategoryCount: number;
  insufficientHistoryCategoryCount: number;
  candidateCount: number;
  omittedCandidateCount: number;
  method: 'median_plus_three_median_absolute_deviations';
  candidates: {
    businessName: string;
    category: string;
    currentAmount: string;
    baselineMedian: string;
    medianAbsoluteDeviation: string;
    reviewThreshold: string;
    amountAboveThreshold: string;
    observedBaselineMonths: number;
  }[];
  calculation: string;
};

type ExpenseDailyCategoryTotal = {
  businessId: string;
  category: string;
  incurredOn: Date;
  _sum: { amount: Prisma.Decimal | null };
};

type CashFlowReview = {
  status: 'available' | 'unavailable';
  source: 'CashForecastService.forecast' | null;
  basis: 'relative_net_flow_not_bank_balance' | null;
  days: number | null;
  averageDailyRevenue: number | null;
  averageDailyExpense: number | null;
  endingRelativeNetFlow: number | null;
  scheduledObligationsTotal: number | null;
  negativeRelativeNetFlowDays: number | null;
  unavailableReason: string | null;
};

type CreditAgingReview = {
  status: 'available' | 'unavailable';
  source: 'CreditService.financialAgingSummary' | null;
  basis: string | null;
  observedAt: string | null;
  debtorCount: number | null;
  totalBalance: string | null;
  buckets: {
    key: string;
    minDays: number;
    maxDays: number | null;
    debtorCount: number;
    balance: string;
  }[];
  unavailableReason: string | null;
};

type ApprovedReturnReview = {
  status: 'available';
  source: 'Return';
  calendarMonth: string;
  scopeBusinessCount: number;
  approvedCount: number;
  refundAmountTotal: string;
  byMethod: { method: string; count: number; amount: string }[];
  calculation: string;
};

type FinanceBudgetActualReview = {
  status: 'available' | 'no_approved_budgets';
  source: 'FinanceBudget + Expense';
  month: string;
  scopeBusinessCount: number;
  calculation: string;
  lines: {
    businessName: string;
    category: string;
    status: 'approved' | 'not_budgeted';
    approvedAmount: string | null;
    actualAmount: string;
    variance: string | null;
    budgetVersion: number | null;
  }[];
};

type FinanceBudgetActualAiSummary = {
  status: FinanceBudgetActualReview['status'];
  month: string;
  scopeBusinessCount: number;
  currency: string;
  approvedBudgetCategoryCount: number;
  approvedBudgetTotal: string;
  actualForApprovedBudgetCategories: string;
  varianceForApprovedBudgetCategories: string;
  notBudgetedCategoryCount: number;
  actualForNotBudgetedCategories: string;
  calculation: string;
};

type VarianceMetric = { current: number; prior: number; delta: number };

type PeriodVariance = {
  status: 'available' | 'unavailable';
  source: 'ProfitService.pnl.trend' | null;
  currentMonth: string | null;
  priorMonth: string | null;
  metrics: {
    revenue: VarianceMetric | null;
    cogs: VarianceMetric | null;
    expensesAndWastage: VarianceMetric | null;
    netProfit: VarianceMetric | null;
  };
  calculation: string | null;
  unavailableReason: string | null;
};

function previousCalendarMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const previous = new Date(Date.UTC(year, monthNumber - 2, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`;
}

function varianceMetric(current: number, prior: number): VarianceMetric {
  return { current, prior, delta: Math.round((current - prior) * 100) / 100 };
}

function medianDecimal(values: Prisma.Decimal[]): Prisma.Decimal {
  const sorted = [...values].sort((left, right) => left.comparedTo(right));
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return sorted[middle - 1].plus(sorted[middle]).div(2);
}

function utcMonth(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthBounds(month: string): { start: Date; end: Date } {
  const [year, monthNumber] = month.split('-').map(Number);
  return {
    start: new Date(Date.UTC(year, monthNumber - 1, 1)),
    end: new Date(Date.UTC(year, monthNumber, 1)),
  };
}

function previousMonth(month: string, offset: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return utcMonth(new Date(Date.UTC(year, monthNumber - 1 - offset, 1)));
}

@Injectable()
export class FinancialIntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profit: ProfitService,
    private readonly branchScope: BranchScopeService,
    private readonly cashForecast: CashForecastService,
    private readonly aiInfra: AiInfraService,
    private readonly agentPolicy: SpecialistAgentPolicyService,
    private readonly credit: CreditService,
    private readonly xeroOpenItems: XeroOpenItemsService,
    private readonly xeroBankTransactionStatus: XeroBankTransactionStatusService,
    private readonly periodClose: FinancePeriodCloseService,
    private readonly financeJournals: FinanceJournalsService,
    private readonly toolGateway: SpecialistAgentToolGatewayService,
  ) {
    this.toolGateway.registerAgentTools(
      AGENT_KEY,
      '30',
      FINANCE_AGENT_TOOLS,
      async (context, tool, toolInput) => {
        if (tool.key !== FINANCE_PROFIT_ANALYTICS_TOOL) {
          throw new AppException(
            'FINANCE_AGENT_TOOL_NOT_SUPPORTED',
            'This Finance tool is not supported by the canonical service.',
            HttpStatus.NOT_IMPLEMENTED,
          );
        }
        const { month, period, branchId } = toolInput;
        if (
          !/^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? '') ||
          !(PNL_PERIODS as readonly string[]).includes(period ?? '') ||
          (branchId !== undefined && !branchId.trim())
        ) {
          throw new AppException(
            'FINANCE_AGENT_TOOL_INPUT_INVALID',
            'The Profit Analytics tool requires a valid month, period and optional branch scope.',
            HttpStatus.BAD_REQUEST,
          );
        }
        const statement = await this.profit.pnl(
          context.businessId,
          month,
          period as PnlPeriod,
          branchId,
        );
        return {
          output: statement,
          status: 'succeeded',
          summary: 'Read the canonical Profit Analytics statement.',
          outputResourceType: 'ProfitAnalyticsStatement',
          outputResourceId: context.businessId,
        };
      },
    );
  }

  listRuns(businessId: string) {
    return this.prisma.specialistAgentRun.findMany({
      where: { businessId, agentKey: AGENT_KEY },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 10,
      include: {
        recommendations: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: {
            evidence: { orderBy: [{ fetchedAt: 'asc' }, { id: 'asc' }] },
          },
        },
        aiCallLogs: {
          select: {
            id: true,
            kind: true,
            inputTokens: true,
            outputTokens: true,
            estimatedCostUsd: true,
            createdAt: true,
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
  }

  /** Reads the optional Xero source without creating an agent run or invoking an AI provider. */
  async previewXeroOpenItems(businessId: string, branchId?: string) {
    const scopeBusinessIds = await this.branchScope.resolveIds(
      businessId,
      branchId,
    );
    return this.reviewXeroOpenItems(businessId, scopeBusinessIds);
  }

  /** Reads Xero's recorded reconciliation flags only; it does not match bank statements to Noxtill. */
  async previewXeroBankTransactionStatus(businessId: string, branchId?: string) {
    const scopeBusinessIds = await this.branchScope.resolveIds(
      businessId,
      branchId,
    );
    return this.reviewXeroBankTransactionStatus(businessId, scopeBusinessIds);
  }

  async run(
    businessId: string,
    actorUserId: string | null,
    input: { month: string; period?: PnlPeriod; branchId?: string },
    idempotencyKey?: string,
    options: SpecialistAgentRunOptions = {},
  ) {
    await this.agentPolicy.assertEnabled(businessId, 'finance');
    const period = input.period ?? 'month';
    const scopeBusinessIds = await this.branchScope.resolveIds(
      businessId,
      input.branchId,
    );
    const scopedBusinesses = await this.prisma.business.findMany({
      where: { id: { in: scopeBusinessIds } },
      orderBy: { id: 'asc' },
      select: { id: true, name: true, currency: true },
    });
    const scopeCurrencies = new Set(
      scopedBusinesses.map((business) => business.currency),
    );
    if (scopeCurrencies.size > 1) {
      throw new AppException(
        'FINANCE_AGENT_CURRENCY_SCOPE_UNSUPPORTED',
        'This branch group uses multiple currencies and no conversion source is configured. Run the review for one branch at a time.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    let currency = scopedBusinesses.find(
      (business) => business.id === businessId,
    )?.currency;
    if (!currency && scopedBusinesses.length > 0) {
      currency = scopedBusinesses[0].currency;
    }
    if (!currency) {
      const business = await this.prisma.business.findUniqueOrThrow({
        where: { id: businessId },
        select: { currency: true },
      });
      currency = business.currency;
    }
    const startedAt = new Date();
    const runData: Prisma.SpecialistAgentRunUncheckedCreateInput = {
      businessId,
      agentKey: AGENT_KEY,
      agentVersion: AGENT_VERSION,
      moduleId: '30',
      triggerType: options.triggerType ?? 'manual',
      status: 'running',
      initiatedByUserId: actorUserId,
      inputRefs: [
        ...(options.parentRunId
          ? [createSpecialistAgentParentRunRef(options.parentRunId)]
          : []),
        ...(options.triggerRef
          ? [
              {
                source: options.triggerRef.sourceModule,
                scope: 'current_business',
                eventId: options.triggerRef.eventId,
                entityType: options.triggerRef.entityType,
                entityId: options.triggerRef.entityId,
                occurredAt: options.triggerRef.occurredAt,
                entityVersion: options.triggerRef.entityVersion,
                schemaVersion: options.triggerRef.schemaVersion,
                correlationId: options.triggerRef.correlationId,
              },
            ]
          : []),
        {
          source: 'ProfitService.pnl',
          comparisonSource: 'ProfitService.pnl.trend',
          additionalSource: 'Expense.exactMatchCandidates',
          expenseCategorySource: 'Expense.category-month-comparison',
          budgetActualSource:
            'FinanceBudget + Expense approved monthly comparison',
          period,
          month: input.month,
          scopeBusinessCount: scopeBusinessIds.length,
          scopeBusinessIds,
          selectedBranchBusinessId:
            input.branchId && input.branchId !== 'all' ? input.branchId : null,
        },
      ],
      policyResult: {
        autonomyLevel: 'L0',
        riskTier: 'low',
        readOnly: true,
        postsJournal: false,
        reconcilesTransactions: false,
      },
    };
    const reservation = await createOrReuseSpecialistAgentRun(
      (data) =>
        this.prisma.$transaction(async (tx) => {
          const run = await tx.specialistAgentRun.create({ data });
          await recordSpecialistAgentRunCreatedEvent(tx, run);
          return run;
        }),
      (keyBusinessId, agentKey, idempotencyKeyHash) =>
        this.prisma.specialistAgentRun.findFirst({
          where: {
            businessId: keyBusinessId,
            agentKey,
            idempotencyKeyHash,
          },
        }),
      runData,
      idempotencyKey,
      {
        month: input.month,
        period,
        branchId: input.branchId ?? null,
      },
      (configBusinessId, agentKey) =>
        ensureSpecialistAgentConfigVersion(
          this.prisma,
          configBusinessId,
          agentKey,
        ),
    );
    const run = reservation.run;
    if (reservation.reused) {
      return this.prisma.specialistAgentRun.findFirstOrThrow({
        where: { id: run.id, businessId, agentKey: AGENT_KEY },
        include: SPECIALIST_AGENT_RUN_DETAILS_INCLUDE,
      });
    }

    try {
      const statement = await this.readProfitAnalyticsStatement(
        businessId,
        actorUserId,
        run.id,
        input,
        period,
      );
      const periodVariance = this.compareCalendarMonths(statement);
      const observedAt = new Date();
      const financeTrialBalanceRaw =
        await this.financeJournals.trialBalanceForScope(
          businessId,
          observedAt.toISOString().slice(0, 10),
          input.branchId,
        );
      const financeTrialBalance = {
        ...financeTrialBalanceRaw,
        entities: financeTrialBalanceRaw.entities.map((entity) => {
          const business = scopedBusinesses.find(
            (item) => item.id === entity.businessId,
          );
          return {
            ...entity,
            businessName: business?.name ?? 'Business name not available',
            currency: business?.currency ?? null,
          };
        }),
      };
      const snapshot = {
        currency,
        month: statement.month,
        period: statement.period,
        scopeBusinessCount: scopeBusinessIds.length,
        revenue: statement.revenue,
        cogs: statement.cogs,
        totalExpenses: statement.totalExpenses,
        wastageCost: statement.wastageCost,
        netProfit: statement.netProfit,
        trend: statement.trend.map((point) => ({
          month: point.month,
          revenue: point.revenue,
          cogs: point.cogs,
          totalExpenses: point.totalExpenses,
          wastageCost: point.wastageCost,
          netProfit: point.netProfit,
        })),
      } satisfies Prisma.InputJsonObject;
      const expenseDuplicateReview = await this.reviewExpenseDuplicates(
        scopeBusinessIds,
        input.month,
      );
      const expenseCategoryVariance = await this.reviewExpenseCategoryVariance(
        scopeBusinessIds,
        scopedBusinesses,
        input.month,
      );
      const expenseAnomalyReview = await this.reviewExpenseAnomalies(
        scopeBusinessIds,
        scopedBusinesses,
        input.month,
      );
      const cashFlowReview = await this.reviewCashFlow(
        businessId,
        input.branchId,
      );
      const xeroOpenItemsReview = await this.reviewXeroOpenItems(
        businessId,
        scopeBusinessIds,
      );
      const xeroBankTransactionStatusReview =
        await this.reviewXeroBankTransactionStatus(businessId, scopeBusinessIds);
      const creditAgingReview = await this.reviewCreditAging(
        businessId,
        scopeBusinessIds,
      );
      const approvedReturnReview = await this.reviewApprovedReturns(
        scopeBusinessIds,
        input.month,
      );
      const budgetActualReview = await this.reviewBudgetActuals(
        scopeBusinessIds,
        scopedBusinesses,
        input.month,
      );
      const periodCloseReadiness = await this.periodClose.readiness(
        businessId,
        input.month,
        input.branchId,
      );
      const bankStatementReview = await this.reviewBankStatementReconciliation(
        scopeBusinessIds,
      );
      const missingData = [
        'This snapshot is the existing Profit Analytics calculation from completed non-quotation sales, recorded COGS, expenses and recorded wastage; it is not a posted accounting ledger or cash balance.',
        'No native bank-feed balance or automatic bank-feed matching is available. User-imported statement lines can be compared with posted Noxtill manual journals, and any suggestion still needs a human decision; that is not a complete ledger reconciliation. When Xero is connected, its own bank-transaction IsReconciled flags are shown separately and are not matched to Noxtill ledger entries. The optional CashForecastService result starts cumulative net flow at zero and is not an account balance. The partial trial balance includes posted Noxtill manual journals only; it excludes opening balances and automatic/external postings.',
        'FinancePeriodCloseService provides a current source-record checklist, manual-journal integrity counts and a Noxtill-only posting lock. It does not reconcile bank activity or certify an authoritative close. No native Noxtill Finance A/R or A/P subledger is available; connected Xero invoices are shown separately as external open items, while customer-credit aging comes from the Credit module and is not posted accounting A/R.',
        ...(bankStatementReview.status === 'not_imported'
          ? ['No statement CSV has been imported into Noxtill for this business scope; bank reconciliation is therefore not evidenced.']
          : ['Statement lines are compared only with posted Noxtill manual journal lines. Suggested matches are not reconciled until a human accepts them; imports do not include automatic sales or expense postings.']),
        ...(budgetActualReview.status === 'no_approved_budgets'
          ? [
              'No approved FinanceBudget exists for this month and business scope. Expense actuals remain visible as not budgeted; no target is inferred.',
            ]
          : []),
        'No cross-currency conversion is performed; the values remain in the business currency shown.',
        'Approved return records are shown separately from Profit Analytics. Return has no dedicated approvedAt field, so updatedAt is used as the approval-month basis; these amounts are not subtracted from P&L and do not by themselves confirm provider settlement or cash payout.',
        'Month-over-month differences are only calculated when the selected Profit Analytics period is a calendar month. Differences are descriptive and do not establish a cause.',
      ];
      const assumptions = [
        'Profit Analytics defines net profit as revenue minus COGS, recorded expenses and recorded wastage cost for the selected period.',
        'Sales revenue is not treated as cash collected, and this result does not claim a journal was posted or reconciled.',
        'Bank statement review uses imported signed dates and amounts, exact account/currency/amount matching within three days, and explicit human decisions. It is not a bank feed, a complete ledger reconciliation, or proof of cash settlement.',
        'The optional CashForecastService result, when available, is a relative net-flow projection from zero and is not current cash or a bank balance.',
        'Customer credit aging uses the Credit module’s outstanding-balance age since the last zero balance or first credit entry; it does not imply invoice due-date aging or a finance-owned A/R control account.',
        'Period-close readiness uses source records and manual Noxtill journals for the selected month. It is partial preparation only; bank reconciliation and an authoritative accounting close are unavailable.',
        'Budget variance is recorded Expense actuals minus the latest approved FinanceBudget amount for the same business, category and calendar month. Pending and rejected versions do not replace an approved version.',
        'Expense rows do not store a branch field. Budget actuals are calculated per business record in the selected branch scope; they are not allocated between locations within one business.',
        'Period variance is the selected calendar month minus the immediately preceding calendar month using ProfitService.pnl trend values; it does not infer a cause.',
        'Account balances are from posted Noxtill manual journals only and are grouped by business entity and currency. They are not a complete ledger; opening balances and automatic or external postings are excluded.',
        `The scope includes ${scopeBusinessIds.length} business record(s) resolved by BranchScopeService for this request.`,
      ];
      const deterministicSummary =
        `Profit Analytics returned ${statement.netProfit} ${currency} net profit for ${statement.period} (${statement.month}). ` +
        'This is a sales-and-expense analytics snapshot, not a ledger balance or cash position.';
      const aiSummary =
        options.includeAiSummary === false
          ? null
          : await this.summarize(
              businessId,
              snapshot,
              this.summarizeBudgetActualsForAi(budgetActualReview, currency),
              bankStatementReview,
              cashFlowReview,
              xeroOpenItemsReview,
              creditAgingReview,
              approvedReturnReview,
              periodVariance,
              run.id,
            );
      const output = {
        summary: deterministicSummary,
        source: 'ProfitService.pnl',
        snapshot,
        expenseDuplicateReview,
        expenseCategoryVariance,
        expenseAnomalyReview,
        periodVariance,
        cashFlowReview,
        xeroOpenItemsReview,
        xeroBankTransactionStatusReview,
        creditAgingReview,
        approvedReturnReview,
        budgetActualReview,
        periodCloseReadiness,
        bankStatementReview,
        financeTrialBalance,
        aiSummary,
        coverage: 'partial_profit_analytics',
        observedAt: observedAt.toISOString(),
        durationMs: observedAt.getTime() - startedAt.getTime(),
      } satisfies Prisma.InputJsonObject;

      const completed = await this.prisma.$transaction(async (tx) => {
        const result = await tx.specialistAgentRun.update({
          where: { id: run.id },
          data: {
            status: 'completed',
            output,
            finishedAt: observedAt,
            recommendations: {
              create: [
                {
                  business: { connect: { id: businessId } },
                  agentKey: AGENT_KEY,
                  title: `Review ${statement.period} Profit Analytics snapshot`,
                  summary: deterministicSummary,
                  classification: 'calculated',
                  details: {
                    ...snapshot,
                    bankStatementReview,
                    financeTrialBalance,
                  },
                  assumptions,
                  missingData,
                  confidenceValue: null,
                  confidenceMethod: 'not_available',
                  riskTier: 'low',
                  approvalRequired: false,
                  status: 'proposed',
                  evidence: {
                    create: [
                      {
                        business: { connect: { id: businessId } },
                        run: { connect: { id: run.id } },
                        sourceType: 'canonical_service',
                        resourceType: 'profit_period',
                        resourceId: businessId,
                        fieldRefs: [
                          'Order.total',
                          'Order.cogs',
                          'Expense.amount',
                          'StockMovement.wastage.qty',
                          'StockMovement.wastage.unitCost',
                        ],
                        observedValues: snapshot,
                        observedAt,
                        fetchedAt: observedAt,
                        freshness: 'fresh',
                        calculation:
                          'ProfitService.pnl for the selected period; netProfit = revenue - cogs - totalExpenses - wastageCost. Values are kept in the business currency; no ledger/bank reconciliation is implied.',
                      },
                      {
                        business: { connect: { id: businessId } },
                        run: { connect: { id: run.id } },
                        sourceType: 'canonical_service',
                        resourceType: 'finance_partial_trial_balance',
                        resourceId: businessId,
                        fieldRefs: [
                          'FinanceJournalEntry.status',
                          'FinanceJournalEntry.entryDate',
                          'FinanceJournalEntry.currencyCode',
                          'FinanceJournalLine.accountId',
                          'FinanceJournalLine.accountCode',
                          'FinanceJournalLine.accountName',
                          'FinanceJournalLine.debit',
                          'FinanceJournalLine.credit',
                        ],
                        observedValues:
                          financeTrialBalance as unknown as Prisma.InputJsonObject,
                        observedAt,
                        fetchedAt: observedAt,
                        freshness: 'fresh',
                        calculation:
                          'FinanceJournalsService partial trial balance for the selected business scope as of the current UTC date. Only posted manual Noxtill journal lines are included. Accounts are grouped by business entity and currency, and each currency keeps its own debit/credit totals. Opening balances, automatic sales/expense postings, Xero journals and bank reconciliation are excluded; this is not a complete or certified ledger.',
                      },
                      {
                        business: { connect: { id: businessId } },
                        run: { connect: { id: run.id } },
                        sourceType:
                          periodVariance.status === 'available'
                            ? 'canonical_service'
                            : 'unavailable',
                        resourceType: 'profit_period_variance',
                        resourceId: businessId,
                        fieldRefs: [
                          'ProfitService.pnl.revenue',
                          'ProfitService.pnl.cogs',
                          'ProfitService.pnl.totalExpenses',
                          'ProfitService.pnl.wastageCost',
                          'ProfitService.pnl.netProfit',
                        ],
                        observedValues:
                          periodVariance as unknown as Prisma.InputJsonObject,
                        observedAt,
                        fetchedAt: observedAt,
                        freshness:
                          periodVariance.status === 'available'
                            ? 'fresh'
                            : 'unavailable',
                        calculation: periodVariance.calculation,
                      },
                      {
                        business: { connect: { id: businessId } },
                        run: { connect: { id: run.id } },
                        sourceType:
                          budgetActualReview.status === 'available'
                            ? 'canonical_service'
                            : 'unavailable',
                        resourceType: 'finance_budget_actuals',
                        resourceId: businessId,
                        fieldRefs: [
                          'FinanceBudget.amount',
                          'FinanceBudget.status',
                          'Expense.incurredOn',
                          'Expense.category',
                          'Expense.amount',
                        ],
                        observedValues:
                          budgetActualReview as unknown as Prisma.InputJsonObject,
                        observedAt,
                        fetchedAt: observedAt,
                        freshness: 'fresh',
                        calculation: budgetActualReview.calculation,
                      },
                      {
                        business: { connect: { id: businessId } },
                        run: { connect: { id: run.id } },
                        sourceType: 'canonical_service',
                        resourceType: 'finance_period_close_readiness',
                        resourceId: businessId,
                        fieldRefs: [
                          'FinancePeriodCloseService.readiness',
                          'FinanceJournalEntry.status',
                          'FinanceJournalEntry.totalDebits',
                          'FinanceJournalEntry.totalCredits',
                          'FinanceJournalLine.debit',
                          'FinanceJournalLine.credit',
                          'FinanceAccountingPeriod.status',
                          'Order.status',
                          'Expense.receiptKey',
                          'Integration.provider',
                          'Integration.status',
                        ],
                        observedValues:
                          periodCloseReadiness as unknown as Prisma.InputJsonObject,
                        observedAt,
                        fetchedAt: observedAt,
                        freshness: 'fresh',
                        calculation:
                          'Reuses FinancePeriodCloseService.readiness for the selected month and validated branch scope. This is partial source-record preparation with Noxtill manual-journal checks and a Noxtill-only posting lock; it does not reconcile bank activity or certify an authoritative close.',
                      },
                      {
                        business: { connect: { id: businessId } },
                        run: { connect: { id: run.id } },
                        sourceType:
                          bankStatementReview.status === 'available'
                            ? 'database_aggregate'
                            : 'unavailable',
                        resourceType: 'bank_statement_review',
                        resourceId: businessId,
                        fieldRefs: [
                          'FinanceBankStatementImport.periodEnd',
                          'FinanceBankStatementLine.status',
                          'FinanceBankStatementLine.amount',
                          'FinanceBankStatementLine.matchedJournalLineId',
                        ],
                        observedValues:
                          bankStatementReview as unknown as Prisma.InputJsonObject,
                        observedAt,
                        fetchedAt: observedAt,
                        freshness:
                          bankStatementReview.status === 'available'
                            ? 'fresh'
                            : 'unavailable',
                        calculation:
                          bankStatementReview.status === 'available'
                            ? bankStatementReview.calculation
                            : bankStatementReview.unavailableReason,
                      },
                      {
                        business: { connect: { id: businessId } },
                        run: { connect: { id: run.id } },
                        sourceType: 'database_aggregate',
                        resourceType: 'expense_duplicate_candidates',
                        resourceId: businessId,
                        fieldRefs: [
                          'Expense.businessId',
                          'Expense.incurredOn',
                          'Expense.description',
                          'Expense.category',
                          'Expense.amount',
                          'Expense.recurring',
                        ],
                        observedValues:
                          expenseDuplicateReview as unknown as Prisma.InputJsonObject,
                        observedAt,
                        fetchedAt: observedAt,
                        freshness: 'fresh',
                        calculation:
                          'Counts groups in the selected calendar month and same business where incurred date, NFKC-normalized/case-folded/whitespace-collapsed description and category, exact Decimal(12,2) amount, and recurring flag match. Entries after the first are candidates only; this does not confirm a duplicate, fraud, or a removal decision. Source descriptions and record IDs are not persisted in agent evidence.',
                      },
                      {
                        business: { connect: { id: businessId } },
                        run: { connect: { id: run.id } },
                        sourceType: 'database_aggregate',
                        resourceType: 'expense_category_month_variance',
                        resourceId: businessId,
                        fieldRefs: [
                          'Expense.businessId',
                          'Expense.category',
                          'Expense.incurredOn',
                          'Expense.amount',
                        ],
                        observedValues:
                          expenseCategoryVariance as unknown as Prisma.InputJsonObject,
                        observedAt,
                        fetchedAt: observedAt,
                        freshness: 'fresh',
                        calculation: expenseCategoryVariance.calculation,
                      },
                      {
                        business: { connect: { id: businessId } },
                        run: { connect: { id: run.id } },
                        sourceType: 'database_aggregate',
                        resourceType: 'expense_anomaly_candidates',
                        resourceId: businessId,
                        fieldRefs: [
                          'Expense.businessId',
                          'Expense.category',
                          'Expense.incurredOn',
                          'Expense.amount',
                        ],
                        observedValues:
                          expenseAnomalyReview as unknown as Prisma.InputJsonObject,
                        observedAt,
                        fetchedAt: observedAt,
                        freshness: 'fresh',
                        calculation: expenseAnomalyReview.calculation,
                      },
                      {
                        business: { connect: { id: businessId } },
                        run: { connect: { id: run.id } },
                        sourceType:
                          cashFlowReview.status === 'available'
                            ? 'canonical_service'
                            : 'unavailable',
                        resourceType: 'cash_flow_projection',
                        resourceId: businessId,
                        fieldRefs: [
                          'Order.total',
                          'Expense.amount',
                          'RecurringObligation.amount',
                          'RecurringObligation.frequency',
                          'RecurringObligation.nextDueDate',
                        ],
                        observedValues:
                          cashFlowReview as unknown as Prisma.InputJsonObject,
                        observedAt,
                        fetchedAt: observedAt,
                        freshness:
                          cashFlowReview.status === 'available'
                            ? 'fresh'
                            : 'unavailable',
                        calculation:
                          cashFlowReview.status === 'available'
                            ? 'Reuses CashForecastService.forecast for the current business: trailing recorded daily-average revenue and expenses plus active recurring-obligation occurrences over the returned horizon. It excludes scheduled receivables/payables. If Xero is connected, its open invoice due dates are shown separately and are not treated as expected cash. The cumulative net flow starts at zero; it is not a bank balance or a certainty.'
                            : cashFlowReview.unavailableReason,
                      },
                      {
                        business: { connect: { id: businessId } },
                        run: { connect: { id: run.id } },
                        sourceType:
                          xeroOpenItemsReview.status === 'available'
                            ? 'external_provider'
                            : 'unavailable',
                        resourceType: 'xero_open_items',
                        resourceId: businessId,
                        fieldRefs: [
                          'Xero.Invoice.Type',
                          'Xero.Invoice.Status',
                          'Xero.Invoice.AmountDue',
                          'Xero.Invoice.CurrencyCode',
                          'Xero.Invoice.DueDate',
                        ],
                        observedValues:
                          xeroOpenItemsReview as unknown as Prisma.InputJsonObject,
                        observedAt,
                        fetchedAt: observedAt,
                        freshness:
                          xeroOpenItemsReview.status === 'available'
                            ? 'fresh'
                            : 'unavailable',
                        calculation:
                          xeroOpenItemsReview.status === 'available'
                            ? 'Read-only aggregate of Xero AUTHORIZED ACCREC and ACCPAY invoices with AmountDue > 0, grouped by invoice currency, days past due, and future due-date windows. Future dates are invoice due dates, not expected cash receipts or payments. This is external open-invoice data, not a reconciled Noxtill ledger; page-cap results are marked partial.'
                            : xeroOpenItemsReview.unavailableReason,
                      },
                      {
                        business: { connect: { id: businessId } },
                        run: { connect: { id: run.id } },
                        sourceType:
                          creditAgingReview.status === 'available'
                            ? 'canonical_service'
                            : 'unavailable',
                        resourceType: 'customer_credit_aging',
                        resourceId: businessId,
                        fieldRefs: [
                          'CreditEntry.kind',
                          'CreditEntry.amount',
                          'CreditEntry.createdAt',
                          'v_credit_balances.days_outstanding',
                        ],
                        observedValues:
                          creditAgingReview as unknown as Prisma.InputJsonObject,
                        observedAt,
                        fetchedAt: observedAt,
                        freshness:
                          creditAgingReview.status === 'available'
                            ? 'fresh'
                            : 'unavailable',
                        calculation:
                          creditAgingReview.status === 'available'
                            ? creditAgingReview.basis
                            : creditAgingReview.unavailableReason,
                      },
                      {
                        business: { connect: { id: businessId } },
                        run: { connect: { id: run.id } },
                        sourceType:
                          xeroBankTransactionStatusReview.status === 'available'
                            ? 'external_provider'
                            : 'unavailable',
                        resourceType: 'xero_bank_transaction_status',
                        resourceId: businessId,
                        fieldRefs: [
                          'Xero.BankTransaction.Status',
                          'Xero.BankTransaction.Type',
                          'Xero.BankTransaction.Total',
                          'Xero.BankTransaction.CurrencyCode',
                          'Xero.BankTransaction.IsReconciled',
                        ],
                        observedValues:
                          xeroBankTransactionStatusReview as unknown as Prisma.InputJsonObject,
                        observedAt,
                        fetchedAt: observedAt,
                        freshness:
                          xeroBankTransactionStatusReview.status === 'available'
                            ? 'fresh'
                            : 'unavailable',
                        calculation:
                          xeroBankTransactionStatusReview.status === 'available'
                            ? 'Read-only aggregate of Xero-authorised BankTransactions in the trailing 30 UTC dates, grouped by currency and Xero IsReconciled flag. This reports Xero state only; it does not match bank statement lines to Noxtill ledger entries. Results are partial if the page cap is reached.'
                            : xeroBankTransactionStatusReview.unavailableReason,
                      },
                      {
                        business: { connect: { id: businessId } },
                        run: { connect: { id: run.id } },
                        sourceType: 'database_aggregate',
                        resourceType: 'approved_returns',
                        resourceId: businessId,
                        fieldRefs: [
                          'Return.businessId',
                          'Return.status',
                          'Return.updatedAt',
                          'Return.refundAmount',
                          'Return.refundMethod',
                        ],
                        observedValues:
                          approvedReturnReview as unknown as Prisma.InputJsonObject,
                        observedAt,
                        fetchedAt: observedAt,
                        freshness: 'fresh',
                        calculation: approvedReturnReview.calculation,
                      },
                    ],
                  },
                },
              ],
            },
          },
          include: {
            recommendations: {
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              include: {
                evidence: { orderBy: [{ fetchedAt: 'asc' }, { id: 'asc' }] },
              },
            },
          },
        });

        await recordSpecialistAgentRunTerminalEvent(
          tx,
          run,
          'completed',
          observedAt,
        );
        await tx.auditLog.create({
          data: {
            businessId,
            actorUserId,
            action: 'finance_agent.run',
            entity: 'SpecialistAgentRun',
            entityId: run.id,
            after: {
              agentKey: AGENT_KEY,
              agentVersion: AGENT_VERSION,
              status: result.status,
              period: statement.period,
              scopeBusinessCount: scopeBusinessIds.length,
              expenseDuplicateCandidateGroups:
                expenseDuplicateReview.candidateGroups,
              expenseDuplicateAdditionalEntries:
                expenseDuplicateReview.additionalEntries,
              expenseCategoryCount: expenseCategoryVariance.categoryCount,
              expenseAnomalyCandidateCount: expenseAnomalyReview.candidateCount,
              expenseAnomalyInsufficientHistoryCategoryCount:
                expenseAnomalyReview.insufficientHistoryCategoryCount,
              approvedReturnCount: approvedReturnReview.approvedCount,
            },
          },
        });
        return result;
      });
      return completed;
    } catch (error) {
      const finishedAt = new Date();
      await this.prisma.$transaction(async (tx) => {
        await tx.specialistAgentRun.update({
          where: { id: run.id },
          data: {
            status: 'failed',
            errorCode: 'FINANCE_AGENT_RUN_FAILED',
            errorMessage:
              'The selected Profit Analytics snapshot could not be read; no financial recommendation was produced.',
            finishedAt,
          },
        });
        await recordSpecialistAgentRunTerminalEvent(
          tx,
          run,
          'failed',
          finishedAt,
        );
        await tx.auditLog.create({
          data: {
            businessId,
            actorUserId,
            action: 'finance_agent.run_failed',
            entity: 'SpecialistAgentRun',
            entityId: run.id,
            after: {
              agentKey: AGENT_KEY,
              agentVersion: AGENT_VERSION,
              status: 'failed',
            },
          },
        });
      });
      if (error instanceof AppException) throw error;
      throw new AppException(
        'FINANCE_AGENT_RUN_FAILED',
        'The selected Profit Analytics snapshot could not be read; no financial recommendation was produced.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Finds exact-match patterns in the existing expense source for the selected calendar month.
   * Candidate groups are business-local and intentionally omit descriptions and source IDs from
   * the returned/persisted shape; legitimate repeated costs can match these fields.
   */
  private async readProfitAnalyticsStatement(
    businessId: string,
    actorUserId: string | null,
    runId: string,
    input: { month: string; branchId?: string },
    period: PnlPeriod,
  ): Promise<Awaited<ReturnType<ProfitService['pnl']>>> {
    const toolInput = {
      month: input.month,
      period,
      ...(input.branchId ? { branchId: input.branchId } : {}),
    };
    const result = await this.toolGateway.execute({
      agentKey: AGENT_KEY,
      moduleId: '30',
      businessId,
      actorUserId,
      runId,
      correlationId: runId,
      round: 1,
      sequence: 1,
      toolKey: FINANCE_PROFIT_ANALYTICS_TOOL,
      input: toolInput,
      mode: 'read_only',
      authorize: () => this.agentPolicy.assertEnabled(businessId, 'finance'),
    });
    const output = result.output;
    const record =
      typeof output === 'object' && output !== null && !Array.isArray(output)
        ? (output as Record<string, unknown>)
        : null;
    if (
      result.status !== 'succeeded' ||
      !record ||
      record.month !== input.month ||
      record.period !== period ||
      typeof record.revenue !== 'number' ||
      !Number.isFinite(record.revenue) ||
      typeof record.netProfit !== 'number' ||
      !Number.isFinite(record.netProfit)
    ) {
      throw new AppException(
        'FINANCE_AGENT_TOOL_OUTPUT_INVALID',
        'The Profit Analytics tool returned an invalid statement.',
        HttpStatus.BAD_GATEWAY,
      );
    }
    return record as unknown as Awaited<ReturnType<ProfitService['pnl']>>;
  }

  private compareCalendarMonths(
    statement: Awaited<ReturnType<ProfitService['pnl']>>,
  ): PeriodVariance {
    const emptyMetrics = {
      revenue: null,
      cogs: null,
      expensesAndWastage: null,
      netProfit: null,
    };
    if (statement.period !== 'month') {
      return {
        status: 'unavailable',
        source: null,
        currentMonth: null,
        priorMonth: null,
        metrics: emptyMetrics,
        calculation: null,
        unavailableReason:
          'Month-over-month comparison is only available when the selected Profit Analytics period is a calendar month.',
      };
    }

    const priorMonth = previousCalendarMonth(statement.month);
    const prior = statement.trend.find((point) => point.month === priorMonth);
    if (!prior) {
      return {
        status: 'unavailable',
        source: null,
        currentMonth: statement.month,
        priorMonth,
        metrics: emptyMetrics,
        calculation: null,
        unavailableReason: `Profit Analytics did not return a prior-month value for ${priorMonth}.`,
      };
    }

    const current = {
      revenue: statement.revenue,
      cogs: statement.cogs,
      expensesAndWastage: statement.totalExpenses + statement.wastageCost,
      netProfit: statement.netProfit,
    };
    const previous = {
      revenue: prior.revenue,
      cogs: prior.cogs,
      expensesAndWastage: prior.totalExpenses + prior.wastageCost,
      netProfit: prior.netProfit,
    };
    return {
      status: 'available',
      source: 'ProfitService.pnl.trend',
      currentMonth: statement.month,
      priorMonth,
      metrics: {
        revenue: varianceMetric(current.revenue, previous.revenue),
        cogs: varianceMetric(current.cogs, previous.cogs),
        expensesAndWastage: varianceMetric(
          current.expensesAndWastage,
          previous.expensesAndWastage,
        ),
        netProfit: varianceMetric(current.netProfit, previous.netProfit),
      },
      calculation: `${statement.month} ProfitService.pnl values minus ${priorMonth} trend values, using the same business/branch scope and currency. Differences are descriptive; no cause is inferred.`,
      unavailableReason: null,
    };
  }

  private async reviewExpenseDuplicates(
    scopeBusinessIds: string[],
    calendarMonth: string,
  ): Promise<ExpenseDuplicateReview> {
    const [year, monthNumber] = calendarMonth.split('-').map(Number);
    const start = new Date(Date.UTC(year, monthNumber - 1, 1));
    const end = new Date(Date.UTC(year, monthNumber, 1));
    const expenses = await this.prisma.expense.findMany({
      where: {
        businessId: { in: scopeBusinessIds },
        incurredOn: { gte: start, lt: end },
      },
      orderBy: [{ businessId: 'asc' }, { incurredOn: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        businessId: true,
        description: true,
        category: true,
        amount: true,
        recurring: true,
        incurredOn: true,
      },
    });

    const groups = findPotentialExpenseDuplicateGroups(expenses);
    let candidateGroups = 0;
    let additionalEntries = 0;
    let additionalEntryAmount = new Prisma.Decimal(0);
    for (const group of groups) {
      candidateGroups += 1;
      additionalEntries += group.length - 1;
      additionalEntryAmount = additionalEntryAmount.plus(
        group[0].amount.mul(group.length - 1),
      );
    }

    return {
      calendarMonth,
      candidateGroups,
      additionalEntries,
      additionalEntryAmount: additionalEntryAmount.toFixed(2),
      scopeBusinessCount: scopeBusinessIds.length,
    };
  }

  /**
   * Compares recorded expense totals by business and category for two calendar months.
   * This is descriptive variance only; it does not label a category as unusual or infer a cause.
   */
  private async reviewExpenseCategoryVariance(
    scopeBusinessIds: string[],
    scopedBusinesses: { id: string; name: string; currency: string }[],
    calendarMonth: string,
  ): Promise<ExpenseCategoryVariance> {
    const [year, monthNumber] = calendarMonth.split('-').map(Number);
    const currentStart = new Date(Date.UTC(year, monthNumber - 1, 1));
    const priorMonth = previousCalendarMonth(calendarMonth);
    const [priorYear, priorMonthNumber] = priorMonth.split('-').map(Number);
    const priorStart = new Date(Date.UTC(priorYear, priorMonthNumber - 1, 1));
    const currentEnd = new Date(Date.UTC(year, monthNumber, 1));

    const [priorGrouped, currentGrouped] = await Promise.all([
      this.prisma.expense.groupBy({
        by: ['businessId', 'category'],
        where: {
          businessId: { in: scopeBusinessIds },
          incurredOn: { gte: priorStart, lt: currentStart },
        },
        _sum: { amount: true },
        orderBy: [{ businessId: 'asc' }, { category: 'asc' }],
      }),
      this.prisma.expense.groupBy({
        by: ['businessId', 'category'],
        where: {
          businessId: { in: scopeBusinessIds },
          incurredOn: { gte: currentStart, lt: currentEnd },
        },
        _sum: { amount: true },
        orderBy: [{ businessId: 'asc' }, { category: 'asc' }],
      }),
    ]);
    const businessNames = new Map(
      scopedBusinesses.map((business) => [business.id, business.name]),
    );
    const current = new Map(
      currentGrouped.map((item) => [
        `${item.businessId}\u0000${item.category}`,
        item._sum.amount ?? new Prisma.Decimal(0),
      ]),
    );
    const prior = new Map(
      priorGrouped.map((item) => [
        `${item.businessId}\u0000${item.category}`,
        item._sum.amount ?? new Prisma.Decimal(0),
      ]),
    );

    const keys = new Set([...current.keys(), ...prior.keys()]);
    const rows = [...keys].map((key) => {
      const [businessId, category] = key.split('\u0000');
      const currentAmount = current.get(key) ?? new Prisma.Decimal(0);
      const priorAmount = prior.get(key) ?? new Prisma.Decimal(0);
      return {
        businessName: businessNames.get(businessId) ?? 'Business',
        category,
        currentAmount,
        priorAmount,
        difference: currentAmount.minus(priorAmount),
      };
    });
    rows.sort((left, right) => {
      const byDifference = right.difference
        .abs()
        .comparedTo(left.difference.abs());
      if (byDifference !== 0) return byDifference;
      const byBusiness = left.businessName.localeCompare(right.businessName);
      return byBusiness || left.category.localeCompare(right.category);
    });

    const limit = 10;
    return {
      source: 'Expense',
      currentMonth: calendarMonth,
      priorMonth,
      scopeBusinessCount: scopeBusinessIds.length,
      categoryCount: rows.length,
      omittedCategoryCount: Math.max(0, rows.length - limit),
      categories: rows.slice(0, limit).map((row) => ({
        businessName: row.businessName,
        category: row.category,
        currentAmount: row.currentAmount.toFixed(2),
        priorAmount: row.priorAmount.toFixed(2),
        difference: row.difference.toFixed(2),
      })),
      calculation: `Expense amounts grouped by business and stored category for ${calendarMonth} minus ${priorMonth}, using incurredOn calendar dates and Decimal amounts. The top ${limit} category differences by absolute value are shown; zeros for a month mean no matching expense rows were recorded, not proof that no cost existed. Differences are descriptive and do not establish cause, unusualness, error, or fraud.`,
    };
  }

  /**
   * Finds unusually high category spend using only recorded Expense rows. The comparison is a
   * heuristic review cue, never a fraud/error conclusion. A category needs four observed prior
   * months; months with no recorded rows are missing observations, not assumed zero spend.
   */
  private async reviewExpenseAnomalies(
    scopeBusinessIds: string[],
    scopedBusinesses: { id: string; name: string; currency: string }[],
    selectedMonth: string,
  ): Promise<ExpenseAnomalyReview> {
    const selectedBounds = monthBounds(selectedMonth);
    const now = new Date();
    const currentMonth = utcMonth(now);
    const selectedMonthIsFuture = selectedMonth > currentMonth;
    const selectedMonthIsCurrent = selectedMonth === currentMonth;
    const selectedDays = selectedMonthIsFuture
      ? 0
      : selectedMonthIsCurrent
        ? now.getUTCDate()
        : Math.round(
            (selectedBounds.end.getTime() - selectedBounds.start.getTime()) /
              DAY_MS,
          );
    const observationThrough =
      selectedDays > 0
        ? new Date(selectedBounds.start.getTime() + selectedDays * DAY_MS)
        : null;
    const baselineMonths = Array.from({ length: 6 }, (_, index) =>
      previousMonth(selectedMonth, index + 1),
    ).reverse();
    const historyStart = monthBounds(baselineMonths[0]).start;

    const dailyRows: ExpenseDailyCategoryTotal[] = [];
    if (observationThrough && scopeBusinessIds.length > 0) {
      const rows = await this.prisma.expense.groupBy({
        by: ['businessId', 'category', 'incurredOn'],
        where: {
          businessId: { in: scopeBusinessIds },
          incurredOn: {
            gte: historyStart,
            lt: observationThrough,
          },
        },
        _sum: { amount: true },
        orderBy: [
          { businessId: 'asc' },
          { category: 'asc' },
          { incurredOn: 'asc' },
        ],
      });
      for (const row of rows) {
        dailyRows.push({
          businessId: row.businessId,
          category: row.category,
          incurredOn: row.incurredOn,
          _sum: { amount: row._sum.amount },
        });
      }
    }

    const observedDaysByMonth = new Map<string, number>([
      [selectedMonth, selectedDays],
    ]);
    for (const month of baselineMonths) {
      const bounds = monthBounds(month);
      const daysInMonth = Math.round(
        (bounds.end.getTime() - bounds.start.getTime()) / DAY_MS,
      );
      observedDaysByMonth.set(month, Math.min(selectedDays, daysInMonth));
    }

    const monthlyTotals = new Map<string, Map<string, Prisma.Decimal>>();
    for (const row of dailyRows) {
      const month = utcMonth(row.incurredOn);
      const day = row.incurredOn.getUTCDate();
      const monthDayLimit = observedDaysByMonth.get(month);
      if (!monthDayLimit || day > monthDayLimit) continue;
      const businessCategoryKey = `${row.businessId}\u0000${row.category}`;
      const monthValues =
        monthlyTotals.get(businessCategoryKey) ??
        new Map<string, Prisma.Decimal>();
      monthValues.set(
        month,
        (monthValues.get(month) ?? new Prisma.Decimal(0)).plus(
          row._sum.amount ?? new Prisma.Decimal(0),
        ),
      );
      monthlyTotals.set(businessCategoryKey, monthValues);
    }

    const businessNames = new Map(
      scopedBusinesses.map((business) => [business.id, business.name]),
    );
    const candidates: ExpenseAnomalyReview['candidates'] = [];
    let eligibleCategoryCount = 0;
    let insufficientHistoryCategoryCount = 0;
    for (const [key, monthValues] of monthlyTotals) {
      const currentAmount = monthValues.get(selectedMonth);
      if (!currentAmount) continue;
      const [businessId, category] = key.split('\u0000');
      const historicalValues = baselineMonths
        .map((month) => monthValues.get(month))
        .filter((value): value is Prisma.Decimal => value !== undefined);
      if (historicalValues.length < 4) {
        insufficientHistoryCategoryCount += 1;
        continue;
      }

      eligibleCategoryCount += 1;
      const baselineMedian = medianDecimal(historicalValues);
      const deviations = historicalValues.map((value) =>
        value.minus(baselineMedian).abs(),
      );
      const medianAbsoluteDeviation = medianDecimal(deviations);
      const reviewThreshold = baselineMedian.plus(
        medianAbsoluteDeviation.mul(3),
      );
      if (currentAmount.lte(reviewThreshold)) continue;

      candidates.push({
        businessName: businessNames.get(businessId) ?? 'Business',
        category,
        currentAmount: currentAmount.toFixed(2),
        baselineMedian: baselineMedian.toFixed(2),
        medianAbsoluteDeviation: medianAbsoluteDeviation.toFixed(2),
        reviewThreshold: reviewThreshold.toFixed(2),
        amountAboveThreshold: currentAmount.minus(reviewThreshold).toFixed(2),
        observedBaselineMonths: historicalValues.length,
      });
    }

    candidates.sort((left, right) => {
      const byExcess = new Prisma.Decimal(
        right.amountAboveThreshold,
      ).comparedTo(new Prisma.Decimal(left.amountAboveThreshold));
      return (
        byExcess ||
        left.businessName.localeCompare(right.businessName) ||
        left.category.localeCompare(right.category)
      );
    });
    const limit = 10;
    const observedThrough = observationThrough
      ? new Date(observationThrough.getTime() - DAY_MS)
          .toISOString()
          .slice(0, 10)
      : null;
    const calculation = `For each business and stored expense category, compare the selected month-to-date (or completed month) with up to six prior comparable calendar windows. A category is eligible only with at least four prior months containing recorded rows; absent months are treated as missing, not zero. Review cue: current recorded amount > historical median + 3 × median absolute deviation. Calculations use Decimal amounts in the businesses' stored currency. This is a heuristic outlier screen, not a calibrated probability, accounting conclusion, error finding, or fraud determination. The selected window contains records through ${observedThrough ?? 'no day in the selected month'}.`;

    return {
      status: eligibleCategoryCount > 0 ? 'available' : 'insufficient_history',
      source: 'Expense',
      selectedMonth,
      observedThrough,
      baselineMonths,
      scopedBusinessCount: scopeBusinessIds.length,
      eligibleCategoryCount,
      insufficientHistoryCategoryCount,
      candidateCount: candidates.length,
      omittedCandidateCount: Math.max(0, candidates.length - limit),
      method: 'median_plus_three_median_absolute_deviations',
      candidates: candidates.slice(0, limit),
      calculation,
    };
  }

  /** Reuses the existing forecast over the already-selected branch context. */
  private async reviewCashFlow(
    businessId: string,
    branchId?: string,
  ): Promise<CashFlowReview> {
    try {
      const forecast = await this.cashForecast.forecast(
        businessId,
        30,
        branchId,
      );
      const endingRelativeNetFlow = forecast.projection.at(-1)?.cumulativeNet;
      const scheduledObligationsTotal = forecast.projection.reduce(
        (total, day) => total + day.obligationsDue,
        0,
      );
      return {
        status: 'available',
        source: 'CashForecastService.forecast',
        basis: 'relative_net_flow_not_bank_balance',
        days: forecast.days,
        averageDailyRevenue: forecast.dailyAvgRevenue,
        averageDailyExpense: forecast.dailyAvgExpense,
        endingRelativeNetFlow: endingRelativeNetFlow ?? null,
        scheduledObligationsTotal:
          Math.round(scheduledObligationsTotal * 100) / 100,
        negativeRelativeNetFlowDays: forecast.shortfallDates.length,
        unavailableReason: null,
      };
    } catch {
      return {
        status: 'unavailable',
        source: null,
        basis: null,
        days: null,
        averageDailyRevenue: null,
        averageDailyExpense: null,
        endingRelativeNetFlow: null,
        scheduledObligationsTotal: null,
        negativeRelativeNetFlowDays: null,
        unavailableReason:
          'The existing CashForecastService projection could not be loaded; Profit Analytics and expense-review results remain available.',
      };
    }
  }

  /** Reports only recent imported statement lines and explicit human match decisions. */
  private async reviewBankStatementReconciliation(
    scopeBusinessIds: string[],
  ) {
    const cutoff = new Date(Date.now() - 90 * DAY_MS);
    const imports = await this.prisma.financeBankStatementImport.findMany({
      where: {
        businessId: { in: scopeBusinessIds },
        periodEnd: { gte: cutoff, lte: new Date() },
      },
      orderBy: [{ periodEnd: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, businessId: true, currencyCode: true, periodStart: true, periodEnd: true, createdAt: true },
    });
    if (!imports.length) {
      return {
        status: 'not_imported' as const,
        source: 'FinanceBankStatementImport',
        windowDays: 90,
        importCount: null,
        lineCount: null,
        currencyBreakdown: [],
        unavailableReason: 'No bank statement CSV imports were found with statement dates in the recent 90-day window.',
        coverage: 'statement_lines_not_imported',
      };
    }

    const linesByImportAndStatus = await this.prisma.financeBankStatementLine.groupBy({
      by: ['importId', 'status'],
      where: {
        businessId: { in: scopeBusinessIds },
        importId: { in: imports.map((item) => item.id) },
      },
      _count: { _all: true },
      _sum: { amount: true },
    });
    const currencyRows = new Map<string, {
      lineCount: number;
      matchedCount: number;
      unmatchedCount: number;
      noMatchCount: number;
      signedAmount: Prisma.Decimal;
      matchedSignedAmount: Prisma.Decimal;
    }>();
    const importCurrencies = new Map(imports.map((item) => [item.id, item.currencyCode]));
    for (const row of linesByImportAndStatus) {
      const currency = importCurrencies.get(row.importId);
      if (!currency) continue;
      const summary = currencyRows.get(currency) ?? {
        lineCount: 0,
        matchedCount: 0,
        unmatchedCount: 0,
        noMatchCount: 0,
        signedAmount: new Prisma.Decimal(0),
        matchedSignedAmount: new Prisma.Decimal(0),
      };
      summary.lineCount += row._count._all;
      summary.signedAmount = summary.signedAmount.plus(row._sum.amount ?? 0);
      if (row.status === 'matched') {
        summary.matchedCount += row._count._all;
        summary.matchedSignedAmount = summary.matchedSignedAmount.plus(row._sum.amount ?? 0);
      } else if (row.status === 'unmatched') {
        summary.unmatchedCount += row._count._all;
      } else if (row.status === 'no_match') {
        summary.noMatchCount += row._count._all;
      }
      currencyRows.set(currency, summary);
    }
    const currencyBreakdown = [...currencyRows.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currencyCode, row]) => ({
        currencyCode,
        lineCount: row.lineCount,
        matchedCount: row.matchedCount,
        unmatchedCount: row.unmatchedCount,
        noMatchCount: row.noMatchCount,
        importedSignedAmount: row.signedAmount.toFixed(2),
        humanAcceptedSignedAmount: row.matchedSignedAmount.toFixed(2),
      }));
    return {
      status: 'available' as const,
      source: 'FinanceBankStatementImport + FinanceBankStatementLine',
      windowDays: 90,
      importCount: imports.length,
      lineCount: currencyBreakdown.reduce((sum, row) => sum + row.lineCount, 0),
      latestStatementDate: imports[0].periodEnd.toISOString().slice(0, 10),
      currencyBreakdown,
      unavailableReason: null,
      coverage: 'recent_imported_statement_lines_with_human_review',
      calculation: 'Counts and signed amount totals are grouped by the imported statement currency. Only status=matched is a human-accepted Noxtill suggestion; no external bank status or automatic posting is inferred.',
    };
  }

  private async reviewCreditAging(
    businessId: string,
    scopeBusinessIds: string[],
  ): Promise<CreditAgingReview> {
    if (scopeBusinessIds.length !== 1 || scopeBusinessIds[0] !== businessId) {
      return {
        status: 'unavailable',
        source: null,
        basis: null,
        observedAt: null,
        debtorCount: null,
        totalBalance: null,
        buckets: [],
        unavailableReason:
          'The canonical Credit aging summary is limited to the current business and is not combined across branch scopes.',
      };
    }

    try {
      const summary = await this.credit.financialAgingSummary();
      return {
        status: 'available',
        source: 'CreditService.financialAgingSummary',
        basis: summary.basis,
        observedAt: summary.observedAt,
        debtorCount: summary.debtorCount,
        totalBalance: summary.totalBalance,
        buckets: summary.buckets,
        unavailableReason: null,
      };
    } catch {
      return {
        status: 'unavailable',
        source: null,
        basis: null,
        observedAt: null,
        debtorCount: null,
        totalBalance: null,
        buckets: [],
        unavailableReason:
          'The Credit module aging summary could not be loaded; no receivable amount was inferred.',
      };
    }
  }

  private async reviewXeroOpenItems(
    businessId: string,
    scopeBusinessIds: string[],
  ): Promise<XeroOpenItemsReview> {
    if (scopeBusinessIds.length !== 1) {
      return {
        status: 'unavailable',
        source: null,
        observedAt: null,
        asOfDate: null,
        partial: false,
        currencies: [],
        unavailableReason:
          'Xero organizations are not combined across multiple branches. Select and review one connected business at a time.',
      };
    }
    try {
      return await this.xeroOpenItems.summarize(
        scopeBusinessIds[0] ?? businessId,
      );
    } catch {
      return {
        status: 'unavailable',
        source: null,
        observedAt: null,
        asOfDate: null,
        partial: false,
        currencies: [],
        unavailableReason:
          'Xero open-item data could not be loaded. Check the Xero connection in Integrations; the Profit Analytics review is still available.',
      };
    }
  }

  private async reviewXeroBankTransactionStatus(
    businessId: string,
    scopeBusinessIds: string[],
  ): Promise<XeroBankTransactionStatusReview> {
    if (scopeBusinessIds.length !== 1) {
      return {
        status: 'unavailable',
        source: null,
        observedAt: null,
        fromDate: null,
        toDate: null,
        partial: false,
        currencies: [],
        unavailableReason:
          'Xero organizations are not combined across multiple branches. Select and review one connected business at a time.',
      };
    }
    try {
      return await this.xeroBankTransactionStatus.summarize(
        scopeBusinessIds[0] ?? businessId,
      );
    } catch {
      return {
        status: 'unavailable',
        source: null,
        observedAt: null,
        fromDate: null,
        toDate: null,
        partial: false,
        currencies: [],
        unavailableReason:
          'Xero bank transaction status could not be loaded. Check the Xero connection in Integrations; the Finance review remains available.',
      };
    }
  }

  /** Compares only approved native budget versions with recorded expenses in the same scope. */
  private async reviewBudgetActuals(
    scopeBusinessIds: string[],
    scopedBusinesses: { id: string; name: string; currency: string }[],
    calendarMonth: string,
  ): Promise<FinanceBudgetActualReview> {
    const [year, monthNumber] = calendarMonth.split('-').map(Number);
    if (monthNumber < 1 || monthNumber > 12) {
      throw new AppException(
        'FINANCE_BUDGET_MONTH_INVALID',
        'Choose a calendar month in YYYY-MM format.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const start = new Date(Date.UTC(year, monthNumber - 1, 1));
    const end = new Date(Date.UTC(year, monthNumber, 1));
    const [budgetRows, expenseRows] = await Promise.all([
      this.prisma.financeBudget.findMany({
        where: { businessId: { in: scopeBusinessIds }, monthStart: start },
        orderBy: [
          { businessId: 'asc' },
          { category: 'asc' },
          { version: 'desc' },
          { createdAt: 'desc' },
        ],
        select: {
          businessId: true,
          category: true,
          amount: true,
          version: true,
          status: true,
        },
      }),
      this.prisma.expense.groupBy({
        by: ['businessId', 'category'],
        where: {
          businessId: { in: scopeBusinessIds },
          incurredOn: { gte: start, lt: end },
        },
        _sum: { amount: true },
        orderBy: [{ businessId: 'asc' }, { category: 'asc' }],
      }),
    ]);

    const businessNames = new Map(
      scopedBusinesses.map((business) => [business.id, business.name]),
    );
    const keyOf = (businessId: string, category: string) =>
      `${businessId}\u0000${category}`;
    const budgetsByKey = new Map<string, typeof budgetRows>();
    for (const row of budgetRows) {
      const key = keyOf(row.businessId, row.category);
      const versions = budgetsByKey.get(key) ?? [];
      versions.push(row);
      budgetsByKey.set(key, versions);
    }
    const actualsByKey = new Map(
      expenseRows.map((row) => [
        keyOf(row.businessId, row.category),
        row._sum.amount ?? new Prisma.Decimal(0),
      ]),
    );
    const keys = [
      ...new Set([...budgetsByKey.keys(), ...actualsByKey.keys()]),
    ].sort();
    let hasApproved = false;
    const lines = keys.map((key) => {
      const [businessId, category] = key.split('\u0000');
      const versions = budgetsByKey.get(key) ?? [];
      const approved =
        versions.find((row) => row.status === 'approved') ?? null;
      if (approved) hasApproved = true;
      const actual = actualsByKey.get(key) ?? new Prisma.Decimal(0);
      const variance = approved ? actual.minus(approved.amount) : null;
      return {
        businessName: businessNames.get(businessId) ?? 'Current business',
        category,
        status: approved ? ('approved' as const) : ('not_budgeted' as const),
        approvedAmount: approved?.amount.toFixed(2) ?? null,
        actualAmount: actual.toFixed(2),
        variance: variance?.toFixed(2) ?? null,
        budgetVersion: approved?.version ?? null,
      };
    });
    return {
      status: hasApproved ? 'available' : 'no_approved_budgets',
      source: 'FinanceBudget + Expense',
      month: calendarMonth,
      scopeBusinessCount: scopeBusinessIds.length,
      calculation: `For each business and exact stored expense category, actuals are the sum of Expense.amount where incurredOn falls in ${calendarMonth} UTC. The comparison uses the highest-version approved FinanceBudget for the same business, month and category. Draft, pending and rejected versions are not treated as approved. Variance = actual expense - approved budget. This is not a general-ledger balance.`,
      lines,
    };
  }

  /** Sends aggregate budget context to the provider; merchant category labels stay server-side. */
  private summarizeBudgetActualsForAi(
    review: FinanceBudgetActualReview,
    currency: string,
  ): FinanceBudgetActualAiSummary {
    const approvedLines = review.lines.filter(
      (line) => line.status === 'approved' && line.approvedAmount !== null,
    );
    const notBudgetedLines = review.lines.filter(
      (line) => line.status === 'not_budgeted',
    );
    const sum = (values: string[]) =>
      values
        .reduce((total, value) => total.plus(value), new Prisma.Decimal(0))
        .toFixed(2);
    return {
      status: review.status,
      month: review.month,
      scopeBusinessCount: review.scopeBusinessCount,
      currency,
      approvedBudgetCategoryCount: approvedLines.length,
      approvedBudgetTotal: sum(
        approvedLines.map((line) => line.approvedAmount as string),
      ),
      actualForApprovedBudgetCategories: sum(
        approvedLines.map((line) => line.actualAmount),
      ),
      varianceForApprovedBudgetCategories: sum(
        approvedLines.map((line) => line.variance ?? '0'),
      ),
      notBudgetedCategoryCount: notBudgetedLines.length,
      actualForNotBudgetedCategories: sum(
        notBudgetedLines.map((line) => line.actualAmount),
      ),
      calculation:
        'Server-calculated totals from approved FinanceBudget and matching Expense rows. Merchant category labels are intentionally omitted. Variance is recorded expense minus approved budget; this is not a general-ledger balance.',
    };
  }

  /** Reports canonical approved returns separately; the existing P&L formula is unchanged. */
  private async reviewApprovedReturns(
    scopeBusinessIds: string[],
    calendarMonth: string,
  ): Promise<ApprovedReturnReview> {
    const [year, monthNumber] = calendarMonth.split('-').map(Number);
    const start = new Date(Date.UTC(year, monthNumber - 1, 1));
    const end = new Date(Date.UTC(year, monthNumber, 1));
    const rows = await this.prisma.return.groupBy({
      by: ['refundMethod'],
      where: {
        businessId: { in: scopeBusinessIds },
        status: 'approved',
        updatedAt: { gte: start, lt: end },
      },
      _count: { _all: true },
      _sum: { refundAmount: true },
      orderBy: { refundMethod: 'asc' },
    });
    const approvedCount = rows.reduce((sum, row) => sum + row._count._all, 0);
    const total = rows.reduce(
      (sum, row) => sum.plus(row._sum.refundAmount ?? new Prisma.Decimal(0)),
      new Prisma.Decimal(0),
    );
    const calculation = `Counts and sums canonical Return rows with status approved and updatedAt within ${calendarMonth} UTC, grouped by recorded refund method. Return has no dedicated approvedAt field. Amounts are shown separately from ProfitService.pnl and are not subtracted from profit; approval does not by itself prove final provider settlement or cash payout.`;
    return {
      status: 'available',
      source: 'Return',
      calendarMonth,
      scopeBusinessCount: scopeBusinessIds.length,
      approvedCount,
      refundAmountTotal: total.toFixed(2),
      byMethod: rows.map((row) => ({
        method: row.refundMethod,
        count: row._count._all,
        amount: (row._sum.refundAmount ?? new Prisma.Decimal(0)).toFixed(2),
      })),
      calculation,
    };
  }

  private async summarize(
    businessId: string,
    snapshot: Prisma.InputJsonObject,
    budgetActualReview: FinanceBudgetActualAiSummary,
    bankStatementReview: Prisma.InputJsonObject,
    cashFlowReview: CashFlowReview,
    xeroOpenItemsReview: XeroOpenItemsReview,
    creditAgingReview: CreditAgingReview,
    approvedReturnReview: ApprovedReturnReview,
    periodVariance: PeriodVariance,
    specialistAgentRunId: string,
  ): Promise<AiSummary> {
    try {
      const response = await this.aiInfra.createMessage(
        businessId,
        'finance_agent',
        {
          system: `You are a read-only financial intelligence assistant. Explain only the supplied Profit Analytics values, observed trend, approved FinanceBudget versus Expense comparison, imported bank-statement review, relative cash-flow projection, Xero open invoices and bills, customer-credit aging, approved returns and calendar-month variance. Do not invent account balances, causes, budgets, receivable/payable amounts, reconciled status, journal postings, tax advice or cash collected. Xero invoices and bills are external open items, not a reconciled Noxtill ledger; due dates are not promised cash receipts or payments. Customer-credit aging is separate from invoice due-date aging and is not finance-owned accounting A/R. A relative cash-flow projection is not a bank balance. Approved returns are shown separately and are not subtracted from P&L. A statement candidate is only a suggestion; only status=matched is a human-accepted Noxtill suggestion, not proof of external settlement or full reconciliation. Pending and rejected budgets are not approved targets. Do not recalculate totals. If a source is absent, say it is unavailable. Label observed association as correlation, not causation. Keep the explanation concise for human review. ${SPECIALIST_AGENT_UNTRUSTED_DATA_POLICY}`,
          messages: [
            {
              role: 'user',
              content: `Explain this existing Profit Analytics snapshot and supplied finance evidence. Use each source only for its stated scope, keep currencies separate, and disclose missing or partial sources. Disclose that this is not a complete posted ledger or cash balance. ${specialistAgentUntrustedData('Profit Analytics snapshot', snapshot)} ${specialistAgentUntrustedData('Approved finance budget actuals', budgetActualReview)} ${specialistAgentUntrustedData('Recent imported bank statement review', bankStatementReview)} ${specialistAgentUntrustedData('Relative cash-flow projection', cashFlowReview)} ${specialistAgentUntrustedData('Xero open receivables and payables by currency and due date', xeroOpenItemsReview)} ${specialistAgentUntrustedData('Noxtill customer-credit aging aggregate, separate from accounting A/R', creditAgingReview)} ${specialistAgentUntrustedData('Approved return totals, shown separately from P&L', approvedReturnReview)} ${specialistAgentUntrustedData('Descriptive calendar-month variance', periodVariance)}`,
            },
          ],
          temperature: 0,
          maxTokens: 320,
        },
        [
          { tool: 'read_profit_analytics', period: snapshot.period },
          {
            tool: 'read_approved_budget_actuals',
            month: budgetActualReview.month,
            status: budgetActualReview.status,
          },
          {
            tool: 'read_recent_bank_statement_review',
            status: bankStatementReview.status,
            windowDays: bankStatementReview.windowDays,
          },
          {
            tool: 'read_relative_cash_flow_projection',
            status: cashFlowReview.status,
            days: cashFlowReview.days,
          },
          {
            tool: 'read_xero_open_items',
            status: xeroOpenItemsReview.status,
            partial: xeroOpenItemsReview.partial,
            currencyCount: xeroOpenItemsReview.currencies.length,
          },
          {
            tool: 'read_customer_credit_aging_aggregate',
            status: creditAgingReview.status,
            basis: creditAgingReview.basis,
          },
          {
            tool: 'read_approved_returns',
            status: approvedReturnReview.status,
            month: approvedReturnReview.calendarMonth,
          },
          {
            tool: 'read_calendar_month_variance',
            status: periodVariance.status,
            currentMonth: periodVariance.currentMonth,
          },
        ],
        undefined,
        specialistAgentRunId,
      );
      const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim()
        .slice(0, 1600);
      return {
        status: text ? 'ready' : 'unavailable',
        text: text || null,
        message: text ? null : 'The AI provider returned no explanation.',
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
      };
    } catch (error) {
      return describeAiSummaryProviderFailure(
        error,
        'The real Profit Analytics snapshot is still available.',
      );
    }
  }
}
