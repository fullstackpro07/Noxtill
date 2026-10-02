"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { fetchSeoReport, type RankBuckets, type ReportMetric, type ReportSection } from "@/lib/seo-reports-api";

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

function format(value: number | null, unit?: ReportMetric["unit"]) {
  if (value === null) return "—";
  return unit === "stars" ? `${value}★` : unit === "%" ? `${value}%` : String(value);
}

function Change({ metric }: { metric: ReportMetric }) {
  if (metric.baseline === null || metric.current === null) return <span style={{ color: "var(--app-text-faintest)" }}>No comparison</span>;
  const delta = Math.round((metric.current - metric.baseline) * 10) / 10;
  if (delta === 0) return <span style={{ color: "var(--app-text-faint)" }}>No change</span>;
  const good = metric.lowerIsBetter ? delta < 0 : delta > 0;
  return (
    <span className="font-semibold" style={{ color: good ? "var(--app-success-text)" : "var(--app-danger-strong)" }}>
      {delta > 0 ? "+" : ""}
      {delta}
    </span>
  );
}

function Card({ metric }: { metric: ReportMetric }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
      <p className="m-0 text-xs font-semibold" style={{ color: "var(--app-text-faint)" }}>{metric.label}</p>
      <p className="m-0 mt-1 text-2xl font-bold">{format(metric.current, metric.unit)}</p>
      <p className="m-0 mt-1 text-xs">
        <Change metric={metric} /> <span style={{ color: "var(--app-text-faintest)" }}>vs {format(metric.baseline, metric.unit)}</span>
      </p>
    </div>
  );
}

function Distribution({ label, buckets }: { label: string; buckets: RankBuckets }) {
  const total = BUCKETS.reduce((sum, bucket) => sum + buckets[bucket.key], 0);
  return (
    <div className="flex flex-col gap-1">
      <p className="m-0 text-xs font-bold">{label}</p>
      {BUCKETS.map((bucket) => (
        <div key={bucket.key} className="grid grid-cols-[80px_1fr_32px] items-center gap-2 text-xs">
          <span style={{ color: "var(--app-text-faint)" }}>{bucket.label}</span>
          <div className="h-2 rounded" style={{ background: "var(--app-surface-2)" }}>
            <div className="h-2 rounded" style={{ width: total ? `${(buckets[bucket.key] / total) * 100}%` : 0, background: "var(--app-primary)" }} />
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
    ...metrics.map((metric) => [metric.label, metric.baseline ?? "", metric.current ?? "", metric.source, metric.freshness ?? "", metric.caveat]),
  ];
  const blob = new Blob([rows.map((row) => row.map((cell) => escape(String(cell))).join(",")).join("\n")], { type: "text/csv" });
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
  const query = useQuery({ queryKey: ["seo-report", days], queryFn: () => fetchSeoReport(days) });
  const data = query.data;
  const metrics = (data?.metrics ?? []).filter((metric) => section === "summary" || metric.section === section);
  const summaryKeys = ["keywords_top10", "audit_issues", "content_published", "actions_completed"];

  let body: ReactNode;
  if (query.isLoading) body = <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading…</p>;
  else if (query.isError || !data)
    body = (
      <div className="flex items-center gap-3 text-sm" style={{ color: "var(--app-danger-strong)" }}>
        {errorMessage(query.error, "Couldn't load the report.")}
        <button type="button" onClick={() => query.refetch()} className="font-bold underline">Retry</button>
      </div>
    );
  else
    body = (
      <div className="flex flex-col gap-4">
        {section === "summary" && (
          <>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {data.metrics.filter((metric) => summaryKeys.includes(metric.key)).map((metric) => <Card key={metric.key} metric={metric} />)}
            </div>
            <div className="rounded-xl border p-3 text-xs" style={{ borderColor: "var(--app-border)" }}>
              <p className="m-0 font-bold">Not tracked</p>
              <ul className="m-0 mt-1 list-disc ps-5" style={{ color: "var(--app-text-muted)" }}>
                {data.notTracked.map((row) => <li key={row.label}><strong>{row.label}:</strong> {row.reason}</li>)}
              </ul>
            </div>
          </>
        )}
        {section === "visibility" && (
          <div className="grid gap-4 md:grid-cols-2">
            <Distribution label={`Rank distribution — end of previous ${days} days`} buckets={data.rankDistribution.baseline} />
            <Distribution label="Rank distribution — now" buckets={data.rankDistribution.current} />
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead style={{ color: "var(--app-text-faint)" }}>
              <tr>{["Metric", "Baseline", "Current", "Change", "Source", "Freshness", "Caveat"].map((heading) => <th key={heading} className="px-3 py-2 font-semibold">{heading}</th>)}</tr>
            </thead>
            <tbody>
              {metrics.map((metric) => (
                <tr key={metric.key} className="border-t align-top" style={{ borderColor: "var(--app-border)" }}>
                  <td className="px-3 py-2 font-semibold">{metric.label}</td>
                  <td className="px-3 py-2 tabular-nums">{format(metric.baseline, metric.unit)}</td>
                  <td className="px-3 py-2 tabular-nums">{format(metric.current, metric.unit)}</td>
                  <td className="px-3 py-2"><Change metric={metric} /></td>
                  <td className="px-3 py-2" style={{ color: "var(--app-text-muted)" }}>{metric.source}</td>
                  <td className="px-3 py-2">{metric.freshness ? formatDate(metric.freshness) : "—"}</td>
                  <td className="max-w-[260px] px-3 py-2" style={{ color: "var(--app-text-faint)" }}>{metric.caveat}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {section === "visibility" && data.keywords.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-xs">
              <thead style={{ color: "var(--app-text-faint)" }}>
                <tr>{["Keyword", `Rank ${days} days ago`, "Rank now", "Last checked"].map((heading) => <th key={heading} className="px-3 py-2 font-semibold">{heading}</th>)}</tr>
              </thead>
              <tbody>
                {data.keywords.map((row) => (
                  <tr key={row.keyword} className="border-t" style={{ borderColor: "var(--app-border)" }}>
                    <td className="px-3 py-2 font-semibold">{row.keyword}</td>
                    <td className="px-3 py-2">{!row.baselineChecked ? "Not checked" : row.baseline === null ? "Not found" : `#${row.baseline}`}</td>
                    <td className="px-3 py-2">{!row.currentChecked ? "Not checked" : row.current === null ? "Not found" : `#${row.current}`}</td>
                    <td className="px-3 py-2">{row.checkedAt ? formatDate(row.checkedAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );

  return (
    <main className="flex flex-col gap-5 p-5 md:p-7" style={{ color: "var(--app-text)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="m-0 max-w-3xl text-xs" style={{ color: "var(--app-text-muted)" }}>
          {data
            ? `Last ${data.period.days} days (${formatDate(data.period.currentFrom)} – ${formatDate(data.period.currentTo)}) compared with the ${data.period.days} days before. `
            : ""}
          Every figure comes from records Noxtill holds and shows its source and caveat. Changes are shown next to the SEO work done in the same period — that&rsquo;s correlation, not proof of cause. Scheduled report delivery
          isn&rsquo;t available for SEO yet.
        </p>
        <div className="flex gap-2">
          <select value={days} onChange={(event) => setDays(Number(event.target.value))} className="rounded-lg border px-3 py-2 text-xs font-bold" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }} aria-label="Compare period">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button type="button" disabled={!data} onClick={() => data && exportCsv(data.metrics, days)} className="rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>
            Export CSV
          </button>
        </div>
      </div>
      <section className="rounded-2xl border" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
        <div role="tablist" className="flex flex-wrap gap-4 border-b px-4 pt-3" style={{ borderColor: "var(--app-border)" }}>
          {SECTIONS.map((item) => (
            <button key={item.key} type="button" role="tab" aria-selected={section === item.key} onClick={() => setSection(item.key)} className="border-b-2 pb-2.5 text-sm font-bold" style={{ borderColor: section === item.key ? "var(--app-primary)" : "transparent", color: section === item.key ? "var(--app-text)" : "var(--app-text-faint)" }}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="p-4">{body}</div>
      </section>
    </main>
  );
}
