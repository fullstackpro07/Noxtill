"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Plus, Trash2, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { fetchProducts } from "@/lib/products-api";
import { createBundle, deleteBundle, fetchBundleSuggestions, fetchBundles, type BundleSuggestion } from "@/lib/bundles-api";

export function BundlesPanel({ currency }: { currency: string }) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [prefill, setPrefill] = useState<BundleSuggestion | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);

  const { data: bundles, isPending, isError, refetch } = useQuery({ queryKey: ["bundles"], queryFn: fetchBundles });
  const { data: suggestions } = useQuery({ queryKey: ["bundle-suggestions"], queryFn: fetchBundleSuggestions });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteBundle(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bundles"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Bundle removed.");
      setDeleting(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't remove this bundle — please try again."),
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          New bundle
        </Button>
      </div>

      {suggestions && suggestions.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden />
              <CardTitle>AI suggestions</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {suggestions.map((s) => (
              <div key={`${s.productAId}-${s.productBId}`} className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-border px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-fg">{s.pitch}</p>
                  <p className="text-xs text-fg-faint">
                    Suggested bundle price {formatCurrency(s.suggestedPrice, currency)} (vs {formatCurrency(s.combinedPrice, currency)} separately)
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setPrefill(s)}>
                  Create
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {isError && <ErrorBanner title="Couldn't load bundles" onRetry={() => refetch()} />}

      {isPending && (
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <SkeletonRow />
            <SkeletonRow />
          </CardContent>
        </Card>
      )}

      {bundles && bundles.length === 0 && (
        <Card>
          <CardContent>
            <EmptyState icon={Boxes} title="No bundles yet" description="Combine products sold together into one sellable item." />
          </CardContent>
        </Card>
      )}

      {bundles && bundles.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {bundles.map((b) => {
            const margin = b.sellingPrice > 0 ? ((b.sellingPrice - b.costPrice) / b.sellingPrice) * 100 : 0;
            return (
              <Card key={b.id}>
                <CardContent className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-fg">{b.name}</p>
                    <p className="truncate text-xs text-fg-muted">{b.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</p>
                  </div>
                  <div className="text-end">
                    <p className="font-display text-base font-bold tabular-nums text-fg">{formatCurrency(b.sellingPrice, currency)}</p>
                    <p className={`text-xs font-medium ${margin < 10 ? "text-destructive" : margin < 30 ? "text-accent-foreground" : "text-whatsapp"}`}>
                      {margin.toFixed(0)}% margin
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setDeleting({ id: b.id, name: b.name })} aria-label="Remove">
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {(creating || prefill) && (
        <BundleFormDialog
          onClose={() => {
            setCreating(false);
            setPrefill(null);
          }}
          prefill={prefill}
          currency={currency}
        />
      )}

      <Dialog
        open={deleting != null}
        onClose={() => setDeleting(null)}
        title={deleting ? `Remove "${deleting.name}"?` : "Remove bundle"}
        description="The bundle's own product listing is deactivated — it stays on any past orders it was already sold on."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => deleting && deleteMutation.mutate(deleting.id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Removing…" : "Remove"}
            </Button>
          </>
        }
      />
    </div>
  );
}

function BundleFormDialog({ onClose, prefill, currency }: { onClose: () => void; prefill: BundleSuggestion | null; currency: string }) {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [sellingPrice, setSellingPrice] = useState(prefill ? String(prefill.suggestedPrice) : "");
  const [items, setItems] = useState<{ productId: string; qty: number }[]>(
    prefill ? [{ productId: prefill.productAId, qty: 1 }, { productId: prefill.productBId, qty: 1 }] : [],
  );
  const { data: products } = useQuery({ queryKey: ["products", "all-for-bundles"], queryFn: () => fetchProducts() });
  const queryClient = useQueryClient();

  const productById = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products]);
  const costPrice = items.reduce((sum, i) => sum + (productById.get(i.productId)?.costPrice ?? 0) * i.qty, 0);
  const margin = Number(sellingPrice) > 0 ? ((Number(sellingPrice) - costPrice) / Number(sellingPrice)) * 100 : 0;

  const mutation = useMutation({
    mutationFn: () =>
      createBundle({
        name,
        sku: sku || undefined,
        sellingPrice: Number(sellingPrice),
        items: items.filter((i) => i.productId),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bundles"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(`Bundle "${name}" created.`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't create this bundle — please try again."),
  });

  function updateItem(i: number, patch: Partial<{ productId: string; qty: number }>) {
    setItems((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  const validItems = items.filter((i) => i.productId).length;

  return (
    <Dialog
      open
      onClose={onClose}
      title="New bundle"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!name.trim() || validItems === 0 || !sellingPrice || mutation.isPending}>
            {mutation.isPending ? "Creating…" : "Create bundle"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="SKU (optional)" value={sku} onChange={(e) => setSku(e.target.value)} />

        <div>
          <p className="mb-1.5 text-sm font-medium text-fg">Items</p>
          <div className="flex flex-col gap-2">
            {items.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select value={item.productId} onChange={(e) => updateItem(i, { productId: e.target.value })} className="flex-1">
                  <option value="" disabled>
                    Select a product…
                  </option>
                  {(products ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
                <Input type="number" min={1} value={item.qty} onChange={(e) => updateItem(i, { qty: Math.max(1, Number(e.target.value)) })} className="w-20" />
                <Button variant="ghost" size="sm" onClick={() => setItems((rows) => rows.filter((_, idx) => idx !== i))} aria-label="Remove item">
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            ))}
          </div>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setItems((rows) => [...rows, { productId: "", qty: 1 }])}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add item
          </Button>
        </div>

        <Input label="Bundle selling price" type="number" min={0} step="0.01" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} />

        <div className="flex items-center justify-between rounded-[var(--radius-sm)] border border-border bg-surface-2/40 px-3.5 py-2.5 text-sm">
          <span className="text-fg-muted">Cost: {formatCurrency(costPrice, currency)}</span>
          <span className={`font-medium ${margin < 10 ? "text-destructive" : margin < 30 ? "text-accent-foreground" : "text-whatsapp"}`}>
            {margin.toFixed(1)}% margin
          </span>
        </div>
      </div>
    </Dialog>
  );
}
