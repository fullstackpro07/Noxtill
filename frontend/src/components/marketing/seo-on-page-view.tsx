"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import { askConfirm, askText } from "@/lib/ask-dialog";
import {
  createSeoRevision,
  editSeoRevision,
  fetchOnPagePages,
  fetchOnPageSummary,
  fetchSeoRevisions,
  restoreSeoRevision,
  suggestSeoRevision,
  transitionSeoRevision,
  verifySeoRevisions,
  type OnPageRow,
  type SeoRevision,
  type SeoRevisionStatus,
} from "@/lib/seo-on-page-api";

const STATUS_LABEL: Record<SeoRevisionStatus, string> = {
  draft: "Draft",
  approval_required: "Awaiting approval",
  approved: "Approved — apply on your site",
  rejected: "Rejected",
  applied: "Applied — waiting for audit",
  verified: "Verified live",
  superseded: "Superseded",
};
const ISSUE_LABEL: Record<string, string> = {
  missing_title: "No title",
  missing_meta_description: "No meta description",
  duplicate_title: "Duplicate title",
  missing_h1: "No H1",
  multiple_h1: "Several H1s",
  images_missing_alt: "Images without alt text",
};
const QUERY_KEYS = [["seo-on-page-summary"], ["seo-on-page-pages"], ["seo-revisions"]];

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

function pathOf(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return url;
  }
}

function DiffRow({ label, before, after, limit }: { label: string; before: string | null | undefined; after: string | null; limit: number }) {
  if (!after) return null;
  const changed = (before ?? "") !== after;
  return (
    <div className="grid gap-1 text-xs md:grid-cols-[110px_1fr_1fr]">
      <span className="font-semibold" style={{ color: "var(--app-text-faint)" }}>{label}</span>
      <span style={{ color: "var(--app-text-faint)", textDecoration: changed && before ? "line-through" : undefined }}>
        {before === undefined ? "Not recorded by that audit" : before || "(none)"}
      </span>
      <span style={{ color: changed ? "var(--app-success-text)" : "var(--app-text)" }}>
        {after} <span style={{ color: after.length > limit ? "var(--app-warning-text)" : "var(--app-text-faintest)" }}>({after.length}/{limit})</span>
      </span>
    </div>
  );
}

function RevisionCard({ revision, onChanged }: { revision: SeoRevision; onChanged: () => Promise<unknown> }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(revision.proposedTitle ?? "");
  const [description, setDescription] = useState(revision.proposedMetaDescription ?? "");
  const [h1, setH1] = useState(revision.proposedH1 ?? "");
  const act = useMutation({
    mutationFn: async (action: { kind: "status"; status: "approval_required" | "approved" | "rejected" | "applied"; note?: string } | { kind: "restore" } | { kind: "save" }) => {
      if (action.kind === "restore") return restoreSeoRevision(revision.id);
      if (action.kind === "save") return editSeoRevision(revision.id, { proposedTitle: title, proposedMetaDescription: description, proposedH1: h1 });
      return transitionSeoRevision(revision.id, action.status, action.note);
    },
    onSuccess: async () => {
      setEditing(false);
      await onChanged();
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't update the revision.")),
  });
  const before = revision.beforeSnapshot;
  return (
    <article className="rounded-xl border p-3" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-bold">
          Version {revision.version} · {STATUS_LABEL[revision.status]}
          <span className="font-normal" style={{ color: "var(--app-text-faint)" }}> · {revision.source === "ai" ? "AI draft" : revision.source === "restore" ? "restored" : "written by your team"} · {formatDate(revision.createdAt)}</span>
        </span>
      </div>
      {editing ? (
        <div className="mt-2 flex flex-col gap-2">
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={300} placeholder="Title" className={fieldClass} style={fieldStyle} />
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} rows={2} placeholder="Meta description" className={fieldClass} style={fieldStyle} />
          <input value={h1} onChange={(event) => setH1(event.target.value)} maxLength={300} placeholder="H1" className={fieldClass} style={fieldStyle} />
        </div>
      ) : (
        <div className="mt-2 flex flex-col gap-1.5">
          <div className="hidden gap-1 text-[10px] font-bold uppercase md:grid md:grid-cols-[110px_1fr_1fr]" style={{ color: "var(--app-text-faintest)" }}>
            <span />
            <span>Live when proposed</span>
            <span>Proposed</span>
          </div>
          <DiffRow label="Title" before={before.title} after={revision.proposedTitle} limit={60} />
          <DiffRow label="Meta description" before={before.description} after={revision.proposedMetaDescription} limit={155} />
          <DiffRow label="H1" before={before.h1} after={revision.proposedH1} limit={70} />
        </div>
      )}
      {revision.rationale && <p className="m-0 mt-2 text-xs" style={{ color: "var(--app-text-muted)" }}>Why: {revision.rationale}</p>}
      {revision.decisionNote && <p className="m-0 mt-1 text-xs" style={{ color: "var(--app-text-muted)" }}>Decision note: {revision.decisionNote}</p>}
      {revision.verification && revision.status !== "verified" && (
        <p className="m-0 mt-1 text-xs" style={{ color: "var(--app-warning-text)" }}>
          Last audit ({formatDate(revision.verification.checkedAt)}):{" "}
          {revision.verification.pageFound
            ? Object.entries(revision.verification.fields).map(([field, result]) => `${field} ${result.replace("_", " ")}`).join(", ")
            : "page not found in the crawl"}
        </p>
      )}
      {revision.verifiedAt && <p className="m-0 mt-1 text-xs font-semibold" style={{ color: "var(--app-success-text)" }}>Seen live by the site audit on {formatDate(revision.verifiedAt)}.</p>}

      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        {revision.status === "draft" && !editing && (
          <>
            <button type="button" onClick={() => setEditing(true)} className="font-bold underline">Edit</button>
            <button type="button" disabled={act.isPending} onClick={() => act.mutate({ kind: "status", status: "approval_required" })} className="font-bold underline">Submit for approval</button>
          </>
        )}
        {editing && (
          <>
            <button type="button" disabled={act.isPending} onClick={() => act.mutate({ kind: "save" })} className="font-bold underline">Save draft</button>
            <button type="button" onClick={() => setEditing(false)} className="font-bold underline" style={{ color: "var(--app-text-faint)" }}>Cancel</button>
          </>
        )}
        {revision.status === "approval_required" && (
          <>
            <button type="button" disabled={act.isPending} onClick={() => act.mutate({ kind: "status", status: "approved" })} className="font-bold underline">Approve</button>
            <button
              type="button"
              disabled={act.isPending}
              onClick={async () => {
                const note = await askText({ title: "Why reject this revision?", tone: "danger", confirmLabel: "Reject" });
                if (note) act.mutate({ kind: "status", status: "rejected", note });
              }}
              className="font-bold underline"
              style={{ color: "var(--app-text-faint)" }}
            >
              Reject
            </button>
          </>
        )}
        {revision.status === "approved" && (
          <button
            type="button"
            disabled={act.isPending}
            onClick={async () => {
              if (await askConfirm({ title: "Mark as applied?", description: "Only do this after you've changed the page on your website — the next site audit checks it.", confirmLabel: "Mark applied" })) {
                act.mutate({ kind: "status", status: "applied" });
              }
            }}
            className="font-bold underline"
          >
            I&rsquo;ve applied it on my site
          </button>
        )}
        {(revision.status === "superseded" || revision.status === "rejected" || revision.status === "verified") && (
          <button type="button" disabled={act.isPending} onClick={() => act.mutate({ kind: "restore" })} className="font-bold underline">Restore as new draft</button>
        )}
      </div>
    </article>
  );
}

function PageDrawer({ page, onClose }: { page: OnPageRow; onClose: () => void }) {
  const refresh = useRefresh();
  const revisions = useQuery({ queryKey: ["seo-revisions", page.url], queryFn: () => fetchSeoRevisions(page.url) });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [h1, setH1] = useState("");
  const [rationale, setRationale] = useState("");
  const create = useMutation({
    mutationFn: () => createSeoRevision(page.url, { proposedTitle: title, proposedMetaDescription: description, proposedH1: h1, rationale, primaryKeyword: page.primaryKeyword ?? undefined }),
    onSuccess: async () => {
      setTitle("");
      setDescription("");
      setH1("");
      setRationale("");
      await refresh();
      toast.success("Draft revision saved.");
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't save the revision.")),
  });
  const suggest = useMutation({
    mutationFn: () => suggestSeoRevision(page.url),
    onSuccess: async () => {
      await refresh();
      toast.success("AI draft added — review and edit it before submitting.");
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't create an AI draft.")),
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside role="dialog" aria-modal="true" aria-label={`On-page SEO for ${pathOf(page.url)}`} className="flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l p-5" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)", color: "var(--app-text)" }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="m-0 truncate text-base font-bold">{pathOf(page.url)}</h2>
            <a href={page.url} target="_blank" rel="noreferrer" className="text-xs underline" style={{ color: "var(--app-text-faint)" }}>{page.url}</a>
          </div>
          <button type="button" onClick={onClose} className="text-sm font-semibold" style={{ color: "var(--app-text-faint)" }}>Close</button>
        </div>

        <section className="mt-4 rounded-xl border p-3 text-xs" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
          <p className="m-0 font-bold">Live page (from the latest site audit)</p>
          <p className="m-0 mt-1"><span style={{ color: "var(--app-text-faint)" }}>Title:</span> {page.title ?? "(none)"}</p>
          <p className="m-0 mt-1"><span style={{ color: "var(--app-text-faint)" }}>Meta description:</span> {page.description ?? "(none)"}</p>
          <p className="m-0 mt-1"><span style={{ color: "var(--app-text-faint)" }}>H1:</span> {page.h1 ?? (page.h1Count ? `${page.h1Count} found — text not recorded by this audit` : "(none)")}</p>
          <p className="m-0 mt-1"><span style={{ color: "var(--app-text-faint)" }}>Primary keyword:</span> {page.primaryKeyword ?? <Link href="/marketing/seo-autopilot/keywords" className="underline">Not mapped — set a target page in Keywords</Link>}</p>
          {page.issues.length > 0 && <p className="m-0 mt-1" style={{ color: "var(--app-warning-text)" }}>Open issues: {page.issues.map((issue) => ISSUE_LABEL[issue] ?? issue).join(", ")}</p>}
        </section>

        <section className="mt-4 rounded-xl border p-3" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="m-0 text-sm font-bold">Propose a change</p>
            <button type="button" disabled={suggest.isPending} onClick={() => suggest.mutate()} className="text-xs font-bold underline disabled:opacity-50">
              {suggest.isPending ? "Drafting…" : "Draft with AI"}
            </button>
          </div>
          <p className="m-0 mt-1 text-xs" style={{ color: "var(--app-text-faintest)" }}>AI drafts use only this page&rsquo;s crawled text and your keyword, and are never applied without your approval.</p>
          <form
            className="mt-2 flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={300} placeholder="New title (aim for ≤ 60 characters)" className={fieldClass} style={fieldStyle} />
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} rows={2} placeholder="New meta description (aim for ≤ 155 characters)" className={fieldClass} style={fieldStyle} />
            <input value={h1} onChange={(event) => setH1(event.target.value)} maxLength={300} placeholder="New H1" className={fieldClass} style={fieldStyle} />
            <input value={rationale} onChange={(event) => setRationale(event.target.value)} maxLength={2000} placeholder="Why (optional)" className={fieldClass} style={fieldStyle} />
            <div className="flex justify-end">
              <button type="submit" disabled={create.isPending || (!title.trim() && !description.trim() && !h1.trim())} className="rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>
                {create.isPending ? "Saving…" : "Save draft"}
              </button>
            </div>
          </form>
        </section>

        <section className="mt-4 flex flex-col gap-2">
          <p className="m-0 text-sm font-bold">Revision history</p>
          {revisions.isLoading ? (
            <p className="m-0 text-xs" style={{ color: "var(--app-text-faint)" }}>Loading…</p>
          ) : (revisions.data ?? []).length === 0 ? (
            <p className="m-0 text-xs" style={{ color: "var(--app-text-faint)" }}>No revisions for this page yet.</p>
          ) : (
            (revisions.data ?? []).map((revision) => <RevisionCard key={revision.id} revision={revision} onChanged={refresh} />)
          )}
        </section>
      </aside>
    </div>
  );
}

export function SeoOnPageView() {
  const refresh = useRefresh();
  const summary = useQuery({ queryKey: ["seo-on-page-summary"], queryFn: fetchOnPageSummary });
  const pagesQuery = useQuery({ queryKey: ["seo-on-page-pages"], queryFn: fetchOnPagePages });
  const [filter, setFilter] = useState<"needs_work" | "all">("needs_work");
  const [search, setSearch] = useState("");
  const [openUrl, setOpenUrl] = useState<string | null>(null);
  const verify = useMutation({
    mutationFn: verifySeoRevisions,
    onSuccess: async (result) => {
      await refresh();
      toast.success(result.checked === 0 ? "Nothing to check yet — run a new site audit after applying changes." : `${result.verified} of ${result.checked} applied revision(s) confirmed live.`);
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't check revisions.")),
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (pagesQuery.data?.pages ?? []).filter(
      (page) => (filter === "all" || page.health === "needs_work") && (!term || page.url.toLowerCase().includes(term) || (page.title ?? "").toLowerCase().includes(term)),
    );
  }, [pagesQuery.data, filter, search]);
  const openPage = (pagesQuery.data?.pages ?? []).find((page) => page.url === openUrl) ?? null;
  const data = summary.data;
  const loading = summary.isLoading;

  return (
    <main className="flex flex-col gap-5 p-5 md:p-7" style={{ color: "var(--app-text)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="m-0 max-w-3xl text-xs" style={{ color: "var(--app-text-muted)" }}>
          Pages come from your latest website audit{data?.crawl?.finishedAt ? ` (${data.crawl.siteUrl}, ${formatDate(data.crawl.finishedAt)})` : ""}. Noxtill doesn&rsquo;t host or publish your website, so
          approved changes are applied by you on your site; a revision is marked <strong>verified</strong> only when a later audit sees the new values live. Organic clicks and impressions are{" "}
          <strong>not tracked</strong> (no Search Console connection).
        </p>
        <button type="button" disabled={verify.isPending} onClick={() => verify.mutate()} className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-50" style={{ borderColor: "var(--app-border)" }}>
          {verify.isPending ? "Checking…" : "Check applied changes"}
        </button>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Pages needing work" value={loading ? "…" : data?.pagesNeedingWork ?? "—"} hint={data ? `of ${data.pagesCrawled} crawled pages` : "From the latest audit"} tone={data?.pagesNeedingWork ? "warning" : undefined} />
        <Kpi label="Metadata issues" value={loading ? "…" : data?.metadataIssues ?? "—"} hint="Open title / description issues" />
        <Kpi label="Content gaps" value={loading ? "…" : data?.contentGaps ?? "—"} hint="Tracked keywords with no target page" />
        <Kpi label="Internal link opportunities" value="Not tracked" hint="The audit doesn't store the link graph yet" />
        <Kpi label="Approved revisions" value={loading ? "…" : data?.approvedRevisions ?? "—"} hint="Ready to apply on your site" />
        <Kpi label="Awaiting verification" value={loading ? "…" : data?.awaitingVerification ?? "—"} hint="Applied, not yet seen live" />
      </section>

      <section className="rounded-2xl border" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 pt-3" style={{ borderColor: "var(--app-border)" }}>
          <div role="tablist" className="flex gap-4">
            {([["needs_work", "Needs work"], ["all", "All pages"]] as const).map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={filter === key} onClick={() => setFilter(key)} className="border-b-2 pb-2.5 text-sm font-bold" style={{ borderColor: filter === key ? "var(--app-primary)" : "transparent", color: filter === key ? "var(--app-text)" : "var(--app-text-faint)" }}>
                {label}
              </button>
            ))}
          </div>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search pages" aria-label="Search pages" className="mb-2 w-full max-w-xs rounded-lg border px-3 py-1.5 text-sm" style={fieldStyle} />
        </div>
        {pagesQuery.isLoading ? (
          <p className="m-0 p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading pages…</p>
        ) : pagesQuery.isError ? (
          <div className="flex items-center gap-3 p-6 text-sm" style={{ color: "var(--app-danger-strong)" }}>
            {errorMessage(pagesQuery.error, "Couldn't load pages.")}
            <button type="button" onClick={() => pagesQuery.refetch()} className="font-bold underline">Retry</button>
          </div>
        ) : !pagesQuery.data?.crawl ? (
          <p className="m-0 p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>
            No website audit yet. <Link href="/marketing/seo-autopilot" className="font-bold underline">Run a site audit</Link> to see your pages here.
          </p>
        ) : rows.length === 0 ? (
          <p className="m-0 p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>{filter === "needs_work" ? "No crawled page has an open on-page issue." : "No pages match."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-xs">
              <thead style={{ color: "var(--app-text-faint)", background: "var(--app-surface-2)" }}>
                <tr>
                  {["Page", "Primary keyword", "SEO health", "Organic performance", "Issues", "Last optimized", "Status", ""].map((heading) => (
                    <th key={heading} className="px-4 py-3 font-semibold">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((page) => (
                  <tr key={page.url} className="cursor-pointer border-t align-top" style={{ borderColor: "var(--app-border)" }} onClick={() => setOpenUrl(page.url)}>
                    <td className="max-w-[260px] px-4 py-3">
                      <p className="m-0 truncate font-semibold">{pathOf(page.url)}</p>
                      <p className="m-0 truncate" style={{ color: "var(--app-text-faint)" }}>{page.title ?? "(no title)"}</p>
                    </td>
                    <td className="px-4 py-3">{page.primaryKeyword ?? <span style={{ color: "var(--app-text-faintest)" }}>Not mapped</span>}</td>
                    <td className="px-4 py-3 font-semibold" style={{ color: page.health === "ok" ? "var(--app-success-text)" : "var(--app-warning-text)" }}>{page.health === "ok" ? "No open issues" : "Needs work"}</td>
                    <td className="px-4 py-3" style={{ color: "var(--app-text-faintest)" }}>Not tracked</td>
                    <td className="px-4 py-3">{page.issues.length === 0 ? "—" : page.issues.map((issue) => ISSUE_LABEL[issue] ?? issue).join(", ")}</td>
                    <td className="px-4 py-3">{page.lastOptimizedAt ? formatDate(page.lastOptimizedAt) : "—"}</td>
                    <td className="px-4 py-3">{page.revision ? `v${page.revision.version} · ${STATUS_LABEL[page.revision.status]}` : "—"}</td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={(event) => { event.stopPropagation(); setOpenUrl(page.url); }} className="font-bold underline">Optimize page</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {openPage && <PageDrawer page={openPage} onClose={() => setOpenUrl(null)} />}
    </main>
  );
}
