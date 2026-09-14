"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchOrders } from "@/lib/orders-api";

const ORDER_TYPE_LABEL: Record<string, string> = {
  counter: "In-Store",
  online: "Online",
  dine_in: "Dine-in",
  takeaway: "Takeaway",
  delivery: "Delivery",
};
const COLORS = ["#12A150", "#2563EB", "#9333EA", "#F97316", "#0D9488"];

/** Real revenue-by-order-type split computed from the same order list Recent Orders uses — the
 * design's channel names (In-Store/Online/Bookings/Phone) don't map to a tracked field, so this
 * uses the real `orderType` categories the backend actually records. */
export function TopChannelsCard() {
  const { data, isPending } = useQuery({ queryKey: ["orders", "channels"], queryFn: () => fetchOrders() });

  const breakdown = useMemo(() => {
    if (!data || data.length === 0) return [];
    const totals = new Map<string, number>();
    for (const o of data) totals.set(o.orderType, (totals.get(o.orderType) ?? 0) + o.total);
    const grand = [...totals.values()].reduce((a, b) => a + b, 0) || 1;
    return [...totals.entries()]
      .map(([type, amount], i) => ({ type, label: ORDER_TYPE_LABEL[type] ?? type, pct: (amount / grand) * 100, color: COLORS[i % COLORS.length] }))
      .sort((a, b) => b.pct - a.pct);
  }, [data]);

  const C = 2 * Math.PI * 46;
  let acc = 0;

  return (
    <section className="rounded-[14px] p-[18px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
      <h2 className="mb-2 text-[15px] font-bold" style={{ color: "var(--app-text)" }}>Top Channels</h2>
      {isPending ? (
        <div className="h-[112px] animate-pulse rounded-full" style={{ background: "var(--app-surface-2)" }} />
      ) : breakdown.length === 0 ? (
        <p className="py-8 text-center text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>No orders yet.</p>
      ) : (
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 130 130" className="h-28 w-28 shrink-0">
            <g transform="rotate(-90 65 65)">
              {breakdown.map((b) => {
                const len = (b.pct / 100) * C;
                const el = (
                  <circle key={b.type} cx={65} cy={65} r={46} fill="none" stroke={b.color} strokeWidth={26} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} />
                );
                acc += len;
                return el;
              })}
            </g>
            <circle cx={65} cy={65} r={30} fill="var(--app-surface)" />
          </svg>
          <div className="flex flex-1 flex-col gap-2.5">
            {breakdown.map((b) => (
              <div key={b.type} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-[2px]" style={{ background: b.color }} />
                <span className="flex-1 text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{b.label}</span>
                <span className="text-[12px] font-bold" style={{ color: "var(--app-text)" }}>{b.pct.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
