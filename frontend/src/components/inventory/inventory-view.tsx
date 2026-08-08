"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Search, Boxes, History, PackagePlus, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { MovementHistoryDrawer } from "./movement-history-drawer";
import { PurchaseDialog } from "./purchase-drawer";
import { WastageDialog } from "./wastage-drawer";
import { fetchInventory, type InventoryStatus, type LiveInventoryItem } from "@/lib/inventory-api";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | InventoryStatus;

const STATUS_LABEL: Record<InventoryStatus, string> = {
  ok: "In stock",
  low_stock: "Low stock",
  out_of_stock: "Out of stock",
};

export function InventoryView({ currency }: { currency: string }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [supplier, setSupplier] = useState("all");
  const [historyItem, setHistoryItem] = useState<LiveInventoryItem | null>(null);
  const [purchaseItem, setPurchaseItem] = useState<LiveInventoryItem | null>(null);
  const [wastageItem, setWastageItem] = useState<LiveInventoryItem | null>(null);

  const {
    data: items = [],
    isPending,
    isError,
    refetch,
  } = useQuery({ queryKey: ["inventory"], queryFn: fetchInventory });

  const suppliers = useMemo(
    () => [...new Set(items.map((i) => i.supplier).filter((s): s is string => Boolean(s)))].sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (q && !item.name.toLowerCase().includes(q)) return false;
      if (status !== "all" && item.status !== status) return false;
      if (supplier !== "all" && item.supplier !== supplier) return false;
      return true;
    });
  }, [items, query, status, supplier]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg">Inventory</h1>
          <p className="mt-0.5 text-sm text-fg-muted">Stock levels, suppliers, and movement history</p>
        </div>
        <Link href="/products">
          <Button variant="outline" size="sm">
            Back to products
          </Button>
        </Link>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <div className="min-w-56 flex-1">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search inventory…"
            leadingSlot={<Search className="h-4 w-4" aria-hidden />}
          />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className="w-40">
          <option value="all">All statuses</option>
          <option value="low_stock">Low stock</option>
          <option value="out_of_stock">Out of stock</option>
          <option value="ok">In stock</option>
        </Select>
        <Select value={supplier} onChange={(e) => setSupplier(e.target.value)} className="w-56">
          <option value="all">All suppliers</option>
          {suppliers.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load inventory" description="Check your connection and try again." onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title={items.length === 0 ? "No stocked products yet" : "No items match"}
          description={items.length === 0 ? "Products you add with kind “Product” will show up here." : "Try a different search or filter."}
        />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                <th className="px-4 py-3 text-start">Item</th>
                <th className="px-4 py-3 text-start">Supplier</th>
                <th className="px-4 py-3 text-start">On hand</th>
                <th className="px-4 py-3 text-start">Value</th>
                <th className="px-4 py-3 text-start" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const low = item.status !== "ok";
                return (
                  <tr key={item.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                    <td className="px-4 py-3 font-medium text-fg">{item.name}</td>
                    <td className="px-4 py-3 text-fg-muted">{item.supplier ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={cn("font-medium", low ? "text-destructive" : "text-fg")}>{item.stockQty}</span>
                      {low && (
                        <span className="ms-1.5 inline-flex items-center gap-1 text-xs text-destructive">
                          <AlertTriangle className="h-3 w-3" aria-hidden />
                          {STATUS_LABEL[item.status].toLowerCase()}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-fg-muted">{formatCurrency(item.stockValue, currency)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setHistoryItem(item)}
                          aria-label={`View movement history for ${item.name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-fg-faint hover:bg-surface-2 hover:text-fg"
                        >
                          <History className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <button
                          onClick={() => setPurchaseItem(item)}
                          aria-label={`Record purchase for ${item.name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-fg-faint hover:bg-surface-2 hover:text-fg"
                        >
                          <PackagePlus className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <button
                          onClick={() => setWastageItem(item)}
                          aria-label={`Record wastage for ${item.name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-fg-faint hover:bg-destructive/8 hover:text-destructive"
                        >
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <MovementHistoryDrawer item={historyItem} onClose={() => setHistoryItem(null)} />
      <PurchaseDialog item={purchaseItem} onClose={() => setPurchaseItem(null)} />
      <WastageDialog item={wastageItem} onClose={() => setWastageItem(null)} />
    </div>
  );
}
