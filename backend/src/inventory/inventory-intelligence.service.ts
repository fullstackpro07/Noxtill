import { HttpStatus, Injectable } from '@nestjs/common';
import {
  Prisma,
  ProductKind,
  PurchaseOrderStatus,
  StockTransferStatus,
  StockCountStatus,
  StockMovementKind,
} from '@prisma/client';
import { ClsService } from 'nestjs-cls';
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
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  REORDER_LEAD_TIME_DAYS,
  REORDER_VELOCITY_WINDOW_DAYS,
} from './reorder-suggestions.constants';
import {
  ReorderSuggestionsService,
  type ReorderSuggestionGroup,
} from './reorder-suggestions.service';
import {
  applyMinimumReorderQty,
  roundUpToPurchasePack,
} from './purchase-pack.util';
import { InventoryService } from './inventory.service';
import { StockCountService } from './stock-count.service';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePolicies } from '../common/policies/policies.service';
import { StockTransfersService } from '../branches/stock-transfers.service';
import { branchTransferAvailability } from './branch-transfer-availability.util';
import { createOrReuseSpecialistAgentRun } from '../common/agents/specialist-agent-run-idempotency.util';
import { ensureSpecialistAgentConfigVersion } from '../common/agents/specialist-agent-config.util';
import { transitionSpecialistAgentAction } from '../common/agents/specialist-agent-action.util';
import {
  createSpecialistAgentParentRunRef,
  type SpecialistAgentRunOptions,
} from '../common/agents/specialist-agent-run-options';

const AGENT_KEY = 'inventory_intelligence';
const AGENT_VERSION = '1.8.0';
const FORMULA_VERSION =
  'reorder-suggestions-v1+tenant-lead-time-v1+open-purchase-offset-v1+lead-time-sensitivity-v1+demand-backtest-interval-v1+prior-year-recorded-sales-comparison-v1+purchase-pack-rounding-v1+product-minimum-reorder-v1+branch-transfer-availability-v1+no-recent-demand-review-v1';
const DEMAND_HISTORY_WEEKS = 52;
const DEMAND_FORECAST_HORIZON_DAYS = 7;
const DEMAND_FORECAST_BASELINE_WEEKS = 8;
const DEMAND_PRIOR_YEAR_OFFSET_WEEKS = 52;
const DEMAND_COMPARISON_HISTORY_WEEKS =
  DEMAND_PRIOR_YEAR_OFFSET_WEEKS + DEMAND_FORECAST_BASELINE_WEEKS;
const DEMAND_BACKTEST_MIN_ACTIVE_WEEKS = 26;
const DEMAND_BACKTEST_WINDOWS = 8;
const DEMAND_INTERVAL_TARGET_COVERAGE = 0.8;
const BRANCH_REBALANCE_COVER_DAYS = 120;
const COUNT_VARIANCE_REVIEW_WINDOW_DAYS = 90;
const SUPPLIER_LEAD_TIME_LOOKBACK_DAYS = 365;
const SUPPLIER_LEAD_TIME_SAMPLE_LIMIT = 1000;
const SUPPLIER_LEAD_TIME_SCENARIO_MIN_SAMPLES = 3;
const ACTION_OUTCOME_SALES_WINDOW_DAYS = 56;
const ACTION_OUTCOME_SALES_WINDOW_WEEKS = ACTION_OUTCOME_SALES_WINDOW_DAYS / 7;
const INVENTORY_REORDER_TOOL_KEY = 'get_reorder_suggestions';
const INVENTORY_AGENT_TOOLS: readonly RegisteredSpecialistAgentTool[] = [
  {
    key: INVENTORY_REORDER_TOOL_KEY,
    label: 'Get current reorder suggestions',
    description:
      'Calculate canonical inventory reorder suggestions for the requested baseline lead time.',
    inputs: ['leadTimeDays'],
    requiredInputs: ['leadTimeDays'],
    riskClass: 'READ_ONLY',
    executable: true,
    exposedToReadOnlyAssistant: true,
    maxOutputBytes: 1_048_576,
    screen: '/inventory/reorder-suggestions',
  },
];

type RecordedOutcomeWindow = {
  recordedUnits: number;
  activeWeeks: number;
  totalWeeks: number;
};

function readRecordedOutcomeMeasurement(value: Prisma.JsonValue) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const raw = value.outcomeMeasurement;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null;
  }
  const measurement = raw;
  const result = measurement.result;
  const observedAt = measurement.observedAt;
  const reason = measurement.reason;
  if (
    (result !== 'measured' && result !== 'inconclusive') ||
    typeof observedAt !== 'string' ||
    typeof reason !== 'string'
  ) {
    return null;
  }
  const readWindow = (candidate: Prisma.JsonValue | undefined) => {
    if (
      typeof candidate !== 'object' ||
      candidate === null ||
      Array.isArray(candidate)
    ) {
      return null;
    }
    const window = candidate;
    const recordedUnits = window.recordedUnits;
    const activeWeeks = window.activeWeeks;
    const totalWeeks = window.totalWeeks;
    if (
      typeof recordedUnits !== 'number' ||
      typeof activeWeeks !== 'number' ||
      typeof totalWeeks !== 'number'
    ) {
      return null;
    }
    return {
      recordedUnits,
      activeWeeks,
      totalWeeks,
    } satisfies RecordedOutcomeWindow;
  };
  return {
    result,
    observedAt,
    reason,
    source: typeof measurement.source === 'string' ? measurement.source : null,
    windowDays:
      typeof measurement.windowDays === 'number'
        ? measurement.windowDays
        : null,
    baseline: readWindow(measurement.baseline),
    followUp: readWindow(measurement.followUp),
    causalAttribution: measurement.causalAttribution === false ? false : null,
  };
}

interface WeeklyDemandRow {
  productId: string;
  weeksAgo: number | bigint | string;
  recordedUnits: number | bigint | string;
  lastRecordedAt: Date | null;
}

type HistoricalLeadTimeScenario =
  | {
      status: 'available';
      sampleCount: number;
      minimumSampleCount: number;
      lookbackDays: number;
      medianElapsedDays: number;
      baseSuggestedQty: number;
      incomingPurchaseQty: number;
      incomingTransferQty: number;
      incomingSupplyQty: number;
      committedOutboundTransferQty: number;
      availableStockAfterOutboundTransfers: number;
      unroundedAdditionalQty: number;
      minimumReorderQty: number | null;
      suggestedQty: number;
      purchaseUnitCount: number | null;
      differenceFromDisplayedSuggestion: number;
      classification: 'historical_sensitivity_only';
    }
  | {
      status: 'insufficient_history' | 'no_recorded_sales_velocity';
      sampleCount: number;
      minimumSampleCount: number;
      lookbackDays: number;
      classification: 'historical_sensitivity_only';
    };

function buildDemandBacktest(weeklySales: number[]) {
  const weeksWithSales = weeklySales.filter((units) => units > 0).length;
  if (
    weeklySales.length < DEMAND_HISTORY_WEEKS ||
    weeksWithSales < DEMAND_BACKTEST_MIN_ACTIVE_WEEKS
  ) {
    return {
      status: 'insufficient_recorded_history',
      method: 'rolling_eight_week_mean_with_temporal_holdout',
      evaluatedWeeks: 0,
      meanAbsoluteErrorUnits: null,
      calibrationWeeks: 0,
      intervalTargetCoveragePercent: null,
      forecastLowerUnits: null,
      forecastUpperUnits: null,
      observedHoldoutCoveragePercent: null,
      minimumHistoryWeeksRequired: DEMAND_HISTORY_WEEKS,
      historyWeeksAvailable: weeklySales.length,
      minimumActiveWeeksRequired: DEMAND_BACKTEST_MIN_ACTIVE_WEEKS,
      weeksWithRecordedSales: weeksWithSales,
    };
  }

  // Input is newest-first. Forecast each historical target from only its prior
  // eight weeks; reserve the newest eight targets as a holdout, separate from
  // the older residuals used to set the empirical interval radius.
  const chronological = [...weeklySales].reverse();
  const errors: Array<{ actual: number; predicted: number; absolute: number }> =
    [];
  for (
    let targetIndex = DEMAND_FORECAST_BASELINE_WEEKS;
    targetIndex < chronological.length;
    targetIndex += 1
  ) {
    const training = chronological.slice(
      targetIndex - DEMAND_FORECAST_BASELINE_WEEKS,
      targetIndex,
    );
    const predicted =
      training.reduce((sum, units) => sum + units, 0) / training.length;
    const actual = chronological[targetIndex];
    errors.push({ actual, predicted, absolute: Math.abs(actual - predicted) });
  }

  const calibrationErrors = errors.slice(0, -DEMAND_BACKTEST_WINDOWS);
  const holdoutErrors = errors.slice(-DEMAND_BACKTEST_WINDOWS);
  const orderedCalibrationErrors = calibrationErrors
    .map((item) => item.absolute)
    .sort((left, right) => left - right);
  const quantileIndex = Math.min(
    orderedCalibrationErrors.length - 1,
    Math.ceil(
      (orderedCalibrationErrors.length + 1) * DEMAND_INTERVAL_TARGET_COVERAGE,
    ) - 1,
  );
  const intervalRadius = orderedCalibrationErrors[quantileIndex];
  const roundUnits = (value: number) => Math.round(value * 100) / 100;
  const baselineValues = weeklySales.slice(0, DEMAND_FORECAST_BASELINE_WEEKS);
  const forecastUnits =
    baselineValues.reduce((sum, units) => sum + units, 0) /
    DEMAND_FORECAST_BASELINE_WEEKS;
  const coveredHoldoutWeeks = holdoutErrors.filter(
    ({ actual, predicted }) =>
      actual >= Math.max(0, predicted - intervalRadius) &&
      actual <= predicted + intervalRadius,
  ).length;

  return {
    status: 'available',
    method: 'trailing_eight_week_mean_with_empirical_80_percent_holdout',
    evaluatedWeeks: holdoutErrors.length,
    meanAbsoluteErrorUnits: roundUnits(
      holdoutErrors.reduce((sum, item) => sum + item.absolute, 0) /
        holdoutErrors.length,
    ),
    calibrationWeeks: calibrationErrors.length,
    intervalTargetCoveragePercent: DEMAND_INTERVAL_TARGET_COVERAGE * 100,
    forecastLowerUnits: roundUnits(Math.max(0, forecastUnits - intervalRadius)),
    forecastUpperUnits: roundUnits(forecastUnits + intervalRadius),
    observedHoldoutCoveragePercent: roundUnits(
      (coveredHoldoutWeeks / holdoutErrors.length) * 100,
    ),
    minimumHistoryWeeksRequired: DEMAND_HISTORY_WEEKS,
    historyWeeksAvailable: weeklySales.length,
    minimumActiveWeeksRequired: DEMAND_BACKTEST_MIN_ACTIVE_WEEKS,
    weeksWithRecordedSales: weeksWithSales,
  };
}

function buildSamePeriodRecordedSalesComparison(weeklySales: number[]) {
  const currentPeriod = weeklySales.slice(0, DEMAND_FORECAST_BASELINE_WEEKS);
  const earlierPeriod = weeklySales.slice(
    DEMAND_PRIOR_YEAR_OFFSET_WEEKS,
    DEMAND_COMPARISON_HISTORY_WEEKS,
  );
  if (
    currentPeriod.length !== DEMAND_FORECAST_BASELINE_WEEKS ||
    earlierPeriod.length !== DEMAND_FORECAST_BASELINE_WEEKS
  ) {
    return {
      status: 'insufficient_recorded_history',
      method: 'same_eight_week_period_52_fixed_week_buckets_apart',
      windowWeeks: DEMAND_FORECAST_BASELINE_WEEKS,
      offsetWeeks: DEMAND_PRIOR_YEAR_OFFSET_WEEKS,
      offsetDays: DEMAND_PRIOR_YEAR_OFFSET_WEEKS * 7,
      currentRecordedUnits: null,
      currentWeeksWithRecordedSales: null,
      earlierRecordedUnits: null,
      earlierWeeksWithRecordedSales: null,
      differenceRecordedUnits: null,
      percentDifference: null,
    };
  }
  const currentRecordedUnits = currentPeriod.reduce(
    (sum, units) => sum + units,
    0,
  );
  const earlierRecordedUnits = earlierPeriod.reduce(
    (sum, units) => sum + units,
    0,
  );
  const differenceRecordedUnits = currentRecordedUnits - earlierRecordedUnits;
  return {
    status: 'available',
    method: 'same_eight_week_period_52_fixed_week_buckets_apart',
    windowWeeks: DEMAND_FORECAST_BASELINE_WEEKS,
    offsetWeeks: DEMAND_PRIOR_YEAR_OFFSET_WEEKS,
    offsetDays: DEMAND_PRIOR_YEAR_OFFSET_WEEKS * 7,
    currentRecordedUnits,
    currentWeeksWithRecordedSales: currentPeriod.filter((units) => units > 0)
      .length,
    earlierRecordedUnits,
    earlierWeeksWithRecordedSales: earlierPeriod.filter((units) => units > 0)
      .length,
    differenceRecordedUnits,
    percentDifference:
      earlierRecordedUnits > 0
        ? Math.round(
            (differenceRecordedUnits / earlierRecordedUnits) * 10_000,
          ) / 100
        : null,
  };
}

type AiSummary = {
  status: 'ready' | 'not_configured' | 'blocked' | 'unavailable' | 'not_needed';
  text: string | null;
  message: string | null;
  inputTokens: number;
  outputTokens: number;
};

type AgentDraftRecommendation = {
  title: string;
  summary: string;
  classification: string;
  details: Prisma.InputJsonObject;
  assumptions: string[];
  missingData: string[];
  riskTier: string;
  evidence: {
    resourceType: string;
    resourceId: string;
    fieldRefs: string[];
    observedValues: Prisma.InputJsonObject;
    calculation: string;
    observedAt?: Date;
  };
};

@Injectable()
export class InventoryIntelligenceService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly reorderSuggestions: ReorderSuggestionsService,
    private readonly inventoryService: InventoryService,
    private readonly stockCountService: StockCountService,
    private readonly aiInfra: AiInfraService,
    private readonly cls: ClsService,
    private readonly agentPolicy: SpecialistAgentPolicyService,
    private readonly prisma: PrismaService,
    private readonly stockTransfers: StockTransfersService,
    private readonly toolGateway: SpecialistAgentToolGatewayService,
  ) {
    this.toolGateway.registerAgentTools(
      AGENT_KEY,
      '13',
      INVENTORY_AGENT_TOOLS,
      async (context, _tool, input) => {
        const leadTimeDays = Number(input.leadTimeDays);
        if (
          !Number.isSafeInteger(leadTimeDays) ||
          leadTimeDays < 1 ||
          leadTimeDays > 365
        ) {
          throw new AppException(
            'INVENTORY_AGENT_TOOL_INPUT_INVALID',
            'The reorder lead-time baseline must be a whole number from 1 to 365 days.',
            HttpStatus.BAD_REQUEST,
          );
        }
        const groups = await this.reorderSuggestions.list(
          context.businessId,
          leadTimeDays,
          { includeCovered: true },
        );
        const itemCount = groups.reduce(
          (sum, group) => sum + group.items.length,
          0,
        );
        return {
          output: groups,
          status: 'succeeded',
          summary: `Calculated ${itemCount} current reorder item(s) from canonical inventory and supply records.`,
          outputResourceType: 'ReorderSuggestionSet',
        };
      },
    );
  }

  listRuns(businessId: string) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    return this.tenantPrisma.client.specialistAgentRun.findMany({
      where: { businessId: scopedBusinessId, agentKey: AGENT_KEY },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        recommendations: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: {
            evidence: { orderBy: [{ fetchedAt: 'asc' }, { id: 'asc' }] },
            inventoryCountTask: true,
            inventoryWastageReviewTask: true,
            stockTransfer: {
              select: { id: true, status: true, createdAt: true },
            },
            procurementRequest: {
              select: { id: true, status: true, version: true },
            },
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

  /**
   * Read-only follow-through evidence for saved reorder recommendations. The request, PO receipt
   * and current stock remain owned by Procurement/Inventory; this projection only joins their
   * current canonical state and never claims that a recommendation caused a later stock change.
   */
  async listActionOutcomes(businessId: string) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    const recommendations =
      await this.prisma.specialistAgentRecommendation.findMany({
        where: { businessId: scopedBusinessId, agentKey: AGENT_KEY },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 100,
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          details: true,
        },
      });
    const reorderRecommendations = recommendations.filter((recommendation) => {
      const details = recommendation.details as Prisma.JsonObject;
      return (
        details.signalType === 'reorder' &&
        typeof details.productId === 'string'
      );
    });
    if (reorderRecommendations.length === 0) return [];

    const recommendationIds = reorderRecommendations.map(({ id }) => id);
    const productIds = [
      ...new Set(
        reorderRecommendations.map(
          (recommendation) =>
            (recommendation.details as Prisma.JsonObject).productId as string,
        ),
      ),
    ];
    const observedAt = new Date();
    const [requests, products, specialistActions] = await Promise.all([
      this.prisma.procurementRequest.findMany({
        where: {
          businessId: scopedBusinessId,
          sourceAgentRecommendationId: { in: recommendationIds },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          sourceAgentRecommendationId: true,
          status: true,
          updatedAt: true,
          convertedPurchaseOrderId: true,
          items: {
            select: { productId: true, lineType: true, quantity: true },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          },
        },
      }),
      this.prisma.product.findMany({
        where: { businessId: scopedBusinessId, id: { in: productIds } },
        select: {
          id: true,
          name: true,
          stockQty: true,
          lowStockThreshold: true,
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.specialistAgentAction.findMany({
        where: {
          businessId: scopedBusinessId,
          recommendationId: { in: recommendationIds },
          actionType: 'inventory_reorder_request',
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          recommendationId: true,
          state: true,
          actualResult: true,
          requiredApproval: true,
          executionAttemptCount: true,
          correlationId: true,
          canonicalOperationId: true,
          createdAt: true,
          updatedAt: true,
          approvedAt: true,
          executedAt: true,
          verifiedAt: true,
          events: {
            orderBy: { sequence: 'asc' },
            select: {
              sequence: true,
              eventType: true,
              fromState: true,
              toState: true,
              reason: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);
    const purchaseOrderIds = requests
      .map((request) => request.convertedPurchaseOrderId)
      .filter((id): id is string => id !== null);
    const purchaseOrders = purchaseOrderIds.length
      ? await this.prisma.purchaseOrder.findMany({
          where: { businessId: scopedBusinessId, id: { in: purchaseOrderIds } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            status: true,
            sentAt: true,
            confirmedAt: true,
            receivedAt: true,
            items: {
              select: { productId: true, qtyOrdered: true, qtyReceived: true },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            },
          },
        })
      : [];

    const requestByRecommendation = new Map(
      requests.map((request) => [request.sourceAgentRecommendationId, request]),
    );
    const actionByRecommendation = new Map<
      string,
      (typeof specialistActions)[number]
    >();
    for (const action of specialistActions) {
      if (!actionByRecommendation.has(action.recommendationId)) {
        actionByRecommendation.set(action.recommendationId, action);
      }
    }
    const purchaseOrderById = new Map(
      purchaseOrders.map((purchaseOrder) => [purchaseOrder.id, purchaseOrder]),
    );
    const productById = new Map(
      products.map((product) => [product.id, product]),
    );

    const outcomeWindows = reorderRecommendations.flatMap((recommendation) => {
      const request = requestByRecommendation.get(recommendation.id);
      const purchaseOrder = request?.convertedPurchaseOrderId
        ? (purchaseOrderById.get(request.convertedPurchaseOrderId) ?? null)
        : null;
      if (
        purchaseOrder?.status !== PurchaseOrderStatus.received ||
        !purchaseOrder.receivedAt
      ) {
        return [];
      }
      const followUpEndsAt = new Date(
        purchaseOrder.receivedAt.getTime() +
          ACTION_OUTCOME_SALES_WINDOW_DAYS * 24 * 60 * 60 * 1000,
      );
      if (observedAt < followUpEndsAt) return [];
      const details = recommendation.details as Prisma.JsonObject;
      return [
        {
          recommendationId: recommendation.id,
          productId: details.productId as string,
          receivedAt: purchaseOrder.receivedAt,
          baselineStartsAt: new Date(
            purchaseOrder.receivedAt.getTime() -
              ACTION_OUTCOME_SALES_WINDOW_DAYS * 24 * 60 * 60 * 1000,
          ),
          followUpEndsAt,
        },
      ];
    });
    const salesComparisonRows = outcomeWindows.length
      ? await this.prisma.$queryRaw<
          Array<{
            recommendationId: string;
            baselineUnits: bigint;
            baselineActiveWeeks: bigint;
            followUpUnits: bigint;
            followUpActiveWeeks: bigint;
          }>
        >(Prisma.sql`
          WITH measurement_windows AS (
            ${Prisma.join(
              outcomeWindows.map(
                (window) => Prisma.sql`
                  SELECT
                    ${window.recommendationId} AS recommendation_id,
                    ${window.productId} AS product_id,
                    ${window.baselineStartsAt} AS baseline_starts_at,
                    ${window.receivedAt} AS received_at,
                    ${window.followUpEndsAt} AS follow_up_ends_at
                `,
              ),
              ' UNION ALL ',
            )}
          )
          SELECT
            w.recommendation_id AS recommendationId,
            COALESCE(SUM(CASE
              WHEN movement.created_at >= w.baseline_starts_at
                AND movement.created_at < w.received_at
              THEN ABS(movement.qty)
              ELSE 0
            END), 0) AS baselineUnits,
            COUNT(DISTINCT CASE
              WHEN movement.created_at >= w.baseline_starts_at
                AND movement.created_at < w.received_at
              THEN FLOOR(TIMESTAMPDIFF(DAY, w.baseline_starts_at, movement.created_at) / 7)
              ELSE NULL
            END) AS baselineActiveWeeks,
            COALESCE(SUM(CASE
              WHEN movement.created_at >= w.received_at
                AND movement.created_at < w.follow_up_ends_at
              THEN ABS(movement.qty)
              ELSE 0
            END), 0) AS followUpUnits,
            COUNT(DISTINCT CASE
              WHEN movement.created_at >= w.received_at
                AND movement.created_at < w.follow_up_ends_at
              THEN FLOOR(TIMESTAMPDIFF(DAY, w.received_at, movement.created_at) / 7)
              ELSE NULL
            END) AS followUpActiveWeeks
          FROM measurement_windows w
          LEFT JOIN stock_movements movement
            ON movement.business_id = ${scopedBusinessId}
            AND movement.product_id = w.product_id
            AND movement.kind = 'sale'
            AND movement.created_at >= w.baseline_starts_at
            AND movement.created_at < w.follow_up_ends_at
          GROUP BY w.recommendation_id
        `)
      : [];
    const salesComparisonByRecommendation = new Map(
      salesComparisonRows.map((row) => [row.recommendationId, row]),
    );

    return reorderRecommendations.map((recommendation) => {
      const details = recommendation.details as Prisma.JsonObject;
      const productId = details.productId as string;
      const product = productById.get(productId) ?? null;
      const request = requestByRecommendation.get(recommendation.id) ?? null;
      const specialistAction =
        actionByRecommendation.get(recommendation.id) ?? null;
      const purchaseOrder = request?.convertedPurchaseOrderId
        ? (purchaseOrderById.get(request.convertedPurchaseOrderId) ?? null)
        : null;
      const requestedQuantity = request
        ? request.items
            .filter(
              (item) =>
                item.productId === productId && item.lineType === 'stock',
            )
            .reduce((sum, item) => sum + Number(item.quantity), 0)
        : null;
      const purchaseLines =
        purchaseOrder?.items.filter((item) => item.productId === productId) ??
        [];
      const salesComparison = salesComparisonByRecommendation.get(
        recommendation.id,
      );
      const salesWindowStatus = !purchaseOrder
        ? 'not_received'
        : purchaseOrder.status !== PurchaseOrderStatus.received ||
            !purchaseOrder.receivedAt
          ? 'awaiting_receipt'
          : observedAt.getTime() <
              purchaseOrder.receivedAt.getTime() +
                ACTION_OUTCOME_SALES_WINDOW_DAYS * 24 * 60 * 60 * 1000
            ? 'awaiting_window'
            : 'available';

      return {
        recommendationId: recommendation.id,
        title: recommendation.title,
        recommendationStatus: recommendation.status,
        recommendedQuantity:
          typeof details.suggestedQty === 'number'
            ? details.suggestedQty
            : null,
        recommendationCreatedAt: recommendation.createdAt,
        product: product
          ? {
              id: product.id,
              name: product.name,
              currentStock: product.stockQty,
              lowStockThreshold: product.lowStockThreshold,
              observedAt,
            }
          : null,
        procurementRequest: request
          ? {
              id: request.id,
              status: request.status,
              updatedAt: request.updatedAt,
              requestedQuantity,
            }
          : null,
        specialistAction: specialistAction
          ? {
              id: specialistAction.id,
              state: specialistAction.state,
              outcomeMeasurement: readRecordedOutcomeMeasurement(
                specialistAction.actualResult,
              ),
              requiredApproval: specialistAction.requiredApproval,
              executionAttemptCount: specialistAction.executionAttemptCount,
              correlationId: specialistAction.correlationId,
              canonicalOperationId: specialistAction.canonicalOperationId,
              createdAt: specialistAction.createdAt,
              updatedAt: specialistAction.updatedAt,
              approvedAt: specialistAction.approvedAt,
              executedAt: specialistAction.executedAt,
              verifiedAt: specialistAction.verifiedAt,
              lastEvent:
                specialistAction.events[specialistAction.events.length - 1] ??
                null,
              events: specialistAction.events.map((event) => ({
                sequence: event.sequence,
                eventType: event.eventType,
                fromState: event.fromState,
                toState: event.toState,
                reason: event.reason,
                createdAt: event.createdAt,
              })),
            }
          : null,
        purchaseOrder: purchaseOrder
          ? {
              id: purchaseOrder.id,
              status: purchaseOrder.status,
              sentAt: purchaseOrder.sentAt,
              confirmedAt: purchaseOrder.confirmedAt,
              receivedAt: purchaseOrder.receivedAt,
              orderedQuantity: purchaseLines.reduce(
                (sum, item) => sum + item.qtyOrdered,
                0,
              ),
              receivedQuantity: purchaseLines.reduce(
                (sum, item) => sum + item.qtyReceived,
                0,
              ),
            }
          : null,
        recordedSalesComparison: {
          status: salesWindowStatus,
          source: 'Noxtill stock movements (kind=sale)',
          windowDays: ACTION_OUTCOME_SALES_WINDOW_DAYS,
          receivedAt: purchaseOrder?.receivedAt?.toISOString() ?? null,
          baseline:
            salesWindowStatus === 'available' && salesComparison
              ? {
                  recordedUnits: Number(salesComparison.baselineUnits),
                  activeWeeks: Number(salesComparison.baselineActiveWeeks),
                  totalWeeks: ACTION_OUTCOME_SALES_WINDOW_WEEKS,
                  recordedUnitsPerWeek:
                    Number(salesComparison.baselineUnits) /
                    ACTION_OUTCOME_SALES_WINDOW_WEEKS,
                }
              : null,
          followUp:
            salesWindowStatus === 'available' && salesComparison
              ? {
                  recordedUnits: Number(salesComparison.followUpUnits),
                  activeWeeks: Number(salesComparison.followUpActiveWeeks),
                  totalWeeks: ACTION_OUTCOME_SALES_WINDOW_WEEKS,
                  recordedUnitsPerWeek:
                    Number(salesComparison.followUpUnits) /
                    ACTION_OUTCOME_SALES_WINDOW_WEEKS,
                }
              : null,
          note: 'Descriptive comparison of Noxtill stock movements recorded as kind=sale only. Separate return movements, off-platform sales and unrecorded activity are excluded. Weeks without movements are unobserved in this source and do not establish zero real-world demand. The comparison is not attributed to the recommendation.',
        },
        measurementNote:
          'Current stock is a later canonical snapshot and may reflect sales, returns, transfers, counts or other purchases. It is not attributed to this recommendation.',
      };
    });
  }

  /**
   * Advances verified Inventory reorder actions after their canonical purchase order is
   * received and a complete follow-up window has elapsed. The comparison is descriptive only:
   * it records Noxtill sale movements and never attributes the observed change to the agent.
   */
  async advancePendingActionOutcomes(
    businessId: string,
    observedAt = new Date(),
  ) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    const pendingActions = await this.prisma.specialistAgentAction.findMany({
      where: {
        businessId: scopedBusinessId,
        agentKey: AGENT_KEY,
        actionType: 'inventory_reorder_request',
        canonicalResourceType: 'ProcurementRequest',
        state: 'outcome_monitoring',
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        canonicalResourceId: true,
        recommendationId: true,
        recommendation: { select: { details: true } },
      },
    });

    let measured = 0;
    let inconclusive = 0;
    let waiting = 0;
    for (const action of pendingActions) {
      const request = await this.prisma.procurementRequest.findFirst({
        where: {
          id: action.canonicalResourceId,
          businessId: scopedBusinessId,
        },
        select: {
          id: true,
          status: true,
          convertedPurchaseOrderId: true,
        },
      });
      if (!request) {
        await this.finishActionOutcome(scopedBusinessId, action.id, {
          result: 'inconclusive',
          observedAt,
          reason:
            'The canonical Procurement request is no longer available, so its outcome cannot be measured.',
          evidence: { procurementRequestId: action.canonicalResourceId },
        });
        inconclusive += 1;
        continue;
      }
      if (request.status === 'cancelled' || request.status === 'rejected') {
        await this.finishActionOutcome(scopedBusinessId, action.id, {
          result: 'inconclusive',
          observedAt,
          reason: `The Procurement request ended as ${request.status}; no post-action outcome can be measured.`,
          evidence: {
            procurementRequestId: request.id,
            requestStatus: request.status,
          },
        });
        inconclusive += 1;
        continue;
      }
      if (!request.convertedPurchaseOrderId) {
        waiting += 1;
        continue;
      }

      const purchaseOrder = await this.prisma.purchaseOrder.findFirst({
        where: {
          id: request.convertedPurchaseOrderId,
          businessId: scopedBusinessId,
        },
        select: {
          id: true,
          status: true,
          receivedAt: true,
          items: { select: { qtyOrdered: true, qtyReceived: true } },
        },
      });
      if (!purchaseOrder) {
        await this.finishActionOutcome(scopedBusinessId, action.id, {
          result: 'inconclusive',
          observedAt,
          reason:
            'The linked purchase order is no longer available, so its outcome cannot be measured.',
          evidence: {
            procurementRequestId: request.id,
            purchaseOrderId: request.convertedPurchaseOrderId,
          },
        });
        inconclusive += 1;
        continue;
      }
      if (purchaseOrder.status === PurchaseOrderStatus.cancelled) {
        await this.finishActionOutcome(scopedBusinessId, action.id, {
          result: 'inconclusive',
          observedAt,
          reason:
            'The linked purchase order was cancelled before a measurable receipt.',
          evidence: {
            procurementRequestId: request.id,
            purchaseOrderId: purchaseOrder.id,
            purchaseOrderStatus: purchaseOrder.status,
          },
        });
        inconclusive += 1;
        continue;
      }
      if (
        purchaseOrder.status !== PurchaseOrderStatus.received ||
        !purchaseOrder.receivedAt ||
        purchaseOrder.items.length === 0 ||
        purchaseOrder.items.some((item) => item.qtyReceived < item.qtyOrdered)
      ) {
        waiting += 1;
        continue;
      }

      const details = action.recommendation.details as Prisma.JsonObject;
      const productId = details.productId;
      if (typeof productId !== 'string') {
        await this.finishActionOutcome(scopedBusinessId, action.id, {
          result: 'inconclusive',
          observedAt,
          reason:
            'The Inventory recommendation does not identify a product for the recorded-sales comparison.',
          evidence: {
            recommendationId: action.recommendationId,
            purchaseOrderId: purchaseOrder.id,
          },
        });
        inconclusive += 1;
        continue;
      }

      const receivedAt = purchaseOrder.receivedAt;
      const followUpEndsAt = new Date(
        receivedAt.getTime() +
          ACTION_OUTCOME_SALES_WINDOW_DAYS * 24 * 60 * 60 * 1000,
      );
      if (observedAt < followUpEndsAt) {
        waiting += 1;
        continue;
      }
      const baselineStartsAt = new Date(
        receivedAt.getTime() -
          ACTION_OUTCOME_SALES_WINDOW_DAYS * 24 * 60 * 60 * 1000,
      );
      const [comparison] = await this.prisma.$queryRaw<
        Array<{
          baselineUnits: bigint;
          baselineActiveWeeks: bigint;
          followUpUnits: bigint;
          followUpActiveWeeks: bigint;
        }>
      >(Prisma.sql`
        SELECT
          COALESCE(SUM(CASE
            WHEN created_at >= ${baselineStartsAt} AND created_at < ${receivedAt}
            THEN ABS(qty) ELSE 0
          END), 0) AS baselineUnits,
          COUNT(DISTINCT CASE
            WHEN created_at >= ${baselineStartsAt} AND created_at < ${receivedAt}
            THEN FLOOR(TIMESTAMPDIFF(DAY, ${baselineStartsAt}, created_at) / 7)
            ELSE NULL
          END) AS baselineActiveWeeks,
          COALESCE(SUM(CASE
            WHEN created_at >= ${receivedAt} AND created_at < ${followUpEndsAt}
            THEN ABS(qty) ELSE 0
          END), 0) AS followUpUnits,
          COUNT(DISTINCT CASE
            WHEN created_at >= ${receivedAt} AND created_at < ${followUpEndsAt}
            THEN FLOOR(TIMESTAMPDIFF(DAY, ${receivedAt}, created_at) / 7)
            ELSE NULL
          END) AS followUpActiveWeeks
        FROM stock_movements
        WHERE business_id = ${scopedBusinessId}
          AND product_id = ${productId}
          AND kind = 'sale'
          AND created_at >= ${baselineStartsAt}
          AND created_at < ${followUpEndsAt}
      `);
      const baselineActiveWeeks = Number(comparison?.baselineActiveWeeks ?? 0);
      const followUpActiveWeeks = Number(comparison?.followUpActiveWeeks ?? 0);
      const result =
        baselineActiveWeeks > 0 && followUpActiveWeeks > 0
          ? 'measured'
          : 'inconclusive';
      const reason =
        result === 'measured'
          ? 'The 56-day before-and-after comparison is based on recorded Noxtill sale movements only and is not attributed to this recommendation.'
          : 'The follow-up window elapsed, but one or both windows have no recorded sale weeks; absent movements do not establish zero real-world demand, so the outcome is inconclusive.';
      await this.finishActionOutcome(scopedBusinessId, action.id, {
        result,
        observedAt,
        reason,
        evidence: {
          source: 'Noxtill stock movements (kind=sale)',
          recommendationId: action.recommendationId,
          procurementRequestId: request.id,
          purchaseOrderId: purchaseOrder.id,
          productId,
          receivedAt: receivedAt.toISOString(),
          windowDays: ACTION_OUTCOME_SALES_WINDOW_DAYS,
          baseline: {
            recordedUnits: Number(comparison?.baselineUnits ?? 0),
            activeWeeks: baselineActiveWeeks,
            totalWeeks: ACTION_OUTCOME_SALES_WINDOW_WEEKS,
          },
          followUp: {
            recordedUnits: Number(comparison?.followUpUnits ?? 0),
            activeWeeks: followUpActiveWeeks,
            totalWeeks: ACTION_OUTCOME_SALES_WINDOW_WEEKS,
          },
          causalAttribution: false,
        },
      });
      if (result === 'measured') measured += 1;
      else inconclusive += 1;
    }

    return {
      businessId: scopedBusinessId,
      checked: pendingActions.length,
      measured,
      inconclusive,
      waiting,
    };
  }

  private async finishActionOutcome(
    businessId: string,
    actionId: string,
    input: {
      result: 'measured' | 'inconclusive';
      observedAt: Date;
      reason: string;
      evidence: Prisma.InputJsonObject;
    },
  ) {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.specialistAgentAction.findFirst({
        where: { id: actionId, businessId, state: 'outcome_monitoring' },
        select: { actualResult: true },
      });
      if (!current) return;
      const nextState =
        input.result === 'measured'
          ? 'outcome_measured'
          : 'outcome_inconclusive';
      await transitionSpecialistAgentAction(
        tx as unknown as Parameters<typeof transitionSpecialistAgentAction>[0],
        {
          businessId,
          actionId,
          fromState: 'outcome_monitoring',
          toState: nextState,
          actorUserId: null,
          eventType: nextState,
          reason: input.reason,
          metadata: {
            observedAt: input.observedAt.toISOString(),
            ...input.evidence,
          },
          update: {
            actualResult: {
              ...(current.actualResult as Prisma.JsonObject),
              outcomeMeasurement: {
                result: input.result,
                observedAt: input.observedAt.toISOString(),
                reason: input.reason,
                ...input.evidence,
              },
            } as Prisma.InputJsonObject,
          },
        },
      );
    });
  }

  async requestCountTask(
    businessId: string,
    actorUserId: string,
    recommendationId: string,
  ) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    await this.agentPolicy.assertEnabled(scopedBusinessId, 'inventory');
    const recommendation =
      await this.tenantPrisma.client.specialistAgentRecommendation.findFirst({
        where: {
          id: recommendationId,
          businessId: scopedBusinessId,
          agentKey: AGENT_KEY,
        },
        select: { id: true, details: true, summary: true },
      });
    if (!recommendation) {
      throw new AppException(
        'INVENTORY_AGENT_RECOMMENDATION_NOT_FOUND',
        'This Inventory Agent finding is not available in the current business.',
        HttpStatus.NOT_FOUND,
      );
    }
    const details = recommendation.details as Prisma.JsonObject;
    const signalType = details.signalType;
    const productId = details.productId;
    if (
      (signalType !== 'count_variance' &&
        signalType !== 'repeated_count_variance') ||
      typeof productId !== 'string'
    ) {
      throw new AppException(
        'INVENTORY_AGENT_COUNT_TASK_NOT_AVAILABLE',
        'A recount request can only be created from a stock-count discrepancy finding.',
        HttpStatus.CONFLICT,
      );
    }
    const product = await this.tenantPrisma.client.product.findFirst({
      where: {
        id: productId,
        businessId: scopedBusinessId,
        active: true,
      },
      select: { id: true },
    });
    if (!product) {
      throw new AppException(
        'INVENTORY_AGENT_PRODUCT_NOT_FOUND',
        'The product from this finding is no longer active in the current business.',
        HttpStatus.CONFLICT,
      );
    }

    return this.tenantPrisma.client.$transaction(async (tx) => {
      const existing = await tx.inventoryAgentCountTask.findUnique({
        where: { sourceRecommendationId: recommendation.id },
      });
      const task = await tx.inventoryAgentCountTask.upsert({
        where: { sourceRecommendationId: recommendation.id },
        create: {
          businessId: scopedBusinessId,
          productId: product.id,
          sourceRecommendationId: recommendation.id,
          requestedByUserId: actorUserId,
          reason: recommendation.summary,
        },
        update: {},
      });
      await tx.auditLog.create({
        data: {
          businessId: scopedBusinessId,
          actorUserId,
          action: 'inventory_agent.count_task_requested',
          entity: 'InventoryAgentCountTask',
          entityId: task.id,
          before: existing
            ? { status: existing.status, stockCountId: existing.stockCountId }
            : Prisma.JsonNull,
          after: {
            status: task.status,
            productId: task.productId,
            sourceRecommendationId: task.sourceRecommendationId,
            stockCountId: task.stockCountId,
          },
        },
      });
      return task;
    });
  }

  async prepareBranchTransfer(
    businessId: string,
    actorUserId: string,
    recommendationId: string,
  ) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    await this.agentPolicy.assertEnabled(scopedBusinessId, 'inventory');
    const recommendation =
      await this.tenantPrisma.client.specialistAgentRecommendation.findFirst({
        where: {
          id: recommendationId,
          businessId: scopedBusinessId,
          agentKey: AGENT_KEY,
        },
        select: { id: true, details: true },
      });
    if (!recommendation) {
      throw new AppException(
        'INVENTORY_AGENT_RECOMMENDATION_NOT_FOUND',
        'This Inventory Agent finding is not available in the current business.',
        HttpStatus.NOT_FOUND,
      );
    }
    const details = recommendation.details as Prisma.JsonObject;
    if (details.signalType !== 'branch_rebalance') {
      throw new AppException(
        'INVENTORY_AGENT_TRANSFER_NOT_AVAILABLE',
        'A transfer request can only be prepared from a branch-rebalance finding.',
        HttpStatus.CONFLICT,
      );
    }
    if (details.sourceBusinessId !== scopedBusinessId) {
      throw new AppException(
        'INVENTORY_AGENT_TRANSFER_SOURCE_REQUIRED',
        'Open this finding from its source branch before preparing a transfer request.',
        HttpStatus.CONFLICT,
      );
    }

    const existing = await this.prisma.stockTransfer.findUnique({
      where: { sourceSpecialistAgentRecommendationId: recommendation.id },
      include: { items: { include: { sourceProduct: true } } },
    });
    if (existing) return existing;

    // Recalculate through the same canonical branch-rebalance computation. A saved finding can
    // be stale by the time a person asks for a transfer; do not turn stale evidence into a draft.
    const currentReview = await this.buildBranchRebalanceRecommendations(
      scopedBusinessId,
      new Date(),
    );
    const currentFinding = currentReview.recommendations.find((candidate) => {
      const candidateDetails = candidate.details;
      return (
        candidateDetails.signalType === 'branch_rebalance' &&
        candidateDetails.sourceBusinessId === details.sourceBusinessId &&
        candidateDetails.destinationBusinessId ===
          details.destinationBusinessId &&
        candidateDetails.sourceProductId === details.sourceProductId
      );
    });
    if (!currentFinding) {
      throw new AppException(
        'INVENTORY_AGENT_TRANSFER_FINDING_STALE',
        'The branch-rebalance conditions have changed. Run Inventory Intelligence again before preparing a transfer request.',
        HttpStatus.CONFLICT,
      );
    }
    const currentDetails = currentFinding.details;
    const destinationBusinessId = currentDetails.destinationBusinessId;
    const sourceProductId = currentDetails.sourceProductId;
    const quantity = currentDetails.suggestedQty;
    if (
      typeof destinationBusinessId !== 'string' ||
      typeof sourceProductId !== 'string' ||
      typeof quantity !== 'number' ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1
    ) {
      throw new AppException(
        'INVENTORY_AGENT_TRANSFER_FINDING_INVALID',
        'The current branch-rebalance finding does not contain a valid transfer request.',
        HttpStatus.CONFLICT,
      );
    }

    try {
      const transfer = await this.stockTransfers.create(
        scopedBusinessId,
        actorUserId,
        {
          destBusinessId: destinationBusinessId,
          note: `Prepared from Inventory Intelligence finding ${recommendation.id}; review and approve in Stock Transfers.`,
          items: [{ productId: sourceProductId, qty: quantity }],
        },
        recommendation.id,
      );
      await this.prisma.auditLog.create({
        data: {
          businessId: scopedBusinessId,
          actorUserId,
          action: 'inventory_agent.branch_transfer_draft_prepared',
          entity: 'StockTransfer',
          entityId: transfer.id,
          before: Prisma.JsonNull,
          after: {
            status: transfer.status,
            sourceBusinessId: transfer.sourceBusinessId,
            destBusinessId: transfer.destBusinessId,
            sourceProductId,
            quantity,
            sourceRecommendationId: recommendation.id,
          },
        },
      });
      return transfer;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const concurrent = await this.prisma.stockTransfer.findUnique({
          where: { sourceSpecialistAgentRecommendationId: recommendation.id },
          include: { items: { include: { sourceProduct: true } } },
        });
        if (concurrent) return concurrent;
      }
      throw error;
    }
  }

  async dismissCountTask(
    businessId: string,
    actorUserId: string,
    taskId: string,
    rawReason: string,
  ) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    const reason = rawReason?.trim();
    if (!reason || reason.length < 5 || reason.length > 500) {
      throw new AppException(
        'INVENTORY_AGENT_COUNT_TASK_DISMISS_REASON_INVALID',
        'Enter a dismissal reason between 5 and 500 characters.',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.tenantPrisma.client.$transaction(async (tx) => {
      const updated = await tx.inventoryAgentCountTask.updateMany({
        where: { id: taskId, businessId: scopedBusinessId, status: 'open' },
        data: {
          status: 'dismissed',
          dismissedByUserId: actorUserId,
          dismissReason: reason,
          dismissedAt: new Date(),
        },
      });
      if (updated.count !== 1) {
        const existing = await tx.inventoryAgentCountTask.findFirst({
          where: { id: taskId, businessId: scopedBusinessId },
          select: { id: true },
        });
        if (!existing) {
          throw new AppException(
            'INVENTORY_AGENT_COUNT_TASK_NOT_FOUND',
            'This recount request is not available in the current business.',
            HttpStatus.NOT_FOUND,
          );
        }
        throw new AppException(
          'INVENTORY_AGENT_COUNT_TASK_NOT_OPEN',
          'Only an open recount request can be dismissed.',
          HttpStatus.CONFLICT,
        );
      }

      const task = await tx.inventoryAgentCountTask.findUniqueOrThrow({
        where: { id: taskId },
      });
      await tx.auditLog.create({
        data: {
          businessId: scopedBusinessId,
          actorUserId,
          action: 'inventory_agent.count_task_dismissed',
          entity: 'InventoryAgentCountTask',
          entityId: task.id,
          before: { status: 'open', stockCountId: task.stockCountId },
          after: {
            status: task.status,
            dismissReason: task.dismissReason,
            dismissedByUserId: task.dismissedByUserId,
            dismissedAt: task.dismissedAt?.toISOString() ?? null,
          },
        },
      });
      return task;
    });
  }

  async dismissReorderRecommendation(
    businessId: string,
    actorUserId: string,
    recommendationId: string,
    rawReason: string,
  ) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    await this.agentPolicy.assertEnabled(scopedBusinessId, 'inventory');
    const reason = rawReason?.trim();
    if (!reason || reason.length < 5 || reason.length > 500) {
      throw new AppException(
        'INVENTORY_AGENT_RECOMMENDATION_DISMISS_REASON_INVALID',
        'Enter a dismissal reason between 5 and 500 characters.',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.tenantPrisma.client.$transaction(async (tx) => {
      const recommendation = await tx.specialistAgentRecommendation.findFirst({
        where: {
          id: recommendationId,
          businessId: scopedBusinessId,
          agentKey: AGENT_KEY,
        },
        include: { run: { select: { status: true } } },
      });
      if (!recommendation) {
        throw new AppException(
          'INVENTORY_AGENT_RECOMMENDATION_NOT_FOUND',
          'This Inventory Agent finding is not available in the current business.',
          HttpStatus.NOT_FOUND,
        );
      }
      const details = recommendation.details as Prisma.JsonObject;
      if (details.signalType !== 'reorder') {
        throw new AppException(
          'INVENTORY_AGENT_RECOMMENDATION_NOT_DISMISSIBLE',
          'Only a saved reorder finding can be dismissed from this action.',
          HttpStatus.CONFLICT,
        );
      }
      if (
        recommendation.run.status !== 'completed' ||
        recommendation.status !== 'proposed'
      ) {
        throw new AppException(
          'INVENTORY_AGENT_RECOMMENDATION_NOT_OPEN',
          'Only an open reorder finding from a completed review can be dismissed.',
          HttpStatus.CONFLICT,
        );
      }

      const updated = await tx.specialistAgentRecommendation.updateMany({
        where: {
          id: recommendation.id,
          businessId: scopedBusinessId,
          agentKey: AGENT_KEY,
          status: 'proposed',
        },
        data: { status: 'dismissed' },
      });
      if (updated.count !== 1) {
        throw new AppException(
          'INVENTORY_AGENT_RECOMMENDATION_NOT_OPEN',
          'This reorder finding was already handled. Refresh the review before taking another action.',
          HttpStatus.CONFLICT,
        );
      }
      const dismissed = await tx.specialistAgentRecommendation.findFirstOrThrow(
        {
          where: { id: recommendation.id, businessId: scopedBusinessId },
        },
      );
      await tx.auditLog.create({
        data: {
          businessId: scopedBusinessId,
          actorUserId,
          action: 'inventory_agent.reorder_recommendation_dismissed',
          entity: 'SpecialistAgentRecommendation',
          entityId: recommendation.id,
          before: {
            status: recommendation.status,
            runId: recommendation.runId,
          },
          after: {
            status: dismissed.status,
            reason,
            signalType: details.signalType,
            productId:
              typeof details.productId === 'string' ? details.productId : null,
          },
        },
      });
      return dismissed;
    });
  }

  async requestWastageReviewTask(
    businessId: string,
    actorUserId: string,
    recommendationId: string,
  ) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    await this.agentPolicy.assertEnabled(scopedBusinessId, 'inventory');
    const recommendation =
      await this.tenantPrisma.client.specialistAgentRecommendation.findFirst({
        where: {
          id: recommendationId,
          businessId: scopedBusinessId,
          agentKey: AGENT_KEY,
        },
        select: { id: true, details: true, summary: true },
      });
    if (!recommendation) {
      throw new AppException(
        'INVENTORY_AGENT_RECOMMENDATION_NOT_FOUND',
        'This Inventory Agent finding is not available in the current business.',
        HttpStatus.NOT_FOUND,
      );
    }
    const details = recommendation.details as Prisma.JsonObject;
    const productId = details.productId;
    if (
      details.signalType !== 'wastage_review' ||
      typeof productId !== 'string'
    ) {
      throw new AppException(
        'INVENTORY_AGENT_WASTAGE_TASK_NOT_AVAILABLE',
        'A wastage review task can only be created from recorded-wastage findings.',
        HttpStatus.CONFLICT,
      );
    }
    const product = await this.tenantPrisma.client.product.findFirst({
      where: { id: productId, businessId: scopedBusinessId, active: true },
      select: { id: true },
    });
    if (!product) {
      throw new AppException(
        'INVENTORY_AGENT_PRODUCT_NOT_FOUND',
        'The product from this finding is no longer active in the current business.',
        HttpStatus.CONFLICT,
      );
    }

    return this.tenantPrisma.client.$transaction(async (tx) => {
      const existing = await tx.inventoryAgentWastageReviewTask.findUnique({
        where: { sourceRecommendationId: recommendation.id },
      });
      const task = await tx.inventoryAgentWastageReviewTask.upsert({
        where: { sourceRecommendationId: recommendation.id },
        create: {
          businessId: scopedBusinessId,
          productId: product.id,
          sourceRecommendationId: recommendation.id,
          requestedByUserId: actorUserId,
          reason: recommendation.summary,
        },
        update: {},
      });
      await tx.auditLog.create({
        data: {
          businessId: scopedBusinessId,
          actorUserId,
          action: 'inventory_agent.wastage_review_task_requested',
          entity: 'InventoryAgentWastageReviewTask',
          entityId: task.id,
          before: existing ? { status: existing.status } : Prisma.JsonNull,
          after: {
            status: task.status,
            productId: task.productId,
            sourceRecommendationId: task.sourceRecommendationId,
          },
        },
      });
      return task;
    });
  }

  async resolveWastageReviewTask(
    businessId: string,
    actorUserId: string,
    taskId: string,
    rawNote: string,
  ) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    const note = rawNote?.trim();
    if (!note || note.length < 5 || note.length > 500) {
      throw new AppException(
        'INVENTORY_AGENT_WASTAGE_TASK_NOTE_INVALID',
        'Enter a review note between 5 and 500 characters.',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.tenantPrisma.client.$transaction(async (tx) => {
      const updated = await tx.inventoryAgentWastageReviewTask.updateMany({
        where: { id: taskId, businessId: scopedBusinessId, status: 'open' },
        data: {
          status: 'reviewed',
          reviewedByUserId: actorUserId,
          reviewNote: note,
          reviewedAt: new Date(),
        },
      });
      if (updated.count !== 1) {
        const existing = await tx.inventoryAgentWastageReviewTask.findFirst({
          where: { id: taskId, businessId: scopedBusinessId },
          select: { id: true },
        });
        if (!existing) {
          throw new AppException(
            'INVENTORY_AGENT_WASTAGE_TASK_NOT_FOUND',
            'This wastage review task is not available in the current business.',
            HttpStatus.NOT_FOUND,
          );
        }
        throw new AppException(
          'INVENTORY_AGENT_WASTAGE_TASK_NOT_OPEN',
          'Only an open wastage review task can be resolved.',
          HttpStatus.CONFLICT,
        );
      }
      const task = await tx.inventoryAgentWastageReviewTask.findUniqueOrThrow({
        where: { id: taskId },
      });
      await tx.auditLog.create({
        data: {
          businessId: scopedBusinessId,
          actorUserId,
          action: 'inventory_agent.wastage_review_task_resolved',
          entity: 'InventoryAgentWastageReviewTask',
          entityId: task.id,
          before: { status: 'open' },
          after: {
            status: task.status,
            reviewNote: task.reviewNote,
            reviewedByUserId: task.reviewedByUserId,
            reviewedAt: task.reviewedAt?.toISOString() ?? null,
          },
        },
      });
      return task;
    });
  }

  async dismissWastageReviewTask(
    businessId: string,
    actorUserId: string,
    taskId: string,
    rawReason: string,
  ) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    const reason = rawReason?.trim();
    if (!reason || reason.length < 5 || reason.length > 500) {
      throw new AppException(
        'INVENTORY_AGENT_WASTAGE_TASK_DISMISS_REASON_INVALID',
        'Enter a dismissal reason between 5 and 500 characters.',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.tenantPrisma.client.$transaction(async (tx) => {
      const updated = await tx.inventoryAgentWastageReviewTask.updateMany({
        where: { id: taskId, businessId: scopedBusinessId, status: 'open' },
        data: {
          status: 'dismissed',
          dismissedByUserId: actorUserId,
          dismissReason: reason,
          dismissedAt: new Date(),
        },
      });
      if (updated.count !== 1) {
        const existing = await tx.inventoryAgentWastageReviewTask.findFirst({
          where: { id: taskId, businessId: scopedBusinessId },
          select: { id: true },
        });
        if (!existing) {
          throw new AppException(
            'INVENTORY_AGENT_WASTAGE_TASK_NOT_FOUND',
            'This wastage review task is not available in the current business.',
            HttpStatus.NOT_FOUND,
          );
        }
        throw new AppException(
          'INVENTORY_AGENT_WASTAGE_TASK_NOT_OPEN',
          'Only an open wastage review task can be dismissed.',
          HttpStatus.CONFLICT,
        );
      }
      const task = await tx.inventoryAgentWastageReviewTask.findUniqueOrThrow({
        where: { id: taskId },
      });
      await tx.auditLog.create({
        data: {
          businessId: scopedBusinessId,
          actorUserId,
          action: 'inventory_agent.wastage_review_task_dismissed',
          entity: 'InventoryAgentWastageReviewTask',
          entityId: task.id,
          before: { status: 'open' },
          after: {
            status: task.status,
            dismissReason: task.dismissReason,
            dismissedByUserId: task.dismissedByUserId,
            dismissedAt: task.dismissedAt?.toISOString() ?? null,
          },
        },
      });
      return task;
    });
  }

  async run(
    businessId: string,
    actorUserId: string | null,
    idempotencyKey?: string,
    options: SpecialistAgentRunOptions = {},
  ) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    await this.agentPolicy.assertEnabled(scopedBusinessId, 'inventory');
    const policyOwner = await this.prisma.business.findUnique({
      where: { id: scopedBusinessId },
      select: { policies: true },
    });
    if (!policyOwner) {
      throw new AppException(
        'INVENTORY_AGENT_BUSINESS_NOT_FOUND',
        'The current business could not be resolved for this Inventory review.',
        HttpStatus.NOT_FOUND,
      );
    }
    const minimumCountVarianceUnits = resolvePolicies(policyOwner).num(
      'inventory.agentCountVarianceMinimumUnits',
    );
    const reorderLeadTimeDays =
      resolvePolicies(policyOwner).num('inventory.agentReorderLeadTimeDays') ??
      REORDER_LEAD_TIME_DAYS;
    const branchGroupBusinesses =
      await this.resolveActiveBranchGroupBusinesses(scopedBusinessId);
    const startedAt = new Date();
    const runData: Prisma.SpecialistAgentRunUncheckedCreateInput = {
      businessId: scopedBusinessId,
      agentKey: AGENT_KEY,
      agentVersion: AGENT_VERSION,
      moduleId: '13',
      triggerType: options.triggerType ?? 'manual',
      status: 'running',
      initiatedByUserId: actorUserId,
      inputRefs: [
        ...(options.parentRunId
          ? [createSpecialistAgentParentRunRef(options.parentRunId)]
          : []),
        ...(options.triggerRef ? [options.triggerRef] : []),
        {
          source: 'ReorderSuggestionsService.list',
          formulaVersion: FORMULA_VERSION,
          salesWindowDays: REORDER_VELOCITY_WINDOW_DAYS,
          baselineLeadTimeDays: reorderLeadTimeDays,
          productInputs: ['Product.minimumReorderQty'],
        },
        {
          source: 'ProcurementSupplierContract',
          fields: [
            'minimumOrderQty',
            'currency',
            'categories',
            'effectiveFrom',
            'expiresAt',
            'termsConfirmedAt',
          ],
          filter:
            'active, terms-confirmed, effective contracts for the last recorded purchase supplier',
          role: 'subtract_unreceived_quantity_from_agent_proposal_only',
        },
        {
          source: 'PurchaseOrder.sentAt_to_receivedAt',
          status: PurchaseOrderStatus.received,
          lookbackDays: SUPPLIER_LEAD_TIME_LOOKBACK_DAYS,
          pairKey: 'supplierId+productId',
          sampleLimit: SUPPLIER_LEAD_TIME_SAMPLE_LIMIT,
          role: 'historical_elapsed_time_context_only_not_a_supplier_sla_or_formula_input',
        },
        {
          source: 'ProductWaitlistEntry.groupBy',
          statusFilter: 'not_notified',
          productFilters: ['active', 'tracked_product', 'positive_on_hand'],
          customerDetailsRead: false,
        },
        {
          source: 'BranchGroup.products_stock_movements_stock_transfers',
          scopeBusinessIds: branchGroupBusinesses.map((branch) => branch.id),
          lookbackDays: REORDER_VELOCITY_WINDOW_DAYS,
          senderExcessCoverDays: BRANCH_REBALANCE_COVER_DAYS,
          destinationRisk: 'canonical_low_stock_threshold_after_open_inbound',
          reservations: 'no_separate_reservation_ledger_exists',
        },
        {
          source: 'StockMovement.adjustment_from_applied_stock_counts',
          lookbackDays: COUNT_VARIANCE_REVIEW_WINDOW_DAYS,
          countIdMustExistAndBeApplied: true,
          minimumAbsoluteAdjustmentUnits: minimumCountVarianceUnits,
          thresholdMeaning: 'aggregate_absolute_adjustment_units',
        },
        {
          source: 'InventoryService.listInventory.stockValue',
          valuation: 'canonical_stock_qty_times_cost_price',
          includesZeroCostPriceRows: true,
        },
      ],
      policyResult: {
        autonomyLevel: 'L0',
        riskTier: 'low',
        readOnly: true,
        writesCanonicalInventory: false,
      },
    };
    const reservation = await createOrReuseSpecialistAgentRun(
      (data) =>
        this.tenantPrisma.client.$transaction(async (tx) => {
          const run = await tx.specialistAgentRun.create({ data });
          await recordSpecialistAgentRunCreatedEvent(tx, run);
          return run;
        }),
      (keyBusinessId, agentKey, idempotencyKeyHash) =>
        this.tenantPrisma.client.specialistAgentRun.findFirst({
          where: {
            businessId: keyBusinessId,
            agentKey,
            idempotencyKeyHash,
          },
        }),
      runData,
      idempotencyKey,
      { businessId: scopedBusinessId },
      (configBusinessId, agentKey) =>
        ensureSpecialistAgentConfigVersion(
          this.prisma,
          configBusinessId,
          agentKey,
        ),
    );
    const run = reservation.run;
    if (reservation.reused) {
      return this.tenantPrisma.client.specialistAgentRun.findFirstOrThrow({
        where: {
          id: run.id,
          businessId: scopedBusinessId,
          agentKey: AGENT_KEY,
        },
        include: {
          recommendations: {
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            include: {
              evidence: { orderBy: [{ fetchedAt: 'asc' }, { id: 'asc' }] },
              inventoryCountTask: true,
              inventoryWastageReviewTask: true,
              stockTransfer: {
                select: { id: true, status: true, createdAt: true },
              },
              procurementRequest: {
                select: { id: true, status: true, version: true },
              },
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

    try {
      const observedAt = new Date();
      const wastageCutoff = new Date(
        observedAt.getTime() -
          REORDER_VELOCITY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
      );
      const demandHistoryCutoff = new Date(
        observedAt.getTime() -
          DEMAND_COMPARISON_HISTORY_WEEKS * 7 * 24 * 60 * 60 * 1000,
      );
      const [
        groups,
        inventoryRows,
        activeProductRows,
        draftCounts,
        wastageRows,
        openOrders,
        weeklyDemandRows,
        pendingBackInStockRows,
        branchRebalance,
        repeatedCountVariances,
      ] = await Promise.all([
        this.toolGateway
          .execute({
            agentKey: AGENT_KEY,
            moduleId: '13',
            businessId: scopedBusinessId,
            actorUserId,
            runId: run.id,
            correlationId: run.id,
            round: 1,
            sequence: 1,
            toolKey: INVENTORY_REORDER_TOOL_KEY,
            input: { leadTimeDays: String(reorderLeadTimeDays) },
            mode: 'read_only',
            authorize: () =>
              this.agentPolicy.assertEnabled(scopedBusinessId, 'inventory'),
          })
          .then((result) => {
            if (!Array.isArray(result.output)) {
              throw new AppException(
                'INVENTORY_AGENT_TOOL_OUTPUT_INVALID',
                'The reorder suggestion tool returned an invalid result.',
                HttpStatus.BAD_GATEWAY,
              );
            }
            return result.output as ReorderSuggestionGroup[];
          }),
        this.inventoryService.listInventory(),
        this.tenantPrisma.client.product.findMany({
          where: {
            businessId: scopedBusinessId,
            active: true,
            kind: ProductKind.product,
          },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          select: { id: true },
        }),
        this.stockCountService.list(StockCountStatus.draft),
        this.tenantPrisma.client.stockMovement.groupBy({
          by: ['productId'],
          where: {
            businessId: scopedBusinessId,
            kind: StockMovementKind.wastage,
            createdAt: { gte: wastageCutoff },
          },
          _sum: { qty: true },
          _count: { _all: true },
          _max: { createdAt: true },
        }),
        this.tenantPrisma.client.purchaseOrder.findMany({
          where: {
            businessId: scopedBusinessId,
            status: {
              in: [
                PurchaseOrderStatus.sent,
                PurchaseOrderStatus.confirmed,
                PurchaseOrderStatus.partially_received,
              ],
            },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: {
            items: {
              select: {
                productId: true,
                qtyOrdered: true,
                qtyReceived: true,
              },
            },
          },
        }),
        this.tenantPrisma.client.$queryRaw<WeeklyDemandRow[]>`
            SELECT demand.productId, demand.weeksAgo,
              SUM(demand.recordedUnits) AS recordedUnits,
              MAX(demand.createdAt) AS lastRecordedAt
            FROM (
              SELECT sm.product_id AS productId,
                FLOOR(TIMESTAMPDIFF(HOUR, sm.created_at, ${observedAt}) / 168) AS weeksAgo,
                ABS(sm.qty) AS recordedUnits,
                sm.created_at AS createdAt
              FROM stock_movements sm
              INNER JOIN products p ON p.id = sm.product_id AND p.business_id = sm.business_id
              WHERE sm.business_id = ${scopedBusinessId}
                AND sm.kind = ${StockMovementKind.sale}
                AND sm.created_at >= ${demandHistoryCutoff}
                AND sm.created_at < ${observedAt}
                AND p.active = true
                AND p.kind = 'product'
            ) demand
            GROUP BY demand.productId, demand.weeksAgo
            ORDER BY demand.productId ASC, demand.weeksAgo ASC
          `,
        this.tenantPrisma.client.productWaitlistEntry.groupBy({
          by: ['productId'],
          where: {
            businessId: scopedBusinessId,
            notifiedAt: null,
            product: {
              is: {
                active: true,
                kind: ProductKind.product,
                stockQty: { gt: 0 },
              },
            },
          },
          _count: { _all: true },
          _min: { createdAt: true },
          orderBy: { productId: 'asc' },
        }),
        this.buildBranchRebalanceRecommendations(
          scopedBusinessId,
          observedAt,
          branchGroupBusinesses,
        ),
        this.buildRepeatedStockCountRecommendations(
          scopedBusinessId,
          observedAt,
          minimumCountVarianceUnits,
        ),
      ]);
      const items = groups.flatMap((group) =>
        group.items.map((item) => ({
          ...item,
          supplierId:
            group.supplierId === 'unassigned' ? null : group.supplierId,
          supplierName: group.supplierName,
        })),
      );
      const reorderSupplierIds = [
        ...new Set(
          items
            .map((item) => item.supplierId)
            .filter((supplierId): supplierId is string => Boolean(supplierId)),
        ),
      ];
      const supplierContracts = reorderSupplierIds.length
        ? await this.tenantPrisma.client.procurementSupplierContract.findMany({
            where: {
              businessId: scopedBusinessId,
              supplierId: { in: reorderSupplierIds },
              status: 'active',
              termsConfirmedAt: { not: null },
              effectiveFrom: { lte: observedAt },
              OR: [{ expiresAt: null }, { expiresAt: { gte: observedAt } }],
            },
            select: {
              id: true,
              supplierId: true,
              reference: true,
              title: true,
              currency: true,
              categories: true,
              minimumOrderQty: true,
              effectiveFrom: true,
              expiresAt: true,
              termsConfirmedAt: true,
              version: true,
            },
            orderBy: [{ effectiveFrom: 'desc' }, { id: 'asc' }],
            take: 500,
          })
        : [];
      const supplierContractsBySupplier = new Map<
        string,
        typeof supplierContracts
      >();
      for (const contract of supplierContracts) {
        const current =
          supplierContractsBySupplier.get(contract.supplierId) ?? [];
        current.push(contract);
        supplierContractsBySupplier.set(contract.supplierId, current);
      }
      const reorderProductIds = [
        ...new Set(items.map((item) => item.productId)),
      ];
      const supplierLeadTimeCutoff = new Date(
        observedAt.getTime() -
          SUPPLIER_LEAD_TIME_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
      );
      const completedSupplierPurchaseOrders =
        reorderSupplierIds.length > 0 && reorderProductIds.length > 0
          ? await this.tenantPrisma.client.purchaseOrder.findMany({
              where: {
                businessId: scopedBusinessId,
                supplierId: { in: reorderSupplierIds },
                status: PurchaseOrderStatus.received,
                sentAt: { not: null },
                receivedAt: { gte: supplierLeadTimeCutoff },
                items: { some: { productId: { in: reorderProductIds } } },
              },
              select: {
                id: true,
                supplierId: true,
                sentAt: true,
                receivedAt: true,
                items: {
                  where: { productId: { in: reorderProductIds } },
                  select: { productId: true },
                },
              },
              orderBy: [{ receivedAt: 'desc' }, { id: 'asc' }],
              take: SUPPLIER_LEAD_TIME_SAMPLE_LIMIT + 1,
            })
          : [];
      const leadTimeSampleTruncated =
        completedSupplierPurchaseOrders.length >
        SUPPLIER_LEAD_TIME_SAMPLE_LIMIT;
      const leadTimeObservationsBySupplierProduct = new Map<string, number[]>();
      for (const order of completedSupplierPurchaseOrders.slice(
        0,
        SUPPLIER_LEAD_TIME_SAMPLE_LIMIT,
      )) {
        if (!order.sentAt || !order.receivedAt) continue;
        const elapsedDays =
          (order.receivedAt.getTime() - order.sentAt.getTime()) /
          (24 * 60 * 60 * 1000);
        if (!Number.isFinite(elapsedDays) || elapsedDays < 0) continue;
        for (const orderItem of order.items) {
          const key = `${order.supplierId}:${orderItem.productId}`;
          const observations =
            leadTimeObservationsBySupplierProduct.get(key) ?? [];
          observations.push(Math.round(elapsedDays * 10) / 10);
          leadTimeObservationsBySupplierProduct.set(key, observations);
        }
      }
      const inventoryById = new Map(inventoryRows.map((row) => [row.id, row]));
      const inventoryValuation = {
        productRowCount: inventoryRows.length,
        stockValueAtCost: inventoryRows.reduce(
          (sum, row) => sum + row.stockValue,
          0,
        ),
        overstockFlaggedValueAtCost: inventoryRows
          .filter((row) => row.overstocked)
          .reduce((sum, row) => sum + row.stockValue, 0),
        zeroCostPriceRowCount: inventoryRows.filter(
          (row) => row.costPrice === 0,
        ).length,
      };
      const incomingPurchaseQtyByProduct = new Map<string, number>();
      const incomingTransferQtyByProduct = new Map<string, number>();
      for (const order of openOrders) {
        for (const orderItem of order.items) {
          const outstanding = Math.max(
            0,
            orderItem.qtyOrdered - orderItem.qtyReceived,
          );
          incomingPurchaseQtyByProduct.set(
            orderItem.productId,
            (incomingPurchaseQtyByProduct.get(orderItem.productId) ?? 0) +
              outstanding,
          );
        }
      }
      const inventoryTransferAvailability = await branchTransferAvailability(
        this.prisma,
        scopedBusinessId,
        inventoryRows.map(({ id, sku }) => ({ id, sku })),
      );
      for (const [productId, availability] of inventoryTransferAvailability) {
        incomingTransferQtyByProduct.set(productId, availability.incomingQty);
      }
      const agentItems = items.map((item) => {
        const incomingPurchaseQty = item.incomingPurchaseQty;
        const incomingTransferQty = item.incomingTransferQty;
        const incomingSupplyQty = incomingPurchaseQty + incomingTransferQty;
        const unroundedAdditionalQty = Math.max(
          0,
          item.baseSuggestedQty - incomingSupplyQty,
        );
        const minimumAdjustedQty = applyMinimumReorderQty(
          unroundedAdditionalQty,
          item.minimumReorderQty,
        );
        const roundedAdditionalQty = roundUpToPurchasePack(
          minimumAdjustedQty,
          item.purchasePackSize,
        );
        return {
          ...item,
          incomingPurchaseQty,
          incomingTransferQty,
          incomingSupplyQty,
          unroundedAdditionalQty,
          minimumAdjustedQty,
          suggestedQty: roundedAdditionalQty.stockQuantity,
          purchasePackCount: roundedAdditionalQty.purchaseUnitCount,
        };
      });
      const groupsForAiSummary = groups
        .map((group) => ({
          supplierName: group.supplierName,
          items: group.items.flatMap((item) => {
            const agentItem = agentItems.find(
              (candidate) => candidate.productId === item.productId,
            );
            return agentItem && agentItem.suggestedQty > 0
              ? [
                  {
                    name: item.name,
                    currentStock: item.currentStock,
                    velocityPerDay: item.velocityPerDay,
                    suggestedQty: agentItem.suggestedQty,
                    baseSuggestedQty: agentItem.baseSuggestedQty,
                    incomingPurchaseQty: agentItem.incomingPurchaseQty,
                    incomingTransferQty: agentItem.incomingTransferQty,
                    incomingSupplyQty: agentItem.incomingSupplyQty,
                    committedOutboundTransferQty:
                      agentItem.committedOutboundTransferQty,
                    minimumReorderQty: agentItem.minimumReorderQty,
                    minimumAdjustedQty: agentItem.minimumAdjustedQty,
                    purchasePackSize: agentItem.purchasePackSize,
                    purchasePackCount: agentItem.purchasePackCount,
                    stockUnitLabel: agentItem.stockUnitLabel,
                    purchaseUnitLabel: agentItem.purchaseUnitLabel,
                    baselineLeadTimeDays: agentItem.baselineLeadTimeDays,
                  },
                ]
              : [];
          }),
        }))
        .filter((group) => group.items.length > 0);

      const demandHistoryByProduct = new Map<
        string,
        { weeklySales: number[]; lastRecordedAt: Date | null }
      >();
      for (const row of weeklyDemandRows) {
        const weeksAgo = Number(row.weeksAgo);
        if (
          !Number.isInteger(weeksAgo) ||
          weeksAgo < 0 ||
          weeksAgo >= DEMAND_COMPARISON_HISTORY_WEEKS
        ) {
          continue;
        }
        const history = demandHistoryByProduct.get(row.productId) ?? {
          weeklySales: Array.from(
            { length: DEMAND_COMPARISON_HISTORY_WEEKS },
            () => 0,
          ),
          lastRecordedAt: null,
        };
        const recordedUnits = Number(row.recordedUnits);
        if (!Number.isFinite(recordedUnits) || recordedUnits < 0) continue;
        history.weeklySales[weeksAgo] = recordedUnits;
        if (
          row.lastRecordedAt &&
          (!history.lastRecordedAt ||
            row.lastRecordedAt > history.lastRecordedAt)
        ) {
          history.lastRecordedAt = row.lastRecordedAt;
        }
        demandHistoryByProduct.set(row.productId, history);
      }
      const demandForecastRecommendations: AgentDraftRecommendation[] = [];
      for (const [productId, history] of demandHistoryByProduct) {
        const product = inventoryById.get(productId);
        const baselineWeeklySales = history.weeklySales.slice(
          0,
          DEMAND_FORECAST_BASELINE_WEEKS,
        );
        const recordedSalesUnits = baselineWeeklySales.reduce(
          (sum, units) => sum + units,
          0,
        );
        const backtestHistory = history.weeklySales.slice(
          0,
          DEMAND_HISTORY_WEEKS,
        );
        const totalHistoryRecordedSalesUnits = backtestHistory.reduce(
          (sum, units) => sum + units,
          0,
        );
        if (!product || recordedSalesUnits <= 0) continue;
        const forecastUnits =
          Math.round(
            (recordedSalesUnits / DEMAND_FORECAST_BASELINE_WEEKS) * 100,
          ) / 100;
        const minRecordedWeeklyUnits = Math.min(...baselineWeeklySales);
        const maxRecordedWeeklyUnits = Math.max(...baselineWeeklySales);
        const weeksWithRecordedSales = backtestHistory.filter(
          (units) => units > 0,
        ).length;
        const baselineWeeksWithRecordedSales = baselineWeeklySales.filter(
          (units) => units > 0,
        ).length;
        const historicalBacktest = buildDemandBacktest(backtestHistory);
        const samePeriodRecordedSalesComparison =
          buildSamePeriodRecordedSalesComparison(history.weeklySales);
        demandForecastRecommendations.push({
          title: `Review short-term demand: ${product.name}`,
          summary: `Recorded sale movements over the latest ${DEMAND_FORECAST_BASELINE_WEEKS} weeks average ${forecastUnits} units per week. The observed recorded-sales range in that baseline is ${minRecordedWeeklyUnits}–${maxRecordedWeeklyUnits} units per week. A separate 52-week rolling backtest supplies an empirical error range only when enough history exists.`,
          classification: 'estimated',
          details: {
            signalType: 'demand_forecast',
            productId,
            productName: product.name,
            forecastHorizonDays: DEMAND_FORECAST_HORIZON_DAYS,
            historyWeeks: DEMAND_HISTORY_WEEKS,
            forecastBaselineWeeks: DEMAND_FORECAST_BASELINE_WEEKS,
            method: 'mean_recorded_weekly_sales',
            forecastUnits,
            observedWeeklyRange: {
              minimum: minRecordedWeeklyUnits,
              maximum: maxRecordedWeeklyUnits,
            },
            weeksWithRecordedSales,
            recordedSalesUnits,
            totalHistoryRecordedSalesUnits,
            baselineWeeksWithRecordedSales,
            lastRecordedSaleAt: history.lastRecordedAt?.toISOString() ?? null,
            historicalBacktest,
            comparisonHistoryWeeks: DEMAND_COMPARISON_HISTORY_WEEKS,
            samePeriodRecordedSalesComparison,
          },
          assumptions: [
            'Sale movements recorded for this business are used as the available demand history.',
            'Weeks with no recorded sale movements count as zero recorded units; that does not prove there was no demand outside the recorded system.',
          ],
          missingData: [
            ...(baselineWeeksWithRecordedSales < DEMAND_FORECAST_BASELINE_WEEKS
              ? [
                  `Recorded sales appeared in ${baselineWeeksWithRecordedSales} of ${DEMAND_FORECAST_BASELINE_WEEKS} baseline weeks; sparse movement history may understate demand.`,
                ]
              : []),
            ...(historicalBacktest.status === 'insufficient_recorded_history'
              ? [
                  `The empirical forecast interval needs at least ${DEMAND_BACKTEST_MIN_ACTIVE_WEEKS} active weeks within ${DEMAND_HISTORY_WEEKS} observed weeks; current recorded history is too sparse to evaluate it.`,
                ]
              : [
                  'The empirical 80% interval uses older rolling forecast errors and a separate recent holdout. Its observed holdout coverage is historical only, not a guarantee of future accuracy.',
                ]),
            'No seasonal forecast adjustment is applied. The same-period comparison uses two eight-week windows exactly 364 days apart, not a calendar-year model; missing or off-platform sales cannot be inferred.',
            'The min-to-max values are descriptive; the separate empirical interval is not a probabilistic guarantee and may fail under stockouts or changing demand.',
          ],
          riskTier: 'low',
          evidence: {
            resourceType: 'product',
            resourceId: productId,
            fieldRefs: [
              'StockMovement.kind',
              'StockMovement.qty',
              'StockMovement.createdAt',
            ],
            observedValues: {
              historyWeeks: DEMAND_HISTORY_WEEKS,
              comparisonHistoryWeeks: DEMAND_COMPARISON_HISTORY_WEEKS,
              forecastBaselineWeeks: DEMAND_FORECAST_BASELINE_WEEKS,
              forecastHorizonDays: DEMAND_FORECAST_HORIZON_DAYS,
              recordedSalesUnits,
              totalHistoryRecordedSalesUnits,
              forecastUnits,
              observedWeeklyRange: {
                minimum: minRecordedWeeklyUnits,
                maximum: maxRecordedWeeklyUnits,
              },
              weeksWithRecordedSales,
              baselineWeeksWithRecordedSales,
              lastRecordedSaleAt: history.lastRecordedAt?.toISOString() ?? null,
              historicalBacktest,
              samePeriodRecordedSalesComparison,
            },
            calculation: `For each fixed seven-day bucket, sum absolute quantities of recorded sale movements. The ${DEMAND_FORECAST_HORIZON_DAYS}-day point baseline remains the mean of the newest ${DEMAND_FORECAST_BASELINE_WEEKS} buckets; its min-to-max range is descriptive. A separate descriptive comparison pairs those latest eight buckets with the eight buckets exactly ${DEMAND_PRIOR_YEAR_OFFSET_WEEKS} weeks (${DEMAND_PRIOR_YEAR_OFFSET_WEEKS * 7} days) earlier; it is not a seasonal adjustment or calendar-year estimate. When all ${DEMAND_HISTORY_WEEKS} recent buckets and at least ${DEMAND_BACKTEST_MIN_ACTIVE_WEEKS} active sales weeks are available, generate rolling one-week-ahead forecasts from trailing ${DEMAND_FORECAST_BASELINE_WEEKS}-week means, use older forecast errors to set a nominal ${DEMAND_INTERVAL_TARGET_COVERAGE * 100}% empirical error radius, and measure that interval against the newest ${DEMAND_BACKTEST_WINDOWS}-week holdout. This time-series backtest is historical evidence, not a guarantee or causal model.`,
            observedAt,
          },
        });
      }
      const activeProductIds = new Set(activeProductRows.map((row) => row.id));
      const demandHistoryUnavailableRecommendations: AgentDraftRecommendation[] =
        [];
      for (const row of inventoryRows) {
        if (!activeProductIds.has(row.id) || row.status === 'ok') continue;
        const history = demandHistoryByProduct.get(row.id);
        const baselineWeeks =
          history?.weeklySales.slice(0, DEMAND_FORECAST_BASELINE_WEEKS) ??
          Array.from({ length: DEMAND_FORECAST_BASELINE_WEEKS }, () => 0);
        const recordedSalesUnits = baselineWeeks.reduce(
          (sum, units) => sum + units,
          0,
        );
        if (recordedSalesUnits > 0) continue;
        const historyWeeks =
          history?.weeklySales.slice(0, DEMAND_HISTORY_WEEKS) ?? [];
        const historyRecordedSalesUnits = historyWeeks.reduce(
          (sum, units) => sum + units,
          0,
        );
        const baselineWeeksWithSales = baselineWeeks.filter(
          (units) => units > 0,
        ).length;
        const historyWeeksWithSales = historyWeeks.filter(
          (units) => units > 0,
        ).length;
        const historyStatus =
          historyRecordedSalesUnits > 0
            ? 'no_recorded_sales_in_recent_baseline'
            : 'no_recorded_sales_in_history_window';
        demandHistoryUnavailableRecommendations.push({
          title: `Review demand history: ${row.name}`,
          summary: `${row.status === 'out_of_stock' ? 'No stock is recorded' : `Current stock is ${row.stockQty}, at or below the low-stock threshold of ${row.lowStockThreshold}`} for ${row.name}, but no sale movements were recorded in the latest ${DEMAND_FORECAST_BASELINE_WEEKS} weekly buckets. Demand was not estimated from this history. Any separate canonical reorder suggestion uses the configured threshold and lead-time formula, not a demand estimate; check sales-source coverage and the stock count before ordering.`,
          classification: 'review',
          details: {
            signalType: 'demand_history_unavailable',
            productId: row.id,
            productName: row.name,
            stockStatus: row.status,
            currentStock: row.stockQty,
            lowStockThreshold: row.lowStockThreshold,
            historyStatus,
            forecastHorizonDays: DEMAND_FORECAST_HORIZON_DAYS,
            historyWeeks: DEMAND_HISTORY_WEEKS,
            forecastBaselineWeeks: DEMAND_FORECAST_BASELINE_WEEKS,
            recordedSalesUnits,
            baselineWeeksWithSales,
            historyRecordedSalesUnits,
            historyWeeksWithSales,
            lastRecordedSaleAt: row.lastSoldAt?.toISOString() ?? null,
          },
          assumptions: [
            `The latest ${DEMAND_FORECAST_BASELINE_WEEKS} fixed seven-day buckets contain no canonical sale-movement quantities for this active product.`,
            'No recorded sale movement does not establish zero customer demand; off-platform sales and unavailable-stock periods are not observable here.',
          ],
          missingData: [
            historyStatus === 'no_recorded_sales_in_history_window'
              ? `No sale movements were recorded in the latest ${DEMAND_HISTORY_WEEKS} weekly buckets; demand and days of cover cannot be estimated from this source.`
              : `No sale movements were recorded in the latest ${DEMAND_FORECAST_BASELINE_WEEKS} weekly baseline buckets, despite ${historyWeeksWithSales} active sales week(s) in the longer history window.`,
            'Any separate canonical reorder suggestion uses the configured low-stock threshold and lead-time formula; it is not calibrated to the missing recent demand history.',
            'The inventory schema does not identify stockout-censored demand or external sales, so recorded movement history may understate demand.',
          ],
          riskTier: 'low',
          evidence: {
            resourceType: 'product',
            resourceId: row.id,
            fieldRefs: [
              'Product.stockQty',
              'Product.lowStockThreshold',
              'Product.active',
              'StockMovement.kind',
              'StockMovement.qty',
              'StockMovement.createdAt',
            ],
            observedValues: {
              productId: row.id,
              stockStatus: row.status,
              currentStock: row.stockQty,
              lowStockThreshold: row.lowStockThreshold,
              forecastHorizonDays: DEMAND_FORECAST_HORIZON_DAYS,
              historyWeeks: DEMAND_HISTORY_WEEKS,
              forecastBaselineWeeks: DEMAND_FORECAST_BASELINE_WEEKS,
              historyStatus,
              recordedSalesUnits,
              baselineWeeksWithSales,
              historyRecordedSalesUnits,
              historyWeeksWithSales,
              lastRecordedSaleAt: row.lastSoldAt?.toISOString() ?? null,
            },
            calculation: `Sum absolute StockMovement.sale quantities in fixed seven-day buckets. The latest ${DEMAND_FORECAST_BASELINE_WEEKS} buckets contain zero recorded units, so the agent abstains from generating a demand point estimate, interval, days-of-cover estimate, or purchase quantity.`,
            observedAt,
          },
        });
      }

      const backInStockRecommendations: AgentDraftRecommendation[] =
        pendingBackInStockRows.flatMap((row) => {
          const product = inventoryById.get(row.productId);
          if (!product || product.stockQty <= 0) return [];
          const waitingEntryCount = row._count._all;
          return [
            {
              title: `Review back-in-stock waitlist: ${product.name}`,
              summary: `${waitingEntryCount} unnotified waitlist entr${waitingEntryCount === 1 ? 'y exists' : 'ies exist'} while canonical stock shows ${product.stockQty} on hand. This is a review cue only; no customer was checked for channel eligibility or notified.`,
              classification: 'review',
              details: {
                signalType: 'back_in_stock',
                productId: row.productId,
                productName: product.name,
                availableStock: product.stockQty,
                waitingEntryCount,
              },
              assumptions: [
                'The count includes current-business product waitlist entries that have not been marked notified.',
                'Stock and waitlist rows are observed during this run and are not locked as a single snapshot.',
              ],
              missingData: [
                'This analysis run does not check recipient-level send eligibility. The waitlist row records a request but does not store separate consent evidence; the preview checks current send-gate rules only and cannot confirm provider delivery.',
              ],
              riskTier: 'medium',
              evidence: {
                resourceType: 'product_waitlist',
                resourceId: row.productId,
                fieldRefs: [
                  'ProductWaitlistEntry.businessId',
                  'ProductWaitlistEntry.productId',
                  'ProductWaitlistEntry.notifiedAt',
                  'Product.stockQty',
                  'Product.active',
                ],
                observedValues: {
                  productId: row.productId,
                  availableStock: product.stockQty,
                  waitingEntryCount,
                  oldestWaitingEntryAt:
                    row._min.createdAt?.toISOString() ?? null,
                },
                calculation:
                  'COUNT(*) of unnotified current-business product waitlist entries, grouped by active product with positive on-hand stock. No customer record or contact field is read.',
                observedAt,
              },
            },
          ];
        });

      const signalCounts = {
        demandForecast: demandForecastRecommendations.length,
        demandHistoryUnavailable:
          demandHistoryUnavailableRecommendations.length,
        inventoryValuation: inventoryRows.length > 0 ? 1 : 0,
        reorder: items.length,
        stockThreshold: inventoryRows.filter((row) => row.status !== 'ok')
          .length,
        overstock: inventoryRows.filter((row) => row.overstocked).length,
        countVariance: draftCounts.reduce(
          (count, stockCount) =>
            count +
            stockCount.lines.filter((line) => line.variance !== 0).length,
          0,
        ),
        recentWastage: wastageRows.length,
        backInStockReview: backInStockRecommendations.length,
        branchRebalance: branchRebalance.recommendations.length,
        repeatedCountVariance: repeatedCountVariances.length,
      };
      const recommendations: AgentDraftRecommendation[] = [
        ...(inventoryRows.length > 0
          ? [
              {
                title: 'Review inventory value at recorded cost',
                summary: `The canonical Inventory service reports ${inventoryValuation.stockValueAtCost} at recorded cost across ${inventoryValuation.productRowCount} product row(s); ${inventoryValuation.overstockFlaggedValueAtCost} is on items carrying the existing over-120-day overstock flag. This is stock carrying value, not cash or realized loss.`,
                classification: 'calculated',
                details: {
                  signalType: 'inventory_value_exposure',
                  ...inventoryValuation,
                  calculationSource:
                    'InventoryService.listInventory.stockValue',
                },
                assumptions: [
                  'Reuses stockValue returned by the canonical InventoryService; that service values each row as on-hand quantity multiplied by the recorded unit cost price.',
                  'The overstock subset reuses the existing InventoryService overstocked flag; it is not a dead-stock or loss classification.',
                ],
                missingData: [
                  'A zero recorded cost price is included as zero; the product schema has no separate marker here to distinguish a genuinely zero-cost item from a missing cost entry.',
                  'The value is an inventory carrying-value snapshot, not cash, net realizable value, or an estimate of realized loss.',
                ],
                riskTier: 'low',
                evidence: {
                  resourceType: 'inventory_valuation_snapshot',
                  resourceId: scopedBusinessId,
                  fieldRefs: [
                    'Product.stockQty',
                    'Product.costPrice',
                    'InventoryService.listInventory.stockValue',
                    'InventoryService.listInventory.overstocked',
                  ],
                  observedValues: {
                    ...inventoryValuation,
                    sourceProductRowCount: inventoryRows.length,
                  },
                  calculation:
                    'Reuses each stockValue and overstocked result returned by InventoryService.listInventory() for the active business; totals are sums of those canonical row values/flags, with no new valuation formula.',
                  observedAt,
                },
              },
            ]
          : []),
        ...branchRebalance.recommendations,
        ...repeatedCountVariances,
        ...backInStockRecommendations,
        ...demandForecastRecommendations,
        ...demandHistoryUnavailableRecommendations,
        ...agentItems.map((item) => {
          const observedLeadTimes = [
            ...(item.supplierId
              ? (leadTimeObservationsBySupplierProduct.get(
                  `${item.supplierId}:${item.productId}`,
                ) ?? [])
              : []),
          ].sort((a, b) => a - b);
          const leadTimeMiddle = Math.floor(observedLeadTimes.length / 2);
          const observedSupplierLeadTime =
            observedLeadTimes.length === 0
              ? {
                  status: 'not_tracked',
                  sampleCount: 0,
                  lookbackDays: SUPPLIER_LEAD_TIME_LOOKBACK_DAYS,
                  basis: 'PurchaseOrder.sentAt_to_fully_received_at',
                  sampleLimit: SUPPLIER_LEAD_TIME_SAMPLE_LIMIT,
                  sampleTruncated: leadTimeSampleTruncated,
                }
              : {
                  status: 'observed',
                  sampleCount: observedLeadTimes.length,
                  lookbackDays: SUPPLIER_LEAD_TIME_LOOKBACK_DAYS,
                  basis: 'PurchaseOrder.sentAt_to_fully_received_at',
                  medianElapsedDays:
                    observedLeadTimes.length % 2 === 0
                      ? Math.round(
                          ((observedLeadTimes[leadTimeMiddle - 1] +
                            observedLeadTimes[leadTimeMiddle]) /
                            2) *
                            10,
                        ) / 10
                      : observedLeadTimes[leadTimeMiddle],
                  minimumElapsedDays: observedLeadTimes[0],
                  maximumElapsedDays:
                    observedLeadTimes[observedLeadTimes.length - 1],
                  sampleLimit: SUPPLIER_LEAD_TIME_SAMPLE_LIMIT,
                  sampleTruncated: leadTimeSampleTruncated,
                };
          const contractsForSupplier =
            supplierContractsBySupplier.get(item.supplierId ?? '') ?? [];
          const supplierContractContext = contractsForSupplier.map(
            (contract) => ({
              id: contract.id,
              reference: contract.reference,
              title: contract.title,
              currency: contract.currency,
              categories: Array.isArray(contract.categories)
                ? contract.categories.filter(
                    (category): category is string =>
                      typeof category === 'string',
                  )
                : [],
              minimumOrderQty: contract.minimumOrderQty,
              effectiveFrom: contract.effectiveFrom.toISOString(),
              expiresAt: contract.expiresAt?.toISOString() ?? null,
              termsConfirmedAt:
                contract.termsConfirmedAt?.toISOString() ?? null,
              version: contract.version,
            }),
          );
          const historicalLeadTimeScenario: HistoricalLeadTimeScenario =
            observedLeadTimes.length >=
              SUPPLIER_LEAD_TIME_SCENARIO_MIN_SAMPLES &&
            typeof observedSupplierLeadTime.medianElapsedDays === 'number' &&
            item.velocityPerDay > 0
              ? (() => {
                  const baseSuggestedQty = Math.max(
                    0,
                    Math.ceil(
                      item.velocityPerDay *
                        observedSupplierLeadTime.medianElapsedDays +
                        item.lowStockThreshold -
                        item.availableStockAfterOutboundTransfers,
                    ),
                  );
                  const unroundedSuggestedQty = Math.max(
                    0,
                    baseSuggestedQty - item.incomingSupplyQty,
                  );
                  const minimumAdjustedQty = applyMinimumReorderQty(
                    unroundedSuggestedQty,
                    item.minimumReorderQty,
                  );
                  const rounded = roundUpToPurchasePack(
                    minimumAdjustedQty,
                    item.purchasePackSize,
                  );
                  return {
                    status: 'available',
                    sampleCount: observedLeadTimes.length,
                    minimumSampleCount: SUPPLIER_LEAD_TIME_SCENARIO_MIN_SAMPLES,
                    lookbackDays: SUPPLIER_LEAD_TIME_LOOKBACK_DAYS,
                    medianElapsedDays:
                      observedSupplierLeadTime.medianElapsedDays,
                    baseSuggestedQty,
                    incomingPurchaseQty: item.incomingPurchaseQty,
                    incomingTransferQty: item.incomingTransferQty,
                    incomingSupplyQty: item.incomingSupplyQty,
                    committedOutboundTransferQty:
                      item.committedOutboundTransferQty,
                    availableStockAfterOutboundTransfers:
                      item.availableStockAfterOutboundTransfers,
                    unroundedAdditionalQty: unroundedSuggestedQty,
                    minimumReorderQty: item.minimumReorderQty,
                    suggestedQty: rounded.stockQuantity,
                    purchaseUnitCount: rounded.purchaseUnitCount,
                    differenceFromDisplayedSuggestion:
                      rounded.stockQuantity - item.suggestedQty,
                    classification: 'historical_sensitivity_only',
                  };
                })()
              : {
                  status:
                    item.velocityPerDay > 0
                      ? 'insufficient_history'
                      : 'no_recorded_sales_velocity',
                  sampleCount: observedLeadTimes.length,
                  minimumSampleCount: SUPPLIER_LEAD_TIME_SCENARIO_MIN_SAMPLES,
                  lookbackDays: SUPPLIER_LEAD_TIME_LOOKBACK_DAYS,
                  classification: 'historical_sensitivity_only',
                };
          const coveredByIncoming = item.suggestedQty === 0;
          const purchaseQuantitySummary =
            item.purchasePackSize !== null &&
            item.purchasePackCount !== null &&
            item.stockUnitLabel &&
            item.purchaseUnitLabel
              ? ` This equals ${item.purchasePackCount} × ${item.purchaseUnitLabel} (${item.suggestedQty} × ${item.stockUnitLabel}, ${item.purchasePackSize} per ${item.purchaseUnitLabel}).`
              : '';
          const summary = coveredByIncoming
            ? `The existing reorder formula indicates ${item.baseSuggestedQty} unit(s) are needed after ${item.committedOutboundTransferQty} pending or approved outbound transfer unit(s) are reserved. Eligible open purchase orders provide ${item.incomingPurchaseQty} unit(s), and approved or shipped inbound branch transfers provide ${item.incomingTransferQty} unit(s). No additional purchase quantity is suggested by this run; verify the supply remains on schedule.`
            : `${this.recommendationSummary(item.availableStockAfterOutboundTransfers, item.velocityPerDay, item.suggestedQty)} Current on-hand is ${item.currentStock}; ${item.committedOutboundTransferQty} unit(s) are committed to pending or approved outbound transfers, leaving ${item.availableStockAfterOutboundTransfers} available. The base formula indicates ${item.baseSuggestedQty} unit(s); ${item.incomingPurchaseQty} unit(s) remain on eligible open purchase orders and ${item.incomingTransferQty} unit(s) are on approved or shipped inbound transfers, leaving ${item.unroundedAdditionalQty} uncovered stock unit(s).${item.minimumReorderQty !== null && item.unroundedAdditionalQty > 0 ? ` The product-wide minimum reorder quantity of ${item.minimumReorderQty} stock unit(s) raises the quantity before pack rounding.` : ''} The additional suggested quantity is ${item.suggestedQty}.${purchaseQuantitySummary}`;
          const leadTimeScenarioSummary =
            historicalLeadTimeScenario.status === 'available'
              ? ` A separate sensitivity case using the historical median of ${historicalLeadTimeScenario.medianElapsedDays} elapsed day(s) from ${historicalLeadTimeScenario.sampleCount} fully received order(s) would show ${historicalLeadTimeScenario.suggestedQty} unit(s), compared with the displayed ${item.suggestedQty}; this does not replace or change the displayed suggestion.`
              : '';
          return {
            title: coveredByIncoming
              ? `Open supply covers reorder need: ${item.name}`
              : `Review reorder for ${item.name}`,
            summary: `${summary}${observedLeadTimes.length > 0 ? ` Completed purchase orders for this product from its last recorded supplier took a median ${observedSupplierLeadTime.medianElapsedDays} elapsed day(s) from sent to fully received across ${observedLeadTimes.length} included order(s); this is historical context only.` : ''}${leadTimeScenarioSummary}${contractsForSupplier.length > 0 ? ` The last recorded supplier has ${contractsForSupplier.length} active, confirmed contract term(s) available for review; they are not applied to this quantity.` : ''}`,
            classification: 'calculated',
            details: {
              signalType: 'reorder',
              productId: item.productId,
              productName: item.name,
              sku: item.sku,
              currentStock: item.currentStock,
              lowStockThreshold: item.lowStockThreshold,
              velocityPerDay: item.velocityPerDay,
              suggestedQty: item.suggestedQty,
              baseSuggestedQty: item.baseSuggestedQty,
              incomingPurchaseQty: item.incomingPurchaseQty,
              incomingTransferQty: item.incomingTransferQty,
              incomingSupplyQty: item.incomingSupplyQty,
              committedOutboundTransferQty: item.committedOutboundTransferQty,
              availableStockAfterOutboundTransfers:
                item.availableStockAfterOutboundTransfers,
              unroundedAdditionalQty: item.unroundedAdditionalQty,
              coveredByIncoming,
              supplierId: item.supplierId,
              supplierName: item.supplierName,
              observedSupplierLeadTime,
              historicalLeadTimeScenario,
              minimumReorderQty: item.minimumReorderQty,
              minimumAdjustedQty: item.minimumAdjustedQty,
              supplierContractsForReview: supplierContractContext,
              purchaseUnitConversion: {
                status:
                  item.purchasePackSize !== null &&
                  item.stockUnitLabel &&
                  item.purchaseUnitLabel
                    ? 'configured'
                    : 'not_tracked',
                quantityUnit: 'canonical_stock_unit',
                stockUnitLabel: item.stockUnitLabel,
                purchaseUnitLabel: item.purchaseUnitLabel,
                unitsPerPurchaseUnit: item.purchasePackSize,
                unroundedAdditionalStockUnits: item.unroundedAdditionalQty,
                minimumReorderQty: item.minimumReorderQty,
                minimumAdjustedStockUnits: item.minimumAdjustedQty,
                suggestedPurchaseUnits: item.purchasePackCount,
                reason:
                  item.purchasePackSize === null
                    ? 'This product has no purchase-unit or pack-size conversion configured.'
                    : 'Additional stock units were rounded up to whole configured purchase units; the request quantity remains in canonical stock units.',
              },
              formulaVersion: FORMULA_VERSION,
              salesWindowDays: REORDER_VELOCITY_WINDOW_DAYS,
              baselineLeadTimeDays: item.baselineLeadTimeDays,
            },
            assumptions: [
              `Uses the existing ${REORDER_VELOCITY_WINDOW_DAYS}-day sales-velocity window.`,
              `The displayed purchase-request quantity uses this business's configured ${item.baselineLeadTimeDays}-day baseline. A separate sensitivity case is shown only with at least ${SUPPLIER_LEAD_TIME_SCENARIO_MIN_SAMPLES} matching fully received purchase orders; it does not change the displayed quantity.`,
              'The base quantity treats pending and approved outbound branch transfers as source commitments; shipped transfers have already reduced source on-hand.',
              'Subtracts unreceived quantities on sent, confirmed or partially received purchase orders plus approved or shipped inbound branch transfers with one active destination product matching the SKU. Pending inbound transfers, missing/ambiguous SKU matches, draft requests and other PO states are excluded.',
              ...(item.purchasePackSize !== null
                ? [
                    `After subtracting eligible open purchase orders and mapped branch transfers, the remaining stock-unit need is rounded up to a whole ${item.purchaseUnitLabel} of ${item.purchasePackSize} ${item.stockUnitLabel}; the stored request quantity remains in ${item.stockUnitLabel}.`,
                  ]
                : []),
              ...(item.minimumReorderQty !== null
                ? [
                    `When a positive shortage remains after subtracting eligible open supply, the product-wide minimum of ${item.minimumReorderQty} stock unit(s) is applied before purchase-pack rounding. This setting is shared across suppliers and is not a supplier contract MOQ.`,
                  ]
                : []),
            ],
            missingData: [
              ...(observedLeadTimes.length > 0
                ? [
                    'Observed supplier/product lead time is the elapsed time from PurchaseOrder.sentAt to the final fully received timestamp. It is historical context, not a supplier SLA or a guaranteed future delivery time.',
                  ]
                : !item.supplierId
                  ? [
                      'No supplier is linked to the last recorded purchase for this product, so supplier-specific lead time cannot be associated with this suggestion.',
                    ]
                  : leadTimeSampleTruncated
                    ? [
                        'No matching purchase order was present in the latest sample examined for this product/supplier pair. Because the shared order sample cap was reached, older matching records may exist outside this run.',
                      ]
                    : [
                        'No fully received purchase order for this product and its last recorded supplier was found in the one-year observation window; supplier-specific lead time is not tracked for this suggestion.',
                      ]),
              ...(leadTimeSampleTruncated
                ? [
                    `Lead-time evidence is limited to the latest ${SUPPLIER_LEAD_TIME_SAMPLE_LIMIT} matching completed purchase orders across the suggestions in this run.`,
                  ]
                : []),
              ...(contractsForSupplier.length > 0
                ? [
                    'A confirmed contract minimum order quantity is shown as supplier-level context; it is not allocated to this product or applied by the reorder formula. Check the contract categories and unit before acting.',
                    'Purchase pack-size constraints are not stored in the confirmed contract fields used here.',
                  ]
                : [
                    'No active, terms-confirmed procurement contract was found for this product’s last recorded supplier, so a supplier-specific minimum order quantity is not available to review or apply.',
                    'Purchase pack-size constraints are not stored in the confirmed contract fields used here.',
                  ]),
              ...(item.purchasePackSize === null
                ? [
                    'No purchase-unit conversion is configured for this product. The suggestion and purchase-request draft use whole stock units; verify the supplier pack and minimum order quantity before submitting.',
                  ]
                : []),
              ...(item.minimumReorderQty === null
                ? [
                    'No product-wide minimum reorder quantity is configured. Supplier contract minimums remain supplier-level context and are not mapped to this product.',
                  ]
                : [
                    'The configured product-wide minimum is not a supplier-specific minimum. Supplier contract minimums remain supplier-level context and are not mapped to this product.',
                  ]),
              ...(historicalLeadTimeScenario.status === 'insufficient_history'
                ? [
                    `Historical lead-time sensitivity is not calculated until at least ${SUPPLIER_LEAD_TIME_SCENARIO_MIN_SAMPLES} fully received purchase orders match this product and supplier; ${observedLeadTimes.length} matching order(s) are available.`,
                  ]
                : historicalLeadTimeScenario.status ===
                    'no_recorded_sales_velocity'
                  ? [
                      'Historical lead-time sensitivity is not calculated because no positive recorded sales velocity is available for this product.',
                    ]
                  : []),
              'No separate stock-reservation ledger exists; order creation deducts on-hand stock. Pending and approved outbound transfers are included as commitments in this reorder calculation. Re-run before preparing a request because stock, sales, transfer status or open supply can change.',
              'Open Procurement requests are not counted as incoming supply because they are not yet canonical purchase orders or supplier commitments.',
            ],
            riskTier: 'low',
            evidence: {
              resourceType: 'product',
              resourceId: item.productId,
              fieldRefs: [
                'Product.stockQty',
                'Product.lowStockThreshold',
                'Product.stockUnitLabel',
                'Product.purchaseUnitLabel',
                'Product.purchasePackSize',
                'Product.minimumReorderQty',
                'StockMovement.sale.qty',
                'StockMovement.sale.createdAt',
                'StockMovement.purchase.supplierId',
                'PurchaseOrderItem.qtyOrdered',
                'PurchaseOrderItem.qtyReceived',
                'PurchaseOrder.status',
                'PurchaseOrder.sentAt',
                'PurchaseOrder.receivedAt',
                'Product.sku',
                'StockTransfer.status',
                'StockTransferItem.qty',
                'StockTransferItem.receivedQty',
                'ProcurementSupplierContract.minimumOrderQty',
                'ProcurementSupplierContract.categories',
                'ProcurementSupplierContract.termsConfirmedAt',
              ],
              observedValues: {
                currentStock: item.currentStock,
                lowStockThreshold: item.lowStockThreshold,
                salesVelocityPerDay: item.velocityPerDay,
                suggestedQty: item.suggestedQty,
                baseSuggestedQty: item.baseSuggestedQty,
                minimumReorderQty: item.minimumReorderQty,
                minimumAdjustedQty: item.minimumAdjustedQty,
                incomingPurchaseQty: item.incomingPurchaseQty,
                incomingTransferQty: item.incomingTransferQty,
                incomingSupplyQty: item.incomingSupplyQty,
                committedOutboundTransferQty: item.committedOutboundTransferQty,
                availableStockAfterOutboundTransfers:
                  item.availableStockAfterOutboundTransfers,
                unroundedAdditionalQty: item.unroundedAdditionalQty,
                suggestedPurchaseUnitCount: item.purchasePackCount,
                coveredByIncoming,
                supplierId: item.supplierId,
                supplierName: item.supplierName,
                observedSupplierLeadTime,
                historicalLeadTimeScenario,
                supplierContractsForReview: supplierContractContext,
                salesWindowDays: REORDER_VELOCITY_WINDOW_DAYS,
                baselineLeadTimeDays: item.baselineLeadTimeDays,
                formulaVersion: FORMULA_VERSION,
              },
              calculation: `Displayed base reorder quantity = max(0, ceil((units sold in trailing ${REORDER_VELOCITY_WINDOW_DAYS} days / ${REORDER_VELOCITY_WINDOW_DAYS}) * ${item.baselineLeadTimeDays} + low-stock threshold - max(0, current stock - pending/approved outbound transfer quantities))). Uncovered need = max(0, base quantity - unreceived quantities on eligible open purchase orders - approved/shipped inbound transfer quantities mapped by a unique active destination SKU). Pending inbound transfers and missing or ambiguous SKU matches are excluded. Draft requests and other PO statuses are excluded. Only when uncovered need is positive, the product-wide Product.minimumReorderQty floor is applied (max(uncovered need, configured minimum)); a zero shortage stays zero. When Product.purchasePackSize is configured, that result is rounded upward to a whole purchase-unit multiple while the saved quantity remains in canonical stock units. The product-wide floor is not a supplier contract MOQ. A separate historical sensitivity case, only when at least ${SUPPLIER_LEAD_TIME_SCENARIO_MIN_SAMPLES} fully received matching orders exist and positive sales velocity is recorded, substitutes their median sentAt-to-receivedAt elapsed days into the same quantity equation and applies the same current transfer commitments and open supply; it is labeled historical sensitivity only and never changes the displayed suggestion or purchase request. The sample uses fully received orders completed in the preceding ${SUPPLIER_LEAD_TIME_LOOKBACK_DAYS} days; at most ${SUPPLIER_LEAD_TIME_SAMPLE_LIMIT} recent matching orders are included.`,
            },
          };
        }),
        ...inventoryRows
          .filter((row) => row.status !== 'ok')
          .map((row) => ({
            title: `${row.status === 'out_of_stock' ? 'Out of stock' : 'At low-stock threshold'}: ${row.name}`,
            summary: `Canonical on-hand is ${row.stockQty} against the recorded low-stock threshold of ${row.lowStockThreshold}. Days of cover is ${row.daysOfCover == null ? 'not available because no sales velocity was recorded' : `${row.daysOfCover} based on recorded trailing sales`}.`,
            classification: 'calculated',
            details: {
              signalType: 'stock_threshold',
              productId: row.id,
              productName: row.name,
              currentStock: row.stockQty,
              lowStockThreshold: row.lowStockThreshold,
              velocityPerDay: row.velocityPerDay,
              daysOfCover: row.daysOfCover,
              incomingPurchaseQty:
                incomingPurchaseQtyByProduct.get(row.id) ?? 0,
              incomingTransferQty:
                incomingTransferQtyByProduct.get(row.id) ?? 0,
              sourceStatus: row.status,
            },
            assumptions: [
              'Days of cover reuses the canonical InventoryService calculation from recorded trailing sales and current on-hand.',
            ],
            missingData: [
              'The current-stock calculation does not subtract reserved or committed quantities.',
              'Outstanding purchase orders and approved or shipped inbound branch transfers are shown for review but are not part of InventoryService days-of-cover calculation.',
            ],
            riskTier: row.status === 'out_of_stock' ? 'high' : 'medium',
            evidence: {
              resourceType: 'product',
              resourceId: row.id,
              fieldRefs: [
                'Product.stockQty',
                'Product.lowStockThreshold',
                'StockMovement.sale.qty',
                'StockMovement.sale.createdAt',
                'PurchaseOrderItem.qtyOrdered',
                'PurchaseOrderItem.qtyReceived',
                'StockTransfer.status',
                'StockTransferItem.qty',
                'StockTransferItem.receivedQty',
                'Product.sku',
              ],
              observedValues: {
                currentStock: row.stockQty,
                lowStockThreshold: row.lowStockThreshold,
                velocityPerDay: row.velocityPerDay,
                daysOfCover: row.daysOfCover,
                status: row.status,
                incomingPurchaseQty:
                  incomingPurchaseQtyByProduct.get(row.id) ?? 0,
                incomingTransferQty:
                  incomingTransferQtyByProduct.get(row.id) ?? 0,
              },
              calculation: `Status and days of cover returned by InventoryService.listInventory() for the active business scope at ${observedAt.toISOString()}.`,
            },
          })),
        ...inventoryRows
          .filter((row) => row.overstocked)
          .map((row) => ({
            title: `Review high stock cover: ${row.name}`,
            summary: `The existing Inventory service flags this item as overstocked from recorded stock and sales velocity. This is a review signal, not a dead-stock conclusion.`,
            classification: 'calculated',
            details: {
              signalType: 'overstock_review',
              productId: row.id,
              productName: row.name,
              currentStock: row.stockQty,
              velocityPerDay: row.velocityPerDay,
              daysOfCover: row.daysOfCover,
            },
            assumptions: [
              'Reuses the existing InventoryService overstock flag; it is based on available sales velocity and current stock.',
            ],
            missingData: [
              'Seasonality and launch-period context are not included in the existing overstock rule.',
              'No markdown, disposal or purchase action is proposed.',
            ],
            riskTier: 'low',
            evidence: {
              resourceType: 'product',
              resourceId: row.id,
              fieldRefs: [
                'Product.stockQty',
                'StockMovement.sale.qty',
                'StockMovement.sale.createdAt',
              ],
              observedValues: {
                currentStock: row.stockQty,
                velocityPerDay: row.velocityPerDay,
                daysOfCover: row.daysOfCover,
                overstocked: row.overstocked,
              },
              calculation: `Existing overstock flag returned by InventoryService.listInventory() at ${observedAt.toISOString()}; it is not a dead-stock classification.`,
            },
          })),
        ...draftCounts.flatMap((stockCount) =>
          stockCount.lines
            .filter((line) => line.variance !== 0)
            .map((line) => ({
              title: `Review stock-count variance: ${line.product.name}`,
              summary: `Draft stock count ${stockCount.id} recorded ${line.countedQty} counted versus ${line.expectedQty} expected (${line.variance > 0 ? '+' : ''}${line.variance}). The snapshot may be stale; recount before applying any adjustment.`,
              classification: 'verified',
              details: {
                signalType: 'count_variance',
                stockCountId: stockCount.id,
                stockCountLineId: line.id,
                productId: line.productId,
                productName: line.product.name,
                expectedQty: line.expectedQty,
                countedQty: line.countedQty,
                variance: line.variance,
                stockCountStatus: stockCount.status,
              },
              assumptions: [
                'Variance is the saved draft snapshot from when the count was created; canonical apply logic rechecks live stock.',
              ],
              missingData: [
                'This finding does not authorize or perform a stock adjustment.',
              ],
              riskTier: 'medium',
              evidence: {
                resourceType: 'stock_count_line',
                resourceId: line.id,
                fieldRefs: [
                  'StockCount.status',
                  'StockCountLine.expectedQty',
                  'StockCountLine.countedQty',
                  'StockCountLine.variance',
                ],
                observedValues: {
                  stockCountId: stockCount.id,
                  stockCountStatus: stockCount.status,
                  expectedQty: line.expectedQty,
                  countedQty: line.countedQty,
                  variance: line.variance,
                },
                calculation:
                  'Persisted draft count snapshot; current stock is re-derived by StockCountService.apply() before any canonical adjustment.',
                observedAt: stockCount.createdAt,
              },
            })),
        ),
        ...wastageRows.map((row) => {
          const product = inventoryById.get(row.productId);
          return {
            title: `Review recorded wastage: ${product?.name ?? 'Product'}`,
            summary: `There ${row._count._all === 1 ? 'is' : 'are'} ${row._count._all} wastage movement(s) for this product in the trailing ${REORDER_VELOCITY_WINDOW_DAYS} days. The agent reports recorded events only and does not infer a cause.`,
            classification: 'verified',
            details: {
              signalType: 'wastage_review',
              productId: row.productId,
              productName: product?.name ?? null,
              movementCount: row._count._all,
              quantityWasted: Math.abs(row._sum.qty ?? 0),
              lastRecordedAt: row._max.createdAt?.toISOString() ?? null,
              windowDays: REORDER_VELOCITY_WINDOW_DAYS,
            },
            assumptions: [
              `Groups persisted wastage movements from the trailing ${REORDER_VELOCITY_WINDOW_DAYS} days.`,
            ],
            missingData: [
              'The agent does not infer why wastage occurred or recommend a write-off.',
            ],
            riskTier: 'low',
            evidence: {
              resourceType: 'product',
              resourceId: row.productId,
              fieldRefs: [
                'StockMovement.kind',
                'StockMovement.qty',
                'StockMovement.wastageReason',
                'StockMovement.createdAt',
              ],
              observedValues: {
                movementCount: row._count._all,
                quantityWasted: Math.abs(row._sum.qty ?? 0),
                lastRecordedAt: row._max.createdAt?.toISOString() ?? null,
                windowDays: REORDER_VELOCITY_WINDOW_DAYS,
              },
              calculation: `SUM(abs(qty)) and COUNT(*) over persisted wastage movements with createdAt >= ${wastageCutoff.toISOString()}.`,
              observedAt: row._max.createdAt ?? observedAt,
            },
          };
        }),
      ];
      const aiSummary =
        options.includeAiSummary === false
          ? null
          : await this.summarize(scopedBusinessId, groupsForAiSummary, run.id);
      const deterministicSummary = this.deterministicSummary(signalCounts);
      const finishedAt = new Date();
      const output = {
        summary: deterministicSummary,
        recommendationCount: recommendations.length,
        signalCounts,
        branchRebalanceAvailability: branchRebalance.availability,
        activeLocationCount: branchRebalance.activeLocationCount,
        inventoryValuation,
        observedAt: observedAt.toISOString(),
        formulaVersion: FORMULA_VERSION,
        salesWindowDays: REORDER_VELOCITY_WINDOW_DAYS,
        baselineLeadTimeDays: reorderLeadTimeDays,
        aiSummary,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      } satisfies Prisma.InputJsonObject;

      const persistedRecommendations = recommendations.map(
        (recommendation) => ({
          business: { connect: { id: scopedBusinessId } },
          agentKey: AGENT_KEY,
          title: recommendation.title,
          summary: recommendation.summary,
          classification: recommendation.classification,
          details: recommendation.details,
          assumptions: recommendation.assumptions,
          missingData: recommendation.missingData,
          confidenceValue: null,
          confidenceMethod: 'not_available',
          riskTier: recommendation.riskTier,
          approvalRequired: false,
          status: 'proposed',
          evidence: {
            create: {
              business: { connect: { id: scopedBusinessId } },
              run: { connect: { id: run.id } },
              sourceType: 'canonical_service',
              resourceType: recommendation.evidence.resourceType,
              resourceId: recommendation.evidence.resourceId,
              fieldRefs: recommendation.evidence.fieldRefs,
              observedValues: recommendation.evidence.observedValues,
              observedAt: recommendation.evidence.observedAt ?? observedAt,
              fetchedAt: observedAt,
              freshness: 'fresh',
              calculation: recommendation.evidence.calculation,
            },
          },
        }),
      );

      const completed = await this.tenantPrisma.client.$transaction(async (tx) => {
        const updated = await tx.specialistAgentRun.update({
          where: { id: run.id },
          data: {
            status: 'completed',
            output,
            finishedAt,
            recommendations: { create: persistedRecommendations },
          },
          include: {
            recommendations: {
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              include: {
                evidence: { orderBy: [{ fetchedAt: 'asc' }, { id: 'asc' }] },
                inventoryCountTask: true,
                procurementRequest: {
                  select: { id: true, status: true, version: true },
                },
              },
            },
          },
        });
        await recordSpecialistAgentRunTerminalEvent(
          tx,
          run,
          'completed',
          finishedAt,
        );
        return updated;
      });

      await this.tenantPrisma.client.auditLog.create({
        data: {
          businessId: scopedBusinessId,
          actorUserId,
          action: 'inventory_agent.run',
          entity: 'SpecialistAgentRun',
          entityId: run.id,
          after: {
            agentKey: AGENT_KEY,
            agentVersion: AGENT_VERSION,
            status: completed.status,
            recommendationCount: recommendations.length,
          },
        },
      });
      return completed;
    } catch (error) {
      const finishedAt = new Date();
      await this.tenantPrisma.client.$transaction(async (tx) => {
        await tx.specialistAgentRun.update({
          where: { id: run.id },
          data: {
            status: 'failed',
            errorCode: 'INVENTORY_AGENT_RUN_FAILED',
            errorMessage:
              'Inventory evidence could not be read; no recommendation was generated.',
            finishedAt,
          },
        });
        await recordSpecialistAgentRunTerminalEvent(
          tx,
          run,
          'failed',
          finishedAt,
        );
      });
      if (error instanceof AppException) throw error;
      throw new AppException(
        'INVENTORY_AGENT_RUN_FAILED',
        'Inventory evidence could not be read; no recommendation was generated.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async summarize(
    businessId: string,
    groups: Array<{
      supplierName: string;
      items: Array<{
        name: string;
        currentStock: number;
        velocityPerDay: number;
        suggestedQty: number;
        baseSuggestedQty: number;
        incomingPurchaseQty: number;
        incomingTransferQty: number;
        incomingSupplyQty: number;
        committedOutboundTransferQty: number;
        purchasePackSize: number | null;
        minimumReorderQty: number | null;
        minimumAdjustedQty: number;
        purchasePackCount: number | null;
        stockUnitLabel: string | null;
        purchaseUnitLabel: string | null;
        baselineLeadTimeDays: number;
      }>;
    }>,
    specialistAgentRunId: string,
  ): Promise<AiSummary> {
    const itemCount = groups.reduce(
      (sum, group) => sum + group.items.length,
      0,
    );
    if (itemCount === 0) {
      return {
        status: 'not_needed',
        text: null,
        message: 'No current reorder recommendations need an AI explanation.',
        inputTokens: 0,
        outputTokens: 0,
      };
    }

    const evidence = groups.flatMap((group) =>
      group.items.map((item) => ({
        product: item.name,
        currentStock: item.currentStock,
        salesVelocityPerDay: item.velocityPerDay,
        baseSuggestedQty: item.baseSuggestedQty,
        incomingPurchaseQty: item.incomingPurchaseQty,
        incomingTransferQty: item.incomingTransferQty,
        incomingSupplyQty: item.incomingSupplyQty,
        committedOutboundTransferQty: item.committedOutboundTransferQty,
        suggestedQty: item.suggestedQty,
        purchasePackSize: item.purchasePackSize,
        minimumReorderQty: item.minimumReorderQty,
        minimumAdjustedQty: item.minimumAdjustedQty,
        purchasePackCount: item.purchasePackCount,
        stockUnitLabel: item.stockUnitLabel,
        purchaseUnitLabel: item.purchaseUnitLabel,
        baselineLeadTimeDays: item.baselineLeadTimeDays,
        supplier: group.supplierName,
      })),
    );
    try {
      const response = await this.aiInfra.createMessage(
        businessId,
        'inventory_agent',
        {
          system: `You are the read-only Inventory Intelligence Agent. Explain only patterns directly supported by the supplied inventory evidence. Do not invent facts, causes, costs, dates, lead times, or actions. Do not claim a purchase order was created. Keep the response concise and tell the user to review any proposal before acting. ${SPECIALIST_AGENT_UNTRUSTED_DATA_POLICY}`,
          messages: [
            {
              role: 'user',
              content: `Explain these calculated additional reorder suggestions for human review. State that the base quantity uses a trailing ${REORDER_VELOCITY_WINDOW_DAYS}-day sales window and this business's configured ${groups[0]?.items[0]?.baselineLeadTimeDays ?? REORDER_LEAD_TIME_DAYS}-day baseline, treats pending/approved outbound transfers as commitments, and subtracts unreceived eligible purchase orders plus approved/shipped inbound transfers mapped to one active destination product by SKU. Pending inbound transfers, unmapped SKU matches and draft procurement requests are excluded. Where a product has a configured purchase pack, the remaining stock-unit quantity is rounded up to a whole purchase unit. ${specialistAgentUntrustedData('Inventory evidence', evidence)}`,
            },
          ],
          temperature: 0,
          maxTokens: 240,
        },
        [{ tool: 'read_reorder_suggestions', itemCount }],
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
        'The calculated evidence is still available.',
      );
    }
  }

  private deterministicSummary(counts: {
    demandForecast: number;
    demandHistoryUnavailable: number;
    inventoryValuation: number;
    reorder: number;
    stockThreshold: number;
    overstock: number;
    countVariance: number;
    recentWastage: number;
    backInStockReview: number;
    branchRebalance: number;
    repeatedCountVariance: number;
  }): string {
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    return total > 0
      ? `Saved ${total} read-only Inventory finding(s): ${counts.demandForecast} historical demand baseline(s), ${counts.demandHistoryUnavailable} low-stock item(s) without a usable recent demand baseline, ${counts.inventoryValuation} canonical inventory valuation snapshot(s), ${counts.reorder} reorder, ${counts.stockThreshold} at/below low-stock threshold, ${counts.overstock} existing overstock flag(s), ${counts.countVariance} draft count variance(s), ${counts.repeatedCountVariance} repeated applied-count adjustment pattern(s), ${counts.recentWastage} product(s) with recorded wastage, ${counts.backInStockReview} back-in-stock waitlist review(s), and ${counts.branchRebalance} branch rebalance review(s). No stock or purchase order was changed and no customer was notified.`
      : 'No recorded demand baseline, canonical inventory valuation, reorder, stock-threshold, existing overstock, draft count-variance, repeated applied-count adjustment, recent recorded-wastage, back-in-stock waitlist, or branch rebalance findings were returned by the canonical Inventory services. No stock or purchase order was changed and no customer was notified.';
  }

  private async buildRepeatedStockCountRecommendations(
    businessId: string,
    observedAt: Date,
    minimumAbsoluteAdjustmentUnits: number | null,
  ): Promise<AgentDraftRecommendation[]> {
    const cutoff = new Date(
      observedAt.getTime() -
        COUNT_VARIANCE_REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    const adjustments = await this.tenantPrisma.client.stockMovement.findMany({
      where: {
        businessId,
        kind: StockMovementKind.adjustment,
        createdAt: { gte: cutoff, lt: observedAt },
        reason: { startsWith: 'Stock count ' },
        product: {
          is: {
            businessId,
            active: true,
            kind: ProductKind.product,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: {
        product: { select: { name: true, sku: true } },
      },
    });
    const countIdByMovementId = new Map<string, string>();
    for (const movement of adjustments) {
      const match = movement.reason?.match(/^Stock count ([0-9a-f-]{36}):/i);
      if (match) countIdByMovementId.set(movement.id, match[1]);
    }
    const stockCountIds = [...new Set(countIdByMovementId.values())];
    if (stockCountIds.length === 0) return [];

    const appliedCounts = await this.tenantPrisma.client.stockCount.findMany({
      where: {
        businessId,
        id: { in: stockCountIds },
        status: StockCountStatus.applied,
      },
      orderBy: [{ appliedAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        appliedAt: true,
        lines: { select: { productId: true } },
      },
    });
    const appliedAtByCountId = new Map(
      appliedCounts
        .filter((count) => count.appliedAt !== null)
        .map((count) => [count.id, count.appliedAt!] as const),
    );
    const productIdsByCountId = new Map(
      appliedCounts.map(
        (count) =>
          [
            count.id,
            new Set(count.lines.map((line) => line.productId)),
          ] as const,
      ),
    );
    const byProduct = new Map<
      string,
      {
        product: (typeof adjustments)[number]['product'];
        countIds: Set<string>;
        movementCount: number;
        totalAbsoluteAdjustmentUnits: number;
        netAdjustmentQty: number;
        positiveAdjustmentCount: number;
        negativeAdjustmentCount: number;
        firstAppliedAt: Date | null;
        lastAppliedAt: Date | null;
        lastMovementAt: Date;
      }
    >();

    for (const movement of adjustments) {
      const countId = countIdByMovementId.get(movement.id);
      const appliedAt = countId ? appliedAtByCountId.get(countId) : null;
      if (
        !countId ||
        !appliedAt ||
        !productIdsByCountId.get(countId)?.has(movement.productId)
      ) {
        continue;
      }
      const finding = byProduct.get(movement.productId) ?? {
        product: movement.product,
        countIds: new Set<string>(),
        movementCount: 0,
        totalAbsoluteAdjustmentUnits: 0,
        netAdjustmentQty: 0,
        positiveAdjustmentCount: 0,
        negativeAdjustmentCount: 0,
        firstAppliedAt: null,
        lastAppliedAt: null,
        lastMovementAt: movement.createdAt,
      };
      finding.countIds.add(countId);
      finding.movementCount += 1;
      finding.totalAbsoluteAdjustmentUnits += Math.abs(movement.qty);
      finding.netAdjustmentQty += movement.qty;
      if (movement.qty > 0) finding.positiveAdjustmentCount += 1;
      if (movement.qty < 0) finding.negativeAdjustmentCount += 1;
      if (!finding.firstAppliedAt || appliedAt < finding.firstAppliedAt) {
        finding.firstAppliedAt = appliedAt;
      }
      if (!finding.lastAppliedAt || appliedAt > finding.lastAppliedAt) {
        finding.lastAppliedAt = appliedAt;
      }
      if (movement.createdAt > finding.lastMovementAt) {
        finding.lastMovementAt = movement.createdAt;
      }
      byProduct.set(movement.productId, finding);
    }

    return [...byProduct.entries()]
      .filter(
        ([, finding]) =>
          finding.countIds.size >= 2 &&
          (minimumAbsoluteAdjustmentUnits === null ||
            finding.totalAbsoluteAdjustmentUnits >=
              minimumAbsoluteAdjustmentUnits),
      )
      .map(([productId, finding]) => {
        const appliedCountIds = [...finding.countIds].sort();
        const thresholdDisclosure =
          minimumAbsoluteAdjustmentUnits === null
            ? 'No minimum quantity filter is configured; this finding flags recurrence only.'
            : `The ${minimumAbsoluteAdjustmentUnits}-unit minimum filters aggregate absolute correction quantity only; it is not a financial materiality assessment.`;
        return {
          title: `Review repeated stock-count adjustments: ${finding.product.name}`,
          summary: `${appliedCountIds.length} distinct applied stock counts recorded ${finding.movementCount} correction movement(s), totaling ${finding.totalAbsoluteAdjustmentUnits} absolute unit(s) over the last ${COUNT_VARIANCE_REVIEW_WINDOW_DAYS} days. This is recurrence evidence only; it does not identify a cause.`,
          classification: 'review',
          details: {
            signalType: 'repeated_count_variance',
            productId,
            productName: finding.product.name,
            sku: finding.product.sku,
            lookbackDays: COUNT_VARIANCE_REVIEW_WINDOW_DAYS,
            distinctAppliedCountCount: appliedCountIds.length,
            appliedCountIds,
            adjustmentMovementCount: finding.movementCount,
            totalAbsoluteAdjustmentUnits: finding.totalAbsoluteAdjustmentUnits,
            minimumAbsoluteAdjustmentUnits,
            netAdjustmentQty: finding.netAdjustmentQty,
            positiveAdjustmentCount: finding.positiveAdjustmentCount,
            negativeAdjustmentCount: finding.negativeAdjustmentCount,
            firstAppliedAt: finding.firstAppliedAt?.toISOString() ?? null,
            lastAppliedAt: finding.lastAppliedAt?.toISOString() ?? null,
            lastMovementAt: finding.lastMovementAt.toISOString(),
          },
          assumptions: [
            'A correction is included only when its movement references a real StockCount record that is applied and has an appliedAt timestamp.',
            'Repeated means at least two distinct applied stock-count IDs for the same active product in the lookback window.',
            ...(minimumAbsoluteAdjustmentUnits === null
              ? []
              : [
                  `When configured, the minimum compares with summed absolute correction units and is inclusive at ${minimumAbsoluteAdjustmentUnits} units.`,
                ]),
          ],
          missingData: [
            'The system records the adjustment movement and count reference but does not capture a structured root cause for the discrepancy.',
            thresholdDisclosure,
          ],
          riskTier: 'medium',
          evidence: {
            resourceType: 'stock_count_adjustment_pattern',
            resourceId: productId,
            fieldRefs: [
              'StockCount.status',
              'StockCount.appliedAt',
              'StockMovement.businessId',
              'StockMovement.productId',
              'StockMovement.kind',
              'StockMovement.qty',
              'StockMovement.reason',
              'StockMovement.createdAt',
              'Business.policies.inventory.agentCountVarianceMinimumUnits',
            ],
            observedValues: {
              productId,
              productName: finding.product.name,
              sku: finding.product.sku,
              lookbackDays: COUNT_VARIANCE_REVIEW_WINDOW_DAYS,
              distinctAppliedCountCount: appliedCountIds.length,
              appliedCountIds,
              adjustmentMovementCount: finding.movementCount,
              totalAbsoluteAdjustmentUnits:
                finding.totalAbsoluteAdjustmentUnits,
              minimumAbsoluteAdjustmentUnits,
              netAdjustmentQty: finding.netAdjustmentQty,
              positiveAdjustmentCount: finding.positiveAdjustmentCount,
              negativeAdjustmentCount: finding.negativeAdjustmentCount,
              firstAppliedAt: finding.firstAppliedAt?.toISOString() ?? null,
              lastAppliedAt: finding.lastAppliedAt?.toISOString() ?? null,
              lastMovementAt: finding.lastMovementAt.toISOString(),
            },
            calculation: `Select adjustment movements in this business over the trailing ${COUNT_VARIANCE_REVIEW_WINDOW_DAYS} days whose reason references a UUID StockCount. Retain only count records with status applied and appliedAt set. Group by product; emit a review when at least two distinct applied count IDs remain${minimumAbsoluteAdjustmentUnits === null ? '' : ` and summed absolute correction units are at least ${minimumAbsoluteAdjustmentUnits}`}. Sum absolute movement qty for total correction units; net qty is the signed sum. The configured filter is quantity-only; no financial materiality or cause is inferred.`,
            observedAt,
          },
        };
      });
  }

  /**
   * Compare branches only inside the current business's own branch group. This is read-only:
   * recommendations point to the existing Stock Transfers screen and never create a transfer.
   */
  private async buildBranchRebalanceRecommendations(
    businessId: string,
    observedAt: Date,
    branches?: Array<{ id: string; name: string }>,
  ): Promise<{
    recommendations: AgentDraftRecommendation[];
    availability: 'available' | 'single_location';
    activeLocationCount: number;
  }> {
    const scopedBranches =
      branches ?? (await this.resolveActiveBranchGroupBusinesses(businessId));
    if (scopedBranches.length < 2) {
      return {
        recommendations: [],
        availability: 'single_location',
        activeLocationCount: scopedBranches.length,
      };
    }

    const branchIds = scopedBranches.map((branch) => branch.id);
    const products = await this.prisma.product.findMany({
      where: {
        businessId: { in: branchIds },
        active: true,
        kind: ProductKind.product,
      },
      orderBy: [{ businessId: 'asc' }, { sku: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        businessId: true,
        name: true,
        sku: true,
        stockQty: true,
        lowStockThreshold: true,
      },
    });
    const productIds = products.map((product) => product.id);
    const cutoff = new Date(
      observedAt.getTime() - REORDER_VELOCITY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    const [sales, transfers] = await Promise.all([
      this.prisma.stockMovement.groupBy({
        by: ['businessId', 'productId'],
        where: {
          businessId: { in: branchIds },
          productId: { in: productIds },
          kind: StockMovementKind.sale,
          createdAt: { gte: cutoff, lt: observedAt },
        },
        _sum: { qty: true },
      }),
      this.prisma.stockTransfer.findMany({
        where: {
          status: {
            in: [
              StockTransferStatus.pending,
              StockTransferStatus.approved,
              StockTransferStatus.shipped,
            ],
          },
          OR: [
            { sourceBusinessId: { in: branchIds } },
            { destBusinessId: { in: branchIds } },
          ],
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          sourceBusinessId: true,
          destBusinessId: true,
          status: true,
          items: {
            select: {
              sourceProductId: true,
              qty: true,
              receivedQty: true,
              sourceProduct: { select: { sku: true } },
            },
          },
        },
      }),
    ]);

    const velocityByProduct = new Map(
      sales.map(
        (row) =>
          [
            `${row.businessId}:${row.productId}`,
            Math.round(
              (Math.abs(row._sum.qty ?? 0) / REORDER_VELOCITY_WINDOW_DAYS) *
                100,
            ) / 100,
          ] as const,
      ),
    );
    const openOutboundByProduct = new Map<string, number>();
    const inboundByBranchSku = new Map<
      string,
      { approved: number; inTransit: number }
    >();
    const openPairKeys = new Set<string>();
    for (const transfer of transfers) {
      for (const item of transfer.items) {
        const sku = item.sourceProduct.sku;
        if (!sku) continue;
        const pairKey = `${transfer.sourceBusinessId}:${transfer.destBusinessId}:${sku}`;
        openPairKeys.add(pairKey);
        if (
          transfer.status === StockTransferStatus.pending ||
          transfer.status === StockTransferStatus.approved
        ) {
          const key = `${transfer.sourceBusinessId}:${item.sourceProductId}`;
          openOutboundByProduct.set(
            key,
            (openOutboundByProduct.get(key) ?? 0) + item.qty,
          );
        }
        if (
          transfer.status === StockTransferStatus.approved ||
          transfer.status === StockTransferStatus.shipped
        ) {
          const key = `${transfer.destBusinessId}:${sku}`;
          const inbound = inboundByBranchSku.get(key) ?? {
            approved: 0,
            inTransit: 0,
          };
          const outstanding = Math.max(0, item.qty - (item.receivedQty ?? 0));
          if (transfer.status === StockTransferStatus.approved) {
            inbound.approved += outstanding;
          } else {
            inbound.inTransit += outstanding;
          }
          inboundByBranchSku.set(key, inbound);
        }
      }
    }

    const productsByBranchSku = new Map<string, typeof products>();
    for (const product of products) {
      if (!product.sku) continue;
      const key = `${product.businessId}:${product.sku}`;
      productsByBranchSku.set(key, [
        ...(productsByBranchSku.get(key) ?? []),
        product,
      ]);
    }

    const recommendations: AgentDraftRecommendation[] = [];
    for (const sender of scopedBranches) {
      const senderProducts = products.filter(
        (product) => product.businessId === sender.id && product.sku,
      );
      for (const sourceProduct of senderProducts) {
        const sku = sourceProduct.sku;
        if (
          !sku ||
          productsByBranchSku.get(`${sender.id}:${sku}`)?.length !== 1
        ) {
          continue;
        }
        const velocity =
          velocityByProduct.get(`${sender.id}:${sourceProduct.id}`) ?? 0;
        if (velocity <= 0) continue;
        const committedOutbound =
          openOutboundByProduct.get(`${sender.id}:${sourceProduct.id}`) ?? 0;
        const availableStock = Math.max(
          0,
          sourceProduct.stockQty - committedOutbound,
        );
        const senderCoverDays = Math.floor(availableStock / velocity);
        if (senderCoverDays <= BRANCH_REBALANCE_COVER_DAYS) continue;
        const senderTargetStock = Math.ceil(
          velocity * BRANCH_REBALANCE_COVER_DAYS,
        );
        const transferableSurplus = Math.max(
          0,
          availableStock - senderTargetStock,
        );
        if (transferableSurplus <= 0) continue;

        for (const receiver of scopedBranches) {
          if (receiver.id === sender.id) continue;
          // Each branch sees recommendations involving itself, not proposals between two other
          // branches in the same group.
          if (sender.id !== businessId && receiver.id !== businessId) continue;
          if (openPairKeys.has(`${sender.id}:${receiver.id}:${sku}`)) continue;
          const receiverMatches = productsByBranchSku.get(
            `${receiver.id}:${sku}`,
          );
          if (!receiverMatches || receiverMatches.length !== 1) continue;
          const receiverProduct = receiverMatches[0];
          const inbound = inboundByBranchSku.get(`${receiver.id}:${sku}`) ?? {
            approved: 0,
            inTransit: 0,
          };
          const receiverOpenOutbound =
            openOutboundByProduct.get(`${receiver.id}:${receiverProduct.id}`) ??
            0;
          const receiverProjectedStock =
            Math.max(0, receiverProduct.stockQty - receiverOpenOutbound) +
            inbound.approved +
            inbound.inTransit;
          if (receiverProjectedStock > receiverProduct.lowStockThreshold) {
            continue;
          }
          const receiverShortfall =
            receiverProduct.lowStockThreshold - receiverProjectedStock;
          const suggestedQty = Math.min(transferableSurplus, receiverShortfall);
          if (suggestedQty <= 0) continue;

          const senderName = sender.name;
          const receiverName = receiver.name;
          recommendations.push({
            title: `Review branch transfer: ${sourceProduct.name}`,
            summary: `${senderName} has ${availableStock} available after recorded open transfers (${senderCoverDays} days of cover from trailing recorded sales). ${receiverName} is projected at ${receiverProjectedStock} against its low-stock threshold of ${receiverProduct.lowStockThreshold}, after approved and in-transit transfers. Review a transfer of up to ${suggestedQty}; this analysis does not create a transfer.`,
            classification: 'calculated',
            details: {
              signalType: 'branch_rebalance',
              productName: sourceProduct.name,
              sku,
              sourceProductId: sourceProduct.id,
              destinationProductId: receiverProduct.id,
              sourceBusinessId: sender.id,
              sourceBusinessName: senderName,
              destinationBusinessId: receiver.id,
              destinationBusinessName: receiverName,
              sourceOnHand: sourceProduct.stockQty,
              sourceOpenTransferQty: committedOutbound,
              sourceAvailableAfterOpenTransfers: availableStock,
              sourceSalesVelocityPerDay: velocity,
              sourceDaysOfCover: senderCoverDays,
              sourceTargetCoverDays: BRANCH_REBALANCE_COVER_DAYS,
              destinationOnHand: receiverProduct.stockQty,
              destinationOpenOutboundQty: receiverOpenOutbound,
              destinationApprovedIncomingQty: inbound.approved,
              destinationInTransitQty: inbound.inTransit,
              destinationProjectedStock: receiverProjectedStock,
              destinationLowStockThreshold: receiverProduct.lowStockThreshold,
              suggestedQty,
              formulaVersion: 'branch-rebalance-v1',
            },
            assumptions: [
              `Sender surplus is stock above ${BRANCH_REBALANCE_COVER_DAYS} days of cover at the trailing ${REORDER_VELOCITY_WINDOW_DAYS}-day recorded-sales rate.`,
              'Destination risk is its low-stock threshold after recorded open outbound transfers, approved incoming transfers, and shipped in-transit quantities.',
              'Product identity is matched by a unique SKU in each active branch, matching the canonical stock-transfer service requirement.',
            ],
            missingData: [
              'The inventory schema has no separate stock-reservation ledger. Order creation deducts on-hand stock; pending and approved stock transfers are counted as open outbound commitments.',
              'Product-specific seasonality, transfer lead time, and unit-of-measure conversions are not included.',
            ],
            riskTier: receiverProjectedStock <= 0 ? 'high' : 'medium',
            evidence: {
              resourceType: 'branch_transfer_comparison',
              resourceId: `${sender.id}:${receiver.id}:${sourceProduct.id}`,
              fieldRefs: [
                'Business.id',
                'Business.parentId',
                'Business.active',
                'Product.businessId',
                'Product.sku',
                'Product.stockQty',
                'Product.lowStockThreshold',
                'StockMovement.sale.qty',
                'StockMovement.sale.createdAt',
                'StockTransfer.status',
                'StockTransferItem.qty',
                'StockTransferItem.receivedQty',
              ],
              observedValues: {
                productName: sourceProduct.name,
                sku,
                sourceBusinessId: sender.id,
                sourceBusinessName: senderName,
                sourceOnHand: sourceProduct.stockQty,
                sourceOpenTransferQty: committedOutbound,
                sourceAvailableAfterOpenTransfers: availableStock,
                sourceSalesVelocityPerDay: velocity,
                sourceDaysOfCover: senderCoverDays,
                sourceTargetCoverDays: BRANCH_REBALANCE_COVER_DAYS,
                destinationBusinessId: receiver.id,
                destinationBusinessName: receiverName,
                destinationOnHand: receiverProduct.stockQty,
                destinationOpenOutboundQty: receiverOpenOutbound,
                destinationApprovedIncomingQty: inbound.approved,
                destinationInTransitQty: inbound.inTransit,
                destinationProjectedStock: receiverProjectedStock,
                destinationLowStockThreshold: receiverProduct.lowStockThreshold,
                suggestedQty,
                observedAt: observedAt.toISOString(),
              },
              calculation: `Recorded sales velocity = abs(sum(sale movement qty)) / ${REORDER_VELOCITY_WINDOW_DAYS} days. Sender available = on-hand minus pending/approved transfer line quantities; sender surplus = max(0, available - ceil(velocity × ${BRANCH_REBALANCE_COVER_DAYS} days)). Receiver projected stock = max(0, on-hand - pending/approved outbound) + approved inbound + shipped in-transit not yet received. Receiver risk exists when projected stock is at or below its canonical low-stock threshold. Suggested qty = min(sender surplus, threshold - projected stock).`,
              observedAt,
            },
          });
        }
      }
    }

    return {
      recommendations,
      availability: 'available',
      activeLocationCount: scopedBranches.length,
    };
  }

  private async resolveActiveBranchGroupBusinesses(
    businessId: string,
  ): Promise<Array<{ id: string; name: string }>> {
    const caller = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, parentId: true },
    });
    if (!caller) {
      throw new AppException(
        'INVENTORY_AGENT_BRANCH_SCOPE_MISSING',
        'The current business branch could not be resolved.',
        HttpStatus.NOT_FOUND,
      );
    }

    const rootId = caller.parentId ?? caller.id;
    return this.prisma.business.findMany({
      where: {
        active: true,
        OR: [{ id: rootId }, { parentId: rootId }],
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true },
    });
  }

  private scopedBusinessId(fallbackBusinessId: string): string {
    return this.cls.get<string>(CLS_KEY_BUSINESS_ID) ?? fallbackBusinessId;
  }

  private recommendationSummary(
    availableStock: number,
    velocity: number,
    suggested: number,
  ): string {
    return `Available stock after pending and approved outbound transfer commitments is ${availableStock}. Recorded trailing sales imply ${velocity} units per day. The existing reorder formula suggests reviewing ${suggested} units; this is a proposal, not a purchase order.`;
  }
}
