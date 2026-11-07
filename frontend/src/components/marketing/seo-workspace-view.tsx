"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import { askConfirm, askText } from "@/lib/ask-dialog";
import { transitionContentBrief } from "@/lib/seo-content-api";
import { transitionSeoRevision } from "@/lib/seo-on-page-api";
import { transitionTechnicalAction } from "@/lib/seo-technical-api";
import {
  fetchSeoWorkspace,
  fetchSeoWorkspaceHistory,
  SEO_WORKSPACE_KEY,
  type WorkspaceItem,
  type WorkspaceKind,
  type WorkspaceStage,
} from "@/lib/seo-workspace-api";

const STAGE_LABEL: Record<WorkspaceStage, string> = {
  new: "New finding",
  draft_ready: "Draft ready",
  waiting_approval: "Waiting approval",
  ready_to_apply: "Approved — apply on your site",
  verification_required: "Verification required",
  not_matched: "Not matched on site",
  completed: "Completed",
};
const KIND_LABEL: Record<WorkspaceKind, string> = {
  audit_finding: "Site audit",
  page_revision: "On-Page",
  technical_change: "Technical",
  content: "Content",
};
const RISK_COLOR = { low: "var(--app-text-faint)", medium: "var(--app-warning-text)", high: "var(--app-danger-strong)" };
const OTHER_QUEUES = [
  { href: "/marketing/seo-autopilot/local", label: "Local SEO" },
  { href: "/marketing/seo-autopilot/off-page", label: "Off-Page SEO" },
  { href: "/marketing/seo-autopilot/guest-posting", label: "Guest Posting" },
  { href: "/marketing/seo-autopilot/link-building", label: "Link Building" },
  { href: "/marketing/seo-autopilot/competitor-seo", label: "Competitor SEO" },
];

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function Kpi({ label, value, hint, tone, active, onClick }: { label: string; value: ReactNode; hint: string; tone?: "warning" | "danger"; active: boolean; onClick: () => void }) {
  const color = tone === "danger" ? "var(--app-danger-strong)" : tone === "warning" ? "var(--app-warning-text)" : "var(--app-text)";
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className="rounded-xl border p-3 text-left" style={{ borderColor: active ? "var(--app-primary)" : "var(--app-border)", background: "var(--app-surface)" }}>
      <p className="m-0 text-xs font-semibold" style={{ color: "var(--app-text-faint)" }}>{label}</p>
      <p className="m-0 mt-1 text-2xl font-bold" style={{ color }}>{value}</p>
      <p className="m-0 mt-1 text-[11px]" style={{ color: "var(--app-text-faintest)" }}>{hint}</p>
    </button>
  );
}

/** Approve / reject through the owning screen's API, so its rules and audit trail apply. */
async function decide(item: WorkspaceItem, approve: boolean, note?: string): Promise<void> {
  if (item.kind === "page_revision") await transitionSeoRevision(item.id, approve ? "approved" : "rejected", note);
  else if (item.kind === "technical_change") await transitionTechnicalAction(item.id, approve ? "approved" : "rejected", note);
  else await transitionContentBrief(item.id, approve ? "approved" : "drafting", note);
}

function QueueRow({ item }: { item: WorkspaceItem }) {
  const client = useQueryClient();
  const act = useMutation({
    mutationFn: ({ approve, note }: { approve: boolean; note?: string }) => decide(item, approve, note),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: SEO_WORKSPACE_KEY });
      toast.success("Decision recorded.");
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't record the decision.")),
  });
  return (
    <tr className="border-t align-top" style={{ borderColor: "var(--app-border)" }}>
      <td className="px-3 py-2">
        <span className="font-semibold">{item.action}</span>
        <span className="block" style={{ color: "var(--app-text-faint)" }}>{KIND_LABEL[item.kind]}</span>
      </td>
      <td className="max-w-[260px] break-all px-3 py-2">{item.entity}</td>
      <td className="max-w-[240px] px-3 py-2" style={{ color: "var(--app-text-muted)" }}>{item.reason ?? "—"}</td>
      <td className="px-3 py-2" style={{ color: "var(--app-text-faintest)" }}>Not estimated</td>
      <td className="px-3 py-2 font-semibold" style={{ color: RISK_COLOR[item.risk] }}>{item.risk}</td>
      <td className="max-w-[180px] px-3 py-2" style={{ color: "var(--app-text-faint)" }}>{item.origin}</td>
      <td className="px-3 py-2">
        <span className="font-semibold">{STAGE_LABEL[item.stage]}</span>
        {item.verificationNote && <span className="block" style={{ color: item.stage === "not_matched" ? "var(--app-danger-strong)" : "var(--app-text-faint)" }}>{item.verificationNote}</span>}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col gap-1">
          {item.stage === "waiting_approval" && (
            <>
              <button
                type="button"
                disabled={act.isPending}
                onClick={async () => {
                  if (item.risk !== "high" || (await askConfirm({ title: "Approve a high-risk change?", tone: "danger", confirmLabel: "Approve" }))) act.mutate({ approve: true });
                }}
                className="font-bold underline"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={act.isPending}
                onClick={async () => {
                  const note = await askText({ title: item.kind === "content" ? "What needs to change?" : "Why reject this?", tone: item.kind === "content" ? "default" : "danger" });
                  if (note) act.mutate({ approve: false, note });
                }}
                className="font-bold underline"
                style={{ color: "var(--app-text-faint)" }}
              >
                {item.kind === "content" ? "Send back" : "Reject"}
              </button>
            </>
          )}
          <Link href={item.href} className="font-bold underline">{item.stage === "draft_ready" ? "Edit" : "Open"}</Link>
        </div>
      </td>
    </tr>
  );
}

type Tab = "queue" | "history";

export function SeoWorkspaceView() {
  const queue = useQuery({ queryKey: SEO_WORKSPACE_KEY, queryFn: fetchSeoWorkspace });
  const [tab, setTab] = useState<Tab>("queue");
  const [stage, setStage] = useState<WorkspaceStage | "all">("all");
  const history = useQuery({ queryKey: [...SEO_WORKSPACE_KEY, "history"], queryFn: fetchSeoWorkspaceHistory, enabled: tab === "history" });
  const data = queue.data;
  const kpis = data?.kpis;
  const loading = queue.isLoading;
  const items = (data?.items ?? []).filter((item) => stage === "all" || item.stage === stage);
  const toggle = (next: WorkspaceStage) => {
    setTab("queue");
    setStage((current) => (current === next ? "all" : next));
  };

  return (
    <main className="flex flex-col gap-5 p-5 md:p-7" style={{ color: "var(--app-text)" }}>
      <p className="m-0 max-w-4xl text-xs" style={{ color: "var(--app-text-muted)" }}>
        One queue for every SEO change in progress — site-audit findings, page metadata, technical changes and content. Approving here uses the same rules as each screen. Noxtill doesn&rsquo;t publish to your
        website, so approved changes are applied by you and confirmed by the next site audit. Expected traffic impact is <strong>not estimated</strong> (no Search Console or analytics connection); each item shows
        who or what produced it instead of a confidence score. Other SEO work queues:{" "}
        {OTHER_QUEUES.map((queueLink, index) => (
          <span key={queueLink.href}>
            {index > 0 && ", "}
            <Link href={queueLink.href} className="underline">{queueLink.label}</Link>
          </span>
        ))}
        .
      </p>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Kpi label="New findings" value={loading ? "…" : kpis?.newFindings ?? "—"} hint={data ? `Audit issues from the last ${data.rules.newFindingDays} days` : "Recent audit issues"} active={stage === "new"} onClick={() => toggle("new")} />
        <Kpi label="Draft ready" value={loading ? "…" : kpis?.draftReady ?? "—"} hint="Not yet submitted" active={stage === "draft_ready"} onClick={() => toggle("draft_ready")} />
        <Kpi label="Waiting approval" value={loading ? "…" : kpis?.waitingApproval ?? "—"} hint="Needs a decision" tone={kpis?.waitingApproval ? "warning" : undefined} active={stage === "waiting_approval"} onClick={() => toggle("waiting_approval")} />
        <Kpi label="Ready to apply" value={loading ? "…" : kpis?.readyToApply ?? "—"} hint="Approved, apply on your site" active={stage === "ready_to_apply"} onClick={() => toggle("ready_to_apply")} />
        <Kpi label="Verification required" value={loading ? "…" : kpis?.verificationRequired ?? "—"} hint="Applied, not yet confirmed" active={stage === "verification_required"} onClick={() => toggle("verification_required")} />
        <Kpi label="Not matched" value={loading ? "…" : kpis?.notMatched ?? "—"} hint="Audit didn't see the change" tone={kpis?.notMatched ? "danger" : undefined} active={stage === "not_matched"} onClick={() => toggle("not_matched")} />
        <Kpi label="Completed" value={loading ? "…" : kpis?.completed ?? "—"} hint={data ? `Verified, last ${data.rules.completedDays} days` : "Verified"} active={stage === "completed"} onClick={() => toggle("completed")} />
      </section>

      <section className="rounded-2xl border" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
        <div role="tablist" className="flex gap-4 border-b px-4 pt-3" style={{ borderColor: "var(--app-border)" }}>
          {([["queue", stage === "all" ? "Queue" : `Queue · ${STAGE_LABEL[stage]}`], ["history", "Decision history"]] as const).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className="border-b-2 pb-2.5 text-sm font-bold" style={{ borderColor: tab === key ? "var(--app-primary)" : "transparent", color: tab === key ? "var(--app-text)" : "var(--app-text-faint)" }}>
              {label}
            </button>
          ))}
        </div>
        {tab === "queue" ? (
          queue.isLoading ? (
            <p className="m-0 p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading…</p>
          ) : queue.isError ? (
            <div className="flex items-center gap-3 p-6 text-sm" style={{ color: "var(--app-danger-strong)" }}>
              {errorMessage(queue.error, "Couldn't load the queue.")}
              <button type="button" onClick={() => queue.refetch()} className="font-bold underline">Retry</button>
            </div>
          ) : items.length === 0 ? (
            <p className="m-0 p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>{stage === "all" ? "Nothing in progress. Run a site audit or propose a change on the SEO screens." : "Nothing at this stage."}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-xs">
                <thead style={{ color: "var(--app-text-faint)" }}>
                  <tr>{["Action", "Entity", "Reason", "Expected impact", "Risk", "Source", "Stage", ""].map((heading) => <th key={heading} className="px-3 py-2 font-semibold">{heading}</th>)}</tr>
                </thead>
                <tbody>{items.map((item) => <QueueRow key={item.key} item={item} />)}</tbody>
              </table>
            </div>
          )
        ) : history.isLoading ? (
          <p className="m-0 p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading…</p>
        ) : (history.data ?? []).length === 0 ? (
          <p className="m-0 p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>No decisions recorded yet.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0 text-xs">
            {(history.data ?? []).map((row, index) => (
              <li key={`${row.entityId}-${row.createdAt}-${index}`} className="border-t px-4 py-2" style={{ borderColor: "var(--app-border)" }}>
                <span className="font-semibold">{KIND_LABEL[row.kind]}</span> · {row.action.replaceAll("_", " ")} · {row.actor} · {formatDate(row.createdAt)}
                {row.note && <span className="block" style={{ color: "var(--app-text-faint)" }}>{row.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
