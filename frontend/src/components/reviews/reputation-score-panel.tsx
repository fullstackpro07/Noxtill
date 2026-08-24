"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Info, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { HealthScoreGauge } from "@/components/dashboard/health-score-gauge";
import { ReputationScoreTrendChart } from "./reputation-score-trend-chart";
import { fetchReputationScore, type ReputationScoreComponents } from "@/lib/reviews-api";

const COMPONENT_LABEL: Record<keyof ReputationScoreComponents, string> = {
  rating: "Rating",
  volume: "Review volume",
  recency: "Recency",
  responseRate: "Response rate",
};

const COMPONENT_COLOR: Record<keyof ReputationScoreComponents, string> = {
  rating: "var(--chart-1)",
  volume: "var(--chart-2)",
  recency: "var(--chart-3)",
  responseRate: "var(--chart-4)",
};

const IMPROVEMENT_ACTIONS: Record<keyof ReputationScoreComponents, { text: string; href: string; label: string }> = {
  rating: { text: "Reply to your lowest-rated reviews — a thoughtful public reply often matters as much as the rating itself.", href: "/reviews", label: "Open inbox" },
  volume: { text: "Send more review requests — a bigger review count carries real weight with new customers.", href: "/reviews/requests", label: "Send requests" },
  recency: { text: "It's been a while since your last review — put a QR poster up or send a fresh batch of requests.", href: "/reviews/qr", label: "Get your QR code" },
  responseRate: { text: "You have unreplied reviews — a quick reply goes a long way for anyone reading them later.", href: "/reviews", label: "Reply now" },
};

export function ReputationScorePanel() {
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["reputation-score"], queryFn: fetchReputationScore });

  if (isPending) {
    return (
      <Card>
        <CardContent>
          <div className="flex items-center gap-6">
            <Skeleton className="h-38 w-38 shrink-0 rounded-full" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-3.5 w-3/5" />
              <Skeleton className="h-3.5 w-2/5" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
  if (isError || !data) {
    return (
      <Card>
        <CardContent>
          <ErrorBanner title="Couldn't load the reputation score" onRetry={() => refetch()} />
        </CardContent>
      </Card>
    );
  }

  const componentKeys = Object.keys(COMPONENT_LABEL) as (keyof ReputationScoreComponents)[];
  const weakest = componentKeys
    .filter((key) => data.components[key] < data.weights[key] * 0.6)
    .sort((a, b) => data.components[a] - data.components[b]);

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Reputation score</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setMethodologyOpen(true)}>
            <Info className="h-3.5 w-3.5" aria-hidden />
            How this is calculated
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            <HealthScoreGauge score={data.score} />
            <div className="flex flex-1 flex-col gap-3">
              {componentKeys.map((key) => {
                const max = data.weights[key];
                const value = data.components[key];
                const fraction = max > 0 ? Math.min(1, value / max) : 0;
                return (
                  <div key={key}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-fg">{COMPONENT_LABEL[key]}</span>
                      <span className="tabular-nums text-fg-muted">
                        {value.toFixed(1)} / {max}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full transition-[width]"
                        style={{ width: `${fraction * 100}%`, backgroundColor: COMPONENT_COLOR[key] }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 border-t border-border pt-5">
            <p className="mb-2 text-sm font-medium text-fg">8-week trend</p>
            <ReputationScoreTrendChart trend={data.trend} />
          </div>
        </CardContent>
      </Card>

      {weakest.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Improve your score</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border">
            {weakest.map((key) => (
              <div key={key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <p className="text-sm text-fg-muted">{IMPROVEMENT_ACTIONS[key].text}</p>
                <Link
                  href={IMPROVEMENT_ACTIONS[key].href}
                  className="flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border-strong px-3.5 text-sm font-medium text-fg transition-colors hover:bg-surface-2"
                >
                  {IMPROVEMENT_ACTIONS[key].label}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={methodologyOpen} onClose={() => setMethodologyOpen(false)} title="How the reputation score is calculated">
        <div className="flex flex-col gap-3 text-sm text-fg-muted">
          <p>Four components, each worth up to 25 of the 100-point total:</p>
          <ul className="list-disc space-y-1.5 ps-5">
            <li><strong className="text-fg">Rating</strong> — your average star rating across all reviews.</li>
            <li><strong className="text-fg">Review volume</strong> — how many reviews you&apos;ve collected, up to a target of 50.</li>
            <li><strong className="text-fg">Recency</strong> — how recently your last review came in; fades to 0 after 90 days.</li>
            <li><strong className="text-fg">Response rate</strong> — the share of reviews you&apos;ve replied to.</li>
          </ul>
          <p>This is separate from your Business Health Score on the Dashboard, which looks at your business&apos;s overall operational health, not just public reviews.</p>
        </div>
      </Dialog>
    </div>
  );
}
