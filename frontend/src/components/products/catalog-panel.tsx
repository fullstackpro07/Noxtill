"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Search, Plus, LayoutGrid, List as ListIcon, Pencil, Package, Boxes } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { Button } from "@/components/ui/button";
import { ProductFormDrawer } from "./product-form-drawer";
import { marginPercent, type Product, type ProductKind } from "@/lib/products";
import { fetchProducts } from "@/lib/products-api";
import { fetchCategories } from "@/lib/categories-api";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type ViewMode = "table" | "grid";
type KindFilter = "all" | ProductKind;

function MarginBadge({ price, cost }: { price: number; cost: number }) {
  const margin = marginPercent(price, cost);
  return (
    <span className={cn("text-xs font-medium", margin < 10 ? "text-destructive" : margin < 30 ? "text-accent-foreground" : "text-whatsapp")}>
      {margin.toFixed(0)}%
    </span>
  );
}

export function CatalogPanel({ currency }: { currency: string }) {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [kind, setKind] = useState<KindFilter>("all");
  const [view, setView] = useState<ViewMode>("table");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const {
    data: products = [],
    isPending,
    isError,
    refetch,
  } = useQuery({ queryKey: ["products"], queryFn: () => fetchProducts() });
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories, staleTime: 5 * 60 * 1000 });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !p.sku?.toLowerCase().includes(q)) return false;
      if (categoryId !== "all" && p.categoryId !== categoryId) return false;
      if (kind !== "all" && p.kind !== kind) return false;
      return true;
    });
  }, [products, query, categoryId, kind]);

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(product: Product) {
    setEditing(product);
    setFormOpen(true);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">{products.length} items in your catalog</p>
        <div className="flex items-center gap-2">
          <Link href="/inventory">
            <Button variant="outline" size="sm">
              <Boxes className="h-4 w-4" aria-hidden />
              Inventory
            </Button>
          </Link>
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4" aria-hidden />
            Add product
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="min-w-56 flex-1">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products…"
            leadingSlot={<Search className="h-4 w-4" aria-hidden />}
          />
        </div>
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-40">
          <option value="all">All categories</option>
          {(categories ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select value={kind} onChange={(e) => setKind(e.target.value as KindFilter)} className="w-36">
          <option value="all">All kinds</option>
          <option value="product">Products</option>
          <option value="service">Services</option>
        </Select>
        <div className="flex gap-1 rounded-full bg-surface-2 p-1">
          <button
            type="button"
            aria-label="Table view"
            onClick={() => setView("table")}
            className={cn("flex h-8 w-8 items-center justify-center rounded-full", view === "table" ? "bg-surface shadow-[var(--shadow-sm)]" : "text-fg-faint")}
          >
            <ListIcon className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Grid view"
            onClick={() => setView("grid")}
            className={cn("flex h-8 w-8 items-center justify-center rounded-full", view === "grid" ? "bg-surface shadow-[var(--shadow-sm)]" : "text-fg-faint")}
          >
            <LayoutGrid className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load products" description="Check your connection and try again." onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title={products.length === 0 ? "No products yet" : "No products match"}
          description={products.length === 0 ? "Add your first product to get started." : "Try a different search or filter."}
          action={products.length === 0 ? { label: "Add product", onClick: openAdd } : undefined}
        />
      ) : view === "table" ? (
        <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                <th className="px-4 py-3 text-start">Name</th>
                <th className="px-4 py-3 text-start">Category</th>
                <th className="px-4 py-3 text-start">Price</th>
                <th className="px-4 py-3 text-start">Margin</th>
                <th className="px-4 py-3 text-start">Stock</th>
                <th className="px-4 py-3 text-start" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-fg">{p.name}</p>
                    {!p.active && (
                      <Badge tone="neutral" className="mt-0.5">
                        Inactive
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{p.category}</td>
                  <td className="px-4 py-3 text-fg">{formatCurrency(p.price, currency)}</td>
                  <td className="px-4 py-3">
                    <MarginBadge price={p.price} cost={p.costPrice} />
                  </td>
                  <td className="px-4 py-3 text-fg-muted">
                    {p.kind === "service" ? (
                      <span className="text-xs text-fg-faint">{p.durationMinutes} min</span>
                    ) : (p.stockOnHand ?? 0) <= (p.lowStockThreshold ?? 0) ? (
                      <span className="text-destructive">{p.stockOnHand} low</span>
                    ) : (
                      p.stockOnHand
                    )}
                  </td>
                  <td className="px-4 py-3 text-end">
                    <button
                      onClick={() => openEdit(p)}
                      aria-label={`Edit ${p.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-fg-faint hover:bg-surface-2 hover:text-fg"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => openEdit(p)}
              className="flex flex-col rounded-[var(--radius-noxtill)] border border-border bg-surface p-4 text-start transition-colors hover:border-border-strong"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-fg">{p.name}</p>
                {!p.active && <Badge tone="neutral">Inactive</Badge>}
              </div>
              <p className="mt-0.5 text-xs text-fg-faint">{p.category}</p>
              <div className="mt-3 flex items-center justify-between">
                <p className="font-display text-base font-bold text-fg">{formatCurrency(p.price, currency)}</p>
                <MarginBadge price={p.price} cost={p.costPrice} />
              </div>
            </button>
          ))}
        </div>
      )}

      <ProductFormDrawer open={formOpen} onClose={() => setFormOpen(false)} product={editing} />
    </div>
  );
}
