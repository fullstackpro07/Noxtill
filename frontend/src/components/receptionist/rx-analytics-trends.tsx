"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { fetchVoiceAnalyticsTrends, type VoiceTrendRow } from "@/lib/voice-analytics-trends-api";
import { Card, CardHead } from "./rx-ui";

type Metric = { key: keyof VoiceTrendRow; title: string; format: (v: number) => string };

const METRICS: Metric[] = [
  { key: "calls", title: "Calls", format: (v) => String(v) },
  { key: "missed", title: "Missed", format: (v) => String(v) },
  { key: "humanConnected", title: "Human connected", format: (v) => String(v) },
  { key: "complianceBlockedRate", title: "Compliance blocked rate", format: (v) => `${Math.round(v * 100)}%` },
];

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");

/** One single-series bar chart; hovering a day shows its value (no colour-only encoding). */
function MiniBars({ rows, metric }: { rows: VoiceTrendRow[]; metric: Metric }) {
  const [hover, setHover] = useState<number | null>(null);
  const values = rows.map((row) => row[metric.key] as number | null);
  const max = Math.max(0, ...values.map((v) => v ?? 0)) || 1;
  const shown = hover != null ? rows[hover] : null;
  const shownValue = hover != null ? values[hover] : null;
  return (
    <div className="min-w-0 rounded-[10px] border border-[#E6E8EC] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11.5px] font-bold text-[#334155]">{metric.title}</span>
        <span className="text-[10.5px] tabular-nums text-[#667085]">
          {shown ? `${shown.day}: ${shownValue == null ? "no data" : metric.format(shownValue)}` : "Hover a day"}
        </span>
      </div>
      <div className="mt-2 flex h-[72px] items-end gap-[2px] border-b border-[#E6E8EC]" onMouseLeave={() => setHover(null)}>
        {values.map((value, i) => (
          <div
            key={rows[i].day}
            className="flex h-full min-w-[3px] flex-1 cursor-default items-end"
            onMouseEnter={() => setHover(i)}
            aria-label={`${rows[i].day}: ${value == null ? "no data" : metric.format(value)}`}
          >
            <div
              className="w-full rounded-t-[3px]"
              style={{
                height: value == null ? 0 : `${Math.max(2, (value / max) * 100)}%`,
                background: hover === i ? "#15803D" : "#16A34A",
                opacity: hover == null || hover === i ? 1 : 0.55,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[9.5px] text-[color:var(--app-text-faintest,#667085)]">
        <span>{rows[0]?.day ?? ""}</span>
        <span>{rows.at(-1)?.day ?? ""}</span>
      </div>
    </div>
  );
}

/** Call Analytics trends from stored facts, with a table view and the metric glossary. */
export function AnalyticsTrendsCard() {
  const [days, setDays] = useState(30);
  const [table, setTable] = useState(false);
  const query = useQuery({ queryKey: ["voice-analytics-trends", days], queryFn: () => fetchVoiceAnalyticsTrends(days), retry: false });
  if (query.error instanceof ApiError && query.error.status === 403) return null;

  return (
    <Card overflow>
      <CardHead
        icon="chart-no-axes-combined"
        title="Trends"
        sub={query.data ? `Daily, ${query.data.timeZone} · ${query.data.dataLag}` : "Daily figures from saved calls"}
        right={
          <div className="flex items-center gap-2">
            <select aria-label="Trend window" value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-8 rounded-[8px] border border-[#D5DAE2] bg-white px-2 text-[12px] font-semibold">
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
            <button type="button" onClick={() => setTable((t) => !t)} className="h-8 cursor-pointer rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 text-[12px] font-bold text-[#475569]">
              {table ? "Charts" : "Table"}
            </button>
          </div>
        }
      />
      {query.isPending ? (
        <p className="m-0 p-[18px] text-[12px] text-[color:var(--app-text-faintest,#667085)]">Loading trends…</p>
      ) : query.isError ? (
        <p className="m-0 p-[18px] text-[12px] text-[#B42318]">{query.error.message}</p>
      ) : !query.data.series.length ? (
        <p className="m-0 p-[18px] text-[12px] text-[color:var(--app-text-faintest,#667085)]">No calls or compliance checks in this window.</p>
      ) : (
        <div className="flex flex-col gap-3 p-[18px]">
          <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
            {[
              ["Handled fully by AI", `${query.data.totals.aiContained} (${pct(query.data.totals.aiContained, query.data.totals.calls)})`],
              ["AI-only minutes", String(query.data.totals.aiOnlyMinutes)],
              ["Human-involved minutes", String(query.data.totals.humanInvolvedMinutes)],
              ["Cost per priced call", query.data.totals.pricedCalls ? (query.data.totals.pricedCost / query.data.totals.pricedCalls).toFixed(4) : "Not priced yet"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[9px] bg-[#F7F9FB] p-2.5">
                <div className="text-[15px] font-extrabold tabular-nums text-[#101828]">{value}</div>
                <div className="text-[10.5px] text-[#667085]">{label}</div>
              </div>
            ))}
          </div>
          {table ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-[11px] tabular-nums">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-[.06em] text-[color:var(--app-text-faintest,#667085)]">
                    {["Day", "Calls", "Missed", "Transferred", "AI contained", "Human", "AI min", "Human min", "Cost/priced call", "Quality", "Blocked"].map((h) => (
                      <th key={h} className="border-b border-[#EEF0F3] px-2 py-1.5 font-bold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {query.data.series.map((r) => (
                    <tr key={r.day} className="border-b border-[#F3F4F7]">
                      <td className="px-2 py-1.5">{r.day}</td>
                      <td className="px-2 py-1.5">{r.calls}</td>
                      <td className="px-2 py-1.5">{r.missed}</td>
                      <td className="px-2 py-1.5">{r.transferred}</td>
                      <td className="px-2 py-1.5">{r.aiContained}</td>
                      <td className="px-2 py-1.5">{r.humanConnected}</td>
                      <td className="px-2 py-1.5">{r.aiOnlyMinutes}</td>
                      <td className="px-2 py-1.5">{r.humanInvolvedMinutes}</td>
                      <td className="px-2 py-1.5">{r.costPerPricedCall == null ? "—" : r.costPerPricedCall.toFixed(4)}</td>
                      <td className="px-2 py-1.5">{r.averageQualityScore == null ? "—" : r.averageQualityScore.toFixed(0)}</td>
                      <td className="px-2 py-1.5">{r.complianceBlockedRate == null ? "—" : `${Math.round(r.complianceBlockedRate * 100)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {METRICS.map((metric) => (
                <MiniBars key={metric.key} rows={query.data.series} metric={metric} />
              ))}
            </div>
          )}
          <details className="text-[11px] text-[#475569]">
            <summary className="cursor-pointer font-bold">How each figure is calculated</summary>
            <dl className="mb-0 mt-2 grid gap-1.5">
              {query.data.glossary.map((g) => (
                <div key={g.metric}>
                  <dt className="inline font-bold">{g.metric}: </dt>
                  <dd className="m-0 inline">{g.definition}</dd>
                </div>
              ))}
            </dl>
          </details>
        </div>
      )}
    </Card>
  );
}
