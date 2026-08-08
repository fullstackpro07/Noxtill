"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { fetchProfitByProduct } from "@/lib/profit-api";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ProfitProductsTab({ currency }: { currency: string }) {
  const [window, setWindow] = useState<30 | 90>(30);

  const {
    data,
    isPending,
    isError,
    refetch,
  } = useQuery({ queryKey: ["profit-products", window], queryFn: () => fetchProfitByProduct(window) });

  const products = data?.products ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end gap-1 rounded-full bg-surface-2 p-1 self-end">
        {([30, 90] as const).map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setWindow(w)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              window === w ? "bg-surface text-fg shadow-[var(--shadow-sm)]" : "text-fg-muted hover:text-fg",
            )}
          >
            {w} days
          </button>
        ))}
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load product profit" description="Check your connection and try again." onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="No sales in this window"
          description={`No completed sales in the last ${window} days yet.`}
        />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                <th className="px-4 py-3 text-start">Product</th>
                <th className="px-4 py-3 text-start">Units</th>
                <th className="px-4 py-3 text-start">Revenue</th>
                <th className="px-4 py-3 text-start">Profit</th>
                <th className="px-4 py-3 text-start">Margin</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.productId} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                  <td className="px-4 py-3 font-medium text-fg">
                    <div className="flex items-center gap-1.5">
                      {p.isTopPerformer && <Star className="h-3.5 w-3.5 shrink-0 fill-accent text-accent" aria-hidden />}
                      {p.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{p.units}</td>
                  <td className="px-4 py-3 text-fg-muted">{formatCurrency(p.revenue, currency)}</td>
                  <td className="px-4 py-3 text-fg-muted">{formatCurrency(p.profit, currency)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "font-medium",
                        p.reviewPricing ? "text-destructive" : p.margin < 30 ? "text-accent-foreground" : "text-whatsapp",
                      )}
                    >
                      {p.margin.toFixed(0)}%
                    </span>
                    {p.reviewPricing && (
                      <Badge tone="danger" className="ms-2">
                        <AlertTriangle className="h-3 w-3" aria-hidden />
                        Low margin
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
