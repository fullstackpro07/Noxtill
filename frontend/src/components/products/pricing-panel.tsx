"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Wand2, Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { PermissionLockCard } from "@/components/shared/permission-lock-card";
import { SkeletonRow } from "@/components/shared/skeleton";
import { useSession } from "@/lib/session";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { fetchProducts } from "@/lib/products-api";
import { fetchCategories } from "@/lib/categories-api";
import { bulkPrice, fetchPriceHistory, fetchPriceSuggestion, type BulkPriceResult } from "@/lib/pricing-api";

/** Pricing, full spec parity (UPD-FE-013e) — tightened to Owner-only; Suppliers stays Owner+Manager. */
export function PricingPanel({ currency }: { currency: string }) {
  const session = useSession();
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [whatIfFor, setWhatIfFor] = useState<string | null>(null);
  const [printOpen, setPrintOpen] = useState(false);

  const { data: products } = useQuery({ queryKey: ["products", "all-for-pricing"], queryFn: () => fetchProducts() });

  if (session.user.role !== "owner") {
    return <PermissionLockCard description="Pricing tools are limited to the business owner." />;
  }

  return (
    <div className="flex flex-col gap-5">
      <BulkPriceTool currency={currency} />

      <Card>
        <CardHeader>
          <CardTitle>Margin distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <MarginHistogram products={products ?? []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-product tools</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={historyFor ?? ""} onChange={(e) => setHistoryFor(e.target.value || null)} className="w-56" aria-label="View price history for">
              <option value="">View price history for…</option>
              {(products ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <History className="h-4 w-4 text-fg-faint" aria-hidden />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={whatIfFor ?? ""} onChange={(e) => setWhatIfFor(e.target.value || null)} className="w-56" aria-label="What-if estimate for">
              <option value="">What-if price estimate for…</option>
              {(products ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <Wand2 className="h-4 w-4 text-fg-faint" aria-hidden />
          </div>
          <Button variant="outline" size="sm" className="mt-1 self-start" onClick={() => setPrintOpen(true)}>
            <Printer className="h-3.5 w-3.5" aria-hidden />
            Generate price poster
          </Button>
        </CardContent>
      </Card>

      <PriceHistoryDialog productId={historyFor} onClose={() => setHistoryFor(null)} products={products ?? []} currency={currency} />
      <WhatIfDialog productId={whatIfFor} onClose={() => setWhatIfFor(null)} products={products ?? []} currency={currency} />
      {printOpen && <PricePosterDialog onClose={() => setPrintOpen(false)} products={products ?? []} currency={currency} businessName={session.business.name} />}
    </div>
  );
}

function BulkPriceTool({ currency }: { currency: string }) {
  const [scope, setScope] = useState<"category" | "all">("all");
  const [categoryId, setCategoryId] = useState("");
  const [mode, setMode] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("");
  const [preview, setPreview] = useState<BulkPriceResult | null>(null);
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const queryClient = useQueryClient();

  const previewMutation = useMutation({
    mutationFn: () => bulkPrice({ category: scope === "category" ? categories?.find((c) => c.id === categoryId)?.name : undefined, mode, value: Number(value), dryRun: true }),
    onSuccess: (result) => setPreview(result),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't preview this price change."),
  });

  const applyMutation = useMutation({
    mutationFn: () => bulkPrice({ category: scope === "category" ? categories?.find((c) => c.id === categoryId)?.name : undefined, mode, value: Number(value), dryRun: false }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(`Updated ${result.changes.length} product price(s).`);
      setPreview(null);
      setValue("");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't apply this price change."),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bulk price change</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} className="w-36">
            <option value="all">All products</option>
            <option value="category">By category</option>
          </Select>
          {scope === "category" && (
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-44">
              <option value="" disabled>
                Select a category…
              </option>
              {(categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
          <Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className="w-32">
            <option value="percent">Percent</option>
            <option value="amount">Amount</option>
          </Select>
          <Input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={mode === "percent" ? "e.g. 10 or -5" : "e.g. 2 or -1"}
            className="w-32"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => previewMutation.mutate()}
            disabled={!value || (scope === "category" && !categoryId) || previewMutation.isPending}
          >
            Preview
          </Button>
        </div>

        {preview && (
          <div className="flex flex-col gap-2">
            <div className="max-h-64 overflow-y-auto rounded-[var(--radius-sm)] border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-fg-faint">
                    <th className="px-3 py-1.5 font-medium">Product</th>
                    <th className="px-3 py-1.5 text-end font-medium">Old</th>
                    <th className="px-3 py-1.5 text-end font-medium">New</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.changes.map((c) => (
                    <tr key={c.productId}>
                      <td className="px-3 py-1.5 text-fg">{c.name}</td>
                      <td className="px-3 py-1.5 text-end tabular-nums text-fg-muted">{formatCurrency(c.oldPrice, currency)}</td>
                      <td className="px-3 py-1.5 text-end tabular-nums text-fg">{formatCurrency(c.newPrice, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => applyMutation.mutate()} disabled={applyMutation.isPending}>
                {applyMutation.isPending ? "Applying…" : `Apply to ${preview.changes.length} product(s)`}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>
                Discard preview
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const MARGIN_BUCKETS = [
  { label: "<0%", min: -Infinity, max: 0 },
  { label: "0–10%", min: 0, max: 10 },
  { label: "10–20%", min: 10, max: 20 },
  { label: "20–30%", min: 20, max: 30 },
  { label: "30–50%", min: 30, max: 50 },
  { label: "50%+", min: 50, max: Infinity },
];

function MarginHistogram({ products }: { products: { price: number; costPrice: number }[] }) {
  const counts = useMemo(() => {
    return MARGIN_BUCKETS.map((bucket) => {
      const count = products.filter((p) => {
        const margin = p.price > 0 ? ((p.price - p.costPrice) / p.price) * 100 : 0;
        return margin >= bucket.min && margin < bucket.max;
      }).length;
      return { ...bucket, count };
    });
  }, [products]);
  const max = Math.max(...counts.map((c) => c.count), 1);

  if (products.length === 0) {
    return <p className="text-sm text-fg-faint">No products yet.</p>;
  }

  return (
    <div className="flex items-end gap-3" style={{ height: 140 }}>
      {counts.map((bucket) => (
        <div key={bucket.label} className="flex flex-1 flex-col items-center gap-1.5">
          <span className="text-xs tabular-nums text-fg-muted">{bucket.count}</span>
          <div
            className="w-full rounded-t-[var(--radius-sm)] bg-primary/70"
            style={{ height: `${Math.max(4, (bucket.count / max) * 100)}px` }}
          />
          <span className="text-xs text-fg-faint">{bucket.label}</span>
        </div>
      ))}
    </div>
  );
}

function PriceHistoryDialog({
  productId,
  onClose,
  products,
  currency,
}: {
  productId: string | null;
  onClose: () => void;
  products: { id: string; name: string }[];
  currency: string;
}) {
  const { data: history, isPending } = useQuery({
    queryKey: ["price-history", productId],
    queryFn: () => fetchPriceHistory(productId as string),
    enabled: productId != null,
  });
  const product = products.find((p) => p.id === productId);

  return (
    <Dialog open={productId != null} onClose={onClose} title={product ? `Price history — ${product.name}` : "Price history"}>
      {isPending && <SkeletonRow />}
      {history && history.length === 0 && <p className="text-sm text-fg-muted">No price changes recorded yet.</p>}
      {history && history.length > 0 && (
        <div className="flex flex-col divide-y divide-border">
          {history.map((h) => (
            <div key={h.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <p className="text-fg">
                  {formatCurrency(h.oldPrice, currency)} → {formatCurrency(h.newPrice, currency)}
                </p>
                {h.note && <p className="text-xs text-fg-faint">{h.note}</p>}
              </div>
              <span className="text-xs text-fg-faint">{new Date(h.createdAt).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}

function WhatIfDialog({
  productId,
  onClose,
  products,
  currency,
}: {
  productId: string | null;
  onClose: () => void;
  products: { id: string; name: string }[];
  currency: string;
}) {
  const { data: suggestion, isPending } = useQuery({
    queryKey: ["price-suggestion", productId],
    queryFn: () => fetchPriceSuggestion(productId as string),
    enabled: productId != null,
  });
  const product = products.find((p) => p.id === productId);

  return (
    <Dialog open={productId != null} onClose={onClose} title={product ? `What-if estimate — ${product.name}` : "What-if estimate"}>
      {isPending && <SkeletonRow />}
      {suggestion && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-fg-muted">Current price</span>
            <span className="text-end text-fg">{formatCurrency(suggestion.currentPrice, currency)}</span>
            <span className="text-fg-muted">Current margin</span>
            <span className="text-end text-fg">{suggestion.currentMarginPercent.toFixed(1)}%</span>
            <span className="font-medium text-fg">Suggested price</span>
            <span className="text-end font-medium text-fg">{formatCurrency(suggestion.suggestedPrice, currency)}</span>
          </div>
          <p className="text-sm text-fg-muted">{suggestion.rationale}</p>
          <p className="rounded-[var(--radius-sm)] bg-surface-2/60 px-3 py-2 text-xs text-fg-faint">
            This is an AI-phrased estimate from your own sales data — it&apos;s a starting point, not guaranteed advice. Review before changing a real price.
          </p>
        </div>
      )}
    </Dialog>
  );
}

function PricePosterDialog({
  onClose,
  products,
  currency,
  businessName,
}: {
  onClose: () => void;
  products: { id: string; name: string; price: number; category: string; active: boolean }[];
  currency: string;
  businessName: string;
}) {
  const activeProducts = products.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Dialog
      open
      onClose={onClose}
      title="Price poster"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" aria-hidden />
            Print
          </Button>
        </>
      }
    >
      <div data-print-root className="flex flex-col gap-3">
        <p className="font-display text-lg font-semibold text-fg">{businessName} — Price List</p>
        <table className="w-full text-sm">
          <tbody>
            {activeProducts.map((p) => (
              <tr key={p.id} className="border-b border-border">
                <td className="py-1.5 text-fg">{p.name}</td>
                <td className="py-1.5 text-end font-medium tabular-nums text-fg">{formatCurrency(p.price, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}
