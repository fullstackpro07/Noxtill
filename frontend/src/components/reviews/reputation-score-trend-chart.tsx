import { formatDate } from "@/lib/format";
import type { ReputationScoreResult } from "@/lib/reviews-api";

export function ReputationScoreTrendChart({ trend }: { trend: ReputationScoreResult["trend"] }) {
  if (trend.length < 2) {
    return <p className="py-8 text-center text-sm text-fg-faint">Not enough weekly history yet to chart a trend.</p>;
  }

  const width = 560;
  const height = 140;
  const scores = trend.map((t) => t.totalScore);
  const min = Math.min(...scores, 0);
  const max = Math.max(...scores, 100);
  const span = max - min || 1;

  const points = trend.map((t, i) => ({
    x: (i / (trend.length - 1)) * width,
    y: height - ((t.totalScore - min) / span) * height,
  }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
  const last = points[points.length - 1];

  return (
    <div>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Reputation score trend over the last ${trend.length} weeks`}
      >
        <path d={areaPath} fill="var(--chart-1)" opacity={0.08} />
        <path d={linePath} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={last.x} cy={last.y} r={4} fill="var(--chart-1)" />
      </svg>
      <div className="mt-1 flex justify-between text-xs text-fg-faint">
        <span>{formatDate(trend[0].weekEnding)}</span>
        <span>
          {formatDate(trend[trend.length - 1].weekEnding)} · {Math.round(trend[trend.length - 1].totalScore)}
        </span>
      </div>
    </div>
  );
}
