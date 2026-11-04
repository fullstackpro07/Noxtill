import { apiFetch } from "@/lib/api-client";

export interface AiFeatureToggles {
  voiceEntry: boolean;
  voiceQualityAssist: boolean;
  voiceMeetingSummary: boolean;
  photoDigitizer: boolean;
  reviewReplies: boolean;
  campaignCopy: boolean;
  insights: boolean;
  whatIf: boolean;
  assistant: boolean;
  workflowAgents: boolean;
}

export interface AiFeatureUsage {
  costUsd: number;
  calls: number;
}

export interface AiQueryDay {
  day: string;
  count: number;
}

export interface AiSettings {
  aiMonthlyCostCapUsd: number;
  aiRateLimitPerMinute: number;
  aiQueryQuota: number;
  featureToggles: AiFeatureToggles;
  usageThisMonth: {
    byFeature: Record<keyof AiFeatureToggles, AiFeatureUsage>;
    other: AiFeatureUsage;
    totalCostUsd: number;
    totalCalls: number;
    queryQuotaUsedPercent: number;
    limitResetsAt: string;
  };
  queriesThisWeek: AiQueryDay[];
  disclosureText: string;
}

export interface SpecialistAgentOperationsAgent {
  agentKey: string;
  moduleId: string;
  name: string;
  totalRuns: number;
  uniqueOperators: number;
  totalRecommendations: number;
  statusCounts: Record<string, number>;
  recommendationStatusCounts: Record<string, number>;
  actionStateCounts: Record<string, number>;
  openActionAttention: {
    count: number;
    oldestUpdatedAgeMs: number | null;
  };
  actionTypes: {
    actionType: string;
    count: number;
    stateCounts: Record<string, number>;
    executionAttempts: number;
    executionLatency: {
      p50Ms: number | null;
      p95Ms: number | null;
      sampleCount: number;
      sampleLimit: number;
    };
  }[];
  actionExecutionAttempts: number;
  actionExecutionLatency: {
    p50Ms: number | null;
    p95Ms: number | null;
    sampleCount: number;
    sampleLimit: number;
  };
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
  persistedToolCalls: {
    total: number;
    statusCounts: Record<string, number>;
  };
  registeredToolExecutionByKey: {
    toolKey: string;
    p50Ms: number | null;
    p95Ms: number | null;
    sampleCount: number;
    sampleLimit: number;
  }[];
  toolExecutionByKey: {
    toolKey: string;
    p50Ms: number | null;
    p95Ms: number | null;
    sampleCount: number;
    sampleLimit: number;
  }[];
  activeRuns: { count: number; oldestAgeMs: number | null };
  triggerCounts: Record<string, number>;
  failuresByCode: { code: string; count: number }[];
  unclassifiedFailures: number;
  finishedRunLatency: {
    p50Ms: number | null;
    p95Ms: number | null;
    sampleCount: number;
    sampleLimit: number;
  };
  providerLatency: {
    p50Ms: number | null;
    p95Ms: number | null;
    sampleCount: number;
    sampleLimit: number;
  };
  providerFailureLatency: {
    p50Ms: number | null;
    p95Ms: number | null;
    sampleCount: number;
    sampleLimit: number;
  };
  providerFailureCalls: number;
  providerFailureCodes: { code: string; count: number }[];
  evidence: {
    sampledRecords: number;
    freshnessCounts: Record<string, number>;
    sourceTypeCounts: Record<string, number>;
    latestFetchedAt: string | null;
    latestFetchObservedAt: string | null;
    sampleLimit: number;
  };
  monthlyBudget?: {
    monthStart: string;
    requestsUsed: number;
    requestLimit: number | null;
    estimatedSpendUsd: number;
    spendLimitUsd: number | null;
    reservedSpendUsd: number;
  };
  aiUsage: {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  };
}

export interface SpecialistAgentOperations {
  scope: "current_business";
  windowStart: string;
  observedAt: string;
  windowDays: number;
  orchestrationQueueWait?: {
    p50Ms: number | null;
    p95Ms: number | null;
    sampleCount: number;
    sampleLimit: number;
    waitingCount: number;
    oldestWaitingAgeMs: number | null;
  };
  alerts?: {
    code: string;
    agentKey: string;
    agentName: string;
    severity: "warning" | "critical";
    observedValue: number;
    thresholdValue: number | null;
    unit: "runs" | "calls" | "events" | "records" | "requests" | "USD";
    message: string;
  }[];
  agents: SpecialistAgentOperationsAgent[];
  securityEvents: {
    auditedCrossTenantRunProbeDenials: number;
    auditedCommerceToolCallBlocks: number;
    persistedToolCallRefusals: number;
    auditedCommerceApprovalRefusals: number;
    auditedCustomerMessageQueueRefusals: number;
  };
  securityDenials: {
    id: string;
    source: "audit_log" | "tool_call";
    event: string;
    occurredAt: string;
    actorUserId: string | null;
    agentKey: string | null;
    toolKey: string | null;
    status: string | null;
    errorCode: string | null;
    correlationId: string | null;
    targetType: string;
    targetId: string;
  }[];
  budgetLimitEvents: {
    id: string;
    agentKey: string;
    event: "agent.budget.limit_reached";
    occurredAt: string;
    targetId: string;
    limitCode: string;
  }[];
  disclosures: string[];
}

export type SpecialistAgentRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "partial"
  | "failed"
  | "cancel_requested"
  | "cancelled";

export interface SpecialistAgentRunSummary {
  id: string;
  agentKey: string;
  agentVersion: string;
  agentConfigVersion: number | null;
  moduleId: string;
  triggerType: string;
  status: SpecialistAgentRunStatus;
  errorCode: string | null;
  detailsExpired: boolean;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
  relatedCounts: {
    recommendations: number;
    evidence: number;
    actions: number;
    toolCalls: number;
  };
  outputRedacted: true;
  detailLocation: "canonical_module";
}

export interface SpecialistAgentRunList {
  items: SpecialistAgentRunSummary[];
  nextCursor: string | null;
  pageSize: number;
}

export interface SpecialistAgentConfigurationVersion {
  id: string;
  agentKey: string;
  version: number;
  configHash: string;
  configuration: Record<string, unknown>;
  changedByUserId: string | null;
  createdAt: string;
}

export interface SpecialistAgentConfigurationHistory {
  agentKey: string;
  items: SpecialistAgentConfigurationVersion[];
  limit: number;
  hasMore: boolean;
}

export interface SpecialistAgentRunEvidenceReference {
  id: string;
  recommendationId: string | null;
  sourceType: string;
  resourceType: string;
  resourceId: string;
  fieldRefs: unknown;
  observedAt: string;
  fetchedAt: string;
  freshness: string;
}

export interface SpecialistAgentRunEvidenceList {
  items: SpecialistAgentRunEvidenceReference[];
  nextCursor: string | null;
  pageSize: number;
  observedValuesRedacted: true;
}

export interface SpecialistAgentRunEvent {
  eventId: string;
  eventName: string;
  occurredAt: string;
  sourceModule: string;
  entityId: string;
  entityVersion: string | null;
  schemaVersion: number;
  correlationId: string;
  actorUserId: string | null;
  payload: Record<string, unknown>;
}

export interface SpecialistAgentRunEventList {
  runId: string;
  items: SpecialistAgentRunEvent[];
  eventHistoryNote: string;
  nextCursor: string | null;
  hasMore: boolean;
  pageSize: number;
  payloadValuesRedacted: true;
}

export interface SpecialistAgentToolCallRecord {
  id: string;
  agentKey: string;
  moduleId: string;
  toolKey: string;
  toolVersion: number;
  round: number;
  sequence: number;
  status: string;
  inputSha256: string;
  inputFields: unknown;
  outputResourceType: string | null;
  outputResourceId: string | null;
  durationMs: number | null;
  retryable: boolean;
  errorCode: string | null;
  correlationId: string;
  createdAt: string;
  finishedAt: string | null;
}

export interface SpecialistAgentToolCallList {
  items: SpecialistAgentToolCallRecord[];
  pageSize: number;
  hasMore: boolean;
  inputValuesRedacted: true;
  outputValuesRedacted: true;
}

export interface SpecialistActionAuditEvent {
  eventType: string;
  sequence: number;
  fromState: string | null;
  toState: string | null;
  actorUserId: string | null;
  reason: string | null;
  createdAt: string;
}

export interface SpecialistActionAuditRecord {
  id: string;
  runId: string;
  agentKey: string;
  moduleId: string;
  actionType: string;
  expectedVersion: number | null;
  canonicalResourceType: string;
  canonicalResourceId: string;
  canonicalOperationId: string | null;
  correlationId: string;
  state: string;
  riskTier: string;
  reason: string;
  requiredApproval: boolean;
  requiredApproverRole: string | null;
  approvalReason: string | null;
  rejectionReason: string | null;
  createdByUserId: string | null;
  approvedByUserId: string | null;
  executedByUserId: string | null;
  executionAttemptCount: number;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  executedAt: string | null;
  verifiedAt: string | null;
  closedAt: string | null;
  events: SpecialistActionAuditEvent[];
}

export interface SpecialistActionAudit {
  scope: "current_business";
  windowStart: string;
  observedAt: string;
  actionLimit: number;
  eventsPerActionLimit: number;
  actions: SpecialistActionAuditRecord[];
  disclosure: string;
}

export interface SpecialistOrchestrationChild {
  agentKey: string;
  moduleId: string;
  name: string;
  status: "completed" | "partially_succeeded" | "failed" | "running" | "skipped";
  runId: string | null;
  reasonCode: string | null;
}

export interface SpecialistOrchestrationResult {
  summary: string;
  correlationId: string;
  children: SpecialistOrchestrationChild[];
  completedCount: number;
  partialCount: number;
  failedCount: number;
  skippedCount: number;
  runningCount: number;
  observedAt: string;
  execution: "sequential_read_only";
  aiProviderCalls: 0;
}

export interface SpecialistOrchestrationRun {
  id: string;
  status: string;
  createdAt: string;
  finishedAt: string | null;
  errorCode: string | null;
  result: SpecialistOrchestrationResult | null;
  reused?: boolean;
}

export function fetchAiSettings(): Promise<AiSettings> {
  return apiFetch<AiSettings>("/ai/settings");
}

export function fetchSpecialistAgentOperations(): Promise<SpecialistAgentOperations> {
  return apiFetch<SpecialistAgentOperations>("/ai/specialist-operations");
}

export function fetchSpecialistAgentRuns(input: {
  agentKey?: string;
  status?: SpecialistAgentRunStatus;
  cursor?: string;
}): Promise<SpecialistAgentRunList> {
  const query = new URLSearchParams({ limit: "25" });
  if (input.agentKey) query.set("agentKey", input.agentKey);
  if (input.status) query.set("status", input.status);
  if (input.cursor) query.set("cursor", input.cursor);
  return apiFetch<SpecialistAgentRunList>(`/agent-runs?${query.toString()}`);
}

export function fetchSpecialistAgentConfigurationHistory(
  agentKey: string,
): Promise<SpecialistAgentConfigurationHistory> {
  return apiFetch<SpecialistAgentConfigurationHistory>(
    `/agents/${encodeURIComponent(agentKey)}/configuration-history?limit=20`,
  );
}

export function fetchSpecialistAgentRunEvidence(
  runId: string,
): Promise<SpecialistAgentRunEvidenceList> {
  return apiFetch<SpecialistAgentRunEvidenceList>(
    `/agent-runs/${encodeURIComponent(runId)}/evidence`,
  );
}

export function fetchSpecialistAgentRunEvents(
  runId: string,
  cursor?: string,
): Promise<SpecialistAgentRunEventList> {
  const query = new URLSearchParams({ limit: "25" });
  if (cursor) query.set("cursor", cursor);
  return apiFetch<SpecialistAgentRunEventList>(
    `/agent-runs/${encodeURIComponent(runId)}/events?${query.toString()}`,
  );
}

export function fetchSpecialistAgentRunToolCalls(
  runId: string,
): Promise<SpecialistAgentToolCallList> {
  return apiFetch<SpecialistAgentToolCallList>(
    `/agent-runs/${encodeURIComponent(runId)}/tool-calls`,
  );
}

export function fetchSpecialistActionAudit(): Promise<SpecialistActionAudit> {
  return apiFetch<SpecialistActionAudit>("/ai/specialist-operations/audit");
}

export type SpecialistActionDecisionInput = {
  expectedVersion?: number;
  expectedPayloadHash?: string;
  expectedCountsHash?: string;
  reason?: string;
};

export function decideSpecialistAgentAction(
  actionId: string,
  operation: "approve" | "reject" | "execute" | "cancel" | "source-rfq",
  input?: SpecialistActionDecisionInput,
): Promise<unknown> {
  return apiFetch(`/agent-actions/${encodeURIComponent(actionId)}/${operation}`, {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export function downloadSpecialistActionAuditCsv(audit: SpecialistActionAudit): void {
  const columns = [
    "action_id", "run_id", "agent_key", "module_id", "action_type", "expected_version", "resource_type",
    "resource_id", "canonical_operation_id", "correlation_id", "state", "risk_tier",
    "reason", "approval_required", "required_approver_role", "approval_reason",
    "rejection_reason", "created_by_user_id", "approved_by_user_id", "executed_by_user_id",
    "execution_attempt_count", "error_code", "action_created_at", "action_updated_at",
    "approved_at", "executed_at", "verified_at", "closed_at", "event_type",
    "event_sequence", "from_state", "to_state", "event_actor_user_id", "event_reason",
    "event_created_at",
  ];
  const rows = audit.actions.flatMap((action) => {
    const events = action.events.length ? action.events : [null];
    return events.map((event) => [
      action.id, action.runId, action.agentKey, action.moduleId, action.actionType, action.expectedVersion,
      action.canonicalResourceType, action.canonicalResourceId, action.canonicalOperationId,
      action.correlationId, action.state, action.riskTier, action.reason, action.requiredApproval,
      action.requiredApproverRole, action.approvalReason, action.rejectionReason,
      action.createdByUserId, action.approvedByUserId, action.executedByUserId,
      action.executionAttemptCount, action.errorCode, action.createdAt, action.updatedAt,
      action.approvedAt, action.executedAt, action.verifiedAt, action.closedAt,
      event?.eventType, event?.sequence, event?.fromState, event?.toState,
      event?.actorUserId, event?.reason, event?.createdAt,
    ]);
  });
  const csv = [columns, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `specialist-action-audit-${audit.observedAt.slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(href);
}

export function fetchSpecialistOrchestrations(): Promise<{
  scope: "current_business";
  runs: SpecialistOrchestrationRun[];
}> {
  return apiFetch<{
    scope: "current_business";
    runs: SpecialistOrchestrationRun[];
  }>("/ai/specialist-orchestrations");
}

export function runSpecialistOrchestration(
  idempotencyKey: string,
): Promise<SpecialistOrchestrationRun> {
  return apiFetch<SpecialistOrchestrationRun>("/ai/specialist-orchestrations", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
  });
}

export function retryFailedSpecialistOrchestration(
  runId: string,
  idempotencyKey: string,
): Promise<SpecialistOrchestrationRun> {
  return apiFetch<SpecialistOrchestrationRun>(
    `/ai/specialist-orchestrations/${encodeURIComponent(runId)}/retry-failed`,
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
    },
  );
}

export function cancelSpecialistOrchestration(
  runId: string,
): Promise<SpecialistOrchestrationRun> {
  return apiFetch<SpecialistOrchestrationRun>(
    `/ai/specialist-orchestrations/${encodeURIComponent(runId)}/cancel`,
    { method: "POST" },
  );
}

export interface UpdateAiSettingsInput {
  aiMonthlyCostCapUsd?: number;
  aiRateLimitPerMinute?: number;
  aiQueryQuota?: number;
  featureToggles?: Partial<AiFeatureToggles>;
}

export function updateAiSettings(
  input: UpdateAiSettingsInput,
): Promise<AiSettings> {
  return apiFetch<AiSettings>("/ai/settings", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
