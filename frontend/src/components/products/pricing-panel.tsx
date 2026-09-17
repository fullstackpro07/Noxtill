"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/session";
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { fetchProducts } from "@/lib/products-api";
import { useNow } from "@/hooks/use-now";
import { fetchCategories } from "@/lib/categories-api";
import { generateExport } from "@/lib/exports-api";
import { bulkPrice, fetchPriceHistory, fetchPriceSuggestion, type BulkPriceResult, type LivePriceHistoryEntry } from "@/lib/pricing-api";
import { marginPercent, type Product } from "@/lib/products";
import { PosModalShell } from "@/components/pos/pos-modal-shell";

const selectStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 10, padding: "9px 11px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 42 };
const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };
const darkBtn: React.CSSProperties = { border: 0, background: "var(--app-sidebar-bg)", borderRadius: 11, padding: "11px 16px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };
const cancelBtn: React.CSSProperties = { background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)" };
const primaryBtn: React.CSSProperties = { background: "var(--app-primary)", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff" };
const smallOutline: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 9, padding: "8px 12px", fontSize: 12, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 40 };

const BELOW_TARGET_MARGIN = 20;
const MARGIN_BUCKETS = [
  { label: "<0%", min: -Infinity, max: 0 },
  { label: "0–10%", min: 0, max: 10 },
  { label: "10–20%", min: 10, max: 20 },
  { label: "20–30%", min: 20, max: 30 },
  { label: "30–50%", min: 30, max: 50 },
  { label: "50%+", min: 50, max: Infinity },
];

function marginColorFor(margin: number): string {
  return margin < 10 ? "var(--app-danger-strong)" : margin < 30 ? "var(--app-warning-text)" : "var(--app-primary)";
}

export function PricingPanel() {
  const session = useSession();
  const now = useNow();
  const [catFilter, setCatFilter] = useState("all");
  const [bandFilter, setBandFilter] = useState<"all" | "below10" | "mid" | "above25">("all");
  const [changedFilter, setChangedFilter] = useState<"all" | "30" | "90">("all");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [historyFor, setHistoryFor] = useState<Product | null>(null);
  const [whatIfFor, setWhatIfFor] = useState<Product | null>(null);
  const [posterOpen, setPosterOpen] = useState(false);

  const { data: products } = useQuery({ queryKey: ["products", "all-for-pricing"], queryFn: () => fetchProducts() });
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories, staleTime: 5 * 60_000 });

  const historyQueries = useQueries({
    queries: (products ?? []).map((p) => ({
      queryKey: ["price-history", p.id],
      queryFn: () => fetchPriceHistory(p.id),
      staleTime: 60_000,
      enabled: (products?.length ?? 0) <= 300,
    })),
  });
  const historyByProductId = useMemo(() => {
    const map = new Map<string, LivePriceHistoryEntry[]>();
    (products ?? []).forEach((p, i) => {
      const data = historyQueries[i]?.data;
      if (data) map.set(p.id, data);
    });
    return map;
  }, [products, historyQueries]);

  const filtered = useMemo(() => {
    return (products ?? []).filter((p) => {
      if (catFilter !== "all" && p.categoryId !== catFilter) return false;
      const margin = marginPercent(p.price, p.costPrice);
      if (bandFilter === "below10" && margin >= 10) return false;
      if (bandFilter === "mid" && (margin < 10 || margin > 25)) return false;
      if (bandFilter === "above25" && margin <= 25) return false;
      if (changedFilter !== "all") {
        const history = historyByProductId.get(p.id);
        const last = history && history.length > 0 ? new Date(history[history.length - 1].createdAt) : null;
        const days = changedFilter === "30" ? 30 : 90;
        if (!last || now - last.getTime() > days * 24 * 60 * 60_000) return false;
      }
      return true;
    });
  }, [products, catFilter, bandFilter, changedFilter, historyByProductId, now]);

  const avgMargin = useMemo(() => {
    const all = products ?? [];
    if (all.length === 0) return 0;
    return all.reduce((s, p) => s + marginPercent(p.price, p.costPrice), 0) / all.length;
  }, [products]);
  const belowTargetCount = (products ?? []).filter((p) => marginPercent(p.price, p.costPrice) < BELOW_TARGET_MARGIN).length;
  const changesThisMonth = useMemo(() => {
    const startOfMonth = new Date(now);
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    let count = 0;
    for (const entries of historyByProductId.values()) {
      count += entries.filter((e) => new Date(e.createdAt) >= startOfMonth).length;
    }
    return count;
  }, [historyByProductId, now]);

  const histogram = useMemo(() => {
    const all = products ?? [];
    return MARGIN_BUCKETS.map((b) => ({ ...b, count: all.filter((p) => { const m = marginPercent(p.price, p.costPrice); return m >= b.min && m < b.max; }).length }));
  }, [products]);
  const maxHistogram = Math.max(1, ...histogram.map((h) => h.count));

  const exportMutation = useMutation({
    mutationFn: () => generateExport("products", "pdf"),
    onSuccess: ({ url }) => window.open(url, "_blank", "noopener,noreferrer"),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't generate this export."),
  });

  if (session.user.role !== "owner") {
    return (
      <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Pricing</h2>
          <span className="rounded-full px-[10px] py-1 text-[11px] font-extrabold" style={{ color: "var(--app-warning-text)", background: "var(--app-warning-bg)" }}>Owner only</span>
        </div>
        <div className="rounded-[16px] p-[48px_20px] text-center" style={{ background: "var(--app-surface)", border: "1px solid var(--app-warning-border)" }}>
          <div className="text-[14.5px] font-extrabold" style={{ color: "#93370D" }}>Pricing is available to the Owner</div>
          <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-warning-text)" }}>Cost prices and margin controls stay hidden for your role.</div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Pricing</h2>
        <span className="rounded-full px-[10px] py-1 text-[11px] font-extrabold" style={{ color: "var(--app-warning-text)", background: "var(--app-warning-bg)" }}>Owner only</span>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <button type="button" onClick={() => setBulkOpen(true)} style={darkBtn}>Bulk Increase / Decrease by %</button>
        <button type="button" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending} style={outlineBtn}>Export Price List</button>
        <button type="button" onClick={() => setPosterOpen(true)} style={outlineBtn}>Generate Price Poster</button>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(195px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Average Margin</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{avgMargin.toFixed(0)}%</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid #FDD9D6" }}>
          <div className="text-[12px] font-bold" style={{ color: "var(--app-danger-strong)" }}>Below-target Margin</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{belowTargetCount}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Price Changes This Month</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{changesThisMonth}</div>
        </div>
      </div>

      <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <h3 className="m-0 mb-1.5 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Margin distribution</h3>
        <div className="flex items-end gap-3" style={{ height: 140 }}>
          {histogram.map((b) => (
            <div key={b.label} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="text-[12px] font-bold" style={{ color: "var(--app-text-muted)" }}>{b.count}</span>
              <div className="w-full rounded-t-[5px]" style={{ height: `${Math.max(4, (b.count / maxHistogram) * 100)}px`, background: "var(--app-success-border)" }} />
              <span className="text-[10.5px] font-semibold" style={{ color: "var(--app-text-faint)" }}>{b.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap gap-2 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} aria-label="Category" style={selectStyle}>
            <option value="all">All categories</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select value={bandFilter} onChange={(e) => setBandFilter(e.target.value as typeof bandFilter)} aria-label="Margin band" style={selectStyle}>
            <option value="all">All margins</option>
            <option value="below10">Below 10%</option>
            <option value="mid">10–25%</option>
            <option value="above25">Above 25%</option>
          </select>
          <select value={changedFilter} onChange={(e) => setChangedFilter(e.target.value as typeof changedFilter)} aria-label="Last changed" style={selectStyle}>
            <option value="all">Any time</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>

        {products && filtered.length === 0 ? (
          <div className="p-[52px_18px] text-center">
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Nothing matches these filters</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 920 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Product</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Cost</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Current Price</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Margin %</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Last Changed</th>
                  <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const margin = marginPercent(p.price, p.costPrice);
                  const history = historyByProductId.get(p.id);
                  const lastChanged = history && history.length > 0 ? formatDate(history[history.length - 1].createdAt) : "Never";
                  return (
                    <tr key={p.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                      <td className="p-[12px_17px]">
                        <span className="block text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{p.name}</span>
                        <span className="mt-0.5 block text-[11px]" style={{ color: "var(--app-text-disabled)" }}>{p.category || "—"}</span>
                      </td>
                      <td className="p-[12px] text-end text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{formatCurrency(p.costPrice, session.business.currency)}</td>
                      <td className="p-[12px] text-end text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(p.price, session.business.currency)}</td>
                      <td className="p-[12px] text-end"><span className="text-[11.5px] font-extrabold" style={{ color: marginColorFor(margin) }}>{margin.toFixed(0)}%</span></td>
                      <td className="p-[12px] text-[12px]" style={{ color: "var(--app-text-disabled)" }}>{lastChanged}</td>
                      <td className="p-[12px_17px] text-end">
                        <span className="inline-flex gap-1.5">
                          <button type="button" onClick={() => setHistoryFor(p)} style={smallOutline}>History</button>
                          <button type="button" onClick={() => setWhatIfFor(p)} style={{ ...smallOutline, borderColor: "var(--app-primary)", color: "var(--app-success-text)" }}>What-if</button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <BulkPriceChangeModal open={bulkOpen} onClose={() => setBulkOpen(false)} categories={categories ?? []} currency={session.business.currency} />
      <PriceHistoryModal product={historyFor} onClose={() => setHistoryFor(null)} currency={session.business.currency} />
      <WhatIfModal product={whatIfFor} onClose={() => setWhatIfFor(null)} currency={session.business.currency} />
      {posterOpen && <PricePosterModal onClose={() => setPosterOpen(false)} products={products ?? []} currency={session.business.currency} businessName={session.business.name} />}
    </main>
  );
}

function BulkPriceChangeModal({ open, onClose, categories, currency }: { open: boolean; onClose: () => void; categories: { id: string; name: string }[]; currency: string }) {
  const [scope, setScope] = useState<"all" | "category">("all");
  const [categoryId, setCategoryId] = useState("");
  const [mode, setMode] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("");
  const [preview, setPreview] = useState<BulkPriceResult | null>(null);
  const queryClient = useQueryClient();

  const previewMutation = useMutation({
    mutationFn: () => bulkPrice({ category: scope === "category" ? categories.find((c) => c.id === categoryId)?.name : undefined, mode, value: Number(value), dryRun: true }),
    onSuccess: setPreview,
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't preview this change."),
  });
  const applyMutation = useMutation({
    mutationFn: () => bulkPrice({ category: scope === "category" ? categories.find((c) => c.id === categoryId)?.name : undefined, mode, value: Number(value), dryRun: false }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(`Updated ${result.changes.length} product price(s).`);
      handleClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't apply this change."),
  });

  function handleClose() {
    setValue("");
    setPreview(null);
    onClose();
  }

  return (
    <PosModalShell
      open={open}
      onClose={handleClose}
      title="Bulk Increase / Decrease by %"
      footer={
        preview ? (
          <>
            <button type="button" onClick={() => setPreview(null)} style={cancelBtn}>Back</button>
            <button type="button" onClick={() => applyMutation.mutate()} disabled={applyMutation.isPending} style={{ ...primaryBtn, opacity: applyMutation.isPending ? 0.6 : 1 }}>
              {applyMutation.isPending ? "Applying…" : `Apply to ${preview.changes.length} product(s)`}
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={handleClose} style={cancelBtn}>Cancel</button>
            <button type="button" onClick={() => previewMutation.mutate()} disabled={!value || (scope === "category" && !categoryId) || previewMutation.isPending} style={{ ...primaryBtn, opacity: !value ? 0.6 : 1 }}>Preview</button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-3 p-[17px]">
        {!preview ? (
          <>
            <div className="flex gap-2">
              <select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} style={{ ...selectStyle, minHeight: 46 }}>
                <option value="all">All products</option>
                <option value="category">By category</option>
              </select>
              {scope === "category" && (
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={{ ...selectStyle, minHeight: 46 }}>
                  <option value="" disabled>Select a category…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex gap-2">
              <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} style={{ ...selectStyle, minHeight: 46 }}>
                <option value="percent">Percent</option>
                <option value="amount">Amount</option>
              </select>
              <input type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder={mode === "percent" ? "e.g. 10 or -5" : "e.g. 2 or -1"} className="flex-1 rounded-[10px] p-2.5 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
            </div>
          </>
        ) : (
          <div className="max-h-64 overflow-y-auto rounded-[11px]" style={{ border: "1px solid var(--app-border)" }}>
            <table className="w-full">
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="p-[8px_12px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Product</th>
                  <th className="p-[8px_12px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Old</th>
                  <th className="p-[8px_12px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>New</th>
                </tr>
              </thead>
              <tbody>
                {preview.changes.map((c) => (
                  <tr key={c.productId} style={{ borderTop: "1px solid var(--app-surface-2)" }}>
                    <td className="p-[8px_12px] text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{c.name}</td>
                    <td className="p-[8px_12px] text-end text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>{formatCurrency(c.oldPrice, currency)}</td>
                    <td className="p-[8px_12px] text-end text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{formatCurrency(c.newPrice, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PosModalShell>
  );
}

function PriceHistoryModal({ product, onClose, currency }: { product: Product | null; onClose: () => void; currency: string }) {
  const { data: history } = useQuery({ queryKey: ["price-history", product?.id], queryFn: () => fetchPriceHistory(product!.id), enabled: product != null });

  return (
    <PosModalShell open={product != null} onClose={onClose} title={product ? `Price History — ${product.name}` : "Price History"} footer={<button type="button" onClick={onClose} style={cancelBtn}>Close</button>}>
      <div className="flex flex-col p-[17px]">
        {history && history.length === 0 && <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>No price changes recorded yet.</p>}
        {(history ?? []).slice().reverse().map((h) => (
          <div key={h.id} className="flex items-start gap-2.5 p-[10px_0]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
            <span className="mt-1.5 h-[9px] w-[9px] shrink-0 rounded-full" style={{ background: "var(--app-success-border)" }} />
            <span className="flex-1">
              <span className="flex items-baseline gap-2">
                <span className="text-[12.5px] line-through" style={{ color: "var(--app-text-disabled)" }}>{formatCurrency(h.oldPrice, currency)}</span>
                <span className="text-[14px] font-extrabold" style={{ color: "var(--app-text)" }}>→ {formatCurrency(h.newPrice, currency)}</span>
              </span>
              <span className="mt-1 block text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>{formatDate(h.createdAt)}{h.note ? ` · ${h.note}` : ""}</span>
            </span>
          </div>
        ))}
      </div>
    </PosModalShell>
  );
}

function WhatIfModal({ product, onClose, currency }: { product: Product | null; onClose: () => void; currency: string }) {
  const { data: suggestion, isPending } = useQuery({ queryKey: ["price-suggestion", product?.id], queryFn: () => fetchPriceSuggestion(product!.id), enabled: product != null });

  return (
    <PosModalShell open={product != null} onClose={onClose} title={product ? `What-if Estimate — ${product.name}` : "What-if Estimate"} footer={<button type="button" onClick={onClose} style={cancelBtn}>Close</button>}>
      <div className="flex flex-col gap-3 p-[17px]">
        {isPending && <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Loading…</p>}
        {suggestion && (
          <>
            <div className="rounded-[12px] p-3" style={{ background: "var(--app-surface-2)" }}>
              <div className="flex justify-between p-[4px_0] text-[12.5px]"><span style={{ color: "var(--app-text-faintest)" }}>Current price</span><span className="font-bold" style={{ color: "var(--app-text-muted)" }}>{formatCurrency(suggestion.currentPrice, currency)}</span></div>
              <div className="flex justify-between p-[4px_0] text-[12.5px]"><span style={{ color: "var(--app-text-faintest)" }}>Current margin</span><span className="font-bold" style={{ color: "var(--app-text-muted)" }}>{suggestion.currentMarginPercent.toFixed(1)}%</span></div>
              <div className="mt-1.5 flex justify-between border-t pt-1.5" style={{ borderColor: "var(--app-border-strong)" }}><span className="text-[13px] font-extrabold" style={{ color: "var(--app-text)" }}>Suggested price</span><span className="text-[16px] font-extrabold" style={{ color: "var(--app-success-text)" }}>{formatCurrency(suggestion.suggestedPrice, currency)}</span></div>
            </div>
            <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{suggestion.rationale}</p>
            <div className="rounded-[10px] p-[10px_12px] text-[11.5px]" style={{ background: "var(--app-surface-2)", color: "var(--app-text-faintest)" }}>
              This is an AI-phrased estimate from your own sales data — a starting point, not guaranteed advice. Review before changing a real price.
            </div>
          </>
        )}
      </div>
    </PosModalShell>
  );
}

function PricePosterModal({ onClose, products, currency, businessName }: { onClose: () => void; products: { id: string; name: string; price: number; category: string; active: boolean }[]; currency: string; businessName: string }) {
  const activeProducts = products.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <PosModalShell
      open
      onClose={onClose}
      title="Price Poster"
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelBtn}>Close</button>
          <button type="button" onClick={() => window.print()} style={primaryBtn}>Print</button>
        </>
      }
    >
      <div data-print-root className="flex flex-col gap-3 p-[17px]">
        <p className="m-0 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>{businessName} — Price List</p>
        <table className="w-full">
          <tbody>
            {activeProducts.map((p) => (
              <tr key={p.id} style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
                <td className="py-1.5 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{p.name}</td>
                <td className="py-1.5 text-end text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{formatCurrency(p.price, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PosModalShell>
  );
}
