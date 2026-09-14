"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchProfitByProduct } from "@/lib/profit-api";
import { formatCurrency, formatNumber } from "@/lib/format";

export function TopProductsCard({ currency }: { currency: string }) {
  const { data, isPending } = useQuery({ queryKey: ["profit-by-product", 30], queryFn: () => fetchProfitByProduct(30) });
  const rows = [...(data?.products ?? [])].sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  return (
    <div
      className="rounded-[14px] p-[18px]"
      style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-bold" style={{ color: "var(--app-text)" }}>
          Top Selling Products
        </h2>
        <Link href="/products" className="text-[12px] font-bold" style={{ color: "var(--app-primary)" }}>
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
          No sales in the last 30 days.
        </p>
      ) : (
        <div className="flex flex-col divide-y" style={{ borderColor: "var(--app-border)" }}>
          {rows.map((p) => (
            <div key={p.productId} className="flex items-center justify-between gap-2 py-2 text-[12.5px]">
              <span className="min-w-0 flex-1 truncate" style={{ color: "var(--app-text-muted)" }}>
                {p.name}
              </span>
              <span className="flex-none" style={{ color: "var(--app-text-faintest)" }}>
                {formatNumber(p.units)} sold
              </span>
              <span className="flex-none font-semibold" style={{ color: "var(--app-text)" }}>
                {formatCurrency(p.revenue, currency)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
