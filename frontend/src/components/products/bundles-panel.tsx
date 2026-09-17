"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useSession } from "@/lib/session";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { fetchProducts } from "@/lib/products-api";
import { fetchOrders } from "@/lib/orders-api";
import { createBundle, deleteBundle, fetchBundleSuggestions, fetchBundles, type BundleSuggestion } from "@/lib/bundles-api";
import { generateExport } from "@/lib/exports-api";
import { PosModalShell } from "@/components/pos/pos-modal-shell";

const cancelBtn: React.CSSProperties = { background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)" };
const primaryBtn: React.CSSProperties = { background: "var(--app-primary)", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff" };
const dangerBtn: React.CSSProperties = { background: "var(--app-danger-strong)", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff" };
const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };
const primaryHeaderBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };
const smallOutline: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 9, padding: "8px 13px", fontSize: 12, fontWeight: 700, color: "var(--app-text-faintest)", minHeight: 40 };

function startOfMonthIso(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

export function BundlesPanel() {
  const session = useSession();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [prefill, setPrefill] = useState<BundleSuggestion | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);

  const { data: bundles } = useQuery({ queryKey: ["bundles"], queryFn: fetchBundles });
  const { data: suggestions } = useQuery({ queryKey: ["bundle-suggestions"], queryFn: fetchBundleSuggestions });
  const { data: monthOrders } = useQuery({ queryKey: ["orders", "bundle-revenue-month"], queryFn: () => fetchOrders({ from: startOfMonthIso(), limit: 500 }) });

  const revenueByBundleProductId = useMemo(() => {
    const map = new Map<string, { revenue: number; units: number }>();
    for (const o of monthOrders ?? []) {
      for (const item of o.items) {
        if (!item.productId) continue;
        const entry = map.get(item.productId) ?? { revenue: 0, units: 0 };
        entry.revenue += item.price * item.qty;
        entry.units += item.qty;
        map.set(item.productId, entry);
      }
    }
    return map;
  }, [monthOrders]);

  const activeCount = (bundles ?? []).filter((b) => b.active).length;
  const totalRevenue = (bundles ?? []).reduce((sum, b) => sum + (revenueByBundleProductId.get(b.productId)?.revenue ?? 0), 0);

  const exportMutation = useMutation({
    mutationFn: () => generateExport("products", "xlsx"),
    onSuccess: ({ url }) => window.open(url, "_blank", "noopener,noreferrer"),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't generate this export."),
  });

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
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Bundles</h2>
        {suggestions && suggestions.length > 0 && (
          <span className="flex items-center gap-1.5 rounded-full px-[10px] py-1 text-[11px] font-extrabold" style={{ color: "var(--app-success-text)", background: "var(--app-success-bg)" }}>
            <Sparkles className="h-3 w-3" aria-hidden /> AI suggestions
          </span>
        )}
        <div className="ms-auto flex flex-wrap gap-2.5">
          <button type="button" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending} style={outlineBtn}>Export</button>
          <button type="button" onClick={() => setSuggestionsOpen(true)} disabled={!suggestions || suggestions.length === 0} style={{ ...outlineBtn, opacity: !suggestions || suggestions.length === 0 ? 0.5 : 1 }}>View AI Suggestions</button>
          <button type="button" onClick={() => setCreating(true)} style={primaryHeaderBtn}>+ Create Bundle</button>
        </div>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(195px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Active Bundles</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{activeCount}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Bundle Revenue This Month</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(totalRevenue, session.business.currency)}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        {bundles && bundles.length === 0 ? (
          <div className="p-[52px_18px] text-center">
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No bundles yet — AI suggests them from what customers buy together</div>
            <button type="button" onClick={() => setCreating(true)} className="mt-[15px] rounded-[11px] px-5 py-3 text-[12.5px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>Create Bundle</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 980 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Bundle Name</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Included Items</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Individual Total</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Bundle Price</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Saving</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Units Sold</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Margin</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Status</th>
                  <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(bundles ?? []).map((b) => {
                  const individualTotal = b.items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);
                  const saving = Math.max(0, individualTotal - b.sellingPrice);
                  const margin = b.sellingPrice > 0 ? ((b.sellingPrice - b.costPrice) / b.sellingPrice) * 100 : 0;
                  const marginColor = margin < 10 ? "var(--app-danger-strong)" : margin < 30 ? "var(--app-warning-text)" : "var(--app-primary)";
                  const stats = revenueByBundleProductId.get(b.productId);
                  return (
                    <tr key={b.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                      <td className="p-[12px_17px] text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{b.name}</td>
                      <td className="p-[12px] text-[12px]" style={{ color: "var(--app-text-faint)" }}>{b.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</td>
                      <td className="p-[12px] text-end text-[12.5px] line-through" style={{ color: "var(--app-text-disabled)" }}>{formatCurrency(individualTotal, session.business.currency)}</td>
                      <td className="p-[12px] text-end text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(b.sellingPrice, session.business.currency)}</td>
                      <td className="p-[12px] text-end text-[12.5px] font-bold" style={{ color: "var(--app-success-text)" }}>{formatCurrency(saving, session.business.currency)}</td>
                      <td className="p-[12px] text-end text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{stats?.units ?? 0}</td>
                      <td className="p-[12px] text-end text-[12.5px] font-bold" style={{ color: marginColor }}>{margin.toFixed(0)}%</td>
                      <td className="p-[12px]">
                        <span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={b.active ? { background: "var(--app-success-bg)", color: "var(--app-success-text)" } : { background: "var(--app-surface-2)", color: "var(--app-text-faint)" }}>
                          {b.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="p-[12px_17px] text-end"><button type="button" onClick={() => setDeleting({ id: b.id, name: b.name })} style={smallOutline}>Delete</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(creating || prefill) && (
        <BundleFormModal
          onClose={() => {
            setCreating(false);
            setPrefill(null);
          }}
          prefill={prefill}
          currency={session.business.currency}
        />
      )}

      <PosModalShell open={suggestionsOpen} onClose={() => setSuggestionsOpen(false)} title="AI Suggestions" footer={<button type="button" onClick={() => setSuggestionsOpen(false)} style={cancelBtn}>Close</button>}>
        <div className="flex flex-col gap-2.5 p-[17px]">
          {(suggestions ?? []).map((s) => (
            <div key={`${s.productAId}-${s.productBId}`} className="flex items-center gap-3 rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}>
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{s.pitch}</p>
                <p className="m-0 mt-0.5 text-[11px]" style={{ color: "var(--app-text-disabled)" }}>Suggested {formatCurrency(s.suggestedPrice, session.business.currency)} (vs {formatCurrency(s.combinedPrice, session.business.currency)} separately)</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPrefill(s);
                  setSuggestionsOpen(false);
                }}
                style={smallOutline}
              >
                Create
              </button>
            </div>
          ))}
        </div>
      </PosModalShell>

      <PosModalShell
        open={deleting != null}
        onClose={() => setDeleting(null)}
        title="Remove Bundle"
        footer={
          <>
            <button type="button" onClick={() => setDeleting(null)} style={cancelBtn}>Cancel</button>
            <button type="button" onClick={() => deleting && deleteMutation.mutate(deleting.id)} disabled={deleteMutation.isPending} style={{ ...dangerBtn, opacity: deleteMutation.isPending ? 0.6 : 1 }}>
              {deleteMutation.isPending ? "Removing…" : "Remove"}
            </button>
          </>
        }
      >
        <p className="m-0 p-[17px] text-[13px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>The bundle&apos;s own product listing is deactivated — it stays on any past orders it was already sold on.</p>
      </PosModalShell>
    </main>
  );
}

function BundleFormModal({ onClose, prefill, currency }: { onClose: () => void; prefill: BundleSuggestion | null; currency: string }) {
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
  const individualTotal = items.reduce((sum, i) => sum + (productById.get(i.productId)?.price ?? 0) * i.qty, 0);
  const margin = Number(sellingPrice) > 0 ? ((Number(sellingPrice) - costPrice) / Number(sellingPrice)) * 100 : 0;
  const saving = Math.max(0, individualTotal - (Number(sellingPrice) || 0));

  const mutation = useMutation({
    mutationFn: () => createBundle({ name, sku: sku || undefined, sellingPrice: Number(sellingPrice), items: items.filter((i) => i.productId) }),
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
    <PosModalShell
      open
      onClose={onClose}
      title="Create Bundle"
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={!name.trim() || validItems === 0 || !sellingPrice || mutation.isPending} style={{ ...primaryBtn, opacity: !name.trim() || validItems === 0 || !sellingPrice ? 0.6 : 1 }}>
            {mutation.isPending ? "Creating…" : "Create Bundle"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 p-[17px]">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>BUNDLE NAME</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grooming Starter" className="w-full rounded-[11px] p-3 text-[13.5px]" style={{ border: "1px solid var(--app-border)" }} />
        </label>
        <div className="rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}>
          <div className="mb-2 text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>INCLUDED PRODUCTS</div>
          <div className="flex flex-col gap-2">
            {items.map((item, i) => {
              const product = productById.get(item.productId);
              return (
                <div key={i} className="flex items-center gap-2">
                  <select value={item.productId} onChange={(e) => updateItem(i, { productId: e.target.value })} className="flex-1 rounded-[9px] p-2.5 text-[12.5px] font-semibold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
                    <option value="" disabled>Select a product…</option>
                    {(products ?? []).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <input type="number" min={1} value={item.qty} onChange={(e) => updateItem(i, { qty: Math.max(1, Number(e.target.value)) })} className="w-[62px] rounded-[9px] p-2.5 text-center text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)" }} />
                  <span className="w-[78px] text-end text-[12px] font-bold" style={{ color: "var(--app-text)" }}>{product ? formatCurrency(product.price, currency) : "—"}</span>
                  <button type="button" onClick={() => setItems((rows) => rows.filter((_, idx) => idx !== i))} aria-label="Remove item" style={{ color: "var(--app-border-strong)" }}>×</button>
                </div>
              );
            })}
          </div>
          <button type="button" onClick={() => setItems((rows) => [...rows, { productId: "", qty: 1 }])} className="mt-2.5 w-full rounded-[10px] p-[9px_12px] text-[12px] font-bold" style={{ border: "1px dashed var(--app-border-strong)", color: "var(--app-primary-hover, #0E8442)" }}>+ Add item</button>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>BUNDLE PRICE</span>
          <input type="number" min={0} value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} className="w-full rounded-[11px] p-3 text-[16px] font-extrabold" style={{ border: "1px solid var(--app-border)" }} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>SKU (OPTIONAL)</span>
          <input value={sku} onChange={(e) => setSku(e.target.value)} className="w-full rounded-[11px] p-3 text-[13.5px]" style={{ border: "1px solid var(--app-border)" }} />
        </label>
        <div className="rounded-[12px] p-3" style={{ background: "var(--app-page-bg, #F7FCF9)", border: "1px solid var(--app-success-border)" }}>
          <div className="flex justify-between p-[4px_0] text-[12.5px]"><span style={{ color: "var(--app-success-text)" }}>Individual total</span><span className="font-bold line-through" style={{ color: "var(--app-text-muted)" }}>{formatCurrency(individualTotal, currency)}</span></div>
          <div className="flex justify-between p-[4px_0] text-[12.5px]"><span style={{ color: "var(--app-success-text)" }}>Bundle price</span><span className="font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(Number(sellingPrice) || 0, currency)}</span></div>
          <div className="flex justify-between p-[4px_0] text-[12.5px]"><span style={{ color: "var(--app-success-text)" }}>Customer saving</span><span className="font-extrabold" style={{ color: "var(--app-success-text)" }}>{formatCurrency(saving, currency)}</span></div>
          <div className="mt-1.5 flex justify-between border-t pt-2" style={{ borderColor: "var(--app-success-border)" }}><span className="text-[12.5px] font-bold" style={{ color: "var(--app-success-text)" }}>Live margin</span><span className="text-[17px] font-extrabold" style={{ color: "var(--app-text)" }}>{margin.toFixed(0)}%</span></div>
        </div>
      </div>
    </PosModalShell>
  );
}
