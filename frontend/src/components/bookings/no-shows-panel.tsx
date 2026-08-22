"use client";

import { useQuery } from "@tanstack/react-query";
import { UserX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { formatPercent } from "@/lib/format";
import { fetchNoShowReport } from "@/lib/bookings-api";

export function NoShowsPanel() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["no-show-report"],
    queryFn: () => fetchNoShowReport(6),
  });

  if (isError) return <ErrorBanner title="Couldn't load the no-show report" onRetry={() => refetch()} />;
  if (isPending || !data) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-1 p-4">
          <SkeletonRow />
          <SkeletonRow />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-fg-muted">No-show rate (last {data.months} months)</p>
            <p className="font-display text-2xl font-bold text-fg">{formatPercent(data.overallRate)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-fg-muted">Repeat offenders</p>
            <p className="font-display text-2xl font-bold text-fg">{data.repeatOffenders.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <p className="mb-3 text-sm font-medium text-fg">Monthly trend</p>
          {data.trend.length < 2 ? (
            <p className="py-6 text-center text-sm text-fg-faint">Not enough monthly history yet to chart a trend.</p>
          ) : (
            <NoShowTrendChart trend={data.trend} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <p className="mb-3 text-sm font-medium text-fg">Repeat offenders</p>
          {data.repeatOffenders.length === 0 ? (
            <EmptyState icon={UserX} title="No repeat no-shows" description="Customers with 2+ no-shows in this window show up here." />
          ) : (
            <div className="flex flex-col gap-2">
              {data.repeatOffenders.map((o) => (
                <div key={o.customerId} className="flex items-center justify-between rounded-[var(--radius-sm)] bg-surface-2 px-3.5 py-2 text-sm">
                  <span className="text-fg">{o.name}</span>
                  <Badge tone="danger">{o.noShowCount} no-shows</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NoShowTrendChart({ trend }: { trend: { month: string; rate: number }[] }) {
  const width = 560;
  const height = 140;
  const max = Math.max(...trend.map((t) => t.rate), 10);
  const points = trend.map((t, i) => ({
    x: (i / (trend.length - 1)) * width,
    y: height - (t.rate / max) * height,
  }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
  const last = points[points.length - 1];

  return (
    <div>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="No-show rate trend">
        <path d={areaPath} fill="var(--destructive)" opacity={0.08} />
        <path d={linePath} fill="none" stroke="var(--destructive)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={last.x} cy={last.y} r={4} fill="var(--destructive)" />
      </svg>
      <div className="mt-1 flex justify-between text-xs text-fg-faint">
        <span>{trend[0].month}</span>
        <span>
          {trend[trend.length - 1].month} · {formatPercent(trend[trend.length - 1].rate)}
        </span>
      </div>
    </div>
  );
}
