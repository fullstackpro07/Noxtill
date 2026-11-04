import { apiFetch } from "@/lib/api-client";
import type { SpecialistAgentAiUsageCall } from "@/lib/specialist-agent-usage";
import { postSpecialistAgentRun } from "@/lib/specialist-agent-run-idempotency";

export interface ProfitProductRow {
  productId: string;
  name: string;
  category: string;
  units: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  reviewPricing: boolean;
  isTopPerformer: boolean;
  /** Real comparison against the equal-length window immediately before this one. */
  trend: "up" | "down" | "flat";
}

export interface ProfitByProduct {
  windowDays: 30 | 90;
  products: ProfitProductRow[];
}

/** GET /profit/products?window=30|90&branchId= — computed from completed, non-quotation orders in that window. `branchId` omitted means just this business; `"all"` means the caller's whole real branch group; a specific id means one validated sibling branch. */
export function fetchProfitByProduct(window: 30 | 90 = 30, branchId?: string): Promise<ProfitByProduct> {
  const branchParam = branchId ? `&branchId=${branchId}` : "";
  return apiFetch<ProfitByProduct>(`/profit/products?window=${window}${branchParam}`);
}

export interface ProductSuggestion {
  productId: string;
  name: string;
  currentPrice: number;
  suggestedPrice: number;
  currentMargin: number;
  pitch: string;
}

/** GET /profit/products/suggestions?window=30|90&branchId= — a real deterministic target price (to reach a healthier margin) per low-margin product, AI-phrased. */
export function fetchProductSuggestions(window: 30 | 90 = 30, branchId?: string): Promise<ProductSuggestion[]> {
  const branchParam = branchId ? `&branchId=${branchId}` : "";
  return apiFetch<ProductSuggestion[]>(`/profit/products/suggestions?window=${window}${branchParam}`);
}

export interface HourlyRevenue {
  hour: number;
  revenue: number;
  salesCount: number;
  avgTicket: number;
}

export interface WeekdayRevenue {
  day: string;
  revenue: number;
  salesCount: number;
  avgTicket: number;
}

export interface ProfitByTime {
  hourly: HourlyRevenue[];
  weekday: WeekdayRevenue[];
  insight: string;
}

/** GET /profit/time?branchId= — see `fetchProfitByProduct` for what `branchId` means. */
export function fetchProfitByTime(branchId?: string): Promise<ProfitByTime> {
  const query = branchId ? `?branchId=${branchId}` : "";
  return apiFetch<ProfitByTime>(`/profit/time${query}`);
}

export interface PnlCategoryRow {
  category: string;
  revenue: number;
  cost: number;
  grossProfit: number;
  /** Real overhead-expense total split proportionally by this category's revenue share — not a tracked per-category figure. */
  allocatedExpenses: number;
  netProfit: number;
  /** Net margin (netProfit / revenue), matching the category's own net profit above. */
  margin: number;
}

export interface PnlTrendPoint {
  month: string;
  revenue: number;
  cogs: number;
  totalExpenses: number;
  wastageCost: number;
  netProfit: number;
}

export const PNL_PERIODS = ["today", "week", "month", "quarter", "year"] as const;
export type PnlPeriod = (typeof PNL_PERIODS)[number];

export interface PnlStatement {
  month: string;
  period: PnlPeriod;
  revenue: number;
  cogs: number;
  expenses: { category: string; amount: number }[];
  totalExpenses: number;
  /** Inventory depth fix (UPD-INT-013): real wastage/theft cost for the period, now deducted from netProfit. */
  wastageCost: number;
  netProfit: number;
  /** Real revenue/cost/gross-profit (and a proportionally-allocated share of overhead) per product category, for the selected period. */
  categoryBreakdown: PnlCategoryRow[];
  /** The current calendar month plus the 5 preceding it, always real and period-independent. */
  trend: PnlTrendPoint[];
}

/** GET /profit/pnl?month=YYYY-MM&period=today|week|month|quarter|year&branchId= — `month` anchors the trend's 6 calendar months; `period` scopes the headline figures and category breakdown; `branchId` see `fetchProfitByProduct`. */
export function fetchPnl(month: string, period: PnlPeriod = "month", branchId?: string): Promise<PnlStatement> {
  const branchParam = branchId ? `&branchId=${branchId}` : "";
  return apiFetch<PnlStatement>(`/profit/pnl?month=${month}&period=${period}${branchParam}`);
}

export interface FinancialAgentSnapshot {
  currency: string;
  month: string;
  period: PnlPeriod;
  scopeBusinessCount: number;
  revenue: number;
  cogs: number;
  totalExpenses: number;
  wastageCost: number;
  netProfit: number;
  trend: PnlTrendPoint[];
}

export interface ExpenseDuplicateReview {
  calendarMonth: string;
  candidateGroups: number;
  additionalEntries: number;
  additionalEntryAmount: string;
  scopeBusinessCount: number;
}

export interface FinancialAgentCashFlowReview {
  status: "available" | "unavailable";
  source: "CashForecastService.forecast" | null;
  basis: "relative_net_flow_not_bank_balance" | null;
  days: number | null;
  averageDailyRevenue: number | null;
  averageDailyExpense: number | null;
  endingRelativeNetFlow: number | null;
  scheduledObligationsTotal: number | null;
  negativeRelativeNetFlowDays: number | null;
  unavailableReason: string | null;
}

export interface FinancialAgentCreditAgingReview {
  status: "available" | "unavailable";
  source: "CreditService.financialAgingSummary" | null;
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
}

export interface FinancialAgentXeroOpenItemsReview {
  status: "available" | "not_connected" | "unavailable";
  source: "Xero Accounting API invoices" | null;
  observedAt: string | null;
  asOfDate: string | null;
  partial: boolean;
  currencies: {
    currencyCode: string;
    receivables: {
      invoiceCount: number;
      amountDue: string;
      buckets: {
        key: string;
        label: string;
        invoiceCount: number;
        amountDue: string;
      }[];
      upcomingDue: {
        key: string;
        label: string;
        invoiceCount: number;
        amountDue: string;
      }[];
    };
    payables: {
      invoiceCount: number;
      amountDue: string;
      buckets: {
        key: string;
        label: string;
        invoiceCount: number;
        amountDue: string;
      }[];
      upcomingDue: {
        key: string;
        label: string;
        invoiceCount: number;
        amountDue: string;
      }[];
    };
  }[];
  unavailableReason: string | null;
}

export interface FinancialAgentXeroBankTransactionStatusReview {
  status: "available" | "not_connected" | "unavailable";
  source: "Xero Accounting API BankTransactions" | null;
  observedAt: string | null;
  fromDate: string | null;
  toDate: string | null;
  partial: boolean;
  currencies: {
    currencyCode: string;
    reconciled: { transactionCount: number; amount: string };
    unreconciled: { transactionCount: number; amount: string };
  }[];
  unavailableReason: string | null;
}

export interface FinancialAgentApprovedReturnReview {
  status: "available";
  source: "Return";
  calendarMonth: string;
  scopeBusinessCount: number;
  approvedCount: number;
  refundAmountTotal: string;
  byMethod: { method: string; count: number; amount: string }[];
  calculation: string;
}

export interface FinancialAgentBudgetActualReview {
  status: "available" | "no_approved_budgets";
  source: "FinanceBudget + Expense";
  month: string;
  scopeBusinessCount: number;
  calculation: string;
  lines: {
    businessName: string;
    category: string;
    status: "approved" | "not_budgeted";
    approvedAmount: string | null;
    actualAmount: string;
    variance: string | null;
    budgetVersion: number | null;
  }[];
}

export interface FinancialAgentVarianceMetric {
  current: number;
  prior: number;
  delta: number;
}

export interface FinancialAgentPeriodVariance {
  status: "available" | "unavailable";
  source: "ProfitService.pnl.trend" | null;
  currentMonth: string | null;
  priorMonth: string | null;
  metrics: {
    revenue: FinancialAgentVarianceMetric | null;
    cogs: FinancialAgentVarianceMetric | null;
    expensesAndWastage: FinancialAgentVarianceMetric | null;
    netProfit: FinancialAgentVarianceMetric | null;
  };
  calculation: string | null;
  unavailableReason: string | null;
}

export interface FinancialAgentTrialBalance {
  asOf: string;
  coverage: "posted_manual_journals_only";
  disclosure: string;
  scopeBusinessCount: number;
  entities: {
    businessId: string;
    businessName: string;
    currency: string | null;
    currencies: {
      currencyCode: string;
      totalDebitBalances: string;
      totalCreditBalances: string;
      balanced: boolean;
      accounts: {
        accountId: string;
        accountCode: string;
        accountName: string;
        debits: string;
        credits: string;
        debitBalance: string;
        creditBalance: string;
      }[];
    }[];
  }[];
}

export interface FinancialAgentExpenseCategoryVariance {
  source: "Expense";
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
}

export interface FinancialAgentExpenseAnomalyReview {
  status: "available" | "insufficient_history";
  source: "Expense";
  selectedMonth: string;
  observedThrough: string | null;
  baselineMonths: string[];
  scopedBusinessCount: number;
  eligibleCategoryCount: number;
  insufficientHistoryCategoryCount: number;
  candidateCount: number;
  omittedCandidateCount: number;
  method: "median_plus_three_median_absolute_deviations";
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
}

export interface FinancialAgentRun {
  id: string;
  status: string;
  agentVersion: string;
  createdAt: string;
  finishedAt: string | null;
  output: {
    summary?: string;
    source?: string;
    coverage?: string;
    snapshot?: FinancialAgentSnapshot;
    expenseDuplicateReview?: ExpenseDuplicateReview;
    expenseCategoryVariance?: FinancialAgentExpenseCategoryVariance;
    expenseAnomalyReview?: FinancialAgentExpenseAnomalyReview;
    periodVariance?: FinancialAgentPeriodVariance;
    cashFlowReview?: FinancialAgentCashFlowReview;
    creditAgingReview?: FinancialAgentCreditAgingReview;
    xeroOpenItemsReview?: FinancialAgentXeroOpenItemsReview;
    xeroBankTransactionStatusReview?: FinancialAgentXeroBankTransactionStatusReview;
    approvedReturnReview?: FinancialAgentApprovedReturnReview;
    budgetActualReview?: FinancialAgentBudgetActualReview;
    periodCloseReadiness?: FinancePeriodCloseReadiness;
    financeTrialBalance?: FinancialAgentTrialBalance;
    bankStatementReview?: {
      status: "available" | "not_imported";
      source: string;
      windowDays: number;
      importCount: number | null;
      lineCount: number | null;
      latestStatementDate?: string;
      currencyBreakdown: Array<{
        currencyCode: string;
        lineCount: number;
        matchedCount: number;
        unmatchedCount: number;
        noMatchCount: number;
        importedSignedAmount: string;
        humanAcceptedSignedAmount: string;
      }>;
      unavailableReason: string | null;
      coverage: string;
      calculation?: string;
    };
    aiSummary?: {
      status: "ready" | "not_configured" | "blocked" | "unavailable";
      text: string | null;
      message: string | null;
      inputTokens: number;
      outputTokens: number;
    };
  };
  recommendations: Array<{
    id: string;
    title: string;
    summary: string;
    classification: string;
    assumptions: string[];
    missingData: string[];
    confidenceValue: number | null;
    confidenceMethod: string;
    evidence: Array<{
      sourceType: string;
      resourceType: string;
      fieldRefs: string[];
      observedValues: Record<string, unknown>;
      observedAt: string;
      fetchedAt: string;
      freshness: string;
      calculation: string | null;
    }>;
  }>;
  aiCallLogs?: SpecialistAgentAiUsageCall[];
}

export interface FinancePeriodCloseBusiness {
  businessId: string;
  businessName: string;
  currency: string;
  sales: {
    orderCount: number;
    completedOrderCount: number;
    completedOrderTotal: string;
    openOrderCount: number;
    cancelledOrderCount: number;
    source: string;
  };
  expenses: {
    count: number;
    recordedTotal: string;
    withoutAttachedReceiptCount: number;
    withoutAttachedReceiptTotal: string;
    source: string;
  };
  pendingReturns: { count: number; refundAmount: string; source: string };
  xeroSync: {
    status: "connected" | "not_connected";
    lastSyncAt: string | null;
    unsyncedOrderCount: number | null;
    source: string | null;
  };
  manualJournals: {
    postedCount: number;
    balancedPostedCount: number;
    unbalancedPostedCount: number;
    unresolvedCount: number;
    postingLocked: boolean;
    lockReason: string | null;
    lockedAt: string | null;
    source: string;
  };
  statementReview: {
    importCount: number;
    lineCount: number;
    matchedCount: number;
    unmatchedCount: number;
    noMatchCount: number;
    otherCount: number;
    source: string;
  };
}

export interface FinancePeriodCloseReadiness {
  month: string;
  generatedAt: string;
  scope: string;
  coverage: "partial";
  businesses: FinancePeriodCloseBusiness[];
  unavailable: Array<{ key: string; label: string; status: "not_available" }>;
  note: string;
}

/** GET /profit/period-close/readiness — source-record and manual-journal checks, not a certified accounting close. */
export function fetchFinancePeriodCloseReadiness(month: string, branchId = "all"): Promise<FinancePeriodCloseReadiness> {
  const params = new URLSearchParams({ month, branchId });
  return apiFetch<FinancePeriodCloseReadiness>(`/profit/period-close/readiness?${params.toString()}`);
}

/** GET /profit/agent-runs — latest persisted read-only Finance Intelligence runs for this business. */
export function fetchFinancialAgentRuns(): Promise<FinancialAgentRun[]> {
  return apiFetch<FinancialAgentRun[]>("/profit/agent-runs");
}

/** GET /profit/xero-open-items — user-triggered read-only check; it does not invoke AI or persist an agent run. */
export function fetchXeroOpenItems(branchId?: string): Promise<FinancialAgentXeroOpenItemsReview> {
  const branchParam = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
  return apiFetch<FinancialAgentXeroOpenItemsReview>(`/profit/xero-open-items${branchParam}`);
}

/** GET /profit/xero-bank-transaction-status — read-only Xero flags, not Noxtill reconciliation. */
export function fetchXeroBankTransactionStatus(branchId?: string): Promise<FinancialAgentXeroBankTransactionStatusReview> {
  const branchParam = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
  return apiFetch<FinancialAgentXeroBankTransactionStatusReview>(`/profit/xero-bank-transaction-status${branchParam}`);
}

/** POST /profit/agent-runs — snapshots the existing Profit Analytics calculation and optionally asks configured AI for an explanation. */
export function runFinancialAgent(input: {
  month: string;
  period: PnlPeriod;
  branchId?: string;
}): Promise<FinancialAgentRun> {
  return postSpecialistAgentRun("finance", input, (idempotencyKey) =>
    apiFetch<FinancialAgentRun>("/profit/agent-runs", {
      method: "POST",
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
      body: JSON.stringify(input),
    }),
  );
}

export interface WhatIfResult {
  estimate: string;
  disclaimer: string;
}

/** POST /ai/what-if — a real Claude call scoped to one product's own sales history; never a formula. */
export function whatIf(productId: string, priceDeltaPct: number): Promise<WhatIfResult> {
  return apiFetch<WhatIfResult>("/ai/what-if", {
    method: "POST",
    body: JSON.stringify({ productId, priceDeltaPct }),
  });
}

export interface DeadHoursOfferDraft {
  windowLabel: string;
  offerText: string;
}

/** POST /profit/time/dead-hours-offer — an AI draft grounded in this business's own real slowest window; never sends anything. */
export function generateDeadHoursOffer(): Promise<DeadHoursOfferDraft> {
  return apiFetch<DeadHoursOfferDraft>("/profit/time/dead-hours-offer", { method: "POST" });
}

export interface DeadHoursOfferResult {
  id: string;
  segment: string;
  body: string;
  sentCount: number;
}

/** POST /profit/time/dead-hours-offer/send — the explicit approve step; only this call reaches customers. */
export function sendDeadHoursOffer(segment: string, offerText: string): Promise<DeadHoursOfferResult> {
  return apiFetch<DeadHoursOfferResult>("/profit/time/dead-hours-offer/send", {
    method: "POST",
    body: JSON.stringify({ segment, offerText }),
  });
}
