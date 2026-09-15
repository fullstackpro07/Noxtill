"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchRevenueSeries, fetchBookingsSeries } from "@/lib/analytics-api";
import { fetchProfitByTime } from "@/lib/profit-api";
import { formatCurrency, formatNumber } from "@/lib/format";

type Range = 7 | 30 | 90;
type Mode = "trend" | "hour";
type Overlay = "orders" | "bookings";

const RANGES: Range[] = [7, 30, 90];
const OVERLAY_COLOR: Record<Overlay, string> = { orders: "#2563EB", bookings: "#9333EA" };
const OVERLAY_LABEL: Record<Overlay, string> = { orders: "Orders", bookings: "Bookings" };

/** Real day-by-day revenue trend from /analytics/revenue-series — the design's 7D/30D/90D range
 * selector, backed by actual data instead of demo numbers. "Sales by hour" mode uses the same
 * real hourly-today source as before. Fix-it: the design's 3-series overlay (Sales/Orders/Bookings)
 * now has real data for all three — Orders comes free from revenue-series' own `orders` field,
 * Bookings from the new /analytics/bookings-series. Orders/Bookings are drawn on their own
 * independently-normalized scale (each line spans the chart on its own real min/max) since their
 * units (counts) have nothing to do with Sales' currency scale — the left axis stays Sales-only. */
export function BusinessOverviewCard({ currency }: { currency: string }) {
  const [mode, setMode] = useState<Mode>("trend");
  const [range, setRange] = useState<Range>(30);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [overlays, setOverlays] = useState<Set<Overlay>>(new Set(["orders", "bookings"]));

  const { data: series, isPending: seriesPending } = useQuery({
    queryKey: ["revenue-series", range],
    queryFn: () => fetchRevenueSeries(range),
    enabled: mode === "trend",
  });
  const { data: bookingsSeries } = useQuery({
    queryKey: ["bookings-series", range],
    queryFn: () => fetchBookingsSeries(range),
    enabled: mode === "trend",
  });
  const { data: hourly, isPending: hourlyPending } = useQuery({
    queryKey: ["profit-by-time"],
    queryFn: fetchProfitByTime,
    enabled: mode === "hour",
  });

  function toggleOverlay(key: Overlay) {
    setOverlays((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const chart = useMemo(() => {
    if (!series || series.length === 0) return null;
    const W = 660, L = 46, R = 12, T = 14, B = 40, PH = 268 - T - B, PW = W - L - R;
    const max = Math.max(1, ...series.map((d) => d.revenue));
    const x = (i: number) => L + (series.length === 1 ? 0 : i * (PW / (series.length - 1)));
    const y = (v: number) => T + PH * (1 - v / max);
    const pts = series.map((d, i) => ({ x: x(i), y: y(d.revenue) }));
    const line = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const area = `${line} L${pts[pts.length - 1].x.toFixed(1)} ${T + PH} L${pts[0].x.toFixed(1)} ${T + PH} Z`;
    const gridVals = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
    const grid = gridVals.map((v) => ({ y: y(v), label: v >= 1000 ? `${(v / 1000).toFixed(0)}K` : Math.round(v).toString() }));
    const labelEvery = Math.max(1, Math.ceil(series.length / 7));
    const xlabels = series
      .map((d, i) => ({ i, x: x(i), label: new Date(d.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) }))
      .filter((l) => l.i % labelEvery === 0);

    const bookingsByDate = new Map((bookingsSeries ?? []).map((b) => [b.date, b.bookings]));
    const ordersValues = series.map((d) => d.orders);
    const bookingsValues = series.map((d) => bookingsByDate.get(d.date) ?? 0);

    function normalizedLine(values: number[]): string {
      const vmax = Math.max(1, ...values);
      const pts2 = values.map((v, i) => ({ x: x(i), y: T + PH * (1 - v / vmax) }));
      return pts2.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    }

    return {
      pts,
      line,
      area,
      grid,
      xlabels,
      W,
      PH,
      T,
      ordersValues,
      bookingsValues,
      ordersLine: normalizedLine(ordersValues),
      bookingsLine: normalizedLine(bookingsValues),
    };
  }, [series, bookingsSeries]);

  const total = series?.reduce((sum, d) => sum + d.revenue, 0) ?? 0;
  const isPending = mode === "trend" ? seriesPending : hourlyPending;

  return (
    <div className="rounded-[14px] p-[18px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold" style={{ color: "var(--app-text)" }}>
          Business Overview
        </h2>
        {mode === "trend" && (
          <div className="flex gap-1 rounded-[9px] p-[3px]" style={{ background: "var(--app-surface-2)" }}>
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className="rounded-[7px] px-[11px] py-[5px] text-[11.5px] font-bold"
                style={range === r ? { background: "var(--app-primary)", color: "#fff" } : { color: "var(--app-text-faintest)" }}
              >
                {r}D
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="mb-1 mt-3 flex flex-wrap items-center gap-[18px]">
        <span className="flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: "var(--app-text-faint)" }}>
          <span className="h-2 w-2 rounded-full" style={{ background: "var(--app-primary)" }} />
          Sales ({currency})
        </span>
        {mode === "trend" &&
          (["orders", "bookings"] as Overlay[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleOverlay(key)}
              className="flex items-center gap-1.5 text-[11.5px] font-semibold"
              style={{ color: overlays.has(key) ? "var(--app-text-faint)" : "var(--app-text-disabled)", opacity: overlays.has(key) ? 1 : 0.5 }}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: OVERLAY_COLOR[key], borderTop: overlays.has(key) ? "none" : `1.5px dashed ${OVERLAY_COLOR[key]}` }} />
              {OVERLAY_LABEL[key]}
            </button>
          ))}
        <button
          type="button"
          onClick={() => setMode((m) => (m === "trend" ? "hour" : "trend"))}
          className="ml-auto rounded-[8px] px-2.5 py-1 text-[11px] font-semibold"
          style={{ border: "1px solid var(--app-border)", color: "var(--app-text-faint)" }}
        >
          {mode === "trend" ? "Sales by hour" : "Show trend"}
        </button>
      </div>
      <p className="mb-1 text-[20px] font-extrabold" style={{ color: "var(--app-text)" }}>
        {mode === "trend" ? formatCurrency(total, currency) : formatCurrency(hourly?.hourly.reduce((s, h) => s + h.revenue, 0) ?? 0, currency)}
      </p>

      {isPending ? (
        <div className="h-[268px] animate-pulse rounded-md" style={{ background: "var(--app-surface-2)" }} />
      ) : mode === "trend" ? (
        !chart ? (
          <p className="py-10 text-center text-[13px]" style={{ color: "var(--app-text-faintest)" }}>No sales recorded in this range yet.</p>
        ) : (
          <svg viewBox={`0 0 ${chart.W} 268`} className="block w-full" style={{ height: 268 }} onMouseLeave={() => setHoverIdx(null)}>
            {chart.grid.map((g, i) => (
              <g key={i}>
                <line x1={46} y1={g.y} x2={chart.W - 12} y2={g.y} stroke="var(--app-border)" strokeDasharray="4 4" />
                <text x={40} y={g.y + 3.5} textAnchor="end" fontSize={10.5} fill="var(--app-text-disabled)" fontWeight={600}>{g.label}</text>
              </g>
            ))}
            <path d={chart.area} fill="var(--app-primary)" opacity={0.1} />
            {overlays.has("orders") && (
              <path d={chart.ordersLine} fill="none" stroke={OVERLAY_COLOR.orders} strokeWidth={1.6} strokeDasharray="4 3" strokeLinejoin="round" opacity={0.85} />
            )}
            {overlays.has("bookings") && (
              <path d={chart.bookingsLine} fill="none" stroke={OVERLAY_COLOR.bookings} strokeWidth={1.6} strokeDasharray="4 3" strokeLinejoin="round" opacity={0.85} />
            )}
            <path d={chart.line} fill="none" stroke="var(--app-primary)" strokeWidth={2} strokeLinejoin="round" />
            {chart.pts.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={hoverIdx === i ? 4 : 2.6}
                fill="#fff"
                stroke="var(--app-primary)"
                strokeWidth={1.6}
                onMouseEnter={() => setHoverIdx(i)}
              />
            ))}
            {chart.xlabels.map((l, i) => (
              <text key={i} x={l.x} y={258} textAnchor="middle" fontSize={11} fill="var(--app-text-faint)" fontWeight={600}>{l.label}</text>
            ))}
            {hoverIdx !== null && series && (
              <>
                <line x1={chart.pts[hoverIdx].x} y1={14} x2={chart.pts[hoverIdx].x} y2={chart.PH + chart.T} stroke="var(--app-primary)" strokeDasharray="3 3" />
                <text x={Math.min(chart.W - 70, Math.max(70, chart.pts[hoverIdx].x))} y={26} textAnchor="middle" fontSize={11.5} fontWeight={700} fill="var(--app-text)">
                  {formatCurrency(series[hoverIdx].revenue, currency)}
                </text>
                <text x={Math.min(chart.W - 70, Math.max(70, chart.pts[hoverIdx].x))} y={40} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--app-text-faint)">
                  {formatNumber(chart.ordersValues[hoverIdx])} order(s) · {formatNumber(chart.bookingsValues[hoverIdx])} booking(s)
                </text>
              </>
            )}
          </svg>
        )
      ) : !hourly || hourly.hourly.length === 0 ? (
        <p className="py-10 text-center text-[13px]" style={{ color: "var(--app-text-faintest)" }}>No sales recorded yet today.</p>
      ) : (
        <div className="flex h-[268px] items-end gap-1">
          {hourly.hourly.map((h) => {
            const max = Math.max(1, ...hourly.hourly.map((x) => x.revenue));
            return (
              <div key={h.hour} className="group relative flex h-full flex-1 flex-col items-center justify-end" title={`${h.hour}:00 — ${formatCurrency(h.revenue, currency)}`}>
                <div className="w-full rounded-t-[3px]" style={{ height: `${Math.max(2, (h.revenue / max) * 100)}%`, background: "var(--app-primary)" }} />
                <span className="mt-1 text-[8px]" style={{ color: "var(--app-text-disabled)" }}>{h.hour}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
