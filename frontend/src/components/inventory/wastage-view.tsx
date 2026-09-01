"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonCard, SkeletonRow } from "@/components/shared/skeleton";
import { WastageDialog } from "@/components/inventory/wastage-drawer";
import { Button } from "@/components/ui/button";
import { fetchStockMovements, fetchInventory, type StockMovementRow, type LiveInventoryItem } from "@/lib/inventory-api";
import { formatCurrency, formatDate } from "@/lib/format";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <span className="text-xs font-medium text-fg-faint">{label}</span>
      <p className="mt-1 font-display text-xl font-bold text-fg">{value}</p>
    </div>
  );
}

function BarRow({ label, value, max, formatValue }: { label: string; value: number; max: number; formatValue: (v: number) => string }) {
  const pct = max > 0 ? Math.max((value / max) * 100, 2) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 truncate text-xs text-fg-muted">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-destructive" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 shrink-0 text-end text-xs tabular-nums text-fg-faint">{formatValue(value)}</span>
    </div>
  );
}

export function WastageView({ currency }: { currency: string }) {
  const [recordingFor, setRecordingFor] = useState<LiveInventoryItem | null>(null);

  const { data: products = [] } = useQuery({ queryKey: ["inventory"], queryFn: fetchInventory });
  const { data: movements = [], isPending, isError, refetch } = useQuery({
    queryKey: ["stock-movements", "", "wastage"],
    queryFn: () => fetchStockMovements({ kind: "wastage" }),
  });

  const thisMonth = new Date().toISOString().slice(0, 7);
  const wastageThisMonth = movements.filter((m) => m.createdAt.slice(0, 7) === thisMonth);

  const stats = useMemo(() => {
    const productCostByName = new Map<string, number>();
    for (const p of products) productCostByName.set(p.name, p.costPrice);

    const valueLost = wastageThisMonth.reduce((sum, m) => sum + Math.abs(m.qty) * (productCostByName.get(m.productName) ?? 0), 0);

    const byProduct = new Map<string, number>();
    for (const m of movements) byProduct.set(m.productName, (byProduct.get(m.productName) ?? 0) + Math.abs(m.qty));
    const topWasted = [...byProduct.entries()].sort((a, b) => b[1] - a[1])[0];

    const byReason = new Map<string, number>();
    for (const m of movements) {
      const reason = m.description || "Other";
      byReason.set(reason, (byReason.get(reason) ?? 0) + Math.abs(m.qty));
    }

    return {
      countThisMonth: wastageThisMonth.length,
      valueLost,
      topWasted: topWasted ? `${topWasted[0]} (${topWasted[1]})` : "—",
      byReason: [...byReason.entries()].sort((a, b) => b[1] - a[1]),
      byProduct: [...byProduct.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
    };
  }, [movements, wastageThisMonth, products]);

  const maxReasonQty = Math.max(1, ...stats.byReason.map(([, v]) => v));
  const maxProductQty = Math.max(1, ...stats.byProduct.map(([, v]) => v));

  if (isError) {
    return <ErrorBanner title="Couldn't load wastage" description="Check your connection and try again." onRetry={() => refetch()} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {isPending ? (
          Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard label="Wastage entries this month" value={String(stats.countThisMonth)} />
            <StatCard label="Value lost this month" value={formatCurrency(stats.valueLost, currency)} />
            <StatCard label="Top wasted product" value={stats.topWasted} />
          </>
        )}
      </div>

      {!isPending && movements.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
            <h3 className="mb-3 text-sm font-semibold text-fg">By reason</h3>
            <div className="flex flex-col gap-2.5">
              {stats.byReason.map(([reason, qty]) => (
                <BarRow key={reason} label={reason} value={qty} max={maxReasonQty} formatValue={(v) => String(v)} />
              ))}
            </div>
          </div>
          <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
            <h3 className="mb-3 text-sm font-semibold text-fg">By product</h3>
            <div className="flex flex-col gap-2.5">
              {stats.byProduct.map(([name, qty]) => (
                <BarRow key={name} label={name} value={qty} max={maxProductQty} formatValue={(v) => String(v)} />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-fg">All wastage entries</h3>
        <RecordWastageButton products={products} onPick={setRecordingFor} />
      </div>

      {isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : movements.length === 0 ? (
        <EmptyState icon={Trash2} title="No wastage recorded" description="Write-offs for expired, damaged, or stolen stock will show up here." />
      ) : (
        <WastageTable movements={movements} />
      )}

      <p className="text-xs text-fg-faint">
        Photo attachments for write-offs aren&apos;t supported yet — only quantity, reason, and a text note.
      </p>

      {recordingFor && <WastageDialog item={recordingFor} onClose={() => setRecordingFor(null)} />}
    </div>
  );
}

function WastageTable({ movements }: { movements: StockMovementRow[] }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
            <th className="px-4 py-3 text-start">Product</th>
            <th className="px-4 py-3 text-start">Qty</th>
            <th className="px-4 py-3 text-start">Reason / note</th>
            <th className="px-4 py-3 text-start">Date</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((m) => (
            <tr key={m.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
              <td className="px-4 py-3 font-medium text-fg">{m.productName}</td>
              <td className="px-4 py-3 tabular-nums text-destructive">{m.qty}</td>
              <td className="px-4 py-3 text-fg-muted">{m.description}</td>
              <td className="px-4 py-3 text-fg-muted">{formatDate(m.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecordWastageButton({ products, onPick }: { products: LiveInventoryItem[]; onPick: (item: LiveInventoryItem) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
        Record wastage
      </Button>
      {open && (
        <div className="absolute end-0 z-10 mt-1 max-h-64 w-64 overflow-y-auto rounded-[var(--radius-noxtill)] border border-border bg-surface shadow-lg">
          {products.length === 0 ? (
            <p className="p-3 text-xs text-fg-faint">No products.</p>
          ) : (
            products.map((p) => (
              <button
                key={p.id}
                className="block w-full truncate px-3 py-2 text-start text-sm text-fg hover:bg-surface-2"
                onClick={() => {
                  onPick(p);
                  setOpen(false);
                }}
              >
                {p.name}
                <span className="ms-1.5 text-xs text-fg-faint">({p.stockQty} on hand)</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
