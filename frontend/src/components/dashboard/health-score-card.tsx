"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Settings2, Download, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/shared/skeleton";
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
import { HealthScoreGauge } from "./health-score-gauge";
import { HealthScoreTrendChart } from "./health-score-trend-chart";
import { HealthScoreWeightsDialog } from "./health-score-weights-dialog";

const COMPONENT_COLOR: Record<keyof HealthScoreComponents, string> = {
  ratingTrend: "var(--chart-1)",
  repeatCustomerRate: "var(--chart-2)",
  margin: "var(--chart-3)",
  creditRecovery: "var(--chart-4)",
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

  if (data.building) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Business health score</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/8">
              <Sparkles className="h-6 w-6 text-primary" aria-hidden />
            </div>
            <p className="font-display text-base font-semibold text-fg">{data.message}</p>
            <p className="text-sm text-fg-muted">Ready in {data.daysUntilReady} day{data.daysUntilReady === 1 ? "" : "s"}.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const componentKeys = Object.keys(HEALTH_SCORE_COMPONENT_LABEL) as (keyof HealthScoreComponents)[];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business health score</CardTitle>
        <div className="flex items-center gap-2">
          <Select
            value={periodMonths}
            onChange={(e) => setPeriodMonths(Number(e.target.value) as HealthScorePeriodMonths)}
            className="w-32"
            aria-label="Period"
          >
            {HEALTH_SCORE_PERIOD_MONTHS.map((months) => (
              <option key={months} value={months}>
                {months} months
              </option>
            ))}
          </Select>
          <Button variant="ghost" size="sm" onClick={() => exportToCsv(data)}>
            <Download className="h-3.5 w-3.5" aria-hidden />
            Export
          </Button>
          {isOwner && (
            <Button variant="ghost" size="sm" onClick={() => setWeightsOpen(true)}>
              <Settings2 className="h-3.5 w-3.5" aria-hidden />
              Adjust weighting
            </Button>
          )}
        </div>
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
          <p className="mb-2 text-sm font-medium text-fg">{periodMonths}-month trend</p>
          <HealthScoreTrendChart history={data.history} />
        </div>

        {data.changeLog.length > 0 && (
          <div className="mt-6 border-t border-border pt-5">
            <p className="mb-2 text-sm font-medium text-fg">Score change log</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-fg-faint">
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium">Old score</th>
                    <th className="pb-2 font-medium">New score</th>
                    <th className="pb-2 font-medium">What changed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.changeLog.map((entry, i) => {
                    const changed = componentKeys.filter(
                      (key) => entry.oldWeights[key] !== entry.newWeights[key],
                    );
                    return (
                      <tr key={i}>
                        <td className="py-2 text-fg-muted">{formatDate(entry.date)}</td>
                        <td className="py-2 tabular-nums text-fg">{entry.oldScore}</td>
                        <td className="py-2 tabular-nums text-fg">{entry.newScore}</td>
                        <td className="py-2 text-fg-muted">
                          {changed.map((key) => HEALTH_SCORE_COMPONENT_LABEL[key]).join(", ") || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>

      <HealthScoreWeightsDialog open={weightsOpen} onClose={() => setWeightsOpen(false)} weights={data.weights} />
    </Card>
  );
}
