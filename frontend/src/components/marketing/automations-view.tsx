"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Copy, RotateCcw, Trash2 } from "lucide-react";
import {
  fetchWorkflows,
  fetchWorkflowSummary,
  createWorkflow,
  updateWorkflow,
  testWorkflow,
  fetchWorkflowTriggerCatalog,
  fetchWorkflowActionCatalog,
  WORKFLOW_CONDITION_OPERATORS,
  WORKFLOW_CONDITION_OPERATOR_LABELS,
  fetchWorkflowRuns,
  retryWorkflowRun,
  cancelWorkflowRun,
  fetchWorkflowApprovals,
  decideWorkflowApproval,
  MAX_WORKFLOW_RETRIES,
  fetchWorkflowVersions,
  restoreWorkflowVersion,
  previewWorkflowSchedule,
  archiveWorkflow,
  restoreWorkflow,
  duplicateWorkflow,
  type Workflow,
  type WorkflowRun,
  type WorkflowVersion,
  type WorkflowCondition,
  type WorkflowConditionMode,
  type WorkflowAction,
  type WorkflowTriggerKey,
  type WorkflowActionType,
  type WorkflowGraph,
  type WorkflowGraphNode,
  type WorkflowTestResult,
  type WorkflowTriggerCatalogEntry,
  type WorkflowSchedulePreview,
  type WorkflowApproval,
  type WorkflowDataMappingInput,
  type WorkflowDataMapperTransform,
  WORKFLOW_DATA_MAPPER_TRANSFORMS,
} from "@/lib/workflows-api";
import { ApiError } from "@/lib/api-client";
import { fetchCustomerCustomFields } from "@/lib/customer-custom-fields-api";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import { askConfirm } from "@/lib/ask-dialog";

const CONDITION_OP_SYMBOL: Record<string, string> = {
  eq: "is",
  neq: "is not",
  gt: "is greater than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
  contains: "contains",
};

interface SimpleGraphDraft {
  branchConditions: WorkflowCondition[];
  branchMode: WorkflowConditionMode;
  trueActions: WorkflowAction[];
  falseActions: WorkflowAction[];
  hasBranch: boolean;
}

function compileWorkflowGraph(
  conditions: WorkflowCondition[],
  conditionMode: WorkflowConditionMode,
  trueActions: WorkflowAction[],
  falseActions: WorkflowAction[],
): WorkflowGraph {
  const nodes: WorkflowGraphNode[] = [{ id: "trigger", type: "trigger" }];
  const edges: WorkflowGraph["edges"] = [];
  const branch = conditions.length > 0;
  const startId = branch ? "condition" : "trigger";
  if (branch) {
    nodes.push({
      id: startId,
      type: "condition",
      conditions,
      conditionMode,
    });
    edges.push({ source: "trigger", target: startId, port: "next" });
  }

  const addLane = (
    lane: "steps" | "true" | "false",
    actions: WorkflowAction[],
  ) => {
    let previousId = startId;
    actions.forEach((action, index) => {
      const id = `${lane}_${index}`;
      nodes.push({ id, type: "action", action });
      edges.push({
        source: previousId,
        target: id,
        port:
          branch && previousId === "condition"
            ? (lane as "true" | "false")
            : "next",
      });
      previousId = id;
    });
    const endId = `${lane}_end`;
    nodes.push({ id: endId, type: "end" });
    edges.push({
      source: previousId,
      target: endId,
      port:
        branch && previousId === "condition"
          ? (lane as "true" | "false")
          : "next",
    });
  };

  if (branch) {
    addLane("true", trueActions);
    addLane("false", falseActions);
  } else {
    addLane("steps", trueActions);
  }
  return { schemaVersion: 1, nodes, edges };
}

function parseSimpleWorkflowGraph(
  graph: WorkflowGraph | null | undefined,
): SimpleGraphDraft | null {
  if (!graph || graph.schemaVersion !== 1) return null;
  const trigger = graph.nodes.find((node) => node.type === "trigger");
  const conditionNodes = graph.nodes.filter(
    (node) => node.type === "condition",
  );
  if (!trigger || conditionNodes.length > 1) return null;
  const visited = new Set<string>([trigger.id]);
  const follow = (
    source: string,
    port: "next" | "true" | "false",
  ): WorkflowAction[] | null => {
    const first = graph.edges.find(
      (edge) => edge.source === source && edge.port === port,
    );
    if (!first) return null;
    let currentId = first.target;
    const actions: WorkflowAction[] = [];
    for (let count = 0; count <= graph.nodes.length; count += 1) {
      if (visited.has(currentId)) return null;
      visited.add(currentId);
      const node = graph.nodes.find((candidate) => candidate.id === currentId);
      if (!node) return null;
      if (node.type === "end") return actions;
      if (node.type !== "action") return null;
      actions.push(node.action);
      const next = graph.edges.find(
        (edge) => edge.source === currentId && edge.port === "next",
      );
      if (!next) return null;
      currentId = next.target;
    }
    return null;
  };

  const condition = conditionNodes[0];
  let trueActions: WorkflowAction[];
  let falseActions: WorkflowAction[] = [];
  let branchConditions: WorkflowCondition[] = [];
  let branchMode: WorkflowConditionMode = "all";
  if (condition?.type === "condition") {
    const conditionEdge = graph.edges.find(
      (edge) => edge.source === trigger.id && edge.port === "next",
    );
    if (!conditionEdge || conditionEdge.target !== condition.id) return null;
    visited.add(condition.id);
    branchConditions = condition.conditions;
    branchMode = condition.conditionMode;
    const truePath = follow(condition.id, "true");
    const falsePath = follow(condition.id, "false");
    if (!truePath || !falsePath) return null;
    trueActions = truePath;
    falseActions = falsePath;
  } else {
    const path = follow(trigger.id, "next");
    if (!path) return null;
    trueActions = path;
  }
  if (visited.size !== graph.nodes.length) return null;
  return {
    branchConditions,
    branchMode,
    trueActions,
    falseActions,
    hasBranch: Boolean(condition),
  };
}

function describeConditions(w: Workflow): string {
  if (w.graph) {
    const branchCount = w.graph.nodes.filter(
      (node) => node.type === "condition",
    ).length;
    return branchCount > 0
      ? `${branchCount} condition branch${branchCount === 1 ? "" : "es"}`
      : "Graph path";
  }
  if (w.conditions.length === 0) return "Always";
  return w.conditions
    .map(
      (c) =>
        `${c.field} ${CONDITION_OP_SYMBOL[c.operator] ?? c.operator} ${c.value}`,
    )
    .join(w.conditionMode === "any" ? " OR " : " AND ");
}
function describeAction(action: WorkflowAction): string {
  if (action.type === "notify_owner") return "Notify Owner";
  if (action.type === "add_customer_tag") {
    return `Add customer tag: ${action.tagName.trim()}`;
  }
  if (action.type === "wait") return `Wait ${action.durationMinutes} minutes`;
  if (action.type === "request_approval") return `Approval: ${action.title}`;
  if (action.type === "generate_ai_draft") return "Generate AI draft";
  if (action.type === "map_data") return "Map event data";
  if (action.type === "get_variable") return `Get variable: ${action.name || "choose a variable"}`;
  if (action.type === "set_customer_custom_field") {
    return `Set customer field: ${action.fieldName || "choose a field"}`;
  }
  return "Send Message";
}

function describeActions(w: Workflow): string {
  if (w.graph) {
    const actionCount = w.graph.nodes.filter(
      (node) => node.type === "action",
    ).length;
    return `${actionCount} graph action${actionCount === 1 ? "" : "s"}`;
  }
  return w.actions.map(describeAction).join(" + ");
}

function formatScheduleTime(value: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: timezone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function replaceActionType(
  action: WorkflowAction,
  type: WorkflowActionType,
): WorkflowAction {
  if (type === "add_customer_tag") {
    return {
      type,
      tagName: action.type === "add_customer_tag" ? action.tagName : "",
    };
  }
  if (type === "wait") {
    return {
      type,
      durationMinutes: action.type === "wait" ? action.durationMinutes : 5,
    };
  }
  if (type === "set_customer_custom_field") {
    return {
      type,
      fieldName:
        action.type === "set_customer_custom_field" ? action.fieldName : "",
      value: action.type === "set_customer_custom_field" ? action.value : "",
    };
  }
  if (type === "request_approval") {
    return {
      type,
      title:
        action.type === "request_approval"
          ? action.title
          : "Review this action",
      description:
        action.type === "request_approval"
          ? action.description
          : "Review the actions below before they continue.",
    };
  }
  if (type === "generate_ai_draft") {
    return {
      type,
      prompt: action.type === "generate_ai_draft" ? action.prompt : "",
    };
  }
  if (type === "map_data") {
    return {
      type,
      mappings: action.type === "map_data" ? action.mappings : [],
    };
  }
  if (type === "get_variable") {
    return {
      type,
      name: action.type === "get_variable" ? action.name : "",
      scope: action.type === "get_variable" ? action.scope : "business",
    };
  }
  return {
    type,
    messageBody:
      action.type === "add_customer_tag" ||
      action.type === "wait" ||
      action.type === "set_customer_custom_field" ||
      action.type === "request_approval"
      || action.type === "generate_ai_draft"
      || action.type === "map_data"
      || action.type === "get_variable"
        ? ""
        : action.messageBody,
  };
}

export function AutomationsView({
  initialTriggerKey,
}: {
  initialTriggerKey?: string;
}) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Workflow | null>(null);
  const [testing, setTesting] = useState<Workflow | null>(null);
  const [versionHistory, setVersionHistory] = useState<Workflow | null>(null);
  const [runHistory, setRunHistory] = useState<Workflow | null>(null);
  const [triggerFilter, setTriggerFilter] = useState<
    WorkflowTriggerKey | "all"
  >("all");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const router = useRouter();
  const queryClient = useQueryClient();
  const includeArchived = statusFilter === "Archived";

  const { data: workflows = [] } = useQuery({
    queryKey: ["workflows", includeArchived],
    queryFn: () => fetchWorkflows(includeArchived),
  });
  const { data: summary } = useQuery({
    queryKey: ["workflow-summary"],
    queryFn: fetchWorkflowSummary,
  });
  const { data: triggerCatalog = [] } = useQuery({
    queryKey: ["workflow-trigger-catalog"],
    queryFn: fetchWorkflowTriggerCatalog,
  });
  const selectedInitialTrigger = triggerCatalog.find(
    (trigger) => trigger.key === initialTriggerKey,
  );
  const { data: pendingApprovals = [] } = useQuery({
    queryKey: ["workflow-approvals", "pending"],
    queryFn: () => fetchWorkflowApprovals("pending"),
  });
  const triggerByKey = new Map(
    triggerCatalog.map((trigger) => [trigger.key, trigger]),
  );
  const triggerLabel = (key: WorkflowTriggerKey) =>
    triggerByKey.get(key)?.label ?? key;

  const toggleMutation = useMutation({
    mutationFn: ({
      workflow,
      active,
    }: {
      workflow: Workflow;
      active: boolean;
    }) =>
      updateWorkflow(workflow.id, {
        active,
        expectedVersion: workflow.version,
        expectedUpdatedAt: workflow.updatedAt,
      }),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workflows"] }),
        queryClient.invalidateQueries({ queryKey: ["workflow-summary"] }),
      ]);
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Couldn't update this automation.",
      ),
  });
  const archiveMutation = useMutation({
    mutationFn: archiveWorkflow,
    onSuccess: () => toast.success("Workflow archived. Its history is preserved."),
    onError: (error) =>
      toast.error(
        error instanceof ApiError ? error.message : "Couldn't archive this workflow.",
      ),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workflows"] }),
        queryClient.invalidateQueries({ queryKey: ["workflow-summary"] }),
      ]);
    },
  });
  const restoreMutation = useMutation({
    mutationFn: restoreWorkflow,
    onSuccess: () => toast.success("Workflow restored as paused."),
    onError: (error) =>
      toast.error(
        error instanceof ApiError ? error.message : "Couldn't restore this workflow.",
      ),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workflows"] }),
        queryClient.invalidateQueries({ queryKey: ["workflow-summary"] }),
      ]);
    },
  });
  const duplicateMutation = useMutation({
    mutationFn: duplicateWorkflow,
    onSuccess: () => toast.success("Paused workflow copy created."),
    onError: (error) =>
      toast.error(
        error instanceof ApiError ? error.message : "Couldn't duplicate this workflow.",
      ),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workflows"] }),
        queryClient.invalidateQueries({ queryKey: ["workflow-summary"] }),
      ]);
    },
  });
  const pauseAllMutation = useMutation({
    mutationFn: async () => {
      const active = workflows.filter((workflow) => workflow.active);
      const results = await Promise.allSettled(
        active.map((workflow) =>
          updateWorkflow(workflow.id, {
            active: false,
            expectedVersion: workflow.version,
            expectedUpdatedAt: workflow.updatedAt,
          }),
        ),
      );
      const failedCount = results.filter(
        (result) => result.status === "rejected",
      ).length;
      if (failedCount > 0) {
        const pausedCount = results.length - failedCount;
        throw new Error(
          `Paused ${pausedCount} automation(s); ${failedCount} could not be paused.`,
        );
      }
      return results;
    },
    onSuccess: () => toast.success("All automations paused."),
    onError: (error) =>
      toast.error(
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Some automations could not be paused.",
      ),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workflows"] }),
        queryClient.invalidateQueries({ queryKey: ["workflow-summary"] }),
      ]);
    },
  });
  const approvalMutation = useMutation({
    mutationFn: ({
      approvalId,
      decision,
      comment,
    }: {
      approvalId: string;
      decision: "approve" | "reject";
      comment?: string;
    }) => decideWorkflowApproval(approvalId, decision, comment),
    onSuccess: (_approval, variables) =>
      toast.success(
        variables.decision === "approve"
          ? "Approved. The workflow will continue with the reviewed actions."
          : "Rejected. The workflow stopped before the reviewed actions.",
      ),
    onError: (error) =>
      toast.error(
        error instanceof ApiError
          ? error.message
          : "This approval could not be decided.",
      ),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workflow-approvals"] }),
        queryClient.invalidateQueries({ queryKey: ["workflows"] }),
        queryClient.invalidateQueries({ queryKey: ["workflow-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["workflow-runs"] }),
      ]);
    },
  });

  const activeCount =
    summary?.activeWorkflows ?? workflows.filter((w) => w.active).length;
  const totalSuccessfulRuns =
    summary?.successfulRuns ??
    workflows.reduce((a, w) => a + (w.successfulRunCount ?? 0), 0);

  const filtered = workflows.filter((w) => {
    if (includeArchived !== Boolean(w.archivedAt)) return false;
    if (triggerFilter !== "all" && w.triggerKey !== triggerFilter) return false;
    if (statusFilter === "Active" && !w.active) return false;
    if (statusFilter === "Paused" && w.active) return false;
    return true;
  });

  const topBySuccessfulRuns = workflows
    .filter((workflow) => !workflow.archivedAt)
    .sort((a, b) => (b.successfulRunCount ?? 0) - (a.successfulRunCount ?? 0))
    .slice(0, 5);
  const maxSuccessfulRuns = Math.max(
    1,
    ...topBySuccessfulRuns.map((w) => w.successfulRunCount ?? 0),
  );

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[10px]">
        <h2
          className="m-0 text-[19px] font-extrabold"
          style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}
        >
          Automations
        </h2>
        <span
          className="rounded-full text-[12px] font-extrabold"
          style={{
            color: "var(--app-success-text)",
            background: "var(--app-success-bg)",
            padding: "3px 10px",
          }}
        >
          {activeCount} active
        </span>
        <div className="ml-auto flex flex-wrap gap-[9px]">
          <Link
            href="/marketing/automations/triggers"
            className="inline-flex items-center rounded-[11px] px-[15px] text-[12.5px] font-bold"
            style={{
              border: "1px solid var(--app-border)",
              background: "var(--app-surface)",
              color: "var(--app-text-muted)",
              minHeight: 44,
            }}
          >
            Triggers
          </Link>
          <Link
            href="/marketing/automations/templates"
            className="inline-flex items-center rounded-[11px] px-[15px] text-[12.5px] font-bold"
            style={{
              border: "1px solid var(--app-border)",
              background: "var(--app-surface)",
              color: "var(--app-text-muted)",
              minHeight: 44,
            }}
          >
            Workflow Templates
          </Link>
          <Link
            href="/marketing/automations/actions"
            className="inline-flex items-center rounded-[11px] px-[15px] text-[12.5px] font-bold"
            style={{
              border: "1px solid var(--app-border)",
              background: "var(--app-surface)",
              color: "var(--app-text-muted)",
              minHeight: 44,
            }}
          >
            Actions &amp; Nodes
          </Link>
          <button
            type="button"
            onClick={() => pauseAllMutation.mutate()}
            disabled={activeCount === 0}
            className="rounded-[11px] text-[12.5px] font-bold disabled:opacity-40"
            style={{
              border: "1px solid var(--app-border)",
              background: "var(--app-surface)",
              color: "var(--app-text-muted)",
              padding: "11px 15px",
              minHeight: 44,
            }}
          >
            Pause All
          </button>
          <button
            type="button"
            onClick={() => setTesting(workflows[0] ?? null)}
            disabled={workflows.length === 0}
            className="rounded-[11px] text-[12.5px] font-bold disabled:opacity-40"
            style={{
              border: "1px solid var(--app-border)",
              background: "var(--app-surface)",
              color: "var(--app-text-muted)",
              padding: "11px 15px",
              minHeight: 44,
            }}
          >
            Test
          </button>
          <button
            type="button"
            onClick={() => {
              setCreating(true);
            }}
            className="rounded-[11px] text-[12.5px] font-extrabold text-white"
            style={{
              background: "var(--app-primary)",
              padding: "11px 18px",
              minHeight: 44,
            }}
          >
            New Automation
          </button>
        </div>
      </div>

      {initialTriggerKey &&
        triggerCatalog.length > 0 &&
        !selectedInitialTrigger && (
          <p
            role="alert"
            className="m-0 rounded-[10px] px-3 py-2 text-[11px]"
            style={{
              background: "var(--app-warning-bg)",
              color: "var(--app-warning-text)",
            }}
          >
            That trigger is no longer available. Choose another from the Trigger
            Catalog.
          </p>
        )}

      <div
        className="grid gap-[14px]"
        style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}
      >
        <div
          className="rounded-[14px]"
          style={{
            background: "var(--app-surface)",
            border: "1px solid var(--app-border)",
            padding: 15,
          }}
        >
          <div
            className="text-[12px] font-semibold"
            style={{ color: "var(--app-text-faintest)" }}
          >
            Active Automations
          </div>
          <div
            className="mt-1.5 text-[22px] font-extrabold"
            style={{ color: "var(--app-text)" }}
          >
            {activeCount}
          </div>
        </div>
        <div
          className="rounded-[14px]"
          style={{
            background: "var(--app-surface)",
            border: "1px solid var(--app-border)",
            padding: 15,
          }}
        >
          <div
            className="text-[12px] font-semibold"
            style={{ color: "var(--app-text-faintest)" }}
          >
            Successful Runs
          </div>
          <div
            className="mt-1.5 text-[22px] font-extrabold"
            style={{ color: "var(--app-text)" }}
          >
            {totalSuccessfulRuns}
          </div>
        </div>
        <div
          className="rounded-[14px]"
          style={{
            background: "var(--app-surface)",
            border: "1px solid var(--app-border)",
            padding: 15,
          }}
        >
          <div
            className="text-[12px] font-semibold"
            style={{ color: "var(--app-text-faintest)" }}
          >
            Success Rate
          </div>
          <div
            className="mt-1.5 text-[22px] font-extrabold"
            style={{ color: "var(--app-text-disabled)" }}
          >
            {summary?.successRate === null || summary?.successRate === undefined
              ? "Not tracked"
              : `${summary.successRate}%`}
          </div>
        </div>
        <div
          className="rounded-[14px]"
          style={{
            background: "var(--app-surface)",
            border: "1px solid var(--app-border)",
            padding: 15,
          }}
        >
          <div
            className="text-[12px] font-semibold"
            style={{ color: "var(--app-text-faintest)" }}
          >
            Time Saved
          </div>
          <div
            className="mt-1.5 text-[22px] font-extrabold"
            style={{ color: "var(--app-text-disabled)" }}
          >
            Not tracked
          </div>
          <div
            className="mt-1 text-[10.5px]"
            style={{ color: "var(--app-text-disabled)" }}
          >
            Runs do not record operator time
          </div>
        </div>
      </div>

      <section
        className="rounded-[16px]"
        aria-labelledby="workflow-approvals-heading"
        style={{
          background: "var(--app-surface)",
          border: "1px solid var(--app-border)",
          padding: 17,
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <h3
            id="workflow-approvals-heading"
            className="m-0 text-[14.5px] font-extrabold"
            style={{ color: "var(--app-text)" }}
          >
            Pending approvals
          </h3>
          <span
            className="rounded-full px-2 py-0.5 text-[10.5px] font-bold"
            style={{
              color: pendingApprovals.length
                ? "var(--app-warning-text)"
                : "var(--app-text-muted)",
              background: pendingApprovals.length
                ? "var(--app-warning-bg)"
                : "var(--app-surface-2)",
            }}
          >
            {pendingApprovals.length}
          </span>
        </div>
        {pendingApprovals.length === 0 ? (
          <p
            className="mb-0 mt-2 text-[12px]"
            style={{ color: "var(--app-text-muted)" }}
          >
            Nothing is waiting for a workflow decision.
          </p>
        ) : (
          <div className="mt-3 grid gap-3">
            {pendingApprovals.map((approval) => (
              <WorkflowApprovalCard
                key={approval.id}
                approval={approval}
                isPending={
                  approvalMutation.isPending &&
                  approvalMutation.variables?.approvalId === approval.id
                }
                onDecide={(decision, comment) =>
                  approvalMutation.mutate({
                    approvalId: approval.id,
                    decision,
                    comment,
                  })
                }
              />
            ))}
          </div>
        )}
      </section>

      <div
        className="rounded-[16px]"
        style={{
          background: "var(--app-surface)",
          border: "1px solid var(--app-border)",
          padding: 17,
        }}
      >
        <h3
          className="m-0 mb-1.5 text-[14.5px] font-extrabold"
          style={{ color: "var(--app-text)" }}
        >
          Successful runs by automation
        </h3>
        {topBySuccessfulRuns.length === 0 ? (
          <div
            className="flex h-[134px] items-center justify-center text-[12.5px]"
            style={{ color: "var(--app-text-disabled)" }}
          >
            No automations yet.
          </div>
        ) : (
          <svg
            viewBox="0 0 620 134"
            style={{ width: "100%", height: 134, display: "block" }}
          >
            {topBySuccessfulRuns.map((w, i) => {
              const slot = (620 - 44) / topBySuccessfulRuns.length;
              const h = ((w.successfulRunCount ?? 0) / maxSuccessfulRuns) * 96;
              const x = 34 + i * slot + slot * 0.18;
              const width = slot * 0.6;
              return (
                <g key={w.id}>
                  <rect
                    x={x}
                    y={112 - h}
                    width={width}
                    height={h}
                    rx={5}
                    fill="#C7D7FE"
                  />
                  <text
                    x={x + width / 2}
                    y={128}
                    textAnchor="middle"
                    fontSize={10.5}
                    fill="#667085"
                    fontWeight={600}
                  >
                    {w.name.length > 12 ? `${w.name.slice(0, 12)}…` : w.name}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      <div
        className="overflow-hidden rounded-[16px]"
        style={{
          background: "var(--app-surface)",
          border: "1px solid var(--app-border)",
        }}
      >
        <div
          className="flex flex-wrap gap-2"
          style={{
            padding: "13px 17px",
            borderBottom: "1px solid var(--app-surface-2)",
          }}
        >
          <select
            value={triggerFilter}
            onChange={(e) =>
              setTriggerFilter(e.target.value as WorkflowTriggerKey | "all")
            }
            aria-label="Trigger type"
            className="rounded-[10px] text-[12.5px] font-semibold"
            style={{
              border: "1px solid var(--app-border)",
              padding: "9px 11px",
              color: "var(--app-text-muted)",
              minHeight: 42,
            }}
          >
            <option value="all">All triggers</option>
            {triggerCatalog.map(({ key, label }) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Status"
            className="rounded-[10px] text-[12.5px] font-semibold"
            style={{
              border: "1px solid var(--app-border)",
              padding: "9px 11px",
              color: "var(--app-text-muted)",
              minHeight: 42,
            }}
          >
            <option>All statuses</option>
            <option>Active</option>
            <option>Paused</option>
            <option>Archived</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center" style={{ padding: "52px 18px" }}>
            <div
              className="text-[14.5px] font-extrabold"
              style={{ color: "var(--app-text-muted)" }}
            >
              Set up aftercare, rebooking nudges and birthday greetings — they
              run without you
            </div>
            <button
              type="button"
              onClick={() => {
                setCreating(true);
              }}
              className="mt-[15px] rounded-[12px] text-[13px] font-extrabold text-white"
              style={{
                background: "var(--app-primary)",
                padding: "12px 22px",
                minHeight: 46,
              }}
            >
              New Automation
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full border-collapse"
              style={{ minWidth: 1040 }}
            >
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th
                    style={{
                      textAlign: "left",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--app-text-disabled)",
                      padding: "10px 17px",
                    }}
                  >
                    Name / Version
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--app-text-disabled)",
                      padding: 10,
                    }}
                  >
                    Trigger
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--app-text-disabled)",
                      padding: 10,
                    }}
                  >
                    Condition
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--app-text-disabled)",
                      padding: 10,
                    }}
                  >
                    Action
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--app-text-disabled)",
                      padding: 10,
                    }}
                  >
                    Successful Runs
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--app-text-disabled)",
                      padding: 10,
                    }}
                  >
                    Active
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--app-text-disabled)",
                      padding: 10,
                    }}
                  >
                    Last Fired
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--app-text-disabled)",
                      padding: "10px 17px",
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((w) => (
                  <tr
                    key={w.id}
                    style={{ borderTop: "1px solid var(--app-border-strong)" }}
                  >
                    <td
                      style={{
                        padding: "12px 17px",
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: "var(--app-text)",
                      }}
                    >
                      <div>{w.name}</div>
                      <div
                        className="mt-1 text-[10.5px] font-semibold"
                        style={{ color: "var(--app-text-disabled)" }}
                      >
                        Version {w.version}
                      </div>
                    </td>
                    <td
                      style={{
                        padding: 12,
                        fontSize: 12.5,
                        color: "var(--app-text-faint)",
                      }}
                    >
                      <div>{triggerLabel(w.triggerKey)}</div>
                      {w.triggerKey === "scheduled" && (
                        <div
                          className="mt-1 text-[10.5px] font-semibold"
                          style={{ color: "var(--app-text-disabled)" }}
                        >
                          {w.scheduleCronExpression
                            ? `Cron ${w.scheduleCronExpression} · ${w.scheduleTimezone}`
                            : `Every ${w.scheduleEveryMinutes} minutes`}
                          {w.nextScheduleAt && w.active
                            ? ` · next ${formatDate(w.nextScheduleAt)}`
                            : " · paused"}
                        </div>
                      )}
                    </td>
                    <td
                      style={{
                        padding: 12,
                        fontSize: 12,
                        color: "var(--app-text-faintest)",
                      }}
                    >
                      {describeConditions(w)}
                    </td>
                    <td
                      style={{
                        padding: 12,
                        fontSize: 12,
                        color: "var(--app-text-faintest)",
                      }}
                    >
                      {describeActions(w)}
                    </td>
                    <td
                      style={{
                        padding: 12,
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: "var(--app-text)",
                        textAlign: "right",
                      }}
                    >
                      {w.successfulRunCount ?? 0}
                    </td>
                    <td style={{ padding: 12 }}>
                      {w.archivedAt ? (
                        <span
                          className="text-[11px] font-bold"
                          style={{ color: "var(--app-text-disabled)" }}
                        >
                          Archived
                        </span>
                      ) : (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={w.active}
                          aria-label={`Toggle ${w.name}`}
                          onClick={() =>
                            toggleMutation.mutate({
                              workflow: w,
                              active: !w.active,
                            })
                          }
                          style={{
                            width: 38,
                            height: 21,
                            border: 0,
                            borderRadius: 20,
                            background: w.active
                              ? "var(--app-primary)"
                              : "#D5DCE4",
                            position: "relative",
                            cursor: "pointer",
                          }}
                        >
                          <span
                            style={{
                              position: "absolute",
                              top: 2,
                              left: w.active ? 19 : 2,
                              width: 17,
                              height: 17,
                              borderRadius: "50%",
                              background: "#fff",
                              transition: "left .15s ease",
                            }}
                          />
                        </button>
                      )}
                    </td>
                    <td
                      style={{
                        padding: 12,
                        fontSize: 12,
                        color: "var(--app-text-disabled)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {w.lastFiredAt ? formatDate(w.lastFiredAt) : "Never"}
                    </td>
                    <td style={{ padding: "12px 17px", textAlign: "right" }}>
                      <span className="inline-flex gap-[7px]">
                        <button
                          type="button"
                          onClick={() => setTesting(w)}
                          className="rounded-[9px] text-[11.5px] font-bold"
                          style={{
                            border: "1px solid var(--app-border)",
                            background: "var(--app-surface)",
                            color: "var(--app-text-muted)",
                            padding: "8px 11px",
                            minHeight: 40,
                          }}
                        >
                          Test
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(w)}
                          className="rounded-[9px] text-[11.5px] font-bold"
                          style={{
                            border: "1px solid var(--app-border)",
                            background: "var(--app-surface)",
                            color: "var(--app-text-muted)",
                            padding: "8px 11px",
                            minHeight: 40,
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setVersionHistory(w)}
                          className="rounded-[9px] text-[11.5px] font-bold"
                          style={{
                            border: "1px solid var(--app-border)",
                            background: "var(--app-surface)",
                            color: "var(--app-text-muted)",
                            padding: "8px 11px",
                            minHeight: 40,
                          }}
                        >
                          History
                        </button>
                        <button
                          type="button"
                          onClick={() => setRunHistory(w)}
                          className="rounded-[9px] text-[11.5px] font-bold"
                          style={{
                            border: "1px solid var(--app-border)",
                            background: "var(--app-surface)",
                            color: "var(--app-text-muted)",
                            padding: "8px 11px",
                            minHeight: 40,
                          }}
                        >
                          Runs
                        </button>
                        <button
                          type="button"
                          aria-label={`Duplicate ${w.name}`}
                          title="Duplicate as a paused draft"
                          onClick={() => duplicateMutation.mutate(w.id)}
                          disabled={duplicateMutation.isPending}
                          className="rounded-[9px] p-2 text-[11.5px] font-bold disabled:opacity-50"
                          style={{
                            border: "1px solid var(--app-border)",
                            background: "var(--app-surface)",
                            color: "var(--app-text-muted)",
                            minHeight: 40,
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        {w.archivedAt ? (
                          <button
                            type="button"
                            aria-label={`Restore ${w.name}`}
                            onClick={() => restoreMutation.mutate(w.id)}
                            disabled={restoreMutation.isPending}
                            className="rounded-[9px] p-2 text-[11.5px] font-bold disabled:opacity-50"
                            style={{
                              border: "1px solid var(--app-border)",
                              background: "var(--app-surface)",
                              color: "var(--app-text-muted)",
                              minHeight: 40,
                            }}
                          >
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        ) : (
                          <button
                            type="button"
                            aria-label={`Archive ${w.name}`}
                            title="Archive and preserve run history"
                            onClick={async () => {
                              if (await askConfirm({
                                title: `Archive “${w.name}”?`,
                                description: "It will stop receiving new triggers, and its run history will be preserved.",
                                confirmLabel: "Archive",
                                tone: "danger",
                              })) {
                                archiveMutation.mutate(w.id);
                              }
                            }}
                            disabled={archiveMutation.isPending}
                            className="rounded-[9px] p-2 text-[11.5px] font-bold disabled:opacity-50"
                            style={{
                              border: "1px solid var(--app-border)",
                              background: "var(--app-surface)",
                              color: "var(--app-text-muted)",
                              minHeight: 40,
                            }}
                          >
                            <Archive className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(creating || editing || selectedInitialTrigger) && (
        <WorkflowFormDialog
          workflow={editing ?? undefined}
          triggers={triggerCatalog}
          initialTriggerKey={selectedInitialTrigger?.key}
          onClose={() => {
            if (editing) {
              setEditing(null);
              return;
            }
            setCreating(false);
            if (initialTriggerKey) router.replace("/marketing/automations");
          }}
        />
      )}
      {testing && (
        <TestDialog workflow={testing} onClose={() => setTesting(null)} />
      )}
      {versionHistory && (
        <VersionHistoryDialog
          workflow={versionHistory}
          triggers={triggerCatalog}
          onClose={() => setVersionHistory(null)}
        />
      )}
      {runHistory && (
        <RunHistoryDialog
          workflow={runHistory}
          onClose={() => setRunHistory(null)}
        />
      )}
    </main>
  );
}

function ConditionsEditor({
  triggerKey,
  triggers,
  conditions,
  onChange,
  mode,
  onModeChange,
}: {
  triggerKey: WorkflowTriggerKey;
  triggers: WorkflowTriggerCatalogEntry[];
  conditions: WorkflowCondition[];
  onChange: (c: WorkflowCondition[]) => void;
  mode: WorkflowConditionMode;
  onModeChange: (mode: WorkflowConditionMode) => void;
}) {
  const fields =
    triggers.find((trigger) => trigger.key === triggerKey)?.fields ?? [];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          className="m-0 text-[12px] font-bold"
          style={{ color: "var(--app-text)" }}
        >
          Conditions (optional)
        </p>
        <label
          className="flex items-center gap-2 text-[11px]"
          style={{ color: "var(--app-text-muted)" }}
        >
          Match
          <select
            value={mode}
            onChange={(event) =>
              onModeChange(event.target.value as WorkflowConditionMode)
            }
            className="rounded-[9px] p-1.5 text-[11px]"
            style={{ border: "1px solid var(--app-border)" }}
          >
            <option value="all">all conditions</option>
            <option value="any" disabled={conditions.length === 0}>
              any condition
            </option>
          </select>
        </label>
      </div>
      {conditions.map((c, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1.5">
          <select
            value={c.field}
            onChange={(e) =>
              onChange(
                conditions.map((x, idx) =>
                  idx === i ? { ...x, field: e.target.value } : x,
                ),
              )
            }
            className="rounded-[9px] p-2 text-[12px]"
            style={{ border: "1px solid var(--app-border)" }}
          >
            {fields.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <select
            value={c.operator}
            onChange={(e) =>
              onChange(
                conditions.map((x, idx) =>
                  idx === i
                    ? {
                        ...x,
                        operator: e.target
                          .value as WorkflowCondition["operator"],
                      }
                    : x,
                ),
              )
            }
            className="rounded-[9px] p-2 text-[12px]"
            style={{ border: "1px solid var(--app-border)" }}
          >
            {WORKFLOW_CONDITION_OPERATORS.map((op) => (
              <option key={op} value={op}>
                {WORKFLOW_CONDITION_OPERATOR_LABELS[op]}
              </option>
            ))}
          </select>
          <input
            value={String(c.value)}
            onChange={(e) =>
              onChange(
                conditions.map((x, idx) =>
                  idx === i ? { ...x, value: e.target.value } : x,
                ),
              )
            }
            className="w-28 rounded-[9px] p-2 text-[12px]"
            style={{ border: "1px solid var(--app-border)" }}
          />
          <button
            type="button"
            onClick={() => {
              const next = conditions.filter((_, idx) => idx !== i);
              onChange(next);
              if (next.length === 0) onModeChange("all");
            }}
            aria-label="Remove condition"
            style={{ color: "#B42318" }}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={fields.length === 0}
        onClick={() =>
          onChange([
            ...conditions,
            { field: fields[0], operator: "eq", value: "" },
          ])
        }
        className="self-start rounded-[9px] px-3 py-1.5 text-[11.5px] font-bold disabled:opacity-50"
        style={{
          border: "1px dashed var(--app-border-strong)",
          color: "var(--app-primary)",
        }}
      >
        + Add condition
      </button>
    </div>
  );
}

function WorkflowApprovalCard({
  approval,
  isPending,
  onDecide,
}: {
  approval: WorkflowApproval;
  isPending: boolean;
  onDecide: (decision: "approve" | "reject", comment?: string) => void;
}) {
  const [comment, setComment] = useState("");
  return (
    <article
      className="rounded-[12px] p-3"
      style={{ border: "1px solid var(--app-border)" }}
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h4
            className="m-0 text-[13px] font-extrabold"
            style={{ color: "var(--app-text)" }}
          >
            {approval.title}
          </h4>
          <p
            className="m-0 mt-1 text-[11px]"
            style={{ color: "var(--app-text-muted)" }}
          >
            {approval.workflow.name} · requested{" "}
            {formatDate(approval.requestedAt)}
          </p>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{
            background: "var(--app-warning-bg)",
            color: "var(--app-warning-text)",
          }}
        >
          Run paused
        </span>
      </div>
      <p
        className="mb-0 mt-2 text-[12px]"
        style={{ color: "var(--app-text-muted)" }}
      >
        {approval.description}
      </p>
      <ol
        className="mb-0 mt-2 grid gap-1 ps-5 text-[11px]"
        style={{ color: "var(--app-text)" }}
      >
        {approval.payload.steps.map((step, index) => (
          <li key={`${approval.id}-${index}`}>{step.summary}</li>
        ))}
      </ol>
      <p
        className="mb-0 mt-2 text-[10.5px]"
        style={{ color: "var(--app-text-disabled)" }}
      >
        Approving resumes this exact workflow version and reviewed payload.
        Rejecting stops the run.
      </p>
      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        maxLength={2000}
        rows={2}
        aria-label="Decision comment"
        placeholder="Optional decision note"
        className="mt-2 w-full rounded-[9px] p-2 text-[11.5px]"
        style={{ border: "1px solid var(--app-border)" }}
      />
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => onDecide("reject", comment)}
          className="rounded-[9px] px-3 py-2 text-[11.5px] font-bold disabled:opacity-50"
          style={{
            border: "1px solid var(--app-border)",
            color: "var(--app-danger)",
          }}
        >
          {isPending ? "Saving…" : "Reject and stop"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => onDecide("approve", comment)}
          className="rounded-[9px] px-3 py-2 text-[11.5px] font-extrabold text-white disabled:opacity-50"
          style={{ background: "var(--app-primary)" }}
        >
          {isPending ? "Saving…" : "Approve and continue"}
        </button>
      </div>
    </article>
  );
}

function DataMappingsEditor({
  mappings,
  onChange,
}: {
  mappings: WorkflowDataMappingInput[];
  onChange: (next: WorkflowDataMappingInput[]) => void;
}) {
  function update(index: number, patch: Partial<WorkflowDataMappingInput>) {
    onChange(mappings.map((mapping, row) =>
      row === index ? { ...mapping, ...patch } : mapping,
    ));
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-[10.5px]" style={{ color: "var(--app-text-muted)" }}>
        Map trigger JSON into run data. Put this action before any action that uses the mapped fields.
      </p>
      {mappings.map((mapping, index) => (
        <div key={index} className="grid gap-2 rounded-[9px] p-2 md:grid-cols-2" style={{ background: "var(--app-surface-2)", border: "1px solid var(--app-border)" }}>
          <input
            value={mapping.sourcePath}
            onChange={(event) => update(index, { sourcePath: event.target.value })}
            aria-label={`Mapping ${index + 1} source path`}
            placeholder="order.total"
            className="w-full rounded-[8px] p-2 font-mono text-[10.5px]"
            style={{ border: "1px solid var(--app-border)" }}
          />
          <input
            value={mapping.targetPath}
            onChange={(event) => update(index, { targetPath: event.target.value })}
            aria-label={`Mapping ${index + 1} target path`}
            placeholder="orderTotal"
            className="w-full rounded-[8px] p-2 font-mono text-[10.5px]"
            style={{ border: "1px solid var(--app-border)" }}
          />
          <select
            value={mapping.transform ?? "copy"}
            onChange={(event) => update(index, { transform: event.target.value as WorkflowDataMapperTransform })}
            aria-label={`Mapping ${index + 1} transform`}
            className="w-full rounded-[8px] p-2 text-[10.5px]"
            style={{ border: "1px solid var(--app-border)" }}
          >
            {WORKFLOW_DATA_MAPPER_TRANSFORMS.map((transform) => <option key={transform} value={transform}>{transform}</option>)}
          </select>
          <div className="flex items-center gap-3">
            <label className="flex min-h-9 flex-1 items-center gap-2 rounded-[8px] px-2 text-[10px]" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
              <input type="checkbox" checked={mapping.required !== false} onChange={(event) => update(index, { required: event.target.checked })} />
              Required source
            </label>
            <button
              type="button"
              aria-label={`Remove data mapping ${index + 1}`}
              onClick={() => onChange(mappings.filter((_, row) => row !== index))}
              className="rounded-[8px] px-2 py-2 text-[10px] font-bold"
              style={{ border: "1px solid var(--app-border)", color: "var(--app-danger-strong)" }}
            >Remove</button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...mappings, { sourcePath: "", targetPath: "", transform: "copy", required: true }])}
        className="self-start rounded-[8px] px-2.5 py-1.5 text-[10.5px] font-bold"
        style={{ border: "1px dashed var(--app-border-strong)", color: "var(--app-primary)" }}
      >+ Add field mapping</button>
      <p className="m-0 text-[10px]" style={{ color: "var(--app-text-disabled)" }}>
        Later templates can use values as {"{{mappedData.path}}"}. This action makes no provider calls.
      </p>
    </div>
  );
}

function ActionsEditor({
  actions,
  onChange,
  triggerKey,
  triggers,
  supportsCustomerContext,
}: {
  actions: WorkflowAction[];
  onChange: (a: WorkflowAction[]) => void;
  triggerKey: WorkflowTriggerKey;
  triggers: WorkflowTriggerCatalogEntry[];
  supportsCustomerContext: boolean;
}) {
  const { data: customerFields = [], isError: customerFieldsFailed } = useQuery(
    {
      queryKey: ["customer-custom-fields"],
      queryFn: fetchCustomerCustomFields,
      enabled: supportsCustomerContext,
    },
  );
  const {
    data: actionCatalog = [],
    isError: actionCatalogFailed,
    isLoading: actionCatalogLoading,
  } = useQuery({
    queryKey: ["workflow-action-catalog"],
    queryFn: fetchWorkflowActionCatalog,
  });
  const selectableActions = actionCatalog.filter(
    (action) => !action.requiresCustomerContext || supportsCustomerContext,
  );
  const triggerFields =
    triggers.find((trigger) => trigger.key === triggerKey)?.fields ?? [];

  return (
    <div className="flex flex-col gap-2">
      <p
        className="m-0 text-[12px] font-bold"
        style={{ color: "var(--app-text)" }}
      >
        Actions
      </p>
      {actionCatalogFailed && (
        <p role="alert" className="m-0 text-[11px]" style={{ color: "#B42318" }}>
          The action catalog could not load. Existing actions are unchanged;
          reconnect and reload to choose another action.
        </p>
      )}
      {(triggerKey === "commerce_validation" ||
        triggerKey === "commerce_listing_draft" ||
        triggerKey === "seo_issue_detected" ||
        triggerKey === "commerce_rfq_created" ||
        triggerKey === "commerce_rfq_response_received" ||
        triggerKey === "commerce_rfq_awarded" ||
        triggerKey === "scheduled") && (
        <p
          className="m-0 text-[11px]"
          style={{ color: "var(--app-text-muted)" }}
        >
          This event has no customer recipient; use an owner notification or an
          approval gate.
        </p>
      )}
      {actions.map((a, i) => {
        const selectedField =
          a.type === "set_customer_custom_field"
            ? customerFields.find((field) => field.name === a.fieldName)
            : undefined;
        const mappedField =
          a.type === "set_customer_custom_field" && typeof a.value === "string"
            ? (/^\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}$/.exec(a.value)?.[1] ??
              "")
            : "";
        const selectedActionDefinition = actionCatalog.find(
          (entry) => entry.type === a.type,
        );
        return (
          <div
            key={i}
            className="flex flex-col gap-1.5 rounded-[10px] p-2.5"
            style={{ border: "1px solid var(--app-border)" }}
          >
            <div className="flex items-center gap-1.5">
              <select
                value={a.type}
                disabled={actionCatalogLoading || actionCatalogFailed}
                onChange={(e) =>
                  onChange(
                    actions.map((x, idx) =>
                      idx === i
                        ? replaceActionType(
                            x,
                            e.target.value as WorkflowActionType,
                          )
                        : x,
                    ),
                  )
                }
                className="rounded-[9px] p-2 text-[12px]"
                style={{ border: "1px solid var(--app-border)" }}
              >
                {(!selectedActionDefinition ||
                  (selectedActionDefinition.requiresCustomerContext &&
                    !supportsCustomerContext)) && (
                  <option value={a.type}>
                    {selectedActionDefinition
                      ? `${selectedActionDefinition.label} · unavailable for this trigger`
                      : `${describeAction(a)} · unavailable`}
                  </option>
                )}
                {selectableActions.map((action) => (
                  <option key={action.type} value={action.type}>
                    {action.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onChange(actions.filter((_, idx) => idx !== i))}
                aria-label="Remove action"
                style={{ color: "#B42318" }}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
            {selectedActionDefinition && (
              <div
                className="rounded-[8px] p-2"
                style={{
                  background: "var(--app-surface-2)",
                  color: "var(--app-text-muted)",
                }}
              >
                <p className="m-0 text-[10.5px]">
                  {selectedActionDefinition.description}
                </p>
                <p className="m-0 mt-1 text-[10px]">
                  {selectedActionDefinition.category} · {selectedActionDefinition.effect} ·{" "}
                  {selectedActionDefinition.provider} · {selectedActionDefinition.risk} risk
                </p>
                <p className="m-0 mt-1 text-[10px]">
                  Setup: {selectedActionDefinition.setup}
                </p>
              </div>
            )}
            {a.type === "wait" ? (
              <label
                className="flex items-center gap-2 text-[11px]"
                style={{ color: "var(--app-text-muted)" }}
              >
                Wait for
                <input
                  type="number"
                  min={1}
                  max={10080}
                  value={a.durationMinutes}
                  onChange={(e) => {
                    const durationMinutes = Number(e.target.value);
                    onChange(
                      actions.map((x, idx) =>
                        idx === i && x.type === "wait"
                          ? { ...x, durationMinutes }
                          : x,
                      ),
                    );
                  }}
                  className="w-24 rounded-[9px] p-2 text-[12px]"
                  style={{ border: "1px solid var(--app-border)" }}
                  aria-label="Wait duration in minutes"
                />
                minutes
              </label>
            ) : a.type === "add_customer_tag" ? (
              <input
                value={a.tagName}
                onChange={(e) =>
                  onChange(
                    actions.map((x, idx) =>
                      idx === i && x.type === "add_customer_tag"
                        ? { ...x, tagName: e.target.value }
                        : x,
                    ),
                  )
                }
                maxLength={382}
                placeholder="vip customer"
                aria-label="Customer tag name"
                className="w-full rounded-[9px] p-2 text-[12.5px]"
                style={{ border: "1px solid var(--app-border)" }}
              />
            ) : a.type === "set_customer_custom_field" ? (
              <div className="flex flex-col gap-1.5">
                <select
                  value={a.fieldName}
                  onChange={(e) =>
                    onChange(
                      actions.map((x, idx) =>
                        idx === i && x.type === "set_customer_custom_field"
                          ? { ...x, fieldName: e.target.value, value: null }
                          : x,
                      ),
                    )
                  }
                  aria-label="Customer custom field"
                  className="w-full rounded-[9px] p-2 text-[12px]"
                  style={{ border: "1px solid var(--app-border)" }}
                >
                  <option value="">Choose an existing customer field</option>
                  {customerFields.map((field) => (
                    <option key={field.id} value={field.name}>
                      {field.name} · {field.type}
                    </option>
                  ))}
                </select>
                {customerFieldsFailed ? (
                  <p
                    className="m-0 text-[11px]"
                    style={{ color: "var(--app-danger)" }}
                  >
                    Customer fields could not be loaded
                  </p>
                ) : selectedField?.type === "select" ? (
                  <select
                    value={
                      mappedField
                        ? ""
                        : typeof a.value === "string"
                          ? a.value
                          : ""
                    }
                    onChange={(e) =>
                      onChange(
                        actions.map((x, idx) =>
                          idx === i && x.type === "set_customer_custom_field"
                            ? { ...x, value: e.target.value || null }
                            : x,
                        ),
                      )
                    }
                    aria-label={`Value for ${selectedField.name}`}
                    disabled={Boolean(mappedField)}
                    className="w-full rounded-[9px] p-2 text-[12px]"
                    style={{ border: "1px solid var(--app-border)" }}
                  >
                    <option value="">Clear this field</option>
                    {selectedField.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : selectedField?.type === "number" ? (
                  <input
                    type="number"
                    step="any"
                    value={typeof a.value === "number" ? a.value : ""}
                    onChange={(e) =>
                      onChange(
                        actions.map((x, idx) =>
                          idx === i && x.type === "set_customer_custom_field"
                            ? {
                                ...x,
                                value:
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                              }
                            : x,
                        ),
                      )
                    }
                    aria-label={`Value for ${selectedField.name}`}
                    disabled={Boolean(mappedField)}
                    className="w-full rounded-[9px] p-2 text-[12px]"
                    style={{ border: "1px solid var(--app-border)" }}
                  />
                ) : selectedField ? (
                  <input
                    type={selectedField.type === "date" ? "date" : "text"}
                    maxLength={selectedField.type === "text" ? 5000 : undefined}
                    value={
                      mappedField
                        ? ""
                        : typeof a.value === "string"
                          ? a.value
                          : ""
                    }
                    onChange={(e) =>
                      onChange(
                        actions.map((x, idx) =>
                          idx === i && x.type === "set_customer_custom_field"
                            ? {
                                ...x,
                                value:
                                  selectedField.type === "date" &&
                                  e.target.value === ""
                                    ? null
                                    : e.target.value,
                              }
                            : x,
                        ),
                      )
                    }
                    aria-label={`Value for ${selectedField.name}`}
                    disabled={Boolean(mappedField)}
                    className="w-full rounded-[9px] p-2 text-[12px]"
                    style={{ border: "1px solid var(--app-border)" }}
                  />
                ) : (
                  <p
                    className="m-0 text-[11px]"
                    style={{ color: "var(--app-text-muted)" }}
                  >
                    Choose a field already configured in Customer Settings
                  </p>
                )}
                <select
                  value={mappedField}
                  onChange={(event) =>
                    onChange(
                      actions.map((x, idx) =>
                        idx === i && x.type === "set_customer_custom_field"
                          ? {
                              ...x,
                              value: event.target.value
                                ? `{{${event.target.value}}}`
                                : null,
                            }
                          : x,
                      ),
                    )
                  }
                  aria-label="Use a value from the workflow trigger"
                  disabled={!selectedField || customerFieldsFailed}
                  className="w-full rounded-[9px] p-2 text-[12px]"
                  style={{ border: "1px solid var(--app-border)" }}
                >
                  <option value="">Use a fixed value above</option>
                  {triggerFields.map((field) => (
                    <option key={field} value={field}>
                      Use event value · {field}
                    </option>
                  ))}
                </select>
                {mappedField && (
                  <p
                    className="m-0 text-[10.5px]"
                    style={{ color: "var(--app-text-muted)" }}
                  >
                    This field will use {mappedField} from the event. The
                    customer field type is checked before the value is saved.
                  </p>
                )}
              </div>
            ) : a.type === "request_approval" ? (
              <div className="flex flex-col gap-1.5">
                <input
                  value={a.title}
                  onChange={(e) =>
                    onChange(
                      actions.map((x, idx) =>
                        idx === i && x.type === "request_approval"
                          ? { ...x, title: e.target.value }
                          : x,
                      ),
                    )
                  }
                  maxLength={191}
                  placeholder="Approve this customer follow-up"
                  aria-label="Approval title"
                  className="w-full rounded-[9px] p-2 text-[12.5px]"
                  style={{ border: "1px solid var(--app-border)" }}
                />
                <textarea
                  value={a.description}
                  onChange={(e) =>
                    onChange(
                      actions.map((x, idx) =>
                        idx === i && x.type === "request_approval"
                          ? { ...x, description: e.target.value }
                          : x,
                      ),
                    )
                  }
                  rows={2}
                  maxLength={2000}
                  placeholder="Review what the workflow is about to do"
                  aria-label="Approval description"
                  className="w-full rounded-[9px] p-2 text-[12.5px]"
                  style={{ border: "1px solid var(--app-border)" }}
                />
                <span
                  className="text-[10.5px]"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  The run pauses here. Later actions stay blocked until an owner
                  or manager decides.
                </span>
              </div>
            ) : a.type === "generate_ai_draft" ? (
              <div className="flex flex-col gap-1.5">
                <textarea
                  value={a.prompt}
                  onChange={(e) =>
                    onChange(
                      actions.map((x, idx) =>
                        idx === i && x.type === "generate_ai_draft"
                          ? { ...x, prompt: e.target.value }
                          : x,
                      ),
                    )
                  }
                  rows={3}
                  maxLength={4000}
                  placeholder="Draft a thank-you note for {{customerName}} about order {{orderNo}}"
                  aria-label="AI draft prompt"
                  className="w-full rounded-[9px] p-2 text-[12.5px]"
                  style={{ border: "1px solid var(--app-border)" }}
                />
                <p
                  className="m-0 text-[10.5px]"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  Only trigger values named in the prompt are sent to Claude. The
                  draft is saved in run history and is not sent to anyone.
                </p>
              </div>
            ) : a.type === "map_data" ? (
              <DataMappingsEditor
                mappings={a.mappings}
                onChange={(mappings) => onChange(actions.map((x, idx) =>
                  idx === i && x.type === "map_data" ? { ...x, mappings } : x,
                ))}
              />
            ) : a.type === "get_variable" ? (
              <div className="grid gap-2 md:grid-cols-2">
                <input
                  value={a.name}
                  onChange={(event) => onChange(actions.map((item, idx) =>
                    idx === i && item.type === "get_variable"
                      ? { ...item, name: event.target.value }
                      : item,
                  ))}
                  maxLength={100}
                  pattern="[A-Za-z_][A-Za-z0-9_]{0,99}"
                  placeholder="supportMessage"
                  aria-label="Workflow variable name"
                  className="w-full rounded-[9px] p-2 font-mono text-[12px]"
                  style={{ border: "1px solid var(--app-border)" }}
                />
                <select
                  value={a.scope}
                  onChange={(event) => onChange(actions.map((item, idx) =>
                    idx === i && item.type === "get_variable"
                      ? { ...item, scope: event.target.value as "business" | "workflow" }
                      : item,
                  ))}
                  aria-label="Workflow variable scope"
                  className="w-full rounded-[9px] p-2 text-[12px]"
                  style={{ border: "1px solid var(--app-border)" }}
                >
                  <option value="business">Business variable</option>
                  <option value="workflow">This workflow</option>
                </select>
                <p className="m-0 text-[10.5px] md:col-span-2" style={{ color: "var(--app-text-muted)" }}>
                  Reads a non-secret Production variable into this run. Add it before any message or AI action that uses {`{{variables.${a.name || "name"}}}`}.
                </p>
              </div>
            ) : (
              <textarea
                value={a.messageBody}
                onChange={(e) =>
                  onChange(
                    actions.map((x, idx) =>
                      idx === i &&
                      x.type !== "add_customer_tag" &&
                      x.type !== "wait" &&
                      x.type !== "set_customer_custom_field" &&
                      x.type !== "request_approval" &&
                      x.type !== "generate_ai_draft" &&
                      x.type !== "map_data" &&
                      x.type !== "get_variable"
                        ? { ...x, messageBody: e.target.value }
                        : x,
                    ),
                  )
                }
                rows={2}
                placeholder="Hi {{customerName}}, ..."
                className="w-full rounded-[9px] p-2 text-[12.5px]"
                style={{ border: "1px solid var(--app-border)" }}
              />
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() =>
          onChange([
            ...actions,
            supportsCustomerContext
              ? { type: "send_customer_message", messageBody: "" }
              : { type: "notify_owner", messageBody: "" },
          ])
        }
        className="self-start rounded-[9px] px-3 py-1.5 text-[11.5px] font-bold"
        style={{
          border: "1px dashed var(--app-border-strong)",
          color: "var(--app-primary)",
        }}
      >
        + Add action
      </button>
    </div>
  );
}

function WorkflowFormDialog({
  workflow,
  triggers,
  initialTriggerKey,
  onClose,
}: {
  workflow?: Workflow;
  triggers: WorkflowTriggerCatalogEntry[];
  initialTriggerKey?: WorkflowTriggerKey;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const existingGraphDraft = parseSimpleWorkflowGraph(workflow?.graph);
  const initialTrigger =
    workflow?.triggerKey ?? initialTriggerKey ?? "sale";
  const initialSupportsCustomerContext =
    triggers
      .find((trigger) => trigger.key === initialTrigger)
      ?.fields.includes("customerId") ?? false;
  const initialActions: WorkflowAction[] = workflow?.actions ?? [
    {
      type: initialSupportsCustomerContext
        ? "send_customer_message"
        : "notify_owner",
      messageBody: "",
    },
  ];
  const [name, setName] = useState(workflow?.name ?? "");
  const [triggerKey, setTriggerKey] = useState<WorkflowTriggerKey>(
    initialTrigger,
  );
  const [conditions, setConditions] = useState<WorkflowCondition[]>(
    workflow?.conditions ?? [],
  );
  const [conditionMode, setConditionMode] = useState<WorkflowConditionMode>(
    workflow?.conditionMode ?? "all",
  );
  const [scheduleEveryMinutes, setScheduleEveryMinutes] = useState(
    workflow?.scheduleEveryMinutes ?? 60,
  );
  const [scheduleMode, setScheduleMode] = useState<"interval" | "cron">(
    workflow?.scheduleCronExpression ? "cron" : "interval",
  );
  const [scheduleCronExpression, setScheduleCronExpression] = useState(
    workflow?.scheduleCronExpression ?? "0 9 * * 1-5",
  );
  const [scheduleTimezone, setScheduleTimezone] = useState(
    workflow?.scheduleTimezone ?? "UTC",
  );
  const [schedulePreviewResult, setSchedulePreviewResult] =
    useState<WorkflowSchedulePreview | null>(null);
  const [actions, setActions] = useState<WorkflowAction[]>(
    initialActions,
  );
  const [logicMode, setLogicMode] = useState<"steps" | "graph">(
    workflow?.graph ? "graph" : "steps",
  );
  const [branchConditions, setBranchConditions] = useState<WorkflowCondition[]>(
    existingGraphDraft?.branchConditions ?? [],
  );
  const [branchMode, setBranchMode] = useState<WorkflowConditionMode>(
    existingGraphDraft?.branchMode ?? "all",
  );
  const [branchEnabled, setBranchEnabled] = useState(
    existingGraphDraft?.hasBranch ?? false,
  );
  const [trueActions, setTrueActions] = useState<WorkflowAction[]>(
    existingGraphDraft?.trueActions ?? initialActions,
  );
  const [falseActions, setFalseActions] = useState<WorkflowAction[]>(
    existingGraphDraft?.falseActions ?? [],
  );
  const unsupportedSavedGraph = Boolean(workflow?.graph && !existingGraphDraft);

  const mutation = useMutation({
    mutationFn: () =>
      workflow
        ? updateWorkflow(workflow.id, {
            name,
            ...(logicMode === "graph"
              ? {
                  graph: compileWorkflowGraph(
                    branchEnabled ? branchConditions : [],
                    branchMode,
                    trueActions,
                    branchEnabled ? falseActions : [],
                  ),
                }
              : { conditions, conditionMode, actions }),
            scheduleEveryMinutes:
              triggerKey === "scheduled" && scheduleMode === "interval"
                ? scheduleEveryMinutes
                : triggerKey === "scheduled"
                  ? null
                  : undefined,
            scheduleCronExpression:
              triggerKey === "scheduled" && scheduleMode === "cron"
                ? scheduleCronExpression.trim()
                : triggerKey === "scheduled"
                  ? null
                  : undefined,
            scheduleTimezone:
              triggerKey === "scheduled" && scheduleMode === "cron"
                ? scheduleTimezone.trim()
                : triggerKey === "scheduled"
                  ? "UTC"
                  : undefined,
            expectedVersion: workflow.version,
            expectedUpdatedAt: workflow.updatedAt,
          })
        : createWorkflow({
            name,
            triggerKey,
            ...(logicMode === "graph"
              ? {
                  graph: compileWorkflowGraph(
                    branchEnabled ? branchConditions : [],
                    branchMode,
                    trueActions,
                    branchEnabled ? falseActions : [],
                  ),
                }
              : { conditions, conditionMode, actions }),
            scheduleEveryMinutes:
              triggerKey === "scheduled" && scheduleMode === "interval"
                ? scheduleEveryMinutes
                : null,
            scheduleCronExpression:
              triggerKey === "scheduled" && scheduleMode === "cron"
                ? scheduleCronExpression.trim()
                : null,
            scheduleTimezone:
              triggerKey === "scheduled" && scheduleMode === "cron"
                ? scheduleTimezone.trim()
                : "UTC",
          }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      toast.success(
        workflow
          ? "Automation updated."
          : "Automation created paused. Test it, then activate it when ready.",
      );
      onClose();
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Couldn't save this automation.",
      ),
  });
  const schedulePreview = useMutation({
    mutationFn: () =>
      previewWorkflowSchedule(
        scheduleMode === "interval"
          ? { scheduleEveryMinutes, scheduleTimezone: "UTC" }
          : {
              scheduleCronExpression: scheduleCronExpression.trim(),
              scheduleTimezone: scheduleTimezone.trim(),
            },
      ),
    onSuccess: setSchedulePreviewResult,
    onError: () => setSchedulePreviewResult(null),
  });
  const supportsCustomerContext =
    triggers
      .find((trigger) => trigger.key === triggerKey)
      ?.fields.includes("customerId") ?? false;
  const actionsToValidate =
    logicMode === "graph"
      ? [...trueActions, ...(branchEnabled ? falseActions : [])]
      : actions;
  const validActions = actionsToValidate.every((action) =>
    action.type === "wait"
      ? Number.isInteger(action.durationMinutes) &&
        action.durationMinutes >= 1 &&
        action.durationMinutes <= 10_080
      : action.type === "add_customer_tag"
        ? action.tagName.trim().length > 0 &&
          Array.from(action.tagName.trim()).length <= 191
      : action.type === "request_approval"
          ? action.title.trim().length > 0 &&
            action.title.length <= 191 &&
            action.description.trim().length > 0 &&
            action.description.length <= 2000
          : action.type === "set_customer_custom_field"
            ? action.fieldName.trim().length > 0 &&
              (action.value === null ||
                typeof action.value === "string" ||
                (typeof action.value === "number" &&
                  Number.isFinite(action.value)))
      : action.type === "generate_ai_draft"
              ? action.prompt.trim().length > 0 &&
                action.prompt.length <= 4000
              : action.type === "map_data"
                ? action.mappings.length > 0 &&
                  action.mappings.every(
                    (mapping) =>
                      mapping.sourcePath.trim().length > 0 &&
                      mapping.targetPath.trim().length > 0,
                  )
              : action.type === "get_variable"
                ? /^[A-Za-z_][A-Za-z0-9_]{0,99}$/.test(action.name) &&
                  action.name !== "__proto__" &&
                  action.name !== "prototype" &&
                  action.name !== "constructor"
              : action.messageBody.trim().length > 0,
  );
  const graphNodeCount =
    2 +
    actionsToValidate.length +
    (logicMode === "graph" && branchEnabled ? 2 : 1);
  const validGraph =
    logicMode !== "graph" ||
    (!unsupportedSavedGraph &&
      graphNodeCount <= 100 &&
      (!branchEnabled || branchConditions.length > 0));
  const validSchedule =
    triggerKey !== "scheduled" ||
    (scheduleMode === "interval"
      ? Number.isInteger(scheduleEveryMinutes) &&
        scheduleEveryMinutes >= 15 &&
        scheduleEveryMinutes <= 10_080
      : scheduleCronExpression.trim().length > 0 &&
        scheduleCronExpression.trim().length <= 100 &&
        scheduleTimezone.trim().length > 0 &&
        scheduleTimezone.trim().length <= 64);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-5"
      style={{ background: "rgba(10,27,42,.36)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-[500px] flex-col rounded-[16px]"
        style={{ background: "var(--app-surface)" }}
      >
        <div
          className="p-[17px]"
          style={{ borderBottom: "1px solid var(--app-surface-2)" }}
        >
          <h3
            className="m-0 text-[15px] font-extrabold"
            style={{ color: "var(--app-text)" }}
          >
            {workflow ? "Edit automation" : "New automation"}
          </h3>
        </div>
        <div className="flex flex-col gap-3.5 overflow-y-auto p-[17px]">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Thank loyal customers"
            className="rounded-[10px] p-2.5 text-[13px]"
            style={{ border: "1px solid var(--app-border)" }}
          />
          <select
            value={triggerKey}
            onChange={(e) => {
              const nextTriggerKey = e.target.value as WorkflowTriggerKey;
              setTriggerKey(nextTriggerKey);
              setConditions([]);
              setConditionMode("all");
              setBranchConditions([]);
              setBranchEnabled(false);
              const nextSupportsCustomerContext =
                triggers
                  .find((trigger) => trigger.key === nextTriggerKey)
                  ?.fields.includes("customerId") ?? false;
              const customerActions = [
                "send_customer_message",
                "add_customer_tag",
                "set_customer_custom_field",
              ];
              const normalizeActions = (current: WorkflowAction[]) =>
                current.map((action) =>
                  !nextSupportsCustomerContext &&
                  customerActions.includes(action.type)
                    ? replaceActionType(action, "notify_owner")
                    : action,
                );
              setActions((current) =>
                normalizeActions(current),
              );
              setTrueActions(normalizeActions);
              setFalseActions(normalizeActions);
            }}
            disabled={!!workflow || triggers.length === 0}
            className="rounded-[10px] p-2.5 text-[12.5px] disabled:opacity-60"
            style={{ border: "1px solid var(--app-border)" }}
          >
            {triggers.map(({ key, label }) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <div
            className="flex w-fit items-center gap-1 rounded-[10px] p-1"
            style={{ background: "var(--app-surface-2)" }}
            role="group"
            aria-label="Workflow logic editor"
          >
            {(["steps", "graph"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={logicMode === mode}
                onClick={() => {
                  if (mode === logicMode) return;
                  if (mode === "graph") {
                    setTrueActions(actions);
                    setFalseActions([]);
                    setBranchConditions([]);
                    setBranchEnabled(false);
                  } else {
                    setActions([...trueActions, ...falseActions]);
                    setConditions([]);
                    setConditionMode("all");
                    setBranchEnabled(false);
                  }
                  setLogicMode(mode);
                }}
                className="rounded-[8px] px-3 py-1.5 text-[11px] font-bold"
                style={{
                  background:
                    logicMode === mode ? "var(--app-surface)" : "transparent",
                  color:
                    logicMode === mode
                      ? "var(--app-primary)"
                      : "var(--app-text-muted)",
                }}
              >
                {mode === "steps" ? "Step list" : "Branching logic"}
              </button>
            ))}
          </div>
          {triggers.length === 0 && (
            <p className="m-0 text-[11.5px]" style={{ color: "#B42318" }}>
              Trigger options are unavailable right now. Try again before
              saving.
            </p>
          )}
          {triggerKey === "scheduled" && (
            <label
              className="flex flex-col gap-1 text-[11.5px] font-semibold"
              style={{ color: "var(--app-text-muted)" }}
            >
              Schedule type
              <select
                value={scheduleMode}
                onChange={(event) => {
                  setSchedulePreviewResult(null);
                  schedulePreview.reset();
                  setScheduleMode(event.target.value as "interval" | "cron");
                }}
                className="rounded-[10px] p-2.5 text-[12.5px]"
                style={{ border: "1px solid var(--app-border)" }}
              >
                <option value="interval">Fixed interval</option>
                <option value="cron">Cron expression</option>
              </select>
              {scheduleMode === "interval" ? (
                <>
                  Run every
                  <select
                    value={scheduleEveryMinutes}
                    onChange={(event) => {
                      setSchedulePreviewResult(null);
                      schedulePreview.reset();
                      setScheduleEveryMinutes(Number(event.target.value));
                    }}
                    className="rounded-[10px] p-2.5 text-[12.5px]"
                    style={{ border: "1px solid var(--app-border)" }}
                  >
                    {[
                      ...new Set([
                        15,
                        30,
                        45,
                        60,
                        90,
                        120,
                        180,
                        240,
                        360,
                        720,
                        1440,
                        10080,
                        ...(workflow?.scheduleEveryMinutes
                          ? [workflow.scheduleEveryMinutes]
                          : []),
                      ]),
                    ]
                      .sort((a, b) => a - b)
                      .map((minutes) => (
                        <option key={minutes} value={minutes}>
                          {minutes < 60
                            ? `${minutes} minutes`
                            : minutes < 1440
                              ? `${minutes / 60} hour${minutes === 60 ? "" : "s"}`
                              : `${minutes / 1440} day${minutes === 1440 ? "" : "s"}`}
                        </option>
                      ))}
                  </select>
                </>
              ) : (
                <>
                  Cron expression
                  <input
                    value={scheduleCronExpression}
                    onChange={(event) => {
                      setSchedulePreviewResult(null);
                      schedulePreview.reset();
                      setScheduleCronExpression(event.target.value);
                    }}
                    maxLength={100}
                    placeholder="0 9 * * 1-5"
                    className="rounded-[10px] p-2.5 text-[12.5px]"
                    style={{ border: "1px solid var(--app-border)" }}
                    aria-label="Five-field cron expression"
                  />
                  IANA time zone
                  <input
                    value={scheduleTimezone}
                    onChange={(event) => {
                      setSchedulePreviewResult(null);
                      schedulePreview.reset();
                      setScheduleTimezone(event.target.value);
                    }}
                    maxLength={64}
                    placeholder="Asia/Karachi"
                    className="rounded-[10px] p-2.5 text-[12.5px]"
                    style={{ border: "1px solid var(--app-border)" }}
                    aria-label="IANA time zone"
                  />
                  <span className="font-normal">
                    Uses five cron fields and the selected time zone, including
                    its daylight-saving rules.
                  </span>
                </>
              )}
              <span className="font-normal">
                Runs start after activation. If the app is offline, one missed
                run is caught up when it returns.
              </span>
              <button
                type="button"
                disabled={!validSchedule || schedulePreview.isPending}
                onClick={() => schedulePreview.mutate()}
                className="self-start rounded-[9px] px-3 py-2 text-[11px] font-bold disabled:opacity-50"
                style={{
                  color: "var(--app-primary)",
                  background: "var(--app-success-bg)",
                }}
              >
                {schedulePreview.isPending
                  ? "Calculating…"
                  : "Preview next five times"}
              </button>
              {schedulePreview.isError && (
                <span role="alert" className="font-normal text-red-600">
                  {schedulePreview.error instanceof Error
                    ? schedulePreview.error.message
                    : "Schedule preview is unavailable."}
                </span>
              )}
              {schedulePreviewResult && (
                <ol className="m-0 flex flex-col gap-1 pl-5 font-normal">
                  {schedulePreviewResult.occurrences.map((occurrence) => (
                    <li key={occurrence}>
                      {formatScheduleTime(
                        occurrence,
                        schedulePreviewResult.timezone,
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </label>
          )}
          {logicMode === "steps" ? (
            <>
              <ConditionsEditor
                triggerKey={triggerKey}
                triggers={triggers}
                conditions={conditions}
                onChange={setConditions}
                mode={conditionMode}
                onModeChange={setConditionMode}
              />
              <ActionsEditor
                actions={actions}
                onChange={setActions}
                triggerKey={triggerKey}
                triggers={triggers}
                supportsCustomerContext={supportsCustomerContext}
              />
            </>
          ) : (
            <div className="flex flex-col gap-3">
              {unsupportedSavedGraph ? (
                <p
                  role="alert"
                  className="m-0 rounded-[10px] p-3 text-[11.5px]"
                  style={{
                    background: "var(--app-warning-bg)",
                    color: "var(--app-warning-text)",
                  }}
                >
                  This workflow has a more complex graph than the compact editor
                  can safely modify. Switch to Step list only if you intend to
                  replace its branching logic.
                </p>
              ) : (
                <>
                  <p
                    className="m-0 text-[11px]"
                    style={{ color: "var(--app-text-muted)" }}
                  >
                    Add a condition to route each run through one of two action
                    paths. The selected path is saved with the run for safe
                    waits and approvals.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (branchEnabled) {
                        setBranchEnabled(false);
                        setBranchConditions([]);
                      } else {
                        const firstField =
                          triggers.find((trigger) => trigger.key === triggerKey)
                            ?.fields[0] ?? "description";
                        setBranchConditions([
                          { field: firstField, operator: "eq", value: "" },
                        ]);
                        setBranchEnabled(true);
                      }
                    }}
                    className="self-start rounded-[9px] px-3 py-1.5 text-[11px] font-bold"
                    style={{
                      border: "1px dashed var(--app-border-strong)",
                      color: "var(--app-primary)",
                    }}
                  >
                    {branchEnabled
                      ? "Remove condition branch"
                      : "+ Add condition branch"}
                  </button>
                  {branchEnabled && (
                    <ConditionsEditor
                      triggerKey={triggerKey}
                      triggers={triggers}
                      conditions={branchConditions}
                      onChange={setBranchConditions}
                      mode={branchMode}
                      onModeChange={setBranchMode}
                    />
                  )}
                  <section
                    className="flex flex-col gap-2 rounded-[11px] p-3"
                    style={{ border: "1px solid var(--app-border)" }}
                  >
                    <p
                      className="m-0 text-[11.5px] font-bold"
                      style={{ color: "var(--app-text)" }}
                    >
                      {branchEnabled ? "If conditions match" : "Workflow steps"}
                    </p>
                    <ActionsEditor
                      actions={trueActions}
                      onChange={setTrueActions}
                      triggerKey={triggerKey}
                      triggers={triggers}
                      supportsCustomerContext={supportsCustomerContext}
                    />
                  </section>
                  {branchEnabled && (
                    <section
                      className="flex flex-col gap-2 rounded-[11px] p-3"
                      style={{ border: "1px solid var(--app-border)" }}
                    >
                      <p
                        className="m-0 text-[11.5px] font-bold"
                        style={{ color: "var(--app-text)" }}
                      >
                        If conditions do not match
                      </p>
                      <ActionsEditor
                        actions={falseActions}
                        onChange={setFalseActions}
                        triggerKey={triggerKey}
                        triggers={triggers}
                        supportsCustomerContext={supportsCustomerContext}
                      />
                    </section>
                  )}
                  {!validGraph && (
                    <p className="m-0 text-[11px]" style={{ color: "#B42318" }}>
                      Add at least one condition to create a branch and keep the
                      graph under 100 nodes.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        <div
          className="grid grid-cols-2 gap-2 p-[14px_17px]"
          style={{ borderTop: "1px solid var(--app-surface-2)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] px-4 py-2.5 text-[12.5px] font-bold"
            style={{
              border: "1px solid var(--app-border)",
              color: "var(--app-text-muted)",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={
              triggers.length === 0 ||
              !name.trim() ||
              !validActions ||
              !validGraph ||
              !validSchedule ||
              mutation.isPending
            }
            className="rounded-[10px] px-4 py-2.5 text-[12.5px] font-extrabold text-white disabled:opacity-50"
            style={{ background: "var(--app-primary)" }}
          >
            {mutation.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TestDialog({
  workflow,
  onClose,
}: {
  workflow: Workflow;
  onClose: () => void;
}) {
  const [result, setResult] = useState<WorkflowTestResult | null>(null);
  const mutation = useMutation({
    mutationFn: () => testWorkflow(workflow.id),
    onSuccess: setResult,
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : "Couldn't run the test.",
      ),
  });
  const hasBlockedActionPreview =
    result?.actionPreviews.some((preview) => preview.error !== null) ?? false;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-5"
      style={{ background: "rgba(10,27,42,.36)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] rounded-[16px] p-[17px]"
        style={{ background: "var(--app-surface)" }}
      >
        <h3
          className="m-0 mb-1 text-[15px] font-extrabold"
          style={{ color: "var(--app-text)" }}
        >
          Test &quot;{workflow.name}&quot;
        </h3>
        <p
          className="m-0 mb-3 text-[11.5px]"
          style={{ color: "var(--app-text-disabled)" }}
        >
          Runs against your most recent real matching activity — never sends
          anything or logs a run.
        </p>
        {result ? (
          <div className="flex flex-col gap-2.5 text-[12.5px]">
            {!result.foundRecentEvent ? (
              <p className="m-0" style={{ color: "var(--app-text-disabled)" }}>
                No recent activity matches this trigger yet — nothing to test
                against.
              </p>
            ) : (
              <>
                <span
                  className="w-fit rounded-full px-2.5 py-[3px] text-[10.5px] font-extrabold"
                  style={{
                    background:
                      result.matched && !hasBlockedActionPreview
                        ? "#E8F7EE"
                        : "#FEF3F2",
                    color:
                      result.matched && !hasBlockedActionPreview
                        ? "#0E8442"
                        : "#B42318",
                  }}
                >
                  {!result.matched
                    ? "Conditions didn't match"
                    : hasBlockedActionPreview
                      ? "Conditions match · action needs attention"
                      : "Would run"}
                </span>
                <pre
                  className="overflow-x-auto rounded-[9px] p-2.5 text-[11px]"
                  style={{
                    background: "var(--app-surface-2)",
                    color: "var(--app-text-muted)",
                  }}
                >
                  {JSON.stringify(result.context, null, 2)}
                </pre>
                {result.executionPlan?.decisions.length ? (
                  <div
                    className="rounded-[9px] p-2.5 text-[11px]"
                    style={{
                      background: "var(--app-surface-2)",
                      color: "var(--app-text-muted)",
                    }}
                  >
                    <strong>Selected route</strong>
                    {result.executionPlan.decisions.map((decision) => (
                      <p key={decision.nodeId} className="m-0 mt-1">
                        {decision.nodeId}: {decision.result === "true" ? "matched" : "did not match"}
                      </p>
                    ))}
                  </div>
                ) : null}
                {result.matched && result.wouldExecuteActions.length > 0 && (
                  <ul
                    className="m-0 list-disc ps-5"
                    style={{ color: "var(--app-text-muted)" }}
                  >
                    {result.wouldExecuteActions.map((a, i) => {
                      const preview = result.actionPreviews.find(
                        (actionPreview) =>
                          actionPreview.actionIndex ===
                          (result.selectedActionIndexes?.[i] ?? i),
                      );
                      return (
                        <li key={i}>
                          {a.type === "request_approval" ? (
                            <>
                              {describeAction(a)}: {preview?.body}
                              {preview?.error && (
                                <p
                                  className="m-0 mt-1 text-[11px]"
                                  style={{ color: "#B42318" }}
                                >
                                  Not ready: {preview.error}
                                </p>
                              )}
                            </>
                          ) : a.type === "add_customer_tag" ||
                            a.type === "wait" ? (
                            describeAction(a)
                          ) : a.type === "set_customer_custom_field" ? (
                            <>
                              {describeAction(a)}
                              {preview?.body && (
                                <p
                                  className="m-0 mt-1 text-[11px]"
                                  style={{ color: "var(--app-text-faint)" }}
                                >
                                  {preview.body}
                                </p>
                              )}
                              {preview?.error && (
                                <p
                                  className="m-0 mt-1 text-[11px]"
                                  style={{ color: "#B42318" }}
                                >
                                  Not ready: {preview.error}
                                </p>
                              )}
                            </>
                          ) : a.type === "generate_ai_draft" || a.type === "map_data" || a.type === "get_variable" ? (
                            <>
                              {describeAction(a)}
                              {preview?.body && (
                                <p
                                  className="m-0 mt-1 text-[11px]"
                                  style={{ color: "var(--app-text-faint)" }}
                                >
                                  {preview.body}
                                </p>
                              )}
                              {preview?.error && (
                                <p
                                  className="m-0 mt-1 text-[11px]"
                                  style={{ color: "#B42318" }}
                                >
                                  Not ready: {preview.error}
                                </p>
                              )}
                            </>
                          ) : (
                            <>
                              {describeAction(a)}: &ldquo;
                              {preview?.body ?? a.messageBody}&rdquo;
                              {preview?.error && (
                                <p
                                  className="m-0 mt-1 text-[11px]"
                                  style={{ color: "#B42318" }}
                                >
                                  Not ready: {preview.error}
                                </p>
                              )}
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </div>
        ) : (
          <p
            className="m-0 text-[12px]"
            style={{ color: "var(--app-text-disabled)" }}
          >
            Click &ldquo;Run test&rdquo; to see what would happen with real
            recent data.
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] px-4 py-2.5 text-[12.5px] font-bold"
            style={{
              border: "1px solid var(--app-border)",
              color: "var(--app-text-muted)",
            }}
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="rounded-[10px] px-4 py-2.5 text-[12.5px] font-extrabold text-white disabled:opacity-50"
            style={{ background: "var(--app-primary)" }}
          >
            {mutation.isPending ? "Running…" : "Run test"}
          </button>
        </div>
      </div>
    </div>
  );
}

function VersionHistoryDialog({
  workflow,
  triggers,
  onClose,
}: {
  workflow: Workflow;
  triggers: WorkflowTriggerCatalogEntry[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [selectedRestoreVersion, setSelectedRestoreVersion] =
    useState<WorkflowVersion | null>(null);
  const [restoreReason, setRestoreReason] = useState("");
  const {
    data: versions = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["workflow-versions", workflow.id],
    queryFn: () => fetchWorkflowVersions(workflow.id),
  });
  const restoreMutation = useMutation({
    mutationFn: (input: { version: WorkflowVersion; reason: string }) =>
      restoreWorkflowVersion(workflow.id, input.version.version, {
        expectedVersion: workflow.version,
        expectedUpdatedAt: workflow.updatedAt,
        reason: input.reason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      queryClient.invalidateQueries({
        queryKey: ["workflow-versions", workflow.id],
      });
      toast.success("Previous saved version restored as a new version.");
      setSelectedRestoreVersion(null);
      setRestoreReason("");
      onClose();
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Couldn't restore this version.",
      ),
  });

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-5"
      style={{ background: "rgba(10,27,42,.36)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-[600px] flex-col rounded-[16px]"
        style={{ background: "var(--app-surface)" }}
      >
        <div
          className="p-[17px]"
          style={{ borderBottom: "1px solid var(--app-surface-2)" }}
        >
          <h3
            className="m-0 text-[15px] font-extrabold"
            style={{ color: "var(--app-text)" }}
          >
            Version history
          </h3>
          <p
            className="m-0 mt-1 text-[12px]"
            style={{ color: "var(--app-text-disabled)" }}
          >
            {workflow.name} · current version {workflow.version}
          </p>
          <p
            className="m-0 mt-2 text-[11px]"
            style={{ color: "var(--app-text-muted)" }}
          >
            Restoring creates a new version and keeps the current pause or active setting. Runs already in progress stay pinned to the version they started with.
          </p>
        </div>
        <div className="flex flex-col gap-3 overflow-y-auto p-[17px]">
          {isLoading ? (
            <p
              className="m-0 text-[12.5px]"
              style={{ color: "var(--app-text-disabled)" }}
            >
              Loading saved versions…
            </p>
          ) : isError ? (
            <p className="m-0 text-[12.5px]" style={{ color: "#B42318" }}>
              Couldn’t load version history. Please try again.
            </p>
          ) : versions.length === 0 ? (
            <p
              className="m-0 text-[12.5px]"
              style={{ color: "var(--app-text-disabled)" }}
            >
              No saved versions found.
            </p>
          ) : (
            versions.map((version) => (
              <VersionHistoryEntry
                key={version.id}
                version={version}
                triggerLabel={
                  triggers.find((trigger) => trigger.key === version.triggerKey)
                    ?.label ?? version.triggerKey
                }
                currentVersion={workflow.version}
                isRestoring={restoreMutation.isPending}
                onRestore={() => {
                  setSelectedRestoreVersion(version);
                  setRestoreReason("");
                }}
              />
            ))
          )}
          {selectedRestoreVersion && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const reason = restoreReason.trim();
                if (!reason || restoreMutation.isPending) return;
                restoreMutation.mutate({
                  version: selectedRestoreVersion,
                  reason,
                });
              }}
              className="flex flex-col gap-2 rounded-[12px] p-3"
              style={{
                border: "1px solid var(--app-warning-border)",
                background: "var(--app-warning-bg)",
              }}
            >
              <p
                className="m-0 text-[11px] font-bold"
                style={{ color: "var(--app-warning-text)" }}
              >
                Restore v{selectedRestoreVersion.version} as a new version
              </p>
              <label
                className="flex flex-col gap-1 text-[10.5px] font-semibold"
                style={{ color: "var(--app-text-muted)" }}
              >
                Reason recorded in the audit history
                <textarea
                  value={restoreReason}
                  onChange={(event) => setRestoreReason(event.target.value)}
                  required
                  maxLength={2000}
                  rows={3}
                  placeholder="Explain why this workflow version is being restored"
                  className="rounded-[9px] p-2.5 text-[11px] font-normal outline-none"
                  style={{
                    border: "1px solid var(--app-border)",
                    background: "var(--app-surface)",
                    color: "var(--app-text)",
                  }}
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedRestoreVersion(null)}
                  disabled={restoreMutation.isPending}
                  className="rounded-[9px] px-3 py-2 text-[10.5px] font-semibold disabled:opacity-50"
                  style={{
                    border: "1px solid var(--app-border)",
                    color: "var(--app-text-muted)",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={restoreMutation.isPending || !restoreReason.trim()}
                  className="rounded-[9px] px-3 py-2 text-[10.5px] font-bold text-white disabled:opacity-50"
                  style={{ background: "var(--app-primary)" }}
                >
                  {restoreMutation.isPending
                    ? "Restoring…"
                    : "Confirm restore"}
                </button>
              </div>
            </form>
          )}
        </div>
        <div
          className="flex justify-end p-[14px_17px]"
          style={{ borderTop: "1px solid var(--app-surface-2)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] px-4 py-2.5 text-[12.5px] font-bold"
            style={{
              border: "1px solid var(--app-border)",
              color: "var(--app-text-muted)",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function VersionHistoryEntry({
  version,
  triggerLabel,
  currentVersion,
  isRestoring,
  onRestore,
}: {
  version: WorkflowVersion;
  triggerLabel: string;
  currentVersion: number;
  isRestoring: boolean;
  onRestore: () => void;
}) {
  return (
    <article
      className="rounded-[12px] p-3"
      style={{ border: "1px solid var(--app-border)" }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h4
          className="m-0 text-[13px] font-extrabold"
          style={{ color: "var(--app-text)" }}
        >
          {version.name}
        </h4>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{
            background: "var(--app-surface-2)",
            color: "var(--app-text-muted)",
          }}
        >
          v{version.version}
        </span>
        {version.version === currentVersion && (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={{
              background: "var(--app-success-bg)",
              color: "var(--app-success-text)",
            }}
          >
            Current
          </span>
        )}
        <span
          className="ml-auto text-[10.5px]"
          style={{ color: "var(--app-text-disabled)" }}
        >
          {formatDate(version.createdAt)}
        </span>
      </div>
      <p
        className="m-0 mt-2 text-[11.5px]"
        style={{ color: "var(--app-text-muted)" }}
      >
        When: {triggerLabel}
      </p>
      {version.conditions.length > 0 && (
        <p
          className="m-0 mt-1 text-[11.5px]"
          style={{ color: "var(--app-text-faint)" }}
        >
          If:{" "}
          {version.conditions
            .map(
              (condition) =>
                `${condition.field} ${CONDITION_OP_SYMBOL[condition.operator] ?? condition.operator} ${condition.value}`,
            )
            .join(version.conditionMode === "any" ? " OR " : " AND ")}
        </p>
      )}
      <ul
        className="m-0 mt-1 list-disc ps-5 text-[11.5px]"
        style={{ color: "var(--app-text-faint)" }}
      >
        {version.actions.map((action, index) => (
          <li key={`${action.type}-${index}`}>
            {action.type === "add_customer_tag" ||
            action.type === "wait" ||
            action.type === "set_customer_custom_field" ||
            action.type === "request_approval" ||
            action.type === "generate_ai_draft" ||
            action.type === "map_data" ||
            action.type === "get_variable"
              ? describeAction(action)
              : `${describeAction(action)}: ${action.messageBody}`}
          </li>
        ))}
      </ul>
      {version.version !== currentVersion && (
        <button
          type="button"
          onClick={onRestore}
          disabled={isRestoring}
          className="mt-3 rounded-[9px] px-3 py-1.5 text-[11px] font-bold disabled:opacity-50"
          style={{
            border: "1px solid var(--app-border)",
            color: "var(--app-text-muted)",
          }}
        >
          {isRestoring ? "Restoring…" : "Restore as new version"}
        </button>
      )}
    </article>
  );
}

function RunHistoryDialog({
  workflow,
  onClose,
}: {
  workflow: Workflow;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const retryMutation = useMutation({
    mutationFn: ({ runId }: { runId: string }) =>
      retryWorkflowRun(workflow.id, runId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["workflow-runs", workflow.id],
        }),
        queryClient.invalidateQueries({ queryKey: ["workflow-summary"] }),
      ]);
      toast.info("Retry attempt finished. Check the updated run details.");
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Couldn't retry this workflow run.",
      ),
  });
  const cancelMutation = useMutation({
    mutationFn: ({ runId }: { runId: string }) =>
      cancelWorkflowRun(workflow.id, runId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["workflow-runs", workflow.id],
        }),
        queryClient.invalidateQueries({ queryKey: ["workflow-summary"] }),
      ]);
      toast.info("Run cancelled; an action already in progress may finish.");
    },
    onError: (err) =>
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Couldn't cancel this workflow run.",
      ),
  });
  const {
    data: runs = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["workflow-runs", workflow.id],
    queryFn: () => fetchWorkflowRuns(workflow.id),
  });

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-5"
      style={{ background: "rgba(10,27,42,.36)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-[680px] flex-col rounded-[16px]"
        style={{ background: "var(--app-surface)" }}
      >
        <div
          className="p-[17px]"
          style={{ borderBottom: "1px solid var(--app-surface-2)" }}
        >
          <h3
            className="m-0 text-[15px] font-extrabold"
            style={{ color: "var(--app-text)" }}
          >
            Run history
          </h3>
          <p
            className="m-0 mt-1 text-[12px]"
            style={{ color: "var(--app-text-disabled)" }}
          >
            {workflow.name} · most recent 50 runs
          </p>
        </div>
        <div className="flex flex-col gap-2 overflow-y-auto p-[17px]">
          {isLoading ? (
            <p
              className="m-0 text-[12.5px]"
              style={{ color: "var(--app-text-disabled)" }}
            >
              Loading runs…
            </p>
          ) : isError ? (
            <p className="m-0 text-[12.5px]" style={{ color: "#B42318" }}>
              Couldn’t load run history. Please try again.
            </p>
          ) : runs.length === 0 ? (
            <p
              className="m-0 text-[12.5px]"
              style={{ color: "var(--app-text-disabled)" }}
            >
              This automation hasn’t run yet.
            </p>
          ) : (
            runs.map((run) => (
              <RunHistoryEntry
                key={run.id}
                run={run}
                onRetry={() => retryMutation.mutate({ runId: run.id })}
                onCancel={async () => {
                  if (await askConfirm({
                    title: "Cancel this run?",
                    description: "An action already in progress may finish.",
                    confirmLabel: "Cancel run",
                    tone: "danger",
                  })) {
                    cancelMutation.mutate({ runId: run.id });
                  }
                }}
                isRetrying={
                  retryMutation.isPending &&
                  retryMutation.variables?.runId === run.id
                }
                isCancelling={
                  cancelMutation.isPending &&
                  cancelMutation.variables?.runId === run.id
                }
              />
            ))
          )}
        </div>
        <div
          className="flex justify-end p-[14px_17px]"
          style={{ borderTop: "1px solid var(--app-surface-2)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="rounded-[10px] px-4 py-2.5 text-[12.5px] font-bold"
            style={{
              border: "1px solid var(--app-border)",
              color: "var(--app-text-muted)",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function RunHistoryEntry({
  run,
  onRetry,
  onCancel,
  isRetrying,
  isCancelling,
}: {
  run: WorkflowRun;
  onRetry: () => void;
  onCancel: () => void;
  isRetrying: boolean;
  isCancelling: boolean;
}) {
  const colors =
    run.status === "running" || run.status === "waiting"
      ? {
          background: "var(--app-warning-bg)",
          color: "var(--app-warning-text)",
        }
      : run.status === "success"
        ? {
            background: "var(--app-success-bg)",
            color: "var(--app-success-text)",
          }
        : run.status === "failed"
          ? { background: "#FEF3F2", color: "#B42318" }
          : {
              background: "var(--app-surface-2)",
              color: "var(--app-text-muted)",
            };
  const resultText =
    run.result == null ? null : JSON.stringify(run.result, null, 2);
  const actionResults = Array.isArray(run.result) ? run.result : [];
  const aiDrafts = actionResults.flatMap((action) =>
    typeof action === "object" &&
    action !== null &&
    "aiGenerated" in action &&
    action.aiGenerated === true &&
    "output" in action &&
    typeof action.output === "string"
      ? [
          {
            actionIndex:
              "actionIndex" in action && typeof action.actionIndex === "number"
                ? action.actionIndex
                : undefined,
            output: action.output,
          },
        ]
      : [],
  );
  const hasQueuedAction = actionResults.some(
    (action) =>
      typeof action === "object" &&
      action !== null &&
      "queued" in action &&
      action.queued === true,
  );
  const hasCompletedCustomerWriteAction = actionResults.some(
    (action) =>
      typeof action === "object" &&
      action !== null &&
      "type" in action &&
      (action.type === "add_customer_tag" ||
        action.type === "set_customer_custom_field") &&
      "completed" in action &&
      action.completed === true,
  );
  const hasCompleteActionHistory =
    actionResults.length > 0 &&
    actionResults.every(
      (action, index) =>
        typeof action === "object" &&
        action !== null &&
        "actionIndex" in action &&
        action.actionIndex === index,
    );
  const hasUnsupportedAction = actionResults.some(
    (action) =>
      typeof action === "object" &&
      action !== null &&
      "unsupported" in action &&
      action.unsupported === true,
  );
  const hasNonRetryableAction = actionResults.some(
    (action) =>
      typeof action === "object" &&
      action !== null &&
      "retryable" in action &&
      action.retryable === false,
  );
  const hasRetryableAction =
    hasCompleteActionHistory &&
    actionResults.some(
      (action) =>
        typeof action === "object" &&
        action !== null &&
        !("retryable" in action && action.retryable === false) &&
        (("queued" in action && action.queued === false) ||
          ("completed" in action && action.completed === false)),
    );

  return (
    <article
      className="rounded-[12px] p-3"
      style={{ border: "1px solid var(--app-border)" }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-extrabold capitalize"
          style={colors}
        >
          {run.status}
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{
            background: "var(--app-surface-2)",
            color: "var(--app-text-muted)",
          }}
        >
          v{run.workflowVersion}
        </span>
        <span
          className="ml-auto text-[10.5px]"
          style={{ color: "var(--app-text-disabled)" }}
        >
          {formatDate(run.createdAt)}
        </span>
      </div>
      {run.triggerEventId && (
        <p
          className="m-0 mt-2 break-all text-[10.5px]"
          style={{ color: "var(--app-text-disabled)" }}
        >
          Trigger event {run.triggerEventId}
        </p>
      )}
      {run.error && (
        <p className="m-0 mt-2 text-[11.5px]" style={{ color: "#B42318" }}>
          {run.error}
        </p>
      )}
      {run.status === "waiting" && run.waitingUntil && (
        <p
          className="m-0 mt-2 text-[10.5px]"
          style={{ color: "var(--app-text-muted)" }}
        >
          Resumes after {formatDate(run.waitingUntil)}
        </p>
      )}
      {run.executionPlan?.decisions.length ? (
        <div
          className="mt-2 rounded-[8px] p-2"
          style={{
            background: "var(--app-surface-2)",
            color: "var(--app-text-muted)",
          }}
        >
          <p className="m-0 text-[10px] font-bold uppercase">Branch decisions</p>
          {run.executionPlan.decisions.map((decision) => (
            <p key={decision.nodeId} className="m-0 mt-1 text-[10.5px]">
              {decision.nodeId}: {decision.result === "true" ? "matched" : "did not match"}
            </p>
          ))}
        </div>
      ) : null}
      {(run.status === "running" || run.status === "waiting") && (
        <button
          type="button"
          onClick={onCancel}
          disabled={isCancelling}
          className="mt-2 rounded-[8px] px-2.5 py-1.5 text-[10.5px] font-bold disabled:opacity-50"
          style={{
            border: "1px solid var(--app-border)",
            color: "var(--app-text-muted)",
          }}
        >
          {isCancelling
            ? "Cancelling…"
            : run.status === "waiting"
              ? "Cancel waiting run"
              : "Cancel run"}
        </button>
      )}
      {run.status === "failed" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {hasRetryableAction && run.retryCount < MAX_WORKFLOW_RETRIES ? (
            <button
              type="button"
              onClick={onRetry}
              disabled={isRetrying}
              className="rounded-[8px] px-2.5 py-1.5 text-[10.5px] font-bold disabled:opacity-50"
              style={{
                border: "1px solid var(--app-border)",
                color: "var(--app-text-muted)",
              }}
            >
              {isRetrying ? "Retrying…" : "Retry failed actions"}
            </button>
          ) : run.retryCount >= MAX_WORKFLOW_RETRIES ? (
            <span className="text-[10.5px]" style={{ color: "#B42318" }}>
              Retry limit reached ({MAX_WORKFLOW_RETRIES})
            </span>
          ) : (
            <span
              className="text-[10.5px]"
              style={{ color: "var(--app-text-disabled)" }}
            >
              {hasUnsupportedAction
                ? "This saved action is not supported. Fix the workflow and start a new run."
                : hasNonRetryableAction
                  ? "This action cannot be retried for this run. Fix the message or workflow and start a new run."
                  : hasCompleteActionHistory
                    ? "No safely retryable action is available."
                    : "Safe retry unavailable because this run has no complete action-level history."}
            </span>
          )}
          <span
            className="text-[10px]"
            style={{ color: "var(--app-text-disabled)" }}
          >
            {run.retryCount}/{MAX_WORKFLOW_RETRIES} retries used
          </span>
        </div>
      )}
      {hasQueuedAction && (
        <p
          className="m-0 mt-2 text-[10.5px]"
          style={{ color: "var(--app-text-disabled)" }}
        >
          Queued by Noxtill; provider delivery status is tracked separately on
          the message record.
        </p>
      )}
      {hasCompletedCustomerWriteAction && (
        <p
          className="m-0 mt-2 text-[10.5px]"
          style={{ color: "var(--app-text-disabled)" }}
        >
          Customer update complete; the canonical customer record was updated.
        </p>
      )}
      {aiDrafts.map((draft, index) => (
        <section
          key={draft.actionIndex ?? index}
          className="mt-2 rounded-[10px] p-3"
          style={{
            background: "var(--app-surface-2)",
            border: "1px solid var(--app-border)",
          }}
        >
          <p
            className="m-0 text-[10px] font-bold uppercase"
            style={{ color: "var(--app-text-disabled)" }}
          >
            AI-generated draft · review before use
          </p>
          <p
            className="m-0 mt-2 whitespace-pre-wrap text-[12px]"
            style={{ color: "var(--app-text)" }}
          >
            {draft.output}
          </p>
        </section>
      ))}
      <details className="mt-2">
        <summary
          className="cursor-pointer text-[11px] font-semibold"
          style={{ color: "var(--app-text-muted)" }}
        >
          Execution details
        </summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <div>
            <p
              className="m-0 mb-1 text-[10px] font-bold uppercase"
              style={{ color: "var(--app-text-disabled)" }}
            >
              Context
            </p>
            <pre
              className="m-0 max-h-40 overflow-auto rounded-[8px] p-2 text-[10px]"
              style={{
                background: "var(--app-surface-2)",
                color: "var(--app-text-muted)",
              }}
            >
              {JSON.stringify(run.context, null, 2)}
            </pre>
          </div>
          {resultText && (
            <div>
              <p
                className="m-0 mb-1 text-[10px] font-bold uppercase"
                style={{ color: "var(--app-text-disabled)" }}
              >
                Actions
              </p>
              <pre
                className="m-0 max-h-40 overflow-auto rounded-[8px] p-2 text-[10px]"
                style={{
                  background: "var(--app-surface-2)",
                  color: "var(--app-text-muted)",
                }}
              >
                {resultText}
              </pre>
            </div>
          )}
          <div className="sm:col-span-2">
            <p
              className="m-0 mb-1 text-[10px] font-bold uppercase"
              style={{ color: "var(--app-text-disabled)" }}
            >
              Attempt history
            </p>
            {run.attempts?.length ? (
              <div className="grid gap-1.5">
                {run.attempts.map((attempt) => (
                  <div
                    key={attempt.id}
                    className="rounded-[8px] p-2 text-[10.5px]"
                    style={{
                      background: "var(--app-surface-2)",
                      color: "var(--app-text-muted)",
                    }}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">
                        Attempt {attempt.attemptNumber} · {attempt.status}
                      </span>
                      <span style={{ color: "var(--app-text-disabled)" }}>
                        {formatDate(attempt.startedAt)}
                      </span>
                    </div>
                    {attempt.error && (
                      <p className="m-0 mt-1" style={{ color: "#B42318" }}>
                        {attempt.error}
                      </p>
                    )}
                    {attempt.result != null && (
                      <pre className="m-0 mt-1 max-h-32 overflow-auto whitespace-pre-wrap">
                        {JSON.stringify(attempt.result, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p
                className="m-0 rounded-[8px] p-2 text-[10.5px]"
                style={{
                  background: "var(--app-surface-2)",
                  color: "var(--app-text-disabled)",
                }}
              >
                Attempt-by-attempt details are not available for this older run.
              </p>
            )}
          </div>
        </div>
      </details>
    </article>
  );
}
