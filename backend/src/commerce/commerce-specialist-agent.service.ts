import { HttpStatus, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { ClsService } from 'nestjs-cls';
import {
  CommerceRfqStatus,
  CommerceSupplierQuoteStatus,
  Prisma,
} from '@prisma/client';
import { AiInfraService } from '../ai/ai-infra.service';
import { describeAiProviderFailure } from '../ai/ai-provider-error.util';
import { AppException } from '../common/filters/app.exception';
import {
  isSpecialistSourceModuleDisabledError,
  SpecialistAgentPolicyService,
} from '../common/agents/specialist-agent-policy.service';
import { hasRequiredSpecialistAgentAnswerSections } from '../common/agents/specialist-agent-answer.util';
import {
  SPECIALIST_AGENT_UNTRUSTED_DATA_POLICY,
  specialistAgentUntrustedData,
} from '../common/agents/specialist-agent-prompt.util';
import {
  createOrReuseSpecialistAgentRun,
  SPECIALIST_AGENT_RUN_DETAILS_INCLUDE,
} from '../common/agents/specialist-agent-run-idempotency.util';
import {
  recordSpecialistAgentRunCreatedEvent,
  recordSpecialistAgentRunStartedEvent,
  recordSpecialistAgentRunTerminalEvent,
  type SpecialistAgentTerminalStatus,
} from '../common/agents/specialist-agent-run-events.util';
import { ensureSpecialistAgentConfigVersion } from '../common/agents/specialist-agent-config.util';
import { specialistAgentRunDetailsHiddenByModuleSelection } from '../common/agents/specialist-agent-module-selection.util';
import {
  createSpecialistAgentParentRunRef,
  type SpecialistAgentRunOptions,
} from '../common/agents/specialist-agent-run-options';
import { SpecialistAgentToolGatewayService } from '../common/agents/specialist-agent-tool-gateway.service';
import type { CompletedSpecialistAgentToolCallStatus } from '../common/agents/specialist-agent-tool-call.util';
import { resolvePolicies } from '../common/policies/policies.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { ProductValidationService } from './product-validation.service';
import { CommerceExperimentsService } from './commerce-experiments.service';
import { CommerceSupplierClaimsService } from './commerce-supplier-claims.service';
import { DeliveryInsightsService } from '../delivery/delivery-insights.service';
import { CommerceFulfillmentRouterService } from './commerce-fulfillment-router.service';
import {
  CommerceAgentToolsService,
  COMMERCE_AGENT_TOOLS,
} from './commerce-agent-tools.service';
import { CommerceProductionService } from './commerce-production.service';
import type { AnthropicContentBlock } from '../ai/claude.client';

const AGENT_KEY = 'autonomous_commerce';
const AGENT_VERSION = '1.1.0';
const MAX_COMMERCE_QUESTION_LENGTH = 1_000;
const MAX_COMMERCE_READ_TOOL_CALLS = 3;
const MAX_COMMERCE_TOOL_RESULT_BYTES = 16_000;

type CommerceToolTrace = {
  tool: string;
  outcome: 'succeeded' | 'refused' | 'failed' | 'blocked';
  summary: string;
  screen: string | null;
  toolRunId: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function responseErrorCode(error: unknown): string {
  if (error instanceof AppException) {
    const body = error.getResponse();
    if (isRecord(body) && typeof body.code === 'string') return body.code;
  }
  return 'COMMERCE_AGENT_QUESTION_FAILED';
}

type StatusCounts = Record<string, number>;

type CommerceSnapshot = {
  productOpportunities: StatusCounts;
  rfqs: StatusCounts;
  riskCases: StatusCounts;
  channelListings: StatusCounts;
  experiments: StatusCounts;
};

type ComparableSupplierQuote = {
  quoteId: string;
  supplierName: string;
  currency: string;
  landedTotal: string;
  leadTimeDays: number | null;
  paymentTerms: string | null;
  validUntil: string | null;
};

type SourcingComparisonReview = {
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
    quotes: ComparableSupplierQuote[];
    excludedQuoteCount: number;
    exclusionReasons: Record<string, number>;
    conclusion: string;
  }[];
  limitations: string[];
};

type ReconciliationReview = {
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

type CommerceInventoryAvailabilityReview = {
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
    thresholdState:
      'at_or_below_recorded_threshold' | 'above_recorded_threshold';
    providers: string[];
  }[];
  observedAt: string;
  limitations: string[];
};

type ReviewCandidate = {
  title: string;
  summary: string;
  resourceType: string;
  fieldRefs: string[];
};

type CommerceSpecialistReviewStep = {
  key: string;
  label: string;
  status: 'completed' | 'failed' | 'skipped';
  durationMs: number;
  errorCode: string | null;
  unavailableReason: string | null;
};

type AiSummary = {
  status: 'ready' | 'not_configured' | 'blocked' | 'unavailable';
  text: string | null;
  message: string | null;
  inputTokens: number;
  outputTokens: number;
};

type CommerceOrderOrchestrationStep = {
  worker: 'order_review' | 'fulfillment_routing';
  toolKey: 'get_order' | 'calculate_fulfillment_route';
  status: 'completed' | 'blocked' | 'failed';
  toolRunId: string | null;
  summary: string;
  screen: string;
};

type CommerceRouteEvaluationReview = {
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
};

type CommerceOrderOrchestrationOutput = {
  goal: 'order_fulfillment_readiness';
  state: 'ready' | 'blocked' | 'failed';
  orderId: string;
  destinationCountry: string | null;
  correlationId: string;
  summary: string;
  steps: CommerceOrderOrchestrationStep[];
  routeEvaluation: CommerceRouteEvaluationReview | null;
  limitations: string[];
};

type CommerceProductSourcingStep = {
  worker: 'product_discovery' | 'product_validation' | 'sourcing';
  toolKey: 'get_product_opportunity' | 'get_validation_case' | 'compare_quotes';
  status: 'completed' | 'blocked' | 'failed';
  toolRunId: string | null;
  summary: string;
  screen: string;
};

type CommerceProductSourcingOutput = {
  goal: 'product_sourcing_readiness';
  state: 'ready' | 'needs_sourcing' | 'blocked' | 'failed';
  opportunityId: string;
  rfqId: string | null;
  correlationId: string;
  summary: string;
  steps: CommerceProductSourcingStep[];
  limitations: string[];
};

function boundedText(value: unknown, maximum = 300): string | null {
  return typeof value === 'string' ? value.slice(0, maximum) : null;
}

function boundedTextList(value: unknown, take = 5): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .slice(0, take)
        .map((item) => item.slice(0, 300))
    : [];
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Projects only bounded routing evidence; order-line names and SKUs stay in their source screen. */
function routeEvaluationReview(
  value: unknown,
): CommerceRouteEvaluationReview | null {
  if (!isRecord(value)) return null;
  const rawNodes = Array.isArray(value.nodes) ? value.nodes : [];
  const candidates = rawNodes.slice(0, 10).flatMap((rawNode) => {
    if (!isRecord(rawNode)) return [];
    const nodeId = boundedText(rawNode.nodeId, 191);
    if (!nodeId) return [];
    const rawLines = Array.isArray(rawNode.lines) ? rawNode.lines : [];
    const lines = rawLines.slice(0, 10).flatMap((rawLine) => {
      if (!isRecord(rawLine)) return [];
      const orderItemId = boundedText(rawLine.orderItemId, 191);
      if (!orderItemId) return [];
      return [
        {
          orderItemId,
          role: boundedText(rawLine.role, 32),
          stock: boundedText(rawLine.stock, 32) ?? 'not_tracked',
          eligible: rawLine.eligible === true,
          reasons: boundedTextList(rawLine.reasons, 5),
        },
      ];
    });
    return [
      {
        nodeId,
        name: boundedText(rawNode.name, 191) ?? 'Unnamed fulfillment node',
        market: boundedText(rawNode.market, 32) ?? 'unknown',
        eligibleForAll: rawNode.eligibleForAll === true,
        processingDays: finiteOrNull(rawNode.processingDays),
        costPerOrder: finiteOrNull(rawNode.costPerOrder),
        lines,
        lineCount: rawLines.length,
        linesTruncated: rawLines.length > lines.length,
      },
    ];
  });
  const rawRecommendation = isRecord(value.recommendation)
    ? value.recommendation
    : null;
  const allocations = Array.isArray(rawRecommendation?.allocations)
    ? rawRecommendation.allocations.slice(0, 20).flatMap((allocation) => {
        if (!isRecord(allocation)) return [];
        const orderItemId = boundedText(allocation.orderItemId, 191);
        const nodeId = boundedText(allocation.nodeId, 191);
        return orderItemId && nodeId ? [{ orderItemId, nodeId }] : [];
      })
    : [];

  return {
    policyVersion: boundedText(value.policyVersion, 32),
    destinationCountry: boundedText(value.destinationCountry, 2),
    recommendation: rawRecommendation
      ? {
          mode: boundedText(rawRecommendation.mode, 32) ?? 'unknown',
          allocations,
          why: boundedTextList(rawRecommendation.why, 5),
        }
      : null,
    candidateCount: rawNodes.length,
    candidates,
    candidatesTruncated: rawNodes.length > candidates.length,
    unroutableLineCount: Array.isArray(value.unroutableLineIds)
      ? value.unroutableLineIds.length
      : 0,
  };
}

@Injectable()
export class CommerceSpecialistAgentService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly aiInfra: AiInfraService,
    private readonly cls: ClsService,
    private readonly agentPolicy: SpecialistAgentPolicyService,
    private readonly productValidation: ProductValidationService,
    private readonly commerceExperiments: CommerceExperimentsService,
    private readonly supplierClaims: CommerceSupplierClaimsService,
    private readonly deliveryInsights: DeliveryInsightsService,
    private readonly fulfillmentRouter: CommerceFulfillmentRouterService,
    private readonly production: CommerceProductionService,
    private readonly agentTools: CommerceAgentToolsService,
    private readonly toolGateway: SpecialistAgentToolGatewayService,
  ) {
    this.toolGateway.registerAgentTools(
      AGENT_KEY,
      '29',
      COMMERCE_AGENT_TOOLS,
      async (context, tool, input) => {
        if (!context.actorUserId) {
          throw new AppException(
            'COMMERCE_AGENT_ACTOR_REQUIRED',
            'An authenticated user is required to run this Commerce tool.',
            HttpStatus.FORBIDDEN,
          );
        }
        const result = await this.agentTools.run(
          context.businessId,
          context.actorUserId,
          tool.key,
          input,
          undefined,
          'commerce_agent',
          context.correlationId,
        );
        const status: CompletedSpecialistAgentToolCallStatus =
          result.run.outcome === 'succeeded'
            ? 'succeeded'
            : result.run.outcome === 'refused'
              ? 'refused'
              : 'failed';
        return {
          output: result.result,
          status,
          summary:
            result.run.resultSummary ??
            result.run.refusalReason ??
            'No summary was recorded.',
          outputResourceType: 'CommerceAgentToolRun',
          outputResourceId: result.run.id,
          errorCode: status === 'failed' ? 'CANONICAL_TOOL_FAILED' : null,
        };
      },
    );
  }

  /**
   * Answer a bounded Commerce question with only the registry's read-only tools. Model output
   * cannot select a write tool; every tool is re-authorized through CommerceAgentToolsService.
   */
  async ask(
    businessId: string,
    actorUserId: string,
    question: string,
    idempotencyKey?: string,
  ) {
    const scopedBusinessId =
      this.cls.get<string>(CLS_KEY_BUSINESS_ID) ?? businessId;
    await this.agentPolicy.assertEnabled(scopedBusinessId, 'commerce');
    const business = await this.tenantPrisma.client.business.findFirst({
      where: { id: scopedBusinessId },
      select: { policies: true },
    });
    const autonomyLevel = resolvePolicies(business).num(
      'commerce.autonomyLevel',
    );
    const maxReadToolCalls =
      resolvePolicies(business).num('agents.commerceMaxReadToolCallsPerRun') ??
      MAX_COMMERCE_READ_TOOL_CALLS;
    if (autonomyLevel === null || autonomyLevel < 1) {
      throw new AppException(
        'COMMERCE_AGENT_DISABLED',
        'Commerce autonomy is disabled. Set it to Observe or higher in Agents & Tools before asking a question.',
        HttpStatus.FORBIDDEN,
      );
    }
    const normalizedQuestion = question.trim();
    if (
      normalizedQuestion.length < 4 ||
      normalizedQuestion.length > MAX_COMMERCE_QUESTION_LENGTH
    ) {
      throw new AppException(
        'COMMERCE_AGENT_QUESTION_INVALID',
        `Enter a question between 4 and ${MAX_COMMERCE_QUESTION_LENGTH} characters.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const questionHash = createHash('sha256')
      .update(normalizedQuestion)
      .digest('hex');
    const correlationId = randomUUID();
    const runData: Prisma.SpecialistAgentRunUncheckedCreateInput = {
      businessId: scopedBusinessId,
      agentKey: AGENT_KEY,
      agentVersion: AGENT_VERSION,
      moduleId: '29',
      triggerType: 'manual',
      status: 'running',
      initiatedByUserId: actorUserId,
      inputRefs: [
        {
          source: 'commerce_agent_question',
          scope: 'current_business',
          questionSha256: questionHash,
          questionStored: false,
        },
      ],
      policyResult: {
        autonomyLevel: resolvePolicies(business).num('commerce.autonomyLevel'),
        riskTier: 'low',
        readOnlyToolsOnly: true,
        materialWritesAllowed: false,
        maxToolCalls: maxReadToolCalls,
        correlationId,
      },
    };
    const reservation = await createOrReuseSpecialistAgentRun(
      (data) =>
        this.tenantPrisma.client.$transaction(async (tx) => {
          const run = await tx.specialistAgentRun.create({ data });
          await recordSpecialistAgentRunCreatedEvent(tx, run);
          await recordSpecialistAgentRunStartedEvent(tx, run);
          return run;
        }),
      (keyBusinessId, agentKey, idempotencyKeyHash) =>
        this.tenantPrisma.client.specialistAgentRun.findFirst({
          where: { businessId: keyBusinessId, agentKey, idempotencyKeyHash },
        }),
      runData,
      idempotencyKey,
      { questionHash },
      (configBusinessId, agentKey) =>
        ensureSpecialistAgentConfigVersion(
          this.tenantPrisma.unscoped,
          configBusinessId,
          agentKey,
        ),
    );
    if (reservation.reused) {
      return this.tenantPrisma.client.specialistAgentRun.findFirstOrThrow({
        where: {
          id: reservation.run.id,
          businessId: scopedBusinessId,
          agentKey: AGENT_KEY,
        },
        include: SPECIALIST_AGENT_RUN_DETAILS_INCLUDE,
      });
    }

    const startedAt = Date.now();
    const toolTrace: CommerceToolTrace[] = [];
    try {
      const readOnlyToolSchemas = this.toolGateway.schemasForAgent(
        AGENT_KEY,
        (tool) =>
          tool.exposedToReadOnlyAssistant === true &&
          tool.riskClass === 'READ_ONLY' &&
          tool.executable,
      );
      const readOnlyToolNames = new Set(
        readOnlyToolSchemas.map((tool) => tool.name),
      );
      await this.toolGateway.assertToolSourcesEnabled(
        scopedBusinessId,
        AGENT_KEY,
        [],
        { actorUserId, runId: reservation.run.id },
      );
      const first = await this.aiInfra.createMessage(
        scopedBusinessId,
        'commerce_agent',
        {
          system: `You are Noxtill Autonomous Commerce Agent. First use only registered read-only Noxtill tools to retrieve evidence; do not answer the question from memory or general assumptions. Never request or imply a write, publication, supplier contact, stock/order change, customer message, payment, or approval. Do not invent missing values. State when a source is unavailable or an input could not be verified. Do not reveal hidden reasoning. ${SPECIALIST_AGENT_UNTRUSTED_DATA_POLICY}`,
          messages: [
            {
              role: 'user',
              content: specialistAgentUntrustedData(
                'Commerce user question',
                normalizedQuestion,
              ),
            },
          ],
          tools: readOnlyToolSchemas,
          temperature: 0,
          maxTokens: 700,
        },
        {
          operation: 'commerce_read_only_question',
          toolsAvailable: [...readOnlyToolNames],
        },
        undefined,
        reservation.run.id,
      );

      const requestedCalls = first.content.filter(
        (block) => block.type === 'tool_use',
      );
      let finalText = '';
      let toolRoundLimited = false;
      let answerFormatIncomplete = false;

      if (requestedCalls.length > 0) {
        const toolResults: AnthropicContentBlock[] = [];
        for (const [index, block] of requestedCalls.entries()) {
          const toolUseId = typeof block.id === 'string' ? block.id : null;
          const name = typeof block.name === 'string' ? block.name : '';
          const registeredTool = this.toolGateway.toolForAgent(AGENT_KEY, name);
          const toolVersion = registeredTool?.toolVersion ?? 1;
          if (!toolUseId) {
            await this.toolGateway.record({
              businessId: scopedBusinessId,
              runId: reservation.run.id,
              agentKey: AGENT_KEY,
              moduleId: '29',
              actorUserId,
              toolKey: 'invalid_tool_request',
              toolVersion,
              sequence: index + 1,
              status: 'blocked',
              input: block.input,
              durationMs: 0,
              errorCode: 'PROVIDER_TOOL_CALL_ID_MISSING',
              correlationId,
            });
            toolTrace.push({
              tool: 'invalid_tool_request',
              outcome: 'blocked',
              summary:
                'The AI provider returned a tool request without an ID; it was not run.',
              screen: null,
              toolRunId: null,
            });
            continue;
          }

          if (
            index >= maxReadToolCalls ||
            !readOnlyToolNames.has(name) ||
            registeredTool?.riskClass !== 'READ_ONLY' ||
            registeredTool?.executable !== true
          ) {
            const summary =
              index >= maxReadToolCalls
                ? `Tool-call limit reached (${maxReadToolCalls}); this request was not run.`
                : 'This tool is not allowed in the read-only Commerce question flow.';
            toolTrace.push({
              tool: readOnlyToolNames.has(name) ? name : 'unsupported_tool',
              outcome: 'blocked',
              summary,
              screen: registeredTool?.screen ?? null,
              toolRunId: null,
            });
            const registeredKey = registeredTool ? name : 'unsupported_tool';
            await this.toolGateway.record({
              businessId: scopedBusinessId,
              runId: reservation.run.id,
              agentKey: AGENT_KEY,
              moduleId: '29',
              actorUserId,
              toolKey: registeredKey,
              toolVersion,
              sequence: index + 1,
              status: 'blocked',
              input: block.input,
              durationMs: 0,
              errorCode:
                index >= maxReadToolCalls
                  ? 'TOOL_CALL_LIMIT_REACHED'
                  : 'TOOL_NOT_ALLOWED',
              correlationId,
            });
            await this.tenantPrisma.client.auditLog.create({
              data: {
                businessId: scopedBusinessId,
                actorUserId,
                action: 'commerce.agent_tool_call_blocked',
                entity: 'SpecialistAgentRun',
                entityId: reservation.run.id,
                after: {
                  tool: readOnlyToolNames.has(name) ? name : 'unsupported_tool',
                  reason:
                    index >= maxReadToolCalls
                      ? 'tool_call_limit'
                      : 'not_read_only_or_registered',
                },
              },
            });
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUseId,
              content: specialistAgentUntrustedData(
                'Blocked tool result',
                summary,
              ),
              is_error: true,
            });
            toolRoundLimited ||= index >= maxReadToolCalls;
            continue;
          }

          try {
            const result = await this.toolGateway.execute({
              agentKey: AGENT_KEY,
              moduleId: '29',
              businessId: scopedBusinessId,
              actorUserId,
              runId: reservation.run.id,
              correlationId,
              round: 1,
              sequence: index + 1,
              toolKey: name,
              input: block.input,
              mode: 'read_only',
              authorize: () =>
                this.agentPolicy.assertEnabled(scopedBusinessId, 'commerce'),
            });
            const summary = result.summary ?? 'No summary was recorded.';
            const screen = result.tool.screen ?? null;
            const serialized = JSON.stringify(result.output);
            const modelPayload =
              Buffer.byteLength(serialized ?? 'null', 'utf8') >
              MAX_COMMERCE_TOOL_RESULT_BYTES
                ? {
                    summary,
                    dataOmitted: true,
                    reason:
                      'The bounded result exceeded the AI context limit; open the canonical screen for the full result.',
                  }
                : { summary, data: result.output };
            toolTrace.push({
              tool: name,
              outcome: result.status,
              summary,
              screen,
              toolRunId: result.outputResourceId,
            });
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUseId,
              content: specialistAgentUntrustedData(
                'Registered read-only commerce tool result',
                modelPayload,
              ),
              is_error: result.status !== 'succeeded',
            });
          } catch (error) {
            const message =
              error instanceof AppException
                ? error.message
                : 'The registered read tool failed. Open the canonical screen to inspect the source.';
            toolTrace.push({
              tool: name,
              outcome: 'failed',
              summary: message,
              screen: registeredTool?.screen ?? null,
              toolRunId: null,
            });
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUseId,
              content: specialistAgentUntrustedData(
                'Failed read-only tool result',
                message,
              ),
              is_error: true,
            });
          }
        }

        if (
          toolResults.length === requestedCalls.length &&
          toolTrace.some((item) => item.outcome === 'succeeded')
        ) {
          const successfulToolKeys = toolTrace
            .filter((item) => item.outcome === 'succeeded')
            .map((item) => item.tool);
          await this.toolGateway.assertToolSourcesEnabled(
            scopedBusinessId,
            AGENT_KEY,
            successfulToolKeys,
            { actorUserId, runId: reservation.run.id },
          );
          const final = await this.aiInfra.createMessage(
            scopedBusinessId,
            'commerce_agent',
            {
              system: `Answer the original question only from successful supplied registered tool results. Tool errors, omitted large results and blocked requests are not evidence of absence. Do not infer missing data, do not ask for or perform writes. Return exactly five markdown headings, each on its own line and in this order: "## Answer", "## Evidence", "## Calculation", "## Assumptions and gaps", and "## Confidence". Name the source tools and canonical screens; state unavailable sources and limitations. Put meaningful content under every heading. Confidence describes evidence coverage only and is not calibrated. ${SPECIALIST_AGENT_UNTRUSTED_DATA_POLICY}`,
              messages: [
                {
                  role: 'user',
                  content: specialistAgentUntrustedData(
                    'Commerce user question',
                    normalizedQuestion,
                  ),
                },
                {
                  role: 'assistant',
                  content: first.content.filter(
                    (block) => block.type === 'tool_use',
                  ),
                },
                { role: 'user', content: toolResults },
              ],
              temperature: 0,
              maxTokens: 700,
            },
            {
              operation: 'commerce_read_only_question_result',
              tools: toolTrace.map((item) => ({
                tool: item.tool,
                outcome: item.outcome,
              })),
            },
            undefined,
            reservation.run.id,
          );
          await this.toolGateway.assertToolSourcesEnabled(
            scopedBusinessId,
            AGENT_KEY,
            successfulToolKeys,
            { actorUserId, runId: reservation.run.id },
          );
          const candidateText = final.content
            .filter((block) => block.type === 'text')
            .map((block) => block.text ?? '')
            .join('\n')
            .trim();
          const boundedText = candidateText.slice(0, 3_000);
          finalText = hasRequiredSpecialistAgentAnswerSections(boundedText)
            ? boundedText
            : '';
          answerFormatIncomplete = Boolean(candidateText && !finalText);
          if (final.stopReason === 'tool_use') toolRoundLimited = true;
        }
      }

      const answerStatus = finalText ? 'ready' : 'unavailable';
      const hasSuccessfulEvidence = toolTrace.some(
        (item) => item.outcome === 'succeeded',
      );
      const message = finalText
        ? toolRoundLimited
          ? `Stopped after one read-only tool round and ${maxReadToolCalls} tool call${maxReadToolCalls === 1 ? '' : 's'} maximum. No write tools are available here.`
          : null
        : answerFormatIncomplete
          ? 'The AI response did not include complete Answer, Evidence, Calculation, Assumptions and gaps, and Confidence sections. Review the recorded tool results in the canonical screens.'
          : !hasSuccessfulEvidence
            ? 'No registered Commerce source returned usable evidence for this question. Open the canonical screen or ask about a source available to the agent.'
            : 'The AI provider did not return a grounded text answer. Review the recorded tool results in the canonical screens.';
      const finishedAt = new Date();
      const terminalStatus =
        answerStatus === 'ready' ? 'completed' : 'partially_succeeded';
      await this.toolGateway.assertToolSourcesEnabled(
        scopedBusinessId,
        AGENT_KEY,
        toolTrace
          .filter((item) => item.outcome === 'succeeded')
          .map((item) => item.tool),
        { actorUserId, runId: reservation.run.id },
      );
      return await this.tenantPrisma.client.$transaction(async (tx) => {
        await this.agentPolicy.assertAgentEnabledInTransaction(
          tx,
          scopedBusinessId,
          'commerce',
        );
        await this.toolGateway.assertToolSourcesEnabledInTransaction(
          tx,
          scopedBusinessId,
          AGENT_KEY,
          toolTrace
            .filter((item) => item.outcome === 'succeeded')
            .map((item) => item.tool),
          { actorUserId, runId: reservation.run.id },
        );
        const completed = await tx.specialistAgentRun.update({
          where: { id: reservation.run.id },
          data: {
            status: terminalStatus,
            output: {
              answer: finalText || null,
              answerStatus,
              message,
              tools: toolTrace as unknown as Prisma.InputJsonArray,
              coverage: 'registered_read_only_commerce_tools',
              correlationId,
              observedAt: finishedAt.toISOString(),
              durationMs: Date.now() - startedAt,
            },
            finishedAt,
          },
          include: SPECIALIST_AGENT_RUN_DETAILS_INCLUDE,
        });
        await recordSpecialistAgentRunTerminalEvent(
          tx,
          reservation.run,
          terminalStatus,
          finishedAt,
        );
        await tx.auditLog.create({
          data: {
            businessId: scopedBusinessId,
            actorUserId,
            action: 'commerce.specialist_agent.question_answered',
            entity: 'SpecialistAgentRun',
            entityId: reservation.run.id,
            after: {
              agentKey: AGENT_KEY,
              toolCount: toolTrace.length,
              answerStatus,
              questionSha256: questionHash,
              correlationId,
            },
          },
        });
        return completed;
      });
    } catch (error) {
      const failure = describeAiProviderFailure(error);
      const finishedAt = new Date();
      await this.tenantPrisma.client.$transaction(async (tx) => {
        await tx.specialistAgentRun.update({
          where: { id: reservation.run.id },
          data: {
            status: 'failed',
            errorCode: failure.code,
            errorMessage: failure.message,
            output: {
              answer: null,
              answerStatus: 'unavailable',
              message: failure.message,
              tools: toolTrace as unknown as Prisma.InputJsonArray,
              coverage: 'registered_read_only_commerce_tools',
              correlationId,
            },
            finishedAt,
          },
        });
        await recordSpecialistAgentRunTerminalEvent(
          tx,
          reservation.run,
          'failed',
          finishedAt,
        );
        await tx.auditLog.create({
          data: {
            businessId: scopedBusinessId,
            actorUserId,
            action: 'commerce.specialist_agent.question_failed',
            entity: 'SpecialistAgentRun',
            entityId: reservation.run.id,
            after: {
              agentKey: AGENT_KEY,
              errorCode: failure.code,
              toolCount: toolTrace.length,
              correlationId,
            },
          },
        });
      });
      return this.tenantPrisma.client.specialistAgentRun.findFirstOrThrow({
        where: {
          id: reservation.run.id,
          businessId: scopedBusinessId,
          agentKey: AGENT_KEY,
        },
        include: SPECIALIST_AGENT_RUN_DETAILS_INCLUDE,
      });
    }
  }

  async listRuns() {
    const scopedBusinessId =
      this.cls.get<string>(CLS_KEY_BUSINESS_ID);
    if (!scopedBusinessId) {
      throw new AppException(
        'COMMERCE_AGENT_BUSINESS_CONTEXT_REQUIRED',
        'A business context is required to read Commerce Agent history.',
        HttpStatus.FORBIDDEN,
      );
    }
    const runs = await this.tenantPrisma.client.specialistAgentRun.findMany({
      where: { agentKey: AGENT_KEY },
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
    const disabledModules = new Set(
      await this.agentPolicy.disabledModulesForBusiness(scopedBusinessId),
    );
    return runs.map((run) => {
      if (
        !specialistAgentRunDetailsHiddenByModuleSelection(
          run.output,
          disabledModules,
          [
            'autonomous-commerce',
            'integrations',
            'products',
            'orders',
            'deliveries',
            'inventory',
          ],
        )
      ) {
        return run;
      }
      return {
        ...run,
        output: {
          message:
            'Saved Commerce Agent details are hidden because a source module used by the agent is disabled. Enable the required modules and run a fresh review.',
          summary:
            'Saved Commerce Agent details are unavailable under the current module selection.',
        },
        recommendations: [],
      };
    });
  }

  /**
   * Runs a bounded read-only Commerce plan: verify the canonical order first, then calculate
   * eligible fulfillment route candidates. Child tools inherit the same actor, tenant and trace;
   * nothing is assigned, reserved, promised or written.
   */
  async orchestrateOrderFulfillment(
    businessId: string,
    actorUserId: string,
    input: { orderId: string; destinationCountry?: string },
    idempotencyKey?: string,
  ) {
    const scopedBusinessId =
      this.cls.get<string>(CLS_KEY_BUSINESS_ID) ?? businessId;
    await this.agentPolicy.assertEnabled(scopedBusinessId, 'commerce');
    const orderId = input.orderId.trim();
    const destinationCountry =
      input.destinationCountry?.trim().toUpperCase() || null;
    if (!orderId || orderId.length > 191) {
      throw new AppException(
        'COMMERCE_ORDER_ORCHESTRATION_INPUT_INVALID',
        'Enter a valid canonical order ID.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (destinationCountry && !/^[A-Z]{2}$/.test(destinationCountry)) {
      throw new AppException(
        'COMMERCE_ORDER_ORCHESTRATION_COUNTRY_INVALID',
        'Destination country must be a two-letter ISO country code.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const registry = await this.agentTools.registry(scopedBusinessId);
    if (registry.autonomyLevel < 1) {
      throw new AppException(
        'COMMERCE_AGENT_DISABLED',
        'Commerce autonomy is disabled. Set it to Observe or higher in Agents & Tools before running an order review.',
        HttpStatus.FORBIDDEN,
      );
    }
    const orderedTools = ['get_order', 'calculate_fulfillment_route'] as const;
    const toolDefinitions = new Map(
      COMMERCE_AGENT_TOOLS.map((tool) => [tool.key, tool]),
    );
    if (
      orderedTools.some((key) => {
        const tool = toolDefinitions.get(key);
        return !tool || !tool.executable || tool.riskClass !== 'READ_ONLY';
      })
    ) {
      throw new AppException(
        'COMMERCE_ORDER_ORCHESTRATION_UNAVAILABLE',
        'The read-only order review tools are not available in the Commerce registry.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const correlationId = randomUUID();
    const limitations = [
      'This review reads the canonical order and calculates route candidates only. It does not assign a route, reserve stock, create a fulfillment request, contact a carrier or make a customer delivery promise.',
      'Inventory, provider and market coverage are limited to the canonical records available to this business at review time. Recheck the Fulfillment Router before any operator decision.',
    ];
    const initialOutput: CommerceOrderOrchestrationOutput = {
      goal: 'order_fulfillment_readiness',
      state: 'ready',
      orderId,
      destinationCountry,
      correlationId,
      summary: 'The order review is starting.',
      steps: [],
      routeEvaluation: null,
      limitations,
    };
    const runData: Prisma.SpecialistAgentRunUncheckedCreateInput = {
      businessId: scopedBusinessId,
      agentKey: AGENT_KEY,
      agentVersion: AGENT_VERSION,
      moduleId: '29',
      triggerType: 'manual',
      status: 'running',
      initiatedByUserId: actorUserId,
      inputRefs: [
        {
          source: 'CommerceOrder',
          scope: 'current_business',
          resourceId: orderId,
          destinationCountry,
        },
      ],
      output: {
        orderFulfillmentOrchestration:
          initialOutput as unknown as Prisma.InputJsonObject,
      },
      policyResult: {
        autonomyLevel: registry.autonomyLevel,
        riskTier: 'low',
        readOnly: true,
        allowedTools: [...orderedTools],
        maxToolCalls: orderedTools.length,
        requireOrderReadBeforeRouteCalculation: true,
        performsCommerceWrites: false,
      },
    };
    const reservation = await createOrReuseSpecialistAgentRun(
      (data) =>
        this.tenantPrisma.client.$transaction(async (tx) => {
          const run = await tx.specialistAgentRun.create({ data });
          await recordSpecialistAgentRunCreatedEvent(tx, run);
          await recordSpecialistAgentRunStartedEvent(tx, run);
          return run;
        }),
      (keyBusinessId, agentKey, idempotencyKeyHash) =>
        this.tenantPrisma.client.specialistAgentRun.findFirst({
          where: { businessId: keyBusinessId, agentKey, idempotencyKeyHash },
        }),
      runData,
      idempotencyKey,
      {
        businessId: scopedBusinessId,
        actorUserId,
        goal: 'order_fulfillment_readiness',
        orderId,
        destinationCountry,
      },
      (configBusinessId, agentKey) =>
        ensureSpecialistAgentConfigVersion(
          this.tenantPrisma.unscoped,
          configBusinessId,
          agentKey,
        ),
    );
    if (reservation.reused) {
      return this.tenantPrisma.client.specialistAgentRun.findFirstOrThrow({
        where: {
          id: reservation.run.id,
          businessId: scopedBusinessId,
          agentKey: AGENT_KEY,
        },
        include: SPECIALIST_AGENT_RUN_DETAILS_INCLUDE,
      });
    }

    const steps: CommerceOrderOrchestrationStep[] = [];
    let routeEvaluation: CommerceRouteEvaluationReview | null = null;
    const output = (
      state: CommerceOrderOrchestrationOutput['state'],
      summary: string,
    ): Prisma.InputJsonObject => ({
      orderFulfillmentOrchestration: {
        goal: 'order_fulfillment_readiness',
        state,
        orderId,
        destinationCountry,
        correlationId,
        summary,
        steps: steps as unknown as Prisma.InputJsonArray,
        routeEvaluation: routeEvaluation as unknown as Prisma.InputJsonValue,
        limitations: [...limitations],
      },
    });
    const persist = async (
      status: SpecialistAgentTerminalStatus | 'running',
      state: CommerceOrderOrchestrationOutput['state'],
      summary: string,
      finished = false,
    ) =>
      this.tenantPrisma.client.$transaction(async (tx) => {
        const finishedAt = finished ? new Date() : null;
        const updated = await tx.specialistAgentRun.update({
          where: { id: reservation.run.id },
          data: {
            status,
            output: output(state, summary),
            ...(finishedAt ? { finishedAt } : {}),
          },
        });
        if (finishedAt && status !== 'running') {
          await recordSpecialistAgentRunTerminalEvent(
            tx,
            reservation.run,
            status,
            finishedAt,
          );
        }
        return updated;
      });

    await this.tenantPrisma.client.auditLog.create({
      data: {
        businessId: scopedBusinessId,
        actorUserId,
        action: 'commerce.agent_orchestration_started',
        entity: 'SpecialistAgentRun',
        entityId: reservation.run.id,
        after: {
          goal: 'order_fulfillment_readiness',
          orderId,
          destinationCountry,
          correlationId,
          allowedTools: [...orderedTools],
        },
      },
    });

    try {
      const orderRead = await this.agentTools.run(
        scopedBusinessId,
        actorUserId,
        'get_order',
        { orderId },
        undefined,
        'agent',
        correlationId,
      );
      const orderStep: CommerceOrderOrchestrationStep = {
        worker: 'order_review',
        toolKey: 'get_order',
        status: orderRead.run.outcome === 'succeeded' ? 'completed' : 'failed',
        toolRunId: orderRead.run.id,
        summary:
          orderRead.run.resultSummary ??
          'The canonical order review returned no summary.',
        screen: '/orders',
      };
      steps.push(orderStep);
      if (orderRead.run.outcome !== 'succeeded') {
        const summary =
          'The canonical order could not be reviewed. Fulfillment routing was not started.';
        await persist('failed', 'failed', summary, true);
        return this.tenantPrisma.client.specialistAgentRun.findFirstOrThrow({
          where: { id: reservation.run.id, businessId: scopedBusinessId },
          include: SPECIALIST_AGENT_RUN_DETAILS_INCLUDE,
        });
      }
      if (!orderRead.result) {
        orderStep.status = 'blocked';
        const summary =
          'The order was not found in this business, so fulfillment routing was not started.';
        await persist('completed', 'blocked', summary, true);
        await this.tenantPrisma.client.auditLog.create({
          data: {
            businessId: scopedBusinessId,
            actorUserId,
            action: 'commerce.agent_orchestration_blocked',
            entity: 'SpecialistAgentRun',
            entityId: reservation.run.id,
            after: {
              goal: 'order_fulfillment_readiness',
              reason: 'order_not_found',
              correlationId,
            },
          },
        });
        return this.tenantPrisma.client.specialistAgentRun.findFirstOrThrow({
          where: { id: reservation.run.id, businessId: scopedBusinessId },
          include: SPECIALIST_AGENT_RUN_DETAILS_INCLUDE,
        });
      }
      await persist(
        'running',
        'ready',
        'The canonical order was found. Calculating route candidates next.',
      );

      const routeRead = await this.agentTools.run(
        scopedBusinessId,
        actorUserId,
        'calculate_fulfillment_route',
        { orderId, ...(destinationCountry ? { destinationCountry } : {}) },
        undefined,
        'agent',
        correlationId,
      );
      steps.push({
        worker: 'fulfillment_routing',
        toolKey: 'calculate_fulfillment_route',
        status: routeRead.run.outcome === 'succeeded' ? 'completed' : 'failed',
        toolRunId: routeRead.run.id,
        summary:
          routeRead.run.resultSummary ??
          'The route candidate calculation returned no summary.',
        screen: '/autonomous-commerce/fulfillment-router',
      });
      const complete = routeRead.run.outcome === 'succeeded';
      routeEvaluation = complete
        ? routeEvaluationReview(routeRead.result)
        : null;
      const summary = complete
        ? 'Order review and fulfillment route calculation completed. Review the recorded candidates in Fulfillment Router; no route was assigned.'
        : 'The order was reviewed, but route calculation failed. No route was assigned.';
      await persist(
        complete ? 'completed' : 'partially_succeeded',
        complete ? 'ready' : 'failed',
        summary,
        true,
      );
      await this.tenantPrisma.client.auditLog.create({
        data: {
          businessId: scopedBusinessId,
          actorUserId,
          action: 'commerce.agent_orchestration_completed',
          entity: 'SpecialistAgentRun',
          entityId: reservation.run.id,
          after: {
            goal: 'order_fulfillment_readiness',
            state: complete ? 'ready' : 'failed',
            correlationId,
            childToolRunIds: steps.map((step) => step.toolRunId),
          },
        },
      });
      return this.tenantPrisma.client.specialistAgentRun.findFirstOrThrow({
        where: { id: reservation.run.id, businessId: scopedBusinessId },
        include: SPECIALIST_AGENT_RUN_DETAILS_INCLUDE,
      });
    } catch (error) {
      const message =
        error instanceof AppException || error instanceof Error
          ? error.message
          : 'The order fulfillment review failed.';
      await persist('failed', 'failed', message, true);
      await this.tenantPrisma.client.auditLog.create({
        data: {
          businessId: scopedBusinessId,
          actorUserId,
          action: 'commerce.agent_orchestration_failed',
          entity: 'SpecialistAgentRun',
          entityId: reservation.run.id,
          after: {
            goal: 'order_fulfillment_readiness',
            errorCode: responseErrorCode(error),
            correlationId,
            completedChildToolRunIds: steps.map((step) => step.toolRunId),
          },
        },
      });
      return this.tenantPrisma.client.specialistAgentRun.findFirstOrThrow({
        where: { id: reservation.run.id, businessId: scopedBusinessId },
        include: SPECIALIST_AGENT_RUN_DETAILS_INCLUDE,
      });
    }
  }

  /** Reviews one canonical opportunity, its evidence scorecard and a linked RFQ in safe order. */
  async orchestrateProductSourcing(
    businessId: string,
    actorUserId: string,
    input: { opportunityId: string },
    idempotencyKey?: string,
  ) {
    const scopedBusinessId =
      this.cls.get<string>(CLS_KEY_BUSINESS_ID) ?? businessId;
    await this.agentPolicy.assertEnabled(scopedBusinessId, 'commerce');
    const opportunityId = input.opportunityId.trim();
    if (!opportunityId || opportunityId.length > 191) {
      throw new AppException(
        'COMMERCE_PRODUCT_SOURCING_INPUT_INVALID',
        'Enter a valid canonical Product Radar opportunity ID.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const registry = await this.agentTools.registry(scopedBusinessId);
    if (registry.autonomyLevel < 1) {
      throw new AppException(
        'COMMERCE_AGENT_DISABLED',
        'Commerce autonomy is disabled. Set it to Observe or higher in Agents & Tools before running a sourcing review.',
        HttpStatus.FORBIDDEN,
      );
    }
    const orderedTools = [
      'get_product_opportunity',
      'get_validation_case',
      'compare_quotes',
    ] as const;
    const definitions = new Map(
      COMMERCE_AGENT_TOOLS.map((tool) => [tool.key, tool]),
    );
    if (
      orderedTools.some((key) => {
        const tool = definitions.get(key);
        return !tool || !tool.executable || tool.riskClass !== 'READ_ONLY';
      })
    ) {
      throw new AppException(
        'COMMERCE_PRODUCT_SOURCING_UNAVAILABLE',
        'The registered read-only product sourcing workers are not available.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const correlationId = randomUUID();
    const limitations = [
      'This workflow reads one tenant-owned Product Radar opportunity, its canonical validation evidence and only an RFQ linked to that opportunity. It does not create or award an RFQ, contact a supplier, create a product, change stock or make a purchase commitment.',
      'Product Radar fields may be manual research and are not independently provider-verified. Validation reports recorded evidence only; it is not a pass/fail or launch recommendation.',
      'Quote comparison reflects the saved RFQ and quote records at review time. It does not verify supplier capacity, current terms, compliance or fulfillment.',
    ];
    const initial: CommerceProductSourcingOutput = {
      goal: 'product_sourcing_readiness',
      state: 'ready',
      opportunityId,
      rfqId: null,
      correlationId,
      summary: 'The product sourcing review is starting.',
      steps: [],
      limitations,
    };
    const runData: Prisma.SpecialistAgentRunUncheckedCreateInput = {
      businessId: scopedBusinessId,
      agentKey: AGENT_KEY,
      agentVersion: AGENT_VERSION,
      moduleId: '29',
      triggerType: 'manual',
      status: 'running',
      initiatedByUserId: actorUserId,
      inputRefs: [
        {
          source: 'ProductOpportunity',
          scope: 'current_business',
          resourceId: opportunityId,
        },
      ],
      output: {
        productSourcingOrchestration:
          initial as unknown as Prisma.InputJsonObject,
      },
      policyResult: {
        autonomyLevel: registry.autonomyLevel,
        riskTier: 'low',
        readOnly: true,
        allowedTools: [...orderedTools],
        maxToolCalls: orderedTools.length,
        requiresOpportunityBeforeValidation: true,
        requiresLinkedRfqBeforeQuoteComparison: true,
        performsCommerceWrites: false,
        correlationId,
      },
    };
    const reservation = await createOrReuseSpecialistAgentRun(
      (data) =>
        this.tenantPrisma.client.$transaction(async (tx) => {
          const run = await tx.specialistAgentRun.create({ data });
          await recordSpecialistAgentRunCreatedEvent(tx, run);
          await recordSpecialistAgentRunStartedEvent(tx, run);
          return run;
        }),
      (keyBusinessId, agentKey, idempotencyKeyHash) =>
        this.tenantPrisma.client.specialistAgentRun.findFirst({
          where: { businessId: keyBusinessId, agentKey, idempotencyKeyHash },
        }),
      runData,
      idempotencyKey,
      { goal: 'product_sourcing_readiness', opportunityId },
      (configBusinessId, agentKey) =>
        ensureSpecialistAgentConfigVersion(
          this.tenantPrisma.unscoped,
          configBusinessId,
          agentKey,
        ),
    );
    if (reservation.reused) {
      return this.tenantPrisma.client.specialistAgentRun.findFirstOrThrow({
        where: {
          id: reservation.run.id,
          businessId: scopedBusinessId,
          agentKey: AGENT_KEY,
        },
        include: SPECIALIST_AGENT_RUN_DETAILS_INCLUDE,
      });
    }

    const steps: CommerceProductSourcingStep[] = [];
    let rfqId: string | null = null;
    const output = (
      state: CommerceProductSourcingOutput['state'],
      summary: string,
    ): Prisma.InputJsonObject => ({
      productSourcingOrchestration: {
        goal: 'product_sourcing_readiness',
        state,
        opportunityId,
        rfqId,
        correlationId,
        summary,
        steps: steps as unknown as Prisma.InputJsonArray,
        limitations: [...limitations],
      },
    });
    const persist = (
      status: SpecialistAgentTerminalStatus,
      state: CommerceProductSourcingOutput['state'],
      summary: string,
    ) =>
      this.tenantPrisma.client.$transaction(async (tx) => {
        const finishedAt = new Date();
        const updated = await tx.specialistAgentRun.update({
          where: { id: reservation.run.id },
          data: {
            status,
            output: output(state, summary),
            finishedAt,
          },
        });
        await recordSpecialistAgentRunTerminalEvent(
          tx,
          reservation.run,
          status,
          finishedAt,
        );
        return updated;
      });
    const returnRun = () =>
      this.tenantPrisma.client.specialistAgentRun.findFirstOrThrow({
        where: {
          id: reservation.run.id,
          businessId: scopedBusinessId,
          agentKey: AGENT_KEY,
        },
        include: SPECIALIST_AGENT_RUN_DETAILS_INCLUDE,
      });
    const recordStep = (
      worker: CommerceProductSourcingStep['worker'],
      toolKey: CommerceProductSourcingStep['toolKey'],
      toolRun: { id: string; outcome: string; resultSummary: string | null },
      screen: string,
    ) => {
      const succeeded = toolRun.outcome === 'succeeded';
      const step: CommerceProductSourcingStep = {
        worker,
        toolKey,
        status: succeeded ? 'completed' : 'failed',
        toolRunId: toolRun.id,
        summary:
          toolRun.resultSummary ??
          'The registered read worker returned no summary.',
        screen,
      };
      steps.push(step);
      return step;
    };

    await this.tenantPrisma.client.auditLog.create({
      data: {
        businessId: scopedBusinessId,
        actorUserId,
        action: 'commerce.product_sourcing_orchestration_started',
        entity: 'SpecialistAgentRun',
        entityId: reservation.run.id,
        after: {
          opportunityId,
          correlationId,
          allowedTools: [...orderedTools],
        },
      },
    });

    try {
      const opportunityRead = await this.agentTools.run(
        scopedBusinessId,
        actorUserId,
        'get_product_opportunity',
        { opportunityId },
        undefined,
        'agent',
        correlationId,
      );
      const opportunityStep = recordStep(
        'product_discovery',
        'get_product_opportunity',
        opportunityRead.run,
        '/autonomous-commerce/product-radar',
      );
      if (opportunityRead.run.outcome !== 'succeeded') {
        const summary =
          'Product Radar could not review this opportunity. Validation and sourcing were not started.';
        await persist('failed', 'failed', summary);
        await this.tenantPrisma.client.auditLog.create({
          data: {
            businessId: scopedBusinessId,
            actorUserId,
            action: 'commerce.product_sourcing_orchestration_failed',
            entity: 'SpecialistAgentRun',
            entityId: reservation.run.id,
            after: {
              opportunityId,
              state: 'failed',
              reason: 'product_discovery_worker_failed',
              correlationId,
            },
          },
        });
        return returnRun();
      }
      if (!opportunityRead.result) {
        opportunityStep.status = 'blocked';
        opportunityStep.summary =
          'The opportunity was not found in this business. Validation and sourcing were not started.';
        await persist('completed', 'blocked', opportunityStep.summary);
        await this.tenantPrisma.client.auditLog.create({
          data: {
            businessId: scopedBusinessId,
            actorUserId,
            action: 'commerce.product_sourcing_orchestration_blocked',
            entity: 'SpecialistAgentRun',
            entityId: reservation.run.id,
            after: {
              opportunityId,
              state: 'blocked',
              reason: 'opportunity_not_found_in_business',
              correlationId,
            },
          },
        });
        return returnRun();
      }

      const validationRead = await this.agentTools.run(
        scopedBusinessId,
        actorUserId,
        'get_validation_case',
        { opportunityId },
        undefined,
        'agent',
        correlationId,
      );
      recordStep(
        'product_validation',
        'get_validation_case',
        validationRead.run,
        '/autonomous-commerce/product-validation',
      );
      if (
        validationRead.run.outcome !== 'succeeded' ||
        !validationRead.result
      ) {
        const summary =
          'Product validation evidence could not be reviewed. Sourcing comparison was not started.';
        await persist('partially_succeeded', 'failed', summary);
        await this.tenantPrisma.client.auditLog.create({
          data: {
            businessId: scopedBusinessId,
            actorUserId,
            action: 'commerce.product_sourcing_orchestration_failed',
            entity: 'SpecialistAgentRun',
            entityId: reservation.run.id,
            after: {
              opportunityId,
              state: 'failed',
              reason: 'product_validation_worker_failed',
              correlationId,
              completedChildToolRunIds: steps.flatMap((step) =>
                step.toolRunId ? [step.toolRunId] : [],
              ),
            },
          },
        });
        return returnRun();
      }

      const linkedRfq = await this.tenantPrisma.client.commerceRfq.findFirst({
        where: {
          businessId: scopedBusinessId,
          sourceOpportunityId: opportunityId,
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: { id: true },
      });
      if (!linkedRfq) {
        const summary =
          'The opportunity and validation evidence were reviewed, but no RFQ is linked to this opportunity yet. Create or link one in Commerce RFQs before comparing supplier quotes.';
        steps.push({
          worker: 'sourcing',
          toolKey: 'compare_quotes',
          status: 'blocked',
          toolRunId: null,
          summary,
          screen: '/autonomous-commerce/rfqs',
        });
        await persist('completed', 'needs_sourcing', summary);
        await this.tenantPrisma.client.auditLog.create({
          data: {
            businessId: scopedBusinessId,
            actorUserId,
            action: 'commerce.product_sourcing_orchestration_completed',
            entity: 'SpecialistAgentRun',
            entityId: reservation.run.id,
            after: {
              opportunityId,
              state: 'needs_sourcing',
              correlationId,
              completedChildToolRunIds: steps.flatMap((step) =>
                step.toolRunId ? [step.toolRunId] : [],
              ),
            },
          },
        });
        return returnRun();
      }

      rfqId = linkedRfq.id;
      const quoteRead = await this.agentTools.run(
        scopedBusinessId,
        actorUserId,
        'compare_quotes',
        { rfqId },
        undefined,
        'agent',
        correlationId,
      );
      recordStep(
        'sourcing',
        'compare_quotes',
        quoteRead.run,
        '/autonomous-commerce/rfqs',
      );
      const complete = quoteRead.run.outcome === 'succeeded';
      const summary = complete
        ? 'Product discovery, validation evidence and linked RFQ quote records were reviewed. Open the canonical Commerce RFQ to inspect its full comparison; no quote was awarded.'
        : 'Product discovery and validation evidence were reviewed, but the linked RFQ quote comparison failed. No sourcing decision was made.';
      await persist(
        complete ? 'completed' : 'partially_succeeded',
        complete ? 'ready' : 'failed',
        summary,
      );
      await this.tenantPrisma.client.auditLog.create({
        data: {
          businessId: scopedBusinessId,
          actorUserId,
          action: 'commerce.product_sourcing_orchestration_completed',
          entity: 'SpecialistAgentRun',
          entityId: reservation.run.id,
          after: {
            opportunityId,
            rfqId,
            state: complete ? 'ready' : 'failed',
            correlationId,
            childToolRunIds: steps.flatMap((step) =>
              step.toolRunId ? [step.toolRunId] : [],
            ),
          },
        },
      });
      return returnRun();
    } catch (error) {
      const message =
        error instanceof AppException || error instanceof Error
          ? error.message
          : 'The product sourcing review failed.';
      await persist('failed', 'failed', message);
      await this.tenantPrisma.client.auditLog.create({
        data: {
          businessId: scopedBusinessId,
          actorUserId,
          action: 'commerce.product_sourcing_orchestration_failed',
          entity: 'SpecialistAgentRun',
          entityId: reservation.run.id,
          after: {
            opportunityId,
            rfqId,
            correlationId,
            errorCode: responseErrorCode(error),
            completedChildToolRunIds: steps.flatMap((step) =>
              step.toolRunId ? [step.toolRunId] : [],
            ),
          },
        },
      });
      return returnRun();
    }
  }

  async run(
    businessId: string,
    actorUserId: string | null,
    idempotencyKey?: string,
    options: SpecialistAgentRunOptions = {},
  ): Promise<
    Prisma.SpecialistAgentRunGetPayload<{
      include: { recommendations: { include: { evidence: true } } };
    }>
  > {
    const scopedBusinessId =
      this.cls.get<string>(CLS_KEY_BUSINESS_ID) ?? businessId;
    await this.agentPolicy.assertEnabled(scopedBusinessId, 'commerce');
    const disabledSourceModules = new Set(
      await this.agentPolicy.disabledModulesForBusiness(scopedBusinessId),
    );
    const business = await this.tenantPrisma.client.business.findFirst({
      where: { id: scopedBusinessId },
      select: { policies: true },
    });
    if (resolvePolicies(business).num('commerce.autonomyLevel') === 0) {
      throw new AppException(
        'COMMERCE_AGENT_DISABLED',
        'Commerce autonomy is disabled. Set it to Observe or higher in Agents & Tools before running a review.',
        HttpStatus.FORBIDDEN,
      );
    }
    const startedAt = new Date();
    const runData: Prisma.SpecialistAgentRunUncheckedCreateInput = {
      businessId: scopedBusinessId,
      agentKey: AGENT_KEY,
      agentVersion: AGENT_VERSION,
      moduleId: '29',
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
          source: 'canonical_commerce_status_counts',
          scope: 'current_business',
          includesCustomerIdentifiers: false,
          includesProviderMetrics: false,
        },
        ...(!disabledSourceModules.has('inventory')
          ? [
              {
                source: 'canonical_sourcing_quote_comparison',
                scope: 'current_business',
                includesSupplierIdentifiers: false,
                includesProviderMetrics: false,
              },
              {
                source: 'canonical_supplier_claim_summary',
                scope: 'current_business',
                includesClaimText: false,
                includesSupplierIdentifiers: false,
              },
            ]
          : []),
        ...(!['deliveries', 'orders'].some((module) =>
          disabledSourceModules.has(module),
        )
          ? [
              {
                source: 'canonical_delivery_exception_summary',
                scope: 'current_business',
                includesCustomerIdentifiers: false,
                includesAddresses: false,
                includesFreeTextFailureNotes: false,
              },
            ]
          : []),
        ...(!['orders', 'inventory', 'products'].some((module) =>
          disabledSourceModules.has(module),
        )
          ? [
              {
                source: 'canonical_fulfillment_router_queue',
                scope: 'current_business',
                includesCustomerIdentifiers: false,
                includesOrderIdentifiers: false,
                includesAddresses: false,
                includesPrices: false,
              },
            ]
          : []),
        ...(!['products', 'inventory'].some((module) =>
          disabledSourceModules.has(module),
        )
          ? [
              {
                source: 'canonical_production_assembly_counts',
                scope: 'current_business',
                includesProductNames: false,
                includesDemandSourceText: false,
                includesCosts: false,
              },
              {
                source: 'canonical_product_inventory_snapshot',
                scope: 'current_business',
                fields: ['Product.stockQty', 'Product.lowStockThreshold'],
                linkedBy: 'CommerceChannelListing.status=synced',
                excludesProviderStockClaims: true,
              },
            ]
          : []),
      ],
      policyResult: {
        autonomyLevel: 'L0',
        riskTier: 'low',
        readOnly: true,
        performsCommerceWrites: false,
        publishesListings: false,
        sendsCustomerMessages: false,
        changesInventoryOrOrders: false,
      },
    };
    const reservation = await createOrReuseSpecialistAgentRun(
      (data) =>
        this.tenantPrisma.client.$transaction(async (tx) => {
          const run = await tx.specialistAgentRun.create({ data });
          await recordSpecialistAgentRunCreatedEvent(tx, run);
          await recordSpecialistAgentRunStartedEvent(tx, run);
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
          this.tenantPrisma.unscoped,
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
        include: SPECIALIST_AGENT_RUN_DETAILS_INCLUDE,
      });
    }

    try {
      const snapshot = await this.snapshot(scopedBusinessId);
      const observedAt = new Date();
      const reviewSteps: CommerceSpecialistReviewStep[] = [];
      const captureReviewStep = async <T>(
        key: string,
        label: string,
        operation: () => Promise<T>,
        requiredModules: string[] = [],
      ): Promise<T | null> => {
        const unavailableModules = requiredModules.filter((module) =>
          disabledSourceModules.has(module),
        );
        if (unavailableModules.length > 0) {
          reviewSteps.push({
            key,
            label,
            status: 'skipped',
            durationMs: 0,
            errorCode: null,
            unavailableReason: `Not read because ${unavailableModules.join(', ')} ${unavailableModules.length === 1 ? 'module is' : 'modules are'} disabled in Settings → Modules.`,
          });
          return null;
        }
        const stepStartedAt = Date.now();
        try {
          const value = await operation();
          reviewSteps.push({
            key,
            label,
            status: 'completed',
            durationMs: Date.now() - stepStartedAt,
            errorCode: null,
            unavailableReason: null,
          });
          return value;
        } catch (error) {
          reviewSteps.push({
            key,
            label,
            status: 'failed',
            durationMs: Date.now() - stepStartedAt,
            errorCode: responseErrorCode(error),
            unavailableReason: 'The source query failed; its result was not inferred.',
          });
          return null;
        }
      };
      const sourcingReview = await captureReviewStep(
        'sourcing',
        'Recorded supplier quotes',
        () => this.reviewRecordedQuotes(scopedBusinessId, observedAt),
        ['inventory'],
      );
      const validationScorecards = await captureReviewStep(
        'validation',
        'Product validation evidence',
        () => this.productValidation.specialistScorecards(scopedBusinessId),
      );
      const reconciliationReview = await captureReviewStep(
        'reconciliation',
        'Saved listing reconciliation',
        () => this.reviewSavedReconciliation(scopedBusinessId),
        ['integrations'],
      );
      const experimentReview = await captureReviewStep(
        'experiments',
        'Experiment outcomes',
        () => this.commerceExperiments.specialistReview(scopedBusinessId),
        ['products', 'orders'],
      );
      const supplierClaimReview = await captureReviewStep(
        'supplier_claims',
        'Supplier claim records',
        () => this.supplierClaims.specialistReview(scopedBusinessId),
        ['inventory'],
      );
      const deliveryExceptionReview = await captureReviewStep(
        'delivery_exceptions',
        'Delivery exception records',
        () => this.deliveryInsights.specialistExceptionReview(scopedBusinessId),
        ['deliveries', 'orders'],
      );
      const fulfillmentReview = await captureReviewStep(
        'fulfillment',
        'Fulfillment routing queue',
        () => this.fulfillmentRouter.specialistReview(scopedBusinessId),
        ['orders', 'inventory', 'products'],
      );
      const productionReview = await captureReviewStep(
        'production',
        'Production and assembly records',
        () => this.production.agentReview(scopedBusinessId, observedAt),
        ['products', 'inventory'],
      );
      const inventoryAvailabilityReview = await captureReviewStep(
        'inventory_availability',
        'Internal stock for synced channel products',
        () =>
          this.reviewInternalInventoryAvailability(
            scopedBusinessId,
            observedAt,
          ),
        ['products', 'inventory'],
      );
      const candidate = this.nextReview(snapshot, productionReview);
      const unavailableReviewSteps = reviewSteps.filter(
        (step) => step.status !== 'completed',
      );
      const partialCoverageNote = unavailableReviewSteps.length
        ? ` ${unavailableReviewSteps.length} supporting review source(s) were unavailable or disabled; see the per-source status. No result is inferred for those sources.`
        : '';
      const summary = candidate
        ? `${candidate.summary} This is a review cue based on recorded workflow states, not a finding that the item is incorrect or blocked.${partialCoverageNote}`
        : unavailableReviewSteps.length
          ? `The canonical Commerce status snapshot was reviewed, but supporting review sources were unavailable. No conclusion is made about queues that could not be read.${partialCoverageNote}`
          : 'No records in the reviewed Commerce queues currently match the defined review checks. This does not establish that all commerce operations are healthy or complete.';
      const assumptions = [
        'Counts come from current canonical Commerce records in this business and are grouped by their stored status; no second copy of products, orders, suppliers or inventory is created.',
        'Review ordering is a fixed rule order (open risk cases, failed listings, requested validations, open RFQs, running experiments, then late production work orders), not a probability, impact or priority score.',
        'A Commerce risk case is a review record; this agent does not infer that it blocks an order or clears a hard policy hold.',
        'Product Validation scorecards report recorded evidence availability only; no dimension score, probability, launch recommendation or pass/fail result is calculated.',
        'Experiment results reuse the canonical Experiment Lab calculation and stored frozen results. A before/after difference is observational and is not proof that the recorded change caused it.',
        'Supplier claims summarize operator-entered loss and settlement records only; neither the underlying loss nor a recorded settlement is independently verified.',
        'Delivery exception status reuses the canonical Deliveries rule: only a latest approved same-business return resolves a failed delivery. No cause, carrier result or refund value is inferred.',
        'Fulfillment review reuses the current Fulfillment Router queue and candidate rules; a candidate without a destination country has unknown market coverage and is not an execution or customer promise.',
        'Production counts reuse canonical Production & Assembly records and omit names and costs; they do not diagnose delay causes, machine capacity or labor availability.',
      ];
      const missingData = [
        'Provider sales, traffic, conversion, listing reach, external inventory and fulfillment confirmation are not included unless their canonical connected records are present; no external status is inferred.',
        'The internal inventory review uses the business-level Product stock snapshot only for active products linked to a CommerceChannelListing saved as synced. It is not a provider inventory confirmation, branch allocation, reservation or customer promise.',
        'Profitability, demand, supplier quality and delivery performance metrics are not calculated by this aggregate review. Recorded failed-delivery follow-up is summarized separately.',
        'Fulfillment external-node inventory, live node capacity and carrier confirmation are not available from this review. No route is assigned and no stock is reserved.',
        'Product-level compliance and return-risk evidence remain unavailable in Product Radar; validation candidates retain the canonical launch gate.',
        'Listing reconciliation reports only saved checks and open discrepancy records. The agent does not contact providers or infer that the absence of saved checks means listings are healthy.',
        'Storefront visitor allocation, conversion, seasonality controls and statistical significance are not tracked for Experiment Lab; merchant adoption remains a separate human decision.',
        'Supplier claim settlements may include credits or replacements and do not prove cash receipt or delivery. Supplier communication and claim outcomes are not independently confirmed.',
        'The review does not publish listings, create or award RFQs, change inventory or orders, clear risk cases, run experiments or send customer messages.',
        'Production work orders and output are counted from recorded records only; supplier delivery and machine/labor capacity are not measured.',
        ...unavailableReviewSteps.map(
          (step) =>
            `${step.label} is unavailable for this run: ${step.unavailableReason ?? `error code ${step.errorCode ?? 'unknown'}`}`,
        ),
      ];
      const includedSourceModules = [
        'autonomous-commerce',
        ...[
          'integrations',
          'products',
          'orders',
          'deliveries',
          'inventory',
        ].filter((moduleKey) => !disabledSourceModules.has(moduleKey)),
      ];
      await this.toolGateway.assertToolSourcesEnabled(
        scopedBusinessId,
        AGENT_KEY,
        [],
        { actorUserId, runId: run.id },
      );
      const aiSummary =
        options.includeAiSummary === false
          ? null
          : await this.summarize(
              scopedBusinessId,
              snapshot,
              run.id,
              includedSourceModules,
            );
      await this.toolGateway.assertToolSourcesEnabled(
        scopedBusinessId,
        AGENT_KEY,
        [],
        { actorUserId, runId: run.id },
      );
      await this.agentPolicy.assertSourceModulesEnabledForBusiness(
        scopedBusinessId,
        includedSourceModules,
      );
      const finishedAt = new Date();
      const output = {
        source: 'canonical_commerce_status_counts',
        moduleSelectionVersion: 1,
        moduleSources: {
          'autonomous-commerce': 'included',
          integrations: disabledSourceModules.has('integrations')
            ? 'disabled'
            : 'included',
          products: disabledSourceModules.has('products')
            ? 'disabled'
            : 'included',
          orders: disabledSourceModules.has('orders') ? 'disabled' : 'included',
          deliveries: disabledSourceModules.has('deliveries')
            ? 'disabled'
            : 'included',
          inventory: disabledSourceModules.has('inventory')
            ? 'disabled'
            : 'included',
        },
        snapshot,
        sourcingReview,
        validationScorecards,
        reconciliationReview,
        reviewSteps,
        experimentReview: experimentReview as unknown as Prisma.InputJsonObject,
        supplierClaimReview:
          supplierClaimReview as unknown as Prisma.InputJsonObject | null,
        deliveryExceptionReview:
          deliveryExceptionReview as unknown as Prisma.InputJsonObject | null,
        fulfillmentReview:
          fulfillmentReview as unknown as Prisma.InputJsonObject | null,
        productionReview: productionReview as unknown as Prisma.InputJsonObject,
        inventoryAvailabilityReview:
          inventoryAvailabilityReview as unknown as Prisma.InputJsonObject | null,
        summary,
        aiSummary,
        unavailableReviewSteps: unavailableReviewSteps.map((step) => ({
          key: step.key,
          label: step.label,
          status: step.status,
          errorCode: step.errorCode,
          unavailableReason: step.unavailableReason,
        })),
        coverage: unavailableReviewSteps.length
          ? 'canonical_status_counts_and_partial_saved_operational_evidence'
          : 'canonical_status_counts_and_saved_operational_evidence',
        observedAt: observedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      } satisfies Prisma.InputJsonObject;
      const evidence = {
        ...snapshot,
        selectedQueue: candidate?.resourceType ?? null,
      } satisfies Prisma.InputJsonObject;

      return await this.tenantPrisma.client.$transaction(async (tx) => {
        await this.agentPolicy.assertAgentEnabledInTransaction(
          tx,
          scopedBusinessId,
          'commerce',
        );
        await this.agentPolicy.assertSourceModulesEnabledInTransaction(
          tx,
          scopedBusinessId,
          includedSourceModules,
        );
        await this.toolGateway.assertToolSourcesEnabledInTransaction(
          tx,
          scopedBusinessId,
          AGENT_KEY,
          [],
          { actorUserId, runId: run.id },
        );
        const runStatus = unavailableReviewSteps.length
          ? 'partially_succeeded'
          : 'completed';
        const completed = await tx.specialistAgentRun.update({
          where: { id: run.id },
          data: {
            status: runStatus,
            output,
            finishedAt,
            recommendations: {
              create: [
                {
                  business: { connect: { id: scopedBusinessId } },
                  agentKey: AGENT_KEY,
                  title: candidate?.title ?? 'Commerce queues reviewed',
                  summary,
                  classification: candidate ? 'recommendation' : 'calculated',
                  details: evidence,
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
                        business: { connect: { id: scopedBusinessId } },
                        run: { connect: { id: run.id } },
                        sourceType: 'canonical_record_counts',
                        resourceType:
                          candidate?.resourceType ?? 'commerce_queues',
                        resourceId: scopedBusinessId,
                        fieldRefs: candidate?.fieldRefs ?? [
                          'ProductOpportunity.status',
                          'CommerceRfq.status',
                          'CommerceRiskCase.status',
                          'CommerceChannelListing.status',
                          'CommerceExperiment.status',
                        ],
                        observedValues: evidence,
                        observedAt,
                        fetchedAt: finishedAt,
                        freshness: 'fresh',
                        calculation:
                          'Prisma counts grouped by stored status in the current business. The suggested queue uses the documented fixed review order and does not infer a risk score, external provider outcome, cause or business impact.',
                      },
                      {
                        business: { connect: { id: scopedBusinessId } },
                        run: { connect: { id: run.id } },
                        sourceType: sourcingReview
                          ? 'database_records'
                          : 'unavailable',
                        resourceType: 'commerce_rfq_quote_comparison',
                        resourceId: scopedBusinessId,
                        fieldRefs: [
                          'CommerceRfq.status',
                          'CommerceRfq.currency',
                          'CommerceRfqItem.qty',
                          'CommerceSupplierQuote.status',
                          'CommerceSupplierQuote.currency',
                          'CommerceSupplierQuote.freight',
                          'CommerceSupplierQuote.duties',
                          'CommerceSupplierQuote.leadTimeDays',
                          'CommerceSupplierQuote.paymentTerms',
                          'CommerceSupplierQuoteItem.quotedQty',
                          'CommerceSupplierQuoteItem.minimumQty',
                          'CommerceSupplierQuoteItem.unitPrice',
                        ],
                        observedValues: (sourcingReview ?? {
                          state: 'unavailable',
                        }) as unknown as Prisma.InputJsonObject,
                        observedAt,
                        fetchedAt: finishedAt,
                        freshness: sourcingReview ? 'fresh' : 'unavailable',
                        calculation:
                          'For each of the 50 most recently updated open RFQs, inspect up to five latest submitted/shortlisted quotes. A quote is comparable only if its currency matches the RFQ, it is unexpired, every requested line appears exactly once, quoted quantities equal requested quantities, and supplier minimum quantities do not exceed requested quantities. Landed total = sum(unit price × quoted quantity) + freight + duties using exact decimal arithmetic. The lowest comparable total is shown only when at least two comparable quotes exist; it is not an overall supplier recommendation or an award decision.',
                      },
                      {
                        business: { connect: { id: scopedBusinessId } },
                        run: { connect: { id: run.id } },
                        sourceType: validationScorecards
                          ? 'database_records'
                          : 'unavailable',
                        resourceType: 'commerce_validation_scorecards',
                        resourceId: scopedBusinessId,
                        fieldRefs: [
                          'ProductOpportunity.demandSignal',
                          'ProductOpportunity.trendVelocity',
                          'ProductOpportunity.competitionScore',
                          'ProductOpportunity.observedPrice',
                          'ProductOpportunity.estimatedLandedCost',
                          'ProductOpportunity.marginEstimate',
                          'ProductOpportunity.shippingEstimate',
                          'ProductOpportunity.supplierCount',
                          'ProductOpportunity.storeFitScore',
                        ],
                        observedValues: (validationScorecards ?? {
                          state: 'unavailable',
                        }) as unknown as Prisma.InputJsonObject,
                        observedAt,
                        fetchedAt: finishedAt,
                        freshness: validationScorecards ? 'fresh' : 'unavailable',
                        calculation:
                          'Review up to 20 current validation_requested ProductOpportunity records, newest first. Group tracked fields by evidence dimension and classify field availability only. No dimension score, overall score, probability, recommendation, or pass/fail result is calculated; source verification and unsupported compliance/return-risk inputs remain disclosed.',
                      },
                      {
                        business: { connect: { id: scopedBusinessId } },
                        run: { connect: { id: run.id } },
                        sourceType: reconciliationReview
                          ? 'database_records'
                          : 'unavailable',
                        resourceType: 'commerce_listing_reconciliation',
                        resourceId: scopedBusinessId,
                        fieldRefs: [
                          'CommerceReconciliationRun.provider',
                          'CommerceReconciliationRun.status',
                          'CommerceReconciliationRun.listingsChecked',
                          'CommerceReconciliationRun.discrepancies',
                          'CommerceReconciliationItem.provider',
                          'CommerceReconciliationItem.kind',
                          'CommerceReconciliationItem.status',
                        ],
                        observedValues: (reconciliationReview ?? {
                          state: 'unavailable',
                        }) as unknown as Prisma.InputJsonObject,
                        observedAt,
                        fetchedAt: finishedAt,
                        freshness: reconciliationReview ? 'fresh' : 'unavailable',
                        calculation:
                          'Read the 20 latest saved CommerceReconciliationRun records and group all currently open CommerceReconciliationItem records by provider and stored discrepancy kind. No provider is queried and no external state is inferred.',
                      },
                      {
                        business: { connect: { id: scopedBusinessId } },
                        run: { connect: { id: run.id } },
                        sourceType: experimentReview
                          ? 'database_records'
                          : 'unavailable',
                        resourceType: 'commerce_experiment_results',
                        resourceId: scopedBusinessId,
                        fieldRefs: [
                          'CommerceExperiment.status',
                          'CommerceExperiment.primaryMetric',
                          'CommerceExperiment.frozenResults',
                          'OrderItem.productId',
                          'OrderItem.qty',
                          'OrderItem.price',
                          'OrderItem.cost',
                          'ReturnItem.qty',
                        ],
                        observedValues: (experimentReview ?? {
                          state: 'unavailable',
                        }) as unknown as Prisma.InputJsonObject,
                        observedAt,
                        fetchedAt: finishedAt,
                        freshness: experimentReview ? 'fresh' : 'unavailable',
                        calculation:
                          'Reuse CommerceExperimentsService.specialistReview: running experiment results are computed by the canonical equal-length order/return windows; stopped and decided experiments use their frozen canonical result snapshot. This is observational, not causal or statistically significant.',
                      },
                      {
                        business: { connect: { id: scopedBusinessId } },
                        run: { connect: { id: run.id } },
                        sourceType: supplierClaimReview
                          ? 'database_records'
                          : 'unavailable',
                        resourceType: 'commerce_supplier_claims',
                        resourceId: scopedBusinessId,
                        fieldRefs: [
                          'CommerceSupplierClaim.status',
                          'CommerceSupplierClaim.currency',
                          'CommerceSupplierClaimItem.productLossAmount',
                          'CommerceSupplierClaimItem.freightLossAmount',
                          'CommerceSupplierClaimItem.otherLossAmount',
                          'CommerceSupplierClaimSettlement.amount',
                          'CommerceSupplierClaimEvidence.id',
                          'CommerceSupplierClaimCommunication.id',
                        ],
                        observedValues: (supplierClaimReview ?? {
                          state: 'unavailable',
                        }) as unknown as Prisma.InputJsonObject,
                        observedAt,
                        fetchedAt: finishedAt,
                        freshness: supplierClaimReview ? 'fresh' : 'unavailable',
                        calculation:
                          'Group current canonical supplier claims by their stored status and itemize at most the 20 most recently updated records. Recorded loss is the sum of operator-entered product, freight and other loss amounts. Recorded settlement is the sum of operator-entered settlement amounts; neither is independently verified and settlement can include non-cash credits or replacements. Sensitive claim text and supplier identifiers are omitted.',
                      },
                      {
                        business: { connect: { id: scopedBusinessId } },
                        run: { connect: { id: run.id } },
                        sourceType: deliveryExceptionReview
                          ? 'database_records'
                          : 'unavailable',
                        resourceType: 'delivery_exception_follow_up',
                        resourceId: scopedBusinessId,
                        fieldRefs: [
                          'Delivery.status',
                          'Delivery.updatedAt',
                          'Return.status',
                          'Return.updatedAt',
                        ],
                        observedValues: (deliveryExceptionReview ?? {
                          state: 'unavailable',
                        }) as unknown as Prisma.InputJsonObject,
                        observedAt,
                        fetchedAt: finishedAt,
                        freshness: deliveryExceptionReview ? 'fresh' : 'unavailable',
                        calculation:
                          'Reuse DeliveryInsightsService.specialistExceptionReview: count tenant-scoped Delivery rows with stored status failed, and review at most the 20 newest. A failed delivery is resolved only when the latest same-business Return for its order is approved, matching Deliveries → Exceptions. Customer data, addresses, free-text failure notes and amounts are omitted; no cause or external carrier result is inferred.',
                      },
                      {
                        business: { connect: { id: scopedBusinessId } },
                        run: { connect: { id: run.id } },
                        sourceType: fulfillmentReview
                          ? 'database_records'
                          : 'unavailable',
                        resourceType: 'commerce_fulfillment_review',
                        resourceId: scopedBusinessId,
                        fieldRefs: [
                          'Order.orderType',
                          'Order.status',
                          'Order.isQuotation',
                          'OrderItem.product.kind',
                          'CommerceRoutingDecision.status',
                          'CommerceRoutingDecision.mode',
                          'CommerceFulfillmentMapping.role',
                        ],
                        observedValues: (fulfillmentReview ?? {
                          state: 'unavailable',
                        }) as unknown as Prisma.InputJsonObject,
                        observedAt,
                        fetchedAt: finishedAt,
                        freshness: fulfillmentReview ? 'fresh' : 'unavailable',
                        calculation:
                          'Reuse CommerceFulfillmentRouterService.specialistReview and the canonical router queue/rules. Count all eligible open shipping orders and review the 20 newest. Each row is categorized from its recorded active route or live candidate. The queue has no destination country, so market coverage remains unknown; no route, inventory reservation, customer promise or external confirmation is written or inferred.',
                      },
                      {
                        business: { connect: { id: scopedBusinessId } },
                        run: { connect: { id: run.id } },
                        sourceType: productionReview
                          ? 'database_records'
                          : 'unavailable',
                        resourceType: 'commerce_production_assembly',
                        resourceId: scopedBusinessId,
                        fieldRefs: [
                          'CommerceBom.status',
                          'CommerceWorkOrder.status',
                          'CommerceWorkOrder.qtyPlanned',
                          'CommerceWorkOrder.qtyGood',
                          'CommerceWorkOrder.qtyScrap',
                          'CommerceWorkOrder.dueDate',
                        ],
                        observedValues: (productionReview ?? {
                          state: 'unavailable',
                        }) as unknown as Prisma.InputJsonObject,
                        observedAt,
                        fetchedAt: finishedAt,
                        freshness: productionReview ? 'fresh' : 'unavailable',
                        calculation:
                          'Reuse CommerceProductionService.agentReview and tenant-scoped database aggregates. Late counts include planned/in-progress work orders with due dates before observation time; completed output units use recorded good and scrap quantities. No product names, demand-source text or costs are included, and no capacity or delay cause is inferred.',
                      },
                      {
                        business: { connect: { id: scopedBusinessId } },
                        run: { connect: { id: run.id } },
                        sourceType: inventoryAvailabilityReview
                          ? 'database_records'
                          : 'unavailable',
                        resourceType:
                          'commerce_internal_inventory_availability',
                        resourceId: scopedBusinessId,
                        fieldRefs: [
                          'Product.stockQty',
                          'Product.lowStockThreshold',
                          'Product.active',
                          'CommerceChannelListing.status',
                          'CommerceChannelListing.provider',
                        ],
                        observedValues: (inventoryAvailabilityReview ?? {
                          state: 'unavailable',
                        }) as unknown as Prisma.InputJsonObject,
                        observedAt,
                        fetchedAt: finishedAt,
                        freshness: inventoryAvailabilityReview
                          ? 'fresh'
                          : 'unavailable',
                        calculation:
                          'Read active Product rows linked to at least one saved CommerceChannelListing with status synced, ordered by stockQty, name and id, capped at 50. Compare Product.stockQty <= Product.lowStockThreshold only for returned rows. This is a Noxtill business-level snapshot; it does not establish provider stock, branch-level allocation, reservation or availability on the external storefront.',
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
          runStatus,
          finishedAt,
        );
        await tx.auditLog.create({
          data: {
            businessId: scopedBusinessId,
            actorUserId,
            action: 'commerce_agent.review_run',
            entity: 'SpecialistAgentRun',
            entityId: run.id,
            after: {
              agentKey: AGENT_KEY,
              agentVersion: AGENT_VERSION,
              status: completed.status,
              selectedQueue: candidate?.resourceType ?? null,
              reviewSteps,
              readOnly: true,
            },
          },
        });
        return completed;
      });
    } catch (error) {
      const finishedAt = new Date();
      await this.tenantPrisma.client.$transaction(async (tx) => {
        await tx.specialistAgentRun.update({
          where: { id: run.id },
          data: {
            status: 'failed',
            errorCode: 'COMMERCE_AGENT_REVIEW_FAILED',
            errorMessage: 'Canonical Commerce records could not be reviewed.',
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
            businessId: scopedBusinessId,
            actorUserId,
            action: 'commerce_agent.review_failed',
            entity: 'SpecialistAgentRun',
            entityId: run.id,
            after: { agentKey: AGENT_KEY, status: 'failed' },
          },
        });
      });
      if (error instanceof AppException) throw error;
      throw new AppException(
        'COMMERCE_AGENT_REVIEW_FAILED',
        'Canonical Commerce records could not be reviewed; no commerce action was taken.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async snapshot(businessId: string): Promise<CommerceSnapshot> {
    const [
      productOpportunities,
      rfqs,
      riskCases,
      channelListings,
      experiments,
    ] = await Promise.all([
      this.tenantPrisma.client.productOpportunity.groupBy({
        by: ['status'],
        where: { businessId },
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      this.tenantPrisma.client.commerceRfq.groupBy({
        by: ['status'],
        where: { businessId },
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      this.tenantPrisma.client.commerceRiskCase.groupBy({
        by: ['status'],
        where: { businessId },
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      this.tenantPrisma.client.commerceChannelListing.groupBy({
        by: ['status'],
        where: { businessId },
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      this.tenantPrisma.client.commerceExperiment.groupBy({
        by: ['status'],
        where: { businessId },
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
    ]);
    const counts = (rows: { status: string; _count: { _all: number } }[]) =>
      Object.fromEntries(rows.map((row) => [row.status, row._count._all]));
    return {
      productOpportunities: counts(productOpportunities),
      rfqs: counts(rfqs),
      riskCases: counts(riskCases),
      channelListings: counts(channelListings),
      experiments: counts(experiments),
    };
  }

  /**
   * Read the canonical Noxtill product stock snapshot for products with a saved synced-channel
   * listing. The listing status is not revalidated against a provider in this review.
   */
  private async reviewInternalInventoryAvailability(
    businessId: string,
    observedAt: Date,
  ): Promise<CommerceInventoryAvailabilityReview> {
    const maximumProductsReviewed = 50;
    const where = {
      businessId,
      active: true,
      commerceChannelListings: { some: { status: 'synced' as const } },
    };
    const [totalSyncedProducts, products] = await Promise.all([
      this.tenantPrisma.client.product.count({ where }),
      this.tenantPrisma.client.product.findMany({
        where,
        select: {
          id: true,
          stockQty: true,
          lowStockThreshold: true,
          commerceChannelListings: {
            where: { status: 'synced' },
            select: { provider: true },
          },
        },
        orderBy: [{ stockQty: 'asc' }, { name: 'asc' }, { id: 'asc' }],
        take: maximumProductsReviewed,
      }),
    ]);
    const reviewedProducts = products.map((product) => ({
      productId: product.id,
      stockQty: product.stockQty,
      lowStockThreshold: product.lowStockThreshold,
      thresholdState:
        product.stockQty <= product.lowStockThreshold
          ? ('at_or_below_recorded_threshold' as const)
          : ('above_recorded_threshold' as const),
      providers: [
        ...new Set(product.commerceChannelListings.map((row) => row.provider)),
      ].sort(),
    }));
    return {
      state:
        totalSyncedProducts > 0 ? 'available' : 'no_synced_channel_products',
      source:
        totalSyncedProducts > 0
          ? 'Product.stockQty + Product.lowStockThreshold'
          : null,
      totalSyncedProducts,
      maximumProductsReviewed,
      reviewedProductCount: reviewedProducts.length,
      hasMore: totalSyncedProducts > reviewedProducts.length,
      reviewedAtOrBelowThresholdCount: reviewedProducts.filter(
        (product) =>
          product.thresholdState === 'at_or_below_recorded_threshold',
      ).length,
      products: reviewedProducts,
      observedAt: observedAt.toISOString(),
      limitations: [
        'Stock and threshold are read from Noxtill Product records, not from the connected provider.',
        'Only active products with a saved CommerceChannelListing status of synced are included; provider state is not rechecked during this review.',
        'Product.stockQty is a business-level snapshot and does not represent branch allocation, reserved units or a customer availability promise.',
        ...(totalSyncedProducts > reviewedProducts.length
          ? [
              'The list is capped at 50 products, ordered by lowest recorded stock first; the threshold count applies only to the displayed rows.',
            ]
          : []),
      ],
    };
  }

  /**
   * Compare only current, operator-recorded quote facts from canonical open RFQs. This is a
   * sourcing review aid, not an award recommendation: supplier quality, capacity and compliance
   * evidence are not available in these quote rows.
   */
  private async reviewRecordedQuotes(
    businessId: string,
    observedAt: Date,
  ): Promise<SourcingComparisonReview> {
    const maxRfqsPerReview = 50;
    const maxQuotesPerRfq = 5;
    const rfqs = await this.tenantPrisma.client.commerceRfq.findMany({
      where: { businessId, status: CommerceRfqStatus.open },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: maxRfqsPerReview,
      select: {
        id: true,
        currency: true,
        items: { select: { id: true, qty: true, minimumQty: true } },
        quotes: {
          where: {
            status: {
              in: [
                CommerceSupplierQuoteStatus.submitted,
                CommerceSupplierQuoteStatus.shortlisted,
              ],
            },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: maxQuotesPerRfq,
          select: {
            id: true,
            currency: true,
            validUntil: true,
            paymentTerms: true,
            freight: true,
            duties: true,
            leadTimeDays: true,
            supplier: { select: { name: true } },
            items: {
              select: {
                rfqItemId: true,
                quotedQty: true,
                minimumQty: true,
                unitPrice: true,
                rfqItem: { select: { rfqId: true } },
              },
            },
          },
        },
      },
    });

    if (rfqs.length === 0) {
      return {
        state: 'no_open_rfqs',
        source: null,
        reviewedRfqCount: 0,
        maxRfqsPerReview,
        maxQuotesPerRfq,
        comparisons: [],
        limitations: [
          'No open canonical RFQ records were available for a supplier-quote comparison.',
          'This does not mean that the business has no sourcing needs or supplier activity outside Noxtill.',
        ],
      };
    }

    const comparisons = rfqs.map((rfq) => {
      const requestedById = new Map(rfq.items.map((item) => [item.id, item]));
      const exclusionReasons: Record<string, number> = {};
      const comparable: ComparableSupplierQuote[] = [];
      const exclude = (reason: string) => {
        exclusionReasons[reason] = (exclusionReasons[reason] ?? 0) + 1;
      };

      for (const quote of rfq.quotes) {
        if (quote.validUntil && quote.validUntil <= observedAt) {
          exclude('expired');
          continue;
        }
        if (
          quote.currency.trim().toUpperCase() !==
          rfq.currency.trim().toUpperCase()
        ) {
          exclude('currency_mismatch');
          continue;
        }
        const seen = new Set<string>();
        let invalidLines = false;
        for (const line of quote.items) {
          const requested = requestedById.get(line.rfqItemId);
          if (
            !requested ||
            line.rfqItem.rfqId !== rfq.id ||
            seen.has(line.rfqItemId) ||
            line.quotedQty !== requested.qty ||
            (line.minimumQty ?? requested.minimumQty ?? 0) > requested.qty
          ) {
            invalidLines = true;
            break;
          }
          seen.add(line.rfqItemId);
        }
        if (invalidLines || seen.size !== rfq.items.length) {
          exclude('quantity_or_line_coverage_mismatch');
          continue;
        }

        let landedTotal = new Prisma.Decimal(quote.freight).plus(quote.duties);
        for (const line of quote.items) {
          landedTotal = landedTotal.plus(
            new Prisma.Decimal(line.unitPrice).mul(line.quotedQty),
          );
        }
        comparable.push({
          quoteId: quote.id,
          supplierName: quote.supplier.name,
          currency: rfq.currency.toUpperCase(),
          landedTotal: landedTotal.toFixed(2),
          leadTimeDays: quote.leadTimeDays,
          paymentTerms: quote.paymentTerms?.trim().slice(0, 400) || null,
          validUntil: quote.validUntil?.toISOString() ?? null,
        });
      }

      comparable.sort((a, b) => {
        const difference = new Prisma.Decimal(a.landedTotal).comparedTo(
          new Prisma.Decimal(b.landedTotal),
        );
        return difference || a.quoteId.localeCompare(b.quoteId);
      });
      const lowest = comparable.length >= 2 ? comparable[0].landedTotal : null;
      return {
        rfqId: rfq.id,
        currency: rfq.currency.toUpperCase(),
        currentQuoteRecordsReviewed: rfq.quotes.length,
        comparableQuoteCount: comparable.length,
        lowestComparableLandedTotal: lowest,
        quotes: comparable,
        excludedQuoteCount: Object.values(exclusionReasons).reduce(
          (sum, count) => sum + count,
          0,
        ),
        exclusionReasons,
        conclusion:
          comparable.length >= 2
            ? 'Comparable current quotes are recorded. The lowest landed total is a price-only observation, not a best-supplier decision or award.'
            : comparable.length === 1
              ? 'One comparable current quote is recorded; there is not enough like-for-like evidence for a comparison.'
              : 'No quote passed the current currency, validity, quantity and line-coverage checks.',
      };
    });

    return {
      state: 'available',
      source: 'CommerceRfq',
      reviewedRfqCount: rfqs.length,
      maxRfqsPerReview,
      maxQuotesPerRfq,
      comparisons,
      limitations: [
        'Only open RFQs are reviewed, ordered by most recently updated; this review is capped at 50 RFQs and the five latest submitted/shortlisted quotes per RFQ.',
        'Quote records are manually entered in Noxtill; the review does not confirm that a supplier sent, honored or delivered a quote.',
        'Landed total includes recorded line prices, freight and duties only. It does not include unrecorded taxes, exchange conversion, fees or other costs.',
        'Supplier quality, capacity, compliance, delivery performance and negotiated terms are not scored. A lower price is not a recommendation to award.',
        'No RFQ is awarded, purchase order created, supplier contacted or other canonical Commerce record changed by this review.',
      ],
    };
  }

  /** Summarize only persisted reconciliation checks; never call a marketplace from an agent review. */
  private async reviewSavedReconciliation(
    businessId: string,
  ): Promise<ReconciliationReview> {
    const maximumRunsReviewed = 20;
    const [runs, openItems] = await Promise.all([
      this.tenantPrisma.client.commerceReconciliationRun.findMany({
        where: { businessId },
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        take: maximumRunsReviewed,
        select: {
          provider: true,
          status: true,
          listingsChecked: true,
          discrepancies: true,
          startedAt: true,
          finishedAt: true,
        },
      }),
      this.tenantPrisma.client.commerceReconciliationItem.groupBy({
        by: ['provider', 'kind'],
        where: { businessId, status: 'open' },
        _count: { _all: true },
        orderBy: [{ provider: 'asc' }, { kind: 'asc' }],
      }),
    ]);
    const groups = openItems.map((item) => ({
      provider: item.provider,
      kind: item.kind,
      count: item._count._all,
    }));
    return {
      state: runs.length ? 'available' : 'no_saved_runs',
      source: runs.length ? 'CommerceReconciliationRun' : null,
      maximumRunsReviewed,
      latestRuns: runs.map((run) => ({
        provider: run.provider,
        status: run.status,
        listingsChecked: run.listingsChecked,
        discrepancies: run.discrepancies,
        startedAt: run.startedAt.toISOString(),
        finishedAt: run.finishedAt?.toISOString() ?? null,
      })),
      openDiscrepancies: groups,
      totalOpenDiscrepancies: groups.reduce(
        (sum, group) => sum + group.count,
        0,
      ),
      limitations: [
        'Only saved Commerce reconciliation runs and currently open discrepancy records are included; this review does not start a provider check.',
        'The existing reconciliation checks provider presence by SKU and stock quantity only. Price, title, description, images and other fields are not checked by those connectors.',
        'No saved run is not evidence that a connected store is in sync or healthy.',
      ],
    };
  }

  private nextReview(
    snapshot: CommerceSnapshot,
    productionReview: Awaited<
      ReturnType<CommerceProductionService['agentReview']>
    > | null,
  ): ReviewCandidate | null {
    if (
      (snapshot.riskCases.open ?? 0) + (snapshot.riskCases.investigating ?? 0) >
      0
    ) {
      return {
        title: 'Review open Commerce risk cases',
        summary: `${(snapshot.riskCases.open ?? 0) + (snapshot.riskCases.investigating ?? 0)} risk case(s) are open or investigating in the canonical risk register.`,
        resourceType: 'commerce_risk_cases',
        fieldRefs: ['CommerceRiskCase.status'],
      };
    }
    if ((snapshot.channelListings.failed ?? 0) > 0) {
      return {
        title: 'Inspect failed channel listing syncs',
        summary: `${snapshot.channelListings.failed} channel listing record(s) have a stored failed status.`,
        resourceType: 'commerce_channel_listings',
        fieldRefs: ['CommerceChannelListing.status'],
      };
    }
    if ((snapshot.productOpportunities.validation_requested ?? 0) > 0) {
      return {
        title: 'Review requested product validations',
        summary: `${snapshot.productOpportunities.validation_requested} product opportunity record(s) are awaiting validation.`,
        resourceType: 'commerce_product_opportunities',
        fieldRefs: ['ProductOpportunity.status'],
      };
    }
    if ((snapshot.rfqs.open ?? 0) > 0) {
      return {
        title: 'Review open RFQs',
        summary: `${snapshot.rfqs.open} sourcing request(s) are currently open.`,
        resourceType: 'commerce_rfqs',
        fieldRefs: ['CommerceRfq.status'],
      };
    }
    if ((snapshot.experiments.running ?? 0) > 0) {
      return {
        title: 'Review running experiments',
        summary: `${snapshot.experiments.running} Commerce experiment(s) are marked running.`,
        resourceType: 'commerce_experiments',
        fieldRefs: ['CommerceExperiment.status'],
      };
    }
    if (productionReview && productionReview.workOrders.lateOpenCount > 0) {
      return {
        title: 'Review late Production & Assembly orders',
        summary: `${productionReview.workOrders.lateOpenCount} planned or in-progress production work order(s) have a due date before this review. This is a follow-up cue, not a diagnosis of the delay.`,
        resourceType: 'commerce_production_assembly',
        fieldRefs: ['CommerceWorkOrder.status', 'CommerceWorkOrder.dueDate'],
      };
    }
    return null;
  }

  private async summarize(
    businessId: string,
    snapshot: CommerceSnapshot,
    specialistAgentRunId: string,
    sourceModuleKeys: readonly string[],
  ): Promise<AiSummary> {
    try {
      await this.agentPolicy.assertSourceModulesEnabledForBusiness(
        businessId,
        sourceModuleKeys,
      );
      const response = await this.aiInfra.createMessage(
        businessId,
        'commerce_agent',
        {
          system: `You are a read-only commerce review assistant. Explain only the supplied canonical status counts. Do not infer sales, traffic, profit, supplier quality, delivery, external synchronization, causes, risk scores or business impact. A risk case is not automatically a policy hold. Do not suggest changing records; keep the explanation concise for human review. ${SPECIALIST_AGENT_UNTRUSTED_DATA_POLICY}`,
          messages: [
            {
              role: 'user',
              content: `Explain only these aggregate Commerce status counts: ${specialistAgentUntrustedData('Commerce status snapshot', snapshot)}`,
            },
          ],
          temperature: 0,
          maxTokens: 220,
        },
        [{ tool: 'read_commerce_status_counts', scope: 'current_business' }],
        undefined,
        specialistAgentRunId,
      );
      await this.agentPolicy.assertSourceModulesEnabledForBusiness(
        businessId,
        sourceModuleKeys,
      );
      const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim()
        .slice(0, 1400);
      return {
        status: text ? 'ready' : 'unavailable',
        text: text || null,
        message: text ? null : 'The AI provider returned no explanation.',
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
      };
    } catch (error) {
      if (isSpecialistSourceModuleDisabledError(error)) throw error;
      if (error instanceof AppException) {
        const body = error.getResponse();
        const message =
          typeof body === 'object' && body !== null && 'message' in body
            ? String(body.message)
            : error.message;
        return {
          status: 'blocked',
          text: null,
          message,
          inputTokens: 0,
          outputTokens: 0,
        };
      }
      const notConfigured =
        error instanceof Error &&
        (error.message.includes('ANTHROPIC_API_KEY is not configured') ||
          error.message.includes('API key is not configured'));
      return {
        status: notConfigured ? 'not_configured' : 'unavailable',
        text: null,
        message: notConfigured
          ? 'AI provider is not configured on the server. The canonical Commerce counts remain available.'
          : 'The AI explanation could not be generated. The canonical Commerce counts remain available.',
        inputTokens: 0,
        outputTokens: 0,
      };
    }
  }
}
