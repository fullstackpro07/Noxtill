import { apiFetch } from "@/lib/api-client";

export const WORKFLOW_TRIGGER_KEYS = [
  "sale",
  "booking_completed",
  "lapsed_customer",
  "low_stock",
  "review",
  "credit_overdue",
  "birthday",
] as const;
export type WorkflowTriggerKey = (typeof WORKFLOW_TRIGGER_KEYS)[number];

export const WORKFLOW_TRIGGER_LABELS: Record<WorkflowTriggerKey, string> = {
  sale: "A sale is made",
  booking_completed: "A booking is completed",
  lapsed_customer: "A customer lapses",
  low_stock: "Stock runs low",
  review: "A review comes in",
  credit_overdue: "Credit becomes overdue",
  birthday: "A customer's birthday",
};

/** Real fields available per trigger — see backend `workflow-context.util.ts`. */
export const WORKFLOW_TRIGGER_FIELDS: Record<WorkflowTriggerKey, string[]> = {
  sale: ["description", "amount", "customerId", "orderTotal", "orderNo"],
  booking_completed: ["description", "amount", "customerId", "serviceName"],
  lapsed_customer: ["description", "amount", "customerId", "customerName"],
  low_stock: ["description", "amount"],
  review: ["description", "amount", "customerId", "reviewRating"],
  credit_overdue: ["description", "amount", "customerId", "installmentAmount"],
  birthday: ["description", "amount", "customerId", "customerName"],
};

export const WORKFLOW_CONDITION_OPERATORS = ["eq", "neq", "gt", "gte", "lt", "lte", "contains"] as const;
export type WorkflowConditionOperator = (typeof WORKFLOW_CONDITION_OPERATORS)[number];

export const WORKFLOW_CONDITION_OPERATOR_LABELS: Record<WorkflowConditionOperator, string> = {
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

export type WorkflowActionType = "send_customer_message" | "notify_owner";

export interface WorkflowAction {
  type: WorkflowActionType;
  messageBody: string;
}

export interface Workflow {
  id: string;
  name: string;
  triggerKey: WorkflowTriggerKey;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkflowInput {
  name: string;
  triggerKey: WorkflowTriggerKey;
  conditions?: WorkflowCondition[];
  actions?: WorkflowAction[];
}

export interface UpdateWorkflowInput {
  name?: string;
  conditions?: WorkflowCondition[];
  actions?: WorkflowAction[];
  active?: boolean;
}

export function fetchWorkflows(): Promise<Workflow[]> {
  return apiFetch<Workflow[]>("/workflows");
}

export function createWorkflow(input: CreateWorkflowInput): Promise<Workflow> {
  return apiFetch<Workflow>("/workflows", { method: "POST", body: JSON.stringify(input) });
}

export function updateWorkflow(id: string, input: UpdateWorkflowInput): Promise<Workflow> {
  return apiFetch<Workflow>(`/workflows/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteWorkflow(id: string): Promise<void> {
  return apiFetch(`/workflows/${id}`, { method: "DELETE" });
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: "success" | "failed" | "skipped";
  context: Record<string, unknown>;
  result: unknown;
  error: string | null;
  createdAt: string;
}

export function fetchWorkflowRuns(id: string): Promise<WorkflowRun[]> {
  return apiFetch<WorkflowRun[]>(`/workflows/${id}/runs`);
}

export interface WorkflowTestResult {
  workflowId: string;
  triggerKey: WorkflowTriggerKey;
  foundRecentEvent: boolean;
  matched: boolean;
  sourceEventId?: string;
  context: Record<string, unknown> | null;
  wouldExecuteActions: WorkflowAction[];
}

/** POST /workflows/:id/test — real dry run against the most recent matching real activity; never sends anything. */
export function testWorkflow(id: string): Promise<WorkflowTestResult> {
  return apiFetch<WorkflowTestResult>(`/workflows/${id}/test`, { method: "POST" });
}
