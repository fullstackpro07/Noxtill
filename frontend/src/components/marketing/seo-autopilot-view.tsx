"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Clock3,
  FileSearch,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import {
  addKeyword,
  fetchKeywords,
  MAX_TRACKED_KEYWORDS,
  suggestKeywords,
  triggerKeywordCheck,
  type TrackedKeywordRow,
} from "@/lib/keywords-api";
import { ApiError } from "@/lib/api-client";
import {
  fetchSeoAuditChanges,
  fetchSeoAuditIssues,
  fetchSeoAuditSchedule,
  fetchSeoAuditRuns,
  fetchSeoAutopilotOverview,
  ignoreSeoAuditIssue,
  reopenSeoAuditIssue,
  runSeoSiteAudit,
  saveSeoAuditSchedule,
  type SeoAuditIntervalHours,
  type SeoAuditSchedule,
  type SeoAuditChanges,
  type SeoAuditIssueStatus,
  type SeoAuditIssue,
  type SeoAuditRun,
  type SeoAuditTrackedIssue,
} from "@/lib/seo-autopilot-api";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";

function rankMovement(row: TrackedKeywordRow): {
  label: string;
  tone: "good" | "bad" | "muted";
} {
  if (row.latestRank === null || row.previousRank === null)
    return { label: "Not enough history", tone: "muted" };
  if (row.latestRank < row.previousRank)
    return { label: `Up ${row.previousRank - row.latestRank}`, tone: "good" };
  if (row.latestRank > row.previousRank)
    return { label: `Down ${row.latestRank - row.previousRank}`, tone: "bad" };
  return { label: "Unchanged", tone: "muted" };
}

export function SeoAutopilotView() {
  const [keywordDraft, setKeywordDraft] = useState("");
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["keywords"],
    queryFn: fetchKeywords,
    staleTime: 60_000,
  });
  const overviewQuery = useQuery({
    queryKey: ["seo-autopilot-overview"],
    queryFn: fetchSeoAutopilotOverview,
    staleTime: 60_000,
  });
  const auditsQuery = useQuery({
    queryKey: ["seo-audit-runs"],
    queryFn: fetchSeoAuditRuns,
    staleTime: 60_000,
  });
  const auditScheduleQuery = useQuery({
    queryKey: ["seo-audit-schedule"],
    queryFn: fetchSeoAuditSchedule,
  });
  const siteAudit = useMutation({
    mutationFn: runSeoSiteAudit,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["seo-audit-runs"] });
      await queryClient.invalidateQueries({ queryKey: ["seo-audit-issues"] });
      await queryClient.invalidateQueries({
        queryKey: ["seo-autopilot-overview"],
      });
      if (result.status === "completed")
        toast.success(`Audit checked ${result.pagesCrawled} page(s)`);
      else if (result.status === "failed")
        toast.error(result.error ?? "The website audit could not be completed");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn't run the website audit",
      ),
  });
  const check = useMutation({
    mutationFn: triggerKeywordCheck,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["keywords"] });
      await queryClient.invalidateQueries({
        queryKey: ["seo-autopilot-overview"],
      });
    },
  });
  const add = useMutation({
    mutationFn: (keyword: string) => addKeyword(keyword.trim()),
    onSuccess: async (_, addedKeyword) => {
      if (addedKeyword.trim() === keywordDraft.trim()) setKeywordDraft("");
      await queryClient.invalidateQueries({ queryKey: ["keywords"] });
      await queryClient.invalidateQueries({
        queryKey: ["seo-autopilot-overview"],
      });
      toast.success("Keyword added to tracking.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Couldn't add this keyword.",
      ),
  });
  const suggest = useMutation({
    mutationFn: () => suggestKeywords(),
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "Keyword suggestions aren't available right now.",
      ),
  });

  const keywords = query.data ?? [];
  const overview = overviewQuery.data;
  const topTen =
    overview?.topTen ??
    keywords.filter((row) => row.latestRank !== null && row.latestRank <= 10)
      .length;
  const checked =
    overview?.rankedKeywords ??
    keywords.filter((row) => row.latestRank !== null).length;
  const needingRefresh = overview?.needsFreshCheck ?? null;

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 p-5 md:p-6">
      <section
        className="rounded-[14px] p-5"
        style={{
          background: "var(--app-surface)",
          border: "1px solid var(--app-border)",
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Search
                className="h-4 w-4"
                style={{ color: "var(--app-primary)" }}
                aria-hidden
              />
              <h2
                className="text-[17px] font-extrabold"
                style={{ color: "var(--app-text)" }}
              >
                SEO Autopilot
              </h2>
            </div>
            <p
              className="mt-1 max-w-[720px] text-[12px] leading-relaxed"
              style={{ color: "var(--app-text-muted)" }}
            >
              Track provider-reported keyword readings and run an
              evidence-based crawl of your configured website. Search-volume
              and backlink figures are not estimated.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/marketing/seo-autopilot/keywords"
              className="rounded-[9px] px-3 py-2 text-[11.5px] font-bold"
              style={{
                color: "var(--app-primary)",
                background: "var(--app-success-bg)",
              }}
            >
              Keyword intelligence
            </Link>
            <Link
              href="/marketing/seo-autopilot/rank-tracking"
              className="rounded-[9px] px-3 py-2 text-[11.5px] font-bold"
              style={{
                color: "var(--app-primary)",
                background: "var(--app-surface-2)",
                border: "1px solid var(--app-border)",
              }}
            >
              Rank tracking
            </Link>
          </div>
        </div>

        <div
          className="mt-4 rounded-[12px] p-4"
          style={{
            border: "1px solid var(--app-border)",
            background: "var(--app-surface-2)",
          }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <FileSearch
                className="mt-0.5 h-4 w-4 shrink-0"
                style={{ color: "var(--app-primary)" }}
                aria-hidden
              />
              <div>
                <h3
                  className="m-0 text-[13px] font-bold"
                  style={{ color: "var(--app-text)" }}
                >
                  Website audit
                </h3>
                <p
                  className="mb-0 mt-1 max-w-[680px] text-[10.5px] leading-relaxed"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  Uses the website saved in Business Listings and checks up to 8
                  same-site pages. The crawler respects robots.txt, does not run
                  page scripts, and never changes your website.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={siteAudit.isPending || auditsQuery.isPending}
              onClick={() => siteAudit.mutate()}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[9px] px-3 text-[11px] font-bold text-white disabled:opacity-50"
              style={{ background: "var(--app-primary)" }}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${siteAudit.isPending ? "animate-spin" : ""}`}
                aria-hidden
              />
              {siteAudit.isPending ? "Auditing…" : "Run website audit"}
            </button>
          </div>
          {siteAudit.isError && (
            <p
              role="alert"
              className="mb-0 mt-2 text-[10.5px]"
              style={{ color: "var(--app-danger-strong)" }}
            >
              {siteAudit.error instanceof Error
                ? siteAudit.error.message
                : "Couldn't run the website audit."}
              {siteAudit.error instanceof ApiError &&
                (siteAudit.error.code === "SEO_SITE_NOT_CONFIGURED" ||
                  siteAudit.error.code === "SEO_SITE_URL_INVALID") && (
                  <>
                    {" "}
                    <Link
                      href="/listings/profile"
                      className="font-bold"
                      style={{ color: "var(--app-primary)" }}
                    >
                      Check website settings
                    </Link>
                  </>
                )}
            </p>
          )}
          {auditsQuery.isPending ? (
            <p
              className="mb-0 mt-3 text-[10.5px]"
              style={{ color: "var(--app-text-disabled)" }}
            >
              Loading audit history…
            </p>
          ) : auditsQuery.isError ? (
            <p
              className="mb-0 mt-3 text-[10.5px]"
              style={{ color: "var(--app-text-muted)" }}
            >
              Saved audit history is unavailable right now
            </p>
          ) : (
            <AuditResult
              run={siteAudit.data ?? auditsQuery.data?.[0] ?? null}
            />
          )}
          <SeoAuditScheduleEditor
            key={
              auditScheduleQuery.data?.updatedAt ??
              (auditScheduleQuery.isPending ? "loading" : "unconfigured")
            }
            schedule={auditScheduleQuery.data ?? null}
            loading={auditScheduleQuery.isPending}
            failed={auditScheduleQuery.isError}
          />
        </div>

        <SeoAuditIssueQueue />

        <form
          className="mt-4 flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            add.mutate(keywordDraft);
          }}
        >
          <label className="sr-only" htmlFor="seo-keyword-input">
            Keyword to track
          </label>
          <input
            id="seo-keyword-input"
            value={keywordDraft}
            onChange={(event) => setKeywordDraft(event.target.value)}
            maxLength={120}
            placeholder="Add a keyword to track"
            className="h-10 min-w-[220px] flex-1 rounded-[9px] px-3 text-[12px]"
            style={{
              border: "1px solid var(--app-border)",
              background: "var(--app-surface)",
              color: "var(--app-text)",
            }}
          />
          <button
            type="submit"
            disabled={
              query.isPending ||
              add.isPending ||
              !keywordDraft.trim() ||
              (query.data?.length ?? 0) >= MAX_TRACKED_KEYWORDS
            }
            className="inline-flex h-10 items-center gap-1.5 rounded-[9px] px-3.5 text-[11.5px] font-bold text-white disabled:opacity-50"
            style={{ background: "var(--app-primary)" }}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {add.isPending ? "Adding…" : "Track keyword"}
          </button>
          <span
            className="self-center text-[10.5px]"
            style={{ color: "var(--app-text-disabled)" }}
          >
            {query.data?.length ?? 0} / {MAX_TRACKED_KEYWORDS}
          </span>
        </form>
        {add.isError && (
          <p
            role="alert"
            className="mt-2 text-[11px]"
            style={{ color: "var(--app-danger-strong)" }}
          >
            {add.error instanceof Error
              ? add.error.message
              : "Couldn't add this keyword."}
          </p>
        )}
        <div className="mt-3">
          <button
            type="button"
            disabled={
              query.isPending ||
              query.isError ||
              suggest.isPending ||
              (query.data?.length ?? 0) >= MAX_TRACKED_KEYWORDS
            }
            onClick={() => suggest.mutate()}
            className="inline-flex h-9 items-center gap-1.5 rounded-[9px] px-3 text-[11px] font-bold disabled:opacity-50"
            style={{
              border: "1px solid var(--app-border)",
              color: "var(--app-primary)",
              background: "var(--app-surface)",
            }}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {suggest.isPending ? "Thinking…" : "Suggest keywords"}
          </button>
          {suggest.data && (
            <div
              className="mt-3 rounded-[10px] p-3"
              style={{ background: "var(--app-surface-2)" }}
            >
              <p
                className="m-0 text-[10.5px]"
                style={{ color: "var(--app-text-muted)" }}
              >
                AI-generated ideas only — add one to track it. No search volume
                or ranking is implied.
              </p>
              {suggest.data.suggestions.length === 0 ? (
                <p
                  className="mb-0 mt-2 text-[11px]"
                  style={{ color: "var(--app-text-disabled)" }}
                >
                  No suggestions were returned for this business yet.
                </p>
              ) : (
                <ul className="mt-2 flex flex-wrap gap-2 p-0">
                  {suggest.data.suggestions.map((suggestion) => {
                    const isTracked = keywords.some(
                      (row) =>
                        row.keyword.toLocaleLowerCase() ===
                        suggestion.toLocaleLowerCase(),
                    );
                    const isAdding =
                      add.isPending && add.variables === suggestion;
                    return (
                      <li key={suggestion} className="list-none">
                        <button
                          type="button"
                          disabled={
                            isTracked ||
                            isAdding ||
                            add.isPending ||
                            (query.data?.length ?? 0) >= MAX_TRACKED_KEYWORDS
                          }
                          onClick={() => add.mutate(suggestion)}
                          className="rounded-full px-3 py-1.5 text-[10.5px] font-semibold disabled:opacity-50"
                          style={{
                            border: "1px solid var(--app-border)",
                            color: isTracked
                              ? "var(--app-text-disabled)"
                              : "var(--app-primary)",
                            background: "var(--app-surface)",
                          }}
                        >
                          {isAdding
                            ? "Adding…"
                            : isTracked
                              ? `${suggestion} · tracked`
                              : `+ ${suggestion}`}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        {query.isPending ? (
          <div
            className="mt-5 h-24 animate-pulse rounded-[12px]"
            style={{ background: "var(--app-surface-2)" }}
          />
        ) : query.isError ? (
          <div
            className="mt-5 flex items-center justify-between gap-3 rounded-[10px] p-3 text-[12px]"
            style={{
              background: "var(--app-surface-2)",
              color: "var(--app-text-muted)",
            }}
          >
            <span>Saved keyword ranking data is unavailable right now</span>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="font-bold"
              style={{ color: "var(--app-primary)" }}
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {overview && overview.dataStatus !== "available" && (
              <div
                className="mt-4 rounded-[10px] p-3 text-[11.5px]"
                style={{
                  background: "var(--app-warning-bg)",
                  color: "var(--app-warning-text)",
                }}
              >
                {overview.dataStatus === "no_data"
                  ? "No rank readings have been recorded yet."
                  : overview.dataStatus === "stale"
                    ? "Rank data is stale. Run a verified check before treating it as current."
                    : "Some keyword readings are stale or missing. Metrics only include recorded checks."}
              </div>
            )}
            <div
              id="keyword-tracking"
              className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4"
            >
              <Summary
                label="Tracked keywords"
                value={`${overview?.trackedKeywords ?? keywords.length} / ${MAX_TRACKED_KEYWORDS}`}
                detail="Current business tracking limit"
                icon={Search}
              />
              <Summary
                label="Top 10 positions"
                value={String(topTen)}
                detail={`${checked} keyword(s) with a recorded position`}
                icon={Sparkles}
              />
              <Summary
                label="Need a fresh check"
                value={needingRefresh === null ? "—" : String(needingRefresh)}
                detail="Never checked or last checked over 7 days ago"
                icon={Clock3}
                warn={(needingRefresh ?? 0) > 0}
              />
              <Summary
                label="Open website issues"
                value={overview ? String(overview.openAuditIssues) : "—"}
                detail="Saved findings from site audits"
                icon={FileSearch}
                warn={(overview?.openAuditIssues ?? 0) > 0}
              />
            </div>

            {check.isError && (
              <div
                className="mt-3 flex items-start gap-2 rounded-[10px] p-3 text-[11px]"
                style={{
                  background: "var(--app-warning-bg)",
                  color: "var(--app-warning-text)",
                }}
              >
                <AlertTriangle
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  aria-hidden
                />
                <span>
                  {check.error instanceof ApiError &&
                  check.error.code === "SEO_SITE_NOT_CONFIGURED" ? (
                    <>
                      Add your website in Business Listings before checking
                      keyword positions.{" "}
                      <Link
                        href="/listings/profile"
                        className="font-bold"
                        style={{ color: "var(--app-primary)" }}
                      >
                        Open website settings
                      </Link>
                    </>
                  ) : check.error instanceof ApiError &&
                    check.error.code === "SEO_SITE_URL_INVALID" ? (
                    <>
                      The website address in Business Listings needs to be
                      corrected.{" "}
                      <Link
                        href="/listings/profile"
                        className="font-bold"
                        style={{ color: "var(--app-primary)" }}
                      >
                        Check website settings
                      </Link>
                    </>
                  ) : check.error instanceof ApiError &&
                    check.error.code === "SERP_PROVIDER_NOT_CONFIGURED" ? (
                    <>
                      Search ranking provider is not configured for this
                      deployment yet.
                    </>
                  ) : (
                    "Ranking check failed. Check provider configuration and try again."
                  )}
                </span>
              </div>
            )}

            {keywords.length === 0 ? (
              <div
                className="mt-4 rounded-[12px] p-7 text-center"
                style={{ background: "var(--app-surface-2)" }}
              >
                <div
                  className="text-[13px] font-bold"
                  style={{ color: "var(--app-text)" }}
                >
                  No keywords are being tracked yet
                </div>
                <p
                  className="mt-1 text-[11.5px]"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  Add keywords first, then this page will show verified
                  positions and movement.
                </p>
                <Link
                  href="#keyword-tracking"
                  className="mt-3 inline-flex rounded-[9px] px-3 py-2 text-[11px] font-bold text-white"
                  style={{ background: "var(--app-primary)" }}
                >
                  View keyword tracking
                </Link>
              </div>
            ) : (
              <div
                className="mt-4 overflow-x-auto rounded-[12px]"
                style={{ border: "1px solid var(--app-border)" }}
              >
                <table className="w-full min-w-[680px] border-collapse text-left text-[11.5px]">
                  <thead
                    style={{
                      background: "var(--app-surface-2)",
                      color: "var(--app-text-faint)",
                    }}
                  >
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">Keyword</th>
                      <th className="px-3 py-2.5 font-semibold">
                        Latest position
                      </th>
                      <th className="px-3 py-2.5 font-semibold">Movement</th>
                      <th className="px-3 py-2.5 font-semibold">
                        Trend interest
                      </th>
                      <th className="px-3 py-2.5 font-semibold">
                        Last checked
                      </th>
                      <th className="px-3 py-2.5">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {keywords.map((row) => {
                      const movement = rankMovement(row);
                      const isChecking =
                        check.isPending && check.variables === row.id;
                      return (
                        <tr
                          key={row.id}
                          className="border-t"
                          style={{
                            borderColor: "var(--app-border)",
                            color: "var(--app-text)",
                          }}
                        >
                          <td
                            className="max-w-[280px] truncate px-3 py-3 font-semibold"
                            title={row.keyword}
                          >
                            {row.keyword}
                          </td>
                          <td className="px-3 py-3 tabular-nums">
                            {row.latestRank === null
                              ? row.lastCheckedAt
                                ? "Not found in checked results"
                                : "No reading"
                              : `#${row.latestRank}`}
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className="inline-flex items-center gap-1"
                              style={{
                                color:
                                  movement.tone === "good"
                                    ? "var(--app-success-text)"
                                    : movement.tone === "bad"
                                      ? "var(--app-danger-strong)"
                                      : "var(--app-text-faint)",
                              }}
                            >
                              {movement.tone === "good" ? (
                                <ArrowUpRight className="h-3 w-3" aria-hidden />
                              ) : movement.tone === "bad" ? (
                                <ArrowDownRight
                                  className="h-3 w-3"
                                  aria-hidden
                                />
                              ) : null}
                              {movement.label}
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            {row.searchInterest === null
                              ? "Not available"
                              : `${row.searchInterest} / 100`}
                          </td>
                          <td className="px-3 py-3">
                            {row.lastCheckedAt
                              ? formatDate(row.lastCheckedAt)
                              : "Never"}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <button
                              type="button"
                              disabled={check.isPending}
                              onClick={() => check.mutate(row.id)}
                              className="inline-flex items-center gap-1 rounded-[8px] px-2.5 py-1.5 font-bold disabled:opacity-50"
                              style={{
                                color: "var(--app-primary)",
                                background: "var(--app-success-bg)",
                              }}
                            >
                              <RefreshCw
                                className={`h-3 w-3 ${isChecking ? "animate-spin" : ""}`}
                                aria-hidden
                              />
                              {isChecking ? "Checking" : "Check now"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <p
              className="mt-3 text-[10.5px] leading-relaxed"
              style={{ color: "var(--app-text-faint)" }}
            >
              Trend interest is a relative 0–100 Google Trends index, not
              monthly search volume. Position movement compares the two latest
              saved checks. Website audit findings are direct crawl
              observations; backlink data is unavailable until a verified source
              is configured.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

function SeoAuditIssueQueue() {
  const [status, setStatus] = useState<SeoAuditIssueStatus>("open");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["seo-audit-issues", status],
    queryFn: () => fetchSeoAuditIssues(status),
    staleTime: 30_000,
  });
  const refreshIssues = async () => {
    await queryClient.invalidateQueries({ queryKey: ["seo-audit-issues"] });
    await queryClient.invalidateQueries({
      queryKey: ["seo-autopilot-overview"],
    });
  };
  const ignore = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      ignoreSeoAuditIssue(id, reason),
    onSuccess: async (_, variables) => {
      setReasons((current) => ({ ...current, [variables.id]: "" }));
      await refreshIssues();
      toast.success("Issue ignored with your reason saved.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Couldn't ignore this issue.",
      ),
  });
  const reopen = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      reopenSeoAuditIssue(id, reason),
    onSuccess: async (_, variables) => {
      setReasons((current) => ({ ...current, [variables.id]: "" }));
      await refreshIssues();
      toast.success("Issue reopened.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Couldn't reopen this issue.",
      ),
  });

  return (
    <section
      className="mt-4 rounded-[12px] p-4"
      style={{
        border: "1px solid var(--app-border)",
        background: "var(--app-surface-2)",
      }}
      aria-labelledby="seo-issue-queue-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3
            id="seo-issue-queue-title"
            className="m-0 text-[13px] font-bold"
            style={{ color: "var(--app-text)" }}
          >
            Issue lifecycle
          </h3>
          <p
            className="mb-0 mt-1 text-[10.5px]"
            style={{ color: "var(--app-text-muted)" }}
          >
            Findings are grouped by page and type. Issues resolve only after a
            successful recrawl of that page.
          </p>
        </div>
        <div className="flex gap-1.5" aria-label="Issue status filter">
          {(["open", "resolved", "ignored"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={status === option}
              onClick={() => setStatus(option)}
              className="rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize"
              style={{
                border: "1px solid var(--app-border)",
                background:
                  status === option
                    ? "var(--app-success-bg)"
                    : "var(--app-surface)",
                color:
                  status === option
                    ? "var(--app-primary)"
                    : "var(--app-text-muted)",
              }}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {query.isPending ? (
        <p
          className="mb-0 mt-3 text-[10.5px]"
          style={{ color: "var(--app-text-disabled)" }}
        >
          Loading issue history…
        </p>
      ) : query.isError ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10.5px]">
          <span style={{ color: "var(--app-text-muted)" }}>
            Issue history is unavailable right now.
          </span>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="font-bold"
            style={{ color: "var(--app-primary)" }}
          >
            Retry
          </button>
        </div>
      ) : (query.data?.length ?? 0) === 0 ? (
        <p
          className="mb-0 mt-3 text-[10.5px]"
          style={{ color: "var(--app-text-disabled)" }}
        >
          No {status} issues recorded.
        </p>
      ) : (
        <ul className="mt-3 space-y-2 p-0">
          {query.data?.map((issue) => (
            <SeoAuditIssueRow
              key={issue.id}
              issue={issue}
              reason={reasons[issue.id] ?? ""}
              onReasonChange={(value) =>
                setReasons((current) => ({ ...current, [issue.id]: value }))
              }
              busy={
                (ignore.isPending && ignore.variables?.id === issue.id) ||
                (reopen.isPending && reopen.variables?.id === issue.id)
              }
              onIgnore={() =>
                ignore.mutate({ id: issue.id, reason: reasons[issue.id] ?? "" })
              }
              onReopen={() =>
                reopen.mutate({ id: issue.id, reason: reasons[issue.id] ?? "" })
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function SeoAuditIssueRow({
  issue,
  reason,
  onReasonChange,
  busy,
  onIgnore,
  onReopen,
}: {
  issue: SeoAuditTrackedIssue;
  reason: string;
  onReasonChange: (value: string) => void;
  busy: boolean;
  onIgnore: () => void;
  onReopen: () => void;
}) {
  const isOpen = issue.status === "open";
  const canDecide = reason.trim().length >= 3;
  const eventLabel = (action: string) => action.replaceAll("_", " ");

  return (
    <li
      className="list-none rounded-[10px] p-3"
      style={{
        border: "1px solid var(--app-border)",
        background: "var(--app-surface)",
      }}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px]">
        <span
          className="font-bold"
          style={{
            color:
              issue.severity === "critical" || issue.severity === "high"
                ? "var(--app-danger-strong)"
                : issue.severity === "medium"
                  ? "var(--app-warning-text)"
                  : "var(--app-text-muted)",
          }}
        >
          {issue.severity.toUpperCase()}
        </span>
        <span
          className="font-semibold capitalize"
          style={{ color: "var(--app-text)" }}
        >
          {issue.type.replaceAll("_", " ")}
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[9px] capitalize"
          style={{
            background:
              issue.status === "open"
                ? "var(--app-warning-bg)"
                : "var(--app-surface-2)",
            color:
              issue.status === "open"
                ? "var(--app-warning-text)"
                : "var(--app-text-muted)",
          }}
        >
          {issue.status}
        </span>
        <span
          className="text-[9.5px]"
          style={{ color: "var(--app-text-disabled)" }}
        >
          Seen {formatDate(issue.lastSeenAt)}
        </span>
      </div>
      <p
        className="mb-0 mt-1 break-all text-[10px]"
        style={{ color: "var(--app-text-disabled)" }}
      >
        {issue.pageUrl}
      </p>
      <p
        className="mb-0 mt-1 text-[10.5px]"
        style={{ color: "var(--app-text-muted)" }}
      >
        {issue.evidence} {issue.recommendation}
      </p>
      {issue.ignoreReason && (
        <p
          className="mb-0 mt-1 text-[10px]"
          style={{ color: "var(--app-text-muted)" }}
        >
          Ignore reason: {issue.ignoreReason}
        </p>
      )}

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
        <label className="sr-only" htmlFor={`seo-issue-reason-${issue.id}`}>
          {isOpen
            ? "Reason for ignoring this issue"
            : "Reason for reopening this issue"}
        </label>
        <input
          id={`seo-issue-reason-${issue.id}`}
          value={reason}
          onChange={(event) => onReasonChange(event.target.value)}
          maxLength={1000}
          minLength={3}
          placeholder={
            isOpen ? "Reason is required to ignore" : "Reason for reopening"
          }
          className="h-8 min-w-0 rounded-[8px] px-2.5 text-[10.5px]"
          style={{
            border: "1px solid var(--app-border)",
            background: "var(--app-surface)",
            color: "var(--app-text)",
          }}
        />
        <button
          type="button"
          disabled={!canDecide || busy}
          onClick={isOpen ? onIgnore : onReopen}
          className="h-8 rounded-[8px] px-3 text-[10px] font-bold disabled:opacity-50"
          style={{
            background: isOpen
              ? "var(--app-warning-bg)"
              : "var(--app-success-bg)",
            color: isOpen ? "var(--app-warning-text)" : "var(--app-primary)",
          }}
        >
          {busy ? "Saving…" : isOpen ? "Ignore issue" : "Reopen issue"}
        </button>
      </div>

      {issue.auditEvents.length > 0 && (
        <details className="mt-2">
          <summary
            className="cursor-pointer text-[9.5px] font-semibold"
            style={{ color: "var(--app-primary)" }}
          >
            History · {issue.auditEvents.length} recent event(s)
          </summary>
          <ul className="mt-1 space-y-1 pl-4">
            {issue.auditEvents.slice(0, 4).map((event) => (
              <li
                key={event.id}
                className="text-[9.5px]"
                style={{ color: "var(--app-text-muted)" }}
              >
                {eventLabel(event.action)} · {formatDate(event.createdAt)}
                {event.reason ? ` · ${event.reason}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

function SeoAuditScheduleEditor({
  schedule,
  loading,
  failed,
}: {
  schedule: SeoAuditSchedule | null;
  loading: boolean;
  failed: boolean;
}) {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(schedule?.enabled ?? false);
  const [intervalHours, setIntervalHours] = useState<SeoAuditIntervalHours>(
    schedule?.intervalHours ?? 168,
  );
  const save = useMutation({
    mutationFn: () => saveSeoAuditSchedule({ enabled, intervalHours }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["seo-audit-schedule"],
      });
      toast.success("Scheduled audit settings saved.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn't save the audit schedule.",
      ),
  });

  return (
    <div
      className="mt-4 rounded-[10px] p-3"
      style={{
        border: "1px solid var(--app-border)",
        background: "var(--app-surface)",
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <label
          className="flex items-center gap-2 text-[11px] font-bold"
          style={{ color: "var(--app-text)" }}
        >
          <input
            type="checkbox"
            checked={enabled}
            disabled={loading || failed}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          Schedule recurring audit
        </label>
        <label
          className="flex items-center gap-2 text-[10.5px]"
          style={{ color: "var(--app-text-muted)" }}
        >
          Every
          <select
            value={intervalHours}
            disabled={loading || failed}
            onChange={(event) =>
              setIntervalHours(
                Number(event.target.value) as SeoAuditIntervalHours,
              )
            }
            className="h-8 rounded-[7px] px-2"
            style={{
              border: "1px solid var(--app-border)",
              background: "var(--app-surface-2)",
              color: "var(--app-text)",
            }}
          >
            <option value={24}>day</option>
            <option value={168}>week</option>
            <option value={720}>30 days</option>
          </select>
        </label>
        <button
          type="button"
          disabled={loading || failed || save.isPending}
          onClick={() => save.mutate()}
          className="ms-auto inline-flex h-8 items-center rounded-[8px] px-3 text-[10.5px] font-bold text-white disabled:opacity-50"
          style={{ background: "var(--app-primary)" }}
        >
          {save.isPending ? "Saving…" : "Save schedule"}
        </button>
      </div>
      <p
        className="mb-0 mt-2 text-[10px]"
        style={{ color: "var(--app-text-disabled)" }}
      >
        First scheduled crawl runs after the selected interval. It checks your
        configured website and does not change pages.
        {schedule?.nextRunAt
          ? ` Next run ${formatDate(schedule.nextRunAt)}.`
          : " No run is currently scheduled."}
        {schedule?.lastRunAt
          ? ` Last run ${formatDate(schedule.lastRunAt)} (${schedule.lastStatus ?? "status unavailable"}).`
          : " No scheduled run has completed yet."}
      </p>
      {failed && (
        <p
          role="alert"
          className="mb-0 mt-2 text-[10px]"
          style={{ color: "var(--app-danger-strong)" }}
        >
          Saved schedule settings are unavailable.
        </p>
      )}
      {schedule?.lastError && (
        <p
          role="status"
          className="mb-0 mt-1 text-[10px]"
          style={{ color: "var(--app-warning-text)" }}
        >
          {schedule.lastError}
        </p>
      )}
    </div>
  );
}

function AuditResult({ run }: { run: SeoAuditRun | null }) {
  const auditId = run?.id;
  const changesQuery = useQuery({
    queryKey: ["seo-audit-changes", auditId],
    queryFn: () => {
      if (!auditId) throw new Error("Audit id is required");
      return fetchSeoAuditChanges(auditId);
    },
    enabled:
      auditId !== undefined &&
      (run?.status === "completed" || run?.status === "partial"),
    staleTime: 60_000,
  });

  if (!run) {
    return (
      <p
        className="mb-0 mt-3 text-[10.5px]"
        style={{ color: "var(--app-text-disabled)" }}
      >
        No website audit has been run yet
      </p>
    );
  }

  const severityRank: Record<SeoAuditIssue["severity"], number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  const topIssues = [...(run.issues ?? [])]
    .sort(
      (left, right) =>
        severityRank[left.severity] - severityRank[right.severity],
    )
    .slice(0, 4);
  const statusLabel =
    run.status === "completed"
      ? "Completed"
      : run.status === "partial"
        ? "Partial"
        : run.status === "running"
          ? "Running"
          : "Failed";

  return (
    <div
      className="mt-3 rounded-[10px] p-3"
      style={{ background: "var(--app-surface)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className="flex items-center gap-2 text-[10.5px] font-bold"
          style={{
            color:
              run.status === "failed"
                ? "var(--app-danger-strong)"
                : "var(--app-text)",
          }}
        >
          <span>{statusLabel}</span>
          <span
            className="rounded-full px-2 py-0.5 text-[9px] font-normal"
            style={{
              background: "var(--app-surface-2)",
              color: "var(--app-text-muted)",
            }}
          >
            {run.triggeredBy === "schedule" ? "Scheduled" : "Manual"}
          </span>
          <span
            className="font-normal"
            style={{ color: "var(--app-text-disabled)" }}
          >
            {new Date(run.startedAt).toLocaleString()}
          </span>
        </div>
        <span
          className="text-[10px]"
          style={{ color: "var(--app-text-muted)" }}
        >
          {run.pagesCrawled} page(s) checked · {run.issuesFound} finding(s)
        </span>
      </div>
      {run.error && (
        <p
          className="mb-0 mt-2 text-[10.5px]"
          style={{ color: "var(--app-danger-strong)" }}
        >
          {run.error}
        </p>
      )}
      {changesQuery.data && <AuditChangeSummary changes={changesQuery.data} />}
      {changesQuery.isError && (
        <p
          className="mb-0 mt-2 text-[10px]"
          style={{ color: "var(--app-text-disabled)" }}
        >
          Audit change comparison is unavailable right now.
        </p>
      )}
      {run.warnings?.map((warning) => (
        <p
          key={warning}
          className="mb-0 mt-2 text-[10px]"
          style={{ color: "var(--app-warning-text)" }}
        >
          {warning}
        </p>
      ))}
      {topIssues.length > 0 && (
        <ul className="mt-2 space-y-2 p-0">
          {topIssues.map((issue, index) => (
            <li
              key={`${issue.type}-${issue.url}-${index}`}
              className="list-none border-t pt-2"
              style={{ borderColor: "var(--app-border)" }}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px]">
                <span
                  className="font-bold"
                  style={{
                    color:
                      issue.severity === "critical" || issue.severity === "high"
                        ? "var(--app-danger-strong)"
                        : issue.severity === "medium"
                          ? "var(--app-warning-text)"
                          : "var(--app-text-muted)",
                  }}
                >
                  {issue.severity.toUpperCase()}
                </span>
                <span
                  className="font-semibold"
                  style={{ color: "var(--app-text)" }}
                >
                  {issue.type.replaceAll("_", " ")}
                </span>
                <span
                  className="min-w-0 truncate"
                  style={{ color: "var(--app-text-disabled)" }}
                >
                  {issue.url}
                </span>
              </div>
              <p
                className="mb-0 mt-1 text-[10px]"
                style={{ color: "var(--app-text-muted)" }}
              >
                {issue.evidence} {issue.recommendation}
              </p>
            </li>
          ))}
        </ul>
      )}
      {run.status === "completed" && topIssues.length === 0 && (
        <p
          className="mb-0 mt-2 text-[10.5px]"
          style={{ color: "var(--app-success-text)" }}
        >
          No findings from the checks this audit performed
        </p>
      )}
    </div>
  );
}

function AuditChangeSummary({ changes }: { changes: SeoAuditChanges }) {
  const text =
    changes.status === "compared"
      ? `Compared ${changes.comparedPageCount} page(s) with the previous audit: ${changes.newIssues.length} newly observed finding(s) and ${changes.resolvedIssues.length} no longer found.`
      : (changes.reason ?? "Audit findings could not be compared.");

  return (
    <p
      className="mb-0 mt-2 text-[10px]"
      style={{ color: "var(--app-text-muted)" }}
    >
      {text} Changes are reported only for pages checked in both audits.
    </p>
  );
}

function Summary({
  label,
  value,
  detail,
  icon: Icon,
  warn = false,
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  warn?: boolean;
}) {
  return (
    <div
      className="rounded-[11px] p-3"
      style={{ background: "var(--app-surface-2)" }}
    >
      <div
        className="flex items-center gap-1.5 text-[10.5px] font-semibold"
        style={{ color: "var(--app-text-faint)" }}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {label}
      </div>
      <div
        className="mt-2 text-[19px] font-extrabold tabular-nums"
        style={{ color: warn ? "var(--app-warning-text)" : "var(--app-text)" }}
      >
        {value}
      </div>
      <div
        className="mt-1 text-[10px]"
        style={{ color: "var(--app-text-disabled)" }}
      >
        {detail}
      </div>
    </div>
  );
}
