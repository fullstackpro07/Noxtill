"use client";

import type { CashForecastDay } from "@/lib/cash-forecast-api";
import { formatCurrency } from "@/lib/format";

/** Cumulative net-flow projection — always includes 0 in its own vertical range so the "goes negative" crossing is visible, not just implied. */
export function CashFlowChart({ days, currency }: { days: CashForecastDay[]; currency: string }) {
  const width = 600;
  const height = 180;
  const values = days.map((d) => d.cumulativeNet);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const zeroY = height - ((0 - min) / span) * height;

  const points = days.map((d, i) => ({
    x: days.length > 1 ? (i / (days.length - 1)) * width : 0,
    y: height - ((d.cumulativeNet - min) / span) * height,
  }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const lastDay = days[days.length - 1];
  const goesNegative = lastDay && lastDay.cumulativeNet < 0;

  return (
    <div>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Projected cumulative net cash flow">
        <line x1={0} y1={zeroY} x2={width} y2={zeroY} stroke="var(--border-strong)" strokeWidth={1} strokeDasharray="4 4" />
        <path d={linePath} fill="none" stroke={goesNegative ? "var(--destructive)" : "var(--chart-1)"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {last && <circle cx={last.x} cy={last.y} r={4} fill={goesNegative ? "var(--destructive)" : "var(--chart-1)"} />}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-fg-faint">
        <span>Today</span>
        {lastDay && (
          <span>
            Day {days.length} · {formatCurrency(lastDay.cumulativeNet, currency)}
          </span>
        )}
      </div>
    </div>
  );
}
