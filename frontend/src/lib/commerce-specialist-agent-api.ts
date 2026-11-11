import { apiFetch } from '@/lib/api-client';
import type { ProductValidationScorecard } from '@/lib/product-radar-api';
import type { SpecialistAgentAiUsageCall } from '@/lib/specialist-agent-usage';
import { postSpecialistAgentRun } from '@/lib/specialist-agent-run-idempotency';

export type CommerceAgentAiSummary = {
  status: 'ready' | 'not_configured' | 'blocked' | 'unavailable';
  text: string | null;
  message: string | null;
  inputTokens: number;
  outputTokens: number;
};

export type CommerceAgentStatusSnapshot = {
  productOpportunities: Record<string, number>;
  rfqs: Record<string, number>;
  riskCases: Record<string, number>;
  channelListings: Record<string, number>;
  experiments: Record<string, number>;
};

export type CommerceSourcingComparisonReview = {
  state: 'available' | 'no_open_rfqs';
  source: 'CommerceRfq' | null;
  reviewedRfqCount: number;
  maxRfqsPerReview: number;
  maxQuotesPerRfq: number;
  comparisons: {
    rfqId: string;
    currency: string;
    currentQuoteRecordsReviewed: number;
    comparableQuoteCount: number;
    lowestComparableLandedTotal: string | null;
    quotes: {
      quoteId: string;
      supplierName: string;
      currency: string;
      landedTotal: string;
      leadTimeDays: number | null;
      paymentTerms: string | null;
      validUntil: string | null;
    }[];
    excludedQuoteCount: number;
    exclusionReasons: Record<string, number>;
    conclusion: string;
  }[];
  limitations: string[];
};

export type CommerceValidationScorecardReview = {
  state: 'available' | 'no_candidates';
  source: 'ProductOpportunity';
  reviewedCount: number;
  maximumReviewed: number;
  hasMore: boolean;
  interpretation: string;
  candidates: {
    opportunityId: string;
    version: number;
    source: string;
    market: string | null;
    risk: string;
    sourceFreshAt: string | null;
    scorecard: ProductValidationScorecard;
  }[];
  limitations: string[];
};

export type CommerceReconciliationReview = {
  state: 'available' | 'no_saved_runs';
  source: 'CommerceReconciliationRun' | null;
  maximumRunsReviewed: number;
  latestRuns: {
    provider: string;
    status: string;
    listingsChecked: number;
    discrepancies: number;
    startedAt: string;
    finishedAt: string | null;
  }[];
  openDiscrepancies: { provider: string; kind: string; count: number }[];
  totalOpenDiscrepancies: number;
  limitations: string[];
};

export type CommerceExperimentReview = {
  state: 'available' | 'no_experiments';
  source: 'CommerceExperiment' | null;
  maximumReviewed: number;
  reviewedCount: number;
  hasMore: boolean;
  observedAt: string;
  currency: string | null;
  experiments: {
    experimentId: string;
    type: string;
    status: string;
    primaryMetric: string;
    resultsAvailable: boolean;
    sufficient: boolean | null;
    baselineValue: number | null;
    testValue: number | null;
    change: number | null;
    changeUnit: 'pct' | 'pts';
    insufficientReasons: string[];
    guardrail: {
      minMarginPct: number;
      testMarginPct: number | null;
      breached: boolean;
    } | null;
    computedAt: string | null;
  }[];
  limitations: string[];
};

export type CommerceSupplierClaimReview = {
  state: 'available' | 'no_claims';
  source: 'CommerceSupplierClaim' | null;
  totalClaims: number;
  statusCounts: Record<string, number>;
  maximumClaimsReviewed: number;
  reviewedClaims: number;
  hasMore: boolean;
  claims: {
    status: string;
    currency: string;
    recordedLossAmount: string;
    recordedSettlementAmount: string;
    evidenceCount: number;
    communicationCount: number;
    updatedAt: string;
  }[];
  limitations: string[];
};

export type CommerceDeliveryExceptionReview = {
  state: 'available' | 'no_failed_deliveries';
  source: 'Delivery' | null;
  failedCount: number;
  maximumFailuresReviewed: number;
  reviewedFailureCount: number;
  hasMore: boolean;
  recentFailures: {
    resolutionStatus: 'open' | 'resolved';
    updatedAt: string;
  }[];
  limitations: string[];
};

export type CommerceFulfillmentReview = {
  state: 'available' | 'no_open_orders';
  source: 'CommerceFulfillmentRouter' | null;
  totalOpenOrders: number;
  maximumOrdersReviewed: number;
  reviewedOrderCount: number;
  hasMore: boolean;
  orders: {
    orderType: string;
    status: string;
    physicalLineCount: number;
    routingState:
      | 'operator_route_recorded'
      | 'recommendation_available'
      | 'no_route_candidate';
    routeMode: string | null;
    createdAt: string;
  }[];
  limitations: string[];
};

export type CommerceProductionReview = {
  state: 'records_present' | 'no_production_records';
  source: 'CommerceBom + CommerceWorkOrder';
  asOf: string;
  activeBomCount: number;
  archivedBomCount: number;
  workOrders: {
    total: number;
    byStatus: Record<string, { count: number; plannedUnits: number }>;
    lateOpenCount: number;
    inProgressPlannedUnits: number;
    completedOutputUnits: number | null;
  };
  limitations: string[];
};

export type CommerceInventoryAvailabilityReview = {
  state: 'available' | 'no_synced_channel_products';
  source: 'Product.stockQty + Product.lowStockThreshold' | null;
  totalSyncedProducts: number;
  maximumProductsReviewed: number;
  reviewedProductCount: number;
  hasMore: boolean;
  reviewedAtOrBelowThresholdCount: number;
  products: {
    productId: string;
    stockQty: number;
    lowStockThreshold: number;
    thresholdState: 'at_or_below_recorded_threshold' | 'above_recorded_threshold';
    providers: string[];
  }[];
  observedAt: string;
  limitations: string[];
};

export type CommerceAgentRecommendation = {
  id: string;
  title: string;
  summary: string;
  assumptions: string[];
  missingData: string[];
  evidence: {
    id: string;
    resourceType: string;
    fieldRefs: string[];
    observedValues: CommerceAgentStatusSnapshot & { selectedQueue: string | null };
    observedAt: string;
    fetchedAt: string;
    calculation: string | null;
  }[];
};

export type CommerceOrderFulfillmentOrchestration = {
  goal: 'order_fulfillment_readiness';
  state: 'ready' | 'blocked' | 'failed';
  orderId: string;
  destinationCountry: string | null;
  correlationId: string;
  summary: string;
  steps: {
    worker: 'order_review' | 'fulfillment_routing';
    toolKey: 'get_order' | 'calculate_fulfillment_route';
    status: 'completed' | 'blocked' | 'failed';
    toolRunId: string | null;
    summary: string;
    screen: string;
  }[];
  routeEvaluation: {
    policyVersion: string | null;
    destinationCountry: string | null;
    recommendation: {
      mode: string;
      allocations: { orderItemId: string; nodeId: string }[];
      why: string[];
    } | null;
    candidateCount: number;
    candidates: {
      nodeId: string;
      name: string;
      market: string;
      eligibleForAll: boolean;
      processingDays: number | null;
      costPerOrder: number | null;
      lines: {
        orderItemId: string;
        role: string | null;
        stock: string;
        eligible: boolean;
        reasons: string[];
      }[];
      lineCount: number;
      linesTruncated: boolean;
    }[];
    candidatesTruncated: boolean;
    unroutableLineCount: number;
  } | null;
  limitations: string[];
};

export type CommerceProductSourcingOrchestration = {
  goal: 'product_sourcing_readiness';
  state: 'ready' | 'needs_sourcing' | 'blocked' | 'failed';
  opportunityId: string;
  rfqId: string | null;
  correlationId: string;
  summary: string;
  steps: {
    worker: 'product_discovery' | 'product_validation' | 'sourcing';
    toolKey:
      | 'get_product_opportunity'
      | 'get_validation_case'
      | 'compare_quotes';
    status: 'completed' | 'blocked' | 'failed';
    toolRunId: string | null;
    summary: string;
    screen: string;
  }[];
  limitations: string[];
};

export type CommerceAgentSpecialistRun = {
  id: string;
  status: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  finishedAt: string | null;
  output: {
    summary?: string;
    snapshot?: CommerceAgentStatusSnapshot;
    sourcingReview?: CommerceSourcingComparisonReview;
    validationScorecards?: CommerceValidationScorecardReview;
    reconciliationReview?: CommerceReconciliationReview;
    experimentReview?: CommerceExperimentReview;
    supplierClaimReview?: CommerceSupplierClaimReview;
    deliveryExceptionReview?: CommerceDeliveryExceptionReview;
    fulfillmentReview?: CommerceFulfillmentReview;
    productionReview?: CommerceProductionReview;
    inventoryAvailabilityReview?: CommerceInventoryAvailabilityReview | null;
    reviewSteps?: {
      key: string;
      label: string;
      status: 'completed' | 'failed';
      durationMs: number;
      errorCode: string | null;
    }[];
    orderFulfillmentOrchestration?: CommerceOrderFulfillmentOrchestration;
    productSourcingOrchestration?: CommerceProductSourcingOrchestration;
    aiSummary?: CommerceAgentAiSummary;
    answer?: string | null;
    answerStatus?: 'ready' | 'unavailable';
    message?: string | null;
    correlationId?: string;
    coverage?: string;
    tools?: {
      tool: string;
      outcome: 'succeeded' | 'refused' | 'failed' | 'blocked';
      summary: string;
      screen: string | null;
      toolRunId: string | null;
    }[];
  };
  recommendations: CommerceAgentRecommendation[];
  aiCallLogs?: SpecialistAgentAiUsageCall[];
};

const base = '/commerce/agent-tools/specialist-runs';

export const fetchCommerceAgentSpecialistRuns = () =>
  apiFetch<CommerceAgentSpecialistRun[]>(base);

export const runCommerceAgentReview = () =>
  postSpecialistAgentRun('commerce', {}, (idempotencyKey) =>
    apiFetch<CommerceAgentSpecialistRun>(base, {
      method: 'POST',
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    }),
  );

export const runCommerceAgentOrderFulfillmentOrchestration = (
  orderId: string,
  destinationCountry?: string,
) => {
  const input = {
    orderId: orderId.trim(),
    destinationCountry: destinationCountry?.trim().toUpperCase() || null,
  };
  return postSpecialistAgentRun(
    'commerce',
    { goal: 'order_fulfillment_readiness', ...input },
    (idempotencyKey) =>
      apiFetch<CommerceAgentSpecialistRun>(`${base}/order-fulfillment`, {
        method: 'POST',
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
        body: JSON.stringify({
          orderId: input.orderId,
          ...(input.destinationCountry ? { destinationCountry: input.destinationCountry } : {}),
        }),
      }),
  );
};

export const runCommerceAgentProductSourcingOrchestration = (
  opportunityId: string,
) => {
  const input = { opportunityId: opportunityId.trim() };
  return postSpecialistAgentRun(
    'commerce',
    { goal: 'product_sourcing_readiness', ...input },
    (idempotencyKey) =>
      apiFetch<CommerceAgentSpecialistRun>(`${base}/product-sourcing`, {
        method: 'POST',
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
        body: JSON.stringify(input),
      }),
  );
};

export const askCommerceAgent = (question: string) =>
  postSpecialistAgentRun('commerce', { question }, (idempotencyKey) =>
    apiFetch<CommerceAgentSpecialistRun>(`${base}/ask`, {
      method: 'POST',
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      body: JSON.stringify({ question }),
    }),
  );
