"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, LoaderCircle, RotateCcw, XCircle } from "lucide-react";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import {
  cancelWorkflowRun,
  fetchWorkflowRunDetails,
  fetchWorkflowRunsPage,
  fetchWorkflows,
  MAX_WORKFLOW_RETRIES,
  retryWorkflowRun,
  type WorkflowRun,
  type WorkflowRunStatus,
} from "@/lib/workflows-api";

const STATUSES: WorkflowRunStatus[] = [
  "running",
  "waiting",
  "success",
  "failed",
  "skipped",
  "cancelled",
];

const statusStyles: Record<WorkflowRunStatus, React.CSSProperties> = {
  running: { background: "var(--app-primary)", color: "var(--app-primary-foreground)" },
  waiting: { background: "var(--app-warning-bg)", border: "1px solid var(--app-warning-border)", color: "var(--app-warning-text)" },
  success: { background: "var(--app-success-bg)", border: "1px solid var(--app-success-border)", color: "var(--app-success-text)" },
  failed: { border: "1px solid var(--app-danger)", color: "var(--app-danger-strong)" },
  skipped: { border: "1px solid var(--app-border)", color: "var(--app-text-muted)" },
  cancelled: { border: "1px solid var(--app-border)", color: "var(--app-text-disabled)" },
};

function formatDate(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not recorded"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function StatusTag({ status }: { status: WorkflowRunStatus }) {
  return (
    <span className="inline-flex rounded-full px-2 py-1 text-[9.5px] font-bold capitalize" style={statusStyles[status]}>
      {status}
    </span>
  );
}

function DataDisclosure({ title, value }: { title: string; value: unknown }) {
  return (
    <details className="rounded-[10px]" style={{ border: "1px solid var(--app-border)" }}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-[10.5px] font-bold" style={{ color: "var(--app-text)" }}>
        {title}
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </summary>
      <pre className="m-0 max-h-64 overflow-auto whitespace-pre-wrap break-words border-t p-3 text-[10px]" style={{ borderColor: "var(--app-border)", color: "var(--app-text-muted)" }}>
        {JSON.stringify(value, null, 2) ?? "Not available"}
      </pre>
    </details>
  );
}

function RunInspector({ run }: { run: WorkflowRun }) {
  const queryClient = useQueryClient();
  const actionMutation = useMutation({
    mutationFn: ({ action }: { action: "retry" | "cancel" }) =>
      action === "retry"
        ? retryWorkflowRun(run.workflowId, run.id)
        : cancelWorkflowRun(run.workflowId, run.id),
    onSuccess: async (_updatedRun, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workflow-executions"] }),
        queryClient.invalidateQueries({ queryKey: ["workflow-execution-detail"] }),
      ]);
      toast.success(variables.action === "retry" ? "Execution retry queued" : "Execution cancelled");
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "The execution action could not be completed."),
  });
  const canRetry = run.status === "failed" && run.retryCount < MAX_WORKFLOW_RETRIES;
  const canCancel = run.status === "running" || run.status === "waiting";

  return (
    <aside className="flex min-w-0 flex-col gap-3 rounded-[14px] p-4" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--app-text-disabled)" }}>Execution inspector</p>
          <h2 className="m-0 mt-1 break-all text-[13px] font-extrabold" style={{ color: "var(--app-text)" }}>{run.id}</h2>
        </div>
        <StatusTag status={run.status} />
      </div>

      <dl className="m-0 grid grid-cols-[minmax(95px,auto)_1fr] gap-x-3 gap-y-2 text-[10.5px]">
        <dt style={{ color: "var(--app-text-disabled)" }}>Workflow</dt><dd className="m-0 font-semibold" style={{ color: "var(--app-text)" }}>{run.workflow?.name ?? "Workflow"}</dd>
        <dt style={{ color: "var(--app-text-disabled)" }}>Trigger</dt><dd className="m-0 font-mono" style={{ color: "var(--app-text-muted)" }}>{run.workflow?.triggerKey ?? "Not recorded"}</dd>
        <dt style={{ color: "var(--app-text-disabled)" }}>Workflow version</dt><dd className="m-0" style={{ color: "var(--app-text-muted)" }}>v{run.workflowVersion}</dd>
        <dt style={{ color: "var(--app-text-disabled)" }}>Started</dt><dd className="m-0" style={{ color: "var(--app-text-muted)" }}>{formatDate(run.createdAt)}</dd>
        <dt style={{ color: "var(--app-text-disabled)" }}>Retry count</dt><dd className="m-0" style={{ color: "var(--app-text-muted)" }}>{run.retryCount} of {MAX_WORKFLOW_RETRIES}</dd>
        {run.waitingUntil ? <><dt style={{ color: "var(--app-text-disabled)" }}>Resumes at</dt><dd className="m-0" style={{ color: "var(--app-text-muted)" }}>{formatDate(run.waitingUntil)}</dd></> : null}
      </dl>

      {run.error ? <p role="alert" className="m-0 rounded-[9px] p-3 text-[10.5px]" style={{ border: "1px solid var(--app-danger)", color: "var(--app-danger-strong)" }}>{run.error}</p> : null}

      {run.attempts?.length ? (
        <section className="flex flex-col gap-2">
          <h3 className="m-0 text-[10px] font-extrabold uppercase tracking-wide" style={{ color: "var(--app-text-disabled)" }}>Attempts ({run.attempts.length})</h3>
          {run.attempts.map((attempt) => (
            <div key={attempt.id} className="flex flex-wrap items-center gap-2 rounded-[9px] p-2" style={{ background: "var(--app-surface-2)" }}>
              <span className="text-[10px] font-bold" style={{ color: "var(--app-text)" }}>Attempt {attempt.attemptNumber}</span>
              <StatusTag status={attempt.status} />
              <span className="ml-auto text-[9.5px]" style={{ color: "var(--app-text-muted)" }}>{formatDate(attempt.startedAt)}</span>
              {attempt.error ? <p className="m-0 w-full break-words text-[10px]" style={{ color: "var(--app-danger-strong)" }}>{attempt.error}</p> : null}
            </div>
          ))}
        </section>
      ) : <p className="m-0 text-[10.5px]" style={{ color: "var(--app-text-muted)" }}>No attempt details are recorded for this execution.</p>}

      <DataDisclosure title="Trigger context" value={run.context} />
      <DataDisclosure title="Execution result" value={run.result} />

      {canRetry || canCancel ? (
        <div className="flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
          {canRetry ? <button type="button" disabled={actionMutation.isPending} onClick={() => actionMutation.mutate({ action: "retry" })} className="inline-flex min-h-9 items-center gap-1.5 rounded-[9px] px-3 text-[10.5px] font-bold disabled:opacity-50" style={{ background: "var(--app-primary)", color: "var(--app-primary-foreground)" }}><RotateCcw className="h-3.5 w-3.5" aria-hidden />Retry</button> : null}
          {canCancel ? <button type="button" disabled={actionMutation.isPending} onClick={() => actionMutation.mutate({ action: "cancel" })} className="inline-flex min-h-9 items-center gap-1.5 rounded-[9px] px-3 text-[10.5px] font-bold disabled:opacity-50" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}><XCircle className="h-3.5 w-3.5" aria-hidden />Cancel</button> : null}
        </div>
      ) : null}
    </aside>
  );
}

export function WorkflowExecutionsView({
  recoveryMode = false,
}: {
  recoveryMode?: boolean;
} = {}) {
  const [status, setStatus] = useState<WorkflowRunStatus | "all">(
    recoveryMode ? "failed" : "all",
  );
  const [workflowId, setWorkflowId] = useState("all");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const workflowsQuery = useQuery({ queryKey: ["workflows", "execution-filter"], queryFn: () => fetchWorkflows(true) });
  const executionsQuery = useInfiniteQuery({
    queryKey: ["workflow-executions", status, workflowId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchWorkflowRunsPage({
      take: 25,
      ...(status === "all" ? {} : { status }),
      ...(workflowId === "all" ? {} : { workflowId }),
      ...(pageParam ? { cursor: pageParam } : {}),
    }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const runs = useMemo(() => executionsQuery.data?.pages.flatMap((page) => page.items) ?? [], [executionsQuery.data]);
  const selectedSummary = runs.find((run) => run.id === selectedRunId) ?? runs[0] ?? null;
  const detailQuery = useQuery({
    queryKey: ["workflow-execution-detail", selectedSummary?.id],
    queryFn: () => fetchWorkflowRunDetails(selectedSummary!.id),
    enabled: Boolean(selectedSummary?.id),
  });

  return (
    <main className="flex flex-col gap-4 px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)" }}>{recoveryMode ? "Recovery Center" : "Executions"}</h1>
          <p className="m-0 mt-1 max-w-3xl text-[12px]" style={{ color: "var(--app-text-muted)" }}>{recoveryMode ? "Review retained failed workflow runs and retry an execution when its recorded outcome is safe to retry." : "Inspect real workflow runs across this business, including attempts, context, failures and recovery actions."}</p>
        </div>
        <Link href="/marketing/automations" className="inline-flex min-h-10 items-center gap-2 rounded-[10px] px-3 text-[11.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />Back to workflows
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-[12px] p-3" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        {recoveryMode ? (
          <span className="flex min-h-10 items-center rounded-[9px] px-3 text-[10.5px] font-semibold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Failed executions only</span>
        ) : (
          <label className="flex min-h-10 items-center gap-2 rounded-[9px] px-3 text-[10.5px] font-semibold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
            <span>Status</span>
            <select aria-label="Execution status" value={status} onChange={(event) => setStatus(event.target.value as WorkflowRunStatus | "all")} className="bg-transparent text-[11px] outline-none" style={{ color: "var(--app-text)" }}>
              <option value="all">All statuses</option>
              {STATUSES.map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}
            </select>
          </label>
        )}
        <label className="flex min-h-10 min-w-[210px] flex-1 items-center gap-2 rounded-[9px] px-3 text-[10.5px] font-semibold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
          <span>Workflow</span>
          <select aria-label="Workflow" value={workflowId} onChange={(event) => setWorkflowId(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[11px] outline-none" style={{ color: "var(--app-text)" }}>
            <option value="all">All workflows</option>
            {(workflowsQuery.data ?? []).map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}
          </select>
        </label>
      </div>

      {recoveryMode ? (
        <p className="m-0 rounded-[10px] px-3 py-2 text-[10.5px]" style={{ background: "var(--app-warning-bg)", border: "1px solid var(--app-warning-border)", color: "var(--app-warning-text)" }}>
          This view uses failed runs retained in execution history. A separate dead-letter queue, compensating actions and provider-incident handling are not implemented yet.
        </p>
      ) : null}

      {executionsQuery.isPending ? (
        <p className="m-0 rounded-[12px] p-4 text-[12px]" style={{ background: "var(--app-surface)", color: "var(--app-text-muted)" }}>Loading workflow executions…</p>
      ) : executionsQuery.isError ? (
        <div role="alert" className="rounded-[12px] p-4" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <p className="m-0 text-[12px] font-bold" style={{ color: "var(--app-text)" }}>Executions are unavailable</p>
          <p className="m-0 mt-1 text-[11px]" style={{ color: "var(--app-text-muted)" }}>No sample run data is shown. Check your connection and try again.</p>
          <button type="button" onClick={() => void executionsQuery.refetch()} className="mt-3 rounded-[9px] px-3 py-2 text-[11px] font-bold" style={{ background: "var(--app-primary)", color: "var(--app-primary-foreground)" }}>Retry</button>
        </div>
      ) : runs.length === 0 ? (
            <p className="m-0 rounded-[12px] p-4 text-[12px]" style={{ background: "var(--app-surface)", color: "var(--app-text-muted)" }}>{recoveryMode ? "There are no failed executions for this workflow filter." : "No executions match these filters."}</p>
      ) : (
        <div className="grid items-start gap-3 xl:grid-cols-[minmax(320px,0.9fr)_minmax(390px,1.1fr)]">
          <section className="flex min-w-0 flex-col gap-2 rounded-[14px] p-3" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="m-0 text-[12px] font-extrabold" style={{ color: "var(--app-text)" }}>Run history</h2>
              <span className="text-[9.5px]" style={{ color: "var(--app-text-disabled)" }}>Newest first · {runs.length} loaded</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {runs.map((run) => {
                const selected = run.id === selectedSummary?.id;
                return (
                  <button key={run.id} type="button" onClick={() => setSelectedRunId(run.id)} aria-pressed={selected} className="flex w-full min-w-0 items-center gap-2 rounded-[10px] p-2.5 text-left" style={{ background: selected ? "var(--app-surface-2)" : "transparent", border: `1px solid ${selected ? "var(--app-primary)" : "var(--app-border)"}` }}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[10.5px] font-bold" style={{ color: "var(--app-text)" }}>{run.workflow?.name ?? "Workflow"}</span>
                      <span className="mt-1 block truncate font-mono text-[9px]" style={{ color: "var(--app-text-disabled)" }}>{run.workflow?.triggerKey ?? run.id}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <StatusTag status={run.status} />
                      <span className="text-[9px]" style={{ color: "var(--app-text-disabled)" }}>{formatDate(run.createdAt)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {executionsQuery.hasNextPage ? <button type="button" disabled={executionsQuery.isFetchingNextPage} onClick={() => void executionsQuery.fetchNextPage()} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-[9px] px-3 text-[10.5px] font-bold disabled:opacity-50" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>{executionsQuery.isFetchingNextPage ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}{executionsQuery.isFetchingNextPage ? "Loading…" : "Load more"}</button> : null}
          </section>
          {selectedSummary ? detailQuery.isPending ? (
            <p className="m-0 rounded-[12px] p-4 text-[12px]" style={{ background: "var(--app-surface)", color: "var(--app-text-muted)" }}>Loading execution details…</p>
          ) : detailQuery.isError ? (
            <div role="alert" className="rounded-[12px] p-4" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <p className="m-0 text-[12px] font-bold" style={{ color: "var(--app-text)" }}>Execution details are unavailable</p>
              <button type="button" onClick={() => void detailQuery.refetch()} className="mt-3 rounded-[9px] px-3 py-2 text-[11px] font-bold" style={{ background: "var(--app-primary)", color: "var(--app-primary-foreground)" }}>Retry</button>
            </div>
          ) : detailQuery.data ? <RunInspector key={detailQuery.data.id} run={detailQuery.data} /> : null : null}
        </div>
      )}
    </main>
  );
}
