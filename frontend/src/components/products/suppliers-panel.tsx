"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/session";
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { fetchProducts } from "@/lib/products-api";
import { fetchStockMovements } from "@/lib/inventory-api";
import { useNow } from "@/hooks/use-now";
import {
  createSupplier,
  fetchSuppliers,
  quickPurchaseOrder,
  updateSupplier,
  type LiveSupplier,
  type QuickPoLine,
} from "@/lib/suppliers-api";
import { PosModalShell } from "@/components/pos/pos-modal-shell";

const cancelBtn: React.CSSProperties = { background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)" };
const primaryBtn: React.CSSProperties = { background: "var(--app-primary)", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff" };
const primaryHeaderBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };
const selectStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 10, padding: "9px 11px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 42 };
const smallOutline: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 9, padding: "8px 12px", fontSize: 12, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 40 };

export function SuppliersPanel() {
  const session = useSession();
  const now = useNow();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LiveSupplier | null>(null);
  const [poFor, setPoFor] = useState<LiveSupplier | null>(null);
  const [productsFilter, setProductsFilter] = useState<"all" | "multi">("all");
  const [lastOrderFilter, setLastOrderFilter] = useState<"all" | "recent" | "old">("all");

  const { data: suppliers } = useQuery({ queryKey: ["suppliers"], queryFn: fetchSuppliers });
  const { data: purchases } = useQuery({ queryKey: ["stock-movements", "purchase"], queryFn: () => fetchStockMovements({ kind: "purchase" }) });

  const bySupplier = useMemo(() => {
    const map = new Map<string, { total: number; last: string | null; productIds: Set<string> }>();
    for (const m of purchases ?? []) {
      // supplierName here is a real name resolved from the movement's own supplier relation — matched back to a supplier id below.
      if (!m.supplierName) continue;
      const supplier = (suppliers ?? []).find((s) => s.name === m.supplierName);
      if (!supplier) continue;
      const entry = map.get(supplier.id) ?? { total: 0, last: null, productIds: new Set<string>() };
      entry.total += m.qty * (m.unitCost ?? 0);
      entry.productIds.add(m.productId);
      if (!entry.last || new Date(m.createdAt) > new Date(entry.last)) entry.last = m.createdAt;
      map.set(supplier.id, entry);
    }
    return map;
  }, [purchases, suppliers]);

  const startOfMonth = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const purchasesThisMonth = (purchases ?? []).filter((m) => new Date(m.createdAt) >= startOfMonth).reduce((s, m) => s + m.qty * (m.unitCost ?? 0), 0);
  const topSupplier = useMemo(() => {
    let best: { name: string; total: number } | null = null;
    for (const [id, v] of bySupplier) {
      const name = (suppliers ?? []).find((s) => s.id === id)?.name;
      if (name && (!best || v.total > best.total)) best = { name, total: v.total };
    }
    return best;
  }, [bySupplier, suppliers]);

  const rows = useMemo(() => {
    return (suppliers ?? [])
      .map((s) => {
        const agg = bySupplier.get(s.id);
        return { supplier: s, total: agg?.total ?? 0, last: agg?.last ?? null, productCount: agg?.productIds.size ?? 0 };
      })
      .filter((r) => {
        if (productsFilter === "multi" && r.productCount < 2) return false;
        if (lastOrderFilter !== "all") {
          if (!r.last) return lastOrderFilter === "old";
          const days = (now - new Date(r.last).getTime()) / (24 * 60 * 60_000);
          if (lastOrderFilter === "recent" && days > 30) return false;
          if (lastOrderFilter === "old" && days <= 30) return false;
        }
        return true;
      })
      .sort((a, b) => b.total - a.total);
  }, [suppliers, bySupplier, productsFilter, lastOrderFilter, now]);

  const maxTotal = Math.max(1, ...rows.map((r) => r.total));

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Suppliers</h2>
        <div className="ms-auto flex flex-wrap gap-2.5">
          <button type="button" onClick={() => setCreating(true)} style={primaryHeaderBtn}>+ Add Supplier</button>
        </div>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(185px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Total Suppliers</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{suppliers?.length ?? "—"}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Purchases This Month</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(purchasesThisMonth, session.business.currency)}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Top Supplier by Value</div>
          <div className="mt-[7px] text-[13.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{topSupplier?.name ?? "—"}</div>
        </div>
      </div>

      <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <h3 className="m-0 mb-3 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Purchase value by supplier</h3>
        {rows.length === 0 ? (
          <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>No purchases recorded yet.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {rows.slice(0, 8).map((r) => (
              <div key={r.supplier.id}>
                <div className="mb-1.5 flex justify-between">
                  <span className="text-[12.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{r.supplier.name}</span>
                  <span className="text-[11.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(r.total, session.business.currency)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-[6px]" style={{ background: "var(--app-surface-2)" }}>
                  <div className="h-full rounded-[6px]" style={{ background: "#2563EB", width: `${(r.total / maxTotal) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap gap-2 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <select value={productsFilter} onChange={(e) => setProductsFilter(e.target.value as typeof productsFilter)} aria-label="Products supplied" style={selectStyle}>
            <option value="all">All products</option>
            <option value="multi">2 or more products</option>
          </select>
          <select value={lastOrderFilter} onChange={(e) => setLastOrderFilter(e.target.value as typeof lastOrderFilter)} aria-label="Last order date" style={selectStyle}>
            <option value="all">Any time</option>
            <option value="recent">Last 30 days</option>
            <option value="old">Older than 30 days</option>
          </select>
        </div>

        {suppliers && rows.length === 0 ? (
          <div className="p-[52px_18px] text-center">
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Add suppliers to reorder stock in one tap</div>
            <button type="button" onClick={() => setCreating(true)} className="mt-[15px] rounded-[11px] px-5 py-3 text-[12.5px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>Add Supplier</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 860 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Supplier Name</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Contact</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Products Supplied</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Last Order</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Total Purchased</th>
                  <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.supplier.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                    <td className="p-[12px_17px] text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{r.supplier.name}</td>
                    <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{[r.supplier.phone, r.supplier.email].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="p-[12px] text-end text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{r.productCount}</td>
                    <td className="p-[12px] text-[12px]" style={{ color: "var(--app-text-disabled)" }}>{r.last ? formatDate(r.last) : "Never"}</td>
                    <td className="p-[12px] text-end text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(r.total, session.business.currency)}</td>
                    <td className="p-[12px_17px] text-end">
                      <span className="inline-flex gap-1.5">
                        <button type="button" onClick={() => setPoFor(r.supplier)} style={smallOutline}>Quick PO</button>
                        <button type="button" onClick={() => setEditing(r.supplier)} style={smallOutline}>Edit</button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SupplierFormModal open={creating} onClose={() => setCreating(false)} />
      {editing && <SupplierFormModal open onClose={() => setEditing(null)} supplier={editing} />}
      {poFor && <QuickPoModal supplier={poFor} onClose={() => setPoFor(null)} currency={session.business.currency} />}
    </main>
  );
}

function SupplierFormModal({ open, onClose, supplier }: { open: boolean; onClose: () => void; supplier?: LiveSupplier }) {
  const [name, setName] = useState(supplier?.name ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [email, setEmail] = useState(supplier?.email ?? "");
  const [address, setAddress] = useState(supplier?.address ?? "");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => {
      const draft = { name, phone: phone || undefined, email: email || undefined, address: address || undefined };
      return supplier ? updateSupplier(supplier.id, draft) : createSupplier(draft);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success(supplier ? "Supplier updated." : "Supplier added.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this supplier — please try again."),
  });

  return (
    <PosModalShell
      open={open}
      onClose={onClose}
      title={supplier ? "Edit Supplier" : "Add Supplier"}
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={!name.trim() || mutation.isPending} style={{ ...primaryBtn, opacity: !name.trim() || mutation.isPending ? 0.6 : 1 }}>
            {mutation.isPending ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 p-[17px]">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>NAME</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-[11px] p-3 text-[13.5px]" style={{ border: "1px solid var(--app-border)" }} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>PHONE</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-[11px] p-3 text-[13.5px]" style={{ border: "1px solid var(--app-border)" }} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>EMAIL</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-[11px] p-3 text-[13.5px]" style={{ border: "1px solid var(--app-border)" }} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>ADDRESS</span>
          <input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full rounded-[11px] p-3 text-[13.5px]" style={{ border: "1px solid var(--app-border)" }} />
        </label>
      </div>
    </PosModalShell>
  );
}

function QuickPoModal({ supplier, onClose, currency }: { supplier: LiveSupplier; onClose: () => void; currency: string }) {
  const [lines, setLines] = useState<QuickPoLine[]>([{ productId: "", qty: 1, unitCost: 0 }]);
  const { data: products } = useQuery({ queryKey: ["products", "all-for-po"], queryFn: () => fetchProducts({ kind: "product" }) });
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => quickPurchaseOrder(supplier.id, lines.filter((l) => l.productId)),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["stock-movements"] });
      const totalUnits = result.lines.reduce((sum, l) => sum + l.qty, 0);
      toast.success(`Recorded a purchase of ${totalUnits} unit(s) from ${supplier.name}.`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't record this purchase order — please try again."),
  });

  function updateLine(i: number, patch: Partial<QuickPoLine>) {
    setLines((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  const total = lines.reduce((sum, l) => sum + l.qty * l.unitCost, 0);
  const validLines = lines.filter((l) => l.productId).length;

  return (
    <PosModalShell
      open
      onClose={onClose}
      title={`Quick PO — ${supplier.name}`}
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={validLines === 0 || mutation.isPending} style={{ ...primaryBtn, opacity: validLines === 0 || mutation.isPending ? 0.6 : 1 }}>
            {mutation.isPending ? "Recording…" : "Record Purchase"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 p-[17px]">
        <p className="m-0 rounded-[11px] p-[11px_13px] text-[12px]" style={{ background: "var(--app-warning-bg)", border: "1px solid var(--app-warning-border)", color: "#93370D" }}>
          Records real stock received and updates each product&apos;s cost price. Nothing is sent to the supplier from here.
        </p>
        <div className="flex flex-col gap-2">
          {lines.map((line, i) => (
            <div key={i} className="flex items-center gap-2">
              <select value={line.productId} onChange={(e) => updateLine(i, { productId: e.target.value })} className="flex-1 rounded-[10px] p-2.5 text-[12.5px] font-semibold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
                <option value="" disabled>Select a product…</option>
                {(products ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <input type="number" min={1} value={line.qty} onChange={(e) => updateLine(i, { qty: Math.max(1, Number(e.target.value)) })} className="w-16 rounded-[10px] p-2.5 text-[12.5px]" style={{ border: "1px solid var(--app-border)" }} placeholder="Qty" />
              <input type="number" min={0} step="0.01" value={line.unitCost} onChange={(e) => updateLine(i, { unitCost: Number(e.target.value) })} className="w-20 rounded-[10px] p-2.5 text-[12.5px]" style={{ border: "1px solid var(--app-border)" }} placeholder="Cost" />
              <button type="button" onClick={() => setLines((rows) => rows.filter((_, idx) => idx !== i))} disabled={lines.length === 1} className="text-[11px] font-bold disabled:opacity-30" style={{ color: "var(--app-danger-strong)" }}>Remove</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setLines((rows) => [...rows, { productId: "", qty: 1, unitCost: 0 }])} className="self-start text-[12px] font-bold" style={{ color: "var(--app-success-text)" }}>+ Add line</button>
        <div className="flex items-center justify-between border-t pt-3 text-[13px]" style={{ borderColor: "var(--app-border-strong)" }}>
          <span style={{ color: "var(--app-text-faint)" }}>Total</span>
          <span className="text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(total, currency)}</span>
        </div>
      </div>
    </PosModalShell>
  );
}
