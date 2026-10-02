"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import {
  createTechnicalAction,
  fetchTechnicalActions,
  fetchTechnicalOverview,
  transitionTechnicalAction,
  validateTechnicalAction,
  verifyTechnicalActions,
  type TechnicalAction,
  type TechnicalActionInput,
  type TechnicalActionStatus,
  type TechnicalActionType,
  type TechnicalValidation,
} from "@/lib/seo-technical-api";

const GROUP_LABEL: Record<string, string> = {
  indexability: "Indexability",
  broken_links: "Broken links",
  canonicals: "Canonicals",
  sitemaps: "Sitemaps",
  security: "HTTPS & mixed content",
  performance: "Page size",
  other: "Other",
};
const TYPE_LABEL: Record<TechnicalActionType, string> = {
  redirect: "Redirect",
  canonical: "Canonical",
  indexability: "Index / noindex",
  sitemap: "Sitemap inclusion",
  robots: "robots.txt rule",
  other: "Other",
};
const STATUS_LABEL: Record<TechnicalActionStatus, string> = {
  draft: "Draft",
  approval_required: "Awaiting approval",
  approved: "Approved — apply on your site",
  rejected: "Rejected",
  applied: "Applied — waiting for audit",
  verified: "Verified by audit",
  cancelled: "Cancelled",
};
const TARGET_HINT: Partial<Record<TechnicalActionType, string>> = {
  redirect: "Destination URL (https://…)",
  canonical: "Canonical URL (https://…)",
};
const QUERY_KEYS = [["seo-technical-overview"], ["seo-technical-actions"]];

const fieldClass = "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--app-primary)]";
const fieldStyle = { borderColor: "var(--app-border)", background: "var(--app-surface)" };

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function useRefresh() {
  const client = useQueryClient();
  return () => Promise.all(QUERY_KEYS.map((queryKey) => client.invalidateQueries({ queryKey })));
}

function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint: string; tone?: "warning" | "danger" }) {
  const color = tone === "danger" ? "var(--app-danger-strong)" : tone === "warning" ? "var(--app-warning-text)" : "var(--app-text)";
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
      <p className="m-0 text-xs font-semibold" style={{ color: "var(--app-text-faint)" }}>{label}</p>
      <p className="m-0 mt-1 text-2xl font-bold" style={{ color }}>{value}</p>
      <p className="m-0 mt-1 text-xs" style={{ color: "var(--app-text-faintest)" }}>{hint}</p>
    </div>
  );
}

function ValidationNotes({ validation }: { validation: TechnicalValidation | null }) {
  if (!validation) return null;
  return (
    <>
      {validation.problems.map((problem) => (
        <p key={problem} className="m-0 mt-1 text-xs font-semibold" style={{ color: "var(--app-danger-strong)" }}>Blocks approval: {problem}</p>
      ))}
      {validation.warnings.map((warning) => (
        <p key={warning} className="m-0 mt-1 text-xs" style={{ color: "var(--app-warning-text)" }}>Check: {warning}</p>
      ))}
    </>
  );
}

function ProposeForm({ initial, onDone }: { initial?: Partial<TechnicalActionInput>; onDone: () => void }) {
  const refresh = useRefresh();
  const [type, setType] = useState<TechnicalActionType>(initial?.type ?? "redirect");
  const [sourceUrl, setSourceUrl] = useState(initial?.sourceUrl ?? "");
  const [target, setTarget] = useState(initial?.targetValue ?? "");
  const [description, setDescription] = useState("");
  const [preview, setPreview] = useState<TechnicalValidation | null>(null);
  const input = (): TechnicalActionInput => ({ type, sourceUrl: sourceUrl.trim(), targetValue: target.trim() || undefined, description: description.trim() || undefined, issueId: initial?.issueId });
  const check = useMutation({
    mutationFn: () => validateTechnicalAction(input()),
    onSuccess: setPreview,
    onError: (error) => toast.error(errorMessage(error, "Couldn't check the change.")),
  });
  const create = useMutation({
    mutationFn: () => createTechnicalAction(input()),
    onSuccess: async () => {
      await refresh();
      toast.success("Change saved as a draft.");
      onDone();
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't save the change.")),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-xl border p-3" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
      <div className="grid gap-2 md:grid-cols-[180px_1fr]">
        <select value={type} onChange={(event) => { setType(event.target.value as TechnicalActionType); setTarget(""); setPreview(null); }} className={fieldClass} style={fieldStyle} aria-label="Change type">
          {Object.entries(TYPE_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <input required value={sourceUrl} onChange={(event) => { setSourceUrl(event.target.value); setPreview(null); }} placeholder="Affected URL (https://…)" className={fieldClass} style={fieldStyle} aria-label="Affected URL" />
      </div>
      {(type === "redirect" || type === "canonical") && (
        <input value={target} onChange={(event) => { setTarget(event.target.value); setPreview(null); }} placeholder={TARGET_HINT[type]} className={fieldClass} style={fieldStyle} aria-label="Destination URL" />
      )}
      {type === "indexability" && (
        <select value={target} onChange={(event) => { setTarget(event.target.value); setPreview(null); }} className={fieldClass} style={fieldStyle} aria-label="Index setting">
          <option value="">Choose…</option>
          <option value="index">Allow indexing (remove noindex)</option>
          <option value="noindex">Add noindex (remove from search)</option>
        </select>
      )}
      {type === "sitemap" && (
        <select value={target} onChange={(event) => { setTarget(event.target.value); setPreview(null); }} className={fieldClass} style={fieldStyle} aria-label="Sitemap setting">
          <option value="">Choose…</option>
          <option value="include">Include in sitemap</option>
          <option value="exclude">Exclude from sitemap</option>
        </select>
      )}
      <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} placeholder={type === "robots" || type === "other" ? "Exact change (required), e.g. Disallow: /cart" : "Notes (optional)"} className={fieldClass} style={fieldStyle} aria-label="Description" />
      <ValidationNotes validation={preview} />
      {preview?.ok && preview.warnings.length === 0 && <p className="m-0 text-xs font-semibold" style={{ color: "var(--app-success-text)" }}>No problems found against the latest audit.</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" disabled={check.isPending || !sourceUrl.trim()} onClick={() => check.mutate()} className="rounded-lg border px-3 py-2 text-sm font-bold disabled:opacity-50" style={{ borderColor: "var(--app-border)" }}>
          {check.isPending ? "Checking…" : "Validate"}
        </button>
        <button type="submit" disabled={create.isPending} className="rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>
          {create.isPending ? "Saving…" : "Save draft"}
        </button>
      </div>
    </form>
  );
}

function ActionCard({ action }: { action: TechnicalAction }) {
  const refresh = useRefresh();
  const move = useMutation({
    mutationFn: ({ status, note }: { status: "approval_required" | "approved" | "rejected" | "applied" | "cancelled"; note?: string }) => transitionTechnicalAction(action.id, status, note),
    onSuccess: refresh,
    onError: async (error) => {
      toast.error(errorMessage(error, "Couldn't update the change."));
      await refresh();
    },
  });
  const riskColor = action.risk === "high" ? "var(--app-danger-strong)" : action.risk === "medium" ? "var(--app-warning-text)" : "var(--app-text-faint)";
  const open = action.status === "draft" || action.status === "approval_required" || action.status === "approved";
  return (
    <article className="rounded-xl border p-3 text-xs" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold">
          {TYPE_LABEL[action.type]} · <span style={{ color: riskColor }}>{action.risk} risk</span>
        </span>
        <span className="font-semibold" style={{ color: action.status === "verified" ? "var(--app-success-text)" : undefined }}>{STATUS_LABEL[action.status]}</span>
      </div>
      <p className="m-0 mt-1 break-all">
        {action.sourceUrl}
        {action.targetValue && <> → <strong>{action.targetValue}</strong></>}
      </p>
      {action.description && <p className="m-0 mt-1" style={{ color: "var(--app-text-muted)" }}>{action.description}</p>}
      <p className="m-0 mt-1" style={{ color: "var(--app-text-faintest)" }}>
        When proposed:{" "}
        {action.currentState.crawled
          ? `HTTP ${action.currentState.statusCode}${action.currentState.finalUrl && action.currentState.finalUrl !== action.sourceUrl ? ` → ${action.currentState.finalUrl}` : ""}${action.currentState.noindex ? " · noindex" : ""}${action.currentState.canonicalUrl ? ` · canonical ${action.currentState.canonicalUrl}` : ""}`
          : "not in the latest audit"}
      </p>
      {open && <ValidationNotes validation={action.validation} />}
      {action.decisionNote && <p className="m-0 mt-1">Decision note: {action.decisionNote}</p>}
      {action.verification && action.status === "applied" && (
        <p className="m-0 mt-1" style={{ color: "var(--app-warning-text)" }}>
          Audit {formatDate(action.verification.checkedAt)}:{" "}
          {action.verification.result === "not_verifiable"
            ? "this kind of change can't be checked by the site audit — confirm it on your server."
            : action.verification.result === "page_not_crawled"
              ? "the page wasn't in that audit."
              : `not live yet (saw ${String(action.verification.observed ?? "nothing")}).`}
        </p>
      )}
      {action.verifiedAt && <p className="m-0 mt-1 font-semibold" style={{ color: "var(--app-success-text)" }}>Confirmed by the site audit on {formatDate(action.verifiedAt)}.</p>}
      <div className="mt-2 flex flex-wrap gap-3">
        {action.status === "draft" && <button type="button" disabled={move.isPending} onClick={() => move.mutate({ status: "approval_required" })} className="font-bold underline">Submit for approval</button>}
        {action.status === "approval_required" && (
          <>
            <button
              type="button"
              disabled={move.isPending}
              onClick={() => {
                if (action.risk !== "high" || window.confirm("This is a high-risk change that can remove pages from search or block crawling. Approve it?")) move.mutate({ status: "approved" });
              }}
              className="font-bold underline"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={move.isPending}
              onClick={() => {
                const note = window.prompt("Why reject this change?")?.trim();
                if (note) move.mutate({ status: "rejected", note });
              }}
              className="font-bold underline"
              style={{ color: "var(--app-text-faint)" }}
            >
              Reject
            </button>
          </>
        )}
        {action.status === "approved" && (
          <button
            type="button"
            disabled={move.isPending}
            onClick={() => window.confirm("Mark as applied? Only after you've made the change on your website or server — the next site audit checks it.") && move.mutate({ status: "applied" })}
            className="font-bold underline"
          >
            I&rsquo;ve applied it
          </button>
        )}
        {open && <button type="button" disabled={move.isPending} onClick={() => move.mutate({ status: "cancelled" })} className="font-bold underline" style={{ color: "var(--app-text-faint)" }}>Cancel</button>}
      </div>
    </article>
  );
}

type Tab = "issues" | "redirects" | "canonicals" | "changes" | "not_tracked";

export function SeoTechnicalView() {
  const refresh = useRefresh();
  const overview = useQuery({ queryKey: ["seo-technical-overview"], queryFn: fetchTechnicalOverview });
  const actions = useQuery({ queryKey: ["seo-technical-actions"], queryFn: fetchTechnicalActions });
  const [tab, setTab] = useState<Tab>("issues");
  const [group, setGroup] = useState<string>("all");
  const [proposing, setProposing] = useState<Partial<TechnicalActionInput> | null>(null);
  const verify = useMutation({
    mutationFn: verifyTechnicalActions,
    onSuccess: async (result) => {
      await refresh();
      toast.success(result.checked === 0 ? "Nothing to check yet — run a new site audit after applying changes." : `${result.verified} of ${result.checked} applied change(s) confirmed.`);
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't check changes.")),
  });
  const data = overview.data;
  const kpis = data?.kpis;
  const loading = overview.isLoading;
  const issues = (data?.issues ?? []).filter((issue) => group === "all" || issue.group === group);
  const groups = [...new Set((data?.issues ?? []).map((issue) => issue.group))];
  const openChanges = (actions.data ?? []).filter((action) => ["draft", "approval_required", "approved", "applied"].includes(action.status)).length;

  const tabs: [Tab, string][] = [
    ["issues", `Issues (${data?.issues.length ?? 0})`],
    ["redirects", `Redirects (${data?.redirects.length ?? 0})`],
    ["canonicals", `Canonicals (${data?.canonicals.length ?? 0})`],
    ["changes", `Changes (${openChanges} open)`],
    ["not_tracked", "Not tracked"],
  ];

  return (
    <main className="flex flex-col gap-5 p-5 md:p-7" style={{ color: "var(--app-text)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="m-0 max-w-3xl text-xs" style={{ color: "var(--app-text-muted)" }}>
          Findings come from your latest website audit{data?.crawl?.finishedAt ? ` (${data.crawl.siteUrl}, ${formatDate(data.crawl.finishedAt)})` : ""}. Noxtill doesn&rsquo;t control your server or domain, so
          approved changes are made by you; a change is <strong>verified</strong> only when a later audit sees it. Search engines decide indexing — nothing here guarantees it.
        </p>
        <div className="flex gap-2">
          <button type="button" disabled={verify.isPending} onClick={() => verify.mutate()} className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-50" style={{ borderColor: "var(--app-border)" }}>
            {verify.isPending ? "Checking…" : "Check applied changes"}
          </button>
          <button type="button" onClick={() => { setTab("changes"); setProposing({}); }} className="rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: "var(--app-primary)" }}>
            Propose a change
          </button>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Critical technical issues" value={loading ? "…" : kpis?.criticalIssues ?? "—"} hint="High severity, open" tone={kpis?.criticalIssues ? "danger" : undefined} />
        <Kpi label="Indexable pages" value={loading ? "…" : kpis?.indexablePages ?? "—"} hint={kpis ? `of ${kpis.pagesCrawled} crawled URLs` : "From the latest audit"} />
        <Kpi
          label="Sitemap coverage"
          value={loading ? "…" : kpis?.sitemapCoverage ? `${Math.round((kpis.sitemapCoverage.inSitemap / kpis.sitemapCoverage.of) * 100)}%` : "Unknown"}
          hint={kpis?.sitemapCoverage ? `${kpis.sitemapCoverage.inSitemap} of ${kpis.sitemapCoverage.of} indexable pages listed` : "No readable sitemap in the latest audit"}
        />
        <Kpi label="Broken links" value={loading ? "…" : kpis?.brokenLinks ?? "—"} hint="Open broken-link / error findings" tone={kpis?.brokenLinks ? "warning" : undefined} />
        <Kpi label="Canonical conflicts" value={loading ? "…" : kpis?.canonicalConflicts ?? "—"} hint="Pages whose canonical points elsewhere" />
        <Kpi label="Schema errors" value="Not tracked" hint="The audit doesn't read structured data" />
      </section>

      <section className="rounded-2xl border" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
        <div role="tablist" className="flex flex-wrap gap-4 border-b px-4 pt-3" style={{ borderColor: "var(--app-border)" }}>
          {tabs.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className="border-b-2 pb-2.5 text-sm font-bold" style={{ borderColor: tab === key ? "var(--app-primary)" : "transparent", color: tab === key ? "var(--app-text)" : "var(--app-text-faint)" }}>
              {label}
            </button>
          ))}
        </div>
        <div className="p-4">
          {overview.isLoading ? (
            <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading…</p>
          ) : overview.isError ? (
            <div className="flex items-center gap-3 text-sm" style={{ color: "var(--app-danger-strong)" }}>
              {errorMessage(overview.error, "Couldn't load technical SEO.")}
              <button type="button" onClick={() => overview.refetch()} className="font-bold underline">Retry</button>
            </div>
          ) : !data?.crawl ? (
            <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>
              No website audit yet. <Link href="/marketing/seo-autopilot" className="font-bold underline">Run a site audit</Link> first.
            </p>
          ) : tab === "issues" ? (
            <div className="flex flex-col gap-3">
              {groups.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {["all", ...groups].map((key) => (
                    <button key={key} type="button" onClick={() => setGroup(key)} className="rounded-full border px-3 py-1 text-xs font-semibold" style={{ borderColor: group === key ? "var(--app-primary)" : "var(--app-border)" }}>
                      {key === "all" ? "All" : GROUP_LABEL[key] ?? key}
                    </button>
                  ))}
                </div>
              )}
              {issues.length === 0 ? (
                <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>No open technical issues in the latest audit.</p>
              ) : (
                issues.map((issue) => (
                  <article key={issue.id} className="rounded-xl border p-3 text-xs" style={{ borderColor: "var(--app-border)" }}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold">{GROUP_LABEL[issue.group] ?? issue.group} · {issue.type.replaceAll("_", " ")}</span>
                      <span className="font-semibold" style={{ color: issue.severity === "high" ? "var(--app-danger-strong)" : "var(--app-text-faint)" }}>{issue.severity}</span>
                    </div>
                    <p className="m-0 mt-1 break-all">{issue.pageUrl}</p>
                    <p className="m-0 mt-1" style={{ color: "var(--app-text-muted)" }}>{issue.evidence}</p>
                    <p className="m-0 mt-1" style={{ color: "var(--app-text-faint)" }}>What to do: {issue.recommendation}</p>
                    <button type="button" onClick={() => { setTab("changes"); setProposing({ type: issue.group === "indexability" ? "indexability" : issue.group === "canonicals" ? "canonical" : issue.group === "sitemaps" ? "sitemap" : "redirect", sourceUrl: issue.pageUrl, issueId: issue.id }); }} className="mt-2 font-bold underline">
                      Propose a fix
                    </button>
                  </article>
                ))
              )}
            </div>
          ) : tab === "redirects" ? (
            data.redirects.length === 0 ? (
              <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>No crawled URL redirected in the latest audit.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0 text-xs">
                {data.redirects.map((row) => <li key={row.url} className="break-all">{row.url} → <strong>{row.finalUrl}</strong></li>)}
              </ul>
            )
          ) : tab === "canonicals" ? (
            data.canonicals.length === 0 ? (
              <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>No crawled page points its canonical at a different URL.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0 text-xs">
                {data.canonicals.map((row) => <li key={row.url} className="break-all">{row.url} → canonical <strong>{row.canonicalUrl}</strong></li>)}
              </ul>
            )
          ) : tab === "changes" ? (
            <div className="flex flex-col gap-3">
              {proposing ? (
                <ProposeForm key={JSON.stringify(proposing)} initial={proposing} onDone={() => setProposing(null)} />
              ) : (
                <button type="button" onClick={() => setProposing({})} className="self-start text-xs font-bold underline">+ Propose a change</button>
              )}
              {actions.isLoading ? (
                <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading changes…</p>
              ) : (actions.data ?? []).length === 0 ? (
                <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>No technical changes proposed yet.</p>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">{(actions.data ?? []).map((action) => <ActionCard key={action.id} action={action} />)}</div>
              )}
            </div>
          ) : (
            <ul className="m-0 flex list-disc flex-col gap-1 ps-5 text-xs" style={{ color: "var(--app-text-muted)" }}>
              <li><strong>Structured data (schema):</strong> not tracked — the site audit doesn&rsquo;t read JSON-LD or microdata.</li>
              <li><strong>Core Web Vitals:</strong> not tracked — no PageSpeed / Chrome UX Report connection.</li>
              <li><strong>Hreflang, mobile rendering:</strong> not tracked — the audit fetches HTML without rendering or reading alternate-language links.</li>
              <li><strong>Re-index requests:</strong> not available — no Search Console connection.</li>
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
