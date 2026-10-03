"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CircleHelp,
  Compass,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import {
  fetchBusinessOpportunityRadar,
  type BusinessCommerceCandidate,
  type BusinessOpportunityInsight,
} from "@/lib/business-intelligence-api";

type Theme = "all" | "growth" | "savings" | "retention";

const THEMES: { key: Theme; label: string }[] = [
  { key: "all", label: "All opportunities" },
  { key: "growth", label: "Growth" },
  { key: "savings", label: "Savings" },
  { key: "retention", label: "Retention" },
];
const THEME_CARDS: { key: Exclude<Theme, "all">; label: string }[] = [
  { key: "growth", label: "Growth" },
  { key: "savings", label: "Savings" },
  { key: "retention", label: "Retention" },
];

function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function InsightCard({
  insight,
  currency,
}: {
  insight: BusinessOpportunityInsight;
  currency: string;
}) {
  return (
    <article className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[var(--app-primary-soft)] px-2.5 py-1 text-xs font-semibold capitalize text-[var(--app-primary)]">
              {insight.theme}
            </span>
            <span className="text-xs capitalize text-[var(--app-text-faint)]">
              {insight.sourceCategory} · AI Insights
            </span>
            <span className="text-xs text-[var(--app-text-faint)]">
              Rank {insight.rank}
            </span>
          </div>
          <h2 className="mt-3 font-semibold leading-6 text-[var(--app-text)]">
            {insight.title}
          </h2>
        </div>
        <div className="text-right">
          {insight.sourceRecordedImpact === null ? (
            <p className="text-sm text-[var(--app-text-muted)]">
              Impact not quantified
            </p>
          ) : (
            <>
              <p className="text-xs text-[var(--app-text-faint)]">
                Source-recorded impact
              </p>
              <p className="mt-1 font-semibold tabular-nums text-[var(--app-text)]">
                {formatAmount(insight.sourceRecordedImpact, currency)}
              </p>
            </>
          )}
        </div>
      </div>
      <div className="mt-4 rounded-lg bg-[var(--app-surface-muted)] p-3">
        <p className="text-xs font-semibold text-[var(--app-text-muted)]">
          Evidence from source record
        </p>
        <p className="mt-1 text-sm leading-5 text-[var(--app-text)]">
          {insight.evidence || "Evidence not recorded"}
        </p>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--app-text-faint)]">
          {insight.rankBasis} · Recorded{" "}
          {new Date(insight.createdAt).toLocaleString()}
        </p>
        {insight.sourceHref && (
          <Link
            href={insight.sourceHref}
            className="inline-flex items-center gap-1 text-sm font-medium text-[var(--app-primary)] hover:underline"
          >
            Review in source module
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
        )}
      </div>
    </article>
  );
}

function CommerceCandidateCard({
  candidate,
}: {
  candidate: BusinessCommerceCandidate;
}) {
  const signals = [
    ["Demand signal", candidate.demandSignal],
    ["Competition score", candidate.competitionScore],
    ["Trend velocity", candidate.trendVelocity],
    ["Store-fit score", candidate.storeFitScore],
  ] as const;
  return (
    <article className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[var(--app-primary-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--app-primary)]">
              Growth · Product Radar
            </span>
            <span className="text-xs text-[var(--app-text-faint)]">
              Rank {candidate.rank}
            </span>
            <span className="rounded-full border border-[var(--app-border)] px-2 py-0.5 text-xs capitalize text-[var(--app-text-muted)]">
              {candidate.status.replaceAll("_", " ")}
            </span>
          </div>
          <h2 className="mt-3 font-semibold text-[var(--app-text)]">
            {candidate.title}
          </h2>
          <p className="mt-1 text-xs text-[var(--app-text-muted)]">
            Source: {candidate.source}
            {candidate.category ? ` · ${candidate.category}` : ""}
            {candidate.market ? ` · ${candidate.market}` : ""}
          </p>
        </div>
        <span className="rounded-full border border-[var(--app-border)] px-2.5 py-1 text-xs capitalize text-[var(--app-text-muted)]">
          {candidate.risk} source risk
        </span>
      </div>
      {candidate.evidence ? (
        <div className="mt-4 rounded-lg bg-[var(--app-surface-muted)] p-3">
          <p className="text-xs font-semibold text-[var(--app-text-muted)]">
            Recorded evidence
          </p>
          <p className="mt-1 text-sm leading-5 text-[var(--app-text)]">
            {candidate.evidence}
          </p>
        </div>
      ) : (
        <p className="mt-4 rounded-lg bg-[var(--app-surface-muted)] p-3 text-sm text-[var(--app-text-muted)]">
          Evidence not recorded
        </p>
      )}
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {signals.map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-[var(--app-border)] p-3"
          >
            <dt className="text-xs text-[var(--app-text-muted)]">{label}</dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums text-[var(--app-text)]">
              {value ?? "Not tracked"}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--app-text-faint)]">
          {candidate.rankBasis}
          {candidate.sourceFreshAt
            ? ` · Source checked ${new Date(candidate.sourceFreshAt).toLocaleString()}`
            : " · Source freshness not recorded"}
        </p>
        <Link
          href={candidate.sourceHref}
          className="inline-flex items-center gap-1 text-sm font-medium text-[var(--app-primary)] hover:underline"
        >
          Review in Commerce
          <ArrowUpRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </article>
  );
}

export function OpportunityRadarView() {
  const [theme, setTheme] = useState<Theme>("all");
  const query = useQuery({
    queryKey: ["business-intelligence", "opportunity-radar"],
    queryFn: fetchBusinessOpportunityRadar,
    staleTime: 30_000,
  });
  const insights = useMemo(
    () =>
      (query.data?.recordedInsights ?? []).filter(
        (insight) => theme === "all" || insight.theme === theme,
      ),
    [query.data?.recordedInsights, theme],
  );
  const candidates =
    theme === "all" || theme === "growth"
      ? (query.data?.commerceCandidates ?? [])
      : [];

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-5 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--app-primary)]">
            Business Intelligence
          </p>
          <h1 className="mt-2 text-2xl font-bold text-[var(--app-text)] md:text-3xl">
            Opportunity Radar
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--app-text-muted)]">
            Find recorded growth, savings and retention signals, inspect their
            evidence, then continue in the source module. BI does not apply
            changes or forecast uplift.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--app-border)] px-3 py-2 text-sm font-medium text-[var(--app-text)] hover:bg-[var(--app-surface-muted)] disabled:opacity-60"
        >
          <RefreshCw
            className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`}
            aria-hidden
          />
          Refresh
        </button>
      </header>

      {query.isLoading ? (
        <p className="text-sm text-[var(--app-text-muted)]">
          Loading source records…
        </p>
      ) : query.isError ? (
        <section
          role="alert"
          className="rounded-xl border border-[var(--app-danger-border)] bg-[var(--app-danger-bg)] p-5 text-sm text-[var(--app-danger)]"
        >
          Could not load Opportunity Radar. {query.error.message}
        </section>
      ) : query.data ? (
        <>
          <section
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            aria-label="Recorded opportunity themes"
          >
            {THEME_CARDS.map((item) => {
              const Icon =
                item.key === "growth"
                  ? TrendingUp
                  : item.key === "savings"
                    ? Compass
                    : CircleHelp;
              return (
                <article
                  key={item.key}
                  className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4"
                >
                  <div className="flex items-center gap-2 text-[var(--app-text-muted)]">
                    <Icon className="h-4 w-4" aria-hidden />
                    <h2 className="text-sm font-medium">
                      {item.label} signals
                    </h2>
                  </div>
                  <p className="mt-3 text-2xl font-semibold tabular-nums text-[var(--app-text)]">
                    {query.data.themeCounts[item.key]}
                  </p>
                  <p className="mt-1 text-xs text-[var(--app-text-faint)]">
                    Open source records
                  </p>
                </article>
              );
            })}
            <article className="rounded-xl border border-dashed border-[var(--app-border)] p-4">
              <p className="text-sm font-medium text-[var(--app-text-muted)]">
                Not classified
              </p>
              <p className="mt-3 text-2xl font-semibold tabular-nums text-[var(--app-text)]">
                {query.data.themeCounts.unclassified}
              </p>
              <p className="mt-1 text-xs text-[var(--app-text-faint)]">
                Source category has no BI theme mapping
              </p>
            </article>
          </section>

          <div
            className="flex flex-wrap gap-2"
            role="tablist"
            aria-label="Filter opportunity theme"
          >
            {THEMES.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={theme === item.key}
                onClick={() => setTheme(item.key)}
                className={`rounded-full border px-3 py-2 text-sm font-medium ${theme === item.key ? "border-[var(--app-primary)] bg-[var(--app-primary-soft)] text-[var(--app-primary)]" : "border-[var(--app-border)] text-[var(--app-text-muted)] hover:bg-[var(--app-surface-muted)]"}`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {theme !== "savings" && theme !== "retention" && (
            <section
              className="flex flex-col gap-3"
              aria-label="Commerce Product Radar candidates"
            >
              <div>
                <h2 className="text-lg font-semibold text-[var(--app-text)]">
                  Commerce candidates
                </h2>
                <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                  Ranked only with the source&apos;s recorded confidence and
                  freshness
                </p>
              </div>
              {candidates.length ? (
                candidates.map((candidate) => (
                  <CommerceCandidateCard
                    key={candidate.id}
                    candidate={candidate}
                  />
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-[var(--app-border)] p-5 text-sm text-[var(--app-text-muted)]">
                  No open Product Radar candidates are recorded.
                </p>
              )}
            </section>
          )}

          {theme !== "savings" && theme !== "retention" && (
            <section
              className="flex flex-col gap-3"
              aria-label="Recorded AI insight opportunities"
            >
              <div>
                <h2 className="text-lg font-semibold text-[var(--app-text)]">
                  AI Insight signals
                </h2>
                <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                  Ranks reflect source amounts and recency, not BI estimates
                </p>
              </div>
              {insights.length ? (
                insights.map((insight) => (
                  <InsightCard
                    key={insight.id}
                    insight={insight}
                    currency={query.data.currency}
                  />
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-[var(--app-border)] p-5 text-sm text-[var(--app-text-muted)]">
                  No open AI Insight signals match this theme.
                </p>
              )}
            </section>
          )}
          {(theme === "savings" || theme === "retention") && (
            <section
              className="flex flex-col gap-3"
              aria-label="Filtered AI insight opportunities"
            >
              <h2 className="text-lg font-semibold capitalize text-[var(--app-text)]">
                {theme} signals
              </h2>
              {insights.length ? (
                insights.map((insight) => (
                  <InsightCard
                    key={insight.id}
                    insight={insight}
                    currency={query.data.currency}
                  />
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-[var(--app-border)] p-5 text-sm text-[var(--app-text-muted)]">
                  {theme === "savings"
                    ? "No explicit savings opportunity is currently recorded. BI does not infer savings from low stock or outstanding credit."
                    : "No open AI Insight signals match this theme."}
                </p>
              )}
            </section>
          )}

          <p className="text-xs leading-5 text-[var(--app-text-faint)]">
            {query.data.disclosure}
          </p>
        </>
      ) : null}
    </main>
  );
}
