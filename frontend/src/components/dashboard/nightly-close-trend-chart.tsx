import { formatDate } from "@/lib/format";
import type { NightlyCloseHistoryRow } from "@/lib/nightly-close-api";

/** Nightly Close depth fix — the real 30-day sales trend the plan calls for, oldest to newest. */
export function NightlyCloseTrendChart({ history }: { history: NightlyCloseHistoryRow[] }) {
  const points30d = [...history].reverse();
  if (points30d.length < 2) {
    return <p className="py-8 text-center text-[13px]" style={{ color: "var(--app-text-faintest)" }}>Not enough history yet to chart a trend.</p>;
  }

  const width = 560;
  const height = 140;
  const values = points30d.map((h) => h.sales);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const span = max - min || 1;

  const points = points30d.map((h, i) => ({
    x: (i / (points30d.length - 1)) * width,
    y: height - ((h.sales - min) / span) * height,
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
        aria-label={`Sales trend over the last ${points30d.length} nightly closes`}
      >
        <path d={areaPath} fill="var(--app-primary)" opacity={0.1} />
        <path d={linePath} fill="none" stroke="var(--app-primary)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={last.x} cy={last.y} r={4} fill="var(--app-primary)" />
      </svg>
      <div className="mt-1 flex justify-between text-[11.5px]" style={{ color: "var(--app-text-faintest)" }}>
        <span>{formatDate(points30d[0].date)}</span>
        <span>
          {formatDate(points30d[points30d.length - 1].date)} · {points30d[points30d.length - 1].sales} sale(s)
        </span>
      </div>
    </div>
  );
}
