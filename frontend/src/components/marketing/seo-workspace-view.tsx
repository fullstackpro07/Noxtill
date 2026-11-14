"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import { askConfirm, askText } from "@/lib/ask-dialog";
import { fetchContentOpportunities, transitionContentBrief } from "@/lib/seo-content-api";
import { transitionSeoRevision } from "@/lib/seo-on-page-api";
import { transitionTechnicalAction } from "@/lib/seo-technical-api";
import { useSession } from "@/lib/session";
import { SpecialistAgentUsage } from "@/components/agents/specialist-agent-usage";
import {
  fetchSeoAgentRuns,
  fetchSeoWorkspace,
  fetchSeoWorkspaceHistory,
  generateSeoOnPageRevision,
  generateSeoOpportunityBrief,
  prepareSeoTechnicalReview,
  runSeoAgentReview,
  SEO_WORKSPACE_KEY,
  type SeoAgentRun,
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
  const prepareRevision = useMutation({
    mutationFn: () => generateSeoOnPageRevision(item.id),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: SEO_WORKSPACE_KEY }),
        client.invalidateQueries({ queryKey: ["seo-on-page-summary"] }),
        client.invalidateQueries({ queryKey: ["seo-on-page-pages"] }),
        client.invalidateQueries({ queryKey: ["seo-revisions"] }),
      ]);
      toast.success("Revision draft created. Review it in On-Page before submitting for approval.");
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't prepare the revision draft.")),
  });
  const prepareTechnicalReview = useMutation({
    mutationFn: () => prepareSeoTechnicalReview(item.id),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: SEO_WORKSPACE_KEY }),
        client.invalidateQueries({ queryKey: ["seo-technical-overview"] }),
        client.invalidateQueries({ queryKey: ["seo-technical-actions"] }),
      ]);
      toast.success("Technical review draft created. Review it in Technical SEO before submitting it for approval.");
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't prepare the technical review draft.")),
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
          {item.kind === "audit_finding" && item.canPrepareOnPageRevision && item.stage === "new" && (
            <button
              type="button"
              disabled={prepareRevision.isPending}
              onClick={() => prepareRevision.mutate()}
              className="font-bold underline disabled:opacity-50"
            >
              {prepareRevision.isPending ? "Preparing…" : "Prepare revision"}
            </button>
          )}
          {item.kind === "audit_finding" && item.canPrepareTechnicalReview && item.stage === "new" && (
            <button
              type="button"
              disabled={prepareTechnicalReview.isPending}
              onClick={() => prepareTechnicalReview.mutate()}
              className="font-bold underline disabled:opacity-50"
            >
              {prepareTechnicalReview.isPending ? "Preparing…" : "Prepare technical review"}
            </button>
          )}
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
  const session = useSession();
  const client = useQueryClient();
  const canRunAgent = session.user.role !== "staff";
  const queue = useQuery({ queryKey: SEO_WORKSPACE_KEY, queryFn: fetchSeoWorkspace });
  const [tab, setTab] = useState<Tab>("queue");
  const [stage, setStage] = useState<WorkspaceStage | "all">("all");
  const [agentQuestion, setAgentQuestion] = useState("");
  const history = useQuery({ queryKey: [...SEO_WORKSPACE_KEY, "history"], queryFn: fetchSeoWorkspaceHistory, enabled: tab === "history" });
  const agentRuns = useQuery({ queryKey: [...SEO_WORKSPACE_KEY, "agent-runs"], queryFn: fetchSeoAgentRuns });
  const contentOpportunities = useQuery({ queryKey: ["seo-content-opportunities"], queryFn: fetchContentOpportunities });
  const agentRun = useMutation({
    mutationFn: runSeoAgentReview,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: [...SEO_WORKSPACE_KEY, "agent-runs"] });
      toast.success("SEO Agent review saved.");
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't run the SEO review.")),
  });
  const briefFromOpportunity = useMutation({
    mutationFn: generateSeoOpportunityBrief,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["seo-content-opportunities"] }),
        client.invalidateQueries({ queryKey: ["seo-content-briefs"] }),
        client.invalidateQueries({ queryKey: SEO_WORKSPACE_KEY }),
      ]);
      toast.success("AI brief created. Review it in Content before drafting or publishing.");
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't create the content brief.")),
  });
  const data = queue.data;
  const kpis = data?.kpis;
  const loading = queue.isLoading;
  const items = (data?.items ?? []).filter((item) => stage === "all" || item.stage === stage);
  const latestAgentRun: SeoAgentRun | undefined = agentRuns.data?.[0];
  const agentOffPageRecords = latestAgentRun?.output?.snapshot?.offPageRecords;
  const agentRankHistory = latestAgentRun?.output?.snapshot?.rankHistory;
  const hasTeamOffPageRecords = agentOffPageRecords
    ? agentOffPageRecords.trackedLinks +
        agentOffPageRecords.openTrackedOpportunities +
        agentOffPageRecords.guestPublications +
        agentOffPageRecords.guestPitches >
      0
    : false;
  const toggle = (next: WorkspaceStage) => {
    setTab("queue");
    setStage((current) => (current === next ? "all" : next));
  };

  return (
    <main className="flex flex-col gap-5 p-5 md:p-7" style={{ color: "var(--app-text)" }}>
      <p className="m-0 max-w-4xl text-xs" style={{ color: "var(--app-text-muted)" }}>
        One queue for every SEO change in progress — site-audit findings, page metadata, technical changes and content. Approving here uses the same rules as each screen. Noxtill doesn&rsquo;t publish to your
        website, so approved changes are applied by you and confirmed by the next site audit. Expected page-level traffic impact is <strong>not estimated</strong> (this queue does not include Search Console metrics and no analytics source attributes visits to orders); each item shows
        who or what produced it instead of a confidence score. Other SEO work queues:{" "}
        {OTHER_QUEUES.map((queueLink, index) => (
          <span key={queueLink.href}>
            {index > 0 && ", "}
            <Link href={queueLink.href} className="underline">{queueLink.label}</Link>
          </span>
        ))}
        .
      </p>

      <section className="rounded-2xl border p-4" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-sm font-bold">SEO Autopilot Agent</h2>
            <p className="mb-0 mt-1 max-w-3xl text-xs leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
              A read-only review of this existing workspace queue. It can identify the next item to review, but it does not approve or publish changes. Search Console clicks and impressions and aggregate GA4 Organic Search metrics may appear when connected; provider-wide backlink data is not included.
            </p>
          </div>
          {canRunAgent && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => agentRun.mutate(undefined)} disabled={agentRun.isPending} className="rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-60" style={{ background: "var(--app-primary)" }}>
                {agentRun.isPending ? "Reviewing…" : "Run agent review"}
              </button>
            </div>
          )}
        </div>
        {canRunAgent && (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex-1 text-xs font-semibold">
              Ask about the saved SEO evidence
              <textarea
                value={agentQuestion}
                onChange={(event) => setAgentQuestion(event.target.value)}
                maxLength={1000}
                rows={2}
                placeholder="For example: Which tracked keywords have declined, and what evidence is available?"
                className="mt-1 block w-full rounded-lg border px-3 py-2 text-xs font-normal"
                style={{ background: "var(--app-surface-2)", borderColor: "var(--app-border)", color: "var(--app-text)" }}
              />
            </label>
            <button
              type="button"
              onClick={() => agentRun.mutate(agentQuestion.trim())}
              disabled={agentRun.isPending || agentQuestion.trim().length < 4}
              className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-50"
              style={{ borderColor: "var(--app-border)", color: "var(--app-text)" }}
            >
              Ask SEO Agent
            </button>
          </div>
        )}
        <p className="mb-0 mt-2 text-[10.5px]" style={{ color: "var(--app-text-faint)" }}>
          The agent answers only from the saved evidence in its review. Your question is sent to the configured AI provider for this answer; Noxtill stores only its hash in run metadata.
        </p>
        {latestAgentRun?.output && (
          <div className="mt-3 rounded-xl p-3" style={{ background: "var(--app-surface-2)" }}>
            <p className="m-0 text-xs font-semibold">{latestAgentRun.recommendations[0]?.summary ?? latestAgentRun.output.summary}</p>
            {latestAgentRun.output.snapshot?.queueCounts && (
              <div className="mt-2 flex flex-wrap gap-2 text-[10.5px]" style={{ color: "var(--app-text-muted)" }}>
                <span>{latestAgentRun.output.snapshot.queueCounts.newFindings} new</span>
                <span>{latestAgentRun.output.snapshot.queueCounts.waitingApproval} waiting approval</span>
                <span>{latestAgentRun.output.snapshot.queueCounts.verificationRequired} need verification</span>
                <span>{latestAgentRun.output.snapshot.queueCounts.notMatched} not matched</span>
              </div>
            )}
            {agentRankHistory && (
              <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[10.5px]" style={{ color: "var(--app-text-muted)" }}>
                  <span>
                    Rank snapshots: {agentRankHistory.keywordsWithSnapshots} / {agentRankHistory.trackedKeywordCount} keywords
                    {agentRankHistory.trackedKeywordCount > 0 && ` · ${agentRankHistory.staleKeywordCount} stale`}
                  </span>
                  <span>
                    {agentRankHistory.improving} improving · {agentRankHistory.declining} declining · {agentRankHistory.unchanged} unchanged
                  </span>
                  <Link href="/marketing/seo-autopilot/rank-tracking" className="font-bold underline">Open Rank Tracking</Link>
                </div>
                {agentRankHistory.observations.length > 0 ? (
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-left text-[10.5px]">
                      <thead style={{ color: "var(--app-text-faint)" }}>
                        <tr>
                          <th className="px-2 py-1 font-medium">Tracked keyword</th>
                          <th className="px-2 py-1 font-medium">Latest rank</th>
                          <th className="px-2 py-1 font-medium">Previous</th>
                          <th className="px-2 py-1 font-medium">Movement</th>
                          <th className="px-2 py-1 font-medium">Checked</th>
                          <th className="px-2 py-1 font-medium">Search interest</th>
                        </tr>
                      </thead>
                      <tbody>
                        {agentRankHistory.observations.slice(0, 5).map((row) => (
                          <tr key={row.keyword} className="border-t" style={{ borderColor: "var(--app-border)" }}>
                            <td className="px-2 py-1.5 font-medium">{row.keyword}</td>
                            <td className="px-2 py-1.5">{row.latestStatus === "not_checked" ? "Not checked" : row.latestStatus === "not_in_results" ? "Not in results" : row.latestRank}</td>
                            <td className="px-2 py-1.5">{row.previousRank ?? "—"}</td>
                            <td className="px-2 py-1.5 capitalize">{row.movement.replaceAll("_", " ")}</td>
                            <td className="px-2 py-1.5">{row.capturedAt ? `${new Date(row.capturedAt).toLocaleDateString()} · ${row.freshness}` : "Not tracked"}</td>
                            <td className="px-2 py-1.5">{row.searchInterestIndex === null ? "Not tracked" : `${row.searchInterestIndex} / 100 index`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mb-0 mt-1 text-[10px]" style={{ color: "var(--app-text-faint)" }}>
                      Positions are saved observations, not guaranteed results. Search interest is a relative Google Trends index, not monthly search volume.
                      {agentRankHistory.truncated ? " Some tracked keywords are omitted from this review." : ""}
                    </p>
                  </div>
                ) : (
                  <p className="mb-0 mt-2 text-[10.5px]" style={{ color: "var(--app-text-faint)" }}>
                    {agentRankHistory.trackedKeywordCount === 0 ? "No tracked keywords are configured." : "No rank snapshots are saved yet."}
                  </p>
                )}
              </div>
            )}
            {agentOffPageRecords && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px]" style={{ color: "var(--app-text-muted)" }}>
                {!hasTeamOffPageRecords ? (
                  <span>No tracked off-page or guest-post records in this review</span>
                ) : (
                  <span>
                    Team records: {agentOffPageRecords.trackedLinks} tracked links
                    ({agentOffPageRecords.activeLinks} active · {agentOffPageRecords.lostLinks} marked lost · {agentOffPageRecords.unverifiedLinks} unverified), {agentOffPageRecords.openTrackedOpportunities} open opportunities, {agentOffPageRecords.guestPublications} publications and {agentOffPageRecords.guestPitches} pitches
                  </span>
                )}
                <Link href="/marketing/seo-autopilot/off-page" className="font-bold underline">Review Off-Page SEO</Link>
                <span>Merchant-entered only · no provider authority score</span>
              </div>
            )}
            {latestAgentRun.output.aiSummary && (
              <div className="mb-0 mt-2 whitespace-pre-wrap text-[11px]" style={{ color: "var(--app-text-muted)" }}>
                {latestAgentRun.output.aiSummary.mode === "question" ? "Question answer" : "Optional AI explanation"} · {latestAgentRun.output.aiSummary.status}: {latestAgentRun.output.aiSummary.text ?? latestAgentRun.output.aiSummary.message}
              </div>
            )}
            <SpecialistAgentUsage calls={latestAgentRun.aiCallLogs} />
          </div>
        )}
      </section>

      <section className="rounded-2xl border p-4" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-sm font-bold">Content opportunities</h2>
            <p className="mb-0 mt-1 text-xs" style={{ color: "var(--app-text-muted)" }}>
              Based on tracked keywords, rank checks and the latest site audit. The agent can prepare a source-backed brief; you review it in Content. AI drafts must be enabled and a provider configured.
            </p>
          </div>
          <Link href="/marketing/seo-autopilot/content" className="text-xs font-bold underline">Open Content</Link>
        </div>
        {contentOpportunities.isLoading ? (
          <p className="mb-0 mt-3 text-xs" style={{ color: "var(--app-text-faint)" }}>Loading opportunities…</p>
        ) : contentOpportunities.isError ? (
          <p className="mb-0 mt-3 text-xs" style={{ color: "var(--app-danger-strong)" }}>
            {errorMessage(contentOpportunities.error, "Couldn't load content opportunities.")}
            {" "}<button type="button" onClick={() => contentOpportunities.refetch()} className="font-bold underline">Retry</button>
          </p>
        ) : (contentOpportunities.data?.opportunities ?? []).filter((item) => !item.dismissed && !item.briefId).length === 0 ? (
          <p className="mb-0 mt-3 text-xs" style={{ color: "var(--app-text-faint)" }}>No open, unbriefed content opportunities from current sources.</p>
        ) : (
          <ul className="mb-0 mt-3 flex list-none flex-col p-0">
            {(contentOpportunities.data?.opportunities ?? []).filter((item) => !item.dismissed && !item.briefId).map((item) => (
              <li key={item.keywordId} className="flex flex-wrap items-center justify-between gap-3 border-t py-3 text-xs" style={{ borderColor: "var(--app-border)" }}>
                <div className="min-w-[220px] flex-1">
                  <p className="m-0 font-semibold">{item.keyword}</p>
                  <p className="mb-0 mt-1" style={{ color: "var(--app-text-muted)" }}>{item.evidence} · {item.kind.replaceAll("_", " ")} · {item.suggestedFormat.replaceAll("_", " ")}</p>
                </div>
                <button type="button" disabled={!canRunAgent || briefFromOpportunity.isPending} onClick={() => briefFromOpportunity.mutate(item.keywordId)} className="rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>
                  {briefFromOpportunity.isPending && briefFromOpportunity.variables === item.keywordId ? "Generating…" : "Generate AI brief"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

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
