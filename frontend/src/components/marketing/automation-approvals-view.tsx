"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import { decideWorkflowApproval, fetchWorkflowApprovals, type WorkflowApproval } from "@/lib/workflows-api";

type Status = WorkflowApproval["status"];
const TABS: { key: Status; label: string }[] = [
  { key: "pending", label: "Waiting" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "cancelled", label: "Cancelled" },
];

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function ApprovalCard({ approval }: { approval: WorkflowApproval }) {
  const client = useQueryClient();
  const [comment, setComment] = useState("");
  const decide = useMutation({
    mutationFn: (decision: "approve" | "reject") => decideWorkflowApproval(approval.id, decision, comment.trim() || undefined),
    onSuccess: async (_result, decision) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["automation-approvals"] }),
        client.invalidateQueries({ queryKey: ["automation-command-center"] }),
      ]);
      toast.success(decision === "approve" ? "Approved — the run continues." : "Rejected — the run stopped.");
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't record the decision.")),
  });
  const pending = approval.status === "pending";
  return (
    <article className="rounded-xl border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="m-0 text-sm font-bold">{approval.title}</h3>
          <p className="m-0 mt-0.5 text-xs" style={{ color: "var(--app-text-faint)" }}>
            {approval.workflow.name} · workflow v{approval.payload.workflowVersion} · requested {formatDate(approval.requestedAt)}
            {approval.decidedAt ? ` · decided ${formatDate(approval.decidedAt)}` : ""}
          </p>
        </div>
        <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "var(--app-surface-2)", color: pending ? "var(--app-warning-text)" : "var(--app-text-muted)" }}>
          {pending ? "Run paused" : approval.status}
        </span>
      </div>
      {approval.description && <p className="m-0 mt-2 text-xs" style={{ color: "var(--app-text-muted)" }}>{approval.description}</p>}
      {approval.payload.steps.length > 0 && (
        <>
          <p className="m-0 mt-2 text-xs font-semibold">What happens if approved</p>
          <ol className="m-0 mt-1 grid gap-1 ps-5 text-xs">
            {approval.payload.steps.map((step, index) => <li key={`${approval.id}-${index}`}>{step.summary}</li>)}
          </ol>
        </>
      )}
      {approval.decisionComment && <p className="m-0 mt-2 text-xs">Decision note: {approval.decisionComment}</p>}
      {pending && (
        <>
          <textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} rows={2} aria-label="Decision note" placeholder="Optional decision note" className="mt-3 w-full rounded-lg border p-2 text-xs" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }} />
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <button type="button" disabled={decide.isPending} onClick={() => decide.mutate("reject")} className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-50" style={{ borderColor: "var(--app-border)", color: "var(--app-danger-strong)" }}>
              Reject and stop
            </button>
            <button type="button" disabled={decide.isPending} onClick={() => decide.mutate("approve")} className="rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>
              Approve and continue
            </button>
          </div>
        </>
      )}
    </article>
  );
}

export function AutomationApprovalsView() {
  const [status, setStatus] = useState<Status>("pending");
  const query = useQuery({ queryKey: ["automation-approvals", status], queryFn: () => fetchWorkflowApprovals(status) });
  const rows = query.data ?? [];

  return (
    <main className="flex flex-col gap-5 p-5 md:p-7" style={{ color: "var(--app-text)" }}>
      <p className="m-0 max-w-3xl text-xs" style={{ color: "var(--app-text-muted)" }}>
        A workflow pauses at a &ldquo;Request approval&rdquo; step until someone decides. Approving resumes the exact workflow version and reviewed steps; rejecting stops the run. Every decision is recorded with who made it.
        Delegation, escalation and four-eyes (two-person) rules aren&rsquo;t available yet.
      </p>
      <section className="rounded-2xl border" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
        <div role="tablist" className="flex gap-4 border-b px-4 pt-3" style={{ borderColor: "var(--app-border)" }}>
          {TABS.map((tab) => (
            <button key={tab.key} type="button" role="tab" aria-selected={status === tab.key} onClick={() => setStatus(tab.key)} className="border-b-2 pb-2.5 text-sm font-bold" style={{ borderColor: status === tab.key ? "var(--app-primary)" : "transparent", color: status === tab.key ? "var(--app-text)" : "var(--app-text-faint)" }}>
              {tab.label}
            </button>
          ))}
        </div>
        <div className="p-4">
          {query.isLoading ? (
            <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading…</p>
          ) : query.isError ? (
            <div className="flex items-center gap-3 text-sm" style={{ color: "var(--app-danger-strong)" }}>
              {errorMessage(query.error, "Couldn't load approvals.")}
              <button type="button" onClick={() => query.refetch()} className="font-bold underline">Retry</button>
            </div>
          ) : rows.length === 0 ? (
            <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>{status === "pending" ? "Nothing is waiting for approval." : "No approvals here yet."}</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">{rows.map((approval) => <ApprovalCard key={approval.id} approval={approval} />)}</div>
          )}
        </div>
      </section>
    </main>
  );
}
