"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, CheckCircle2, PackageX, AlertTriangle, Wallet2, MoreVertical, Pencil, Trash2, LayoutGrid, List as ListIcon } from "lucide-react";
import { useSession } from "@/lib/session";
import { fetchProducts, deactivateProduct, reactivateProduct, updateProductCategory } from "@/lib/products-api";
import { fetchCategories } from "@/lib/categories-api";
import { bulkPrice, type BulkPriceResult } from "@/lib/pricing-api";
import { marginPercent, type Product, type ProductKind } from "@/lib/products";
import { formatCurrency } from "@/lib/format";
import { useProductsSearchStore } from "@/store/products-search-store";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { ProductFormDrawer } from "./product-form-drawer";
import { PosModalShell } from "@/components/pos/pos-modal-shell";

const selectStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 10, padding: "9px 11px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 42 };
const toolbarBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 9, padding: "8px 13px", fontSize: 12, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 40 };
const cancelBtn: React.CSSProperties = { background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)" };
const primaryBtn: React.CSSProperties = { background: "var(--app-primary)", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff" };
const dangerBtn: React.CSSProperties = { background: "var(--app-danger-strong)", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff" };

type StockBand = "all" | "in" | "low" | "out";
type ViewMode = "table" | "grid";

function marginColorFor(margin: number): string {
  return margin < 10 ? "var(--app-danger-strong)" : margin < 30 ? "var(--app-warning-text)" : "var(--app-primary)";
}

function KpiCard({ icon, tint, color, label, value, note }: { icon: React.ReactNode; tint: string; color: string; label: string; value: React.ReactNode; note: string }) {
  return (
    <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px]" style={{ background: tint, color }}>{icon}</span>
        <span className="text-[12px] font-semibold" style={{ color: "var(--app-text-faint)" }}>{label}</span>
      </div>
      <div className="text-[21px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.5px" }}>{value}</div>
      <div className="mt-1 text-[11px]" style={{ color: "var(--app-text-disabled)" }}>{note}</div>
    </div>
  );
}

export function AllProductsView() {
  const session = useSession();
  const isOwner = session.user.role === "owner";
  const queryClient = useQueryClient();
  const query = useProductsSearchStore((s) => s.query);

  const [categoryId, setCategoryId] = useState("all");
  const [kind, setKind] = useState<"all" | ProductKind>("all");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [stockBand, setStockBand] = useState<StockBand>("all");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [view, setView] = useState<ViewMode>("table");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [bulkPriceOpen, setBulkPriceOpen] = useState(false);
  const [bulkCatOpen, setBulkCatOpen] = useState(false);

  const { data: products } = useQuery({ queryKey: ["products"], queryFn: () => fetchProducts() });
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories, staleTime: 5 * 60_000 });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (products ?? []).filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !(p.sku ?? "").toLowerCase().includes(q) && !p.category.toLowerCase().includes(q)) return false;
      if (categoryId !== "all" && p.categoryId !== categoryId) return false;
      if (kind !== "all" && p.kind !== kind) return false;
      if (status !== "all" && (status === "active") !== p.active) return false;
      if (stockBand !== "all" && p.kind === "product") {
        const stock = p.stockOnHand ?? 0;
        const low = p.lowStockThreshold ?? 0;
        if (stockBand === "out" && stock > 0) return false;
        if (stockBand === "low" && !(stock > 0 && stock <= low)) return false;
        if (stockBand === "in" && stock <= low) return false;
      }
      if (minPrice && p.price < Number(minPrice)) return false;
      if (maxPrice && p.price > Number(maxPrice)) return false;
      return true;
    });
  }, [products, query, categoryId, kind, status, stockBand, minPrice, maxPrice]);

  const kpis = useMemo(() => {
    const all = products ?? [];
    const active = all.filter((p) => p.active).length;
    const out = all.filter((p) => p.kind === "product" && (p.stockOnHand ?? 0) <= 0).length;
    const low = all.filter((p) => p.kind === "product" && (p.stockOnHand ?? 0) > 0 && (p.stockOnHand ?? 0) <= (p.lowStockThreshold ?? 0)).length;
    const catValue = all.reduce((sum, p) => sum + (p.kind === "product" ? (p.stockOnHand ?? 0) * p.costPrice : 0), 0);
    return { total: all.length, active, out, low, catValue };
  }, [products]);

  const toggleActiveMutation = useMutation({
    mutationFn: (p: Product) => (p.active ? deactivateProduct(p.id) : reactivateProduct(p.id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this product."),
  });

  const deleteMutation = useMutation({
    mutationFn: (p: Product) => deactivateProduct(p.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Product deactivated.");
      setDeleting(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't remove this product."),
  });

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((p) => p.id))));
  }

  function printSkuSheet() {
    const rows = selected.size > 0 ? filtered.filter((p) => selected.has(p.id)) : filtered;
    if (rows.length === 0) return;
    const win = window.open("", "_blank", "noopener,noreferrer");
    if (!win) return;
    const body = rows
      .map(
        (p) =>
          `<div style="border:1px solid #ccc;border-radius:8px;padding:10px 14px;display:inline-block;margin:4px;width:220px">
            <div style="font-weight:700;font-size:13px">${p.name}</div>
            <div style="font-family:ui-monospace,monospace;font-size:15px;letter-spacing:2px;margin-top:4px">${p.sku ?? "—"}</div>
            <div style="font-size:12px;color:#555;margin-top:2px">${formatCurrency(p.price, session.business.currency)}</div>
          </div>`,
      )
      .join("");
    win.document.write(`<html><head><title>SKU Labels</title></head><body>${body}</body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  const showEmpty = products && filtered.length === 0;

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(168px,1fr))" }}>
        <KpiCard icon={<Package className="h-4 w-4" aria-hidden />} tint="#EEF4FF" color="#3538CD" label="Total Products" value={kpis.total} note="Products and services" />
        <KpiCard icon={<CheckCircle2 className="h-4 w-4" aria-hidden />} tint="var(--app-success-bg)" color="var(--app-success-text)" label="Active" value={kpis.active} note="Visible in Fast Sale" />
        <KpiCard icon={<PackageX className="h-4 w-4" aria-hidden />} tint="#FEF3F2" color="var(--app-danger-strong)" label="Out of Stock" value={kpis.out} note="Cannot be sold" />
        <KpiCard icon={<AlertTriangle className="h-4 w-4" aria-hidden />} tint="var(--app-warning-bg)" color="var(--app-warning-text)" label="Low Stock" value={kpis.low} note="At or below threshold" />
        <KpiCard
          icon={<Wallet2 className="h-4 w-4" aria-hidden />}
          tint="var(--app-success-bg)"
          color="var(--app-success-text)"
          label="Catalog Value at Cost"
          value={isOwner ? formatCurrency(kpis.catValue, session.business.currency) : "Owner only"}
          note={isOwner ? "Stock on hand × cost" : "Hidden for your role"}
        />
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap items-center gap-2 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <div className="flex gap-[3px] rounded-[10px] p-[3px]" style={{ background: "var(--app-surface-2)" }}>
            <button type="button" onClick={() => setView("table")} className="flex items-center gap-1.5 rounded-[8px] px-3.5 py-2 text-[12px] font-bold" style={view === "table" ? { background: "var(--app-surface)", color: "var(--app-success-text)" } : { color: "var(--app-text-faint)" }}>
              <ListIcon className="h-3.5 w-3.5" aria-hidden /> Table
            </button>
            <button type="button" onClick={() => setView("grid")} className="flex items-center gap-1.5 rounded-[8px] px-3.5 py-2 text-[12px] font-bold" style={view === "grid" ? { background: "var(--app-surface)", color: "var(--app-success-text)" } : { color: "var(--app-text-faint)" }}>
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden /> Grid
            </button>
          </div>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Category" style={selectStyle}>
            <option value="all">All categories</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Kind" style={selectStyle}>
            <option value="all">All kinds</option>
            <option value="product">Product</option>
            <option value="service">Service</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status" style={selectStyle}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select value={stockBand} onChange={(e) => setStockBand(e.target.value as StockBand)} aria-label="Stock" style={selectStyle}>
            <option value="all">All stock</option>
            <option value="in">In Stock</option>
            <option value="low">Low</option>
            <option value="out">Out</option>
          </select>
          <span className="flex items-center gap-1.5">
            <input type="number" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder="Min" aria-label="Minimum price" className="w-[82px]" style={selectStyle} />
            <span style={{ color: "var(--app-text-disabled)" }}>–</span>
            <input type="number" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="Max" aria-label="Maximum price" className="w-[82px]" style={selectStyle} />
          </span>
          <button
            type="button"
            onClick={() => { setCategoryId("all"); setKind("all"); setStatus("all"); setStockBand("all"); setMinPrice(""); setMaxPrice(""); }}
            style={{ ...selectStyle, fontWeight: 700 }}
          >
            Clear filters
          </button>
        </div>

        <div className="flex flex-wrap gap-2 p-[11px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)", background: "var(--app-page-bg, #FCFDFD)" }}>
          <button type="button" onClick={() => setBulkPriceOpen(true)} style={toolbarBtn}>Bulk Edit Prices</button>
          <button type="button" onClick={() => setBulkCatOpen(true)} style={toolbarBtn}>Bulk Category Change</button>
          <button type="button" onClick={printSkuSheet} style={toolbarBtn}>Print SKU Labels</button>
          {selected.size > 0 && (
            <span className="ms-auto flex flex-wrap items-center gap-2.5">
              <span className="text-[12px] font-bold" style={{ color: "var(--app-success-text)" }}>{selected.size} selected</span>
              <button type="button" onClick={() => setSelected(new Set())} className="text-[12px] font-bold" style={{ color: "var(--app-text-faintest)" }}>Clear</button>
            </span>
          )}
        </div>

        {showEmpty ? (
          <div className="p-[52px_18px] text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[14px]" style={{ background: "var(--app-surface-2)" }}>
              <PackageX className="h-[23px] w-[23px]" style={{ color: "var(--app-text-disabled)" }} aria-hidden />
            </div>
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Nothing matches these filters yet</div>
            <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Try clearing a filter, or add your first product.</div>
          </div>
        ) : view === "table" ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 1020 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="w-[34px] p-[10px_0_10px_17px]"><input type="checkbox" checked={filtered.length > 0 && selected.size === filtered.length} onChange={toggleAll} aria-label="Select all products" style={{ accentColor: "var(--app-primary)" }} /></th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Photo</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Name</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Category</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Cost</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Selling</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Margin</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Stock</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Active</th>
                  <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const margin = marginPercent(p.price, p.costPrice);
                  const out = p.kind === "product" && (p.stockOnHand ?? 0) <= 0;
                  const low = p.kind === "product" && !out && (p.stockOnHand ?? 0) <= (p.lowStockThreshold ?? 0);
                  return (
                    <tr key={p.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                      <td className="p-[11px_0_11px_17px]"><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} aria-label={`Select ${p.name}`} style={{ accentColor: "var(--app-primary)" }} /></td>
                      <td className="p-[11px]">
                        <span className="flex h-[38px] w-[38px] items-center justify-center overflow-hidden rounded-[9px]" style={{ background: "var(--app-surface-2)" }}>
                          {p.photoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- signed S3/local-disk URLs aren't Next/Image-friendly remote hosts
                            <img src={p.photoUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <Package className="h-[18px] w-[18px]" style={{ color: "var(--app-text-disabled)" }} aria-hidden />
                          )}
                        </span>
                      </td>
                      <td className="p-[11px]">
                        <button type="button" onClick={() => setEditing(p)} className="text-start">
                          <span className="block text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{p.name}</span>
                          <span className="mt-0.5 block text-[11px]" style={{ color: "var(--app-text-disabled)" }}>{p.sku ?? "—"}</span>
                        </button>
                      </td>
                      <td className="p-[11px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{p.category || "—"}</td>
                      <td className="p-[11px] text-end text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{formatCurrency(p.costPrice, session.business.currency)}</td>
                      <td className="p-[11px] text-end text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(p.price, session.business.currency)}</td>
                      <td className="p-[11px] text-end"><span className="text-[11.5px] font-extrabold" style={{ color: marginColorFor(margin) }}>{margin.toFixed(0)}%</span></td>
                      <td className="p-[11px] text-end">
                        {p.kind === "service" ? (
                          <span className="text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{p.durationMinutes ?? 30} min</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>{p.stockOnHand}</span>
                            {out && <span className="whitespace-nowrap rounded-full px-[7px] py-0.5 text-[10px] font-extrabold" style={{ background: "#FEE4E2", color: "var(--app-danger-strong)" }}>Out</span>}
                            {low && <span className="whitespace-nowrap rounded-full px-[7px] py-0.5 text-[10px] font-extrabold" style={{ background: "var(--app-warning-bg)", color: "var(--app-warning-text)" }}>Low</span>}
                          </span>
                        )}
                      </td>
                      <td className="p-[11px]">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={p.active}
                          aria-label={`Active toggle for ${p.name}`}
                          onClick={() => toggleActiveMutation.mutate(p)}
                          className="relative h-[21px] w-[38px] rounded-full"
                          style={{ background: p.active ? "var(--app-primary)" : "var(--app-border-strong)" }}
                        >
                          <span className="absolute top-0.5 h-[17px] w-[17px] rounded-full bg-white transition-all" style={{ left: p.active ? 19 : 2 }} />
                        </button>
                      </td>
                      <td className="relative p-[11px_17px] text-end">
                        <button type="button" onClick={() => setMenuOpenId(menuOpenId === p.id ? null : p.id)} aria-label={`Actions for ${p.name}`} className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-[9px]" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-faint)" }}>
                          <MoreVertical className="h-4 w-4" aria-hidden />
                        </button>
                        {menuOpenId === p.id && (
                          <div className="absolute right-[17px] top-11 z-20 w-[150px] rounded-[11px] p-[5px] text-start" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", boxShadow: "0 14px 34px rgba(16,24,40,.16)" }}>
                            <button type="button" onClick={() => { setEditing(p); setMenuOpenId(null); }} className="flex w-full items-center gap-2 rounded-[8px] p-[9px_10px] text-start text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}><Pencil className="h-3.5 w-3.5" aria-hidden /> Edit</button>
                            <button type="button" onClick={() => { setDeleting(p); setMenuOpenId(null); }} className="flex w-full items-center gap-2 rounded-[8px] p-[9px_10px] text-start text-[12px] font-semibold" style={{ color: "var(--app-danger-strong)" }}><Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-3.5 p-[17px]" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))" }}>
            {filtered.map((p) => {
              const margin = marginPercent(p.price, p.costPrice);
              const out = p.kind === "product" && (p.stockOnHand ?? 0) <= 0;
              const low = p.kind === "product" && !out && (p.stockOnHand ?? 0) <= (p.lowStockThreshold ?? 0);
              return (
                <div key={p.id} className="flex flex-col gap-2.5 rounded-[14px] p-[13px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
                  <span className="flex h-24 items-center justify-center overflow-hidden rounded-[11px]" style={{ background: "var(--app-surface-2)" }}>
                    {p.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- signed S3/local-disk URLs aren't Next/Image-friendly remote hosts
                      <img src={p.photoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Package className="h-[30px] w-[30px]" style={{ color: "var(--app-text-disabled)" }} aria-hidden />
                    )}
                  </span>
                  <span className="flex items-start gap-1.5">
                    <span className="flex-1 text-[12.5px] font-bold leading-[1.35]" style={{ color: "var(--app-text)" }}>{p.name}</span>
                    <span className="mt-[5px] h-2 w-2 rounded-full" style={{ background: p.active ? "var(--app-primary)" : "var(--app-border-strong)" }} title={p.active ? "Active" : "Inactive"} />
                  </span>
                  <span className="text-[11px]" style={{ color: "var(--app-text-disabled)" }}>{p.category || "—"}</span>
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(p.price, session.business.currency)}</span>
                    <span className="text-[11px]" style={{ color: "var(--app-text-disabled)" }}>cost {formatCurrency(p.costPrice, session.business.currency)}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-[11.5px] font-extrabold" style={{ color: marginColorFor(margin) }}>{margin.toFixed(0)}% margin</span>
                    {(out || low) && <span className="ms-auto whitespace-nowrap rounded-full px-[7px] py-0.5 text-[10px] font-extrabold" style={out ? { background: "#FEE4E2", color: "var(--app-danger-strong)" } : { background: "var(--app-warning-bg)", color: "var(--app-warning-text)" }}>{out ? "Out" : "Low"}</span>}
                  </span>
                  <span className="flex gap-1.5 border-t pt-2.5" style={{ borderColor: "var(--app-surface-2)" }}>
                    <button type="button" onClick={() => setEditing(p)} className="flex-1 rounded-[9px] p-2 text-[11.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Edit</button>
                    <button type="button" onClick={() => setDeleting(p)} className="rounded-[9px] p-[8px_11px] text-[11.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-faintest)" }}>Delete</button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {session.user.role === "staff" && (
        <div className="rounded-[12px] p-[11px_14px] text-[12px]" style={{ background: "var(--app-warning-bg)", color: "#93370D", border: "1px solid var(--app-warning-border)" }}>
          Staff role is read-only here — editing, deleting and bulk actions are disabled for your role in the real product.
        </div>
      )}

      <ProductFormDrawer open={editing != null} onClose={() => setEditing(null)} product={editing} />

      <PosModalShell
        open={deleting != null}
        onClose={() => setDeleting(null)}
        title="Remove Product"
        footer={
          <>
            <button type="button" onClick={() => setDeleting(null)} style={cancelBtn}>Cancel</button>
            <button type="button" onClick={() => deleting && deleteMutation.mutate(deleting)} disabled={deleteMutation.isPending} style={{ ...dangerBtn, opacity: deleteMutation.isPending ? 0.6 : 1 }}>
              {deleteMutation.isPending ? "Removing…" : "Deactivate"}
            </button>
          </>
        }
      >
        <p className="m-0 p-[17px] text-[13px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
          There&apos;s no permanent delete — this deactivates the product so it stops showing in Fast Sale, but stays on any past orders and can be reactivated later.
        </p>
      </PosModalShell>

      <BulkPriceModal open={bulkPriceOpen} onClose={() => setBulkPriceOpen(false)} selectedIds={Array.from(selected)} currency={session.business.currency} />
      <BulkCategoryModal open={bulkCatOpen} onClose={() => setBulkCatOpen(false)} selectedIds={Array.from(selected)} products={products ?? []} />
    </main>
  );
}

function BulkPriceModal({ open, onClose, selectedIds, currency }: { open: boolean; onClose: () => void; selectedIds: string[]; currency: string }) {
  const [mode, setMode] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("");
  const [preview, setPreview] = useState<BulkPriceResult | null>(null);
  const queryClient = useQueryClient();

  const previewMutation = useMutation({
    mutationFn: () => bulkPrice({ productIds: selectedIds, mode, value: Number(value), dryRun: true }),
    onSuccess: setPreview,
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't preview this change."),
  });
  const applyMutation = useMutation({
    mutationFn: () => bulkPrice({ productIds: selectedIds, mode, value: Number(value), dryRun: false }),
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
      title="Bulk Edit Prices"
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
            <button type="button" onClick={() => previewMutation.mutate()} disabled={selectedIds.length === 0 || !value || previewMutation.isPending} style={{ ...primaryBtn, opacity: selectedIds.length === 0 || !value ? 0.6 : 1 }}>
              Preview
            </button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-3 p-[17px]">
        {selectedIds.length === 0 ? (
          <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Select one or more products in the table first.</p>
        ) : (
          <>
            <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{selectedIds.length} product(s) selected.</p>
            {!preview && (
              <div className="flex gap-2">
                <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} style={{ ...selectStyle, minHeight: 46 }}>
                  <option value="percent">Percent</option>
                  <option value="amount">Amount</option>
                </select>
                <input type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder={mode === "percent" ? "e.g. 10 or -5" : "e.g. 2 or -1"} className="flex-1 rounded-[10px] p-2.5 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
              </div>
            )}
            {preview && (
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
          </>
        )}
      </div>
    </PosModalShell>
  );
}

function BulkCategoryModal({ open, onClose, selectedIds, products }: { open: boolean; onClose: () => void; selectedIds: string[]; products: Product[] }) {
  const [categoryId, setCategoryId] = useState("");
  const queryClient = useQueryClient();
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories, staleTime: 5 * 60_000 });

  const mutation = useMutation({
    mutationFn: async () => {
      const target = categories?.find((c) => c.id === categoryId);
      if (!target) throw new Error("Pick a category");
      const results = await Promise.allSettled(selectedIds.map((id) => updateProductCategory(id, target.id, target.name)));
      return results.filter((r) => r.status === "fulfilled").length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success(`Moved ${count} product(s).`);
      onClose();
    },
    onError: () => toast.error("Couldn't move these products — please try again."),
  });

  return (
    <PosModalShell
      open={open}
      onClose={onClose}
      title="Bulk Category Change"
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={selectedIds.length === 0 || !categoryId || mutation.isPending} style={{ ...primaryBtn, opacity: selectedIds.length === 0 || !categoryId ? 0.6 : 1 }}>
            {mutation.isPending ? "Moving…" : `Move ${selectedIds.length} product(s)`}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 p-[17px]">
        {selectedIds.length === 0 ? (
          <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Select one or more products in the table first.</p>
        ) : (
          <>
            <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{selectedIds.length} product(s) selected — {products.filter((p) => selectedIds.includes(p.id)).map((p) => p.name).slice(0, 3).join(", ")}{selectedIds.length > 3 ? "…" : ""}</p>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>NEW CATEGORY</span>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={{ width: "100%", border: "1px solid var(--app-border)", borderRadius: 11, padding: 12, fontSize: 13, fontWeight: 700, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 48 }}>
                <option value="" disabled>Select a category…</option>
                {(categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
    </PosModalShell>
  );
}
