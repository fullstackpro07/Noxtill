"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useWidgetData } from "@/hooks/use-widget-data";
import { fetchOrders } from "@/lib/orders-api";
import { fetchReviewsSummary, fetchReviews, type LiveInboxEntry } from "@/lib/reviews-api";
import { fetchDebtors, fetchOverdueAgeing, fetchCollectedToday } from "@/lib/credit-api";
import { fetchAppointments } from "@/lib/bookings-api";
import { fetchRevenueSeries } from "@/lib/analytics-api";
import { formatCurrency, formatNumber, formatDate, formatTime, formatRelativeTime } from "@/lib/format";
import { useNow } from "@/hooks/use-now";
import { SlideDrawer } from "./slide-drawer";
import { KpiDrawerBody, type KpiDriver, type KpiSourceRecord } from "./kpi-drawer-body";

type KpiKey = "sales" | "profit" | "rating" | "credit" | "bookings" | "orders";

interface KpiCardProps {
  label: string;
  value: string | null;
  placeholder?: string;
  delta?: { label: string; up: boolean } | null;
  badge?: string;
  prev?: string;
  recs?: string;
  updatedAt?: number;
  onOpen?: () => void;
  needsAttention?: boolean;
}

/** Exact 4-line structure from the design: label → value(+delta or +badge) → comparison caption →
 * record-count + real "updated" timestamp (from the query's own dataUpdatedAt, never fabricated). */
function KpiCard({ label, value, placeholder, delta, badge, prev, recs, updatedAt, onOpen, needsAttention }: KpiCardProps) {
  const now = useNow(15_000);
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!onOpen}
      className="flex flex-col rounded-[14px] p-4 text-start transition-colors disabled:cursor-default"
      style={{
        background: "var(--app-surface)",
        border: needsAttention ? "1.5px solid var(--app-warning-border)" : "1px solid var(--app-border)",
        boxShadow: "0 1px 2px rgba(16,24,40,.04)",
      }}
    >
      <span className="mb-[9px] flex items-center gap-2">
        <span className="text-[12px] font-semibold" style={{ color: "var(--app-text-faint)" }}>{label}</span>
        {needsAttention && (
          <span className="whitespace-nowrap rounded-full px-[7px] py-0.5 text-[9px] font-extrabold" style={{ background: "var(--app-warning-bg)", color: "var(--app-warning-text)" }}>
            Needs attention
          </span>
        )}
      </span>

      {value !== null ? (
        <span className="flex flex-wrap items-baseline gap-2">
          <span className="text-[24px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.8px" }}>{value}</span>
          {delta && (
            <span className="text-[12px] font-extrabold" style={{ color: delta.up ? "var(--app-success-text)" : "var(--app-danger-strong)" }}>
              {delta.up ? "▲" : "▼"} {delta.label}
            </span>
          )}
          {badge && !delta && (
            <span className="text-[12px] font-bold" style={{ color: "var(--app-success-text)" }}>{badge}</span>
          )}
        </span>
      ) : (
        <span className="text-[13px] italic" style={{ color: "var(--app-text-disabled)" }}>{placeholder}</span>
      )}

      {prev && (
        <span className="mt-1.5 block text-[11px]" style={{ color: "var(--app-text-disabled)" }}>{prev}</span>
      )}

      <span className="mt-[7px] flex items-center gap-1.5">
        {recs && (
          <span className="text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>
            {recs}{updatedAt ? ` · updated ${formatRelativeTime(now - updatedAt)}` : ""}
          </span>
        )}
        {onOpen && <ChevronRight className="ms-auto h-3.5 w-3.5" style={{ color: "var(--app-text-disabled)" }} aria-hidden />}
      </span>
    </button>
  );
}

function isSameDay(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
}

function isoDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Every drawer follows the design's "Compared with → Where this comes from → Likely drivers →
 * Source records" structure, and every card-level delta shown here is a genuine day-over-day
 * computation from real order/appointment/review data — never invented to fill a slot. The one
 * exception is Credit Outstanding: the backend has no historical balance snapshot, so a weekly
 * delta for it would have to be fabricated, and it's left out on purpose (the real "Needs
 * attention" flag and current balance still show). */
export function KpiRow({ currency }: { currency: string }) {
  const [drawer, setDrawer] = useState<KpiKey | null>(null);
  const now = useNow();
  const today = new Date();
  const yesterdayDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const revenueToday = useWidgetData("revenue_today");
  const ordersToday = useWidgetData("orders_today");
  const creditOutstanding = useWidgetData("credit_outstanding");
  const appointmentsToday = useWidgetData("pending_appointments_today");

  const { data: series } = useQuery({ queryKey: ["revenue-series", 2], queryFn: () => fetchRevenueSeries(2) });
  const { data: overdueAgeing } = useQuery({ queryKey: ["credit", "overdue-ageing", "kpi"], queryFn: fetchOverdueAgeing });
  const reviewsSummaryQ = useQuery({ queryKey: ["reviews-summary"], queryFn: fetchReviewsSummary });
  const pendingOrdersQ = useQuery({ queryKey: ["orders", "pending", "kpi"], queryFn: () => fetchOrders("pending") });
  const { data: allOrders } = useQuery({ queryKey: ["orders", "all", "kpi"], queryFn: () => fetchOrders() });
  const { data: reviews } = useQuery({ queryKey: ["reviews", "kpi"], queryFn: fetchReviews });
  const { data: debtors } = useQuery({ queryKey: ["credit", "debtors", "kpi"], queryFn: () => fetchDebtors("balance"), enabled: drawer === "credit" });
  const { data: collectedToday } = useQuery({ queryKey: ["credit", "collected-today", "kpi"], queryFn: fetchCollectedToday, enabled: drawer === "credit" });
  const { data: todaysBookingsList } = useQuery({ queryKey: ["appointments", "kpi-today"], queryFn: () => fetchAppointments({ from: isoDate(), to: isoDate() }) });
  const { data: yesterdaysBookings } = useQuery({ queryKey: ["appointments", "kpi-yesterday"], queryFn: () => fetchAppointments({ from: isoDate(-1), to: isoDate(-1) }) });

  const revenue = revenueToday.data as { revenue: number; orders?: number } | undefined;
  const orders = ordersToday.data as { count: number } | undefined;
  const credit = creditOutstanding.data as { balance?: number; amount?: number } | undefined;
  const bookings = appointmentsToday.data as { count: number } | undefined;
  const reviewsSummary = reviewsSummaryQ.data;
  const pendingOrders = pendingOrdersQ.data;

  const yesterdaySeries = series && series.length >= 2 ? series[series.length - 2] : null;
  const salesDelta = yesterdaySeries && yesterdaySeries.revenue > 0 && revenue ? pctDelta(revenue.revenue, yesterdaySeries.revenue) : null;

  const todaysOrders = (allOrders ?? []).filter((o) => isSameDay(o.createdAt, today)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const yesterdaysOrders = (allOrders ?? []).filter((o) => isSameDay(o.createdAt, yesterdayDate));

  // Real profit: revenue minus the backend's own recorded cost-of-goods per order — not an estimate.
  const todayProfit = todaysOrders.reduce((sum, o) => sum + (o.total - o.cogs), 0);
  const yesterdayProfit = yesterdaysOrders.reduce((sum, o) => sum + (o.total - o.cogs), 0);
  const profitDelta = todaysOrders.length > 0 ? pctDelta(todayProfit, yesterdayProfit) : null;

  const externalReviews = (reviews ?? []).filter((r): r is Extract<LiveInboxEntry, { source: "external" }> => r.source === "external").sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const todaysReviews = externalReviews.filter((r) => isSameDay(r.createdAt, today));
  const yesterdaysReviews = externalReviews.filter((r) => isSameDay(r.createdAt, yesterdayDate));
  const reviewsThisWeek = externalReviews.filter((r) => now - new Date(r.createdAt).getTime() < WEEK_MS).length;

  const bookingsDelta = yesterdaysBookings && todaysBookingsList && yesterdaysBookings.length > 0 ? pctDelta(todaysBookingsList.length, yesterdaysBookings.length) : null;

  // Pending Orders can't be compared to "yesterday's queue" (no historical snapshot of an in-flight
  // queue exists) — instead this compares orders that *entered* pending status each day, a real,
  // computable analogue rather than a fabricated queue-depth history.
  const todaysNewPending = todaysOrders.filter((o) => o.status === "pending").length;
  const yesterdaysNewPending = yesterdaysOrders.filter((o) => o.status === "pending").length;
  const pendingDelta = todaysOrders.length > 0 || yesterdaysOrders.length > 0 ? todaysNewPending - yesterdaysNewPending : null;

  // Sales drivers: real order-count delta + real average-ticket delta vs yesterday.
  const salesDrivers: KpiDriver[] | undefined = (() => {
    if (!yesterdaySeries || !orders || !revenue) return undefined;
    const orderDelta = orders.count - yesterdaySeries.orders;
    const todayAvg = orders.count > 0 ? revenue.revenue / orders.count : 0;
    const yesterdayAvg = yesterdaySeries.orders > 0 ? yesterdaySeries.revenue / yesterdaySeries.orders : 0;
    const avgDelta = todayAvg - yesterdayAvg;
    const drivers: KpiDriver[] = [];
    if (orderDelta !== 0) drivers.push({ sign: orderDelta > 0 ? "+" : "−", title: orderDelta > 0 ? "More orders than yesterday" : "Fewer orders than yesterday", note: `${Math.abs(orderDelta)} order(s) different from yesterday` });
    if (Math.abs(avgDelta) > 0.01) drivers.push({ sign: avgDelta > 0 ? "+" : "−", title: avgDelta > 0 ? "Higher average ticket" : "Lower average ticket", note: `${formatCurrency(Math.abs(avgDelta), currency)} vs yesterday` });
    return drivers.length > 0 ? drivers : undefined;
  })();

  const salesRecords: KpiSourceRecord[] = todaysOrders.map((o) => ({ id: `#${o.orderNo}`, when: formatTime(o.createdAt), who: o.customerName, amount: formatCurrency(o.total, currency) }));

  const profitDrivers: KpiDriver[] | undefined = (() => {
    if (todaysOrders.length === 0) return undefined;
    const marginToday = todaysOrders.reduce((s, o) => s + o.total, 0) > 0 ? todayProfit / todaysOrders.reduce((s, o) => s + o.total, 0) : 0;
    const marginYesterday = yesterdaysOrders.reduce((s, o) => s + o.total, 0) > 0 ? yesterdayProfit / yesterdaysOrders.reduce((s, o) => s + o.total, 0) : 0;
    const marginDelta = (marginToday - marginYesterday) * 100;
    if (Math.abs(marginDelta) < 0.5) return undefined;
    return [{ sign: marginDelta > 0 ? "+" : "−", title: marginDelta > 0 ? "Better margin than yesterday" : "Thinner margin than yesterday", note: `${Math.abs(marginDelta).toFixed(1)} point(s) vs yesterday's blended margin` }];
  })();

  const profitRecords: KpiSourceRecord[] = todaysOrders.map((o) => ({ id: `#${o.orderNo}`, when: formatTime(o.createdAt), who: o.customerName, amount: formatCurrency(o.total - o.cogs, currency) }));

  // Credit drivers: real overdue-bucket exposure + real amount recovered today.
  const creditDrivers: KpiDriver[] | undefined = (() => {
    if (!overdueAgeing) return undefined;
    const drivers: KpiDriver[] = [];
    const overdueCount = overdueAgeing.buckets.filter((b) => b.key !== "current").reduce((s, b) => s + b.count, 0);
    const overdueTotal = overdueAgeing.buckets.filter((b) => b.key !== "current").reduce((s, b) => s + b.total, 0);
    if (overdueCount > 0) drivers.push({ sign: "−", title: `${overdueCount} account(s) overdue`, note: `${formatCurrency(overdueTotal, currency)} aged past the current period` });
    if (collectedToday != null && collectedToday > 0) drivers.push({ sign: "+", title: "Recovered today", note: `${formatCurrency(collectedToday, currency)} collected so far today` });
    return drivers.length > 0 ? drivers : undefined;
  })();

  const creditRecords: KpiSourceRecord[] = (debtors ?? []).slice(0, 10).map((d) => ({ id: d.name, when: `${d.daysOutstanding}d outstanding`, who: d.phone, amount: formatCurrency(d.balance, currency) }));

  const bookingsDrivers: KpiDriver[] | undefined = (() => {
    if (!todaysBookingsList || !yesterdaysBookings) return undefined;
    const delta = todaysBookingsList.length - yesterdaysBookings.length;
    if (delta === 0) return undefined;
    return [{ sign: delta > 0 ? "+" : "−", title: delta > 0 ? "More bookings than yesterday" : "Fewer bookings than yesterday", note: `${todaysBookingsList.length} today vs ${yesterdaysBookings.length} yesterday` }];
  })();

  const bookingsRecords: KpiSourceRecord[] = (todaysBookingsList ?? [])
    .slice()
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    .map((b) => ({ id: new Date(b.startsAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }), when: b.serviceName, who: b.customerName, amount: "" }));

  const pendingOrdersRecords: KpiSourceRecord[] = (pendingOrders ?? []).map((o) => ({ id: `#${o.orderNo}`, when: formatTime(o.createdAt), who: o.customerName, amount: formatCurrency(o.total, currency) }));

  const ratingDrivers: KpiDriver[] | undefined = reviewsThisWeek > 0 ? [{ sign: "+", title: `${reviewsThisWeek} review${reviewsThisWeek === 1 ? "" : "s"} this week`, note: "Based on real reviews from connected platforms" }] : undefined;
  const ratingRecords: KpiSourceRecord[] = externalReviews.slice(0, 10).map((r) => ({ id: "★".repeat(r.stars), when: formatDate(r.createdAt), who: r.author ?? "Anonymous", amount: r.platform }));

  return (
    <>
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          label="Today's Sales"
          value={revenue ? formatCurrency(revenue.revenue, currency) : null}
          delta={salesDelta !== null ? { label: `${Math.abs(salesDelta).toFixed(1)}%`, up: salesDelta >= 0 } : undefined}
          prev={yesterdaySeries ? `${formatCurrency(yesterdaySeries.revenue, currency)} yesterday` : undefined}
          recs={orders ? `${orders.count} transaction${orders.count === 1 ? "" : "s"}` : undefined}
          updatedAt={revenueToday.dataUpdatedAt}
          onOpen={() => setDrawer("sales")}
        />
        <KpiCard
          label="Today's Profit"
          value={todaysOrders.length > 0 ? formatCurrency(todayProfit, currency) : null}
          placeholder="No sales yet today"
          delta={profitDelta !== null ? { label: `${Math.abs(profitDelta).toFixed(1)}%`, up: profitDelta >= 0 } : undefined}
          prev={yesterdaysOrders.length > 0 ? `${formatCurrency(yesterdayProfit, currency)} yesterday` : undefined}
          recs={todaysOrders.length > 0 ? `${todaysOrders.length} transaction${todaysOrders.length === 1 ? "" : "s"}` : undefined}
          onOpen={() => setDrawer("profit")}
        />
        <KpiCard
          label="New Reviews"
          value={formatNumber(todaysReviews.length)}
          badge={reviewsSummary ? `Avg ${reviewsSummary.averageRating.toFixed(1)}★` : undefined}
          prev={`${yesterdaysReviews.length} yesterday`}
          recs={`${externalReviews.length} review${externalReviews.length === 1 ? "" : "s"}`}
          updatedAt={reviewsSummaryQ.dataUpdatedAt}
          onOpen={() => setDrawer("rating")}
        />
        <KpiCard
          label="Credit Outstanding"
          value={credit ? formatCurrency(credit.balance ?? credit.amount ?? 0, currency) : null}
          needsAttention={(overdueAgeing?.atRisk.count ?? 0) > 0}
          updatedAt={creditOutstanding.dataUpdatedAt}
          onOpen={() => setDrawer("credit")}
        />
        <KpiCard
          label="Today's Bookings"
          value={bookings ? formatNumber(bookings.count) : null}
          delta={bookingsDelta !== null ? { label: `${Math.abs(bookingsDelta).toFixed(0)}%`, up: bookingsDelta >= 0 } : undefined}
          prev={yesterdaysBookings ? `${yesterdaysBookings.length} yesterday` : undefined}
          updatedAt={appointmentsToday.dataUpdatedAt}
          onOpen={() => setDrawer("bookings")}
        />
        <KpiCard
          label="Pending Orders"
          value={pendingOrders ? formatNumber(pendingOrders.length) : null}
          delta={pendingDelta !== null && pendingDelta !== 0 ? { label: `${Math.abs(pendingDelta)}`, up: pendingDelta >= 0 } : undefined}
          prev={pendingDelta !== null ? `${yesterdaysNewPending} new yesterday` : undefined}
          updatedAt={pendingOrdersQ.dataUpdatedAt}
          onOpen={() => setDrawer("orders")}
        />
      </div>

      <SlideDrawer open={drawer === "sales"} onClose={() => setDrawer(null)} title="Today's Sales">
        <KpiDrawerBody
          value={revenue ? formatCurrency(revenue.revenue, currency) : "—"}
          comparedWith={yesterdaySeries ? `${formatCurrency(yesterdaySeries.revenue, currency)} yesterday` : undefined}
          source={`Fast Sale + Orders · ${orders?.count ?? 0} transaction(s)`}
          drivers={salesDrivers}
          records={salesRecords}
          emptyRecordsLabel="No orders yet today."
        />
      </SlideDrawer>

      <SlideDrawer open={drawer === "profit"} onClose={() => setDrawer(null)} title="Today's Profit">
        <KpiDrawerBody
          value={todaysOrders.length > 0 ? formatCurrency(todayProfit, currency) : "—"}
          comparedWith={yesterdaysOrders.length > 0 ? `${formatCurrency(yesterdayProfit, currency)} yesterday` : undefined}
          source={`Revenue minus recorded cost of goods · ${todaysOrders.length} transaction(s)`}
          drivers={profitDrivers}
          records={profitRecords}
          emptyRecordsLabel="No sales yet today."
        />
      </SlideDrawer>

      <SlideDrawer open={drawer === "rating"} onClose={() => setDrawer(null)} title="New Reviews">
        <KpiDrawerBody
          value={formatNumber(todaysReviews.length)}
          comparedWith={`${yesterdaysReviews.length} yesterday`}
          source={`Real customer reviews across connected platforms · avg ${reviewsSummary ? reviewsSummary.averageRating.toFixed(1) : "—"}★`}
          drivers={ratingDrivers}
          records={ratingRecords}
          emptyRecordsLabel="No reviews yet."
        />
      </SlideDrawer>

      <SlideDrawer open={drawer === "credit"} onClose={() => setDrawer(null)} title="Credit Outstanding">
        <KpiDrawerBody
          value={credit ? formatCurrency(credit.balance ?? credit.amount ?? 0, currency) : "—"}
          source={`Credit ledger · ${debtors?.length ?? 0} customer(s) with a balance`}
          drivers={creditDrivers}
          records={creditRecords}
          emptyRecordsLabel="No outstanding credit."
        />
        <p className="mt-3 text-[11px]" style={{ color: "var(--app-text-disabled)" }}>
          There's no week-over-week comparison here yet — the backend doesn't keep a historical snapshot of this balance, only its current value.
        </p>
      </SlideDrawer>

      <SlideDrawer open={drawer === "bookings"} onClose={() => setDrawer(null)} title="Today's Bookings">
        <KpiDrawerBody
          value={bookings ? formatNumber(bookings.count) : "—"}
          comparedWith={yesterdaysBookings ? `${yesterdaysBookings.length} yesterday` : undefined}
          source="Real appointments scheduled today"
          drivers={bookingsDrivers}
          records={bookingsRecords}
          emptyRecordsLabel="No bookings today."
        />
      </SlideDrawer>

      <SlideDrawer open={drawer === "orders"} onClose={() => setDrawer(null)} title="Pending Orders">
        <KpiDrawerBody
          value={pendingOrders ? formatNumber(pendingOrders.length) : "—"}
          source="Real orders still awaiting fulfillment"
          records={pendingOrdersRecords}
          emptyRecordsLabel="No pending orders."
        />
      </SlideDrawer>
    </>
  );
}
