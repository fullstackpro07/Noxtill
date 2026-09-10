"use client";

import type { OnTimeTrendPoint } from "@/lib/deliveries-api";

/** On-time-rate depth fix — same inline-SVG line-chart pattern as `RevenueLineChart`. */
export function OnTimeTrendChart({ trend }: { trend: OnTimeTrendPoint[] }) {
  const width = 600;
  const height = 120;
  const points = trend.map((t, i) => ({
    x: trend.length > 1 ? (i / (trend.length - 1)) * width : width / 2,
    y: height - ((t.onTimeRate ?? 0) / 100) * height,
    ...t,
  }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = points.length > 1 ? `${linePath} L${width},${height} L0,${height} Z` : "";
  const last = points[points.length - 1];

  return (
    <div>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="On-time delivery rate trend">
        {areaPath && <path d={areaPath} fill="var(--chart-2)" opacity={0.08} />}
        <path d={linePath} fill="none" stroke="var(--chart-2)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p) => (
          <circle key={p.date} cx={p.x} cy={p.y} r={p === last ? 4 : 2.5} fill="var(--chart-2)" />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-fg-faint">
        <span>{points[0]?.date}</span>
        <span>
          {last.date} · {last.onTimeRate != null ? `${last.onTimeRate}%` : "—"} ({last.sampleSize} deliveries)
        </span>
      </div>
    </div>
  );
}
