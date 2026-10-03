"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Brain, CircleHelp, RefreshCw } from "lucide-react";
import {
  fetchBusinessIntelligenceOverview,
  type BusinessIntelligenceMetric,
} from "@/lib/business-intelligence-api";

function formatMetricValue(
  metric: BusinessIntelligenceMetric,
  currency: string,
): string {
  const values = metric.value;
  const value = values.revenue ?? values.count ?? values.orders ?? null;
  if (value === null) return "Not available";
  if (values.revenue !== undefined) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(value);
    } catch {
      return `${value} ${currency}`;
    }
  }
  return new Intl.NumberFormat().format(value);
}

export function BusinessIntelligenceOverviewView() {
  const query = useQuery({
    queryKey: ["business-intelligence", "overview"],
    queryFn: fetchBusinessIntelligenceOverview,
    staleTime: 30_000,
  });

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-5 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--app-primary)]">
            Business Intelligence
          </p>
          <h1 className="mt-2 text-2xl font-bold text-[var(--app-text)] md:text-3xl">
            BI Overview
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--app-text-muted)]">
            What changed, the recorded evidence behind it, and where to make the
            next decision.
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
        <div
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
          aria-label="Loading BI overview"
        >
          {Array.from({ length: 5 }, (_, index) => (
            <div
              key={index}
              className="h-28 animate-pulse rounded-xl bg-[var(--app-surface-muted)]"
            />
          ))}
        </div>
      ) : query.isError ? (
        <section
          role="alert"
          className="rounded-xl border border-[var(--app-danger-border)] bg-[var(--app-danger-bg)] p-5 text-sm text-[var(--app-danger)]"
        >
          Could not load BI Overview. {query.error.message}
        </section>
      ) : query.data ? (
        <>
          <section
            aria-label="Business metrics"
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
          >
            {query.data.metrics.map((metric) => (
              <article
                key={metric.key}
                className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-4 shadow-sm"
              >
                <p className="text-sm text-[var(--app-text-muted)]">
                  {metric.title}
                </p>
                <p className="mt-3 text-2xl font-semibold tabular-nums text-[var(--app-text)]">
                  {formatMetricValue(metric, query.data.currency)}
                </p>
                {metric.value.grossProfit !== undefined && (
                  <p className="mt-1 text-xs text-[var(--app-text-faint)]">
                    Gross profit{" "}
                    {new Intl.NumberFormat(undefined, {
                      style: "currency",
                      currency: query.data.currency,
                    }).format(metric.value.grossProfit ?? 0)}
                  </p>
                )}
                {metric.value.orders !== undefined && (
                  <p className="mt-1 text-xs text-[var(--app-text-faint)]">
                    {new Intl.NumberFormat().format(metric.value.orders ?? 0)}{" "}
                    completed orders
                  </p>
                )}
              </article>
            ))}
          </section>

          <section className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--app-border)] p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--app-primary-soft)] text-[var(--app-primary)]">
                  <Brain className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <h2 className="font-semibold text-[var(--app-text)]">
                    Recorded insights
                  </h2>
                  <p className="text-xs text-[var(--app-text-muted)]">
                    Source: {query.data.insightSource}
                  </p>
                </div>
              </div>
              <Link
                href="/dashboard/insights"
                className="inline-flex items-center gap-1 text-sm font-medium text-[var(--app-primary)] hover:underline"
              >
                Open AI Insights{" "}
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            {query.data.insights.length === 0 ? (
              <div className="flex items-start gap-3 p-5 text-sm text-[var(--app-text-muted)]">
                <CircleHelp className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                No new insights are currently recorded. BI does not create a
                second insight feed.
              </div>
            ) : (
              <ul className="divide-y divide-[var(--app-border)]">
                {query.data.insights.map((insight) => (
                  <li
                    key={insight.id}
                    className="grid gap-3 p-5 md:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <div>
                      <p className="font-medium text-[var(--app-text)]">
                        {insight.observation}
                      </p>
                      <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                        Evidence · {insight.sourceFigure}
                      </p>
                      <p className="mt-1 text-xs text-[var(--app-text-faint)]">
                        Confidence: not recorded in the source insight
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      {insight.estimatedImpact === null ? (
                        <span className="text-[var(--app-text-muted)]">
                          Impact not quantified
                        </span>
                      ) : (
                        <span className="font-medium tabular-nums text-[var(--app-text)]">
                          {new Intl.NumberFormat(undefined, {
                            style: "currency",
                            currency: query.data.currency,
                          }).format(insight.estimatedImpact)}
                        </span>
                      )}
                      <span
                        className="rounded-full border border-[var(--app-border)] px-2 py-1 text-xs text-[var(--app-text-muted)]"
                        title="Thresholds add an on-screen marker only"
                      >
                        {insight.impactThresholdStatus}
                      </span>
                      {insight.nextDecisionHref && (
                        <Link
                          href={insight.nextDecisionHref}
                          className="font-medium text-[var(--app-primary)] hover:underline"
                        >
                          Open source module
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="text-xs leading-5 text-[var(--app-text-faint)]">
            {query.data.disclosure} Request time:{" "}
            {new Date(query.data.requestedAt).toLocaleString()}.
          </p>
        </>
      ) : null}
    </main>
  );
}
