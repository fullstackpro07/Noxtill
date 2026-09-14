"use client";

import { useQuery } from "@tanstack/react-query";
import { Target } from "lucide-react";
import { fetchRevenueSeries } from "@/lib/analytics-api";
import { formatCurrency } from "@/lib/format";

/** Real anomaly: compares yesterday's revenue against the trailing 7-day average from the same
 * /analytics/revenue-series data used by the trend chart — a genuine statistical comparison, not
 * an AI-generated explanation. The design's editable "Today's Goals" targets have no persistence
 * anywhere in the backend, so that sub-section is flagged as a gap instead of faked with local state. */
export function NeedsAttentionCard({ currency }: { currency: string }) {
  const { data, isPending } = useQuery({ queryKey: ["revenue-series", 8], queryFn: () => fetchRevenueSeries(8) });

  const anomaly = (() => {
    if (!data || data.length < 8) return null;
    const last = data[data.length - 1];
    const trailing7 = data.slice(0, 7);
    const avg = trailing7.reduce((s, d) => s + d.revenue, 0) / trailing7.length;
    if (avg <= 0) return null;
    const deltaPct = ((last.revenue - avg) / avg) * 100;
    if (Math.abs(deltaPct) < 20) return null;
    return { date: last.date, revenue: last.revenue, avg, deltaPct };
  })();

  return (
    <section className="rounded-[14px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
      <h2 className="mb-3 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Needs Attention</h2>
      <div className="flex flex-col gap-2.5">
        {isPending ? (
          <div className="h-[76px] animate-pulse rounded-[12px]" style={{ background: "var(--app-surface-2)" }} />
        ) : !anomaly ? (
          <p className="py-4 text-center text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>Nothing unusual in recent sales.</p>
        ) : (
          <div
            className="rounded-[12px] p-3"
            style={{
              border: anomaly.deltaPct < 0 ? "1px solid var(--app-warning-border)" : "1px solid var(--app-success-border)",
              background: anomaly.deltaPct < 0 ? "#FFFBF2" : "var(--app-success-bg)",
            }}
          >
            <p className="text-[12.5px] font-bold" style={{ color: anomaly.deltaPct < 0 ? "var(--app-warning-text)" : "var(--app-success-text)" }}>
              Sales on {new Date(anomaly.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })} were{" "}
              {Math.abs(anomaly.deltaPct).toFixed(0)}% {anomaly.deltaPct < 0 ? "below" : "above"} your 7-day average
            </p>
            <div className="mt-1.5 flex gap-3 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
              <span>7-day avg: {formatCurrency(anomaly.avg, currency)}</span>
              <span className="font-bold" style={{ color: "var(--app-text)" }}>That day: {formatCurrency(anomaly.revenue, currency)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--app-surface-2)" }}>
        <div className="mb-1.5 flex items-center gap-2">
          <Target className="h-3.5 w-3.5" style={{ color: "var(--app-text-faintest)" }} aria-hidden />
          <h3 className="text-[13px] font-bold" style={{ color: "var(--app-text)" }}>Today's Goals</h3>
        </div>
        <p className="text-[11.5px] leading-normal" style={{ color: "var(--app-text-faintest)" }}>
          Setting and tracking daily targets isn't available yet — this needs a goals endpoint on the backend.
        </p>
      </div>
    </section>
  );
}
