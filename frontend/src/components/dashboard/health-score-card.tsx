"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Settings2, Sparkles } from "lucide-react";
import { ErrorBanner } from "@/components/shared/error-states";
import { useSession } from "@/lib/session";
import { formatDate } from "@/lib/format";
import {
  fetchHealthScore,
  HEALTH_SCORE_COMPONENT_LABEL,
  HEALTH_SCORE_PERIOD_MONTHS,
  type HealthScoreComponents,
  type HealthScorePeriodMonths,
  type HealthScoreReady,
} from "@/lib/health-score-api";
import { HealthScoreTrendChart } from "./health-score-trend-chart";
import { HealthScoreWeightsDialog } from "./health-score-weights-dialog";

const COMPONENT_COLOR: Record<keyof HealthScoreComponents, string> = {
  ratingTrend: "#12A150",
  repeatCustomerRate: "#2563EB",
  margin: "#9333EA",
  creditRecovery: "#F97316",
};

function exportToCsv(result: HealthScoreReady) {
  const lines = [
    "date,old_score,new_score,rating_trend_before,repeat_customer_before,margin_before,credit_recovery_before",
    ...result.changeLog.map((entry) =>
      [
        entry.date,
        entry.oldScore,
        entry.newScore,
        entry.oldWeights.ratingTrend,
        entry.oldWeights.repeatCustomerRate,
        entry.oldWeights.margin,
        entry.oldWeights.creditRecovery,
      ].join(","),
    ),
    "",
    "week,total_score,rating_trend,repeat_customer_rate,margin,credit_recovery",
    ...result.history.map((h) =>
      [h.capturedAt, h.totalScore, h.ratingTrend, h.repeatCustomerRate, h.margin, h.creditRecovery].join(","),
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `health-score-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

const outlineBtnStyle: React.CSSProperties = {
  border: "1px solid var(--app-border)",
  borderRadius: 10,
  padding: "9px 14px",
  fontSize: 12.5,
  fontWeight: 600,
  color: "var(--app-text-muted)",
  background: "var(--app-surface)",
};

export function HealthScoreCard() {
  const session = useSession();
  const isOwner = session.user.role === "owner";
  const [weightsOpen, setWeightsOpen] = useState(false);
  const [periodMonths, setPeriodMonths] = useState<HealthScorePeriodMonths>(3);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["health-score", periodMonths],
    queryFn: () => fetchHealthScore(periodMonths),
  });

  if (isPending) {
    return <div className="h-[340px] animate-pulse rounded-[14px]" style={{ background: "var(--app-surface-2)" }} />;
  }
  if (isError || !data) {
    return (
      <div className="rounded-[14px] p-5" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <ErrorBanner title="Couldn't load the health score" onRetry={() => refetch()} />
      </div>
    );
  }

  if (data.building) {
    return (
      <div className="rounded-[14px] p-5" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "var(--app-success-bg)" }}>
            <Sparkles className="h-6 w-6" style={{ color: "var(--app-primary)" }} aria-hidden />
          </div>
          <p className="text-[15px] font-bold" style={{ color: "var(--app-text)" }}>{data.message}</p>
          <p className="text-[13px]" style={{ color: "var(--app-text-faintest)" }}>Ready in {data.daysUntilReady} day{data.daysUntilReady === 1 ? "" : "s"}.</p>
        </div>
      </div>
    );
  }

  const componentKeys = Object.keys(HEALTH_SCORE_COMPONENT_LABEL) as (keyof HealthScoreComponents)[];
  const scoreLabel = data.score >= 80 ? "Excellent" : data.score >= 60 ? "Good" : data.score >= 40 ? "Fair" : "Needs work";
  const C = 2 * Math.PI * 80;
  const dash = (data.score / 100) * C;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h2 className="text-[19px] font-extrabold tracking-tight" style={{ color: "var(--app-text)" }}>Business Health Score</h2>
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>Built from your own data — 0 to 100.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex gap-1 rounded-[9px] p-[3px]" style={{ background: "var(--app-surface-2)" }}>
            {HEALTH_SCORE_PERIOD_MONTHS.map((months) => (
              <button
                key={months}
                type="button"
                onClick={() => setPeriodMonths(months)}
                className="rounded-[7px] px-3 py-1.5 text-[11.5px] font-bold"
                style={periodMonths === months ? { background: "var(--app-primary)", color: "#fff" } : { color: "var(--app-text-faintest)" }}
              >
                {months} months
              </button>
            ))}
          </div>
          {isOwner && (
            <button type="button" onClick={() => setWeightsOpen(true)} style={outlineBtnStyle}>
              <Settings2 className="me-1.5 inline h-3.5 w-3.5" aria-hidden />
              Adjust weights
            </button>
          )}
          <button
            type="button"
            onClick={() => exportToCsv(data)}
            className="rounded-[10px] px-4 py-[9px] text-[12.5px] font-bold text-white"
            style={{ background: "var(--app-primary)" }}
          >
            Export
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
        <div className="rounded-[14px] p-[18px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <p className="text-[12.5px] font-bold" style={{ color: "var(--app-text-faint)" }}>Overall score</p>
          <div className="relative mx-auto mt-1.5 flex items-center justify-center" style={{ width: 200, height: 130 }}>
            <svg viewBox="0 0 200 130" width={200} height={130}>
              <path d="M20 110 A80 80 0 0 1 180 110" fill="none" stroke="var(--app-surface-2)" strokeWidth={16} strokeLinecap="round" />
              <path
                d="M20 110 A80 80 0 0 1 180 110"
                fill="none"
                stroke="var(--app-primary)"
                strokeWidth={16}
                strokeLinecap="round"
                strokeDasharray={`${dash} ${C}`}
              />
            </svg>
            <div className="absolute inset-x-0 bottom-0 flex items-baseline justify-center gap-1">
              <span className="text-[42px] font-extrabold tracking-tight" style={{ color: "var(--app-text)" }}>{Math.round(data.score)}</span>
              <span className="text-[13px] font-semibold" style={{ color: "var(--app-text-disabled)" }}>/100</span>
            </div>
          </div>
          <p className="-mt-1.5 text-center text-[14px] font-bold" style={{ color: "var(--app-primary)" }}>{scoreLabel}</p>
          {data.history.length >= 2 && (() => {
            const delta = data.history[data.history.length - 1].totalScore - data.history[data.history.length - 2].totalScore;
            if (delta === 0) return null;
            return (
              <p className="mt-1.5 text-center text-[11.5px]" style={{ color: "var(--app-text-faintest)" }}>
                {delta > 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)} point{Math.abs(delta) === 1 ? "" : "s"} vs last week
              </p>
            );
          })()}

          <div className="mt-4 flex flex-col gap-3 border-t pt-3.5" style={{ borderColor: "var(--app-surface-2)" }}>
            {componentKeys.map((key) => {
              const max = data.weights[key];
              const value = data.components[key];
              const fraction = max > 0 ? Math.min(1, value / max) : 0;
              return (
                <div key={key}>
                  <div className="mb-1 flex items-center justify-between text-[12px]">
                    <span className="font-semibold" style={{ color: "var(--app-text-muted)" }}>{HEALTH_SCORE_COMPONENT_LABEL[key]}</span>
                    <span className="font-bold tabular-nums" style={{ color: "var(--app-text)" }}>{value.toFixed(1)} / {max}</span>
                  </div>
                  <div className="h-[7px] w-full overflow-hidden rounded-full" style={{ background: "var(--app-surface-2)" }}>
                    <div className="h-full rounded-full transition-[width]" style={{ width: `${fraction * 100}%`, background: COMPONENT_COLOR[key] }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-[14px] p-[18px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[15px] font-bold" style={{ color: "var(--app-text)" }}>Score history</h3>
            <span className="text-[11.5px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Weekly, last {periodMonths} months</span>
          </div>
          <HealthScoreTrendChart history={data.history} />
        </div>
      </div>

      {data.changeLog.length > 0 && (
        <div className="rounded-[14px] overflow-hidden" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="p-[16px_18px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
            <h3 className="text-[15px] font-bold" style={{ color: "var(--app-text)" }}>Score change log</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="px-[18px] py-2.5 text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Date</th>
                  <th className="px-2.5 py-2.5 text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Old score</th>
                  <th className="px-2.5 py-2.5 text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>New score</th>
                  <th className="px-[18px] py-2.5 text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>What changed</th>
                </tr>
              </thead>
              <tbody>
                {data.changeLog.map((entry, i) => {
                  const changed = componentKeys.filter((key) => entry.oldWeights[key] !== entry.newWeights[key]);
                  const delta = entry.newScore - entry.oldScore;
                  return (
                    <tr key={i} style={{ borderTop: "1px solid var(--app-surface-2)" }}>
                      <td className="px-[18px] py-2.5 font-semibold" style={{ color: "var(--app-text-muted)" }}>{formatDate(entry.date)}</td>
                      <td className="px-2.5 py-2.5 text-end tabular-nums" style={{ color: "var(--app-text-faint)" }}>{entry.oldScore}</td>
                      <td className="px-2.5 py-2.5 text-end font-bold tabular-nums" style={{ color: "var(--app-text)" }}>
                        {entry.newScore} <span style={{ color: delta > 0 ? "var(--app-success-text)" : delta < 0 ? "var(--app-danger-strong)" : "var(--app-text-disabled)" }}>{delta > 0 ? `+${delta}` : delta}</span>
                      </td>
                      <td className="px-[18px] py-2.5" style={{ color: "var(--app-text-faint)" }}>
                        {changed.map((key) => HEALTH_SCORE_COMPONENT_LABEL[key]).join(", ") || "No material change"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <HealthScoreWeightsDialog open={weightsOpen} onClose={() => setWeightsOpen(false)} weights={data.weights} />
    </div>
  );
}
