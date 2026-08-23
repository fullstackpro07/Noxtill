"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Send, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { fetchRecoveryReport } from "@/lib/credit-api";
import { sendReport } from "@/lib/reports-api";
import { formatCurrency, formatPercent } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { useSession } from "@/lib/session";

export function RecoveryReportsPanel({ currency }: { currency: string }) {
  const session = useSession();

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["credit-recovery-report"],
    queryFn: () => fetchRecoveryReport(6),
    enabled: session.user.role === "owner",
  });

  const sendMutation = useMutation({
    mutationFn: () => sendReport("credit_recovery"),
    onSuccess: () => toast.success("Recovery report sent to your accountant."),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send this report."),
  });

  if (session.user.role !== "owner") {
    return (
      <Card>
        <CardContent>
          <EmptyState icon={Lock} title="Owner only" description="Recovery Reports are only visible to the business owner." />
        </CardContent>
      </Card>
    );
  }

  if (isError) return <ErrorBanner title="Couldn't load the recovery report" onRetry={() => refetch()} />;
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

  const maxExtended = Math.max(...data.trend.map((t) => t.extended), 1);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending}>
          <Send className="h-3.5 w-3.5" aria-hidden />
          Send to accountant
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-fg-muted">Extended</p>
            <p className="font-display text-lg font-bold text-fg">{formatCurrency(data.extended, currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-fg-muted">Recovered</p>
            <p className="font-display text-lg font-bold text-whatsapp">{formatCurrency(data.recovered, currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-fg-muted">Recovery rate</p>
            <p className="font-display text-lg font-bold text-fg">{formatPercent(data.recoveryRate)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-fg-muted">Written off</p>
            <p className="font-display text-lg font-bold text-destructive">{formatCurrency(data.writtenOff, currency)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-fg-muted">Net exposure</p>
            <p className="font-display text-lg font-bold text-fg">{formatCurrency(data.netExposure, currency)}</p>
          </CardContent>
        </Card>
      </div>

      {data.trend.length > 1 && (
        <>
          <Card>
            <CardContent className="p-4">
              <p className="mb-3 text-sm font-medium text-fg">Extended vs. recovered</p>
              <ExtendedRecoveredChart trend={data.trend} max={maxExtended} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="mb-3 text-sm font-medium text-fg">Recovery rate trend</p>
              <RecoveryRateChart trend={data.trend} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function ExtendedRecoveredChart({ trend, max }: { trend: { month: string; extended: number; recovered: number }[]; max: number }) {
  const width = 560;
  const height = 130;
  const barWidth = width / trend.length;

  return (
    <div>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Extended vs recovered">
        {trend.map((t, i) => {
          const extendedHeight = (t.extended / max) * height;
          const recoveredHeight = (t.recovered / max) * height;
          return (
            <g key={t.month}>
              <rect x={i * barWidth + 4} y={height - extendedHeight} width={barWidth / 2 - 6} height={extendedHeight} fill="var(--chart-1)" opacity={0.85} rx={2} />
              <rect x={i * barWidth + barWidth / 2} y={height - recoveredHeight} width={barWidth / 2 - 6} height={recoveredHeight} fill="var(--primary)" opacity={0.85} rx={2} />
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex items-center gap-4 text-xs text-fg-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: "var(--chart-1)" }} /> Extended
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: "var(--primary)" }} /> Recovered
        </span>
      </div>
    </div>
  );
}

function RecoveryRateChart({ trend }: { trend: { month: string; recoveryRate: number }[] }) {
  const width = 560;
  const height = 110;
  const points = trend.map((t, i) => ({ x: (i / (trend.length - 1)) * width, y: height - (t.recoveryRate / 100) * height }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Recovery rate trend">
      <path d={linePath} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
