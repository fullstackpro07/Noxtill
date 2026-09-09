"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Building2, Star, Search, Share2, ArrowRight } from "lucide-react";
import { HealthScoreGauge } from "@/components/dashboard/health-score-gauge";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { Button } from "@/components/ui/button";
import { fetchVisibilityScore } from "@/lib/visibility-score-api";
import { formatDate } from "@/lib/format";

const COMPONENTS = [
  { key: "listingScore" as const, label: "Listing completeness", icon: Building2 },
  { key: "reviewScore" as const, label: "Review freshness & replies", icon: Star },
  { key: "seoScore" as const, label: "Keyword rank health", icon: Search },
  { key: "socialScore" as const, label: "Social activity", icon: Share2 },
];

export function VisibilityScoreView() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["visibility-score"],
    queryFn: () => fetchVisibilityScore(12),
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-fg">Visibility Score</h1>
        <p className="mt-0.5 text-sm text-fg-muted">
          One number for how easy your business is to find — listings, reviews, search rank, and social activity.
        </p>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load your visibility score" onRetry={() => refetch()} />
      ) : isPending || !data ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-col items-center gap-4 rounded-[var(--radius-noxtill)] border border-border bg-surface p-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-6">
              <HealthScoreGauge score={data.score} />
              <div className="flex flex-col gap-2 text-center sm:text-left">
                {COMPONENTS.map(({ key, label, icon: Icon }) => (
                  <div key={key} className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 shrink-0 text-fg-faint" aria-hidden />
                    <span className="w-44 shrink-0 text-xs text-fg-muted">{label}</span>
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${data.components[key]}%` }} />
                    </div>
                    <span className="w-8 shrink-0 text-end text-xs tabular-nums text-fg">{Math.round(data.components[key])}</span>
                  </div>
                ))}
              </div>
            </div>
            <Link href="/competitive/opportunities">
              <Button variant="outline" size="sm">
                View opportunities
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </Link>
          </div>

          <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
            <p className="mb-3 text-sm font-medium text-fg">12-week trend</p>
            {data.history.length < 2 ? (
              <p className="py-6 text-center text-sm text-fg-faint">
                Building your score — check back in a few days for a trend.
              </p>
            ) : (
              <TrendChart history={data.history} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function TrendChart({ history }: { history: { capturedAt: string; totalScore: number }[] }) {
  const width = 640;
  const height = 140;
  const scores = history.map((h) => h.totalScore);
  const min = Math.min(...scores, 0);
  const max = Math.max(...scores, 100);
  const span = max - min || 1;
  const points = history.map((h, i) => ({
    x: (i / (history.length - 1)) * width,
    y: height - ((h.totalScore - min) / span) * height,
  }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
  const last = points[points.length - 1];

  return (
    <div>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Visibility score trend">
        <path d={areaPath} fill="var(--chart-1)" opacity={0.08} />
        <path d={linePath} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={last.x} cy={last.y} r={4} fill="var(--chart-1)" />
      </svg>
      <div className="mt-1 flex justify-between text-xs text-fg-faint">
        <span>{formatDate(history[0].capturedAt)}</span>
        <span>
          {formatDate(history[history.length - 1].capturedAt)} · {Math.round(history[history.length - 1].totalScore)}
        </span>
      </div>
    </div>
  );
}
