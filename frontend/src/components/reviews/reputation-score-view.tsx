"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { fetchReputationScore, type ReputationScoreComponents, type ReputationScoreResult } from "@/lib/reviews-api";
import { formatDate } from "@/lib/format";

const COMPONENT_LABEL: Record<keyof ReputationScoreComponents, string> = { rating: "Rating", volume: "Volume", recency: "Recency", responseRate: "Response" };
const IMPROVE: Record<keyof ReputationScoreComponents, { what: string; impact: string; href: string }> = {
  rating: { what: "Reply to your lowest-rated reviews", impact: "A thoughtful public reply often matters as much as the rating itself", href: "/reviews" },
  volume: { what: "Send more review requests", impact: "More recent review volume", href: "/reviews/requests" },
  recency: { what: "Put a QR poster up or send a fresh batch of requests", impact: "It's been a while since your last review", href: "/reviews/rating-page" },
  responseRate: { what: "Reply to unreplied reviews", impact: "Improves response coverage", href: "/reviews" },
};

function downloadCsv(data: ReputationScoreResult) {
  const header = "Component,Score,Weight\n";
  const body = (Object.keys(data.components) as (keyof ReputationScoreComponents)[]).map((k) => `${COMPONENT_LABEL[k]},${data.components[k].toFixed(2)},${data.weights[k]}`).join("\n");
  const blob = new Blob([`Overall Score,${data.score}\n\n${header}${body}`], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reputation-score-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };
const primaryBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };

export function ReputationScoreView() {
  const router = useRouter();
  const [methodOpen, setMethodOpen] = useState(false);
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["reputation-score"], queryFn: fetchReputationScore });

  if (isPending || !data) {
    return (
      <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
        <div className="h-24 animate-pulse rounded-[16px]" style={{ background: "var(--app-surface-2)" }} />
      </main>
    );
  }
  if (isError) {
    return (
      <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
        <div className="rounded-[16px] p-[48px_20px] text-center" style={{ background: "var(--app-surface)", border: "1px solid #FDD9D6" }}>
          <p className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-danger-strong)" }}>Couldn&apos;t load the reputation score</p>
          <button type="button" onClick={() => refetch()} className="mt-4" style={outlineBtn}>Retry</button>
        </div>
      </main>
    );
  }

  const componentKeys = Object.keys(COMPONENT_LABEL) as (keyof ReputationScoreComponents)[];
  const prevScore = data.trend.length >= 2 ? data.trend[data.trend.length - 2].totalScore : null;
  const trendLabel = prevScore != null ? `${data.score >= prevScore ? "▲" : "▼"} ${Math.abs(Math.round(((data.score - prevScore) / (prevScore || 1)) * 100))}% vs last period` : null;
  const weakest = componentKeys.filter((k) => data.components[k] < data.weights[k] * 0.6).sort((a, b) => data.components[a] - data.components[b]);

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Reputation Score</h2>
        <span className="flex items-baseline gap-2">
          <span className="text-[26px] font-extrabold" style={{ color: "var(--app-primary)", letterSpacing: "-.8px" }}>{data.score.toFixed(0)}</span>
          {trendLabel && <span className="text-[12px] font-bold" style={{ color: "var(--app-success-text)" }}>{trendLabel}</span>}
        </span>
        <div className="ml-auto flex flex-wrap gap-[9px]">
          <button type="button" onClick={() => setMethodOpen(true)} style={outlineBtn}>How this is calculated</button>
          <button type="button" onClick={() => downloadCsv(data)} style={outlineBtn}>Export</button>
          <button type="button" onClick={() => refetch()} style={primaryBtn}>Refresh</button>
        </div>
      </div>

      <div className="rounded-[12px] p-[11px_14px] text-[12px]" style={{ background: "var(--app-warning-bg)", border: "1px solid var(--app-warning-border)", color: "#93370D" }}>
        This is Noxtill&apos;s own internal measure of your review activity — not an external certification or industry rating.
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(175px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1.5px solid var(--app-success-border)" }}>
          <div className="text-[12px] font-bold" style={{ color: "var(--app-success-text)" }}>Overall Score</div>
          <div className="mt-[5px] text-[26px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.7px" }}>{data.score.toFixed(0)} <span className="text-[12px] font-semibold" style={{ color: "var(--app-text-disabled)" }}>/ 100</span></div>
        </div>
        {componentKeys.map((k) => (
          <div key={k} className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>{COMPONENT_LABEL[k]} Component</div>
            <div className="mt-[5px] text-[20px] font-extrabold" style={{ color: "var(--app-text)" }}>{data.components[k].toFixed(1)} / {data.weights[k]}</div>
            <div className="mt-2 h-[7px] overflow-hidden rounded-[6px]" style={{ background: "var(--app-surface-2)" }}>
              <div className="h-full rounded-[6px]" style={{ width: `${Math.min(100, (data.components[k] / data.weights[k]) * 100)}%`, background: "var(--app-primary)" }} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid items-start gap-[15px]" style={{ gridTemplateColumns: "minmax(0,1fr) 340px" }}>
        <div className="min-w-0 rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-1.5 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Score trend</h3>
          {data.trend.length < 2 ? (
            <p className="m-0 py-8 text-center text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Not enough weekly history yet to chart a trend.</p>
          ) : (
            <ScoreTrendChart trend={data.trend} />
          )}
        </div>
        <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-3 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Component contribution</h3>
          <div className="flex flex-col gap-[11px]">
            {componentKeys.map((k) => (
              <div key={k}>
                <div className="mb-[5px] flex justify-between">
                  <span className="text-[12.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{COMPONENT_LABEL[k]}</span>
                  <span className="text-[11.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{data.components[k].toFixed(1)} / {data.weights[k]}</span>
                </div>
                <div className="h-[9px] overflow-hidden rounded-[6px]" style={{ background: "var(--app-surface-2)" }}>
                  <div className="h-full rounded-[6px]" style={{ width: `${Math.min(100, (data.components[k] / data.weights[k]) * 100)}%`, background: "var(--app-primary)" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {weakest.length > 0 && (
        <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}><h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Improvement actions</h3></div>
          <table className="w-full border-collapse">
            <thead>
              <tr style={{ background: "var(--app-surface-2)" }}>
                <th className="p-[10px_17px] text-left text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>What to do</th>
                <th className="p-[10px] text-left text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Expected impact</th>
                <th className="p-[10px_17px] text-right text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Go</th>
              </tr>
            </thead>
            <tbody>
              {weakest.map((k) => (
                <tr key={k} style={{ borderTop: "1px solid var(--app-surface-2)" }}>
                  <td className="p-3 pl-[17px] text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{IMPROVE[k].what}</td>
                  <td className="p-3 text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{IMPROVE[k].impact}</td>
                  <td className="p-3 pr-[17px] text-right">
                    <button type="button" onClick={() => router.push(IMPROVE[k].href)} className="rounded-[9px] px-[13px] py-2 text-[11.5px] font-bold" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-success-text)" }}>Open</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-[11px_17px] text-[11.5px]" style={{ borderTop: "1px solid var(--app-surface-2)", color: "var(--app-text-disabled)" }}>Impacts are directional guidance from your own data — not guaranteed results.</div>
        </div>
      )}

      {methodOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-5" style={{ background: "rgba(10,27,42,.42)" }} onClick={() => setMethodOpen(false)}>
          <div className="w-[490px] max-w-full rounded-[18px]" style={{ background: "var(--app-surface)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 p-[17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
              <h3 className="m-0 flex-1 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>How the Score Works</h3>
              <button type="button" onClick={() => setMethodOpen(false)} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-[9px]" style={{ border: "1px solid var(--app-border)" }}>×</button>
            </div>
            <div className="flex flex-col gap-3 p-[17px]">
              <div className="rounded-[12px] p-3 text-[12px]" style={{ background: "var(--app-warning-bg)", border: "1px solid var(--app-warning-border)", color: "#93370D" }}>
                This is Noxtill&apos;s own internal measure — not an external certification, accreditation or industry rating.
              </div>
              <div>
                <div className="mb-2.5 text-[11px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>Components &amp; weighting</div>
                {componentKeys.map((k) => (
                  <div key={k} className="flex justify-between p-2 pb-2" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
                    <span className="text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{COMPONENT_LABEL[k]} — up to {data.weights[k]} points</span>
                    <span className="text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{data.components[k].toFixed(1)}</span>
                  </div>
                ))}
              </div>
              <p className="m-0 text-[12.5px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
                Rating is your average across all reviews. Volume counts toward a target of 50 reviews. Recency fades to 0 after 90 days since your last review. Response rate is the share of reviews you&apos;ve replied to. This is separate from your Business Health Score on the Dashboard.
              </p>
            </div>
            <div className="flex justify-end p-[14px_17px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
              <button type="button" onClick={() => setMethodOpen(false)} style={primaryBtn}>Got it</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function ScoreTrendChart({ trend }: { trend: ReputationScoreResult["trend"] }) {
  const width = 620;
  const height = 132;
  const scores = trend.map((t) => t.totalScore);
  const min = Math.min(...scores, 0);
  const max = Math.max(...scores, 100);
  const span = max - min || 1;
  const step = (width - 68) / (trend.length - 1);
  const pts = trend.map((t, i) => ({ x: 34 + i * step, y: 14 + 100 * (1 - (t.totalScore - min) / span) }));
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1].x.toFixed(1)} 114 L${pts[0].x.toFixed(1)} 114 Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" style={{ height }}>
      <path d={area} fill="rgba(18,161,80,.10)" />
      <path d={line} fill="none" stroke="var(--app-primary)" strokeWidth={2.4} strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3.2} fill="#fff" stroke="var(--app-primary)" strokeWidth={1.8} />
      ))}
      {trend.map((t, i) => (
        <text key={t.weekEnding} x={pts[i].x} y={128} textAnchor="middle" fontSize={10.5} fill="var(--app-text-faintest)" fontWeight={600}>{formatDate(t.weekEnding)}</text>
      ))}
    </svg>
  );
}
