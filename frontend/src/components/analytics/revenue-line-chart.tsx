"use client";

export function RevenueLineChart({ data, currency }: { data: number[]; currency: string }) {
  const width = 600;
  const height = 160;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;

  const points = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - ((v - min) / span) * height,
  }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
  const last = points[points.length - 1];

  return (
    <div>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Revenue, last 30 days">
        <path d={areaPath} fill="var(--chart-1)" opacity={0.08} />
        <path d={linePath} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={last.x} cy={last.y} r={4} fill="var(--chart-1)" />
      </svg>
      <div className="mt-1 flex justify-between text-xs text-fg-faint">
        <span>30 days ago</span>
        <span>
          Today · {new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(data[data.length - 1])}
        </span>
      </div>
    </div>
  );
}
