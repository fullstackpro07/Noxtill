"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cancelSpecialistOrchestration, decideSpecialistAgentAction, downloadSpecialistActionAuditCsv, fetchAiSettings, fetchSpecialistActionAudit, fetchSpecialistAgentConfigurationHistory, fetchSpecialistAgentOperations, fetchSpecialistAgentRunEvidence, fetchSpecialistAgentRunEvents, fetchSpecialistAgentRuns, fetchSpecialistAgentRunToolCalls, fetchSpecialistOrchestrations, retryFailedSpecialistOrchestration, runSpecialistOrchestration, updateAiSettings, type AiFeatureToggles, type SpecialistAgentRunEvent, type SpecialistAgentRunStatus, type SpecialistOrchestrationRun } from "@/lib/ai-settings-api";
import { formatCurrency } from "@/lib/format";
import { useAiAssistantDrawer } from "@/components/assistant/ai-assistant-drawer-context";
import { AI, KpiSkeleton, outlineBtnStyle, primaryBtnStyle } from "@/components/assistant/ai-assistant-ui";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { useSession } from "@/lib/session";
import { NAV_ITEMS, type Role } from "@/lib/nav-items";
import { askConfirm, askText } from "@/lib/ask-dialog";

const ROLE_LABELS: Record<Role, string> = { owner: "Owner", manager: "Manager", staff: "Staff" };
const ROLE_ORDER: Role[] = ["owner", "manager", "staff"];

/** Each AI feature's real reachable roles, derived live from `NAV_ITEMS` (the sidebar's own source
 * of truth) rather than a hand-maintained duplicate — if a module's role list ever changes, this
 * changes with it instead of silently drifting stale. A feature reachable from more than one real
 * entry point (e.g. What-If from both Profit and Products) shows the union of both, since either
 * path genuinely lets that role use it. */
const FEATURE_MODULE_KEYS: Record<keyof AiFeatureToggles, string[]> = {
  voiceEntry: ["ai-assistant"],
  voiceQualityAssist: ["receptionist"],
  voiceMeetingSummary: ["receptionist"],
  photoDigitizer: ["digitizer"],
  reviewReplies: ["reviews"],
  // Real call sites of the `campaign_copy` AI kind: Social's AI Studio and Profit's dead-hours offer.
  campaignCopy: ["social", "profit"],
  insights: ["dashboard", "marketing"],
  whatIf: ["profit", "products"],
  assistant: ["ai-assistant"],
  workflowAgents: ["marketing"],
};

function availableToLabel(featureKey: keyof AiFeatureToggles): string {
  const roles = new Set<Role>();
  for (const moduleKey of FEATURE_MODULE_KEYS[featureKey]) {
    const item = NAV_ITEMS.find((i) => i.key === moduleKey);
    item?.roles.forEach((r) => roles.add(r));
  }
  return ROLE_ORDER.filter((r) => roles.has(r))
    .map((r) => ROLE_LABELS[r])
    .join(", ");
}

const FEATURE_LABELS: Record<keyof AiFeatureToggles, { name: string; note: string }> = {
  voiceEntry: { name: "Voice Entry", note: "Confirmation required before any write" },
  voiceQualityAssist: { name: "Voice QA Suggestions", note: "Transcript-cited drafts; reviewer must verify before saving" },
  voiceMeetingSummary: { name: "Meeting Transcripts & Summaries", note: "Only after a published policy and every attendee's explicit consent; human review required" },
  photoDigitizer: { name: "Photo Digitizer", note: "Extracts rows from a photo — staged for your review" },
  reviewReplies: { name: "Review Replies", note: "Drafts only — you approve before posting" },
  campaignCopy: { name: "Campaign Copy", note: "Never sends without approval" },
  insights: { name: "AI Insights", note: "Refreshes daily on your own data" },
  whatIf: { name: "What-If Simulation", note: "Labelled as simulation, never as actual" },
  assistant: { name: "Assistant & Help", note: "Business Chat and Help Assistant, read-only" },
  workflowAgents: { name: "Workflow AI drafts & agents", note: "Drafts and read-only agent answers in run history — never sent by themselves" },
};

/** Derived from the real, fixed tool registry (`backend/src/assistant/assistant-tools.ts`) — every
 * one of Business Chat's 23 read-only tools maps to one of these modules. There's no per-role
 * restriction on tool access today (any signed-in role can use Business Chat), so unlike the
 * design's mock, this list is genuinely the same for every role — that's disclosed below rather
 * than presented as a per-role matrix that doesn't exist. */
const DATA_ACCESS: { module: string; why: string }[] = [
  { module: "Fast Sale & Orders", why: "Today's and this month's revenue, order totals, top products" },
  { module: "Expenses & Profit", why: "This month's recorded expenses, alongside gross profit" },
  { module: "Inventory", why: "Which products are low, and by how much, against reorder points" },
  { module: "Credit", why: "Outstanding balances, and who owes the most" },
  { module: "Bookings", why: "Upcoming, today's and any given day's appointments, no-show rate" },
  { module: "Reviews", why: "Average rating, open complaints" },
  { module: "Marketing", why: "Campaign performance, messaging quota usage" },
  { module: "Staff", why: "Leaderboard by sales/appointments" },
  { module: "Customers", why: "New customers this month, top spenders, lookup by phone" },
  { module: "Help documentation", why: "Answers how-to questions from real Noxtill docs" },
];

function formatElapsedAge(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function formatSpecialistRunEventName(eventName: string): string {
  const labels: Record<string, string> = {
    "agent.run.created": "Run created",
    "agent.run.started": "Run started",
    "agent.run.completed": "Run completed",
    "agent.run.partial": "Run partially completed",
    "agent.run.failed": "Run failed",
    "agent.run.cancel_requested": "Run cancellation requested",
    "agent.run.cancelled": "Run cancelled",
    "agent.run.skipped": "Run skipped",
    "agent.run.retry_queued": "Run retry queued",
    "agent.run.worker_started": "Queued run picked up by worker",
    "agent.run.child_started": "Specialist started",
    "agent.run.child_completed": "Specialist completed",
    "agent.run.child_partial": "Specialist partially completed",
    "agent.run.child_failed": "Specialist failed",
    "agent.run.child_skipped": "Specialist skipped",
    "agent.action.awaiting_approval": "Action awaiting approval",
    "agent.action.expired": "Action approval expired",
    "agent.action.failed": "Action failed",
    "agent.action.outcome_unknown": "Action outcome unknown · review required",
    "agent.action.verification_outcome_unknown": "Verification outcome unknown · review required",
    "agent.action.outcome_reconciled": "Unknown outcome review closed by owner",
    "agent.action.verification_outcome_reconciled": "Unknown verification review closed by owner",
    "agent.action.verified": "Action verified",
    "agent.action.proposal_updated": "Action proposal updated",
    "agent.action.state_changed": "Action state changed",
    "agent.tool.started": "Tool started",
    "agent.tool.succeeded": "Tool succeeded",
    "agent.tool.refused": "Tool refused",
    "agent.tool.blocked": "Tool blocked",
    "agent.tool.failed": "Tool failed",
  };
  return labels[eventName] ?? eventName;
}

export function AiSettingsView({ currency }: { currency: string }) {
  const session = useSession();
  const isOwner = session.user.role === "owner";
  const [agentFilter, setAgentFilter] = useState("all");
  const [runAgentFilter, setRunAgentFilter] = useState("all");
  const [configAgentFilter, setConfigAgentFilter] = useState("");
  const [errorCodeFilter, setErrorCodeFilter] = useState("all");
  const [actionTypeFilter, setActionTypeFilter] = useState("all");
  const [runStatusFilter, setRunStatusFilter] = useState<"all" | SpecialistAgentRunStatus>("all");
  const [runHistoryCursor, setRunHistoryCursor] = useState<string | null>(null);
  const [runHistoryCursorHistory, setRunHistoryCursorHistory] = useState<string[]>([]);
  const [selectedRunEvidenceId, setSelectedRunEvidenceId] = useState<string | null>(null);
  const [selectedRunToolCallsId, setSelectedRunToolCallsId] = useState<string | null>(null);
  const [selectedRunEventsId, setSelectedRunEventsId] = useState<string | null>(null);
  const [loadedOlderRunEvents, setLoadedOlderRunEvents] = useState<Record<string, { items: SpecialistAgentRunEvent[]; nextCursor: string | null; hasMore: boolean }>>({});
  const runHistoryTableRef = useRef<HTMLDivElement | null>(null);
  const [latestOrchestration, setLatestOrchestration] = useState<SpecialistOrchestrationRun | null>(null);
  const orchestrationIdempotencyKey = useRef<string | null>(null);
  const orchestrationRetryKeys = useRef(new Map<string, string>());
  const { openDisclosure, openLimits } = useAiAssistantDrawer();
  const queryClient = useQueryClient();

  const { data: settings, isPending, isError, error, refetch } = useQuery({ queryKey: ["ai-settings"], queryFn: fetchAiSettings, enabled: isOwner });
  const { data: specialistOperations, isPending: operationsPending, isError: operationsError, refetch: refetchOperations } = useQuery({
    queryKey: ["specialist-agent-operations"],
    queryFn: fetchSpecialistAgentOperations,
    enabled: isOwner,
  });
  const { data: specialistActionAudit, isPending: actionAuditPending, isError: actionAuditError, refetch: refetchActionAudit } = useQuery({
    queryKey: ["specialist-agent-action-audit"],
    queryFn: fetchSpecialistActionAudit,
    enabled: isOwner,
  });
  const selectedConfigAgentKey = configAgentFilter || specialistOperations?.agents[0]?.agentKey || "";
  const { data: specialistConfigHistory, isPending: configHistoryPending, isError: configHistoryError, refetch: refetchConfigHistory } = useQuery({
    queryKey: ["specialist-agent-config-history", selectedConfigAgentKey],
    queryFn: () => fetchSpecialistAgentConfigurationHistory(selectedConfigAgentKey),
    enabled: isOwner && selectedConfigAgentKey.length > 0,
  });
  const { data: orchestrationHistory, isPending: orchestrationsPending, refetch: refetchOrchestrations } = useQuery({
    queryKey: ["specialist-agent-orchestrations"],
    queryFn: fetchSpecialistOrchestrations,
    enabled: isOwner,
    refetchInterval: (query) => {
      const runs = query.state.data?.runs ?? [];
      const runningInHistory = runs.some((run) => run.status === "running" || run.status === "cancel_requested");
      const latestRunInHistory = runs.find((run) => run.id === latestOrchestration?.id);
      const latestActive = latestOrchestration?.status === "running" || latestOrchestration?.status === "cancel_requested";
      return runningInHistory || (latestActive && !latestRunInHistory) ? 2_000 : false;
    },
  });
  const latestSavedOrchestration = latestOrchestration
    ? orchestrationHistory?.runs.find((run) => run.id === latestOrchestration.id) ?? latestOrchestration
    : null;
  const orchestrationRunning = (orchestrationHistory?.runs.some((run) => run.status === "running" || run.status === "cancel_requested") ?? false)
    || latestSavedOrchestration?.status === "running"
    || latestSavedOrchestration?.status === "cancel_requested";
  const { data: specialistRunHistory, isPending: specialistRunsPending, isError: specialistRunsError, refetch: refetchSpecialistRuns } = useQuery({
    queryKey: ["specialist-agent-runs", runAgentFilter, runStatusFilter, runHistoryCursor],
    queryFn: () => fetchSpecialistAgentRuns({
      ...(runAgentFilter !== "all" ? { agentKey: runAgentFilter } : {}),
      ...(runStatusFilter !== "all" ? { status: runStatusFilter } : {}),
      ...(runHistoryCursor ? { cursor: runHistoryCursor } : {}),
    }),
    enabled: isOwner,
    refetchInterval: (query) => {
      const hasActiveRun = query.state.data?.items.some((run) => run.status === "queued" || run.status === "running" || run.status === "cancel_requested");
      return hasActiveRun || orchestrationRunning ? 2_000 : false;
    },
  });
  const { data: selectedRunEvidence, isPending: selectedRunEvidencePending, isError: selectedRunEvidenceError, refetch: refetchSelectedRunEvidence } = useQuery({
    queryKey: ["specialist-agent-run-evidence", selectedRunEvidenceId],
    queryFn: () => fetchSpecialistAgentRunEvidence(selectedRunEvidenceId!),
    enabled: isOwner && selectedRunEvidenceId !== null,
  });
  const { data: selectedRunToolCalls, isPending: selectedRunToolCallsPending, isError: selectedRunToolCallsError, refetch: refetchSelectedRunToolCalls } = useQuery({
    queryKey: ["specialist-agent-run-tool-calls", selectedRunToolCallsId],
    queryFn: () => fetchSpecialistAgentRunToolCalls(selectedRunToolCallsId!),
    enabled: isOwner && selectedRunToolCallsId !== null,
  });
  const { data: selectedRunEvents, isPending: selectedRunEventsPending, isError: selectedRunEventsError, refetch: refetchSelectedRunEvents } = useQuery({
    queryKey: ["specialist-agent-run-events", selectedRunEventsId],
    queryFn: () => fetchSpecialistAgentRunEvents(selectedRunEventsId!),
    enabled: isOwner && selectedRunEventsId !== null,
  });
  useEffect(() => {
    if (!selectedRunEventsId) return;
    const frame = window.requestAnimationFrame(() => {
      runHistoryTableRef.current?.scrollTo({ left: 0 });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedRunEventsId]);
  const operationErrorCodes = [...new Set(
    specialistOperations?.agents.flatMap((agent) => agent.failuresByCode.map((failure) => failure.code)) ?? [],
  )].sort();
  const visibleOperationAgents = (specialistOperations?.agents ?? []).filter((agent) => {
    if (agentFilter !== "all" && agent.agentKey !== agentFilter) return false;
    if (errorCodeFilter === "all") return true;
    if (errorCodeFilter === "unclassified") return agent.unclassifiedFailures > 0;
    return agent.failuresByCode.some((failure) => failure.code === errorCodeFilter);
  });
  const operationActionAgents = (specialistOperations?.agents ?? []).filter(
    (agent) => agentFilter === "all" || agent.agentKey === agentFilter,
  );
  const visibleOperationalAlerts = (specialistOperations?.alerts ?? []).filter(
    (alert) => alert.agentKey === "security" || agentFilter === "all" || alert.agentKey === agentFilter,
  );
  const operationActionTypes = [...new Set(
    operationActionAgents.flatMap((agent) => agent.actionTypes.map((action) => action.actionType)),
  )].sort();
  const visibleOperationActions = operationActionAgents.flatMap((agent) =>
    agent.actionTypes
      .filter((action) => actionTypeFilter === "all" || action.actionType === actionTypeFilter)
      .map((action) => ({ ...action, agentKey: agent.agentKey, agentName: agent.name })),
  ).sort((left, right) => right.count - left.count || left.actionType.localeCompare(right.actionType));

  const toggleMutation = useMutation({
    mutationFn: (key: keyof AiFeatureToggles) => updateAiSettings({ featureToggles: { [key]: !settings?.featureToggles[key] } }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["ai-settings"], updated);
      toast.success("AI Settings updated.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this — please try again."),
  });
  const orchestrationMutation = useMutation({
    mutationFn: () => {
      orchestrationIdempotencyKey.current ??= crypto.randomUUID();
      return runSpecialistOrchestration(orchestrationIdempotencyKey.current);
    },
    onSuccess: (run) => {
      orchestrationIdempotencyKey.current = null;
      setLatestOrchestration(run);
      queryClient.invalidateQueries({ queryKey: ["specialist-agent-orchestrations"] });
      queryClient.invalidateQueries({ queryKey: ["specialist-agent-operations"] });
      queryClient.invalidateQueries({ queryKey: ["specialist-agent-runs"] });
      toast.success("Cross-agent review queued. Progress will update here.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Cross-agent review could not be started."),
  });
  const orchestrationRetryMutation = useMutation({
    mutationFn: ({ runId, idempotencyKey }: { runId: string; idempotencyKey: string }) => retryFailedSpecialistOrchestration(runId, idempotencyKey),
    onSuccess: (run, variables) => {
      orchestrationRetryKeys.current.delete(variables.runId);
      setLatestOrchestration(run);
      queryClient.invalidateQueries({ queryKey: ["specialist-agent-orchestrations"] });
      queryClient.invalidateQueries({ queryKey: ["specialist-agent-operations"] });
      toast.success("Failed specialist reviews queued for retry.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Failed specialist reviews could not be retried."),
  });
  const orchestrationCancelMutation = useMutation({
    mutationFn: (runId: string) => cancelSpecialistOrchestration(runId),
    onSuccess: (run) => {
      setLatestOrchestration(run);
      queryClient.invalidateQueries({ queryKey: ["specialist-agent-orchestrations"] });
      queryClient.invalidateQueries({ queryKey: ["specialist-agent-operations"] });
      toast.success("Stop requested. The current read-only review may finish; no later review will start.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "The cross-agent review could not be stopped."),
  });
  const specialistActionDecisionMutation = useMutation({
    mutationFn: ({ actionId, operation, reason, expectedVersion }: { actionId: string; operation: "approve" | "reject" | "execute" | "cancel" | "source-rfq" | "resolve"; reason?: string; expectedVersion?: number }) =>
      decideSpecialistAgentAction(actionId, operation, { ...(reason ? { reason } : {}), ...(expectedVersion !== undefined ? { expectedVersion } : {}) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["specialist-agent-action-audit"] });
      queryClient.invalidateQueries({ queryKey: ["specialist-agent-operations"] });
      toast.success("The canonical action was updated.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "The canonical action could not be updated."),
  });
  const olderRunEventsMutation = useMutation({
    mutationFn: ({ runId, cursor }: { runId: string; cursor: string }) =>
      fetchSpecialistAgentRunEvents(runId, cursor),
    onSuccess: (page, variables) => {
      setLoadedOlderRunEvents((current) => {
        const previous = current[variables.runId];
        return {
          ...current,
          [variables.runId]: {
            items: [...page.items, ...(previous?.items ?? [])],
            nextCursor: page.nextCursor,
            hasMore: page.hasMore,
          },
        };
      });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Earlier lifecycle events could not be loaded."),
  });

  if (!isOwner) {
    return (
      <main style={{ padding: "16px 22px 26px" }}>
        <div style={{ background: "#fff", border: "1px solid #FDE3B3", borderRadius: 16, padding: "48px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: "#93370D" }}>AI Settings are owner-only</div>
          <div style={{ fontSize: 12.5, color: "#B54708", marginTop: 5 }}>Cost caps, rate limits and feature toggles apply business-wide, so only the owner can change them.</div>
        </div>
      </main>
    );
  }

  if (isError) {
    return (
      <div style={{ margin: 22, background: "#fff", border: "1px solid #FDD9D6", borderRadius: 16, padding: "48px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: "#B42318" }}>{error instanceof ApiError ? error.message : "Couldn't load AI Settings"}</div>
        <button type="button" onClick={() => refetch()} style={{ marginTop: 15, border: 0, background: AI.primary, borderRadius: 12, padding: "12px 22px", fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46 }}>
          Retry
        </button>
      </div>
    );
  }

  const resetsDate = settings ? new Date(settings.usageThisMonth.limitResetsAt) : null;
  const resetsLabel = resetsDate ? `${resetsDate.getUTCDate()} ${resetsDate.toLocaleString("en-US", { month: "long", timeZone: "UTC" })}` : "";
  const maxWeekCount = settings ? Math.max(1, ...settings.queriesThisWeek.map((d) => d.count)) : 1;

  return (
    <main style={{ padding: "16px 22px 26px", display: "flex", flexDirection: "column", gap: 15 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
        {isPending || !settings ? (
          <KpiSkeleton count={3} />
        ) : (
          <>
            <div style={{ background: "#fff", border: `1px solid ${AI.border}`, borderRadius: 14, padding: 15 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#667085" }}>Queries this month</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", marginTop: 6 }}>{settings.usageThisMonth.totalCalls}</div>
              <div style={{ fontSize: 10.5, color: "#98A2B3", marginTop: 3 }}>of {settings.aiQueryQuota} on your plan</div>
            </div>
            <div style={{ background: "#fff", border: `1px solid ${AI.border}`, borderRadius: 14, padding: 15 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#667085" }}>Plan usage</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", marginTop: 6 }}>{settings.usageThisMonth.queryQuotaUsedPercent}%</div>
              <div style={{ height: 7, borderRadius: 6, background: "#F2F4F7", overflow: "hidden", marginTop: 8 }}>
                <div style={{ height: "100%", borderRadius: 6, background: "#12A150", width: `${settings.usageThisMonth.queryQuotaUsedPercent}%` }} />
              </div>
            </div>
            <div style={{ background: "#fff", border: `1px solid ${AI.border}`, borderRadius: 14, padding: 15 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#667085" }}>Limit resets</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A", marginTop: 8 }}>{resetsLabel}</div>
              <div style={{ fontSize: 10.5, color: "#98A2B3", marginTop: 3 }}>Queries pause at the limit — nothing is charged silently</div>
            </div>
          </>
        )}
      </div>

      <div style={{ background: "#fff", border: `1px solid ${AI.border}`, borderRadius: 16, padding: 17 }}>
        <h3 style={{ margin: "0 0 5px", fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Queries this week</h3>
        <div style={{ fontSize: 11, color: "#98A2B3", marginBottom: 13 }}>Counted per question asked, across all AI features</div>
        {isPending || !settings ? (
          <KpiSkeleton count={1} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {settings.queriesThisWeek.map((d) => (
              <div key={d.day} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 34, fontSize: 11.5, fontWeight: 700, color: "#344054" }}>{d.day}</span>
                <span style={{ flex: 1, height: 12, borderRadius: 6, background: "#F2F4F7", overflow: "hidden" }}>
                  <span style={{ display: "block", height: "100%", borderRadius: 6, background: "#BFE7CF", width: `${Math.round((d.count / maxWeekCount) * 100)}%` }} />
                </span>
                <span style={{ width: 34, fontSize: 12, fontWeight: 800, color: "#101828", textAlign: "right" }}>{d.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <section aria-labelledby="specialist-operations-heading" style={{ background: "#fff", border: `1px solid ${AI.border}`, borderRadius: 16, overflow: "hidden" }}>
        <div style={{ padding: "14px 17px", borderBottom: "1px solid #F0F2F5", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h3 id="specialist-operations-heading" style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Specialist agent operations</h3>
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "#98A2B3" }}>This business · last {specialistOperations?.windowDays ?? 30} days · refreshed from saved runs</p>
          </div>
          <label style={{ display: "grid", gap: 4, fontSize: 10.5, color: "#667085" }}>
            Agent
            <select aria-label="Filter specialist operations by agent" value={agentFilter} onChange={(event) => setAgentFilter(event.target.value)} style={{ border: `1px solid ${AI.border}`, borderRadius: 8, background: "#fff", padding: "7px 9px", color: "#344054" }}>
              <option value="all">All agents</option>
              {specialistOperations?.agents.map((agent) => <option key={agent.agentKey} value={agent.agentKey}>{agent.name}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 10.5, color: "#667085" }}>
            Error code
            <select aria-label="Filter specialist operations by error code" value={errorCodeFilter} onChange={(event) => setErrorCodeFilter(event.target.value)} style={{ border: `1px solid ${AI.border}`, borderRadius: 8, background: "#fff", padding: "7px 9px", color: "#344054" }}>
              <option value="all">All failures</option>
              <option value="unclassified">Unclassified</option>
              {operationErrorCodes.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => void refetchOperations()} style={outlineBtnStyle}>Refresh operations</button>
        </div>
        {operationsPending ? <div style={{ padding: 17 }}><KpiSkeleton count={2} /></div> : operationsError || !specialistOperations ? (
          <div role="alert" style={{ padding: 17, color: "#B42318", fontSize: 12 }}>
            Specialist operations could not be loaded.
            <button type="button" onClick={() => void refetchOperations()} style={{ ...outlineBtnStyle, marginLeft: 10 }}>Retry</button>
          </div>
        ) : (
          <>
            <div
              role="region"
              aria-label="Specialist operational alerts"
              style={{ margin: "13px 17px 0", padding: 12, border: `1px solid ${AI.border}`, borderRadius: 10, background: "#FAFBFC" }}
            >
              <div style={{ fontSize: 12, fontWeight: 750, color: "#101828" }}>
                Current operational alerts · {visibleOperationalAlerts.length}
              </div>
              {visibleOperationalAlerts.length ? (
                <ul style={{ margin: "9px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 7 }}>
                  {visibleOperationalAlerts.map((alert, index) => {
                    const critical = alert.severity === "critical";
                    const color = critical ? "#B42318" : "#B54708";
                    const background = critical ? "#FEF3F2" : "#FFFAEB";
                    const observed = alert.unit === "USD"
                      ? formatCurrency(alert.observedValue, "USD")
                      : alert.observedValue.toLocaleString("en-US");
                    const limit = alert.thresholdValue === null
                      ? ""
                      : ` · ${observed} / ${alert.unit === "USD" ? formatCurrency(alert.thresholdValue, "USD") : alert.thresholdValue.toLocaleString("en-US")}`;
                    return (
                      <li
                        key={`${alert.agentKey}-${alert.code}-${index}`}
                        style={{ padding: "8px 10px", borderRadius: 8, background, color: "#344054", fontSize: 11.5 }}
                      >
                        <strong style={{ color }}>{critical ? "Critical" : "Warning"} · {alert.agentName}</strong>
                        <span> · {alert.message}{limit}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div role="status" style={{ marginTop: 6, fontSize: 11.5, color: "#667085" }}>
                  No alert condition is present in the saved data for this view.
                </div>
              )}
              <div style={{ marginTop: 7, fontSize: 10.5, color: "#98A2B3" }}>
                Based on recorded failures, verification events, open material actions, sampled evidence freshness, monthly AI limits and the limited security-denial counters shown below. Budget bands are 70% and 90%; estimated spend is not a provider invoice. Cost-spike detection, provider health checks and live alert delivery are not available here.
              </div>
            </div>
            <div style={{ padding: "13px 17px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
              {[
                { label: "Saved runs", value: visibleOperationAgents.reduce((sum, agent) => sum + agent.totalRuns, 0) },
                { label: "Recommendations", value: visibleOperationAgents.reduce((sum, agent) => sum + agent.totalRecommendations, 0) },
                { label: "Material actions", value: visibleOperationAgents.reduce((sum, agent) => sum + Object.values(agent.actionStateCounts).reduce((count, value) => count + value, 0), 0) },
                { label: "Logged tool labels", value: visibleOperationAgents.reduce((sum, agent) => sum + Object.values(agent.recordedToolCounts).reduce((count, value) => count + value, 0), 0) },
                { label: "Persisted registered tool calls", value: visibleOperationAgents.reduce((sum, agent) => sum + agent.persistedToolCalls.total, 0) },
                { label: "Failed runs", value: visibleOperationAgents.reduce((sum, agent) => sum + (agent.statusCounts.failed ?? 0), 0) },
                { label: "Persisted queued runs", value: visibleOperationAgents.reduce((sum, agent) => sum + (agent.queuedRuns?.count ?? 0), 0) },
                { label: "Currently running", value: visibleOperationAgents.reduce((sum, agent) => sum + (agent.activeRuns?.count ?? 0), 0) },
                { label: "Linked AI attempts", value: visibleOperationAgents.reduce((sum, agent) => sum + agent.aiUsage.calls, 0) },
                { label: "App-estimated AI cost", value: formatCurrency(visibleOperationAgents.reduce((sum, agent) => sum + agent.aiUsage.estimatedCostUsd, 0), currency) },
                { label: "Audited cross-tenant run probes · business-wide", value: specialistOperations.securityEvents.auditedCrossTenantRunProbeDenials },
                { label: "Stopped queued runs after owner access changes · business-wide", value: specialistOperations.securityEvents.auditedOrchestrationAuthorizationDenials },
                { label: "Stopped tool calls after initiating-user access changes · business-wide", value: specialistOperations.securityEvents.auditedAgentToolAuthorizationDenials },
                { label: "Audited cross-business action probes · business-wide", value: specialistOperations.securityEvents.auditedActionCrossTenantProbeDenials },
                { label: "Agent/source-module policy refusals · business-wide", value: specialistOperations.securityEvents.auditedActionPolicyDenials },
                { label: "Audited Commerce tool blocks · business-wide", value: specialistOperations.securityEvents.auditedCommerceToolCallBlocks },
                { label: "Persisted registered tool refusals · 30 days", value: specialistOperations.securityEvents.persistedToolCallRefusals },
                { label: "Audited Commerce approval refusals · business-wide", value: specialistOperations.securityEvents.auditedCommerceApprovalRefusals },
                { label: "Audited Customer Agent message queue refusals · business-wide", value: specialistOperations.securityEvents.auditedCustomerMessageQueueRefusals },
              ].map((metric) => (
                <div key={metric.label} style={{ background: "#FAFBFC", border: `1px solid ${AI.border}`, borderRadius: 10, padding: 11 }}>
                  <div style={{ fontSize: 10.5, color: "#667085" }}>{metric.label}</div>
                  <div style={{ marginTop: 4, fontSize: 18, fontWeight: 800, color: "#101828" }}>{metric.value}</div>
                </div>
              ))}
            </div>
            <div
              role="region"
              aria-label="Recent specialist security denials"
              style={{ margin: "0 17px 13px", padding: 12, border: `1px solid ${AI.border}`, borderRadius: 10, background: "#FAFBFC", color: "#475467", fontSize: 11.5 }}
            >
              <strong style={{ color: "#101828" }}>
                Recent security denials · last {specialistOperations.windowDays} days · {specialistOperations.securityDenials.length}
              </strong>
              {specialistOperations.securityDenials.length ? (
                <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
                  {specialistOperations.securityDenials.map((event) => (
                    <li key={`${event.source}-${event.id}`} style={{ padding: "7px 9px", border: `1px solid ${AI.border}`, borderRadius: 8, background: "#fff" }}>
                      <strong style={{ color: "#344054" }}>{event.event}</strong>
                      <span> · {event.source === "audit_log" ? "Audit log" : "Registered tool call"} · {new Date(event.occurredAt).toLocaleString()}</span>
                      <div style={{ marginTop: 3, color: "#667085" }}>
                        {event.agentKey && event.toolKey ? `${event.agentKey} · ${event.toolKey} · ` : ""}
                        {event.targetType} {event.targetId}
                        {event.actorUserId ? ` · actor ${event.actorUserId}` : ""}
                        {event.errorCode ? ` · ${event.errorCode}` : ""}
                        {event.correlationId ? ` · ${event.correlationId}` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div role="status" style={{ marginTop: 5, color: "#667085" }}>
                  No matching denied-access or blocked-tool events were recorded in this window.
                </div>
              )}
              <div style={{ marginTop: 7, color: "#98A2B3", fontSize: 10.5 }}>
                Event payloads are excluded. This view includes only the event types listed in the security counters and blocked/refused registered tool-call records; it is not a complete security-event feed.
              </div>
            </div>
            <div
              role="region"
              aria-label="Recent specialist budget-limit events"
              style={{ margin: "0 17px 13px", padding: 12, border: `1px solid ${AI.border}`, borderRadius: 10, background: "#FAFBFC", color: "#475467", fontSize: 11.5 }}
            >
              <strong style={{ color: "#101828" }}>
                Agent budget limits reached · last {specialistOperations.windowDays} days · {specialistOperations.budgetLimitEvents.length}
              </strong>
              {specialistOperations.budgetLimitEvents.length ? (
                <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
                  {specialistOperations.budgetLimitEvents.map((event) => (
                    <li key={event.id} style={{ padding: "7px 9px", border: `1px solid ${AI.border}`, borderRadius: 8, background: "#fff" }}>
                      <strong style={{ color: "#344054" }}>{event.agentKey}</strong>
                      <span> · {event.limitCode} · {new Date(event.occurredAt).toLocaleString()}</span>
                      <div style={{ marginTop: 3, color: "#667085" }}>
                        Review run {event.targetId}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div role="status" style={{ marginTop: 5, color: "#667085" }}>
                  No specialist budget limit was reached in this window.
                </div>
              )}
              <div style={{ marginTop: 7, color: "#98A2B3", fontSize: 10.5 }}>
                One redacted event is kept per agent and limit code per UTC month. Prompt and provider response content are excluded.
              </div>
            </div>
            <div
              role="region"
              aria-label="Cross-agent worker pickup"
              style={{ margin: "0 17px 13px", padding: 12, border: `1px solid ${AI.border}`, borderRadius: 10, background: "#FAFBFC", color: "#475467", fontSize: 11.5 }}
            >
              <strong style={{ color: "#101828" }}>Cross-agent worker pickup · shared orchestration</strong>
              {specialistOperations.orchestrationQueueWait ? (
                <>
                  <div style={{ marginTop: 4 }}>
                    {specialistOperations.orchestrationQueueWait.sampleCount
                      ? `Saved review to first worker pickup: ${specialistOperations.orchestrationQueueWait.p50Ms} ms p50 / ${specialistOperations.orchestrationQueueWait.p95Ms} ms p95 (${specialistOperations.orchestrationQueueWait.sampleCount}${specialistOperations.orchestrationQueueWait.sampleCount === specialistOperations.orchestrationQueueWait.sampleLimit ? "+ sample" : " sample"})`
                      : "No first worker pickup measured in this window"}
                  </div>
                  <div style={{ marginTop: 3, color: "#667085" }}>
                    {specialistOperations.orchestrationQueueWait.waitingCount} saved review(s) awaiting first pickup
                    {specialistOperations.orchestrationQueueWait.waitingCount > 0
                      ? ` · oldest ${specialistOperations.orchestrationQueueWait.oldestWaitingAgeMs === null ? "age unavailable" : formatElapsedAge(specialistOperations.orchestrationQueueWait.oldestWaitingAgeMs)}`
                      : " · none currently waiting"}
                  </div>
                </>
              ) : (
                <div role="status" style={{ marginTop: 4 }}>
                  Queue pickup metrics are unavailable in the current API response.
                </div>
              )}
              <div style={{ marginTop: 3, color: "#667085" }}>
                Measures from saved parent-run creation to first persisted worker pickup. This is not a worker-health or queue-depth monitor.
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1780 }}>
                <thead><tr style={{ background: "#FAFBFC" }}>
                  <th style={{ textAlign: "left", fontSize: 10.5, color: "#98A2B3", padding: "9px 17px" }}>Agent / module</th>
                  <th style={{ textAlign: "left", fontSize: 10.5, color: "#98A2B3", padding: 9 }}>Saved run statuses</th>
                  <th style={{ textAlign: "left", fontSize: 10.5, color: "#98A2B3", padding: 9 }}>Recommendations by status</th>
                  <th style={{ textAlign: "left", fontSize: 10.5, color: "#98A2B3", padding: 9 }}>AI tool/context labels & registered calls</th>
                  <th style={{ textAlign: "left", fontSize: 10.5, color: "#98A2B3", padding: 9 }}>Saved evidence freshness & source timestamps</th>
                  <th style={{ textAlign: "left", fontSize: 10.5, color: "#98A2B3", padding: 9 }}>Material actions · approvals · verification</th>
                  <th style={{ textAlign: "left", fontSize: 10.5, color: "#98A2B3", padding: 9 }}>Triggers · manual / scheduled / event</th>
                  <th style={{ textAlign: "left", fontSize: 10.5, color: "#98A2B3", padding: 9 }}>Finished-run latency · p50 / p95</th>
                  <th style={{ textAlign: "left", fontSize: 10.5, color: "#98A2B3", padding: 9 }}>Successful AI provider latency · p50 / p95</th>
                <th style={{ textAlign: "left", fontSize: 10.5, color: "#98A2B3", padding: 9 }}>Current month · AI budget</th>
                <th style={{ textAlign: "left", fontSize: 10.5, color: "#98A2B3", padding: 9 }}>Failed AI provider calls</th>
                  <th style={{ textAlign: "right", fontSize: 10.5, color: "#98A2B3", padding: "9px 17px" }}>AI usage · provider attempts / tokens / estimated cost</th>
                </tr></thead>
                <tbody>{visibleOperationAgents.map((agent) => (
                  <tr key={agent.agentKey} style={{ borderTop: "1px solid #F2F4F7" }}>
                    <td style={{ padding: "11px 17px", fontSize: 11.5, color: "#344054" }}>
                      <strong style={{ display: "block", color: "#101828" }}>{agent.name}</strong>
                      <span style={{ color: "#98A2B3" }}>Module {agent.moduleId} · {agent.totalRuns} saved runs · {agent.uniqueOperators} user-initiated operators in this 30-day window</span>
                      {agent.failuresByCode.length || agent.unclassifiedFailures ? (
                        <div style={{ marginTop: 4, color: "#B42318" }}>
                          Failures: {[...agent.failuresByCode.map((failure) => `${failure.code} (${failure.count})`), ...(agent.unclassifiedFailures ? [`Unclassified (${agent.unclassifiedFailures})`] : [])].join(" · ")}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ padding: 9, fontSize: 11, color: "#475467" }}>
                      {Object.entries(agent.statusCounts)
                        .filter(([, count]) => count > 0)
                        .sort(([left], [right]) => {
                          const preferred = ["completed", "failed", "running"];
                          const leftIndex = preferred.indexOf(left);
                          const rightIndex = preferred.indexOf(right);
                          if (leftIndex !== -1 || rightIndex !== -1) {
                            return (leftIndex === -1 ? preferred.length : leftIndex) -
                              (rightIndex === -1 ? preferred.length : rightIndex);
                          }
                          return left.localeCompare(right);
                        })
                        .map(([status, count]) => `${status.replaceAll("_", " ")} ${count}`)
                        .join(" · ") || "No saved runs"}
                      <div style={{ marginTop: 4, color: "#667085" }}>
                        {agent.activeRuns?.count
                          ? `${agent.activeRuns.count} currently running · oldest ${agent.activeRuns.oldestAgeMs === null ? "age unavailable" : formatElapsedAge(agent.activeRuns.oldestAgeMs)}`
                          : "No current running run"}
                      </div>
                      <div style={{ marginTop: 4, color: "#667085" }}>
                        {agent.queuedRuns?.count
                          ? `${agent.queuedRuns.count} saved as queued · oldest ${agent.queuedRuns.oldestAgeMs === null ? "age unavailable" : formatElapsedAge(agent.queuedRuns.oldestAgeMs)}`
                          : "No saved queued runs"}
                      </div>
                    </td>
                    <td style={{ padding: 9, fontSize: 11, color: "#475467" }}>
                      {Object.entries(agent.recommendationStatusCounts ?? {})
                        .filter(([, count]) => count > 0)
                        .sort(([left], [right]) => left.localeCompare(right))
                        .map(([status, count]) => `${status.replaceAll("_", " ")} ${count}`)
                        .join(" · ") || "No recommendations"}
                    </td>
                    <td style={{ padding: 9, fontSize: 11, color: "#475467", minWidth: 190 }}>
                      {Object.entries(agent.recordedToolCounts)
                        .filter(([, count]) => count > 0)
                        .sort(([left], [right]) => left.localeCompare(right))
                        .map(([tool, count]) => `${tool} ${count}`)
                        .join(" · ") || "No tool/context metadata logged"}
                      <div style={{ marginTop: 4, color: "#667085" }}>
                        Persisted registered calls: {agent.persistedToolCalls.total}
                        {Object.entries(agent.persistedToolCalls.statusCounts).length
                          ? ` · ${Object.entries(agent.persistedToolCalls.statusCounts).sort(([left], [right]) => left.localeCompare(right)).map(([status, count]) => `${status} ${count}`).join(" · ")}`
                          : " · no call records"}
                      </div>
                      <div style={{ marginTop: 4, color: "#667085" }}>
                        {agent.registeredToolStatusByKey.length
                          ? `Registered tool outcomes · ${agent.registeredToolStatusByKey
                              .map((tool) =>
                                `${tool.toolKey}: ${tool.total} total (${Object.entries(tool.statusCounts)
                                  .sort(([left], [right]) => left.localeCompare(right))
                                  .map(([status, count]) => `${status} ${count}`)
                                  .join(" · ")})`,
                              )
                              .join(" · ")}`
                          : "No per-tool status records in this window"}
                      </div>
                      <div style={{ marginTop: 4, color: "#667085" }}>
                        {agent.registeredToolExecutionByKey.length
                          ? `Registered tool elapsed · ${agent.registeredToolExecutionByKey.map((tool) => `${tool.toolKey}: ${tool.p50Ms ?? "not available"} ms p50 / ${tool.p95Ms ?? "not available"} ms p95 (${tool.sampleCount}${tool.sampleCount === tool.sampleLimit ? "+" : ""})`).join(" · ")}`
                          : "No timed registered calls measured"}
                      </div>
                      {agent.agentKey === "autonomous_commerce" ? (
                        <div style={{ marginTop: 4, color: "#667085" }}>
                          {agent.toolExecutionByKey.length
                            ? `Commerce registry elapsed · ${agent.toolExecutionByKey
                                .map(
                                  (tool) =>
                                    `${tool.toolKey}: ${tool.p50Ms ?? "not available"} ms p50 / ${tool.p95Ms ?? "not available"} ms p95 (${tool.sampleCount}${tool.sampleCount === tool.sampleLimit ? "+" : ""})`,
                                )
                                .join(" · ")}`
                            : "No completed or failed Commerce registry calls measured"}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ padding: 9, fontSize: 11, color: "#475467", minWidth: 220 }}>
                      {agent.evidence.sampledRecords ? (
                        <>
                          <div>{agent.evidence.sampledRecords} saved evidence record(s) in the business sample (limit {agent.evidence.sampleLimit})</div>
                          <div style={{ marginTop: 3, color: "#667085" }}>
                            Recorded freshness: {Object.entries(agent.evidence.freshnessCounts).sort(([left], [right]) => left.localeCompare(right)).map(([state, count]) => `${state} ${count}`).join(" · ")}
                          </div>
                          <div style={{ marginTop: 3, color: "#667085" }}>
                            Sources: {Object.entries(agent.evidence.sourceTypeCounts).sort(([left], [right]) => left.localeCompare(right)).map(([source, count]) => `${source} ${count}`).join(" · ")}
                          </div>
                          <div style={{ marginTop: 3, color: "#667085" }}>
                            Latest fetch: {agent.evidence.latestFetchedAt ? new Date(agent.evidence.latestFetchedAt).toLocaleString() : "not recorded"}
                            {agent.evidence.latestFetchObservedAt ? ` · source observed ${new Date(agent.evidence.latestFetchObservedAt).toLocaleString()}` : ""}
                          </div>
                        </>
                      ) : "No specialist evidence saved in this 30-day window"}
                    </td>
                    <td style={{ padding: 9, fontSize: 11, color: "#475467", minWidth: 230 }}>
                      <div>{Object.entries(agent.actionStateCounts)
                        .filter(([, count]) => count > 0)
                        .sort(([left], [right]) => left.localeCompare(right))
                        .map(([state, count]) => `${state.replaceAll("_", " ")} ${count}`)
                        .join(" · ") || "No material actions"}</div>
                      <div style={{ marginTop: 3, color: "#667085" }}>
                        Proposal revisions: {agent.proposalRevisionCount} · Approval events: {agent.approvalDecisions.approved} approved / {agent.approvalDecisions.rejected} rejected · rejection share {agent.approvalDecisions.rejectedSharePercent === null ? "not available" : `${agent.approvalDecisions.rejectedSharePercent}%`} of {agent.approvalDecisions.decisionEvents} decision events · Verification: {agent.verificationOutcomes.verified} verified / {agent.verificationOutcomes.failed} failed / {agent.verificationOutcomes.unknown} currently open · failure share {agent.verificationOutcomes.failedSharePercent === null ? "not available" : `${agent.verificationOutcomes.failedSharePercent}%`} of {agent.verificationOutcomes.verificationEvents} verification events · {agent.actionExecutionAttempts} execution attempts
                      </div>
                      <div style={{ marginTop: 3, color: "#667085" }}>
                        Action execution time: {agent.actionExecutionLatency.sampleCount
                          ? `${agent.actionExecutionLatency.p50Ms} ms p50 / ${agent.actionExecutionLatency.p95Ms} ms p95 (${agent.actionExecutionLatency.sampleCount}${agent.actionExecutionLatency.sampleCount === agent.actionExecutionLatency.sampleLimit ? "+ sample" : " sample"})`
                          : "No complete action execution measured"}
                      </div>
                      <div style={{ marginTop: 3, color: "#667085" }}>
                        Open actions awaiting attention · business-wide: {agent.openActionAttention.count}
                        {agent.openActionAttention.count > 0
                          ? ` · oldest last updated ${agent.openActionAttention.oldestUpdatedAgeMs === null ? "age unavailable" : formatElapsedAge(agent.openActionAttention.oldestUpdatedAgeMs)}`
                          : " · none currently open"}
                      </div>
                    </td>
                    <td style={{ padding: 9, fontSize: 11, color: "#475467" }}>
                      {agent.triggerCounts.manual ?? 0} / {agent.triggerCounts.scheduled ?? 0} / {agent.triggerCounts.event ?? 0}
                    </td>
                    <td style={{ padding: 9, fontSize: 11, color: "#475467" }}>
                      {agent.finishedRunLatency.sampleCount
                        ? `${agent.finishedRunLatency.p50Ms} ms / ${agent.finishedRunLatency.p95Ms} ms (${agent.finishedRunLatency.sampleCount}${agent.finishedRunLatency.sampleCount === agent.finishedRunLatency.sampleLimit ? "+ sample" : " sample"})`
                        : "No finished run measured"}
                    </td>
                    <td style={{ padding: 9, fontSize: 11, color: "#475467" }}>
                      <div>
                        Successful: {agent.providerLatency.sampleCount
                          ? `${agent.providerLatency.p50Ms} ms p50 / ${agent.providerLatency.p95Ms} ms p95 (${agent.providerLatency.sampleCount}${agent.providerLatency.sampleCount === agent.providerLatency.sampleLimit ? "+" : ""})`
                          : "no measured call"}
                      </div>
                      <div style={{ marginTop: 3, color: "#667085" }}>
                        Failed: {agent.providerFailureLatency.sampleCount
                          ? `${agent.providerFailureLatency.p50Ms} ms p50 / ${agent.providerFailureLatency.p95Ms} ms p95 (${agent.providerFailureLatency.sampleCount}${agent.providerFailureLatency.sampleCount === agent.providerFailureLatency.sampleLimit ? "+" : ""})`
                          : "no measured call"}
                      </div>
                    </td>
                    <td style={{ padding: 9, fontSize: 11, color: "#475467", minWidth: 170 }}>
                      {agent.monthlyBudget ? (
                        <>
                          <div>{agent.monthlyBudget.requestsUsed} / {agent.monthlyBudget.requestLimit ?? "no limit"} requests</div>
                          <div style={{ marginTop: 3 }}>{formatCurrency(agent.monthlyBudget.estimatedSpendUsd, "USD")} / {agent.monthlyBudget.spendLimitUsd === null ? "no spend limit" : formatCurrency(agent.monthlyBudget.spendLimitUsd, "USD")}</div>
                          {agent.monthlyBudget.reservedSpendUsd > 0 ? <div style={{ marginTop: 3, color: "#667085" }}>{formatCurrency(agent.monthlyBudget.reservedSpendUsd, "USD")} reserved for pending or failed attempts</div> : null}
                        </>
                      ) : "Budget usage unavailable"}
                    </td>
                    <td style={{ padding: 9, fontSize: 11, color: agent.providerFailureCalls ? "#B42318" : "#475467" }}>
                      {agent.providerFailureCalls}
                      {agent.providerFailureCalls > 0 ? (
                        <div style={{ marginTop: 3, color: "#667085" }}>
                          {agent.providerFailureCodes.length
                            ? agent.providerFailureCodes.map((failure) => `${failure.code} ${failure.count}`).join(" · ")
                            : "No safe failure code recorded"}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ padding: "11px 17px", textAlign: "right", fontSize: 11, color: "#475467" }}>
                      {agent.aiUsage.calls} attempts · {(agent.aiUsage.inputTokens + agent.aiUsage.outputTokens).toLocaleString()} tokens · {formatCurrency(agent.aiUsage.estimatedCostUsd, currency)}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
              {!visibleOperationAgents.length ? <div role="status" style={{ padding: 14, color: "#667085", fontSize: 11.5 }}>No saved runs match these module and error-code filters.</div> : null}
            </div>
            <div style={{ padding: "11px 17px", borderTop: "1px solid #F0F2F5", display: "grid", gap: 4 }}>
              {specialistOperations.disclosures.map((disclosure) => <div key={disclosure} style={{ fontSize: 10.5, color: "#667085", lineHeight: 1.5 }}>{disclosure}</div>)}
            </div>
            <div style={{ padding: "14px 17px", borderTop: "1px solid #F0F2F5" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 9 }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: "#101828" }}>Material action types</h4>
                  <p style={{ margin: "4px 0 0", fontSize: 10.5, color: "#667085" }}>Actions created and execution transitions in this 30-day window. Execution time uses persisted start-to-terminal events; it is not provider-tool latency or business impact. Run and provider metrics above remain unfiltered by action type.</p>
                </div>
                <label style={{ display: "grid", gap: 4, fontSize: 10.5, color: "#667085" }}>
                  Action type
                  <select aria-label="Filter specialist operations by action type" value={actionTypeFilter} onChange={(event) => setActionTypeFilter(event.target.value)} style={{ border: `1px solid ${AI.border}`, borderRadius: 8, background: "#fff", padding: "7px 9px", color: "#344054" }}>
                    <option value="all">All action types</option>
                    {operationActionTypes.map((actionType) => <option key={actionType} value={actionType}>{actionType.replaceAll("_", " ")}</option>)}
                  </select>
                </label>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                  <thead><tr style={{ background: "#FAFBFC" }}>
                    <th style={{ textAlign: "left", fontSize: 10.5, color: "#98A2B3", padding: "8px 10px" }}>Agent</th>
                    <th style={{ textAlign: "left", fontSize: 10.5, color: "#98A2B3", padding: 8 }}>Action type</th>
                    <th style={{ textAlign: "right", fontSize: 10.5, color: "#98A2B3", padding: 8 }}>Actions</th>
                    <th style={{ textAlign: "left", fontSize: 10.5, color: "#98A2B3", padding: 8 }}>Persisted states</th>
                    <th style={{ textAlign: "right", fontSize: 10.5, color: "#98A2B3", padding: "8px 10px" }}>Execution attempts</th>
                    <th style={{ textAlign: "right", fontSize: 10.5, color: "#98A2B3", padding: "8px 10px" }}>Execution time · p50 / p95</th>
                  </tr></thead>
                  <tbody>{visibleOperationActions.map((action) => (
                    <tr key={`${action.agentKey}:${action.actionType}`} style={{ borderTop: "1px solid #F2F4F7" }}>
                      <td style={{ padding: "9px 10px", fontSize: 11, color: "#344054" }}>{action.agentName}</td>
                      <td style={{ padding: 8, fontSize: 11, color: "#344054" }}>{action.actionType.replaceAll("_", " ")}</td>
                      <td style={{ padding: 8, textAlign: "right", fontSize: 11, fontWeight: 700, color: "#101828" }}>{action.count}</td>
                      <td style={{ padding: 8, fontSize: 11, color: "#475467" }}>{Object.entries(action.stateCounts).sort(([left], [right]) => left.localeCompare(right)).map(([state, count]) => `${state.replaceAll("_", " ")} ${count}`).join(" · ")}</td>
                      <td style={{ padding: "9px 10px", textAlign: "right", fontSize: 11, color: "#475467" }}>{action.executionAttempts}</td>
                      <td style={{ padding: "9px 10px", textAlign: "right", fontSize: 11, color: "#475467" }}>{action.executionLatency.sampleCount ? `${action.executionLatency.p50Ms} ms / ${action.executionLatency.p95Ms} ms (${action.executionLatency.sampleCount}${action.executionLatency.sampleCount === action.executionLatency.sampleLimit ? "+ sample" : " sample"})` : "No complete execution measured"}</td>
                    </tr>
                  ))}</tbody>
                </table>
                {!visibleOperationActions.length ? <div role="status" style={{ padding: 12, color: "#667085", fontSize: 11.5 }}>No material actions match this module and action type.</div> : null}
              </div>
            </div>
            <section aria-labelledby="specialist-action-audit-heading" style={{ borderTop: "1px solid #F0F2F5" }}>
              <div style={{ padding: "14px 17px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <h4 id="specialist-action-audit-heading" style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: "#101828" }}>Material action audit trail</h4>
                  <p style={{ margin: "4px 0 0", fontSize: 10.5, color: "#667085" }}>Saved approval, execution and verification transitions for this business.</p>
                </div>
                <button type="button" onClick={() => void refetchActionAudit()} style={outlineBtnStyle}>Refresh audit</button>
                <button type="button" disabled={!specialistActionAudit || actionAuditPending} onClick={() => specialistActionAudit && downloadSpecialistActionAuditCsv(specialistActionAudit)} style={{ ...outlineBtnStyle, opacity: !specialistActionAudit || actionAuditPending ? .6 : 1 }}>Download audit CSV</button>
              </div>
              {actionAuditPending ? <div style={{ padding: "0 17px 14px", color: "#667085", fontSize: 11.5 }}>Loading saved action history…</div> : actionAuditError || !specialistActionAudit ? (
                <div role="alert" style={{ padding: "0 17px 14px", color: "#B42318", fontSize: 11.5 }}>The action audit trail could not be loaded. <button type="button" onClick={() => void refetchActionAudit()} style={outlineBtnStyle}>Retry</button></div>
              ) : (
                <>
                  <div style={{ padding: "0 17px 10px", color: "#667085", fontSize: 10.5, lineHeight: 1.5 }}>{specialistActionAudit.disclosure}</div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1120 }}>
                      <thead><tr style={{ background: "#FAFBFC" }}>
                        <th style={{ textAlign: "left", fontSize: 10.5, color: "#98A2B3", padding: "8px 17px" }}>Created</th>
                        <th style={{ textAlign: "left", fontSize: 10.5, color: "#98A2B3", padding: 8 }}>Agent / action</th>
                        <th style={{ textAlign: "left", fontSize: 10.5, color: "#98A2B3", padding: 8 }}>Canonical target</th>
                        <th style={{ textAlign: "left", fontSize: 10.5, color: "#98A2B3", padding: 8 }}>State / risk</th>
                        <th style={{ textAlign: "left", fontSize: 10.5, color: "#98A2B3", padding: 8 }}>Approval / execution</th>
                        <th style={{ textAlign: "left", fontSize: 10.5, color: "#98A2B3", padding: "8px 17px" }}>Timeline</th>
                      </tr></thead>
                      <tbody>{specialistActionAudit.actions.map((action) => {
                        const actionAgent = specialistOperations?.agents.find((agent) => agent.agentKey === action.agentKey);
                        const approvalExpired = action.state === "approval_required" && action.approvalExpiresAt !== null && Date.parse(action.approvalExpiresAt) <= Date.now();
                        return (
                          <Fragment key={action.id}>
                            <tr style={{ borderTop: "1px solid #F2F4F7" }}>
                              <td style={{ padding: "10px 17px", fontSize: 10.5, color: "#475467", whiteSpace: "nowrap" }}>{new Date(action.createdAt).toLocaleString()}</td>
                              <td style={{ padding: 8, fontSize: 10.5, color: "#344054" }}><strong>{actionAgent?.name ?? action.agentKey}</strong><div>{action.actionType.replaceAll("_", " ")}</div><div style={{ color: "#667085" }}>Proposal version: {action.expectedVersion ?? "not recorded"}</div><div style={{ color: "#98A2B3" }}>Action {action.id}</div></td>
                              <td style={{ padding: 8, fontSize: 10.5, color: "#344054" }}>{action.detailsRedacted ? <span role="status">{action.detailsRedactionMessage ?? "Source details are hidden by module selection."}</span> : <>{action.canonicalResourceType}<div style={{ color: "#667085" }}>{action.canonicalResourceId}</div>{action.canonicalOperationId ? <div style={{ color: "#667085" }}>Operation {action.canonicalOperationId}</div> : null}</>}</td>
                              <td style={{ padding: 8, fontSize: 10.5, color: "#344054" }}>{approvalExpired ? "expired" : action.state}<div style={{ color: "#667085" }}>Risk: {action.riskTier}</div>{action.errorCode ? <div style={{ color: "#B42318" }}>{action.errorCode}</div> : null}</td>
                              <td style={{ padding: 8, fontSize: 10.5, color: "#475467" }}>
                                Required: {action.requiredApproval ? action.requiredApproverRole ?? "yes" : "no"}<div>Approval expires: {action.approvalExpiresAt ? new Date(action.approvalExpiresAt).toLocaleString() : "not required"}</div><div>Approved: {action.approvedByUserId ?? "not recorded"}</div><div>Executed: {action.executedByUserId ?? "not recorded"}</div><div>Attempts: {action.executionAttemptCount}</div>
                                {!approvalExpired && action.actionType === "inventory_reorder_request" && action.state === "approval_required" ? (
                                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 7 }}>
                                    <button type="button" disabled={specialistActionDecisionMutation.isPending || action.expectedVersion === null || action.detailsRedacted} onClick={() => specialistActionDecisionMutation.mutate({ actionId: action.id, operation: "approve", expectedVersion: action.expectedVersion ?? undefined })} style={outlineBtnStyle}>Approve</button>
                                    <button type="button" disabled={specialistActionDecisionMutation.isPending || action.expectedVersion === null} onClick={async () => { const reason = await askText({ title: "Reject inventory reorder", description: "This records the reason in the canonical Procurement review.", placeholder: "Reason for rejection", minLength: 1, confirmLabel: "Reject", tone: "danger" }); if (reason) specialistActionDecisionMutation.mutate({ actionId: action.id, operation: "reject", reason, expectedVersion: action.expectedVersion ?? undefined }); }} style={outlineBtnStyle}>Reject</button>
                                    <button type="button" disabled={specialistActionDecisionMutation.isPending || action.expectedVersion === null} onClick={async () => { const reason = await askText({ title: "Cancel inventory reorder", description: "The submitted Procurement request will be withdrawn and the reason audited.", placeholder: "Reason for cancellation", minLength: 1, confirmLabel: "Cancel request", tone: "danger" }); if (reason) specialistActionDecisionMutation.mutate({ actionId: action.id, operation: "cancel", reason, expectedVersion: action.expectedVersion ?? undefined }); }} style={outlineBtnStyle}>Cancel</button>
                                  </div>
                                ) : action.actionType === "inventory_reorder_request" && action.state === "approved" ? (
                                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 7 }}>
                                    {!action.detailsRedacted && !action.canonicalOperationId ? <button type="button" disabled={specialistActionDecisionMutation.isPending || action.expectedVersion === null} onClick={async () => { const reason = await askText({ title: "Cancel approved reorder", description: "Cancel this Procurement request before a purchase order or sourcing RFQ is created. The reason will be audited.", placeholder: "Reason for cancellation", minLength: 1, confirmLabel: "Cancel request", tone: "danger" }); if (reason) specialistActionDecisionMutation.mutate({ actionId: action.id, operation: "cancel", reason, expectedVersion: action.expectedVersion ?? undefined }); }} style={outlineBtnStyle}>Cancel request</button> : null}
                                    <button type="button" disabled={specialistActionDecisionMutation.isPending || action.expectedVersion === null || action.detailsRedacted} onClick={async () => { const confirmed = await askConfirm({ title: "Create purchase order", description: "This delegates to Procurement using the approved proposal version. The request must have a supplier and valid stock items.", confirmLabel: "Create purchase order" }); if (confirmed) specialistActionDecisionMutation.mutate({ actionId: action.id, operation: "execute", expectedVersion: action.expectedVersion ?? undefined }); }} style={outlineBtnStyle}>Create purchase order</button>
                                    <button type="button" disabled={specialistActionDecisionMutation.isPending || action.expectedVersion === null || action.detailsRedacted} onClick={async () => { const confirmed = await askConfirm({ title: "Create shared sourcing RFQ", description: "This creates a draft in the existing Commerce RFQ system and verifies its link to this approved Procurement request. It does not contact suppliers or create a purchase order.", confirmLabel: "Create draft RFQ" }); if (confirmed) specialistActionDecisionMutation.mutate({ actionId: action.id, operation: "source-rfq", expectedVersion: action.expectedVersion ?? undefined }); }} style={outlineBtnStyle}>Create shared RFQ</button>
                                  </div>
                                ) : !approvalExpired && action.actionType === "customer_follow_up_task" && action.state === "approval_required" ? (
                                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 7 }}>
                                    <button type="button" disabled={specialistActionDecisionMutation.isPending || action.expectedVersion === null || action.detailsRedacted} onClick={() => specialistActionDecisionMutation.mutate({ actionId: action.id, operation: "approve", expectedVersion: action.expectedVersion ?? undefined })} style={outlineBtnStyle}>Approve internal task</button>
                                    <button type="button" disabled={specialistActionDecisionMutation.isPending || action.expectedVersion === null} onClick={async () => { const reason = await askText({ title: "Reject follow-up task", description: "Record why this internal CRM task should not be created.", placeholder: "Reason for rejection", minLength: 1, confirmLabel: "Reject", tone: "danger" }); if (reason) specialistActionDecisionMutation.mutate({ actionId: action.id, operation: "reject", reason, expectedVersion: action.expectedVersion ?? undefined }); }} style={outlineBtnStyle}>Reject</button>
                                    <button type="button" disabled={specialistActionDecisionMutation.isPending || action.expectedVersion === null} onClick={async () => { const reason = await askText({ title: "Cancel follow-up proposal", description: "Record why this pending internal task proposal is being cancelled.", placeholder: "Reason for cancellation", minLength: 1, confirmLabel: "Cancel proposal", tone: "danger" }); if (reason) specialistActionDecisionMutation.mutate({ actionId: action.id, operation: "cancel", reason, expectedVersion: action.expectedVersion ?? undefined }); }} style={outlineBtnStyle}>Cancel</button>
                                  </div>
                                ) : action.actionType === "customer_follow_up_task" && action.state === "approved" ? (
                                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 7 }}>
                                    {!action.detailsRedacted && !action.canonicalOperationId ? <button type="button" disabled={specialistActionDecisionMutation.isPending || action.expectedVersion === null} onClick={async () => { const reason = await askText({ title: "Cancel approved follow-up", description: "Cancel this internal CRM task before execution starts. The reason will be audited.", placeholder: "Reason for cancellation", minLength: 1, confirmLabel: "Cancel task", tone: "danger" }); if (reason) specialistActionDecisionMutation.mutate({ actionId: action.id, operation: "cancel", reason, expectedVersion: action.expectedVersion ?? undefined }); }} style={outlineBtnStyle}>Cancel task</button> : null}
                                    <button type="button" disabled={specialistActionDecisionMutation.isPending || action.expectedVersion === null || action.detailsRedacted} onClick={async () => { const confirmed = await askConfirm({ title: "Create the CRM follow-up task?", description: "This creates one internal task through Customers. It does not draft or send a customer message.", confirmLabel: "Create internal task" }); if (confirmed) specialistActionDecisionMutation.mutate({ actionId: action.id, operation: "execute", expectedVersion: action.expectedVersion ?? undefined }); }} style={outlineBtnStyle}>Create internal task</button>
                                  </div>
                                ) : action.actionType === "customer_follow_up_task" && action.state === "failed" ? (
                                  <button type="button" disabled={specialistActionDecisionMutation.isPending || action.expectedVersion === null || action.detailsRedacted} onClick={async () => { const confirmed = await askConfirm({ title: "Retry CRM task creation?", description: "The Customers service uses an idempotency key, so a retry after a lost response will return the same task instead of creating a duplicate.", confirmLabel: "Retry task creation" }); if (confirmed) specialistActionDecisionMutation.mutate({ actionId: action.id, operation: "execute", expectedVersion: action.expectedVersion ?? undefined }); }} style={{ ...outlineBtnStyle, marginTop: 7 }}>Retry task creation</button>
                                ) : action.state === "needs_review" && (action.errorCode === "SPECIALIST_ACTION_OUTCOME_UNKNOWN" || action.errorCode === "SPECIALIST_ACTION_VERIFICATION_OUTCOME_UNKNOWN") ? (
                                  <button type="button" disabled={specialistActionDecisionMutation.isPending} onClick={async () => { const verificationUnknown = action.errorCode === "SPECIALIST_ACTION_VERIFICATION_OUTCOME_UNKNOWN"; const reason = await askText({ title: verificationUnknown ? "Close unknown-verification review" : "Close unknown-outcome review", description: verificationUnknown ? "Check the canonical resource first. Closing this review does not mark the action verified or provider-confirmed. Record what you found." : "Check the canonical resource first. Closing this review does not mark the action successful or provider-confirmed. Record what you found.", placeholder: "What did you find in the canonical resource?", minLength: 1, confirmLabel: "Close review" }); if (reason) specialistActionDecisionMutation.mutate({ actionId: action.id, operation: "resolve", reason }); }} style={outlineBtnStyle}>Close review</button>
                                ) : null}
                              </td>
                              <td style={{ padding: "10px 17px", fontSize: 10.5, color: "#475467" }}>{action.detailsRedacted ? "Action timeline hidden by module selection." : <details><summary style={{ cursor: "pointer" }}>View {action.events.length} saved event(s)</summary><div style={{ marginTop: 7, maxWidth: 440 }}><div>{action.reason}</div><div style={{ color: "#667085", marginTop: 4 }}>Correlation {action.correlationId}</div><ol style={{ paddingLeft: 20, margin: "8px 0" }}>{action.events.map((event) => <li key={`${action.id}:${event.sequence}`} style={{ paddingBottom: 6 }}><strong>{event.fromState ?? "created"} → {event.toState ?? event.eventType}</strong><div>{event.eventType} · {new Date(event.createdAt).toLocaleString()}</div>{event.actorUserId ? <div>Actor {event.actorUserId}</div> : null}{event.reason ? <div>{event.reason}</div> : null}</li>)}</ol></div></details>}</td>
                            </tr>
                          </Fragment>
                        );
                      })}</tbody>
                    </table>
                    {!specialistActionAudit.actions.length ? <div role="status" style={{ padding: 12, color: "#667085", fontSize: 11.5 }}>No saved material actions in the last 30 days.</div> : null}
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </section>

      <section aria-labelledby="specialist-config-history-heading" style={{ background: "#fff", border: `1px solid ${AI.border}`, borderRadius: 16, overflow: "hidden" }}>
        <div style={{ padding: "14px 17px", borderBottom: "1px solid #F0F2F5", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h3 id="specialist-config-history-heading" style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Agent configuration history</h3>
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "#667085" }}>Immutable snapshots of saved agent policies · provider credentials are excluded</p>
          </div>
          <label style={{ display: "grid", gap: 4, fontSize: 10.5, color: "#667085" }}>
            Agent
            <select aria-label="Select specialist agent configuration history" value={selectedConfigAgentKey} onChange={(event) => setConfigAgentFilter(event.target.value)} style={{ border: `1px solid ${AI.border}`, borderRadius: 8, background: "#fff", padding: "7px 9px", color: "#344054" }}>
              {(specialistOperations?.agents ?? []).map((agent) => <option key={agent.agentKey} value={agent.agentKey}>{agent.name}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => void refetchConfigHistory()} disabled={!selectedConfigAgentKey} style={outlineBtnStyle}>Refresh history</button>
        </div>
        {configHistoryPending ? <div role="status" style={{ padding: 16, color: "#667085", fontSize: 11.5 }}>Loading saved configuration versions…</div> : configHistoryError || !specialistConfigHistory ? (
          <div role="alert" style={{ padding: 16, color: "#B42318", fontSize: 11.5 }}>Agent configuration history could not be loaded. <button type="button" onClick={() => void refetchConfigHistory()} style={outlineBtnStyle}>Retry</button></div>
        ) : specialistConfigHistory.items.length ? (
          <div style={{ display: "grid", gap: 0 }}>
            {specialistConfigHistory.items.map((version) => (
              <details key={version.id} style={{ padding: "10px 17px", borderTop: "1px solid #F2F4F7" }}>
                <summary style={{ cursor: "pointer", fontSize: 11.5, color: "#344054", fontWeight: 700 }}>
                  Version {version.version} · {new Date(version.createdAt).toLocaleString()} · {version.configHash.slice(0, 12)}…
                </summary>
                <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", background: "#FAFBFC", border: `1px solid ${AI.border}`, borderRadius: 8, padding: 10, margin: "9px 0 0", fontSize: 10.5, color: "#475467" }}>{JSON.stringify(version.configuration, null, 2)}</pre>
              </details>
            ))}
            {specialistConfigHistory.hasMore ? <div style={{ padding: "0 17px 12px", fontSize: 10.5, color: "#667085" }}>Showing the latest {specialistConfigHistory.limit} versions.</div> : null}
          </div>
        ) : (
          <div role="status" style={{ padding: 16, color: "#667085", fontSize: 11.5 }}>No configuration snapshot exists yet. A snapshot is saved when an agent policy changes or before that agent runs.</div>
        )}
      </section>

      <section aria-labelledby="specialist-run-history-heading" style={{ background: "#fff", border: `1px solid ${AI.border}`, borderRadius: 16, overflow: "hidden" }}>
        <div style={{ padding: "14px 17px", borderBottom: "1px solid #F0F2F5", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h3 id="specialist-run-history-heading" style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Recent specialist runs</h3>
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "#667085" }}>Saved run state only · private inputs and model output are not shown here</p>
          </div>
          <label style={{ display: "grid", gap: 4, fontSize: 10.5, color: "#667085" }}>
            Agent
            <select aria-label="Filter specialist runs by agent" value={runAgentFilter} onChange={(event) => { setRunAgentFilter(event.target.value); setRunHistoryCursor(null); setRunHistoryCursorHistory([]); }} style={{ border: `1px solid ${AI.border}`, borderRadius: 8, background: "#fff", padding: "7px 9px", color: "#344054" }}>
              <option value="all">All agents</option>
              {(specialistOperations?.agents ?? []).map((agent) => <option key={agent.agentKey} value={agent.agentKey}>{agent.name}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 10.5, color: "#667085" }}>
            Run status
            <select aria-label="Filter specialist runs by status" value={runStatusFilter} onChange={(event) => { setRunStatusFilter(event.target.value as "all" | SpecialistAgentRunStatus); setRunHistoryCursor(null); setRunHistoryCursorHistory([]); }} style={{ border: `1px solid ${AI.border}`, borderRadius: 8, background: "#fff", padding: "7px 9px", color: "#344054" }}>
              <option value="all">All statuses</option>
              <option value="queued">Queued</option>
              <option value="running">Running</option>
              <option value="completed">Completed</option>
              <option value="partial">Partial</option>
              <option value="failed">Failed</option>
              <option value="cancel_requested">Cancel requested</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <button type="button" onClick={() => void refetchSpecialistRuns()} style={outlineBtnStyle}>Refresh runs</button>
        </div>
        {specialistRunsPending ? <div role="status" style={{ padding: 16, color: "#667085", fontSize: 11.5 }}>Loading saved specialist runs…</div> : specialistRunsError || !specialistRunHistory ? (
          <div role="alert" style={{ padding: 16, color: "#B42318", fontSize: 11.5 }}>Saved specialist runs could not be loaded. <button type="button" onClick={() => void refetchSpecialistRuns()} style={outlineBtnStyle}>Retry</button></div>
        ) : specialistRunHistory.items.length ? (
          <div ref={runHistoryTableRef} style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", minWidth: 980 }}>
              <thead><tr style={{ background: "#FAFBFC" }}>
                <th style={{ textAlign: "left", fontSize: 10.5, color: "#98A2B3", padding: "9px 17px" }}>Started</th>
                <th style={{ textAlign: "left", fontSize: 10.5, color: "#98A2B3", padding: 9 }}>Agent / module</th>
                <th style={{ textAlign: "left", fontSize: 10.5, color: "#98A2B3", padding: 9 }}>Trigger / version</th>
                <th style={{ textAlign: "left", fontSize: 10.5, color: "#98A2B3", padding: 9 }}>Status</th>
                <th style={{ textAlign: "right", fontSize: 10.5, color: "#98A2B3", padding: "9px 17px" }}>Recommendations · evidence · actions</th>
                <th style={{ textAlign: "right", fontSize: 10.5, color: "#98A2B3", padding: "9px 17px" }}>Tool calls</th>
                <th style={{ textAlign: "right", fontSize: 10.5, color: "#98A2B3", padding: "9px 17px" }}>Source references</th>
                <th style={{ textAlign: "right", fontSize: 10.5, color: "#98A2B3", padding: "9px 17px" }}>Lifecycle events</th>
              </tr></thead>
              <tbody>{specialistRunHistory.items.map((run) => {
                const agent = specialistOperations?.agents.find((item) => item.agentKey === run.agentKey);
                return (
                  <Fragment key={run.id}>
                    <tr style={{ borderTop: "1px solid #F2F4F7" }}>
                      <td style={{ padding: "10px 17px", fontSize: 10.5, color: "#475467", whiteSpace: "nowrap" }}>{new Date(run.startedAt).toLocaleString()}</td>
                      <td style={{ padding: 9, fontSize: 11, color: "#344054" }}><strong>{agent?.name ?? run.agentKey}</strong><div style={{ color: "#98A2B3" }}>Module {run.moduleId}</div></td>
                      <td style={{ padding: 9, fontSize: 10.5, color: "#475467" }}>{run.triggerType.replaceAll("_", " ")}<div style={{ color: "#667085" }}>Code {run.agentVersion}</div><div style={{ color: "#667085" }}>Config {run.agentConfigVersion === null ? "not pinned" : `v${run.agentConfigVersion}`}</div></td>
                      <td style={{ padding: 9, fontSize: 10.5, color: run.status === "failed" ? "#B42318" : "#344054" }}>{run.status.replaceAll("_", " ")}{run.errorCode ? <div style={{ color: "#B42318" }}>{run.errorCode}</div> : null}{run.detailsExpired ? <div style={{ color: "#667085" }}>Transient details expired by retention policy</div> : null}</td>
                      <td style={{ padding: "10px 17px", textAlign: "right", fontSize: 10.5, color: "#475467" }}>{run.detailsRedacted ? "Details hidden by module selection" : `${run.relatedCounts.recommendations} · ${run.relatedCounts.evidence} · ${run.relatedCounts.actions}`}</td>
                      <td style={{ padding: "8px 17px", textAlign: "right" }}>
                        <button
                          type="button"
                          aria-expanded={selectedRunToolCallsId === run.id}
                          aria-controls={`specialist-run-tool-calls-${run.id}`}
                          onClick={() => setSelectedRunToolCallsId((current) => current === run.id ? null : run.id)}
                          disabled={run.detailsRedacted}
                          title={run.detailsRedactionMessage}
                          style={outlineBtnStyle}
                        >
                          {run.detailsRedacted ? "Details hidden" : selectedRunToolCallsId === run.id ? "Hide calls" : `View ${run.relatedCounts.toolCalls} calls`}
                        </button>
                      </td>
                      <td style={{ padding: "8px 17px", textAlign: "right" }}>
                        <button
                          type="button"
                          aria-expanded={selectedRunEvidenceId === run.id}
                          aria-controls={`specialist-run-evidence-${run.id}`}
                          onClick={() => setSelectedRunEvidenceId((current) => current === run.id ? null : run.id)}
                          disabled={run.detailsRedacted}
                          title={run.detailsRedactionMessage}
                          style={outlineBtnStyle}
                        >
                          {run.detailsRedacted ? "Details hidden" : selectedRunEvidenceId === run.id ? "Hide sources" : "View sources"}
                        </button>
                      </td>
                      <td style={{ padding: "8px 17px", textAlign: "right" }}>
                        <button
                          type="button"
                          aria-expanded={selectedRunEventsId === run.id}
                          aria-controls={`specialist-run-events-${run.id}`}
                          onClick={() => setSelectedRunEventsId((current) => current === run.id ? null : run.id)}
                          disabled={run.detailsRedacted}
                          title={run.detailsRedactionMessage}
                          style={outlineBtnStyle}
                        >
                          {run.detailsRedacted ? "Details hidden" : selectedRunEventsId === run.id ? "Hide events" : "View events"}
                        </button>
                      </td>
                    </tr>
                    {selectedRunToolCallsId === run.id ? (
                      <tr id={`specialist-run-tool-calls-${run.id}`}>
                        <td colSpan={8} style={{ padding: "10px 17px 14px", background: "#FAFBFC", borderTop: "1px solid #F2F4F7" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                            <strong style={{ fontSize: 10.5, color: "#344054" }}>Registered tool calls · input values and output contents are not stored here</strong>
                            {selectedRunToolCallsError ? <button type="button" onClick={() => void refetchSelectedRunToolCalls()} style={outlineBtnStyle}>Retry</button> : null}
                          </div>
                          {selectedRunToolCallsPending ? <div role="status" style={{ fontSize: 10.5, color: "#667085" }}>Loading tool-call records…</div> : selectedRunToolCallsError || !selectedRunToolCalls ? (
                            <div role="alert" style={{ fontSize: 10.5, color: "#B42318" }}>Tool-call records could not be loaded.</div>
                          ) : selectedRunToolCalls.detailsRedacted ? (
                            <div role="status" style={{ fontSize: 10.5, color: "#667085" }}>{selectedRunToolCalls.detailsRedactionMessage}</div>
                          ) : selectedRunToolCalls.items.length ? (
                            <div style={{ display: "grid", gap: 7 }}>
                              {selectedRunToolCalls.items.map((call) => (
                                <div key={call.id} style={{ display: "grid", gridTemplateColumns: "minmax(120px, .8fr) minmax(150px, 1fr) minmax(170px, 1.2fr) minmax(120px, .8fr)", gap: 8, border: `1px solid ${AI.border}`, borderRadius: 8, background: "#fff", padding: 9, fontSize: 10.5, color: "#475467" }}>
                                  <div><strong>{call.toolKey}</strong><div>v{call.toolVersion} · round {call.round}.{call.sequence}</div></div>
                                  <div><strong>{call.status}</strong><div>{call.durationMs === null ? "Duration not recorded" : `${call.durationMs} ms`}</div>{call.errorCode ? <div style={{ color: "#B42318" }}>{call.errorCode}</div> : null}</div>
                                  <div>Input fields: {Array.isArray(call.inputFields) ? call.inputFields.map(String).join(", ") || "none" : "not recorded"}<div>Input fingerprint: {call.inputSha256.slice(0, 12)}</div></div>
                                  <div>{call.outputResourceType ? <><div>{call.outputResourceType}</div><div style={{ color: "#98A2B3" }}>Record {call.outputResourceId}</div></> : "No output reference"}</div>
                                </div>
                              ))}
                            </div>
                          ) : <div role="status" style={{ fontSize: 10.5, color: "#667085" }}>No registered tool calls were saved for this run.</div>}
                        </td>
                      </tr>
                    ) : null}
                    {selectedRunEvidenceId === run.id ? (
                      <tr id={`specialist-run-evidence-${run.id}`}>
                        <td colSpan={8} style={{ padding: "10px 17px 14px", background: "#FAFBFC", borderTop: "1px solid #F2F4F7" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                            <strong style={{ fontSize: 10.5, color: "#344054" }}>Saved source references · values and model output are redacted</strong>
                            {selectedRunEvidenceError ? <button type="button" onClick={() => void refetchSelectedRunEvidence()} style={outlineBtnStyle}>Retry</button> : null}
                          </div>
                          {selectedRunEvidencePending ? <div role="status" style={{ fontSize: 10.5, color: "#667085" }}>Loading evidence references…</div> : selectedRunEvidenceError || !selectedRunEvidence ? (
                            <div role="alert" style={{ fontSize: 10.5, color: "#B42318" }}>Evidence references could not be loaded.</div>
                          ) : selectedRunEvidence.detailsRedacted ? (
                            <div role="status" style={{ fontSize: 10.5, color: "#667085" }}>{selectedRunEvidence.detailsRedactionMessage}</div>
                          ) : selectedRunEvidence.items.length ? (
                            <div style={{ display: "grid", gap: 7 }}>
                              {selectedRunEvidence.items.map((evidence) => (
                                <div key={evidence.id} style={{ display: "grid", gridTemplateColumns: "minmax(115px, .7fr) minmax(180px, 1.2fr) minmax(150px, 1fr)", gap: 8, border: `1px solid ${AI.border}`, borderRadius: 8, background: "#fff", padding: 9, fontSize: 10.5, color: "#475467" }}>
                                  <div><strong>{evidence.sourceType}</strong><div>{evidence.resourceType}</div><div style={{ color: "#98A2B3" }}>Freshness: {evidence.freshness}</div></div>
                                  <div><div>Record {evidence.resourceId}</div><div>Fields: {Array.isArray(evidence.fieldRefs) ? evidence.fieldRefs.map(String).join(", ") : "Not listed"}</div></div>
                                  <div><div>Observed {new Date(evidence.observedAt).toLocaleString()}</div><div>Fetched {new Date(evidence.fetchedAt).toLocaleString()}</div></div>
                                </div>
                              ))}
                            </div>
                          ) : <div role="status" style={{ fontSize: 10.5, color: "#667085" }}>No source evidence was saved for this run.</div>}
                        </td>
                      </tr>
                    ) : null}
                    {selectedRunEventsId === run.id ? (
                      <tr id={`specialist-run-events-${run.id}`}>
                        <td colSpan={8} style={{ padding: "10px 17px 14px", background: "#FAFBFC", borderTop: "1px solid #F2F4F7" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                            <strong style={{ fontSize: 10.5, color: "#344054" }}>Normalized lifecycle · metadata only</strong>
                            <span style={{ display: "flex", gap: 7 }}>
                              {selectedRunEventsError ? <button type="button" onClick={() => void refetchSelectedRunEvents()} style={outlineBtnStyle}>Retry</button> : null}
                              <button type="button" onClick={() => setSelectedRunEventsId(null)} style={outlineBtnStyle}>Hide events</button>
                            </span>
                          </div>
                          {selectedRunEventsPending ? <div role="status" style={{ fontSize: 10.5, color: "#667085" }}>Loading run events…</div> : selectedRunEventsError || !selectedRunEvents ? (
                            <div role="alert" style={{ fontSize: 10.5, color: "#B42318" }}>Run lifecycle events could not be loaded.</div>
                          ) : (
                            <>
                              {selectedRunEvents.detailsRedacted ? (
                                <div role="status" style={{ marginBottom: 8, fontSize: 10.5, color: "#667085" }}>{selectedRunEvents.detailsRedactionMessage}</div>
                              ) : null}
                              <div style={{ display: "grid", gap: 7 }}>
                                {[...(loadedOlderRunEvents[run.id]?.items ?? []), ...selectedRunEvents.items].map((event) => (
                                  <div key={event.eventId} style={{ display: "grid", gridTemplateColumns: "minmax(130px, .8fr) minmax(140px, 1fr) minmax(0, 1.2fr)", gap: 8, border: `1px solid ${AI.border}`, borderRadius: 8, background: "#fff", padding: 9, fontSize: 10.5, color: "#475467" }}>
                                    <div style={{ minWidth: 0, overflowWrap: "anywhere" }}><strong>{formatSpecialistRunEventName(event.eventName)}</strong><div>{new Date(event.occurredAt).toLocaleString()}</div></div>
                                    <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>Module {event.sourceModule} · schema v{event.schemaVersion}<div>{event.eventName.startsWith("agent.tool.") ? "Tool version" : "Agent version"} {event.entityVersion ?? "not recorded"}</div></div>
                                    <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>Correlation {event.correlationId.slice(0, 12)}<div style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>Payload: {JSON.stringify(event.payload)}</div></div>
                                  </div>
                                ))}
                              </div>
                              <div role="note" style={{ marginTop: 8, fontSize: 10, color: "#667085" }}>{selectedRunEvents.eventHistoryNote}</div>
                              {(loadedOlderRunEvents[run.id]?.hasMore ?? selectedRunEvents.hasMore) ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const cursor = loadedOlderRunEvents[run.id]?.nextCursor ?? selectedRunEvents.nextCursor;
                                    if (cursor) olderRunEventsMutation.mutate({ runId: run.id, cursor });
                                  }}
                                  disabled={olderRunEventsMutation.isPending}
                                  style={{ ...outlineBtnStyle, marginTop: 8 }}
                                >
                                  {olderRunEventsMutation.isPending ? "Loading earlier events…" : `Load earlier events · ${selectedRunEvents.pageSize} at a time`}
                                </button>
                              ) : null}
                            </>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}</tbody>
            </table>
            <div style={{ padding: "0 17px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 10.5, color: "#667085" }}>
              <span>Page {runHistoryCursorHistory.length + 1} · up to {specialistRunHistory.pageSize} runs · source values and model output remain in the owning module.</span>
              <span style={{ display: "flex", gap: 7 }}>
                {runHistoryCursorHistory.length ? (
                  <button type="button" onClick={() => {
                    const previous = runHistoryCursorHistory.at(-1) ?? "";
                    setRunHistoryCursorHistory((history) => history.slice(0, -1));
                    setRunHistoryCursor(previous || null);
                  }} style={outlineBtnStyle}>Newer runs</button>
                ) : null}
                {specialistRunHistory.nextCursor ? (
                  <button type="button" onClick={() => {
                    setRunHistoryCursorHistory((history) => [...history, runHistoryCursor ?? ""]);
                    setRunHistoryCursor(specialistRunHistory.nextCursor);
                    setSelectedRunEvidenceId(null);
                    setSelectedRunToolCallsId(null);
                    setSelectedRunEventsId(null);
                  }} style={outlineBtnStyle}>Older runs</button>
                ) : null}
              </span>
            </div>
          </div>
        ) : (
          <div role="status" style={{ padding: 16, color: "#667085", fontSize: 11.5 }}>No saved specialist runs match these filters.</div>
        )}
      </section>

      <section aria-labelledby="specialist-orchestration-heading" style={{ background: "#fff", border: `1px solid ${AI.border}`, borderRadius: 16, overflow: "hidden" }}>
        <div style={{ padding: "14px 17px", borderBottom: "1px solid #F0F2F5", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 230 }}>
            <h3 id="specialist-orchestration-heading" style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Cross-agent review</h3>
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "#667085", lineHeight: 1.5 }}>Run each enabled specialist once, in sequence, using its existing read-only review. Only the business owner can start this because the combined scope includes customer and finance summaries.</p>
          </div>
          <button type="button" onClick={() => orchestrationMutation.mutate()} disabled={orchestrationMutation.isPending || orchestrationRunning} style={{ ...primaryBtnStyle, opacity: orchestrationMutation.isPending || orchestrationRunning ? .65 : 1 }}>
            {orchestrationMutation.isPending ? "Queueing review…" : orchestrationRunning ? "Review in progress…" : "Run enabled agents"}
          </button>
        </div>
        <div style={{ padding: "11px 17px", background: "#F7FCF9", borderBottom: "1px solid #F0F2F5", fontSize: 11, color: "#475467", lineHeight: 1.55 }}>
          This is a bounded review fan-out, not an autonomous plan: child runs inherit the current business, write no source records, send no messages and make no AI-provider calls. Disabled agents—and Commerce when autonomy is disabled—are recorded as skipped.
        </div>
        <div style={{ padding: "12px 17px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 11.5, color: "#344054" }}>Recent cross-agent runs</strong>
          <button type="button" onClick={() => void refetchOrchestrations()} style={outlineBtnStyle}>Refresh history</button>
        </div>
        {orchestrationsPending ? <div style={{ padding: "0 17px 14px", color: "#98A2B3", fontSize: 11 }}>Loading saved orchestration runs…</div> : null}
        {(latestSavedOrchestration ? [latestSavedOrchestration, ...(orchestrationHistory?.runs ?? []).filter((run) => run.id !== latestSavedOrchestration.id)] : orchestrationHistory?.runs ?? []).slice(0, 5).map((run) => (
          <div key={run.id} style={{ borderTop: "1px solid #F2F4F7", padding: "12px 17px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: "#101828" }}>{run.result?.summary ?? `Run ${run.status.replaceAll("_", " ")}`}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10.5, color: "#667085" }}>{new Date(run.createdAt).toLocaleString()} · run {run.id.slice(0, 8)} · trace {run.result?.correlationId.slice(0, 8) ?? run.id.slice(0, 8)}</span>
                {run.status !== "running" && (run.result?.failedCount ?? 0) > 0 ? (
                  <button
                    type="button"
                    disabled={orchestrationRetryMutation.isPending}
                    onClick={() => {
                      const idempotencyKey = orchestrationRetryKeys.current.get(run.id) ?? crypto.randomUUID();
                      orchestrationRetryKeys.current.set(run.id, idempotencyKey);
                      orchestrationRetryMutation.mutate({ runId: run.id, idempotencyKey });
                    }}
                    style={{ ...outlineBtnStyle, opacity: orchestrationRetryMutation.isPending ? .65 : 1 }}
                  >
                    {orchestrationRetryMutation.isPending ? "Retrying…" : `Retry failed (${run.result?.failedCount})`}
                  </button>
                ) : null}
              </span>
            </div>
            {run.status === "cancel_requested" ? (
              <div role="status" style={{ marginBottom: 6, fontSize: 10.5, color: "#B54708" }}>
                Stop requested · the current read-only review may finish; no later review will start.
              </div>
            ) : run.status === "running" && run.result?.observedAt ? (
              <div role="status" style={{ marginBottom: 6, fontSize: 10.5, color: "#667085" }}>
                Running · last progress {new Date(run.result.observedAt).toLocaleString()} · read-only review
              </div>
            ) : null}
            {run.status === "running" ? (
              <button
                type="button"
                onClick={() => orchestrationCancelMutation.mutate(run.id)}
                disabled={orchestrationCancelMutation.isPending}
                style={{ ...outlineBtnStyle, marginBottom: 8, opacity: orchestrationCancelMutation.isPending ? .65 : 1 }}
              >
                {orchestrationCancelMutation.isPending ? "Requesting stop…" : "Stop after current review"}
              </button>
            ) : null}
            {run.result?.children.map((child) => (
              <div key={child.agentKey} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "5px 0", fontSize: 11 }}>
                <span style={{ minWidth: 165, fontWeight: 700, color: "#344054" }}>{child.name}</span>
                <span style={{ textTransform: "capitalize", color: child.status === "failed" ? "#B42318" : child.status === "completed" ? "#0E8442" : child.status === "partially_succeeded" ? "#B54708" : "#667085" }}>{child.status.replaceAll("_", " ")}</span>
                {child.reasonCode ? <span style={{ color: "#667085" }}>({child.reasonCode.replaceAll("_", " ").toLowerCase()})</span> : null}
                {child.runId ? <span style={{ color: "#98A2B3" }}>run {child.runId.slice(0, 8)}</span> : null}
              </div>
            ))}
          </div>
        ))}
        {!orchestrationsPending && !latestSavedOrchestration && !orchestrationHistory?.runs.length ? <div role="status" style={{ padding: "0 17px 14px", color: "#667085", fontSize: 11 }}>No cross-agent review has been run for this business.</div> : null}
      </section>

      <div style={{ background: "#fff", border: `1px solid ${AI.border}`, borderRadius: 16, overflow: "hidden" }}>
        <div style={{ padding: "14px 17px", borderBottom: "1px solid #F0F2F5" }}>
          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>AI features</h3>
        </div>
        {isPending || !settings ? (
          <div style={{ padding: 17 }}>
            <KpiSkeleton count={1} />
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
              <thead>
                <tr style={{ background: "#FAFBFC" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Feature</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Usage this month</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Available to</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Status</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Enabled</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(FEATURE_LABELS) as (keyof AiFeatureToggles)[]).map((key) => {
                  const usage = settings.usageThisMonth.byFeature[key];
                  const enabled = settings.featureToggles[key];
                  const statusLabel = enabled ? "Active" : "Off";
                  const statusBg = enabled ? "#E8F7EE" : "#F2F4F7";
                  const statusFg = enabled ? "#0E8442" : "#475467";
                  return (
                    <tr key={key} style={{ borderTop: "1px solid #F2F4F7" }}>
                      <td style={{ padding: "12px 17px" }}>
                        <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#101828" }}>{FEATURE_LABELS[key].name}</span>
                        <span style={{ display: "block", fontSize: 11, color: "#98A2B3", marginTop: 3 }}>{FEATURE_LABELS[key].note}</span>
                      </td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "#475467" }}>
                        {usage.calls} queries · {formatCurrency(usage.costUsd, currency)}
                      </td>
                      <td style={{ padding: 12, fontSize: 12, color: "#667085" }}>{availableToLabel(key)}</td>
                      <td style={{ padding: 12 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: statusBg, color: statusFg }}>{statusLabel}</span>
                      </td>
                      <td style={{ padding: "12px 17px", textAlign: "right" }}>
                        <button
                          type="button"
                          onClick={() => toggleMutation.mutate(key)}
                          disabled={toggleMutation.isPending}
                          role="switch"
                          aria-checked={enabled}
                          aria-label={`Toggle ${FEATURE_LABELS[key].name}`}
                          style={{ width: 40, height: 22, border: 0, borderRadius: 20, background: enabled ? AI.primary : "#D5DCE4", position: "relative", cursor: "pointer" }}
                        >
                          <span style={{ position: "absolute", top: 2, left: enabled ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {settings.usageThisMonth.other.calls > 0 && (
                  <tr style={{ borderTop: "1px solid #F2F4F7", background: "#FAFBFC" }}>
                    <td style={{ padding: "12px 17px", fontSize: 12.5, color: "#98A2B3" }}>Other AI usage</td>
                    <td style={{ padding: 12, fontSize: 12.5, color: "#98A2B3" }}>
                      {settings.usageThisMonth.other.calls} queries · {formatCurrency(settings.usageThisMonth.other.costUsd, currency)}
                    </td>
                    <td style={{ padding: 12 }} />
                    <td style={{ padding: 12 }} />
                    <td style={{ padding: "12px 17px", textAlign: "right", fontSize: 11, color: "#98A2B3" }}>not independently toggleable</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ background: "#fff", border: `1px solid ${AI.border}`, borderRadius: 16, overflow: "hidden" }}>
        <div style={{ padding: "14px 17px", borderBottom: "1px solid #F0F2F5", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>What the assistant can read</h3>
          <span style={{ fontSize: 11, color: "#98A2B3" }}>Same for every role today</span>
        </div>
        <div style={{ padding: "6px 0" }}>
          {DATA_ACCESS.map((d) => (
            <div key={d.module} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 17px", borderBottom: "1px solid #F2F4F7", flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 140, fontSize: 12.5, fontWeight: 700, color: "#101828" }}>{d.module}</span>
              <span style={{ fontSize: 11.5, color: "#98A2B3" }}>{d.why}</span>
              <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: "#E8F7EE", color: "#0E8442", whiteSpace: "nowrap" }}>Available</span>
            </div>
          ))}
        </div>
        <div style={{ padding: "11px 17px", fontSize: 11.5, color: "#98A2B3", lineHeight: 1.55 }}>
          There&apos;s no per-role restriction on Business Chat&apos;s tools yet — owner, manager and staff all read the same modules listed above.
        </div>
      </div>

      <div style={{ background: "#fff", border: "1.5px solid #BFE7CF", borderRadius: 16, padding: 17 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Action governance</h3>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#0E8442", background: "#E8F7EE", borderRadius: 6, padding: "3px 8px" }}>Read-only by default</span>
        </div>
        <div style={{ background: "#F7FCF9", border: "1px solid #D5EFE0", borderRadius: 12, padding: 13, marginTop: 12, fontSize: 12.5, color: "#344054", lineHeight: 1.65 }}>
          The assistant can analyse, explain and draft. Voice Assistant can stage a curated set of writes — wastage, expenses, new customers, cash-drawer movements — and always waits for your confirmation before anything is applied. It cannot send a message, adjust stock or change a price on its own outside that reviewed flow.
        </div>
        <div style={{ display: "flex", gap: 9, marginTop: 13, flexWrap: "wrap" }}>
          <button type="button" onClick={openDisclosure} style={outlineBtnStyle}>
            How Noxtill uses AI
          </button>
          <button type="button" onClick={openLimits} style={{ ...primaryBtnStyle, marginLeft: "auto" }}>
            Cost cap &amp; rate limit
          </button>
        </div>
      </div>
    </main>
  );
}
