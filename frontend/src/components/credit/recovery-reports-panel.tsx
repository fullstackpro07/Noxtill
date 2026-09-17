"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { fetchRecoveryReport } from "@/lib/credit-api";
import { sendReport } from "@/lib/reports-api";
import { formatCurrency, formatPercent } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { useSession } from "@/lib/session";

const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };

export function RecoveryReportsPanel({ currency }: { currency: string }) {
  const session = useSession();

  const { data, isPending } = useQuery({
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
      <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
        <div className="rounded-[16px] p-[40px] text-center" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <Lock className="mx-auto mb-2 h-6 w-6" style={{ color: "var(--app-text-disabled)" }} aria-hidden />
          <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Owner only</div>
          <div className="mt-1 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Recovery Reports are only visible to the business owner.</div>
        </div>
      </main>
    );
  }

  if (isPending || !data) return <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4" />;

  const maxExtended = Math.max(...data.trend.map((t) => t.extended), 1);

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[10px]">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Recovery Reports</h2>
        <button type="button" onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending} className="ml-auto" style={outlineBtn}>Send to accountant</button>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(175px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Recovered This Period</div>
          <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-primary)" }}>{formatCurrency(data.recovered, currency)}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Recovery Rate</div>
          <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatPercent(data.recoveryRate)}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Extended</div>
          <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(data.extended, currency)}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1.5px solid #FDD9D6" }}>
          <div className="text-[12px] font-bold" style={{ color: "#B42318" }}>Written Off</div>
          <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(data.writtenOff, currency)}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Net Exposure</div>
          <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(data.netExposure, currency)}</div>
        </div>
      </div>

      {data.trend.length > 1 && (
        <div className="grid gap-[15px]" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
          <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", minWidth: 0 }}>
            <h3 className="m-0 mb-3 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Extended vs. recovered</h3>
            <ExtendedRecoveredChart trend={data.trend} max={maxExtended} />
          </div>
          <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", minWidth: 0 }}>
            <h3 className="m-0 mb-3 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Recovery rate trend</h3>
            <RecoveryRateChart trend={data.trend} />
          </div>
        </div>
      )}
    </main>
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
