"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Settings2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { useSession } from "@/lib/session";
import { fetchHealthScore, HEALTH_SCORE_COMPONENT_LABEL, type HealthScoreComponents } from "@/lib/health-score-api";
import { HealthScoreGauge } from "./health-score-gauge";
import { HealthScoreTrendChart } from "./health-score-trend-chart";
import { HealthScoreWeightsDialog } from "./health-score-weights-dialog";

const COMPONENT_COLOR: Record<keyof HealthScoreComponents, string> = {
  ratingTrend: "var(--chart-1)",
  repeatCustomerRate: "var(--chart-2)",
  margin: "var(--chart-3)",
  creditRecovery: "var(--chart-4)",
};

export function HealthScoreCard() {
  const session = useSession();
  const [weightsOpen, setWeightsOpen] = useState(false);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["health-score"],
    queryFn: () => fetchHealthScore(),
  });

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
          <ErrorBanner title="Couldn't load the health score" onRetry={() => refetch()} />
        </CardContent>
      </Card>
    );
  }

  const componentKeys = Object.keys(HEALTH_SCORE_COMPONENT_LABEL) as (keyof HealthScoreComponents)[];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business health score</CardTitle>
        {session.user.role !== "staff" && (
          <Button variant="ghost" size="sm" onClick={() => setWeightsOpen(true)}>
            <Settings2 className="h-3.5 w-3.5" aria-hidden />
            Adjust weighting
          </Button>
        )}
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
                    <span className="text-fg">{HEALTH_SCORE_COMPONENT_LABEL[key]}</span>
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
          <p className="mb-2 text-sm font-medium text-fg">12-week trend</p>
          <HealthScoreTrendChart history={data.history} />
        </div>
      </CardContent>

      <HealthScoreWeightsDialog open={weightsOpen} onClose={() => setWeightsOpen(false)} weights={data.weights} />
    </Card>
  );
}
