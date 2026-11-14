"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import {
  fetchSeoReport,
  saveSeoOutcomeSnapshots,
  type RankBuckets,
  type ReportMetric,
  type ReportSection,
  type SeoReport,
} from "@/lib/seo-reports-api";

const SECTIONS: { key: ReportSection | "summary"; label: string }[] = [
  { key: "summary", label: "Executive summary" },
  { key: "visibility", label: "Visibility & keywords" },
  { key: "technical", label: "Technical health" },
  { key: "content", label: "Content" },
  { key: "local", label: "Local" },
  { key: "authority", label: "Authority" },
  { key: "actions", label: "Actions & outcomes" },
];
const BUCKETS: { key: keyof RankBuckets; label: string }[] = [
  { key: "top3", label: "1–3" },
  { key: "top10", label: "4–10" },
  { key: "top20", label: "11–20" },
  { key: "beyond20", label: "21+" },
  { key: "notFound", label: "Not found" },
  { key: "unchecked", label: "Not checked" },
];

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function landingPageReadout(
  outcome: SeoReport["actionLandingPageOutcomes"][number],
  period: "comparison" | "current",
): ReactNode {
  const result = outcome[period];
  if (result.rows.length === 0) {
    return <span style={{ color: "var(--app-text-faint)" }}>{result.reason ?? "Not available"}</span>;
  }
  return (
    <div className="space-y-1">
      {result.rows.map((row, index) => (
        <p key={`${row.landingPage}:${index}`} className="m-0">
          <span className="font-mono text-[10px]">{row.landingPage}</span>
          <br />
          Sessions {row.sessions ?? "Not returned"} · Key events{" "}
          {row.keyEvents ?? "Not returned"} · Revenue{" "}
          {row.totalRevenue ?? "Not returned"}
          {outcome.currencyCode
            ? ` ${outcome.currencyCode}`
            : " (currency not reported)"}
        </p>
      ))}
    </div>
  );
}

function format(value: number | null, unit?: ReportMetric["unit"]) {
  if (value === null) return "—";
  return unit === "stars"
    ? `${value}★`
    : unit === "%"
      ? `${value}%`
      : String(value);
}

function Change({ metric }: { metric: ReportMetric }) {
  if (metric.baseline === null || metric.current === null)
    return (
      <span style={{ color: "var(--app-text-faintest)" }}>No comparison</span>
    );
  const delta = Math.round((metric.current - metric.baseline) * 10) / 10;
  if (delta === 0)
    return <span style={{ color: "var(--app-text-faint)" }}>No change</span>;
  const good = metric.lowerIsBetter ? delta < 0 : delta > 0;
  return (
    <span
      className="font-semibold"
      style={{
        color: good ? "var(--app-success-text)" : "var(--app-danger-strong)",
      }}
    >
      {delta > 0 ? "+" : ""}
      {delta}
    </span>
  );
}

function Card({ metric }: { metric: ReportMetric }) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{
        borderColor: "var(--app-border)",
        background: "var(--app-surface)",
      }}
    >
      <p
        className="m-0 text-xs font-semibold"
        style={{ color: "var(--app-text-faint)" }}
      >
        {metric.label}
      </p>
      <p className="m-0 mt-1 text-2xl font-bold">
        {format(metric.current, metric.unit)}
      </p>
      <p className="m-0 mt-1 text-xs">
        <Change metric={metric} />{" "}
        <span style={{ color: "var(--app-text-faintest)" }}>
          vs {format(metric.baseline, metric.unit)}
        </span>
      </p>
    </div>
  );
}

function Distribution({
  label,
  buckets,
}: {
  label: string;
  buckets: RankBuckets;
}) {
  const total = BUCKETS.reduce((sum, bucket) => sum + buckets[bucket.key], 0);
  return (
    <div className="flex flex-col gap-1">
      <p className="m-0 text-xs font-bold">{label}</p>
      {BUCKETS.map((bucket) => (
        <div
          key={bucket.key}
          className="grid grid-cols-[80px_1fr_32px] items-center gap-2 text-xs"
        >
          <span style={{ color: "var(--app-text-faint)" }}>{bucket.label}</span>
          <div
            className="h-2 rounded"
            style={{ background: "var(--app-surface-2)" }}
          >
            <div
              className="h-2 rounded"
              style={{
                width: total ? `${(buckets[bucket.key] / total) * 100}%` : 0,
                background: "var(--app-primary)",
              }}
            />
          </div>
          <span className="text-right tabular-nums">{buckets[bucket.key]}</span>
        </div>
      ))}
    </div>
  );
}

function exportCsv(metrics: ReportMetric[], days: number) {
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const rows = [
    ["Metric", "Baseline", "Current", "Source", "Freshness", "Caveat"],
    ...metrics.map((metric) => [
      metric.label,
      metric.baseline ?? "",
      metric.current ?? "",
      metric.source,
      metric.freshness ?? "",
      metric.caveat,
    ]),
  ];
  const blob = new Blob(
    [
      rows
        .map((row) => row.map((cell) => escape(String(cell))).join(","))
        .join("\n"),
    ],
    { type: "text/csv" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `seo-report-${days}d-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function SeoReportsView() {
  const [days, setDays] = useState(30);
  const [section, setSection] = useState<ReportSection | "summary">("summary");
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["seo-report", days],
    queryFn: () => fetchSeoReport(days),
  });
  const saveSnapshots = useMutation({
    mutationFn: () => saveSeoOutcomeSnapshots(days),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["seo-report", days] }),
  });
  const data = query.data;
  const metrics = (data?.metrics ?? []).filter(
    (metric) => section === "summary" || metric.section === section,
  );
  const summaryKeys = [
    "keywords_top10",
    "audit_issues",
    "content_published",
    "actions_completed",
  ];

  let body: ReactNode;
  if (query.isLoading)
    body = (
      <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>
        Loading…
      </p>
    );
  else if (query.isError || !data)
    body = (
      <div
        className="flex items-center gap-3 text-sm"
        style={{ color: "var(--app-danger-strong)" }}
      >
        {errorMessage(query.error, "Couldn't load the report.")}
        <button
          type="button"
          onClick={() => query.refetch()}
          className="font-bold underline"
        >
          Retry
        </button>
      </div>
    );
  else
    body = (
      <div className="flex flex-col gap-4">
        {section === "summary" && (
          <>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {data.metrics
                .filter((metric) => summaryKeys.includes(metric.key))
                .map((metric) => (
                  <Card key={metric.key} metric={metric} />
                ))}
            </div>
            <section
              className="rounded-xl border p-3"
              style={{ borderColor: "var(--app-border)" }}
            >
              <p className="m-0 text-xs font-bold">
                Google Search Console · latest {data.searchConsole.windowDays}
                -day windows
              </p>
              {data.searchConsole.status !== "connected" ? (
                <p
                  className="m-0 mt-1 text-xs"
                  style={{ color: "var(--app-text-faint)" }}
                >
                  Not connected. Connect Search Console and sync a property in
                  SEO Settings.
                </p>
              ) : !data.searchConsole.selectedProperty ? (
                <p
                  className="m-0 mt-1 text-xs"
                  style={{ color: "var(--app-text-faint)" }}
                >
                  No property selected. Choose one in SEO Settings.
                </p>
              ) : data.searchConsole.snapshots.length === 0 ? (
                <p
                  className="m-0 mt-1 text-xs"
                  style={{ color: "var(--app-text-faint)" }}
                >
                  No performance snapshot is available yet for{" "}
                  {data.searchConsole.selectedProperty}.
                </p>
              ) : (
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {data.searchConsole.snapshots.map((snapshot) => (
                    <div
                      key={snapshot.id}
                      className="rounded-lg border p-2 text-xs"
                      style={{ borderColor: "var(--app-border)" }}
                    >
                      <p className="m-0 font-semibold">
                        {snapshot.startDate} to {snapshot.endDate} ·{" "}
                        {snapshot.dataState === "final"
                          ? "Final"
                          : "No data returned"}
                      </p>
                      <p className="m-0 mt-1">
                        Clicks {snapshot.clicks ?? "Not available"} ·
                        Impressions {snapshot.impressions ?? "Not available"} ·
                        CTR{" "}
                        {snapshot.clickThroughRate === null
                          ? "Not available"
                          : `${(snapshot.clickThroughRate * 100).toFixed(2)}%`}{" "}
                        · Avg position{" "}
                        {snapshot.averagePosition === null
                          ? "Not available"
                          : snapshot.averagePosition.toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <p
                className="m-0 mt-2 text-[11px]"
                style={{ color: "var(--app-text-faintest)" }}
              >
                These are fixed Search Console windows and may not match the
                comparison period selected above. They are not attributed to
                changes listed in this report.
              </p>
            </section>
            <section
              className="rounded-xl border p-3"
              style={{ borderColor: "var(--app-border)" }}
            >
              <p className="m-0 text-xs font-bold">
                Google Analytics 4 · latest {data.googleAnalytics.windowDays}
                -day windows
              </p>
              {data.googleAnalytics.status !== "connected" ? (
                <p
                  className="m-0 mt-1 text-xs"
                  style={{ color: "var(--app-text-faint)" }}
                >
                  Not connected. Connect GA4, select a property and sync it in
                  SEO Settings.
                </p>
              ) : !data.googleAnalytics.selectedProperty ? (
                <p
                  className="m-0 mt-1 text-xs"
                  style={{ color: "var(--app-text-faint)" }}
                >
                  No property selected. Choose one in SEO Settings.
                </p>
              ) : !data.googleAnalytics.snapshot ? (
                <p
                  className="m-0 mt-1 text-xs"
                  style={{ color: "var(--app-text-faint)" }}
                >
                  No Organic Search snapshot is available yet for{" "}
                  {data.googleAnalytics.selectedProperty}.
                </p>
              ) : (
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {(
                    [
                      ["Current", data.googleAnalytics.snapshot.current],
                      ["Previous", data.googleAnalytics.snapshot.comparison],
                    ] as const
                  ).map(([label, window]) => (
                    <div
                      key={label}
                      className="rounded-lg border p-2 text-xs"
                      style={{ borderColor: "var(--app-border)" }}
                    >
                      <p className="m-0 font-semibold">
                        {window.startDate} to {window.endDate} ·{" "}
                        {window.dataState === "returned"
                          ? "Data returned"
                          : "No data returned"}
                      </p>
                      <p className="m-0 mt-1">
                        Organic Search sessions{" "}
                        {window.sessions ?? "Not available"} · Key events{" "}
                        {window.keyEvents ?? "Not available"} · Total revenue{" "}
                        {window.totalRevenue === null
                          ? "Not available"
                          : `${data.googleAnalytics.snapshot?.currencyCode ?? "Currency not available"} ${window.totalRevenue}`}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {data.googleAnalytics.snapshot && (
                <div
                  className="mt-3 rounded-lg border p-2 text-xs"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  <p className="m-0 font-semibold">
                    Current period · Organic Search landing pages
                  </p>
                  {!data.googleAnalytics.snapshot.current.landingPages ||
                  data.googleAnalytics.snapshot.current.landingPages
                    .dataState === "not_available" ? (
                    <p
                      className="m-0 mt-1"
                      style={{ color: "var(--app-text-faint)" }}
                    >
                      {data.googleAnalytics.snapshot.current.landingPages
                        ?.reason ??
                        "Page-level metrics are not in this saved snapshot. Sync again in SEO Settings."}
                    </p>
                  ) : data.googleAnalytics.snapshot.current.landingPages
                      .dataState === "no_data_returned" ? (
                    <p
                      className="m-0 mt-1"
                      style={{ color: "var(--app-text-faint)" }}
                    >
                      Google Analytics returned no landing-page rows for this
                      period.
                    </p>
                  ) : (
                    <div className="mt-1 overflow-x-auto">
                      <table className="w-full min-w-[560px] text-left">
                        <thead style={{ color: "var(--app-text-faint)" }}>
                          <tr>
                            {[
                              "Page path",
                              "Sessions",
                              "Key events",
                              "Revenue",
                            ].map((heading) => (
                              <th key={heading} className="py-1.5 pe-3">
                                {heading}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {data.googleAnalytics.snapshot.current.landingPages.rows
                            .slice(0, 10)
                            .map((row) => (
                              <tr
                                key={row.landingPage}
                                className="border-t"
                                style={{ borderColor: "var(--app-border)" }}
                              >
                                <td className="py-1.5 pe-3 font-mono">
                                  {row.landingPage}
                                </td>
                                <td className="py-1.5 pe-3 tabular-nums">
                                  {row.sessions ?? "Not available"}
                                </td>
                                <td className="py-1.5 pe-3 tabular-nums">
                                  {row.keyEvents ?? "Not available"}
                                </td>
                                <td className="py-1.5 tabular-nums">
                                  {row.totalRevenue === null
                                    ? "Not available"
                                    : `${data.googleAnalytics.snapshot?.currencyCode ?? "Currency not available"} ${row.totalRevenue}`}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {data.googleAnalytics.snapshot.current.landingPages
                    ?.truncated && (
                    <p
                      className="m-0 mt-1"
                      style={{ color: "var(--app-text-faintest)" }}
                    >
                      The Data API row limit is 250; this table shows the first
                      10 returned paths.
                    </p>
                  )}
                  <p
                    className="m-0 mt-1"
                    style={{ color: "var(--app-text-faintest)" }}
                  >
                    Page paths exclude query strings. These are Google-reported
                    Organic Search values and do not prove SEO causality.
                  </p>
                </div>
              )}
              <p
                className="m-0 mt-2 text-[11px]"
                style={{ color: "var(--app-text-faintest)" }}
              >
                {data.googleAnalytics.disclosure}
              </p>
            </section>
            <div
              className="rounded-xl border p-3 text-xs"
              style={{ borderColor: "var(--app-border)" }}
            >
              <p className="m-0 font-bold">Not tracked</p>
              <ul
                className="m-0 mt-1 list-disc ps-5"
                style={{ color: "var(--app-text-muted)" }}
              >
                {data.notTracked.map((row) => (
                  <li key={row.label}>
                    <strong>{row.label}:</strong> {row.reason}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
        {section === "visibility" && (
          <div className="grid gap-4 md:grid-cols-2">
            <Distribution
              label={`Rank distribution — end of previous ${days} days`}
              buckets={data.rankDistribution.baseline}
            />
            <Distribution
              label="Rank distribution — now"
              buckets={data.rankDistribution.current}
            />
          </div>
        )}
        {(section === "summary" || section === "content") && (
          <section
            className="overflow-x-auto rounded-xl border p-3"
            style={{ borderColor: "var(--app-border)" }}
          >
            <p className="m-0 text-xs font-bold">Tracked rank after recorded content publication</p>
            <p className="m-0 mt-1 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
              This compares the keyword rank saved at publication with the latest saved check after that date. It is site-level movement, not proof that the content caused a change or the page&rsquo;s exact position.
            </p>
            {data.contentRankOutcomes.length === 0 ? (
              <p className="mb-0 mt-3 text-xs" style={{ color: "var(--app-text-faint)" }}>
                No published content with a tracked keyword in this report period.
              </p>
            ) : (
              <table className="mt-2 w-full min-w-[760px] text-left text-xs">
                <thead style={{ color: "var(--app-text-faint)" }}>
                  <tr>
                    {[
                      "Published content",
                      "Tracked keyword",
                      "Publish-time rank",
                      "Latest after publication",
                      "Observed movement",
                      "Page confirmation",
                    ].map((heading) => (
                      <th key={heading} className="px-2 py-2 font-semibold">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.contentRankOutcomes.map((row) => (
                    <tr key={row.briefId} className="border-t align-top" style={{ borderColor: "var(--app-border)" }}>
                      <td className="px-2 py-2">
                        <p className="m-0 font-semibold">{row.topic}</p>
                        <p className="m-0 mt-1" style={{ color: "var(--app-text-faint)" }}>
                          {row.publishedAt ? formatDate(row.publishedAt) : "Publish date unavailable"}
                        </p>
                      </td>
                      <td className="px-2 py-2">{row.keyword ?? "Not linked"}</td>
                      <td className="px-2 py-2">{row.baselineRank === null ? "Not available" : `#${row.baselineRank}`}</td>
                      <td className="px-2 py-2">
                        {row.measuredAt
                          ? row.measuredRank === null
                            ? `Not in results · ${formatDate(row.measuredAt)}`
                            : `#${row.measuredRank} · ${formatDate(row.measuredAt)}`
                          : "No post-publication check"}
                      </td>
                      <td className="px-2 py-2">
                        {row.rankChange === null
                          ? row.state === "observed" && row.baselineRank === null
                            ? "Baseline not in results"
                            : row.state.replaceAll("_", " ")
                          : row.rankChange > 0
                            ? `Improved by ${row.rankChange} positions`
                            : row.rankChange < 0
                              ? `Declined by ${Math.abs(row.rankChange)} positions`
                              : "No observed movement"}
                      </td>
                      <td className="px-2 py-2">{row.liveConfirmedAt ? `URL seen in crawl · ${formatDate(row.liveConfirmedAt)}` : "URL not confirmed by crawl"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {data.contentRankOutcomes.length === 100 && (
              <p className="mb-0 mt-2 text-[10px]" style={{ color: "var(--app-text-faint)" }}>
                Showing the 100 most recently published entries in this period.
              </p>
            )}
          </section>
        )}
        {(section === "summary" || section === "actions") && (
          <section
            className="overflow-x-auto rounded-xl border p-3"
            style={{ borderColor: "var(--app-border)" }}
          >
            <p className="m-0 text-xs font-bold">GA4 Organic Search by action page</p>
            <p className="m-0 mt-1 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
              Exact page-path matches from the selected Google Analytics property. Query strings are ignored. The saved comparison and current periods are property context, not action-timed results or proof of causation.
            </p>
            {data.actionLandingPageOutcomes.length === 0 ? (
              <p className="mb-0 mt-3 text-xs" style={{ color: "var(--app-text-faint)" }}>
                No applied On-Page or Technical changes were recorded in this report period.
              </p>
            ) : (
              <table className="mt-2 w-full min-w-[900px] text-left text-xs">
                <thead style={{ color: "var(--app-text-faint)" }}>
                  <tr>
                    {["Applied page", "Applied", "GA4 property", "Comparison period", "Current period"].map((heading) => (
                      <th key={heading} className="px-2 py-2 font-semibold">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.actionLandingPageOutcomes.map((outcome) => (
                    <tr key={`${outcome.kind}:${outcome.actionId}`} className="border-t align-top" style={{ borderColor: "var(--app-border)" }}>
                      <td className="px-2 py-2">
                        <p className="m-0 font-semibold">{outcome.label}</p>
                        <p className="m-0 mt-1 max-w-[220px] truncate font-mono text-[10px]" style={{ color: "var(--app-text-faint)" }}>{outcome.targetPath ?? "Page path unavailable"}</p>
                      </td>
                      <td className="px-2 py-2">{formatDate(outcome.appliedAt)}</td>
                      <td className="px-2 py-2">{outcome.propertyName ?? outcome.property ?? "Not connected"}</td>
                      <td className="max-w-[290px] px-2 py-2">
                        <p className="m-0 mb-1 text-[10px]" style={{ color: "var(--app-text-faint)" }}>
                          {outcome.comparisonPeriod ? `${outcome.comparisonPeriod.startDate} – ${outcome.comparisonPeriod.endDate}` : "Period unavailable"}
                        </p>
                        {landingPageReadout(outcome, "comparison")}
                      </td>
                      <td className="max-w-[290px] px-2 py-2">
                        <p className="m-0 mb-1 text-[10px]" style={{ color: "var(--app-text-faint)" }}>
                          {outcome.currentPeriod ? `${outcome.currentPeriod.startDate} – ${outcome.currentPeriod.endDate}` : "Period unavailable"}
                        </p>
                        {landingPageReadout(outcome, "current")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {data.actionLandingPageOutcomes[0] && (
              <p className="mb-0 mt-2 text-[10px]" style={{ color: "var(--app-text-faint)" }}>
                {data.actionLandingPageOutcomes[0].disclosure}
              </p>
            )}
          </section>
        )}
        {(section === "summary" || section === "actions") && (
          <section
            className="overflow-x-auto rounded-xl border p-3"
            style={{ borderColor: "var(--app-border)" }}
          >
            <p className="m-0 text-xs font-bold">Tracked rank around applied SEO changes</p>
            <p className="m-0 mt-1 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
              Rank checks before and after an applied change are shown when a tracked keyword maps by its saved keyword or target URL. These comparisons are descriptive, not causal.
            </p>
            {data.actionRankOutcomes.length === 0 ? (
              <p className="mb-0 mt-3 text-xs" style={{ color: "var(--app-text-faint)" }}>
                No applied On-Page or Technical changes were recorded in this report period.
              </p>
            ) : (
              <table className="mt-2 w-full min-w-[820px] text-left text-xs">
                <thead style={{ color: "var(--app-text-faint)" }}>
                  <tr>
                    {[
                      "Applied change",
                      "Tracked keyword",
                      "Applied",
                      "Previous check",
                      "Latest after change",
                      "Observed movement",
                      "Crawl status",
                    ].map((heading) => (
                      <th key={heading} className="px-2 py-2 font-semibold">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.actionRankOutcomes.map((row) => (
                    <tr key={`${row.kind}:${row.actionId}`} className="border-t align-top" style={{ borderColor: "var(--app-border)" }}>
                      <td className="px-2 py-2">
                        <p className="m-0 font-semibold">{row.label}</p>
                        <p className="m-0 mt-1 max-w-[240px] truncate font-mono text-[10px]" style={{ color: "var(--app-text-faint)" }}>{row.targetUrl}</p>
                      </td>
                      <td className="px-2 py-2">{row.keyword ?? "Not mapped"}</td>
                      <td className="px-2 py-2">{formatDate(row.appliedAt)}</td>
                      <td className="px-2 py-2">
                        {row.baselineCheckedAt
                          ? `${row.baselineRank === null ? "Not in results" : `#${row.baselineRank}`} · ${formatDate(row.baselineCheckedAt)}`
                          : "No prior check"}
                      </td>
                      <td className="px-2 py-2">
                        {row.measuredAt
                          ? `${row.measuredRank === null ? "Not in results" : `#${row.measuredRank}`} · ${formatDate(row.measuredAt)}`
                          : "No later check"}
                      </td>
                      <td className="px-2 py-2">
                        {row.rankChange === null
                          ? row.state.replaceAll("_", " ")
                          : row.rankChange > 0
                            ? `Improved by ${row.rankChange} positions`
                            : row.rankChange < 0
                              ? `Declined by ${Math.abs(row.rankChange)} positions`
                              : "No observed movement"}
                      </td>
                      <td className="px-2 py-2">{row.verifiedAt ? `Verified by crawl · ${formatDate(row.verifiedAt)}` : "Not confirmed by crawl"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {data.actionRankOutcomes.length === 100 && (
              <p className="mb-0 mt-2 text-[10px]" style={{ color: "var(--app-text-faint)" }}>
                Showing the 100 most recently applied changes in this period.
              </p>
            )}
          </section>
        )}
        {(section === "summary" || section === "actions") && (
          <section
            className="overflow-x-auto rounded-xl border p-3"
            style={{ borderColor: "var(--app-border)" }}
          >
            <p className="m-0 text-xs font-bold">Saved outcome snapshots</p>
            <p className="m-0 mt-1 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
              These are immutable copies of the saved rank checks shown above. They preserve what was observed at capture time; they do not prove causation or exact page position.
            </p>
            {data.savedOutcomeSnapshots.length === 0 ? (
              <p className="mb-0 mt-3 text-xs" style={{ color: "var(--app-text-faint)" }}>
                No outcome snapshots have been saved yet.
              </p>
            ) : (
              <table className="mt-2 w-full min-w-[720px] text-left text-xs">
                <thead style={{ color: "var(--app-text-faint)" }}>
                  <tr>
                    {["Action", "Keyword", "Baseline", "Observed", "Captured"].map((heading) => (
                      <th key={heading} className="px-2 py-2 font-semibold">{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.savedOutcomeSnapshots.map((snapshot) => (
                    <tr key={snapshot.id} className="border-t align-top" style={{ borderColor: "var(--app-border)" }}>
                      <td className="px-2 py-2">
                        <p className="m-0 font-semibold">{snapshot.actionLabel}</p>
                        <p className="m-0 mt-1" style={{ color: "var(--app-text-faint)" }}>{snapshot.actionType.replaceAll("_", " ")}</p>
                      </td>
                      <td className="px-2 py-2">{snapshot.keyword ?? "Not linked"}</td>
                      <td className="px-2 py-2">
                        {snapshot.baselineCapturedAt
                          ? `${snapshot.baselineRank === null ? "Not in results" : `#${snapshot.baselineRank}`} · ${formatDate(snapshot.baselineCapturedAt)}`
                          : "No prior rank saved"}
                      </td>
                      <td className="px-2 py-2">
                        {snapshot.measuredRank === null ? "Not in results" : `#${snapshot.measuredRank}`} · {formatDate(snapshot.measuredAt)}
                      </td>
                      <td className="px-2 py-2">{formatDate(snapshot.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead style={{ color: "var(--app-text-faint)" }}>
              <tr>
                {[
                  "Metric",
                  "Baseline",
                  "Current",
                  "Change",
                  "Source",
                  "Freshness",
                  "Caveat",
                ].map((heading) => (
                  <th key={heading} className="px-3 py-2 font-semibold">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.map((metric) => (
                <tr
                  key={metric.key}
                  className="border-t align-top"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  <td className="px-3 py-2 font-semibold">{metric.label}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {format(metric.baseline, metric.unit)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {format(metric.current, metric.unit)}
                  </td>
                  <td className="px-3 py-2">
                    <Change metric={metric} />
                  </td>
                  <td
                    className="px-3 py-2"
                    style={{ color: "var(--app-text-muted)" }}
                  >
                    {metric.source}
                  </td>
                  <td className="px-3 py-2">
                    {metric.freshness ? formatDate(metric.freshness) : "—"}
                  </td>
                  <td
                    className="max-w-[260px] px-3 py-2"
                    style={{ color: "var(--app-text-faint)" }}
                  >
                    {metric.caveat}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {section === "visibility" && data.keywords.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-xs">
              <thead style={{ color: "var(--app-text-faint)" }}>
                <tr>
                  {[
                    "Keyword",
                    `Rank ${days} days ago`,
                    "Rank now",
                    "Last checked",
                  ].map((heading) => (
                    <th key={heading} className="px-3 py-2 font-semibold">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.keywords.map((row) => (
                  <tr
                    key={row.keyword}
                    className="border-t"
                    style={{ borderColor: "var(--app-border)" }}
                  >
                    <td className="px-3 py-2 font-semibold">{row.keyword}</td>
                    <td className="px-3 py-2">
                      {!row.baselineChecked
                        ? "Not checked"
                        : row.baseline === null
                          ? "Not found"
                          : `#${row.baseline}`}
                    </td>
                    <td className="px-3 py-2">
                      {!row.currentChecked
                        ? "Not checked"
                        : row.current === null
                          ? "Not found"
                          : `#${row.current}`}
                    </td>
                    <td className="px-3 py-2">
                      {row.checkedAt ? formatDate(row.checkedAt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );

  return (
    <main
      className="flex flex-col gap-5 p-5 md:p-7"
      style={{ color: "var(--app-text)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p
          className="m-0 max-w-3xl text-xs"
          style={{ color: "var(--app-text-muted)" }}
        >
          {data
            ? `Last ${data.period.days} days (${formatDate(data.period.currentFrom)} – ${formatDate(data.period.currentTo)}) compared with the ${data.period.days} days before. `
            : ""}
          Every figure comes from records Noxtill holds and shows its source and
          caveat. Changes are shown next to the SEO work done in the same period
          — that&rsquo;s correlation, not proof of cause. Scheduled report
          delivery isn&rsquo;t available for SEO yet.
        </p>
        <div className="flex gap-2">
          <select
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            className="rounded-lg border px-3 py-2 text-xs font-bold"
            style={{
              borderColor: "var(--app-border)",
              background: "var(--app-surface)",
            }}
            aria-label="Compare period"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button
            type="button"
            disabled={!data}
            onClick={() => data && exportCsv(data.metrics, days)}
            className="rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
            style={{ background: "var(--app-primary)" }}
          >
            Export CSV
          </button>
          <button
            type="button"
            disabled={
              !data ||
              saveSnapshots.isPending ||
              (!data.contentRankOutcomes.some((row) => row.measuredAt) &&
                !data.actionRankOutcomes.some((row) => row.measuredAt))
            }
            onClick={() => saveSnapshots.mutate()}
            className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-50"
            style={{ borderColor: "var(--app-border)" }}
          >
            {saveSnapshots.isPending ? "Saving…" : "Save measured outcomes"}
          </button>
        </div>
      </div>
      {saveSnapshots.isSuccess && (
        <p className="m-0 text-xs" style={{ color: "var(--app-success-text)" }}>
          Saved {saveSnapshots.data.createdCount} new outcome snapshot(s); {saveSnapshots.data.duplicateCount} already existed.
        </p>
      )}
      {saveSnapshots.isError && (
        <p className="m-0 text-xs" style={{ color: "var(--app-danger-strong)" }}>
          {errorMessage(saveSnapshots.error, "Couldn’t save outcome snapshots.")}
        </p>
      )}
      <section
        className="rounded-2xl border"
        style={{
          background: "var(--app-surface)",
          borderColor: "var(--app-border)",
        }}
      >
        <div
          role="tablist"
          className="flex flex-wrap gap-4 border-b px-4 pt-3"
          style={{ borderColor: "var(--app-border)" }}
        >
          {SECTIONS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={section === item.key}
              onClick={() => setSection(item.key)}
              className="border-b-2 pb-2.5 text-sm font-bold"
              style={{
                borderColor:
                  section === item.key ? "var(--app-primary)" : "transparent",
                color:
                  section === item.key
                    ? "var(--app-text)"
                    : "var(--app-text-faint)",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="p-4">{body}</div>
      </section>
    </main>
  );
}
