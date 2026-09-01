"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonCard, SkeletonRow } from "@/components/shared/skeleton";
import { fetchStockMovements, type StockMovementRow, type MovementKind } from "@/lib/inventory-api";
import { fetchProducts } from "@/lib/products-api";
import { formatDate } from "@/lib/format";

const KIND_LABEL: Record<MovementKind, string> = {
  purchase: "Purchase",
  sale: "Sale",
  wastage: "Wastage",
  adjustment: "Adjustment",
  return: "Return",
  transfer_out: "Transfer out",
  transfer_in: "Transfer in",
};

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "danger" | "good" }) {
  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <span className="text-xs font-medium text-fg-faint">{label}</span>
      <p className={`mt-1 font-display text-xl font-bold ${tone === "danger" ? "text-destructive" : tone === "good" ? "text-whatsapp" : "text-fg"}`}>
        {value}
      </p>
    </div>
  );
}

export function StockMovementsView() {
  const [productId, setProductId] = useState("");
  const [kind, setKind] = useState<MovementKind | "">("");
  const [selected, setSelected] = useState<StockMovementRow | null>(null);

  const { data: products = [] } = useQuery({ queryKey: ["products", "active"], queryFn: () => fetchProducts({ active: true }) });
  const { data: movements = [], isPending, isError, refetch } = useQuery({
    queryKey: ["stock-movements", productId, kind],
    queryFn: () => fetchStockMovements({ productId: productId || undefined, kind: kind || undefined }),
  });

  const sums = useMemo(() => {
    const byKind: Record<string, number> = {};
    for (const m of movements) byKind[m.kind] = (byKind[m.kind] ?? 0) + Math.abs(m.qty);
    const netChange = movements.reduce((sum, m) => sum + m.qty, 0);
    return { byKind, netChange };
  }, [movements]);

  if (isError) {
    return <ErrorBanner title="Couldn't load stock movements" description="Check your connection and try again." onRetry={() => refetch()} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {isPending ? (
          Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard label="Purchases" value={String(sums.byKind.purchase ?? 0)} />
            <StatCard label="Sales" value={String(sums.byKind.sale ?? 0)} />
            <StatCard label="Wastage" value={String(sums.byKind.wastage ?? 0)} />
            <StatCard label="Adjustments" value={String(sums.byKind.adjustment ?? 0)} />
            <StatCard label="Net change" value={`${sums.netChange > 0 ? "+" : ""}${sums.netChange}`} tone={sums.netChange >= 0 ? "good" : "danger"} />
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-2.5">
        <Select value={productId} onChange={(e) => setProductId(e.target.value)} className="w-56">
          <option value="">All products</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select value={kind} onChange={(e) => setKind(e.target.value as MovementKind | "")} className="w-44">
          <option value="">All types</option>
          {Object.entries(KIND_LABEL).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      {isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : movements.length === 0 ? (
        <EmptyState icon={History} title="No movements match" description="Try a different product or type filter." />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                <th className="px-4 py-3 text-start">Product</th>
                <th className="px-4 py-3 text-start">Type</th>
                <th className="px-4 py-3 text-start">Qty</th>
                <th className="px-4 py-3 text-start">Resulting balance</th>
                <th className="px-4 py-3 text-start">Date</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2/50" onClick={() => setSelected(m)}>
                  <td className="px-4 py-3 font-medium text-fg">{m.productName}</td>
                  <td className="px-4 py-3 text-fg-muted">{KIND_LABEL[m.kind]}</td>
                  <td className={`px-4 py-3 font-medium tabular-nums ${m.qty > 0 ? "text-whatsapp" : "text-destructive"}`}>
                    {m.qty > 0 ? "+" : ""}
                    {m.qty}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-fg-muted">{m.resultingBalance}</td>
                  <td className="px-4 py-3 text-fg-muted">{formatDate(m.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <Dialog open onClose={() => setSelected(null)} title={selected.productName}>
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between">
              <span className="text-fg-muted">Type</span>
              <span className="font-medium text-fg">{KIND_LABEL[selected.kind]}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-muted">Quantity</span>
              <span className={`font-medium ${selected.qty > 0 ? "text-whatsapp" : "text-destructive"}`}>
                {selected.qty > 0 ? "+" : ""}
                {selected.qty}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-fg-muted">Resulting balance</span>
              <span className="font-medium text-fg">{selected.resultingBalance}</span>
            </div>
            {selected.supplierName && (
              <div className="flex justify-between">
                <span className="text-fg-muted">Supplier</span>
                <span className="font-medium text-fg">{selected.supplierName}</span>
              </div>
            )}
            <div className="border-t border-border pt-3">
              <p className="text-fg-muted">{selected.description}</p>
            </div>
            <div className="flex justify-between text-xs text-fg-faint">
              <span>Date</span>
              <span>{formatDate(selected.createdAt)}</span>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
