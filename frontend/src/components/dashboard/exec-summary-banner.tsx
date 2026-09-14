"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp } from "lucide-react";
import { fetchRevenueSeries } from "@/lib/analytics-api";
import { formatCurrency, formatNumber } from "@/lib/format";
import { useDashboardStore, OVERVIEW_RANGE_DAYS } from "@/store/dashboard-store";
import { SlideDrawer } from "./slide-drawer";

const PERIOD_NOUN: Record<string, string> = { today: "yesterday", week: "the previous week", month: "the previous month" };

/** Real period-over-period summary computed from /analytics/revenue-series, driven by the toolbar's
 * date-range selector — the design's AI-generated executive summary has no backing model, so this
 * ships as a genuine current-vs-previous-period comparison instead of fabricated interpretive text.
 * "Why?" opens real computed drivers (order count delta, average-ticket delta) — no invented prose. */
export function ExecSummaryBanner({ currency }: { currency: string }) {
  const [whyOpen, setWhyOpen] = useState(false);
  const overviewRange = useDashboardStore((s) => s.overviewRange);
  const days = OVERVIEW_RANGE_DAYS[overviewRange];
  const { data, isPending } = useQuery({ queryKey: ["revenue-series", days * 2], queryFn: () => fetchRevenueSeries(days * 2) });

  if (isPending || !data || data.length < days * 2) return null;

  const previous = data.slice(0, days);
  const current = data.slice(days);
  const currentRevenue = current.reduce((s, d) => s + d.revenue, 0);
  const previousRevenue = previous.reduce((s, d) => s + d.revenue, 0);
  const currentOrders = current.reduce((s, d) => s + d.orders, 0);
  const previousOrders = previous.reduce((s, d) => s + d.orders, 0);

  const delta = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : null;
  const orderDelta = currentOrders - previousOrders;
  const currentAvgTicket = currentOrders > 0 ? currentRevenue / currentOrders : 0;
  const previousAvgTicket = previousOrders > 0 ? previousRevenue / previousOrders : 0;
  const avgTicketDelta = currentAvgTicket - previousAvgTicket;
  const periodNoun = PERIOD_NOUN[overviewRange];
  const currentLabel = overviewRange === "today" ? "Today so far" : overviewRange === "week" ? "This week so far" : "This month so far";

  return (
    <>
      <div
        className="flex flex-wrap items-center gap-3 rounded-[14px] p-[14px_17px]"
        style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}
      >
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px]" style={{ background: "var(--app-success-bg)" }}>
          <TrendingUp className="h-4 w-4" style={{ color: "var(--app-success-text)" }} aria-hidden />
        </span>
        <span className="min-w-[220px] flex-1 text-[13.5px] font-semibold leading-normal" style={{ color: "var(--app-text)" }}>
          {delta === null
            ? `${currentLabel}: ${formatCurrency(currentRevenue, currency)}.`
            : `${currentLabel}: ${formatCurrency(currentRevenue, currency)}, ${delta >= 0 ? "up" : "down"} ${Math.abs(delta).toFixed(1)}% vs ${periodNoun} (${formatCurrency(previousRevenue, currency)}).`}
        </span>
        <button
          type="button"
          onClick={() => setWhyOpen(true)}
          className="shrink-0 rounded-[10px] px-3.5 py-[9px] text-[12px] font-extrabold"
          style={{ border: "1px solid var(--app-border)", color: "var(--app-success-text)" }}
        >
          Why?
        </button>
      </div>

      <SlideDrawer open={whyOpen} onClose={() => setWhyOpen(false)} title="What is behind it">
        <div className="flex flex-col gap-3">
          <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }}>
            <div className="flex items-start gap-2.5">
              <span className="text-[15px] font-extrabold leading-none" style={{ color: orderDelta >= 0 ? "var(--app-success-text)" : "var(--app-danger-strong)" }}>
                {orderDelta >= 0 ? "+" : ""}{orderDelta}
              </span>
              <div>
                <p className="text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>Order count vs {periodNoun}</p>
                <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--app-text-faintest)" }}>
                  {formatNumber(currentOrders)} order(s) vs {formatNumber(previousOrders)}.
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }}>
            <div className="flex items-start gap-2.5">
              <span className="text-[15px] font-extrabold leading-none" style={{ color: avgTicketDelta >= 0 ? "var(--app-success-text)" : "var(--app-danger-strong)" }}>
                {avgTicketDelta >= 0 ? "+" : ""}{formatCurrency(avgTicketDelta, currency)}
              </span>
              <div>
                <p className="text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>Average ticket vs {periodNoun}</p>
                <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--app-text-faintest)" }}>
                  {formatCurrency(currentAvgTicket, currency)} vs {formatCurrency(previousAvgTicket, currency)}.
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-[11px] p-3" style={{ background: "var(--app-warning-bg)", border: "1px solid var(--app-warning-border)" }}>
            <p className="text-[11.5px] leading-normal" style={{ color: "var(--app-warning-text)" }}>
              Drawn only from your own sales figures for this period vs. {periodNoun} — a direct comparison, not a modeled explanation.
            </p>
          </div>
        </div>
      </SlideDrawer>
    </>
  );
}
