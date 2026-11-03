"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  Clock3,
  RefreshCw,
  Search,
  Target,
} from "lucide-react";
import { toast } from "@/lib/toast";
import {
  fetchKeywordHistory,
  fetchKeywords,
  triggerKeywordCheck,
  type KeywordHistoryPoint,
  type TrackedKeywordRow,
} from "@/lib/keywords-api";
import { formatDate } from "@/lib/format";

interface RankPortfolioEntry {
  keyword: TrackedKeywordRow;
  history: KeywordHistoryPoint[];
}

const EMPTY_RANK_ENTRIES: RankPortfolioEntry[] = [];

async function fetchRankPortfolio(): Promise<RankPortfolioEntry[]> {
  const keywords = await fetchKeywords();
  return Promise.all(
    keywords.map(async (keyword) => ({
      keyword,
      history: await fetchKeywordHistory(keyword.id),
    })),
  );
}

export function SeoRankTrackingView() {
  const [filter, setFilter] = useState("");
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["seo-rank-tracking"],
    queryFn: fetchRankPortfolio,
    staleTime: 30_000,
  });
  const check = useMutation({
    mutationFn: triggerKeywordCheck,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["seo-rank-tracking"] });
      await client.invalidateQueries({ queryKey: ["keywords"] });
      await client.invalidateQueries({ queryKey: ["seo-autopilot-overview"] });
      toast.success("A new rank check was saved.");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Rank check failed.",
      ),
  });
  const entries = query.data ?? EMPTY_RANK_ENTRIES;
  const filtered = useMemo(() => {
    const needle = filter.trim().toLocaleLowerCase();
    const rows = needle
      ? entries.filter((entry) =>
          entry.keyword.keyword.toLocaleLowerCase().includes(needle),
        )
      : entries;
    return [...rows].sort(
      (a, b) =>
        (a.keyword.latestRank ?? Number.MAX_SAFE_INTEGER) -
          (b.keyword.latestRank ?? Number.MAX_SAFE_INTEGER) ||
        a.keyword.keyword.localeCompare(b.keyword.keyword),
    );
  }, [entries, filter]);
  const ranked = entries.filter(
    (entry) => entry.keyword.latestRank !== null,
  ).length;
  const topThree = entries.filter(
    (entry) =>
      entry.keyword.latestRank !== null && entry.keyword.latestRank <= 3,
  ).length;
  const topTen = entries.filter(
    (entry) =>
      entry.keyword.latestRank !== null && entry.keyword.latestRank <= 10,
  ).length;
  const positionsElevenToTwenty = entries.filter(
    (entry) =>
      entry.keyword.latestRank !== null &&
      entry.keyword.latestRank >= 11 &&
      entry.keyword.latestRank <= 20,
  ).length;
  const declining = entries.filter(
    (entry) =>
      entry.keyword.latestRank !== null &&
      entry.keyword.previousRank !== null &&
      entry.keyword.latestRank > entry.keyword.previousRank,
  ).length;
  const newlyRanking = entries.filter(
    (entry) =>
      entry.history.length >= 2 &&
      entry.keyword.latestRank !== null &&
      entry.keyword.previousRank === null,
  ).length;
  const notRanking = entries.filter(
    (entry) =>
      entry.keyword.latestRank === null &&
      entry.keyword.lastCheckedAt !== null,
  ).length;

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
                Rank Tracking
              </h1>
            </div>
            <p
              className="mb-0 mt-1 max-w-[760px] text-[12px] leading-relaxed"
              style={{ color: "var(--app-text-muted)" }}
            >
              Latest provider-reported positions and the saved history for
              each tracked term. A missing position means the provider did not
              return your site in its organic results for that check.
            </p>
          </div>
          <Link
            href="/marketing/seo-autopilot/keywords"
            className="rounded-[9px] px-3 py-2 text-[11.5px] font-bold"
            style={{
              color: "var(--app-primary)",
              background: "var(--app-success-bg)",
            }}
          >
            Manage keywords
          </Link>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-7">
          <Metric
            label="Tracked"
            value={String(entries.length)}
            detail="Saved keyword records"
          />
          <Metric
            label="Have a position"
            value={String(ranked)}
            detail="Latest check found your site"
          />
          <Metric
            label="Top 3"
            value={String(topThree)}
            detail="Latest saved position"
          />
          <Metric
            label="Top 10"
            value={String(topTen)}
            detail="Latest saved position"
          />
          <Metric
            label="11–20"
            value={String(positionsElevenToTwenty)}
            detail="Latest saved position"
          />
          <Metric
            label="Declining"
            value={String(declining)}
            detail="Lower than the prior saved position"
          />
          <Metric
            label="Newly ranking"
            value={String(newlyRanking)}
            detail="Now ranked after a prior no-result check"
          />
          <Metric
            label="Not ranking"
            value={String(notRanking)}
            detail="Checked, not in returned results"
          />
        </div>
        {entries.some((entry) => entry.keyword.lastCheckedAt === null) && (
          <div
            className="mt-3 flex items-start gap-2 rounded-[9px] p-3 text-[10.5px]"
            style={{
              background: "var(--app-warning-bg)",
              color: "var(--app-warning-text)",
            }}
          >
            <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              {entries.filter((entry) => entry.keyword.lastCheckedAt === null).length}{" "}
              tracked term(s) have no saved check yet. Run a check after
              configuring your website and SERP provider.
            </span>
          </div>
        )}
        {check.isError && (
          <div
            role="alert"
            className="mt-3 rounded-[9px] p-3 text-[10.5px]"
            style={{
              background: "var(--app-warning-bg)",
              color: "var(--app-warning-text)",
            }}
          >
            {check.error instanceof Error
              ? check.error.message
              : "The ranking provider could not complete the check."}
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2
              className="m-0 text-[13px] font-bold"
              style={{ color: "var(--app-text)" }}
            >
              Position history
            </h2>
            <p
              className="mb-0 mt-1 text-[10px]"
              style={{ color: "var(--app-text-muted)" }}
            >
              Showing up to the latest 12 saved checks per keyword.
            </p>
          </div>
          <label className="relative">
            <span className="sr-only">Filter tracked keywords</span>
            <Search
              className="absolute left-2.5 top-2.5 h-3.5 w-3.5"
              style={{ color: "var(--app-text-disabled)" }}
              aria-hidden
            />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter keywords"
              className="h-9 w-[220px] rounded-[8px] pl-8 pr-3 text-[10.5px]"
              style={{
                border: "1px solid var(--app-border)",
                background: "var(--app-surface)",
                color: "var(--app-text)",
              }}
            />
          </label>
        </div>
        {query.isPending ? (
          <div
            className="mt-4 h-40 animate-pulse rounded-[10px]"
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
            <span>Saved rank history is unavailable.</span>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="font-bold"
              style={{ color: "var(--app-primary)" }}
            >
              Retry
            </button>
          </div>
        ) : entries.length === 0 ? (
          <div
            className="mt-4 rounded-[10px] p-8 text-center"
            style={{ background: "var(--app-surface-2)" }}
          >
            <p
              className="m-0 text-[12px] font-bold"
              style={{ color: "var(--app-text)" }}
            >
              No tracked keywords yet
            </p>
            <p
              className="mb-0 mt-1 text-[10.5px]"
              style={{ color: "var(--app-text-muted)" }}
            >
              Add terms in Keyword Intelligence to begin saving position checks.
            </p>
            <Link
              href="/marketing/seo-autopilot/keywords"
              className="mt-3 inline-flex rounded-[8px] px-3 py-2 text-[10.5px] font-bold text-white"
              style={{ background: "var(--app-primary)" }}
            >
              Open Keyword Intelligence
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div
            className="mt-4 rounded-[10px] p-7 text-center text-[11px]"
            style={{
              background: "var(--app-surface-2)",
              color: "var(--app-text-muted)",
            }}
          >
            No tracked keywords match this filter.
          </div>
        ) : (
          <div className="mt-3 grid gap-2.5">
            {filtered.map((entry) => (
              <RankCard
                key={entry.keyword.id}
                entry={entry}
                checking={
                  check.isPending && check.variables === entry.keyword.id
                }
                onCheck={() => check.mutate(entry.keyword.id)}
              />
            ))}
          </div>
        )}
        <p
          className="mb-0 mt-3 text-[10px] leading-relaxed"
          style={{ color: "var(--app-text-faint)" }}
        >
          Positions come from Google organic results via SerpApi, matched to the
          website saved in Business Listings. History is limited to 12 checks.
          Checks currently use the provider&apos;s default Google market; this
          version does not select or save a market, device, location or
          SERP-feature breakdown. Search volume and keyword difficulty are also
          unavailable from the current data source.
        </p>
      </section>
    </main>
  );
}

function RankCard({
  entry,
  checking,
  onCheck,
}: {
  entry: RankPortfolioEntry;
  checking: boolean;
  onCheck: () => void;
}) {
  const { keyword, history } = entry;
  const bestRank = history.reduce<number | null>((best, point) => {
    if (point.rank === null) return best;
    return best === null ? point.rank : Math.min(best, point.rank);
  }, null);
  const movement =
    keyword.latestRank === null || keyword.previousRank === null
      ? null
      : keyword.latestRank < keyword.previousRank
        ? "up"
        : keyword.latestRank > keyword.previousRank
          ? "down"
          : "same";
  return (
    <article
      className="grid gap-3 rounded-[11px] p-3 md:grid-cols-[minmax(180px,1.1fr)_minmax(160px,0.8fr)_minmax(220px,1.4fr)_auto] md:items-center"
      style={{
        border: "1px solid var(--app-border)",
        background: "var(--app-surface-2)",
      }}
    >
      <div className="min-w-0">
        <div
          className="truncate text-[11.5px] font-bold"
          style={{ color: "var(--app-text)" }}
          title={keyword.keyword}
        >
          {keyword.keyword}
        </div>
        <div
          className="mt-1 text-[9.5px]"
          style={{ color: "var(--app-text-faint)" }}
        >
          {keyword.lastCheckedAt
            ? `Checked ${formatDate(keyword.lastCheckedAt)}`
            : "Never checked"}
        </div>
        <div
          className="mt-1 truncate text-[9px]"
          style={{ color: "var(--app-text-faint)" }}
          title={keyword.targetPageUrl ?? undefined}
        >
          {keyword.targetPageUrl
            ? `Target: ${keyword.targetPageUrl}`
            : "No target page assigned"}
        </div>
        {keyword.topResultTitle && (
          <div
            className="mt-1 truncate text-[9px]"
            style={{ color: "var(--app-text-faint)" }}
            title={keyword.topResultTitle}
          >
            Top result: {keyword.topResultTitle}
          </div>
        )}
      </div>
      <div>
        <div className="flex items-baseline gap-2">
          <span
            className="text-[20px] font-extrabold tabular-nums"
            style={{ color: "var(--app-text)" }}
          >
            {keyword.latestRank === null ? "—" : `#${keyword.latestRank}`}
          </span>
          {movement && (
            <span
              className="inline-flex items-center gap-0.5 text-[9.5px] font-semibold"
              style={{
                color:
                  movement === "up"
                    ? "var(--app-success-text)"
                    : movement === "down"
                      ? "var(--app-danger-strong)"
                      : "var(--app-text-faint)",
              }}
            >
              {movement === "up" ? (
                <ArrowUpRight className="h-3 w-3" aria-hidden />
              ) : movement === "down" ? (
                <ArrowDownRight className="h-3 w-3" aria-hidden />
              ) : null}
              {movement === "up"
                ? `${keyword.previousRank! - keyword.latestRank!} up`
                : movement === "down"
                  ? `${keyword.latestRank! - keyword.previousRank!} down`
                  : "unchanged"}
            </span>
          )}
        </div>
        <div className="text-[9px]" style={{ color: "var(--app-text-faint)" }}>
          {keyword.latestRank === null && keyword.lastCheckedAt
            ? "Not in checked results"
            : keyword.latestRank === null
              ? "No reading recorded"
              : `Previous #${keyword.previousRank ?? "—"}`}
        </div>
        <div className="text-[9px]" style={{ color: "var(--app-text-faint)" }}>
          Best saved: {bestRank === null ? "—" : `#${bestRank}`}
        </div>
      </div>
      <HistoryChart points={history} />
      <button
        type="button"
        disabled={checking}
        onClick={onCheck}
        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] px-3 text-[10px] font-bold disabled:opacity-50"
        style={{ background: "var(--app-primary)", color: "white" }}
      >
        <RefreshCw
          className={`h-3 w-3 ${checking ? "animate-spin" : ""}`}
          aria-hidden
        />
        {checking ? "Checking…" : "Check now"}
      </button>
    </article>
  );
}

function HistoryChart({ points }: { points: KeywordHistoryPoint[] }) {
  const ranked = points
    .map((point) => point.rank)
    .filter((rank): rank is number => rank !== null);
  const width = 240;
  const height = 48;
  const pad = 5;
  const min = ranked.length ? Math.min(...ranked) : 0;
  const max = ranked.length ? Math.max(...ranked) : 0;
  const span = Math.max(1, max - min);
  const coordinate = (
    point: KeywordHistoryPoint,
    index: number,
  ): [number, number] | null => {
    if (point.rank === null) return null;
    const x =
      pad +
      (points.length <= 1
        ? (width - 2 * pad) / 2
        : (index * (width - 2 * pad)) / (points.length - 1));
    const y = pad + ((point.rank - min) / span) * (height - 2 * pad);
    return [x, y];
  };
  const runs: [number, number][][] = [];
  for (let index = 0; index < points.length; index += 1) {
    const point = coordinate(points[index], index);
    if (!point) continue;
    const previous = points[index - 1];
    const previousPoint = previous ? coordinate(previous, index - 1) : null;
    if (!previousPoint) runs.push([point]);
    else runs[runs.length - 1].push(point);
  }
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  return (
    <div className="min-w-0">
      <div
        className="flex items-center justify-between text-[9px]"
        style={{ color: "var(--app-text-faint)" }}
      >
        <span>
          {points.length ? `${points.length} saved checks` : "No saved checks"}
        </span>
        <span>
          {ranked.length
            ? `#${min}${max === min ? "" : `–#${max}`}`
            : "Position unavailable"}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={
          ranked.length
            ? `Position history from rank ${ranked[0]} to rank ${ranked[ranked.length - 1]}`
            : "No saved rank positions"
        }
        className="mt-1 h-[48px] w-full overflow-visible"
      >
        <line
          x1={pad}
          x2={width - pad}
          y1={height - pad}
          y2={height - pad}
          stroke="var(--app-border)"
          strokeWidth="1"
        />
        {runs.map((run, index) =>
          run.length > 1 ? (
            <polyline
              key={`line-${index}`}
              points={run.map((point) => point.join(",")).join(" ")}
              fill="none"
              stroke="var(--app-primary)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            run.map((point, pointIndex) => (
              <circle
                key={`point-${index}-${pointIndex}`}
                cx={point[0]}
                cy={point[1]}
                r="2.5"
                fill="var(--app-primary)"
              />
            ))
          ),
        )}
        {points.map((point, index) => {
          const position = coordinate(point, index);
          return position ? (
            <circle
              key={`${point.capturedAt}-${index}`}
              cx={position[0]}
              cy={position[1]}
              r="2.4"
              fill="var(--app-primary)"
            />
          ) : null;
        })}
      </svg>
      <div
        className="flex justify-between text-[8px]"
        style={{ color: "var(--app-text-faint)" }}
      >
        <span>{firstPoint ? formatDate(firstPoint.capturedAt) : "—"}</span>
        <span>{lastPoint ? formatDate(lastPoint.capturedAt) : "—"}</span>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  positive = false,
}: {
  label: string;
  value: string;
  detail: string;
  positive?: boolean;
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
        {positive ? (
          <ArrowUpRight
            className="h-3.5 w-3.5"
            style={{ color: "var(--app-success-text)" }}
            aria-hidden
          />
        ) : null}
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
