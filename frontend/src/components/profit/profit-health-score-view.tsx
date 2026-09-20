"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { HelpCircle, Settings2 } from "lucide-react";
import { HealthScoreWeightsDialog } from "@/components/dashboard/health-score-weights-dialog";
import {
  fetchHealthScore,
  HEALTH_SCORE_COMPONENT_LABEL,
  HEALTH_SCORE_PERIOD_MONTHS,
  type HealthScoreComponents,
  type HealthScorePeriodMonths,
} from "@/lib/health-score-api";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";

const selectStyle: React.CSSProperties = {
  border: "1px solid var(--app-border)",
  background: "var(--app-surface)",
  color: "var(--app-text-muted)",
  borderRadius: 11,
  padding: "10px 12px",
  fontSize: 12.5,
  fontWeight: 600,
  minHeight: 44,
};

const outlineBtnStyle: React.CSSProperties = {
  border: "1px solid var(--app-border)",
  background: "var(--app-surface)",
  borderRadius: 11,
  padding: "11px 15px",
  fontSize: 12.5,
  fontWeight: 700,
  color: "var(--app-text-muted)",
  minHeight: 44,
};

const PERIOD_LABEL: Record<HealthScorePeriodMonths, string> = { 3: "Last 6 months", 6: "Last 12 months", 12: "This year" };

const COMPONENT_EXPLANATION: Record<keyof HealthScoreComponents, string> = {
  ratingTrend: "Average review rating over the last 6 months, scaled from the 1-5 star scale. No reviews yet scores 0.",
  repeatCustomerRate: "% of customers with more than one visit, among customers with at least one visit.",
  margin: "Net margin for the current calendar month, scaled so 25%+ net margin scores 100.",
  creditRecovery: "Amount recovered vs. amount extended on credit in the window. Nothing extended scores 100.",
};

const COMPONENT_ACTION: Record<keyof HealthScoreComponents, { label: string; href: string; note: string }> = {
  ratingTrend: { label: "Respond to reviews and ask happy customers for feedback", href: "/reviews", note: "Rating trend is low" },
  repeatCustomerRate: { label: "Message at-risk customers to bring them back", href: "/profit/customer-analytics", note: "Repeat rate is low" },
  margin: { label: "Review pricing on your low-margin products", href: "/profit/product-profitability", note: "Margin is low" },
  creditRecovery: { label: "Follow up on outstanding credit balances", href: "/credit", note: "Credit recovery is low" },
};

function linePath(vals: number[], W = 620, PH = 108, T = 14) {
  const n = vals.length;
  const min = Math.min(0, ...vals);
  const max = Math.max(...vals, min + 1);
  const x = (i: number) => 34 + i * ((W - 48) / Math.max(1, n - 1));
  const y = (v: number) => T + PH * (1 - (v - min) / (max - min));
  const pts = vals.map((v, i) => ({ x: +x(i).toFixed(1), y: +y(v).toFixed(1) }));
  const line = pts.map((p, i) => (i ? "L" : "M") + p.x + " " + p.y).join(" ");
  const area = `${line} L${pts[n - 1].x} ${T + PH} L${pts[0].x} ${T + PH} Z`;
  return { pts, line, area };
}

export function ProfitHealthScoreView() {
  const session = useSession();
  const isOwner = session.user.role === "owner";
  const [periodMonths, setPeriodMonths] = useState<HealthScorePeriodMonths>(3);
  const [weightsOpen, setWeightsOpen] = useState(false);
  const [methodologyOpen, setMethodologyOpen] = useState(false);

  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["health-score", periodMonths], queryFn: () => fetchHealthScore(periodMonths) });

  if (isError) {
    return (
      <div className="mx-6 mt-6 rounded-[16px] p-6 text-center" style={{ background: "var(--app-surface)", border: "1px solid #FDD9D6" }}>
        <p className="m-0 text-[14.5px] font-extrabold" style={{ color: "#B42318" }}>Unable to load health score</p>
        <button type="button" onClick={() => refetch()} className="mt-3 rounded-[12px] px-5 py-2.5 text-[13px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>Retry</button>
      </div>
    );
  }

  if (isPending || !data) {
    return (
      <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
        <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(175px,1fr))" }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-[86px] animate-pulse rounded-[14px]" style={{ background: "var(--app-surface-2)" }} />
          ))}
        </div>
      </main>
    );
  }

  if (data.building) {
    return (
      <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
        <div className="rounded-[16px] p-10 text-center" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <p className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>{data.message}</p>
          <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Ready in {data.daysUntilReady} day{data.daysUntilReady === 1 ? "" : "s"}.</p>
        </div>
      </main>
    );
  }

  const componentKeys = Object.keys(HEALTH_SCORE_COMPONENT_LABEL) as (keyof HealthScoreComponents)[];
  const delta = data.history.length >= 2 ? data.history[data.history.length - 1].totalScore - data.history[data.history.length - 2].totalScore : null;
  const scoreVals = data.history.map((h) => h.totalScore);
  const chart = scoreVals.length >= 2 ? linePath(scoreVals) : null;

  const actions = componentKeys
    .filter((key) => data.weights[key] > 0 && data.components[key] / data.weights[key] < 0.6)
    .map((key) => ({ key, ...COMPONENT_ACTION[key] }));

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-baseline gap-2.5">
          <span className="text-[38px] font-extrabold" style={{ color: "#12A150", letterSpacing: "-1.4px", lineHeight: 1 }}>{Math.round(data.score)}</span>
          {delta !== null && (
            <span className="text-[13px] font-extrabold" style={{ color: "#0E8442" }}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}</span>
          )}
          <span className="text-[12px] font-semibold" style={{ color: "var(--app-text-disabled)" }}>of 100</span>
        </span>
        <select
          value={PERIOD_LABEL[periodMonths]}
          onChange={(e) => {
            if (e.target.value.indexOf("+ Add") === 0) { toast.info("Custom option builder — not available yet."); return; }
            const entry = (Object.entries(PERIOD_LABEL) as unknown as [string, string][]).find(([, label]) => label === e.target.value);
            if (entry) setPeriodMonths(Number(entry[0]) as HealthScorePeriodMonths);
          }}
          aria-label="Period"
          style={selectStyle}
        >
          {HEALTH_SCORE_PERIOD_MONTHS.map((m) => (
            <option key={m}>{PERIOD_LABEL[m]}</option>
          ))}
          <option>+ Add your own…</option>
        </select>
        <div className="ml-auto flex flex-wrap gap-[9px]">
          <button type="button" onClick={() => setMethodologyOpen(true)} className="flex items-center gap-1.5" style={outlineBtnStyle}>
            <HelpCircle className="h-3.5 w-3.5" aria-hidden />
            How this works
          </button>
          {isOwner && (
            <button type="button" onClick={() => setWeightsOpen(true)} className="flex items-center gap-1.5 rounded-[11px] text-[12.5px] font-extrabold text-white" style={{ background: "var(--app-primary)", padding: "11px 18px", minHeight: 44 }}>
              <Settings2 className="h-3.5 w-3.5" aria-hidden />
              Adjust Weights
            </button>
          )}
        </div>
      </div>

      <div className="rounded-[12px] p-[12px_14px] text-[12px]" style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", color: "#93370D" }}>
        This is Noxtill&apos;s own internal measure built from your own real data — not an external certification or industry benchmark.
      </div>

      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(175px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1.5px solid #BFE7CF" }}>
          <div className="text-[12px] font-bold" style={{ color: "#0E8442" }}>Score</div>
          <div className="mt-1.5 text-[24px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.6px" }}>{Math.round(data.score)}</div>
        </div>
        {componentKeys.map((key) => (
          <div key={key} className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faint)" }}>{HEALTH_SCORE_COMPONENT_LABEL[key]}</div>
            <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{data.components[key].toFixed(1)}</div>
            <div className="mt-1 text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>of {data.weights[key]}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-[15px]" style={{ gridTemplateColumns: "minmax(0,1fr) 340px", alignItems: "start" }}>
        <div className="min-w-0 rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-1.5 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Score history</h3>
          {!chart ? (
            <div className="flex h-[134px] items-center justify-center text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Not enough history yet.</div>
          ) : (
            <svg viewBox="0 0 620 134" style={{ width: "100%", height: 134, display: "block" }}>
              <path d={chart.area} fill="rgba(18,161,80,.10)" />
              <path d={chart.line} fill="none" stroke="#12A150" strokeWidth={2.4} strokeLinejoin="round" />
              {chart.pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3.2} fill="#fff" stroke="#12A150" strokeWidth={1.8} />
              ))}
              {data.history.map((h, i) => (
                (i === 0 || i === data.history.length - 1 || i === Math.floor(data.history.length / 2)) && (
                  <text key={h.capturedAt} x={chart.pts[i].x} y={130} textAnchor="middle" fontSize={10.5} fill="#667085" fontWeight={600}>
                    {new Date(h.capturedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </text>
                )
              ))}
            </svg>
          )}
        </div>
        <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-3 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Component contribution</h3>
          <div className="flex flex-col gap-[11px]">
            {componentKeys.map((key) => {
              const max = data.weights[key];
              const value = data.components[key];
              const fraction = max > 0 ? Math.min(1, value / max) : 0;
              return (
                <div key={key}>
                  <div className="mb-[5px] flex justify-between">
                    <span className="text-[12.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{HEALTH_SCORE_COMPONENT_LABEL[key]}</span>
                    <span className="text-[11.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{value.toFixed(1)} / {max}</span>
                  </div>
                  <div className="h-[9px] overflow-hidden rounded-[6px]" style={{ background: "var(--app-surface-2)" }}>
                    <div className="h-full rounded-[6px]" style={{ width: `${fraction * 100}%`, background: "#12A150" }} />
                  </div>
                  <div className="mt-1 text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>weight {max}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div style={{ padding: "13px 17px", borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Improvement actions</h3>
        </div>
        {actions.length === 0 ? (
          <div className="text-center" style={{ padding: "40px 18px" }}>
            <p className="m-0 text-[13px] font-bold" style={{ color: "var(--app-text-muted)" }}>Every component is scoring reasonably well right now.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 700 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Action</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Expected impact</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Go</th>
                </tr>
              </thead>
              <tbody>
                {actions.map((a) => (
                  <tr key={a.key} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                    <td style={{ padding: "12px 17px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text)" }}>{a.label}</td>
                    <td style={{ padding: 12, fontSize: 12, color: "var(--app-text-faint)" }}>Directional — {a.note.toLowerCase()}</td>
                    <td style={{ padding: "12px 17px", textAlign: "right" }}>
                      <Link
                        href={a.href}
                        className="inline-block rounded-[9px] text-[11.5px] font-bold"
                        style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "#0E8442", padding: "8px 12px", minHeight: 40 }}
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="m-0 text-[11.5px]" style={{ padding: "11px 17px", borderTop: "1px solid var(--app-surface-2)", color: "var(--app-text-disabled)" }}>
          Every action here is directional — the change should help but isn&apos;t quantified into a specific point estimate.
        </p>
      </div>

      <HealthScoreWeightsDialog open={weightsOpen} onClose={() => setWeightsOpen(false)} weights={data.weights} />
      {methodologyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5" style={{ background: "rgba(10,27,42,.42)" }} onClick={() => setMethodologyOpen(false)}>
          <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="w-full max-w-[490px] max-h-[88vh] overflow-y-auto rounded-[18px]" style={{ background: "var(--app-surface)", boxShadow: "0 30px 80px rgba(10,27,42,.32)" }}>
            <div className="p-[17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
              <h3 className="m-0 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>How this works</h3>
            </div>
            <div className="flex flex-col gap-3 p-[17px]">
              <p className="m-0 rounded-[12px] p-3 text-[12px]" style={{ background: "#FFFBF2", color: "#93370D" }}>
                This is Noxtill&apos;s own internal measure, built from your own real data — not an external certification or industry benchmark.
              </p>
              {componentKeys.map((key) => (
                <p key={key} className="m-0 text-[12px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
                  <span className="font-bold" style={{ color: "var(--app-text)" }}>{HEALTH_SCORE_COMPONENT_LABEL[key]}: </span>
                  {COMPONENT_EXPLANATION[key]}
                </p>
              ))}
              <p className="m-0 text-[12.5px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
                Each component is scored 0-100 first, then scaled by its weight (default 25 each) to produce a total out of 100.
              </p>
              <div className="rounded-[11px] p-3" style={{ background: "var(--app-surface-2)" }}>
                <p className="m-0 text-[12px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
                  Below 14 days of business history, no score is shown at all — a low score from thin data would be misleading.
                </p>
              </div>
            </div>
            <div className="flex justify-end p-[14px_17px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
              <button type="button" onClick={() => setMethodologyOpen(false)} className="rounded-[10px] px-4 py-2.5 text-[12.5px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>Got it</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
