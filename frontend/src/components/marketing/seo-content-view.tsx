"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import {
  dismissContentOpportunity,
  fetchContentBriefs,
  fetchContentOpportunities,
  fetchContentSummary,
  fetchRefreshQueue,
  generateContentBrief,
  generateContentDraft,
  recordContentPublished,
  reopenContentOpportunity,
  transitionContentBrief,
  updateContentBrief,
  type BriefStatus,
  type ContentBrief,
  type ContentFormat,
  type ContentOpportunity,
} from "@/lib/seo-content-api";

const KIND_LABEL: Record<ContentOpportunity["kind"], string> = {
  new_page: "New page",
  missing_page: "Fix missing page",
  improve: "Improve page",
};
const FORMAT_LABEL: Record<ContentFormat, string> = {
  blog_post: "Blog post",
  guide: "Guide",
  landing_page: "Landing page",
  faq: "FAQ",
  location_page: "Location page",
  product_page: "Product page",
  other: "Other",
};
const STATUS_LABEL: Record<BriefStatus, string> = {
  brief: "Brief ready",
  drafting: "Drafting",
  approval_required: "Awaiting approval",
  approved: "Approved — publish on your site",
  published: "Published",
  dismissed: "Dismissed",
};
const QUERY_KEYS = [["seo-content-summary"], ["seo-content-opportunities"], ["seo-content-briefs"], ["seo-content-refresh"]];

const fieldClass = "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--app-primary)]";
const fieldStyle = { borderColor: "var(--app-border)", background: "var(--app-surface)" };

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function useRefresh() {
  const client = useQueryClient();
  return () => Promise.all(QUERY_KEYS.map((queryKey) => client.invalidateQueries({ queryKey })));
}

function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint: string; tone?: "warning" }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
      <p className="m-0 text-xs font-semibold" style={{ color: "var(--app-text-faint)" }}>{label}</p>
      <p className="m-0 mt-1 text-2xl font-bold" style={{ color: tone === "warning" ? "var(--app-warning-text)" : "var(--app-text)" }}>{value}</p>
      <p className="m-0 mt-1 text-xs" style={{ color: "var(--app-text-faintest)" }}>{hint}</p>
    </div>
  );
}

const lines = (value: string) => value.split("\n").map((line) => line.trim()).filter(Boolean);

function BriefEditor({ brief, onClose }: { brief: ContentBrief; onClose: () => void }) {
  const refresh = useRefresh();
  const editable = brief.status === "brief" || brief.status === "drafting";
  const [topic, setTopic] = useState(brief.topic);
  const [audience, setAudience] = useState(brief.audience ?? "");
  const [format, setFormat] = useState<ContentFormat>(brief.format);
  const [outline, setOutline] = useState(brief.outline.join("\n"));
  const [questions, setQuestions] = useState(brief.questions.join("\n"));
  const [sourceNotes, setSourceNotes] = useState(brief.sourceNotes ?? "");
  const [draftTitle, setDraftTitle] = useState(brief.draftTitle ?? "");
  const [draftBody, setDraftBody] = useState(brief.draftBody ?? "");
  const [publishedUrl, setPublishedUrl] = useState("");
  const onError = (error: unknown) => toast.error(errorMessage(error, "Couldn't update the brief."));
  const save = useMutation({
    mutationFn: () =>
      updateContentBrief(brief.id, {
        topic,
        audience,
        format,
        outline: lines(outline),
        questions: lines(questions),
        sourceNotes,
        ...(draftTitle !== (brief.draftTitle ?? "") || draftBody !== (brief.draftBody ?? "") ? { draftTitle, draftBody } : {}),
      }),
    onSuccess: async () => {
      await refresh();
      toast.success("Saved.");
    },
    onError,
  });
  const draft = useMutation({
    mutationFn: async () => {
      await updateContentBrief(brief.id, { sourceNotes });
      return generateContentDraft(brief.id);
    },
    onSuccess: async (updated) => {
      setDraftTitle(updated.draftTitle ?? "");
      setDraftBody(updated.draftBody ?? "");
      await refresh();
      toast.success("AI draft ready — review every sentence before submitting.");
    },
    onError,
  });
  const move = useMutation({
    mutationFn: ({ status, note }: { status: "drafting" | "approval_required" | "approved" | "dismissed"; note?: string }) => transitionContentBrief(brief.id, status, note),
    onSuccess: async () => {
      await refresh();
      onClose();
    },
    onError,
  });
  const publish = useMutation({
    mutationFn: () => recordContentPublished(brief.id, publishedUrl.trim()),
    onSuccess: async () => {
      await refresh();
      toast.success("Recorded. The next site audit confirms the page is live.");
      onClose();
    },
    onError,
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside role="dialog" aria-modal="true" aria-label={`Brief: ${brief.topic}`} className="flex h-full w-full max-w-3xl flex-col gap-3 overflow-y-auto border-l p-5" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)", color: "var(--app-text)" }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-base font-bold">{brief.topic}</h2>
            <p className="m-0 text-xs" style={{ color: "var(--app-text-faint)" }}>
              {STATUS_LABEL[brief.status]}{brief.keywordText ? ` · keyword “${brief.keywordText}”` : ""}{brief.briefSource === "ai" ? " · AI brief" : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-sm font-semibold" style={{ color: "var(--app-text-faint)" }}>Close</button>
        </div>
        {brief.strategyNote && <p className="m-0 text-xs">Strategy: {brief.strategyNote}</p>}
        {brief.decisionNote && <p className="m-0 text-xs" style={{ color: "var(--app-warning-text)" }}>Reviewer note: {brief.decisionNote}</p>}

        <section className="flex flex-col gap-2 rounded-xl border p-3" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
          <p className="m-0 text-sm font-bold">Brief</p>
          <input disabled={!editable} value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={300} className={fieldClass} style={fieldStyle} aria-label="Topic" />
          <div className="grid gap-2 md:grid-cols-2">
            <input disabled={!editable} value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="Audience" className={fieldClass} style={fieldStyle} aria-label="Audience" />
            <select disabled={!editable} value={format} onChange={(event) => setFormat(event.target.value as ContentFormat)} className={fieldClass} style={fieldStyle} aria-label="Format">
              {Object.entries(FORMAT_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
          <textarea disabled={!editable} value={outline} onChange={(event) => setOutline(event.target.value)} rows={4} placeholder="Outline — one heading per line" className={fieldClass} style={fieldStyle} aria-label="Outline" />
          <textarea disabled={!editable} value={questions} onChange={(event) => setQuestions(event.target.value)} rows={3} placeholder="Questions to answer — one per line" className={fieldClass} style={fieldStyle} aria-label="Questions" />
          {brief.internalLinks.length > 0 && (
            <p className="m-0 text-xs" style={{ color: "var(--app-text-muted)" }}>Link to (pages found by your site audit): {brief.internalLinks.join(", ")}</p>
          )}
          <textarea
            disabled={!editable}
            value={sourceNotes}
            onChange={(event) => setSourceNotes(event.target.value)}
            rows={3}
            placeholder="Facts about your business the writer may use (products, prices, areas served, experience…). AI drafts may not claim anything beyond these."
            className={fieldClass}
            style={fieldStyle}
            aria-label="Source notes"
          />
        </section>

        <section className="flex flex-col gap-2 rounded-xl border p-3" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="m-0 text-sm font-bold">Draft{brief.draftSource ? ` · ${brief.draftSource === "ai" ? "AI" : brief.draftSource === "ai_edited" ? "AI, edited" : "written by your team"}` : ""}</p>
            {editable && (
              <button type="button" disabled={draft.isPending} onClick={() => draft.mutate()} className="text-xs font-bold underline disabled:opacity-50">
                {draft.isPending ? "Drafting…" : brief.draftBody ? "Regenerate with AI" : "Create draft with AI"}
              </button>
            )}
          </div>
          <input disabled={!editable} value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="Page title" className={fieldClass} style={fieldStyle} aria-label="Draft title" />
          <textarea disabled={!editable} value={draftBody} onChange={(event) => setDraftBody(event.target.value)} rows={14} placeholder="Write the page here (Markdown)" className={`${fieldClass} font-mono`} style={fieldStyle} aria-label="Draft body" />
        </section>

        {brief.status === "published" && (
          <p className="m-0 text-xs">
            Published at <a href={brief.publishedUrl ?? "#"} target="_blank" rel="noreferrer" className="underline">{brief.publishedUrl}</a>
            {brief.liveConfirmedAt ? ` · confirmed live by the site audit on ${formatDate(brief.liveConfirmedAt)}` : " · waiting for the next site audit to confirm it's live"}
            {brief.baselineRank !== null ? ` · keyword rank when published: #${brief.baselineRank}` : ""}
          </p>
        )}
        {brief.status === "approved" && (
          <div className="flex flex-col gap-2 rounded-xl border p-3" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
            <p className="m-0 text-xs" style={{ color: "var(--app-text-muted)" }}>
              Noxtill can&rsquo;t publish to your website. Copy the approved draft into your site, then record the live URL here.
            </p>
            <div className="flex gap-2">
              <input value={publishedUrl} onChange={(event) => setPublishedUrl(event.target.value)} placeholder="https://your-site/new-page" className={fieldClass} style={fieldStyle} aria-label="Published URL" />
              <button type="button" disabled={publish.isPending || !publishedUrl.trim()} onClick={() => publish.mutate()} className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-bold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>
                Mark published
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3 text-xs">
          {editable && <button type="button" disabled={save.isPending} onClick={() => save.mutate()} className="rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>{save.isPending ? "Saving…" : "Save"}</button>}
          {brief.status === "brief" && <button type="button" onClick={() => move.mutate({ status: "drafting" })} className="font-bold underline">Start drafting</button>}
          {brief.status === "drafting" && <button type="button" disabled={move.isPending} onClick={() => move.mutate({ status: "approval_required" })} className="font-bold underline">Submit for approval</button>}
          {brief.status === "approval_required" && (
            <>
              <button type="button" disabled={move.isPending} onClick={() => move.mutate({ status: "approved" })} className="font-bold underline">Approve</button>
              <button
                type="button"
                disabled={move.isPending}
                onClick={() => {
                  const note = window.prompt("What needs to change?")?.trim();
                  if (note) move.mutate({ status: "drafting", note });
                }}
                className="font-bold underline"
              >
                Send back
              </button>
            </>
          )}
          {brief.status !== "published" && brief.status !== "dismissed" && (
            <button
              type="button"
              disabled={move.isPending}
              onClick={() => {
                const note = window.prompt("Why dismiss this brief?")?.trim();
                if (note) move.mutate({ status: "dismissed", note });
              }}
              className="font-bold underline"
              style={{ color: "var(--app-text-faint)" }}
            >
              Dismiss
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}

type Tab = "opportunities" | "briefs" | "refresh";

export function SeoContentView() {
  const refresh = useRefresh();
  const summary = useQuery({ queryKey: ["seo-content-summary"], queryFn: fetchContentSummary });
  const opps = useQuery({ queryKey: ["seo-content-opportunities"], queryFn: fetchContentOpportunities });
  const briefs = useQuery({ queryKey: ["seo-content-briefs"], queryFn: fetchContentBriefs });
  const refreshQueue = useQuery({ queryKey: ["seo-content-refresh"], queryFn: fetchRefreshQueue });
  const [tab, setTab] = useState<Tab>("opportunities");
  const [showDismissed, setShowDismissed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const onError = (error: unknown) => toast.error(errorMessage(error, "Something went wrong."));
  const generate = useMutation({
    mutationFn: ({ keywordId, strategyNote }: { keywordId: string; strategyNote?: string }) => generateContentBrief(keywordId, strategyNote),
    onSuccess: async (brief) => {
      await refresh();
      setOpenId(brief.id);
    },
    onError,
  });
  const dismiss = useMutation({
    mutationFn: ({ row, reason }: { row: ContentOpportunity; reason: string }) => dismissContentOpportunity(row.keywordId, row.kind, reason),
    onSuccess: refresh,
    onError,
  });
  const reopen = useMutation({
    mutationFn: (row: ContentOpportunity) => reopenContentOpportunity(row.keywordId, row.kind),
    onSuccess: refresh,
    onError,
  });
  const data = summary.data;
  const loading = summary.isLoading;
  const rows = (opps.data?.opportunities ?? []).filter((row) => showDismissed || !row.dismissed);
  const openBrief = (briefs.data ?? []).find((brief) => brief.id === openId) ?? null;
  const activeBriefs = (briefs.data ?? []).filter((brief) => brief.status !== "dismissed");

  return (
    <main className="flex flex-col gap-5 p-5 md:p-7" style={{ color: "var(--app-text)" }}>
      <p className="m-0 max-w-3xl text-xs" style={{ color: "var(--app-text-muted)" }}>
        Opportunities come from your tracked keywords, their latest rank checks and your latest site audit — each shows why it was flagged. Interest is Google Trends&rsquo; relative 0–100 index, not search volume.
        Noxtill doesn&rsquo;t publish to your website: you publish approved drafts and record the URL, and a later audit confirms it&rsquo;s live. Page traffic is <strong>not tracked</strong>.
      </p>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Open opportunities" value={loading ? "…" : data?.openOpportunities ?? "—"} hint="Not briefed or dismissed" />
        <Kpi label="Briefs ready" value={loading ? "…" : data?.briefsReady ?? "—"} hint="Waiting for a draft" />
        <Kpi label="Drafts" value={loading ? "…" : data?.drafts ?? "—"} hint="Drafting, in review or approved" />
        <Kpi label="Refresh due" value={loading ? "…" : data?.refreshDue ?? "—"} hint={data ? `Rank fell ${data.rules.refreshDropPositions}+ places since publishing` : "Based on rank changes"} tone={data?.refreshDue ? "warning" : undefined} />
        <Kpi label="Published / monitoring" value={loading ? "…" : data?.publishedMonitoring ?? "—"} hint="Recorded as published" />
        <Kpi label="Content gaps" value={loading ? "…" : data?.contentGaps ?? "—"} hint="Keywords with no page at all" />
      </section>

      <section className="rounded-2xl border" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
        <div role="tablist" className="flex flex-wrap items-center gap-4 border-b px-4 pt-3" style={{ borderColor: "var(--app-border)" }}>
          {([["opportunities", "Opportunities"], ["briefs", `Briefs & drafts (${activeBriefs.length})`], ["refresh", "Refresh queue & performance"]] as const).map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className="border-b-2 pb-2.5 text-sm font-bold" style={{ borderColor: tab === key ? "var(--app-primary)" : "transparent", color: tab === key ? "var(--app-text)" : "var(--app-text-faint)" }}>
              {label}
            </button>
          ))}
        </div>

        {tab === "opportunities" ? (
          opps.isLoading ? (
            <p className="m-0 p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading…</p>
          ) : (opps.data?.opportunities ?? []).length === 0 ? (
            <p className="m-0 p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>
              No opportunities. <Link href="/marketing/seo-autopilot/keywords" className="font-bold underline">Track keywords</Link> and map them to pages to find gaps.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <label className="flex items-center gap-2 px-4 pt-3 text-xs" style={{ color: "var(--app-text-faint)" }}>
                <input type="checkbox" checked={showDismissed} onChange={(event) => setShowDismissed(event.target.checked)} /> Show dismissed
              </label>
              <table className="w-full min-w-[960px] text-left text-xs">
                <thead style={{ color: "var(--app-text-faint)" }}>
                  <tr>
                    {["Keyword / topic", "Intent", "Opportunity & evidence", "Coverage", "Interest", "Effort", "Format", "Status", ""].map((heading) => (
                      <th key={heading} className="px-4 py-3 font-semibold">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.keywordId}-${row.kind}`} className="border-t align-top" style={{ borderColor: "var(--app-border)", opacity: row.dismissed ? 0.55 : 1 }}>
                      <td className="px-4 py-3 font-semibold">{row.keyword}</td>
                      <td className="px-4 py-3">{row.intent ?? "—"}</td>
                      <td className="max-w-[280px] px-4 py-3">
                        <span className="font-semibold">{KIND_LABEL[row.kind]}</span>
                        <span className="block" style={{ color: "var(--app-text-faint)" }}>{row.evidence}</span>
                        {row.dismissed && <span className="block">Dismissed: {row.dismissed.reason}</span>}
                      </td>
                      <td className="px-4 py-3">{row.coverage === "page" ? "Page exists" : row.coverage === "brief" ? "Brief in progress" : "None"}</td>
                      <td className="px-4 py-3">{row.searchInterest ?? "—"}</td>
                      <td className="px-4 py-3">{row.effort ?? "—"}</td>
                      <td className="px-4 py-3">{FORMAT_LABEL[row.suggestedFormat]}</td>
                      <td className="px-4 py-3">{row.briefStatus ? STATUS_LABEL[row.briefStatus] : "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {row.briefId ? (
                            <button type="button" onClick={() => setOpenId(row.briefId)} className="font-bold underline">Open brief</button>
                          ) : row.dismissed ? (
                            <button type="button" onClick={() => reopen.mutate(row)} className="font-bold underline">Reopen</button>
                          ) : (
                            <>
                              <button type="button" disabled={generate.isPending} onClick={() => generate.mutate({ keywordId: row.keywordId })} className="font-bold underline disabled:opacity-50">
                                {generate.isPending && generate.variables?.keywordId === row.keywordId ? "Generating…" : "Generate brief"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const reason = window.prompt("Why dismiss this opportunity?")?.trim();
                                  if (reason) dismiss.mutate({ row, reason });
                                }}
                                className="font-bold underline"
                                style={{ color: "var(--app-text-faint)" }}
                              >
                                Dismiss
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : tab === "briefs" ? (
          activeBriefs.length === 0 ? (
            <p className="m-0 p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>No briefs yet. Generate one from an opportunity.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {activeBriefs.map((brief) => (
                <li key={brief.id} className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-xs" style={{ borderColor: "var(--app-border)" }}>
                  <button type="button" onClick={() => setOpenId(brief.id)} className="text-left">
                    <span className="block text-sm font-semibold">{brief.topic}</span>
                    <span style={{ color: "var(--app-text-faint)" }}>{FORMAT_LABEL[brief.format]}{brief.keywordText ? ` · ${brief.keywordText}` : ""}{brief.dueAt ? ` · due ${formatDate(brief.dueAt)}` : ""}</span>
                  </button>
                  <span className="font-semibold">{STATUS_LABEL[brief.status]}</span>
                </li>
              ))}
            </ul>
          )
        ) : (refreshQueue.data ?? []).length === 0 ? (
          <p className="m-0 p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>Nothing published through Content SEO yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead style={{ color: "var(--app-text-faint)" }}>
                <tr>
                  {["Content", "Keyword", "Live?", "Rank when published", "Rank now", "Traffic", "Refresh"].map((heading) => <th key={heading} className="px-4 py-3 font-semibold">{heading}</th>)}
                </tr>
              </thead>
              <tbody>
                {(refreshQueue.data ?? []).map((row) => (
                  <tr key={row.briefId} className="border-t align-top" style={{ borderColor: "var(--app-border)" }}>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => setOpenId(row.briefId)} className="font-semibold underline">{row.topic}</button>
                    </td>
                    <td className="px-4 py-3">{row.keyword ?? "—"}</td>
                    <td className="px-4 py-3">{row.liveConfirmedAt ? `Confirmed ${formatDate(row.liveConfirmedAt)}` : "Not yet confirmed"}</td>
                    <td className="px-4 py-3">{row.baselineRank === null ? "Not ranked / not checked" : `#${row.baselineRank}`}</td>
                    <td className="px-4 py-3">{row.rankCheckedAt ? (row.currentRank === null ? "Not in results" : `#${row.currentRank}`) : "—"}</td>
                    <td className="px-4 py-3" style={{ color: "var(--app-text-faintest)" }}>Not tracked</td>
                    <td className="px-4 py-3" style={{ color: row.refreshReason ? "var(--app-warning-text)" : undefined }}>{row.refreshReason ?? "No drop detected"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {openBrief && <BriefEditor key={openBrief.id + openBrief.updatedAt} brief={openBrief} onClose={() => setOpenId(null)} />}
    </main>
  );
}
