"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, LoaderCircle, RotateCcw, ShieldAlert } from "lucide-react";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import {
  dismissWorkflowDeadLetter,
  fetchWorkflowDeadLetter,
  fetchWorkflowDeadLetters,
  retryWorkflowDeadLetter,
  resolveWorkflowDeadLetter,
  type WorkflowDeadLetter,
  type WorkflowDeadLetterStatus,
} from "@/lib/workflows-api";

const STATUS_OPTIONS: WorkflowDeadLetterStatus[] = [
  "open",
  "resolved",
  "dismissed",
];

function formatDate(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not recorded"
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function statusStyle(status: WorkflowDeadLetterStatus): React.CSSProperties {
  if (status === "resolved") {
    return {
      background: "var(--app-success-bg)",
      border: "1px solid var(--app-success-border)",
      color: "var(--app-success-text)",
    };
  }
  if (status === "dismissed") {
    return {
      background: "var(--app-surface-2)",
      border: "1px solid var(--app-border)",
      color: "var(--app-text-muted)",
    };
  }
  return {
    background: "var(--app-danger-bg)",
    border: "1px solid var(--app-danger-border)",
    color: "var(--app-danger-strong)",
  };
}

function StatusTag({ status }: { status: WorkflowDeadLetterStatus }) {
  return (
    <span
      className="inline-flex rounded-full px-2 py-1 text-[9.5px] font-bold capitalize"
      style={statusStyle(status)}
    >
      {status}
    </span>
  );
}

function EvidencePanel({ deadLetter }: { deadLetter: WorkflowDeadLetter }) {
  const actions = deadLetter.evidence.failedActions;
  return (
    <section
      className="flex flex-col gap-2 rounded-[12px] p-3"
      style={{ background: "var(--app-surface-2)", border: "1px solid var(--app-border)" }}
    >
      <h3
        className="m-0 text-[10px] font-extrabold uppercase tracking-wide"
        style={{ color: "var(--app-text-disabled)" }}
      >
        Failure evidence
      </h3>
      <dl className="m-0 grid grid-cols-[minmax(96px,auto)_1fr] gap-x-3 gap-y-2 text-[10.5px]">
        <dt style={{ color: "var(--app-text-disabled)" }}>Failure type</dt>
        <dd className="m-0 font-semibold" style={{ color: "var(--app-text)" }}>
          {deadLetter.failureCode.replaceAll("_", " ")}
        </dd>
        <dt style={{ color: "var(--app-text-disabled)" }}>Workflow version</dt>
        <dd className="m-0" style={{ color: "var(--app-text-muted)" }}>
          v{deadLetter.evidence.workflowVersion}
        </dd>
        <dt style={{ color: "var(--app-text-disabled)" }}>Run attempt</dt>
        <dd className="m-0" style={{ color: "var(--app-text-muted)" }}>
          {deadLetter.evidence.attemptNumber} · {deadLetter.evidence.retryCount} regular retries
        </dd>
      </dl>
      {deadLetter.evidence.error ? (
        <p
          role="alert"
          className="m-0 break-words rounded-[9px] p-2.5 text-[10.5px]"
          style={{ border: "1px solid var(--app-danger-border)", color: "var(--app-danger-strong)" }}
        >
          {deadLetter.evidence.error}
        </p>
      ) : null}
      {actions.length ? (
        <div className="flex flex-col gap-1.5">
          {actions.map((action, index) => (
            <div
              key={`${action.actionIndex ?? index}-${action.type ?? "unknown"}`}
              className="rounded-[9px] border px-2.5 py-2"
              style={{ borderColor: "var(--app-border)" }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold" style={{ color: "var(--app-text)" }}>
                  {action.actionIndex === null ? "Action" : `Action ${action.actionIndex + 1}`}
                  {action.type ? ` · ${action.type.replaceAll("_", " ")}` : ""}
                </span>
                <span className="text-[9px]" style={{ color: "var(--app-text-muted)" }}>
                  {action.retryable ? "Retryable evidence" : "Not safe to retry"}
                </span>
              </div>
              {action.error ? (
                <p className="m-0 mt-1 break-words text-[10px]" style={{ color: "var(--app-text-muted)" }}>
                  {action.error}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="m-0 text-[10.5px]" style={{ color: "var(--app-text-muted)" }}>
          The run failed without a safe action-level result. Review the execution record before taking action.
        </p>
      )}
      <p className="m-0 text-[9.5px]" style={{ color: "var(--app-text-disabled)" }}>
        Trigger payloads and secret values are not copied into this evidence snapshot.
      </p>
    </section>
  );
}

export function AutomationsRecoveryView() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<WorkflowDeadLetterStatus>("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [confirmAction, setConfirmAction] = useState<"retry" | "resolve" | "dismiss" | null>(null);
  const listQuery = useQuery({
    queryKey: ["workflow-dead-letters", status],
    queryFn: () => fetchWorkflowDeadLetters(status),
  });
  const items = useMemo(() => listQuery.data ?? [], [listQuery.data]);
  const selectedSummary = items.find((item) => item.id === selectedId) ?? items[0] ?? null;
  const detailQuery = useQuery({
    queryKey: ["workflow-dead-letter", selectedSummary?.id],
    queryFn: () => fetchWorkflowDeadLetter(selectedSummary!.id),
    enabled: Boolean(selectedSummary?.id),
  });
  const mutation = useMutation({
    mutationFn: (input: { action: "retry" | "resolve" | "dismiss"; id: string; reason: string }) => {
      if (input.action === "retry") return retryWorkflowDeadLetter(input.id, input.reason);
      if (input.action === "resolve") return resolveWorkflowDeadLetter(input.id, input.reason);
      return dismissWorkflowDeadLetter(input.id, input.reason);
    },
    onSuccess: async (_record, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workflow-dead-letters"] }),
        queryClient.invalidateQueries({ queryKey: ["workflow-dead-letter"] }),
        queryClient.invalidateQueries({ queryKey: ["workflow-executions"] }),
      ]);
      setReason("");
      setConfirmAction(null);
      toast.success(
        input.action === "retry"
          ? "Recovery retry recorded"
          : input.action === "resolve"
            ? "Dead letter resolved"
            : "Dead letter dismissed",
      );
    },
    onError: (error) => {
      setConfirmAction(null);
      toast.error(error instanceof ApiError ? error.message : "The recovery decision could not be saved.");
    },
  });
  const deadLetter = detailQuery.data ?? selectedSummary;
  const retryInProgress = Boolean(
    deadLetter?.status === "open" &&
      deadLetter.operatorRetryCount > 0 &&
      deadLetter.nextAction === "retry",
  );
  const canRetry = Boolean(
    deadLetter?.status === "open" &&
      deadLetter.nextAction === "retry" &&
      deadLetter.operatorRetryCount === 0 &&
      !retryInProgress,
  );
  const canDecide = Boolean(deadLetter?.status === "open" && !retryInProgress);

  function requestAction(action: "retry" | "resolve" | "dismiss") {
    if (!deadLetter || reason.trim().length === 0 || mutation.isPending) return;
    setConfirmAction(action);
  }

  function confirmDecision() {
    if (!deadLetter || !confirmAction || reason.trim().length === 0) return;
    mutation.mutate({ action: confirmAction, id: deadLetter.id, reason: reason.trim() });
  }

  return (
    <main className="flex flex-col gap-4 px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)" }}>
            Recovery Center
          </h1>
          <p className="m-0 mt-1 max-w-3xl text-[12px]" style={{ color: "var(--app-text-muted)" }}>
            Work terminal workflow failures from a persistent, audited dead-letter queue.
          </p>
        </div>
        <Link
          href="/marketing/automations/executions"
          className="inline-flex min-h-10 items-center gap-2 rounded-[10px] px-3 text-[11.5px] font-bold"
          style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />Execution history
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-[12px] p-3" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <label className="flex min-h-10 items-center gap-2 rounded-[9px] px-3 text-[10.5px] font-semibold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
          <span>Queue status</span>
          <select aria-label="Dead-letter status" value={status} onChange={(event) => setStatus(event.target.value as WorkflowDeadLetterStatus)} className="bg-transparent text-[11px] outline-none" style={{ color: "var(--app-text)" }}>
            {STATUS_OPTIONS.map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}
          </select>
        </label>
        <span className="text-[10px]" style={{ color: "var(--app-text-disabled)" }}>
          {items.length} {items.length === 1 ? "record" : "records"} · showing up to 100
        </span>
      </div>

      {listQuery.isPending ? (
        <p className="m-0 rounded-[12px] p-4 text-[12px]" style={{ background: "var(--app-surface)", color: "var(--app-text-muted)" }}>Loading dead-letter records…</p>
      ) : listQuery.isError ? (
        <div role="alert" className="rounded-[12px] p-4" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <p className="m-0 text-[12px] font-bold" style={{ color: "var(--app-text)" }}>The dead-letter queue is unavailable</p>
          <p className="m-0 mt-1 text-[11px]" style={{ color: "var(--app-text-muted)" }}>No sample recovery data is shown. Check the connection and try again.</p>
          <button type="button" onClick={() => void listQuery.refetch()} className="mt-3 rounded-[9px] px-3 py-2 text-[11px] font-bold" style={{ background: "var(--app-primary)", color: "var(--app-primary-foreground)" }}>Retry</button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-[12px] p-4" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <p className="m-0 text-[12px] font-bold" style={{ color: "var(--app-text)" }}>No {status} dead letters</p>
          <p className="m-0 mt-1 text-[11px]" style={{ color: "var(--app-text-muted)" }}>
            {status === "open"
              ? "No terminal failures currently need operator action. Earlier failures may still be eligible for regular retries in Execution history."
              : "No records are available for this status."}
          </p>
        </div>
      ) : (
        <div className="grid items-start gap-3 xl:grid-cols-[minmax(280px,0.82fr)_minmax(420px,1.18fr)]">
          <section className="flex min-w-0 flex-col gap-2 rounded-[14px] p-3" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="m-0 text-[12px] font-extrabold" style={{ color: "var(--app-text)" }}>Dead-letter records</h2>
              <span className="text-[9.5px]" style={{ color: "var(--app-text-disabled)" }}>Oldest first</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {items.map((item) => (
                <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} aria-pressed={item.id === deadLetter?.id} className="flex w-full min-w-0 items-center gap-2 rounded-[10px] p-2.5 text-left" style={{ background: item.id === deadLetter?.id ? "var(--app-surface-2)" : "transparent", border: `1px solid ${item.id === deadLetter?.id ? "var(--app-primary)" : "var(--app-border)"}` }}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[10.5px] font-bold" style={{ color: "var(--app-text)" }}>{item.workflow.name}</span>
                    <span className="mt-1 block truncate text-[9.5px] capitalize" style={{ color: "var(--app-text-muted)" }}>{item.failureCode.replaceAll("_", " ")} · {formatDate(item.createdAt)}</span>
                  </span>
                  <StatusTag status={item.status} />
                </button>
              ))}
            </div>
          </section>

          {selectedSummary ? detailQuery.isPending ? (
            <p className="m-0 rounded-[12px] p-4 text-[12px]" style={{ background: "var(--app-surface)", color: "var(--app-text-muted)" }}>Loading recovery evidence…</p>
          ) : detailQuery.isError ? (
            <div role="alert" className="rounded-[12px] p-4" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <p className="m-0 text-[12px] font-bold" style={{ color: "var(--app-text)" }}>Recovery evidence is unavailable</p>
              <button type="button" onClick={() => void detailQuery.refetch()} className="mt-3 rounded-[9px] px-3 py-2 text-[11px] font-bold" style={{ background: "var(--app-primary)", color: "var(--app-primary-foreground)" }}>Retry</button>
            </div>
          ) : deadLetter ? (
            <aside className="flex min-w-0 flex-col gap-3 rounded-[14px] p-4" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--app-text-disabled)" }}>Workflow</p>
                  <h2 className="m-0 mt-1 break-words text-[14px] font-extrabold" style={{ color: "var(--app-text)" }}>{deadLetter.workflow.name}</h2>
                  <p className="m-0 mt-1 break-all font-mono text-[9px]" style={{ color: "var(--app-text-disabled)" }}>Run {deadLetter.workflowRunId}</p>
                </div>
                <StatusTag status={deadLetter.status} />
              </div>

              <dl className="m-0 grid grid-cols-[minmax(100px,auto)_1fr] gap-x-3 gap-y-2 text-[10.5px]">
                <dt style={{ color: "var(--app-text-disabled)" }}>Owner</dt>
                <dd className="m-0" style={{ color: "var(--app-text-muted)" }}>{deadLetter.ownerUser?.name ?? `Business ${deadLetter.ownerRole.toLowerCase()} role (unassigned)`}</dd>
                <dt style={{ color: "var(--app-text-disabled)" }}>Next action</dt>
                <dd className="m-0 capitalize" style={{ color: "var(--app-text-muted)" }}>{retryInProgress ? "retry in progress" : deadLetter.nextAction.replaceAll("_", " ")}</dd>
                <dt style={{ color: "var(--app-text-disabled)" }}>Created</dt>
                <dd className="m-0" style={{ color: "var(--app-text-muted)" }}>{formatDate(deadLetter.createdAt)}</dd>
                <dt style={{ color: "var(--app-text-disabled)" }}>Attempts</dt>
                <dd className="m-0" style={{ color: "var(--app-text-muted)" }}>{deadLetter.workflowRun.attempts.length} recorded · {deadLetter.workflowRun.retryCount} regular retries</dd>
              </dl>

              <EvidencePanel deadLetter={deadLetter} />

              {retryInProgress && (
                <p
                  className="m-0 rounded-[9px] p-2.5 text-[10.5px]"
                  role="status"
                  style={{
                    background: "var(--app-warning-bg)",
                    color: "var(--app-warning-text)",
                  }}
                >
                  A recovery retry is running. Resolve or dismiss this record
                  after the attempt finishes.
                </p>
              )}

              <section className="flex flex-col gap-2">
                <h3 className="m-0 text-[10px] font-extrabold uppercase tracking-wide" style={{ color: "var(--app-text-disabled)" }}>Attempt history</h3>
                {deadLetter.workflowRun.attempts.map((attempt) => (
                  <div key={attempt.id} className="flex flex-wrap items-center gap-2 rounded-[9px] p-2" style={{ background: "var(--app-surface-2)" }}>
                    <span className="text-[10px] font-bold" style={{ color: "var(--app-text)" }}>Attempt {attempt.attemptNumber}</span>
                    <span className="text-[9.5px] capitalize" style={{ color: "var(--app-text-muted)" }}>{attempt.status}</span>
                    <span className="ml-auto text-[9px]" style={{ color: "var(--app-text-disabled)" }}>{formatDate(attempt.startedAt)}</span>
                  </div>
                ))}
              </section>

              {canDecide ? (
                <div className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
                  <label className="flex flex-col gap-1 text-[10.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>
                    Reason for decision
                    <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} rows={3} placeholder="Record what you checked and why you chose this action" className="rounded-[9px] p-2.5 text-[11px] font-normal outline-none" style={{ background: "var(--app-surface-2)", border: "1px solid var(--app-border)", color: "var(--app-text)" }} />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {canRetry ? <button type="button" onClick={() => requestAction("retry")} disabled={mutation.isPending || !reason.trim()} className="inline-flex min-h-9 items-center gap-1.5 rounded-[9px] px-3 text-[10.5px] font-bold disabled:opacity-50" style={{ background: "var(--app-primary)", color: "var(--app-primary-foreground)" }}><RotateCcw className="h-3.5 w-3.5" aria-hidden />Retry once</button> : null}
                    <button type="button" onClick={() => requestAction("resolve")} disabled={mutation.isPending || !reason.trim()} className="min-h-9 rounded-[9px] px-3 text-[10.5px] font-bold disabled:opacity-50" style={{ border: "1px solid var(--app-success-border)", color: "var(--app-success-text)" }}>Resolve</button>
                    <button type="button" onClick={() => requestAction("dismiss")} disabled={mutation.isPending || !reason.trim()} className="min-h-9 rounded-[9px] px-3 text-[10.5px] font-bold disabled:opacity-50" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Dismiss</button>
                  </div>
                  {confirmAction ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-[10px] p-3" style={{ background: "var(--app-warning-bg)", border: "1px solid var(--app-warning-border)" }}>
                      <ShieldAlert className="h-4 w-4 shrink-0" style={{ color: "var(--app-warning-text)" }} aria-hidden />
                      <p className="m-0 min-w-[180px] flex-1 text-[10.5px]" style={{ color: "var(--app-warning-text)" }}>
                        {confirmAction === "retry"
                          ? "Only previously failed actions will run. Completed actions keep their idempotency protection."
                          : confirmAction === "resolve"
                            ? "This closes the recovery item; the original failed run remains in history."
                            : "This dismisses the recovery item without changing the original run."}
                      </p>
                      <button type="button" onClick={confirmDecision} disabled={mutation.isPending} className="inline-flex min-h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-[10px] font-bold disabled:opacity-50" style={{ background: "var(--app-warning-text)", color: "var(--app-surface)" }}>
                        {mutation.isPending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}Confirm
                      </button>
                      <button type="button" onClick={() => setConfirmAction(null)} disabled={mutation.isPending} className="min-h-8 rounded-[8px] px-2.5 text-[10px] font-bold" style={{ color: "var(--app-warning-text)" }}>Cancel</button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {deadLetter.decisions?.length ? (
                <section className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
                  <h3 className="m-0 text-[10px] font-extrabold uppercase tracking-wide" style={{ color: "var(--app-text-disabled)" }}>Decision audit</h3>
                  {deadLetter.decisions.map((decision) => (
                    <div key={decision.id} className="rounded-[9px] p-2" style={{ background: "var(--app-surface-2)" }}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-bold capitalize" style={{ color: "var(--app-text)" }}>{decision.action.replaceAll("_", " ")}</span>
                        <span className="text-[9px]" style={{ color: "var(--app-text-muted)" }}>{decision.actorUser?.name ?? "System"}</span>
                        <span className="ml-auto text-[9px]" style={{ color: "var(--app-text-disabled)" }}>{formatDate(decision.createdAt)}</span>
                      </div>
                      {decision.reason ? <p className="m-0 mt-1 break-words text-[9.5px]" style={{ color: "var(--app-text-muted)" }}>{decision.reason}</p> : null}
                    </div>
                  ))}
                </section>
              ) : null}
            </aside>
          ) : null : null}
        </div>
      )}
    </main>
  );
}
