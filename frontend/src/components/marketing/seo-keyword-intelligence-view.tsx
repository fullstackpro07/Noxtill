"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Link2,
  Plus,
  Search,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import {
  addKeyword,
  fetchKeywords,
  KEYWORD_INTENTS,
  MAX_TRACKED_KEYWORDS,
  removeKeyword,
  suggestKeywords,
  updateTrackedKeyword,
  type KeywordIntent,
  type TrackedKeywordRow,
} from "@/lib/keywords-api";
import { formatDate } from "@/lib/format";

const INTENT_LABELS: Record<KeywordIntent, string> = {
  informational: "Informational",
  navigational: "Navigational",
  commercial: "Commercial",
  transactional: "Transactional",
  local: "Local",
};
const EMPTY_KEYWORDS: TrackedKeywordRow[] = [];

export function SeoKeywordIntelligenceView() {
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState("");
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["keywords"],
    queryFn: fetchKeywords,
    staleTime: 30_000,
  });
  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ["keywords"] });
    await client.invalidateQueries({ queryKey: ["seo-autopilot-overview"] });
  };
  const add = useMutation({
    mutationFn: (keyword: string) => addKeyword(keyword.trim()),
    onSuccess: async () => {
      setDraft("");
      await refresh();
      toast.success("Keyword added to your portfolio.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Couldn't add the keyword.",
      ),
  });
  const save = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: { intent?: KeywordIntent | null; targetPageUrl?: string | null };
    }) => updateTrackedKeyword(id, patch),
    onSuccess: async () => {
      await refresh();
      toast.success("Keyword settings saved.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Couldn't save this keyword.",
      ),
  });
  const remove = useMutation({
    mutationFn: removeKeyword,
    onSuccess: refresh,
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn't remove this keyword.",
      ),
  });
  const suggest = useMutation({
    mutationFn: () => suggestKeywords(),
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "Suggestions aren't available right now.",
      ),
  });

  const keywords = query.data ?? EMPTY_KEYWORDS;
  const filtered = useMemo(() => {
    const needle = filter.trim().toLocaleLowerCase();
    return needle
      ? keywords.filter((row) =>
          `${row.keyword} ${row.targetPageUrl ?? ""} ${row.intent ?? ""}`
            .toLocaleLowerCase()
            .includes(needle),
        )
      : keywords;
  }, [filter, keywords]);
  const mapped = keywords.filter((row) => Boolean(row.targetPageUrl)).length;
  const unmapped = keywords.length - mapped;
  const overlap = keywords.filter((row) => row.mappingOverlap).length;
  const cannibalized = keywords.filter(
    (row) => row.cannibalizationFlag === true,
  ).length;
  const checkedForOverlap = keywords.filter(
    (row) => row.cannibalizationFlag !== null,
  ).length;
  const uncheckedForOverlap = keywords.length - checkedForOverlap;
  const missingIntent = keywords.filter((row) => !row.intent).length;
  const topTen = keywords.filter(
    (row) => row.latestRank !== null && row.latestRank <= 10,
  ).length;
  const declining = keywords.filter(
    (row) =>
      row.latestRank !== null &&
      row.previousRank !== null &&
      row.latestRank > row.previousRank,
  ).length;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const keyword = draft.trim();
    if (keyword) add.mutate(keyword);
  }

  return (
    <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 p-5 md:p-6">
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
              <Target
                className="h-4 w-4"
                style={{ color: "var(--app-primary)" }}
                aria-hidden
              />
              <h1
                className="m-0 text-[18px] font-extrabold"
                style={{ color: "var(--app-text)" }}
              >
                Keyword Intelligence
              </h1>
            </div>
            <p
              className="mb-0 mt-1 max-w-[760px] text-[12px] leading-relaxed"
              style={{ color: "var(--app-text-muted)" }}
            >
              Organize the search terms you actually track, assign intent and
              map each term to a page on your site.
            </p>
          </div>
          <Link
            href="/marketing/seo-autopilot/rank-tracking"
            className="rounded-[9px] px-3 py-2 text-[11.5px] font-bold"
            style={{
              color: "var(--app-primary)",
              background: "var(--app-success-bg)",
            }}
          >
            Open rank tracking
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-3 xl:grid-cols-6">
          <Metric
            label="Tracked portfolio"
            value={`${keywords.length} / ${MAX_TRACKED_KEYWORDS}`}
            detail="Current tracker limit"
            icon={Search}
          />
          <Metric
            label="Unmapped"
            value={String(unmapped)}
            detail="Keywords without a target page"
            icon={Link2}
          />
          <Metric
            label="Intent not set"
            value={String(missingIntent)}
            detail="Owner-defined classification"
            icon={Target}
          />
          <Metric
            label="Top 10 positions"
            value={String(topTen)}
            detail="From latest saved rank checks"
            icon={ArrowUpRight}
          />
          <Metric
            label="Declining"
            value={String(declining)}
            detail="Latest position is lower than prior check"
            icon={ArrowDownRight}
          />
          <Metric
            label="Multi-URL SERPs"
            value={checkedForOverlap === 0 ? "—" : String(cannibalized)}
            detail={
              checkedForOverlap === 0
                ? "No provider snapshots yet"
                : `${checkedForOverlap} checked · ${uncheckedForOverlap} unchecked`
            }
            icon={AlertTriangle}
          />
        </div>

        <div
          className="mt-4 rounded-[11px] p-3"
          style={{
            border: "1px solid var(--app-border)",
            background: "var(--app-surface-2)",
          }}
        >
          <form onSubmit={submit} className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="keyword-intelligence-add">
              Keyword to track
            </label>
            <input
              id="keyword-intelligence-add"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={120}
              minLength={2}
              required
              placeholder="Add a search term"
              className="h-9 min-w-[220px] flex-1 rounded-[8px] px-3 text-[11.5px]"
              style={{
                border: "1px solid var(--app-border)",
                background: "var(--app-surface)",
                color: "var(--app-text)",
              }}
            />
            <button
              type="submit"
              disabled={
                add.isPending || keywords.length >= MAX_TRACKED_KEYWORDS
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-[8px] px-3 text-[11px] font-bold text-white disabled:opacity-50"
              style={{ background: "var(--app-primary)" }}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              {add.isPending ? "Adding…" : "Add keyword"}
            </button>
            <button
              type="button"
              disabled={
                suggest.isPending || keywords.length >= MAX_TRACKED_KEYWORDS
              }
              onClick={() => suggest.mutate()}
              className="inline-flex h-9 items-center gap-1.5 rounded-[8px] px-3 text-[11px] font-bold disabled:opacity-50"
              style={{
                border: "1px solid var(--app-border)",
                color: "var(--app-primary)",
                background: "var(--app-surface)",
              }}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              {suggest.isPending ? "Thinking…" : "Suggest ideas"}
            </button>
            <span
              className="self-center text-[10.5px]"
              style={{ color: "var(--app-text-disabled)" }}
            >
              {keywords.length} / {MAX_TRACKED_KEYWORDS}
            </span>
          </form>
          {add.isError && (
            <p
              role="alert"
              className="mb-0 mt-2 text-[11px]"
              style={{ color: "var(--app-danger-strong)" }}
            >
              {add.error instanceof Error
                ? add.error.message
                : "Couldn't add the keyword."}
            </p>
          )}
          {suggest.data && (
            <div
              className="mt-3 flex flex-wrap gap-2"
              aria-label="Keyword suggestions"
            >
              {suggest.data.suggestions.length === 0 ? (
                <span
                  className="text-[10.5px]"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  No suggestions were returned.
                </span>
              ) : (
                suggest.data.suggestions.map((idea) => {
                  const alreadyTracked = keywords.some(
                    (row) =>
                      row.keyword.toLocaleLowerCase() ===
                      idea.toLocaleLowerCase(),
                  );
                  return (
                    <button
                      key={idea}
                      type="button"
                      disabled={
                        alreadyTracked ||
                        keywords.length >= MAX_TRACKED_KEYWORDS ||
                        add.isPending
                      }
                      onClick={() => add.mutate(idea)}
                      className="rounded-full px-3 py-1.5 text-[10px] font-semibold disabled:opacity-50"
                      style={{
                        border: "1px solid var(--app-border)",
                        color: "var(--app-primary)",
                        background: "var(--app-surface)",
                      }}
                    >
                      {alreadyTracked ? `${idea} · tracked` : `+ ${idea}`}
                    </button>
                  );
                })
              )}
              <p
                className="mb-0 w-full text-[10px]"
                style={{ color: "var(--app-text-faint)" }}
              >
                AI suggestions are ideas only and do not imply search volume or
                rank.
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2
              className="m-0 text-[13px] font-bold"
              style={{ color: "var(--app-text)" }}
            >
              Keyword portfolio
            </h2>
            <p
              className="mb-0 mt-1 text-[10.5px]"
              style={{ color: "var(--app-text-muted)" }}
            >
              Intent is set by your team. Search interest is a relative Google
              Trends index, not monthly volume.
            </p>
          </div>
          <label className="relative">
            <span className="sr-only">Search keywords</span>
            <Search
              className="absolute left-2.5 top-2.5 h-3.5 w-3.5"
              style={{ color: "var(--app-text-disabled)" }}
              aria-hidden
            />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter portfolio"
              className="h-9 w-[220px] rounded-[8px] pl-8 pr-3 text-[10.5px]"
              style={{
                border: "1px solid var(--app-border)",
                background: "var(--app-surface)",
                color: "var(--app-text)",
              }}
            />
          </label>
        </div>

        {(overlap > 0 || cannibalized > 0) && (
          <div
            className="mt-3 flex items-start gap-2 rounded-[9px] p-3 text-[10.5px]"
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
              {cannibalized > 0 && (
                <>
                  The latest provider check returned multiple distinct pages
                  from your domain for {cannibalized} tracked keyword(s). Review
                  those as potential SERP overlap; it is a provider snapshot,
                  not a Search Console report.{" "}
                </>
              )}
              {overlap > 0 && (
                <>
                  {overlap} keyword(s) also share an assigned target URL with
                  another tracked term. That mapping overlap is a separate
                  review hint, not proof of cannibalization.
                </>
              )}
            </span>
          </div>
        )}

        {query.isPending ? (
          <div
            className="mt-4 h-36 animate-pulse rounded-[10px]"
            style={{ background: "var(--app-surface-2)" }}
          />
        ) : query.isError ? (
          <div
            className="mt-4 flex items-center justify-between rounded-[10px] p-4 text-[11px]"
            style={{
              background: "var(--app-surface-2)",
              color: "var(--app-text-muted)",
            }}
          >
            <span>Keyword portfolio is unavailable.</span>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="font-bold"
              style={{ color: "var(--app-primary)" }}
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div
            className="mt-4 rounded-[10px] p-8 text-center"
            style={{ background: "var(--app-surface-2)" }}
          >
            <p
              className="m-0 text-[12px] font-bold"
              style={{ color: "var(--app-text)" }}
            >
              {keywords.length
                ? "No matching keywords"
                : "Your keyword portfolio is empty"}
            </p>
            <p
              className="mb-0 mt-1 text-[10.5px]"
              style={{ color: "var(--app-text-muted)" }}
            >
              {keywords.length
                ? "Try a different filter."
                : "Add the search terms you want to monitor."}
            </p>
          </div>
        ) : (
          <div
            className="mt-3 overflow-x-auto rounded-[10px]"
            style={{ border: "1px solid var(--app-border)" }}
          >
            <table className="w-full min-w-[880px] border-collapse text-left text-[10.5px]">
              <thead
                style={{
                  background: "var(--app-surface-2)",
                  color: "var(--app-text-faint)",
                }}
              >
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Keyword</th>
                  <th className="px-3 py-2.5 font-semibold">Intent</th>
                  <th className="px-3 py-2.5 font-semibold">Target page</th>
                  <th className="px-3 py-2.5 font-semibold">Latest position</th>
                  <th className="px-3 py-2.5 font-semibold">Trend interest</th>
                  <th className="px-3 py-2.5 font-semibold">
                    SERP / mapping flags
                  </th>
                  <th className="px-2 py-2.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <KeywordRow
                    key={`${row.id}:${row.intent ?? ""}:${row.targetPageUrl ?? ""}`}
                    row={row}
                    saving={save.isPending && save.variables?.id === row.id}
                    removing={remove.isPending && remove.variables === row.id}
                    onSave={(patch) => save.mutate({ id: row.id, patch })}
                    onRemove={() => {
                      if (
                        window.confirm(
                          `Remove “${row.keyword}” and its saved rank history?`,
                        )
                      ) {
                        remove.mutate(row.id);
                      }
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div
          className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px]"
          style={{ color: "var(--app-text-faint)" }}
        >
          <span>
            {mapped} mapped · {missingIntent} without intent · {overlap}{" "}
            shared-page mappings · {cannibalized} multi-URL SERPs ·{" "}
            {uncheckedForOverlap} without SERP evidence
          </span>
          <span>
            Last check times come from saved rank snapshots
            {keywords.some((row) => row.lastCheckedAt)
              ? ` · latest ${formatDate(keywords.reduce<string | null>((latest, row) => (row.lastCheckedAt && (!latest || row.lastCheckedAt > latest) ? row.lastCheckedAt : latest), null)!)}`
              : " · none recorded"}
          </span>
        </div>
        <p
          className="mb-0 mt-2 text-[10px] leading-relaxed"
          style={{ color: "var(--app-text-faint)" }}
        >
          Search volume and competition scores are not available from the saved
          keyword data. Rank and multi-page signals come from saved Google
          organic-result checks; they are not Search Console data. Checks use
          the provider&apos;s default Google market because market, device and
          location preferences are not stored yet.
        </p>
      </section>
    </main>
  );
}

function KeywordRow({
  row,
  saving,
  removing,
  onSave,
  onRemove,
}: {
  row: TrackedKeywordRow;
  saving: boolean;
  removing: boolean;
  onSave: (patch: {
    intent?: KeywordIntent | null;
    targetPageUrl?: string | null;
  }) => void;
  onRemove: () => void;
}) {
  const [intent, setIntent] = useState<KeywordIntent | "">(row.intent ?? "");
  const [targetUrl, setTargetUrl] = useState(row.targetPageUrl ?? "");
  const dirty =
    intent !== (row.intent ?? "") || targetUrl !== (row.targetPageUrl ?? "");
  return (
    <tr
      className="border-t"
      style={{ borderColor: "var(--app-border)", color: "var(--app-text)" }}
    >
      <td className="max-w-[220px] px-3 py-3 font-semibold" title={row.keyword}>
        {row.keyword}
        <div
          className="mt-1 text-[9.5px] font-normal"
          style={{ color: "var(--app-text-faint)" }}
        >
          {row.lastCheckedAt
            ? `Checked ${formatDate(row.lastCheckedAt)}`
            : "Not checked yet"}
        </div>
      </td>
      <td className="px-3 py-2">
        <label>
          <span className="sr-only">Intent for {row.keyword}</span>
          <select
            value={intent}
            onChange={(event) =>
              setIntent(event.target.value as KeywordIntent | "")
            }
            className="h-8 rounded-[7px] px-2"
            style={{
              border: "1px solid var(--app-border)",
              background: "var(--app-surface)",
              color: intent ? "var(--app-text)" : "var(--app-text-disabled)",
            }}
          >
            <option value="">Not set</option>
            {KEYWORD_INTENTS.map((option) => (
              <option key={option} value={option}>
                {INTENT_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
      </td>
      <td className="min-w-[260px] px-3 py-2">
        <label>
          <span className="sr-only">Target page URL for {row.keyword}</span>
          <input
            type="url"
            value={targetUrl}
            onChange={(event) => setTargetUrl(event.target.value)}
            placeholder="https://your-site.com/page"
            maxLength={2048}
            className="h-8 w-full rounded-[7px] px-2"
            style={{
              border: "1px solid var(--app-border)",
              background: "var(--app-surface)",
              color: "var(--app-text)",
            }}
          />
        </label>
      </td>
      <td className="px-3 py-3 tabular-nums">
        {row.latestRank === null
          ? row.lastCheckedAt
            ? "Not found"
            : "No reading"
          : `#${row.latestRank}`}
      </td>
      <td className="px-3 py-3">
        {row.searchInterest === null
          ? "Not available"
          : `${row.searchInterest} / 100`}
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-col items-start gap-1">
          {row.cannibalizationFlag && (
            <span
              title={row.businessResultUrls.join("\n")}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-semibold"
              style={{
                background: "var(--app-warning-bg)",
                color: "var(--app-warning-text)",
              }}
            >
              <AlertTriangle className="h-3 w-3" aria-hidden />
              Potential SERP overlap · {row.businessResultUrls.length} pages
            </span>
          )}
          {row.mappingOverlap && (
            <span
              title="Multiple tracked keywords are assigned to this URL"
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-semibold"
              style={{
                background: "var(--app-warning-bg)",
                color: "var(--app-warning-text)",
              }}
            >
              <Link2 className="h-3 w-3" aria-hidden />
              Shared target · {row.mappedKeywordCount}
            </span>
          )}
          {row.cannibalizationFlag === false && (
            <span
              className="text-[10px]"
              style={{ color: "var(--app-text-muted)" }}
            >
              No multi-page SERP signal
            </span>
          )}
          {row.cannibalizationFlag === null && (
            <span style={{ color: "var(--app-text-disabled)" }}>
              SERP not checked
            </span>
          )}
          {!row.mappingOverlap && row.targetPageUrl && (
            <span
              className="text-[10px]"
              style={{ color: "var(--app-text-muted)" }}
            >
              Target page assigned
            </span>
          )}
          {!row.targetPageUrl && (
            <span style={{ color: "var(--app-text-disabled)" }}>
              Unmapped
            </span>
          )}
        </div>
      </td>
      <td className="px-2 py-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Save intent and target page"
            aria-label={`Save ${row.keyword}`}
            disabled={!dirty || saving}
            onClick={() =>
              onSave({
                intent: intent || null,
                targetPageUrl: targetUrl.trim() || null,
              })
            }
            className="rounded-[7px] px-2 py-1.5 text-[9.5px] font-bold disabled:opacity-40"
            style={{
              color: "var(--app-primary)",
              background: "var(--app-success-bg)",
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            title="Remove keyword"
            aria-label={`Remove ${row.keyword}`}
            disabled={removing}
            onClick={onRemove}
            className="rounded-[7px] p-1.5 disabled:opacity-40"
            style={{ color: "var(--app-danger-strong)" }}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </td>
    </tr>
  );
}

function Metric({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Search;
}) {
  return (
    <div
      className="rounded-[10px] p-3"
      style={{
        border: "1px solid var(--app-border)",
        background: "var(--app-surface-2)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-[10px] font-semibold"
          style={{ color: "var(--app-text-muted)" }}
        >
          {label}
        </span>
        <Icon
          className="h-3.5 w-3.5"
          style={{ color: "var(--app-primary)" }}
          aria-hidden
        />
      </div>
      <div
        className="mt-1 text-[19px] font-extrabold tabular-nums"
        style={{ color: "var(--app-text)" }}
      >
        {value}
      </div>
      <div
        className="mt-0.5 text-[9.5px]"
        style={{ color: "var(--app-text-faint)" }}
      >
        {detail}
      </div>
    </div>
  );
}
