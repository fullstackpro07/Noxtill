"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchOrders } from "@/lib/orders-api";
import { formatCurrency } from "@/lib/format";

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  pending: { bg: "#FEF6E7", fg: "#B54708", label: "Pending" },
  confirmed: { bg: "#EEF4FF", fg: "#3538CD", label: "Confirmed" },
  in_progress: { bg: "#EEF4FF", fg: "#3538CD", label: "In Progress" },
  completed: { bg: "#E8F7EE", fg: "#0E8442", label: "Completed" },
  cancelled: { bg: "#FEF3F2", fg: "#B42318", label: "Cancelled" },
};

export function RecentOrdersCard({ currency }: { currency: string }) {
  const { data, isPending } = useQuery({ queryKey: ["orders", "recent"], queryFn: () => fetchOrders() });
  const rows = [...(data ?? [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);

  return (
    <div
      className="rounded-[14px] p-[18px]"
      style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-bold" style={{ color: "var(--app-text)" }}>
          Recent Orders
        </h2>
        <Link href="/orders" className="text-[12px] font-bold" style={{ color: "var(--app-primary)" }}>
          View All
        </Link>
      </div>

      {isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded-md" style={{ background: "var(--app-surface-2)" }} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>
          No orders yet.
        </p>
      ) : (
        <div className="flex flex-col divide-y" style={{ borderColor: "var(--app-border)" }}>
          {rows.map((o) => {
            const style = STATUS_STYLE[o.status] ?? STATUS_STYLE.pending;
            return (
              <Link key={o.id} href="/orders" className="flex items-center justify-between gap-2 py-2 text-[12.5px]">
                <span className="flex-none font-semibold" style={{ color: "var(--app-primary)" }}>
                  #{o.orderNo}
                </span>
                <span className="min-w-0 flex-1 truncate" style={{ color: "var(--app-text-muted)" }}>
                  {o.customerName}
                </span>
                <span className="flex-none font-semibold" style={{ color: "var(--app-text)" }}>
                  {formatCurrency(o.total, currency)}
                </span>
                <span className="flex-none rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: style.bg, color: style.fg }}>
                  {style.label}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
