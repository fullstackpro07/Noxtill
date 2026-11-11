import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';
import {
  AI_FEATURE_KEYS,
  AI_USAGE_DISCLOSURE_TEXT,
  AiFeatureKey,
  KIND_TO_FEATURE,
  estimateHaikuCostUsd,
} from './ai-infra.constants';
import { SPECIALIST_AGENT_BUDGETS } from './specialist-agent-budgets.constants';
import { resolvePolicies } from '../common/policies/policies.service';
import { SPECIALIST_AGENT_ORCHESTRATOR } from '../common/agents/specialist-agent-registry';
import { recordSpecialistAgentConfigVersions } from '../common/agents/specialist-agent-config.util';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const SPECIALIST_AGENT_DEFINITIONS = [
  { agentKey: 'seo_autopilot', moduleId: '28', name: 'SEO Autopilot' },
  {
    agentKey: 'autonomous_commerce',
    moduleId: '29',
    name: 'Autonomous Commerce',
  },
  {
    agentKey: 'inventory_intelligence',
    moduleId: '13',
    name: 'Inventory Intelligence',
  },
  {
    agentKey: 'financial_intelligence',
    moduleId: '30',
    name: 'Financial Intelligence',
  },
  {
    agentKey: 'customer_intelligence',
    moduleId: '7',
    name: 'Customer Intelligence',
  },
] as const;

const SPECIALIST_OPERATIONS_WINDOW_DAYS = 30;
const SPECIALIST_LATENCY_SAMPLE_LIMIT = 5000;
const SPECIALIST_EVIDENCE_SAMPLE_LIMIT = 5000;
const SPECIALIST_ACTION_AUDIT_LIMIT = 100;
const SPECIALIST_ACTION_AUDIT_EVENTS_PER_ACTION = 50;
const SPECIALIST_SECURITY_EVENT_LIMIT = 50;
const SPECIALIST_ACTION_ATTENTION_STATES = new Set([
  'approval_required',
  'execution_queued',
  'executing',
  'verification_pending',
  'verification_failed',
  'needs_review',
  'failed',
  'partially_succeeded',
]);

function recordedToolNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const tool = (entry as { tool?: unknown }).tool;
    return typeof tool === 'string' && tool.trim() ? [tool.trim()] : [];
  });
}

type SpecialistAgentKey =
  (typeof SPECIALIST_AGENT_DEFINITIONS)[number]['agentKey'];

type SpecialistAgentOperationAccumulator = {
  agentKey: SpecialistAgentKey;
  moduleId: string;
  name: string;
  operatorUserIds: Set<string>;
  totalRuns: number;
  totalRecommendations: number;
  statusCounts: Record<string, number>;
  recommendationStatusCounts: Record<string, number>;
  actionStateCounts: Record<string, number>;
  attentionActionCount: number;
  oldestAttentionActionUpdatedAt: Date | null;
  actionTypes: Record<
    string,
    {
      count: number;
      stateCounts: Record<string, number>;
      executionAttempts: number;
      executionLatencySamplesMs: number[];
    }
  >;
  actionExecutionAttempts: number;
  actionExecutionLatencySamplesMs: number[];
  proposalRevisionCount: number;
  approvalDecisions: {
    approved: number;
    rejected: number;
    decisionEvents: number;
    rejectedSharePercent: number | null;
  };
  verificationOutcomes: {
    verified: number;
    failed: number;
    verificationEvents: number;
    failedSharePercent: number | null;
  };
  recordedToolCounts: Record<string, number>;
  persistedToolCallCounts: Record<string, number>;
  registeredToolStatusCountsByKey: Record<string, Record<string, number>>;
  persistedToolExecutionSamplesByKey: Record<string, number[]>;
  toolExecutionSamplesByKey: Record<string, number[]>;
  activeRunCount: number;
  oldestActiveRunStartedAt: Date | null;
  queuedRunCount: number;
  oldestQueuedRunCreatedAt: Date | null;
  triggerCounts: Record<string, number>;
  failuresByCode: { code: string; count: number }[];
  unclassifiedFailures: number;
  latencySamplesMs: number[];
  providerLatencySamplesMs: number[];
  providerFailureLatencySamplesMs: number[];
  providerFailureCalls: number;
  providerFailureCodes: Record<string, number>;
  aiCalls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
};

type FeatureToggles = Record<AiFeatureKey, boolean>;

function resolveToggles(raw: unknown): FeatureToggles {
  const stored = (raw ?? {}) as Partial<Record<AiFeatureKey, boolean>>;
  const resolved = {} as FeatureToggles;
  for (const key of AI_FEATURE_KEYS) {
    resolved[key] = stored[key] !== false;
  }
  return resolved;
}

/**
 * AI Settings (UPD-BE-115). Uses the raw `PrismaService`, not `TenantPrismaService` — same
 * convention as `AiInfraService` itself, which this reads alongside (`AiCallLog` isn't a
 * tenant-scoped model in `TenantPrismaService`'s extension, so every query here takes an explicit
 * `businessId` instead of relying on CLS).
 */
@Injectable()
export class AiSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tenant-scoped, read-only operating summary from persisted specialist runs and linked AI logs.
   * Material-action lifecycle data comes from the shared action and append-only event tables.
   * The orchestration pickup metric is based on persisted timestamps, not live queue telemetry,
   * provider invoices. Commerce tool timing comes only from completed/failed registry attempts.
   */
  async getSpecialistOperations(businessId: string) {
    const observedAt = new Date();
    const monthStart = new Date(
      Date.UTC(observedAt.getUTCFullYear(), observedAt.getUTCMonth(), 1),
    );
    const windowStart = new Date(
      observedAt.getTime() -
        SPECIALIST_OPERATIONS_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    const [
      runGroups,
      operatorGroups,
      recommendationGroups,
      actionGroups,
      openActionGroups,
      actionTypeGroups,
      actionLifecycleGroups,
      actionRevisionGroups,
      actionExecutionEvents,
      errorGroups,
      activeRunGroups,
      queuedRunGroups,
      orchestrationQueueSamples,
      waitingOrchestrations,
      latencyRuns,
      evidenceRows,
      usageByRun,
      toolCallLogs,
      specialistToolCallGroups,
      specialistToolCallSamples,
      commerceToolRuns,
      providerLatencyLogs,
      providerFailureLatencyLogs,
      providerFailureGroups,
      providerFailureCodeGroups,
      business,
      monthlyRequestGroups,
      monthlyTokenGroups,
      auditedCrossTenantRunProbeDenials,
      auditedCommerceToolCallBlocks,
      auditedCommerceApprovalRefusals,
      auditedCustomerMessageQueueRefusals,
      securityAuditRows,
      securityToolCallRows,
      budgetLimitAuditRows,
    ] = await Promise.all([
      this.prisma.specialistAgentRun.groupBy({
        by: ['agentKey', 'moduleId', 'status', 'triggerType'],
        where: {
          businessId,
          createdAt: { gte: windowStart, lte: observedAt },
        },
        _count: { _all: true },
      }),
      this.prisma.specialistAgentRun.groupBy({
        by: ['agentKey', 'moduleId', 'initiatedByUserId'],
        where: {
          businessId,
          createdAt: { gte: windowStart, lte: observedAt },
          initiatedByUserId: { not: null },
        },
        _count: { _all: true },
      }),
      this.prisma.specialistAgentRecommendation.groupBy({
        by: ['agentKey', 'status'],
        where: {
          businessId,
          createdAt: { gte: windowStart, lte: observedAt },
        },
        _count: { _all: true },
      }),
      this.prisma.specialistAgentAction.groupBy({
        by: ['agentKey', 'state'],
        where: {
          businessId,
          createdAt: { gte: windowStart, lte: observedAt },
        },
        _count: { _all: true },
        _sum: { executionAttemptCount: true },
      }),
      this.prisma.specialistAgentAction.groupBy({
        by: ['agentKey', 'state'],
        where: {
          businessId,
          state: { in: [...SPECIALIST_ACTION_ATTENTION_STATES] },
        },
        _count: { _all: true },
        _min: { updatedAt: true },
      }),
      this.prisma.specialistAgentAction.groupBy({
        by: ['agentKey', 'actionType', 'state'],
        where: {
          businessId,
          createdAt: { gte: windowStart, lte: observedAt },
        },
        _count: { _all: true },
        _sum: { executionAttemptCount: true },
      }),
      this.prisma.specialistAgentActionEvent.groupBy({
        by: ['actionId', 'toState'],
        where: {
          businessId,
          createdAt: { gte: windowStart, lte: observedAt },
          toState: {
            in: ['approved', 'rejected', 'verified', 'verification_failed'],
          },
        },
        _count: { _all: true },
      }),
      this.prisma.specialistAgentActionEvent.groupBy({
        by: ['actionId'],
        where: {
          businessId,
          createdAt: { gte: windowStart, lte: observedAt },
          eventType: 'proposal_updated',
        },
        _count: { _all: true },
      }),
      this.prisma.specialistAgentActionEvent.findMany({
        where: {
          businessId,
          createdAt: { gte: windowStart, lte: observedAt },
          OR: [
            { toState: 'executing' },
            {
              fromState: 'executing',
              toState: {
                in: [
                  'succeeded',
                  'failed',
                  'partially_succeeded',
                  'needs_review',
                ],
              },
            },
          ],
        },
        orderBy: [{ actionId: 'asc' }, { sequence: 'asc' }],
        take: SPECIALIST_LATENCY_SAMPLE_LIMIT * 2,
        select: {
          actionId: true,
          fromState: true,
          toState: true,
          createdAt: true,
          action: {
            select: { agentKey: true, actionType: true, businessId: true },
          },
        },
      }),
      this.prisma.specialistAgentRun.groupBy({
        by: ['agentKey', 'errorCode'],
        where: {
          businessId,
          createdAt: { gte: windowStart, lte: observedAt },
          status: 'failed',
        },
        _count: { _all: true },
      }),
      this.prisma.specialistAgentRun.groupBy({
        by: ['agentKey'],
        where: { businessId, status: { in: ['running', 'cancel_requested'] } },
        _count: { _all: true },
        _min: { startedAt: true },
      }),
      this.prisma.specialistAgentRun.groupBy({
        by: ['agentKey'],
        where: { businessId, status: 'queued' },
        _count: { _all: true },
        _min: { createdAt: true },
      }),
      this.prisma.specialistAgentRun.findMany({
        where: {
          businessId,
          agentKey: SPECIALIST_AGENT_ORCHESTRATOR.agentKey,
          createdAt: { gte: windowStart, lte: observedAt },
          workerStartedAt: { not: null },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: SPECIALIST_LATENCY_SAMPLE_LIMIT,
        select: { createdAt: true, workerStartedAt: true },
      }),
      this.prisma.specialistAgentRun.aggregate({
        where: {
          businessId,
          agentKey: SPECIALIST_AGENT_ORCHESTRATOR.agentKey,
          status: { in: ['running', 'cancel_requested'] },
          workerStartedAt: null,
        },
        _count: { _all: true },
        _min: { createdAt: true },
      }),
      this.prisma.specialistAgentRun.findMany({
        where: {
          businessId,
          createdAt: { gte: windowStart, lte: observedAt },
          finishedAt: { not: null },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: SPECIALIST_LATENCY_SAMPLE_LIMIT,
        select: {
          agentKey: true,
          startedAt: true,
          finishedAt: true,
        },
      }),
      this.prisma.specialistAgentEvidence.findMany({
        where: {
          businessId,
          fetchedAt: { gte: windowStart, lte: observedAt },
          run: { businessId },
        },
        orderBy: [{ fetchedAt: 'desc' }, { id: 'desc' }],
        take: SPECIALIST_EVIDENCE_SAMPLE_LIMIT,
        select: {
          freshness: true,
          sourceType: true,
          observedAt: true,
          fetchedAt: true,
          run: { select: { businessId: true, agentKey: true } },
        },
      }),
      this.prisma.aiCallLog.groupBy({
        by: ['specialistAgentRunId'],
        where: {
          businessId,
          createdAt: { gte: windowStart, lte: observedAt },
          specialistAgentRunId: { not: null },
        },
        _count: { _all: true },
        _sum: {
          inputTokens: true,
          outputTokens: true,
          estimatedCostUsd: true,
        },
      }),
      this.prisma.aiCallLog.findMany({
        where: {
          businessId,
          createdAt: { gte: windowStart, lte: observedAt },
          specialistAgentRunId: { not: null },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          specialistAgentRunId: true,
          toolCalls: true,
        },
      }),
      this.prisma.specialistAgentToolCall.groupBy({
        by: ['agentKey', 'toolKey', 'status'],
        where: {
          businessId,
          createdAt: { gte: windowStart, lte: observedAt },
        },
        _count: { _all: true },
      }),
      this.prisma.specialistAgentToolCall.findMany({
        where: {
          businessId,
          createdAt: { gte: windowStart, lte: observedAt },
          status: { in: ['succeeded', 'failed'] },
          durationMs: { not: null },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: SPECIALIST_LATENCY_SAMPLE_LIMIT,
        select: { agentKey: true, toolKey: true, durationMs: true },
      }),
      this.prisma.commerceAgentToolRun.findMany({
        where: {
          businessId,
          createdAt: { gte: windowStart, lte: observedAt },
          actorType: { in: ['agent', 'commerce_agent'] },
          outcome: { in: ['succeeded', 'failed'] },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: SPECIALIST_LATENCY_SAMPLE_LIMIT,
        select: { toolKey: true, durationMs: true },
      }),
      this.prisma.aiCallLog.findMany({
        where: {
          businessId,
          createdAt: { gte: windowStart, lte: observedAt },
          specialistAgentRunId: { not: null },
          providerLatencyMs: { not: null },
          providerCallSucceeded: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: SPECIALIST_LATENCY_SAMPLE_LIMIT,
        select: {
          specialistAgentRunId: true,
          providerLatencyMs: true,
        },
      }),
      this.prisma.aiCallLog.findMany({
        where: {
          businessId,
          createdAt: { gte: windowStart, lte: observedAt },
          specialistAgentRunId: { not: null },
          providerLatencyMs: { not: null },
          providerCallSucceeded: false,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: SPECIALIST_LATENCY_SAMPLE_LIMIT,
        select: {
          specialistAgentRunId: true,
          providerLatencyMs: true,
        },
      }),
      this.prisma.aiCallLog.groupBy({
        by: ['specialistAgentRunId'],
        where: {
          businessId,
          createdAt: { gte: windowStart, lte: observedAt },
          specialistAgentRunId: { not: null },
          providerCallSucceeded: false,
        },
        _count: { _all: true },
      }),
      this.prisma.aiCallLog.groupBy({
        by: ['specialistAgentRunId', 'providerFailureCode'],
        where: {
          businessId,
          createdAt: { gte: windowStart, lte: observedAt },
          specialistAgentRunId: { not: null },
          providerCallSucceeded: false,
          providerFailureCode: { not: null },
        },
        _count: { _all: true },
      }),
      this.prisma.business.findUnique({
        where: { id: businessId },
        select: { policies: true },
      }),
      this.prisma.specialistAgentAiRequest.groupBy({
        by: ['agentKey', 'state'],
        where: {
          businessId,
          createdAt: { gte: monthStart, lte: observedAt },
        },
        _count: { _all: true },
        _sum: { reservedCostUsd: true },
      }),
      this.prisma.aiCallLog.groupBy({
        by: ['kind'],
        where: {
          businessId,
          createdAt: { gte: monthStart, lte: observedAt },
          kind: {
            in: SPECIALIST_AGENT_DEFINITIONS.map(
              (agent) => SPECIALIST_AGENT_BUDGETS[agent.agentKey].kind,
            ),
          },
        },
        _sum: { inputTokens: true, outputTokens: true },
      }),
      this.prisma.auditLog.count({
        where: {
          businessId,
          entity: 'SpecialistAgentRun',
          action: 'specialist_agent.orchestration_cross_tenant_access_denied',
          createdAt: { gte: windowStart, lte: observedAt },
        },
      }),
      this.prisma.auditLog.count({
        where: {
          businessId,
          entity: 'SpecialistAgentRun',
          action: 'commerce.agent_tool_call_blocked',
          createdAt: { gte: windowStart, lte: observedAt },
        },
      }),
      this.prisma.auditLog.count({
        where: {
          businessId,
          entity: 'CommerceAgentToolRun',
          action: 'commerce.agent_tool_approval_refused',
          createdAt: { gte: windowStart, lte: observedAt },
        },
      }),
      this.prisma.auditLog.count({
        where: {
          businessId,
          entity: 'MessageDraft',
          action: 'customer_agent.message_draft_queue_refused',
          createdAt: { gte: windowStart, lte: observedAt },
        },
      }),
      this.prisma.auditLog.findMany({
        where: {
          businessId,
          createdAt: { gte: windowStart, lte: observedAt },
          action: {
            in: [
              'specialist_agent.orchestration_cross_tenant_access_denied',
              'commerce.agent_tool_call_blocked',
              'commerce.agent_tool_approval_refused',
              'customer_agent.message_draft_queue_refused',
            ],
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: SPECIALIST_SECURITY_EVENT_LIMIT,
        select: {
          id: true,
          actorUserId: true,
          action: true,
          entity: true,
          entityId: true,
          createdAt: true,
        },
      }),
      this.prisma.specialistAgentToolCall.findMany({
        where: {
          businessId,
          createdAt: { gte: windowStart, lte: observedAt },
          status: { in: ['blocked', 'refused'] },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: SPECIALIST_SECURITY_EVENT_LIMIT,
        select: {
          id: true,
          runId: true,
          agentKey: true,
          toolKey: true,
          status: true,
          errorCode: true,
          correlationId: true,
          createdAt: true,
        },
      }),
      this.prisma.auditLog.findMany({
        where: {
          businessId,
          entity: 'SpecialistAgentBudget',
          action: 'agent.budget.limit_reached',
          createdAt: { gte: windowStart, lte: observedAt },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: SPECIALIST_SECURITY_EVENT_LIMIT,
        select: { id: true, after: true, createdAt: true },
      }),
    ]);

    const eventActionIds = [
      ...new Set([
        ...actionLifecycleGroups.map((row) => row.actionId),
        ...actionRevisionGroups.map((row) => row.actionId),
      ]),
    ];
    const eventActions = eventActionIds.length
      ? await this.prisma.specialistAgentAction.findMany({
          where: { businessId, id: { in: eventActionIds } },
          select: { id: true, agentKey: true },
        })
      : [];
    const lifecycleAgentByActionId = new Map(
      eventActions.map((action) => [action.id, action.agentKey]),
    );

    const policies = resolvePolicies({ policies: business?.policies ?? null });
    const queuedRunWarningAgeMinutes = policies.num(
      'agents.queuedRunWarningAgeMinutes',
    );

    const securityDenials = [
      ...securityAuditRows.map((row) => ({
        id: row.id,
        source: 'audit_log' as const,
        event: row.action,
        occurredAt: row.createdAt.toISOString(),
        actorUserId: row.actorUserId,
        agentKey: null,
        toolKey: null,
        status: null,
        errorCode: null,
        correlationId: null,
        targetType: row.entity,
        targetId: row.entityId,
      })),
      ...securityToolCallRows.map((row) => ({
        id: row.id,
        source: 'tool_call' as const,
        event: row.status,
        occurredAt: row.createdAt.toISOString(),
        actorUserId: null,
        agentKey: row.agentKey,
        toolKey: row.toolKey,
        status: row.status,
        errorCode: row.errorCode,
        correlationId: row.correlationId,
        targetType: 'SpecialistAgentRun',
        targetId: row.runId,
      })),
    ]
      .sort(
        (left, right) =>
          right.occurredAt.localeCompare(left.occurredAt) ||
          right.id.localeCompare(left.id),
      )
      .slice(0, SPECIALIST_SECURITY_EVENT_LIMIT);

    const budgetLimitEvents = budgetLimitAuditRows.flatMap((row) => {
      const payload = row.after;
      if (!payload || typeof payload !== 'object' || Array.isArray(payload))
        return [];
      const agentKey = payload.agent_key;
      const limitCode = payload.limit_code;
      const targetId = payload.entity_id;
      if (
        payload.event_name !== 'agent.budget.limit_reached' ||
        typeof agentKey !== 'string' ||
        !SPECIALIST_AGENT_DEFINITIONS.some(
          (agent) => agent.agentKey === agentKey,
        ) ||
        typeof limitCode !== 'string' ||
        ![
          'SPECIALIST_AGENT_RUN_REQUEST_LIMIT_REACHED',
          'SPECIALIST_AGENT_MONTHLY_REQUEST_LIMIT_REACHED',
          'SPECIALIST_AGENT_MONTHLY_BUDGET_REACHED',
        ].includes(limitCode) ||
        typeof targetId !== 'string'
      ) {
        return [];
      }
      return [
        {
          id: row.id,
          agentKey,
          event: 'agent.budget.limit_reached' as const,
          occurredAt: row.createdAt.toISOString(),
          targetId,
          limitCode,
        },
      ];
    });

    const linkedRunIds = [
      ...usageByRun.map((row) => row.specialistAgentRunId),
      ...toolCallLogs.map((row) => row.specialistAgentRunId),
      ...providerLatencyLogs.map((row) => row.specialistAgentRunId),
      ...providerFailureGroups.map((row) => row.specialistAgentRunId),
      ...providerFailureCodeGroups.map((row) => row.specialistAgentRunId),
    ].filter((id): id is string => Boolean(id));
    const usageRuns = linkedRunIds.length
      ? await this.prisma.specialistAgentRun.findMany({
          where: { businessId, id: { in: [...new Set(linkedRunIds)] } },
          select: { id: true, agentKey: true },
        })
      : [];
    const usageAgentByRunId = new Map(
      usageRuns.map((run) => [run.id, run.agentKey]),
    );
    const evidenceByAgent = new Map<
      SpecialistAgentKey,
      {
        sampledRecords: number;
        freshnessCounts: Record<string, number>;
        sourceTypeCounts: Record<string, number>;
        latestFetchedAt: Date | null;
        latestFetchObservedAt: Date | null;
      }
    >();
    for (const evidence of evidenceRows) {
      if (evidence.run.businessId !== businessId) continue;
      const agentKey = evidence.run.agentKey as SpecialistAgentKey;
      const current = evidenceByAgent.get(agentKey) ?? {
        sampledRecords: 0,
        freshnessCounts: {},
        sourceTypeCounts: {},
        latestFetchedAt: null,
        latestFetchObservedAt: null,
      };
      current.sampledRecords += 1;
      current.freshnessCounts[evidence.freshness] =
        (current.freshnessCounts[evidence.freshness] ?? 0) + 1;
      current.sourceTypeCounts[evidence.sourceType] =
        (current.sourceTypeCounts[evidence.sourceType] ?? 0) + 1;
      if (
        !current.latestFetchedAt ||
        evidence.fetchedAt > current.latestFetchedAt
      ) {
        current.latestFetchedAt = evidence.fetchedAt;
        current.latestFetchObservedAt = evidence.observedAt;
      }
      evidenceByAgent.set(agentKey, current);
    }
    const monthlyRequestsByAgent = new Map<
      SpecialistAgentKey,
      { count: number; reservedUsd: number }
    >();
    for (const row of monthlyRequestGroups) {
      const stats = monthlyRequestsByAgent.get(
        row.agentKey as SpecialistAgentKey,
      ) ?? { count: 0, reservedUsd: 0 };
      stats.count += row._count._all;
      if (row.state === 'reserved' || row.state === 'provider_failed') {
        stats.reservedUsd += Number(row._sum.reservedCostUsd ?? 0);
      }
      monthlyRequestsByAgent.set(row.agentKey as SpecialistAgentKey, stats);
    }
    const monthlyTokensByKind = new Map(
      monthlyTokenGroups.map((row) => [
        row.kind,
        {
          input: Number(row._sum.inputTokens ?? 0),
          output: Number(row._sum.outputTokens ?? 0),
        },
      ]),
    );

    const agentStats = new Map<
      SpecialistAgentKey,
      SpecialistAgentOperationAccumulator
    >(
      SPECIALIST_AGENT_DEFINITIONS.map(
        (agent): [SpecialistAgentKey, SpecialistAgentOperationAccumulator] => [
          agent.agentKey,
          {
            ...agent,
            operatorUserIds: new Set<string>(),
            totalRuns: 0,
            totalRecommendations: 0,
            statusCounts: {},
            recommendationStatusCounts: {},
            actionStateCounts: {},
            attentionActionCount: 0,
            oldestAttentionActionUpdatedAt: null,
            actionTypes: {},
            actionExecutionAttempts: 0,
            actionExecutionLatencySamplesMs: [],
            proposalRevisionCount: 0,
            approvalDecisions: {
              approved: 0,
              rejected: 0,
              decisionEvents: 0,
              rejectedSharePercent: null,
            },
            verificationOutcomes: {
              verified: 0,
              failed: 0,
              verificationEvents: 0,
              failedSharePercent: null,
            },
            recordedToolCounts: {},
            persistedToolCallCounts: {},
            registeredToolStatusCountsByKey: {},
            persistedToolExecutionSamplesByKey: {},
            toolExecutionSamplesByKey: {},
            activeRunCount: 0,
            oldestActiveRunStartedAt: null,
            queuedRunCount: 0,
            oldestQueuedRunCreatedAt: null,
            triggerCounts: {},
            failuresByCode: [],
            unclassifiedFailures: 0,
            latencySamplesMs: [],
            providerLatencySamplesMs: [],
            providerFailureLatencySamplesMs: [],
            providerFailureCalls: 0,
            providerFailureCodes: {},
            aiCalls: 0,
            inputTokens: 0,
            outputTokens: 0,
            estimatedCostUsd: 0,
          },
        ],
      ),
    );

    for (const row of runGroups) {
      const stats = agentStats.get(row.agentKey as SpecialistAgentKey);
      if (!stats) continue;
      const count = row._count._all;
      stats.totalRuns += count;
      stats.statusCounts[row.status] =
        (stats.statusCounts[row.status] ?? 0) + count;
      stats.triggerCounts[row.triggerType] =
        (stats.triggerCounts[row.triggerType] ?? 0) + count;
    }

    for (const row of operatorGroups) {
      const stats = agentStats.get(row.agentKey as SpecialistAgentKey);
      if (stats && row.moduleId === stats.moduleId && row.initiatedByUserId) {
        stats.operatorUserIds.add(row.initiatedByUserId);
      }
    }

    for (const row of recommendationGroups) {
      const stats = agentStats.get(row.agentKey as SpecialistAgentKey);
      if (!stats) continue;
      stats.totalRecommendations += row._count._all;
      stats.recommendationStatusCounts[row.status] =
        (stats.recommendationStatusCounts[row.status] ?? 0) + row._count._all;
    }

    for (const row of actionGroups) {
      const stats = agentStats.get(row.agentKey as SpecialistAgentKey);
      if (!stats) continue;
      stats.actionStateCounts[row.state] =
        (stats.actionStateCounts[row.state] ?? 0) + row._count._all;
      stats.actionExecutionAttempts += Number(
        row._sum.executionAttemptCount ?? 0,
      );
    }

    for (const row of openActionGroups) {
      const stats = agentStats.get(row.agentKey as SpecialistAgentKey);
      if (!stats) continue;
      stats.attentionActionCount += row._count._all;
      const oldestUpdatedAt = row._min.updatedAt;
      if (
        oldestUpdatedAt &&
        (!stats.oldestAttentionActionUpdatedAt ||
          oldestUpdatedAt < stats.oldestAttentionActionUpdatedAt)
      ) {
        stats.oldestAttentionActionUpdatedAt = oldestUpdatedAt;
      }
    }

    for (const row of actionTypeGroups) {
      const stats = agentStats.get(row.agentKey as SpecialistAgentKey);
      if (!stats) continue;
      const actionType = stats.actionTypes[row.actionType] ?? {
        count: 0,
        stateCounts: {},
        executionAttempts: 0,
        executionLatencySamplesMs: [],
      };
      actionType.count += row._count._all;
      actionType.stateCounts[row.state] =
        (actionType.stateCounts[row.state] ?? 0) + row._count._all;
      actionType.executionAttempts += Number(
        row._sum.executionAttemptCount ?? 0,
      );
      stats.actionTypes[row.actionType] = actionType;
    }

    for (const row of actionLifecycleGroups) {
      const agentKey = lifecycleAgentByActionId.get(row.actionId);
      const stats = agentKey
        ? agentStats.get(agentKey as SpecialistAgentKey)
        : undefined;
      if (!stats || !row.toState) continue;
      if (row.toState === 'approved' || row.toState === 'rejected') {
        stats.approvalDecisions[row.toState] += row._count._all;
      } else if (row.toState === 'verified') {
        stats.verificationOutcomes.verified += row._count._all;
      } else if (row.toState === 'verification_failed') {
        stats.verificationOutcomes.failed += row._count._all;
      }
    }

    for (const row of actionRevisionGroups) {
      const agentKey = lifecycleAgentByActionId.get(row.actionId);
      const stats = agentKey
        ? agentStats.get(agentKey as SpecialistAgentKey)
        : undefined;
      if (stats) stats.proposalRevisionCount += row._count._all;
    }

    const actionExecutionStartedAt = new Map<string, Date>();
    const executionTerminalStates = new Set([
      'succeeded',
      'failed',
      'partially_succeeded',
      'needs_review',
    ]);
    for (const event of actionExecutionEvents) {
      if (event.action.businessId !== businessId) continue;
      if (event.toState === 'executing') {
        actionExecutionStartedAt.set(event.actionId, event.createdAt);
        continue;
      }
      if (
        event.fromState !== 'executing' ||
        !event.toState ||
        !executionTerminalStates.has(event.toState)
      ) {
        continue;
      }
      const startedAt = actionExecutionStartedAt.get(event.actionId);
      if (!startedAt) continue;
      const durationMs = event.createdAt.getTime() - startedAt.getTime();
      actionExecutionStartedAt.delete(event.actionId);
      if (!Number.isFinite(durationMs) || durationMs < 0) continue;
      const stats = agentStats.get(event.action.agentKey as SpecialistAgentKey);
      if (stats) {
        stats.actionExecutionLatencySamplesMs.push(durationMs);
        const actionType = stats.actionTypes[event.action.actionType] ?? {
          count: 0,
          stateCounts: {},
          executionAttempts: 0,
          executionLatencySamplesMs: [],
        };
        actionType.executionLatencySamplesMs.push(durationMs);
        stats.actionTypes[event.action.actionType] = actionType;
      }
    }

    for (const row of activeRunGroups) {
      const stats = agentStats.get(row.agentKey as SpecialistAgentKey);
      if (!stats) continue;
      stats.activeRunCount = row._count._all;
      stats.oldestActiveRunStartedAt = row._min.startedAt;
    }

    for (const row of queuedRunGroups) {
      const stats = agentStats.get(row.agentKey as SpecialistAgentKey);
      if (!stats) continue;
      stats.queuedRunCount = row._count._all;
      stats.oldestQueuedRunCreatedAt = row._min.createdAt;
    }

    for (const row of errorGroups) {
      const stats = agentStats.get(row.agentKey as SpecialistAgentKey);
      if (!stats) continue;
      if (row.errorCode) {
        stats.failuresByCode.push({
          code: row.errorCode,
          count: row._count._all,
        });
      } else {
        stats.unclassifiedFailures += row._count._all;
      }
    }

    for (const run of latencyRuns) {
      const stats = agentStats.get(run.agentKey as SpecialistAgentKey);
      if (!stats || !run.finishedAt) continue;
      const durationMs = run.finishedAt.getTime() - run.startedAt.getTime();
      if (Number.isFinite(durationMs) && durationMs >= 0) {
        stats.latencySamplesMs.push(durationMs);
      }
    }

    for (const row of usageByRun) {
      const agentKey = row.specialistAgentRunId
        ? usageAgentByRunId.get(row.specialistAgentRunId)
        : undefined;
      const stats = agentKey
        ? agentStats.get(agentKey as SpecialistAgentKey)
        : undefined;
      if (!stats) continue;
      stats.aiCalls += row._count._all;
      stats.inputTokens += row._sum.inputTokens ?? 0;
      stats.outputTokens += row._sum.outputTokens ?? 0;
      stats.estimatedCostUsd += Number(row._sum.estimatedCostUsd ?? 0);
    }

    for (const row of toolCallLogs) {
      const agentKey = row.specialistAgentRunId
        ? usageAgentByRunId.get(row.specialistAgentRunId)
        : undefined;
      const stats = agentKey
        ? agentStats.get(agentKey as SpecialistAgentKey)
        : undefined;
      if (!stats) continue;
      for (const toolName of recordedToolNames(row.toolCalls)) {
        stats.recordedToolCounts[toolName] =
          (stats.recordedToolCounts[toolName] ?? 0) + 1;
      }
    }

    let persistedToolCallRefusals = 0;
    for (const row of specialistToolCallGroups) {
      const count = row._count._all;
      const stats = agentStats.get(row.agentKey as SpecialistAgentKey);
      if (stats) {
        stats.persistedToolCallCounts[row.status] =
          (stats.persistedToolCallCounts[row.status] ?? 0) + count;
        const toolCounts =
          stats.registeredToolStatusCountsByKey[row.toolKey] ?? {};
        toolCounts[row.status] = (toolCounts[row.status] ?? 0) + count;
        stats.registeredToolStatusCountsByKey[row.toolKey] = toolCounts;
      }
      if (row.status === 'blocked' || row.status === 'refused') {
        persistedToolCallRefusals += count;
      }
    }

    for (const row of specialistToolCallSamples) {
      const stats = agentStats.get(row.agentKey as SpecialistAgentKey);
      if (
        !stats ||
        row.durationMs === null ||
        !Number.isFinite(row.durationMs) ||
        row.durationMs < 0 ||
        !row.toolKey.trim()
      ) {
        continue;
      }
      const samples =
        stats.persistedToolExecutionSamplesByKey[row.toolKey] ?? [];
      samples.push(row.durationMs);
      stats.persistedToolExecutionSamplesByKey[row.toolKey] = samples;
    }

    const commerceStats = agentStats.get('autonomous_commerce');
    if (commerceStats) {
      for (const row of commerceToolRuns) {
        if (
          !Number.isFinite(row.durationMs) ||
          row.durationMs < 0 ||
          !row.toolKey.trim()
        ) {
          continue;
        }
        const samples =
          commerceStats.toolExecutionSamplesByKey[row.toolKey] ?? [];
        samples.push(row.durationMs);
        commerceStats.toolExecutionSamplesByKey[row.toolKey] = samples;
      }
    }

    for (const row of providerLatencyLogs) {
      const agentKey = row.specialistAgentRunId
        ? usageAgentByRunId.get(row.specialistAgentRunId)
        : undefined;
      const stats = agentKey
        ? agentStats.get(agentKey as SpecialistAgentKey)
        : undefined;
      if (
        stats &&
        row.providerLatencyMs !== null &&
        Number.isFinite(row.providerLatencyMs) &&
        row.providerLatencyMs >= 0
      ) {
        stats.providerLatencySamplesMs.push(row.providerLatencyMs);
      }
    }

    for (const row of providerFailureLatencyLogs) {
      const agentKey = row.specialistAgentRunId
        ? usageAgentByRunId.get(row.specialistAgentRunId)
        : undefined;
      const stats = agentKey
        ? agentStats.get(agentKey as SpecialistAgentKey)
        : undefined;
      if (
        stats &&
        row.providerLatencyMs !== null &&
        Number.isFinite(row.providerLatencyMs) &&
        row.providerLatencyMs >= 0
      ) {
        stats.providerFailureLatencySamplesMs.push(row.providerLatencyMs);
      }
    }

    for (const row of providerFailureGroups) {
      const agentKey = row.specialistAgentRunId
        ? usageAgentByRunId.get(row.specialistAgentRunId)
        : undefined;
      const stats = agentKey
        ? agentStats.get(agentKey as SpecialistAgentKey)
        : undefined;
      if (stats) stats.providerFailureCalls += row._count._all;
    }

    for (const row of providerFailureCodeGroups) {
      const agentKey = row.specialistAgentRunId
        ? usageAgentByRunId.get(row.specialistAgentRunId)
        : undefined;
      const stats = agentKey
        ? agentStats.get(agentKey as SpecialistAgentKey)
        : undefined;
      if (!stats || !row.providerFailureCode) continue;
      stats.providerFailureCodes[row.providerFailureCode] =
        (stats.providerFailureCodes[row.providerFailureCode] ?? 0) +
        row._count._all;
    }

    const percentile = (values: number[], quantile: number): number | null => {
      if (!values.length) return null;
      const ordered = [...values].sort((a, b) => a - b);
      return ordered[Math.max(0, Math.ceil(ordered.length * quantile) - 1)];
    };
    const orchestrationQueueWaitSamplesMs = orchestrationQueueSamples.flatMap(
      (run) => {
        if (!run.workerStartedAt) return [];
        const waitMs = run.workerStartedAt.getTime() - run.createdAt.getTime();
        return Number.isFinite(waitMs) && waitMs >= 0 ? [waitMs] : [];
      },
    );

    const agents = [...agentStats.values()].map((stats) => ({
      agentKey: stats.agentKey,
      moduleId: stats.moduleId,
      name: stats.name,
      totalRuns: stats.totalRuns,
      uniqueOperators: stats.operatorUserIds.size,
      totalRecommendations: stats.totalRecommendations,
      statusCounts: stats.statusCounts,
      recommendationStatusCounts: stats.recommendationStatusCounts,
      actionStateCounts: stats.actionStateCounts,
      openActionAttention: {
        count: stats.attentionActionCount,
        oldestUpdatedAgeMs: stats.oldestAttentionActionUpdatedAt
          ? Math.max(
              0,
              observedAt.getTime() -
                stats.oldestAttentionActionUpdatedAt.getTime(),
            )
          : null,
      },
      actionTypes: Object.entries(stats.actionTypes)
        .map(([actionType, summary]) => ({
          actionType,
          count: summary.count,
          stateCounts: summary.stateCounts,
          executionAttempts: summary.executionAttempts,
          executionLatency: {
            p50Ms: percentile(summary.executionLatencySamplesMs, 0.5),
            p95Ms: percentile(summary.executionLatencySamplesMs, 0.95),
            sampleCount: summary.executionLatencySamplesMs.length,
            sampleLimit: SPECIALIST_LATENCY_SAMPLE_LIMIT,
          },
        }))
        .sort((left, right) => left.actionType.localeCompare(right.actionType)),
      actionExecutionAttempts: stats.actionExecutionAttempts,
      actionExecutionLatency: {
        p50Ms: percentile(stats.actionExecutionLatencySamplesMs, 0.5),
        p95Ms: percentile(stats.actionExecutionLatencySamplesMs, 0.95),
        sampleCount: stats.actionExecutionLatencySamplesMs.length,
        sampleLimit: SPECIALIST_LATENCY_SAMPLE_LIMIT,
      },
      proposalRevisionCount: stats.proposalRevisionCount,
      approvalDecisions: {
        ...stats.approvalDecisions,
        decisionEvents:
          stats.approvalDecisions.approved + stats.approvalDecisions.rejected,
        rejectedSharePercent:
          stats.approvalDecisions.approved + stats.approvalDecisions.rejected >
          0
            ? Math.round(
                (stats.approvalDecisions.rejected /
                  (stats.approvalDecisions.approved +
                    stats.approvalDecisions.rejected)) *
                  1000,
              ) / 10
            : null,
      },
      verificationOutcomes: {
        ...stats.verificationOutcomes,
        verificationEvents:
          stats.verificationOutcomes.verified +
          stats.verificationOutcomes.failed,
        failedSharePercent:
          stats.verificationOutcomes.verified +
            stats.verificationOutcomes.failed >
          0
            ? Math.round(
                (stats.verificationOutcomes.failed /
                  (stats.verificationOutcomes.verified +
                    stats.verificationOutcomes.failed)) *
                  1000,
              ) / 10
            : null,
      },
      recordedToolCounts: stats.recordedToolCounts,
      persistedToolCalls: {
        total: Object.values(stats.persistedToolCallCounts).reduce(
          (sum, count) => sum + count,
          0,
        ),
        statusCounts: stats.persistedToolCallCounts,
      },
      registeredToolStatusByKey: Object.entries(
        stats.registeredToolStatusCountsByKey,
      )
        .map(([toolKey, statusCounts]) => ({
          toolKey,
          total: Object.values(statusCounts).reduce(
            (sum, count) => sum + count,
            0,
          ),
          statusCounts,
        }))
        .sort((left, right) => left.toolKey.localeCompare(right.toolKey)),
      registeredToolExecutionByKey: Object.entries(
        stats.persistedToolExecutionSamplesByKey,
      )
        .map(([toolKey, samples]) => ({
          toolKey,
          p50Ms: percentile(samples, 0.5),
          p95Ms: percentile(samples, 0.95),
          sampleCount: samples.length,
          sampleLimit: SPECIALIST_LATENCY_SAMPLE_LIMIT,
        }))
        .sort((left, right) => left.toolKey.localeCompare(right.toolKey)),
      toolExecutionByKey: Object.entries(stats.toolExecutionSamplesByKey)
        .map(([toolKey, samples]) => ({
          toolKey,
          p50Ms: percentile(samples, 0.5),
          p95Ms: percentile(samples, 0.95),
          sampleCount: samples.length,
          sampleLimit: SPECIALIST_LATENCY_SAMPLE_LIMIT,
        }))
        .sort((left, right) => left.toolKey.localeCompare(right.toolKey)),
      activeRuns: {
        count: stats.activeRunCount,
        oldestAgeMs: stats.oldestActiveRunStartedAt
          ? Math.max(
              0,
              observedAt.getTime() - stats.oldestActiveRunStartedAt.getTime(),
            )
          : null,
      },
      queuedRuns: {
        count: stats.queuedRunCount,
        oldestAgeMs: stats.oldestQueuedRunCreatedAt
          ? Math.max(
              0,
              observedAt.getTime() - stats.oldestQueuedRunCreatedAt.getTime(),
            )
          : null,
      },
      triggerCounts: stats.triggerCounts,
      failuresByCode: stats.failuresByCode.sort((a, b) => b.count - a.count),
      unclassifiedFailures: stats.unclassifiedFailures,
      finishedRunLatency: {
        p50Ms: percentile(stats.latencySamplesMs, 0.5),
        p95Ms: percentile(stats.latencySamplesMs, 0.95),
        sampleCount: stats.latencySamplesMs.length,
        sampleLimit: SPECIALIST_LATENCY_SAMPLE_LIMIT,
      },
      providerLatency: {
        p50Ms: percentile(stats.providerLatencySamplesMs, 0.5),
        p95Ms: percentile(stats.providerLatencySamplesMs, 0.95),
        sampleCount: stats.providerLatencySamplesMs.length,
        sampleLimit: SPECIALIST_LATENCY_SAMPLE_LIMIT,
      },
      providerFailureLatency: {
        p50Ms: percentile(stats.providerFailureLatencySamplesMs, 0.5),
        p95Ms: percentile(stats.providerFailureLatencySamplesMs, 0.95),
        sampleCount: stats.providerFailureLatencySamplesMs.length,
        sampleLimit: SPECIALIST_LATENCY_SAMPLE_LIMIT,
      },
      providerFailureCalls: stats.providerFailureCalls,
      providerFailureCodes: Object.entries(stats.providerFailureCodes)
        .map(([code, count]) => ({ code, count }))
        .sort(
          (left, right) =>
            right.count - left.count || left.code.localeCompare(right.code),
        ),
      evidence: (() => {
        const summary = evidenceByAgent.get(stats.agentKey);
        return {
          sampledRecords: summary?.sampledRecords ?? 0,
          freshnessCounts: summary?.freshnessCounts ?? {},
          sourceTypeCounts: summary?.sourceTypeCounts ?? {},
          latestFetchedAt: summary?.latestFetchedAt?.toISOString() ?? null,
          latestFetchObservedAt:
            summary?.latestFetchObservedAt?.toISOString() ?? null,
          sampleLimit: SPECIALIST_EVIDENCE_SAMPLE_LIMIT,
        };
      })(),
      monthlyBudget: (() => {
        const budget = SPECIALIST_AGENT_BUDGETS[stats.agentKey];
        const requests = monthlyRequestsByAgent.get(stats.agentKey);
        const tokens = monthlyTokensByKind.get(budget.kind);
        const estimatedSpendUsd =
          estimateHaikuCostUsd(tokens?.input ?? 0, tokens?.output ?? 0) +
          (requests?.reservedUsd ?? 0);
        return {
          monthStart: monthStart.toISOString(),
          requestsUsed: requests?.count ?? 0,
          requestLimit: policies.num(budget.policy),
          estimatedSpendUsd: Number(estimatedSpendUsd.toFixed(6)),
          spendLimitUsd: policies.num(budget.spendPolicy),
          reservedSpendUsd: Number((requests?.reservedUsd ?? 0).toFixed(6)),
        };
      })(),
      aiUsage: {
        calls: stats.aiCalls,
        inputTokens: stats.inputTokens,
        outputTokens: stats.outputTokens,
        estimatedCostUsd:
          Math.round(stats.estimatedCostUsd * 1_000_000) / 1_000_000,
      },
    }));

    const alerts: {
      code: string;
      agentKey: SpecialistAgentKey | 'security';
      agentName: string;
      severity: 'warning' | 'critical';
      observedValue: number;
      thresholdValue: number | null;
      unit:
        | 'runs'
        | 'calls'
        | 'events'
        | 'records'
        | 'requests'
        | 'minutes'
        | 'USD';
      message: string;
    }[] = [];
    const addCountAlert = (
      agent: (typeof agents)[number],
      code: string,
      title: string,
      count: number,
      unit: 'runs' | 'calls' | 'events' | 'records',
      windowed = true,
    ) => {
      if (count <= 0) return;
      alerts.push({
        code,
        agentKey: agent.agentKey,
        agentName: agent.name,
        severity: 'warning',
        observedValue: count,
        thresholdValue: 0,
        unit,
        message: windowed
          ? `${title}: ${count} recorded in the ${SPECIALIST_OPERATIONS_WINDOW_DAYS}-day window.`
          : `${title}: ${count} currently require attention.`,
      });
    };
    const addBudgetAlert = (
      agent: (typeof agents)[number],
      code: string,
      current: number,
      limit: number | null,
      unit: 'requests' | 'USD',
      metricLabel: string,
    ) => {
      if (limit === null || limit <= 0 || current / limit < 0.7) return;
      const utilizationPercent = Math.round((current / limit) * 1000) / 10;
      alerts.push({
        code,
        agentKey: agent.agentKey,
        agentName: agent.name,
        severity: utilizationPercent >= 90 ? 'critical' : 'warning',
        observedValue: current,
        thresholdValue: limit,
        unit: unit === 'requests' ? 'requests' : 'USD',
        message: `${metricLabel} is at ${utilizationPercent}% of this month's configured limit (alert bands: 70% and 90%).`,
      });
    };
    const formatAge = (ageMs: number | null) => {
      if (ageMs === null) return 'age unavailable';
      if (ageMs < 60_000) return 'less than a minute';
      if (ageMs < 3_600_000) return `${Math.floor(ageMs / 60_000)} minute(s)`;
      if (ageMs < 86_400_000) return `${Math.floor(ageMs / 3_600_000)} hour(s)`;
      return `${Math.floor(ageMs / 86_400_000)} day(s)`;
    };

    for (const agent of agents) {
      addCountAlert(
        agent,
        'failed_runs',
        'Failed specialist runs',
        agent.statusCounts.failed ?? 0,
        'runs',
      );
      addCountAlert(
        agent,
        'provider_failures',
        'Failed AI provider calls',
        agent.providerFailureCalls,
        'calls',
      );
      addCountAlert(
        agent,
        'verification_failures',
        'Failed action verifications',
        agent.verificationOutcomes.failed,
        'events',
      );
      const staleEvidenceCount =
        (agent.evidence.freshnessCounts.stale ?? 0) +
        (agent.evidence.freshnessCounts.missing ?? 0);
      addCountAlert(
        agent,
        'stale_or_missing_evidence',
        'Stale or missing saved evidence',
        staleEvidenceCount,
        'records',
      );
      if (agent.openActionAttention.count > 0) {
        alerts.push({
          code: 'open_actions_awaiting_attention',
          agentKey: agent.agentKey,
          agentName: agent.name,
          severity: 'warning',
          observedValue: agent.openActionAttention.count,
          thresholdValue: 0,
          unit: 'records',
          message: `${agent.openActionAttention.count} open material action(s) await attention; oldest last updated ${formatAge(agent.openActionAttention.oldestUpdatedAgeMs)} ago.`,
        });
      }
      if (
        queuedRunWarningAgeMinutes !== null &&
        agent.queuedRuns.count > 0 &&
        agent.queuedRuns.oldestAgeMs !== null &&
        agent.queuedRuns.oldestAgeMs >= queuedRunWarningAgeMinutes * 60_000
      ) {
        alerts.push({
          code: 'queued_run_age',
          agentKey: agent.agentKey,
          agentName: agent.name,
          severity: 'warning',
          observedValue: Math.floor(agent.queuedRuns.oldestAgeMs / 60_000),
          thresholdValue: queuedRunWarningAgeMinutes,
          unit: 'minutes',
          message: `${agent.queuedRuns.count} persisted queued run(s); oldest has been queued for ${formatAge(agent.queuedRuns.oldestAgeMs)}. Check saved run status and deployment queue monitoring.`,
        });
      }
      addBudgetAlert(
        agent,
        'monthly_request_budget',
        agent.monthlyBudget.requestsUsed,
        agent.monthlyBudget.requestLimit,
        'requests',
        'Counted provider requests',
      );
      addBudgetAlert(
        agent,
        'monthly_estimated_spend_budget',
        agent.monthlyBudget.estimatedSpendUsd,
        agent.monthlyBudget.spendLimitUsd,
        'USD',
        'Estimated AI spend',
      );
    }

    if (auditedCrossTenantRunProbeDenials > 0) {
      alerts.push({
        code: 'cross_tenant_probe_denied',
        agentKey: 'security',
        agentName: 'Cross-agent security',
        severity: 'critical',
        observedValue: auditedCrossTenantRunProbeDenials,
        thresholdValue: 0,
        unit: 'events',
        message: `${auditedCrossTenantRunProbeDenials} denied cross-tenant run probe(s) were recorded in this business. Review the security audit log.`,
      });
    }

    if (persistedToolCallRefusals >= 3) {
      alerts.push({
        code: 'repeated_specialist_tool_denials',
        agentKey: 'security',
        agentName: 'Cross-agent security',
        severity: 'warning',
        observedValue: persistedToolCallRefusals,
        thresholdValue: 3,
        unit: 'events',
        message: `${persistedToolCallRefusals} registered specialist tool-call records were refused or blocked in this ${SPECIALIST_OPERATIONS_WINDOW_DAYS}-day window. Review whether the attempts were expected.`,
      });
    }

    alerts.sort(
      (left, right) =>
        Number(right.severity === 'critical') -
        Number(left.severity === 'critical'),
    );

    return {
      scope: 'current_business',
      windowStart: windowStart.toISOString(),
      observedAt: observedAt.toISOString(),
      windowDays: SPECIALIST_OPERATIONS_WINDOW_DAYS,
      orchestrationQueueWait: {
        p50Ms: percentile(orchestrationQueueWaitSamplesMs, 0.5),
        p95Ms: percentile(orchestrationQueueWaitSamplesMs, 0.95),
        sampleCount: orchestrationQueueWaitSamplesMs.length,
        sampleLimit: SPECIALIST_LATENCY_SAMPLE_LIMIT,
        waitingCount: waitingOrchestrations._count._all,
        oldestWaitingAgeMs: waitingOrchestrations._min.createdAt
          ? Math.max(
              0,
              observedAt.getTime() -
                waitingOrchestrations._min.createdAt.getTime(),
            )
          : null,
      },
      agents,
      alerts,
      securityEvents: {
        auditedCrossTenantRunProbeDenials,
        auditedCommerceToolCallBlocks,
        persistedToolCallRefusals,
        auditedCommerceApprovalRefusals,
        auditedCustomerMessageQueueRefusals,
      },
      securityDenials,
      budgetLimitEvents,
      disclosures: [
        'AI cost is the application estimate saved with each AI call, not a provider invoice.',
        'Latency percentiles use finished specialist runs from this window, capped to the 5,000 most recent run rows per business.',
        'Recommendation status counts reflect persisted workflow states; they are not acceptance rates or measured business outcomes.',
        'Successful and failed provider latency percentiles use measured AI provider round trips stored in AiCallLog, each sampled separately and capped at the 5,000 most recent rows in the 30-day window. Failed-call timing is unavailable for failures that occurred before a provider request or did not persist a measured duration. Local processing and queue wait are not included.',
        'Cross-agent queue pickup is measured from the saved parent review row to its first persisted worker pickup, for up to the 5,000 most recent rows in this 30-day window. It is not a queue-depth monitor or an uptime target; waiting count and oldest age cover parent rows not yet picked up.',
        "Per-agent queued-run count and oldest age come from this business's persisted SpecialistAgentRun rows with status queued. They are not live Redis/BullMQ depth, worker-liveness checks, or proof that a job is still present in Redis.",
        'Material-action execution duration is measured from its persisted executing transition to its first terminal execution transition. Approval wait and provider latency are separate; actions without both timestamps are omitted. This is not business impact.',
        'Proposal revision counts include only append-only proposal_updated events on specialist material actions; other recommendation or canonical-record edits are outside this count.',
        'Approval rejection and verification failure shares are calculated from persisted decision/verification events in this 30-day window. Repeated events on one action count separately; these are event shares, not action success rates or business outcomes.',
        'Recorded tool names are the tool/context metadata attached to AI provider-call logs; they do not prove independent external execution. Per-tool elapsed-time samples are available only for completed or failed Commerce registry calls made by the Commerce agent or its internal orchestrations, using the recorded CommerceAgentToolRun duration. Manual user calls, blocked/refused calls, other agents, provider latency, queue wait, and business impact are excluded. The sample is capped at the 5,000 most recent calls in the 30-day window.',
        'Persisted registered tool-call counts come from actual SpecialistAgentToolCall records in this 30-day window. The Commerce specialist loop is the only current producer; the status counts are business-scoped and do not represent provider invoices or comprehensive security monitoring.',
        'Registered tool status counts use saved SpecialistAgentToolCall rows grouped by agent and tool in this 30-day window; elapsed-time percentiles use only succeeded/failed rows with a saved duration, capped at the 5,000 most recent timed calls per business. Status counts are not external execution confirmation; elapsed time is not provider latency or business impact.',
        'Security counters include only audited denied cross-tenant run probes, Commerce unregistered/over-limit tool attempts, Commerce approval refusals after policy recheck, and Customer Agent message-queue refusals. They are not comprehensive security-event monitoring; other permission, stale-data, prompt-injection and policy blocks are not counted here.',
        'Recent security-denial rows include only those four audited action types plus persisted blocked/refused specialist tool calls from this business in the 30-day window. Arbitrary audit payloads and tool inputs are not returned; the list is capped at 50 and is not a complete security-event feed.',
        'Monthly request and spend usage uses the current UTC month. Requests include reserved, failed and abandoned provider attempts; spend is a Haiku 4.5 application estimate from returned tokens plus the maximum reserved amount for pending or failed attempts, not a provider invoice.',
        'Evidence freshness shows the saved freshness labels and source/fetch timestamps on up to the 5,000 most recently fetched specialist evidence records in the 30-day window. It does not re-evaluate freshness, prove complete source coverage, or measure connector availability.',
        'Operational alerts are deterministic signals over saved specialist runs, AI call logs, action verification events, open material actions, sampled evidence freshness and configured monthly AI request/spend limits. A queued-run age warning is optional and uses the current business policy against saved run timestamps; it does not inspect live Redis/BullMQ. Budget bands are 70% and 90%; spend is an application estimate, not an invoice. This does not detect unusual cost spikes, external provider outages, or conditions outside the sampled 30-day evidence window.',
      ],
    };
  }

  /**
   * Owner-permissioned, business-scoped action timeline for support and audit review.
   * Only explicitly selected lifecycle fields are returned; proposed payloads, verification
   * payloads, evidence values and arbitrary event metadata may contain sensitive source data.
   */
  async getSpecialistActionAudit(businessId: string) {
    const observedAt = new Date();
    const windowStart = new Date(
      observedAt.getTime() -
        SPECIALIST_OPERATIONS_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    const actions = await this.prisma.specialistAgentAction.findMany({
      where: { businessId, createdAt: { gte: windowStart, lte: observedAt } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: SPECIALIST_ACTION_AUDIT_LIMIT,
      select: {
        id: true,
        runId: true,
        agentKey: true,
        moduleId: true,
        actionType: true,
        expectedVersion: true,
        canonicalResourceType: true,
        canonicalResourceId: true,
        canonicalOperationId: true,
        correlationId: true,
        state: true,
        riskTier: true,
        reason: true,
        requiredApproval: true,
        requiredApproverRole: true,
        approvalReason: true,
        rejectionReason: true,
        createdByUserId: true,
        approvedByUserId: true,
        executedByUserId: true,
        executionAttemptCount: true,
        errorCode: true,
        createdAt: true,
        updatedAt: true,
        approvedAt: true,
        executedAt: true,
        verifiedAt: true,
        closedAt: true,
        events: {
          where: { businessId },
          orderBy: [{ sequence: 'asc' }],
          take: SPECIALIST_ACTION_AUDIT_EVENTS_PER_ACTION,
          select: {
            eventType: true,
            sequence: true,
            fromState: true,
            toState: true,
            actorUserId: true,
            reason: true,
            createdAt: true,
          },
        },
      },
    });

    return {
      scope: 'current_business' as const,
      windowStart: windowStart.toISOString(),
      observedAt: observedAt.toISOString(),
      actionLimit: SPECIALIST_ACTION_AUDIT_LIMIT,
      eventsPerActionLimit: SPECIALIST_ACTION_AUDIT_EVENTS_PER_ACTION,
      actions,
      disclosure:
        'This audit view includes up to 100 material actions from the last 30 days and up to 50 saved lifecycle events per action. It excludes proposed/actual payloads, evidence values and arbitrary event metadata. Canonical provider receipts are shown only when recorded by the owning module.',
    };
  }

  /** Real per-day counts for the current calendar week (Monday–Sunday), for the AI Settings
   * "Queries this week" chart. MySQL's `WEEKDAY()` returns 0=Monday..6=Sunday directly, matching
   * `WEEKDAY_LABELS`'s order, so no remapping is needed the way `DAYOFWEEK()` needs elsewhere. */
  private async getQueriesThisWeek(
    businessId: string,
  ): Promise<{ day: string; count: number }[]> {
    const now = new Date();
    const isoDow = (now.getUTCDay() + 6) % 7; // 0=Monday..6=Sunday
    const weekStart = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - isoDow,
      ),
    );

    const rows = await this.prisma.$queryRaw<{ dow: number; count: bigint }[]>`
      SELECT WEEKDAY(created_at) AS dow, COUNT(*) AS count
      FROM ai_call_logs
      WHERE business_id = ${businessId} AND created_at >= ${weekStart}
      GROUP BY dow
    `;

    const countByDow = new Map(
      rows.map((r) => [Number(r.dow), Number(r.count)]),
    );
    return WEEKDAY_LABELS.map((day, i) => ({
      day,
      count: countByDow.get(i) ?? 0,
    }));
  }

  async getSettings(businessId: string) {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
    });

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const limitResetsAt = new Date(
      Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1),
    );

    const [grouped, queriesThisWeek] = await Promise.all([
      this.prisma.aiCallLog.groupBy({
        by: ['kind'],
        where: { businessId, createdAt: { gte: monthStart } },
        _sum: { estimatedCostUsd: true },
        _count: { _all: true },
      }),
      this.getQueriesThisWeek(businessId),
    ]);

    const usageByFeature: Record<
      AiFeatureKey,
      { costUsd: number; calls: number }
    > = {} as Record<AiFeatureKey, { costUsd: number; calls: number }>;
    for (const key of AI_FEATURE_KEYS) {
      usageByFeature[key] = { costUsd: 0, calls: 0 };
    }
    let otherCostUsd = 0;
    let otherCalls = 0;

    for (const row of grouped) {
      const cost = Number(row._sum.estimatedCostUsd ?? 0);
      const calls = row._count._all;
      const featureKey = KIND_TO_FEATURE[row.kind];
      if (featureKey) {
        usageByFeature[featureKey].costUsd += cost;
        usageByFeature[featureKey].calls += calls;
      } else {
        otherCostUsd += cost;
        otherCalls += calls;
      }
    }

    const totalCostUsd =
      Object.values(usageByFeature).reduce((sum, u) => sum + u.costUsd, 0) +
      otherCostUsd;
    const totalCalls =
      Object.values(usageByFeature).reduce((sum, u) => sum + u.calls, 0) +
      otherCalls;

    return {
      aiMonthlyCostCapUsd: Number(business.aiMonthlyCostCapUsd),
      aiRateLimitPerMinute: business.aiRateLimitPerMinute,
      aiQueryQuota: business.aiQueryQuota,
      featureToggles: resolveToggles(business.aiFeatureToggles),
      usageThisMonth: {
        byFeature: usageByFeature,
        other: { costUsd: otherCostUsd, calls: otherCalls },
        totalCostUsd,
        totalCalls,
        queryQuotaUsedPercent:
          business.aiQueryQuota > 0
            ? Math.min(
                100,
                Math.round((totalCalls / business.aiQueryQuota) * 100),
              )
            : 0,
        limitResetsAt: limitResetsAt.toISOString(),
      },
      queriesThisWeek,
      disclosureText: AI_USAGE_DISCLOSURE_TEXT,
    };
  }

  async updateSettings(
    businessId: string,
    dto: UpdateAiSettingsDto,
    actorUserId: string | null = null,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM businesses WHERE id = ${businessId} FOR UPDATE`;
      const business = await tx.business.findUniqueOrThrow({
        where: { id: businessId },
        select: {
          policies: true,
          aiFeatureToggles: true,
          aiMonthlyCostCapUsd: true,
          aiRateLimitPerMinute: true,
          aiQueryQuota: true,
        },
      });
      const currentToggles = resolveToggles(business.aiFeatureToggles);
      const nextToggles = dto.featureToggles
        ? { ...currentToggles, ...dto.featureToggles }
        : currentToggles;
      const updateData = {
        ...(dto.aiMonthlyCostCapUsd === undefined
          ? {}
          : { aiMonthlyCostCapUsd: dto.aiMonthlyCostCapUsd }),
        ...(dto.aiRateLimitPerMinute === undefined
          ? {}
          : { aiRateLimitPerMinute: dto.aiRateLimitPerMinute }),
        ...(dto.aiQueryQuota === undefined
          ? {}
          : { aiQueryQuota: dto.aiQueryQuota }),
        aiFeatureToggles: nextToggles,
      };
      await recordSpecialistAgentConfigVersions(
        tx,
        businessId,
        business,
        actorUserId,
      );
      await tx.business.update({
        where: { id: businessId },
        data: updateData,
      });
      await recordSpecialistAgentConfigVersions(
        tx,
        businessId,
        { ...business, ...updateData },
        actorUserId,
      );
    });
    return this.getSettings(businessId);
  }
}
