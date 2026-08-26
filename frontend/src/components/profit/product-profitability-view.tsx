"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Star, Sliders } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonCard, SkeletonRow } from "@/components/shared/skeleton";
import { PriceAdjustmentDialog } from "./price-adjustment-dialog";
import { fetchProfitByProduct, type ProfitProductRow } from "@/lib/profit-api";
import { formatCurrency, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

const CONTRIBUTION_SLOTS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <span className="text-xs font-medium text-fg-faint">{label}</span>
      <p className={`mt-1 font-display text-xl font-bold ${tone === "danger" ? "text-destructive" : "text-fg"}`}>{value}</p>
    </div>
  );
}

/** A proportional profit-contribution breakdown, not a true 2D treemap (no treemap layout exists in this codebase) — each product's real share of total profit, honestly represented as a single-axis bar. */
function ProfitContributionBar({ products, currency }: { products: ProfitProductRow[]; currency: string }) {
  const positiveProfit = products.filter((p) => p.profit > 0);
  const totalProfit = positiveProfit.reduce((sum, p) => sum + p.profit, 0);
  const top = [...positiveProfit].sort((a, b) => b.profit - a.profit).slice(0, 8);
  const topTotal = top.reduce((sum, p) => sum + p.profit, 0);
  const other = totalProfit - topTotal;

  if (totalProfit <= 0) return <p className="text-sm text-fg-muted">No profitable sales in this window yet.</p>;

  return (
    <div>
      <div className="flex h-8 w-full overflow-hidden rounded-[6px]">
        {top.map((p, i) => (
          <div
            key={p.productId}
            title={`${p.name} — ${formatCurrency(p.profit, currency)} (${Math.round((p.profit / totalProfit) * 100)}%)`}
            style={{ width: `${(p.profit / totalProfit) * 100}%`, backgroundColor: CONTRIBUTION_SLOTS[i % CONTRIBUTION_SLOTS.length] }}
          />
        ))}
        {other > 0 && <div style={{ width: `${(other / totalProfit) * 100}%` }} className="bg-surface-2" />}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        {top.map((p, i) => (
          <span key={p.productId} className="flex items-center gap-1.5 text-fg-muted">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: CONTRIBUTION_SLOTS[i % CONTRIBUTION_SLOTS.length] }} />
            {p.name} · {Math.round((p.profit / totalProfit) * 100)}%
          </span>
        ))}
        {other > 0 && (
          <span className="flex items-center gap-1.5 text-fg-muted">
            <span className="h-2 w-2 shrink-0 rounded-full bg-surface-2" />
            Other · {Math.round((other / totalProfit) * 100)}%
          </span>
        )}
      </div>
    </div>
  );
}

export function ProductProfitabilityView({ currency }: { currency: string }) {
  const [window, setWindow] = useState<30 | 90>(30);
  const [adjustingProductId, setAdjustingProductId] = useState<string | null>(null);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["profit-products", window],
    queryFn: () => fetchProfitByProduct(window),
  });

  const products = data?.products ?? [];
  const totalRevenue = products.reduce((sum, p) => sum + p.revenue, 0);
  const totalProfit = products.reduce((sum, p) => sum + p.profit, 0);
  const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const lowMarginCount = products.filter((p) => p.reviewPricing).length;

  if (isError) {
    return <ErrorBanner title="Couldn't load product profit" description="Check your connection and try again." onRetry={() => refetch()} />;
  }

  return (
    <div className="flex flex-col gap-6">
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {isPending ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard label="Revenue" value={formatCurrency(totalRevenue, currency)} />
            <StatCard label="Profit" value={formatCurrency(totalProfit, currency)} />
            <StatCard label="Avg margin" value={formatPercent(avgMargin)} />
            <StatCard label="Low-margin products" value={String(lowMarginCount)} tone={lowMarginCount > 0 ? "danger" : undefined} />
          </>
        )}
      </div>

      {!isPending && products.length > 0 && (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
          <p className="mb-4 text-sm font-medium text-fg">Profit contribution by product</p>
          <ProfitContributionBar products={products} currency={currency} />
        </div>
      )}

      {isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : products.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="No sales in this window" description={`No completed sales in the last ${window} days yet.`} />
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
                <th className="px-4 py-3 text-end">Actions</th>
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
                  <td className="px-4 py-3 text-end">
                    <Button variant="ghost" size="sm" onClick={() => setAdjustingProductId(p.productId)}>
                      <Sliders className="h-3.5 w-3.5" aria-hidden />
                      Adjust price
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adjustingProductId && <PriceAdjustmentDialog productId={adjustingProductId} onClose={() => setAdjustingProductId(null)} />}
    </div>
  );
}
