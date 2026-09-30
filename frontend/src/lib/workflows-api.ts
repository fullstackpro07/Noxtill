import { apiFetch } from "@/lib/api-client";

export type WorkflowTriggerKey =
  | "sale"
  | "booking_completed"
  | "lapsed_customer"
  | "low_stock"
  | "review"
  | "credit_overdue"
  | "birthday"
  | "payment_received"
  | "complaint_received"
  | "stock_changed"
  | "delivery_created"
  | "delivery_assigned"
  | "delivery_picked_up"
  | "delivery_en_route"
  | "delivery_delivered"
  | "delivery_failed"
  | "delivery_retried"
  | "commerce_validation"
  | "commerce_listing_draft"
  | "seo_issue_detected"
  | "commerce_rfq_created"
  | "commerce_rfq_response_received"
  | "commerce_rfq_awarded"
  | "commerce_supplier_claim_created"
  | "commerce_supplier_claim_settled"
  | "scheduled";

export interface WorkflowTriggerCatalogEntry {
  key: WorkflowTriggerKey;
  label: string;
  module: string;
  mode: "event" | "scheduled";
  fields: string[];
}

export function fetchWorkflowTriggerCatalog(): Promise<
  WorkflowTriggerCatalogEntry[]
> {
  return apiFetch<WorkflowTriggerCatalogEntry[]>("/workflows/triggers");
}

export interface WorkflowActionCatalogEntry {
  type: WorkflowActionType;
  label: string;
  description: string;
  category: "Messaging" | "Customer data" | "Flow control" | "Human control" | "AI" | "Data transformation";
  effect: "external write" | "customer record write" | "control" | "AI generation" | "data transformation";
  risk: "low" | "medium";
  requiresCustomerContext: boolean;
  provider: string;
  setup: string;
  inputs: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }>;
  outputs: Array<{
    name: string;
    type: string;
    description: string;
  }>;
  idempotency: string;
  rateLimits: string;
}

export function fetchWorkflowActionCatalog(): Promise<WorkflowActionCatalogEntry[]> {
  return apiFetch<WorkflowActionCatalogEntry[]>("/workflows/actions");
}

export interface WorkflowTemplatePreview {
  id: string;
  version: number;
  name: string;
  description: string;
  module: string;
  goal: string;
  triggerKey: WorkflowTriggerKey;
  triggerLabel: string;
  conditions: [];
  actions: WorkflowAction[];
  requiredSetup: string[];
  testFixture: {
    context: Record<string, string | number>;
    expectedMessage: string;
  };
  preview: {
    renderedMessages: string[];
    sideEffectsExecuted: false;
    fixtureValid: boolean;
    validationError: string | null;
  };
}

export function fetchWorkflowTemplates(): Promise<WorkflowTemplatePreview[]> {
  return apiFetch<WorkflowTemplatePreview[]>("/workflows/templates");
}

export function installWorkflowTemplate(
  templateId: string,
  name?: string,
): Promise<Workflow> {
  return apiFetch<Workflow>(
    `/workflows/templates/${encodeURIComponent(templateId)}/install`,
    {
      method: "POST",
      body: JSON.stringify(name === undefined ? {} : { name }),
    },
  );
}

export const WORKFLOW_CONDITION_OPERATORS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
] as const;
export type WorkflowConditionOperator =
  (typeof WORKFLOW_CONDITION_OPERATORS)[number];

export const WORKFLOW_CONDITION_OPERATOR_LABELS: Record<
  WorkflowConditionOperator,
  string
> = {
  eq: "is",
  neq: "is not",
  gt: "is greater than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
  contains: "contains",
};

export interface WorkflowCondition {
  field: string;
  operator: WorkflowConditionOperator;
  value: string | number;
}

export type WorkflowConditionMode = "all" | "any";

export type WorkflowAction =
  | {
      type: "send_customer_message" | "notify_owner";
      messageBody: string;
    }
  | {
      type: "add_customer_tag";
      tagName: string;
    }
  | {
      type: "set_customer_custom_field";
      fieldName: string;
      value: string | number | null;
    }
  | {
      type: "wait";
      durationMinutes: number;
    }
  | {
      type: "request_approval";
      title: string;
      description: string;
    }
  | {
      type: "generate_ai_draft";
      prompt: string;
    }
  | {
      type: "map_data";
      mappings: WorkflowDataMappingInput[];
    }
  | {
      type: "get_variable";
      name: string;
      scope: "business" | "workflow";
    };

export type WorkflowActionType = WorkflowAction["type"];

export interface WorkflowGraphEdge {
  source: string;
  target: string;
  port: "next" | "true" | "false";
}

export type WorkflowGraphNode =
  | { id: string; type: "trigger" }
  | { id: string; type: "action"; action: WorkflowAction }
  | {
      id: string;
      type: "condition";
      conditions: WorkflowCondition[];
      conditionMode: WorkflowConditionMode;
    }
  | { id: string; type: "end" };

export interface WorkflowGraph {
  schemaVersion: 1;
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
}

export interface WorkflowGraphExecutionPlan {
  schemaVersion: 1;
  actionIndexes: number[];
  visitedNodeIds: string[];
  decisions: Array<{ nodeId: string; result: "true" | "false" }>;
}

export interface Workflow {
  id: string;
  version: number;
  name: string;
  triggerKey: WorkflowTriggerKey;
  conditions: WorkflowCondition[];
  conditionMode: WorkflowConditionMode;
  scheduleEveryMinutes: number | null;
  scheduleCronExpression: string | null;
  scheduleTimezone: string;
  nextScheduleAt: string | null;
  lastScheduledAt: string | null;
  actions: WorkflowAction[];
  graph?: WorkflowGraph | null;
  active: boolean;
  archivedAt: string | null;
  /** Successful runs; provider delivery is tracked separately on message records. */
  successfulRunCount?: number;
  /** Most recent run of any status, or null if it has never fired. */
  lastFiredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowSummary {
  totalWorkflows: number;
  activeWorkflows: number;
  successfulRuns: number;
  failedRuns: number;
  skippedRuns: number;
  runsLast7Days: number;
  successRate: number | null;
  lastRunAt: string | null;
  unavailableMetrics: { key: string; reason: string }[];
}

export interface WorkflowSchedulePreview {
  mode: "interval" | "cron";
  timezone: string;
  generatedAt: string;
  occurrences: string[];
}

export function previewWorkflowSchedule(input: {
  scheduleEveryMinutes?: number | null;
  scheduleCronExpression?: string | null;
  scheduleTimezone?: string;
}): Promise<WorkflowSchedulePreview> {
  return apiFetch<WorkflowSchedulePreview>("/workflows/schedule-preview", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export const WORKFLOW_DATA_MAPPER_TRANSFORMS = [
  "copy",
  "string",
  "number",
  "boolean",
  "iso_date",
  "trim",
  "lowercase",
  "uppercase",
  "json_string",
] as const;

export type WorkflowDataMapperTransform =
  (typeof WORKFLOW_DATA_MAPPER_TRANSFORMS)[number];

export interface WorkflowDataMappingInput {
  sourcePath: string;
  targetPath: string;
  transform?: WorkflowDataMapperTransform;
  required?: boolean;
  fallback?: unknown;
}

export interface WorkflowDataMapperIssue {
  path: string;
  code: string;
  message: string;
}

export interface WorkflowDataMapperPreview {
  valid: boolean;
  mappedFields: number;
  mappedData: Record<string, unknown>;
  errors: WorkflowDataMapperIssue[];
  warnings: WorkflowDataMapperIssue[];
}

export function previewWorkflowDataMapping(input: {
  source: Record<string, unknown>;
  mappings: WorkflowDataMappingInput[];
}): Promise<WorkflowDataMapperPreview> {
  return apiFetch<WorkflowDataMapperPreview>("/workflows/data-mapper/preview", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type WorkflowVariableScope = "business" | "workflow" | "branch";
export type WorkflowVariableEnvironment = "draft" | "staging" | "production";
export type WorkflowVariableType =
  | "string"
  | "number"
  | "boolean"
  | "json"
  | "secret_reference";

export interface WorkflowVariable {
  id: string;
  scope: WorkflowVariableScope;
  scopeId: string | null;
  environment: WorkflowVariableEnvironment;
  name: string;
  valueType: WorkflowVariableType;
  value: unknown;
  secretReferenceConfigured: boolean;
  description: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowVariablesResult {
  items: WorkflowVariable[];
  total: number;
  hasMore: boolean;
}

export interface WorkflowVariablesQuery {
  scope?: WorkflowVariableScope;
  scopeId?: string;
  environment?: WorkflowVariableEnvironment;
}

export interface SaveWorkflowVariableInput {
  scope: WorkflowVariableScope;
  scopeId?: string | null;
  environment?: WorkflowVariableEnvironment;
  name: string;
  valueType: WorkflowVariableType;
  value?: unknown;
  secretReference?: string;
  description?: string | null;
}

export function fetchWorkflowVariables(
  query: WorkflowVariablesQuery = {},
): Promise<WorkflowVariablesResult> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const suffix = params.size ? `?${params.toString()}` : "";
  return apiFetch<WorkflowVariablesResult>(`/workflows/variables${suffix}`);
}

export function createWorkflowVariable(
  input: SaveWorkflowVariableInput,
): Promise<WorkflowVariable> {
  return apiFetch<WorkflowVariable>("/workflows/variables", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateWorkflowVariable(
  id: string,
  input: Partial<SaveWorkflowVariableInput>,
): Promise<WorkflowVariable> {
  return apiFetch<WorkflowVariable>(
    `/workflows/variables/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export function deleteWorkflowVariable(id: string): Promise<{ deleted: true }> {
  return apiFetch<{ deleted: true }>(
    `/workflows/variables/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export interface CreateWorkflowInput {
  name: string;
  triggerKey: WorkflowTriggerKey;
  conditions?: WorkflowCondition[];
  conditionMode?: WorkflowConditionMode;
  scheduleEveryMinutes?: number | null;
  scheduleCronExpression?: string | null;
  scheduleTimezone?: string;
  actions?: WorkflowAction[];
  graph?: WorkflowGraph;
}

export interface UpdateWorkflowInput {
  expectedVersion?: number;
  expectedUpdatedAt?: string;
  name?: string;
  conditions?: WorkflowCondition[];
  conditionMode?: WorkflowConditionMode;
  scheduleEveryMinutes?: number | null;
  scheduleCronExpression?: string | null;
  scheduleTimezone?: string;
  actions?: WorkflowAction[];
  graph?: WorkflowGraph | null;
  active?: boolean;
}

export function fetchWorkflows(includeArchived = false): Promise<Workflow[]> {
  return apiFetch<Workflow[]>(
    `/workflows${includeArchived ? "?includeArchived=true" : ""}`,
  );
}

export function archiveWorkflow(id: string): Promise<Workflow> {
  return apiFetch<Workflow>(`/workflows/${id}/archive`, { method: "POST" });
}

export function restoreWorkflow(id: string): Promise<Workflow> {
  return apiFetch<Workflow>(`/workflows/${id}/restore`, { method: "POST" });
}

export function duplicateWorkflow(id: string): Promise<Workflow> {
  return apiFetch<Workflow>(`/workflows/${id}/duplicate`, { method: "POST" });
}

export function fetchWorkflowSummary(): Promise<WorkflowSummary> {
  return apiFetch<WorkflowSummary>("/workflows/summary");
}

export interface WorkflowApproval {
  id: string;
  workflowId: string;
  workflowRunId: string;
  actionIndex: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  title: string;
  description: string;
  payload: {
    workflowId: string;
    workflowVersion: number;
    triggerKey: string;
    title: string;
    description: string;
    steps: Array<{ type: string; summary: string }>;
  };
  workflow: { name: string };
  workflowRun: { createdAt: string };
  requestedAt: string;
  decidedAt: string | null;
}

export function fetchWorkflowApprovals(
  status: WorkflowApproval["status"] = "pending",
): Promise<WorkflowApproval[]> {
  return apiFetch<WorkflowApproval[]>(`/workflows/approvals?status=${status}`);
}

export function decideWorkflowApproval(
  approvalId: string,
  decision: "approve" | "reject",
  comment?: string,
): Promise<WorkflowApproval> {
  return apiFetch<WorkflowApproval>(
    `/workflows/approvals/${approvalId}/${decision}`,
    { method: "POST", body: JSON.stringify({ comment }) },
  );
}

export function createWorkflow(input: CreateWorkflowInput): Promise<Workflow> {
  return apiFetch<Workflow>("/workflows", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateWorkflow(
  id: string,
  input: UpdateWorkflowInput,
): Promise<Workflow> {
  return apiFetch<Workflow>(`/workflows/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteWorkflow(id: string): Promise<void> {
  return apiFetch(`/workflows/${id}`, { method: "DELETE" });
}

export type WorkflowRunStatus =
  | "running"
  | "waiting"
  | "success"
  | "failed"
  | "skipped"
  | "cancelled";

export interface WorkflowRun {
  id: string;
  workflowId: string;
  workflowVersion: number;
  triggerEventId: string | null;
  status: WorkflowRunStatus;
  context: Record<string, unknown>;
  result: unknown;
  error: string | null;
  retryCount: number;
  waitingUntil?: string | null;
  nextActionIndex?: number | null;
  executionPlan?: WorkflowGraphExecutionPlan | null;
  nextPlanPosition?: number | null;
  attempts?: WorkflowRunAttempt[];
  workflow?: Pick<Workflow, "id" | "name" | "triggerKey" | "active">;
  createdAt: string;
}

export interface WorkflowRunAttempt {
  id: string;
  attemptNumber: number;
  status: WorkflowRunStatus;
  result: unknown;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export type WorkflowRunSummary = Pick<
  WorkflowRun,
  | "id"
  | "workflowId"
  | "workflowVersion"
  | "triggerEventId"
  | "status"
  | "waitingUntil"
  | "retryCount"
  | "workflow"
  | "createdAt"
>;

export const MAX_WORKFLOW_RETRIES = 2;

export interface WorkflowRunsPage {
  items: WorkflowRunSummary[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface WorkflowRunsQuery {
  status?: WorkflowRunStatus;
  workflowId?: string;
  cursor?: string;
  from?: string;
  to?: string;
  take?: number;
}

export function fetchWorkflowRunsPage(
  query: WorkflowRunsQuery = {},
): Promise<WorkflowRunsPage> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const suffix = params.size ? `?${params.toString()}` : "";
  return apiFetch<WorkflowRunsPage>(`/workflows/runs${suffix}`);
}

export function fetchWorkflowRunDetails(id: string): Promise<WorkflowRun> {
  return apiFetch<WorkflowRun>(`/workflows/runs/${encodeURIComponent(id)}`);
}

export function fetchWorkflowRuns(id: string): Promise<WorkflowRun[]> {
  return apiFetch<WorkflowRun[]>(`/workflows/${id}/runs`);
}

export function retryWorkflowRun(
  workflowId: string,
  runId: string,
): Promise<WorkflowRun> {
  return apiFetch<WorkflowRun>(`/workflows/${workflowId}/runs/${runId}/retry`, {
    method: "POST",
  });
}

export function cancelWorkflowRun(
  workflowId: string,
  runId: string,
): Promise<WorkflowRun> {
  return apiFetch<WorkflowRun>(
    `/workflows/${workflowId}/runs/${runId}/cancel`,
    {
      method: "POST",
    },
  );
}

export type WorkflowDeadLetterStatus = "open" | "resolved" | "dismissed";
export type WorkflowDeadLetterNextAction = "retry" | "manual_review";
export type WorkflowDeadLetterDecisionAction =
  | "created"
  | "refreshed"
  | "retry_started"
  | "retry_succeeded"
  | "retry_failed"
  | "resolved"
  | "dismissed";

export interface WorkflowDeadLetterEvidence {
  schemaVersion: number;
  workflowRunId: string;
  workflowVersion: number;
  retryCount: number;
  attemptNumber: number;
  failureCode: string;
  error: string | null;
  failedActions: Array<{
    actionIndex: number | null;
    type: string | null;
    retryable: boolean;
    error: string | null;
  }>;
}

export interface WorkflowDeadLetter {
  id: string;
  workflowId: string;
  workflowRunId: string;
  ownerUserId: string | null;
  ownerRole: string;
  status: WorkflowDeadLetterStatus;
  nextAction: WorkflowDeadLetterNextAction;
  failureCode: string;
  evidence: WorkflowDeadLetterEvidence;
  operatorRetryCount: number;
  resolutionReason: string | null;
  resolvedAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
  updatedAt: string;
  ownerUser: { id: string; name: string } | null;
  workflow: { id: string; name: string; triggerKey: WorkflowTriggerKey };
  workflowRun: {
    id: string;
    status: WorkflowRunStatus;
    workflowVersion: number;
    retryCount: number;
    attempts: Array<{
      id: string;
      attemptNumber: number;
      status: WorkflowRunStatus;
      startedAt: string;
      finishedAt: string | null;
    }>;
  };
  decisions?: Array<{
    id: string;
    actorUserId: string | null;
    action: WorkflowDeadLetterDecisionAction;
    reason: string | null;
    before: unknown;
    after: unknown;
    createdAt: string;
    actorUser: { id: string; name: string } | null;
  }>;
}

export function fetchWorkflowDeadLetters(
  status: WorkflowDeadLetterStatus = "open",
): Promise<WorkflowDeadLetter[]> {
  return apiFetch<WorkflowDeadLetter[]>(
    `/workflows/recovery/dead-letters?status=${encodeURIComponent(status)}`,
  );
}

export function fetchWorkflowDeadLetter(
  id: string,
): Promise<WorkflowDeadLetter> {
  return apiFetch<WorkflowDeadLetter>(
    `/workflows/recovery/dead-letters/${encodeURIComponent(id)}`,
  );
}

function decideWorkflowDeadLetter(
  id: string,
  action: "retry" | "resolve" | "dismiss",
  reason: string,
): Promise<WorkflowDeadLetter> {
  return apiFetch<WorkflowDeadLetter>(
    `/workflows/recovery/dead-letters/${encodeURIComponent(id)}/${action}`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}

export const retryWorkflowDeadLetter = (id: string, reason: string) =>
  decideWorkflowDeadLetter(id, "retry", reason);

export const resolveWorkflowDeadLetter = (id: string, reason: string) =>
  decideWorkflowDeadLetter(id, "resolve", reason);

export const dismissWorkflowDeadLetter = (id: string, reason: string) =>
  decideWorkflowDeadLetter(id, "dismiss", reason);

export interface WorkflowVersion {
  id: string;
  workflowId: string;
  version: number;
  name: string;
  triggerKey: WorkflowTriggerKey;
  scheduleEveryMinutes: number | null;
  scheduleCronExpression: string | null;
  scheduleTimezone: string;
  conditions: WorkflowCondition[];
  conditionMode: WorkflowConditionMode;
  actions: WorkflowAction[];
  graph?: WorkflowGraph | null;
  createdAt: string;
}

export function fetchWorkflowVersions(id: string): Promise<WorkflowVersion[]> {
  return apiFetch<WorkflowVersion[]>(`/workflows/${id}/versions`);
}

export function restoreWorkflowVersion(
  id: string,
  version: number,
  precondition: {
    expectedVersion: number;
    expectedUpdatedAt: string;
    reason: string;
  },
): Promise<Workflow> {
  return apiFetch<Workflow>(
    `/workflows/${encodeURIComponent(id)}/versions/${version}/restore`,
    { method: "POST", body: JSON.stringify(precondition) },
  );
}

export interface WorkflowTestResult {
  workflowId: string;
  triggerKey: WorkflowTriggerKey;
  foundRecentEvent: boolean;
  matched: boolean;
  sourceEventId?: string;
  context: Record<string, unknown> | null;
  wouldExecuteActions: WorkflowAction[];
  selectedActionIndexes?: number[];
  actionPreviews: {
    actionIndex: number;
    body: string | null;
    error: string | null;
    output?: Record<string, unknown>;
  }[];
  executionPlan?: WorkflowGraphExecutionPlan;
}

/** POST /workflows/:id/test — real dry run against the most recent matching real activity; never sends anything. */
export function testWorkflow(id: string): Promise<WorkflowTestResult> {
  return apiFetch<WorkflowTestResult>(`/workflows/${id}/test`, {
    method: "POST",
  });
}
