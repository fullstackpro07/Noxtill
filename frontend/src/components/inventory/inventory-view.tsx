"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Boxes } from "lucide-react";
import { fetchInventory, fetchReorderSuggestions, type LiveInventoryItem } from "@/lib/inventory-api";
import { formatCurrency, formatDate } from "@/lib/format";
import { useInventoryDrawer } from "@/components/inventory/inventory-drawer-context";
import { useInventorySearch, useRegisterExport } from "@/components/inventory/inventory-drawer-context";
import { INV, KpiTile, KpiSkeleton, th, filterSelectStyle, outlineBtnStyle, EmptyBlock, chipStyle } from "@/components/inventory/inventory-ui";
import { canApplyStockCountsByDefaultRole } from "@/components/inventory/inventory-classification";
import { useSession } from "@/lib/session";
import Link from "next/link";

type StatusFilter = "all" | "Healthy" | "Low" | "Out" | "Overstocked";

const CATEGORY_COLORS = ["#12A150", "#3538CD", "#B54708", "#7E22CE", "#B42318", "#475467"];

function coverStyle(item: LiveInventoryItem): { bg: string; fg: string; label: string } {
  if (item.daysOfCover == null) return { bg: "#F2F4F7", fg: "#667085", label: "No recent sales" };
  if (item.status === "out_of_stock") return { bg: "#FEF3F2", fg: "#B42318", label: "Out now" };
  if (item.daysOfCover <= 7) return { bg: "#FEF3F2", fg: "#B42318", label: `${item.daysOfCover}d` };
  if (item.daysOfCover <= 21) return { bg: "#FEF6E7", fg: "#B54708", label: `${item.daysOfCover}d` };
  if (item.overstocked) return { bg: "#F5EBFE", fg: "#7E22CE", label: `${item.daysOfCover}d` };
  return { bg: "#E8F7EE", fg: "#0E8442", label: `${item.daysOfCover}d` };
}

function statusChip(item: LiveInventoryItem) {
  if (item.status === "out_of_stock") return { ...chipStyle("red"), label: "Out of stock" };
  if (item.status === "low_stock") return { ...chipStyle("amber"), label: "Low stock" };
  if (item.overstocked) return { ...chipStyle("purple"), label: "Overstocked" };
  return { ...chipStyle("green"), label: "Healthy" };
}

export function InventoryView({ currency }: { currency: string }) {
  const session = useSession();
  const canAdjust = canApplyStockCountsByDefaultRole(session.user.role);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [category, setCategory] = useState("all");
  const [supplier, setSupplier] = useState("all");
  const [minValue, setMinValue] = useState("");
  const [maxValue, setMaxValue] = useState("");
  const { query } = useInventorySearch();
  const { openHistory, openPo, openWastage, openAdjust } = useInventoryDrawer();

  const { data: items = [], isPending, isError, refetch } = useQuery({ queryKey: ["inventory"], queryFn: fetchInventory });
  const { data: reorderGroups = [] } = useQuery({ queryKey: ["reorder-suggestions"], queryFn: fetchReorderSuggestions });
  const reorderProductIds = useMemo(() => new Set(reorderGroups.flatMap((g) => g.items.map((i) => i.productId))), [reorderGroups]);

  const categories = useMemo(() => [...new Set(items.map((i) => i.category).filter((c): c is string => Boolean(c)))].sort(), [items]);
  const suppliers = useMemo(() => [...new Set(items.map((i) => i.supplier).filter((s): s is string => Boolean(s)))].sort(), [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (q && !item.name.toLowerCase().includes(q) && !(item.sku ?? "").toLowerCase().includes(q)) return false;
      if (statusFilter === "Healthy" && item.status !== "ok") return false;
      if (statusFilter === "Low" && item.status !== "low_stock") return false;
      if (statusFilter === "Out" && item.status !== "out_of_stock") return false;
      if (statusFilter === "Overstocked" && !item.overstocked) return false;
      if (category !== "all" && item.category !== category) return false;
      if (supplier !== "all" && item.supplier !== supplier) return false;
      if (minValue !== "" && item.stockValue < Number(minValue)) return false;
      if (maxValue !== "" && item.stockValue > Number(maxValue)) return false;
      return true;
    });
  }, [items, query, statusFilter, category, supplier, minValue, maxValue]);

  const tracked = items.length;
  const stockValue = items.reduce((s, i) => s + i.stockValue, 0);
  const lowCount = items.filter((i) => i.status === "low_stock").length;
  const outCount = items.filter((i) => i.status === "out_of_stock").length;
  const overCount = items.filter((i) => i.overstocked).length;

  const categoryBars = useMemo(() => {
    const byCategory = new Map<string, number>();
    for (const item of items) {
      const key = item.category ?? "Uncategorized";
      byCategory.set(key, (byCategory.get(key) ?? 0) + item.stockValue);
    }
    const total = [...byCategory.values()].reduce((a, b) => a + b, 0);
    return [...byCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value], i) => ({
        name,
        value,
        pct: total > 0 ? Math.round((value / total) * 100) : 0,
        color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      }));
  }, [items]);

  const topByValue = useMemo(() => [...items].sort((a, b) => b.stockValue - a.stockValue).slice(0, 6), [items]);
  const topMax = Math.max(1, ...topByValue.map((i) => i.stockValue));

  useRegisterExport(() => {
    const header = ["Product", "SKU", "Category", "On hand", "Threshold", "Value at cost", "Last purchase", "Last sold", "Days of cover", "Status"];
    const rows = filtered.map((i) => [
      i.name,
      i.sku ?? "",
      i.category ?? "",
      i.stockQty,
      i.lowStockThreshold,
      i.stockValue,
      i.lastPurchaseAt ? formatDate(i.lastPurchaseAt) : "",
      i.lastSoldAt ? formatDate(i.lastSoldAt) : "",
      i.daysOfCover ?? "",
      statusChip(i).label,
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "stock.csv";
    link.click();
    URL.revokeObjectURL(url);
  });

  if (isError) {
    return (
      <div style={{ margin: 22, background: "#fff", border: "1px solid #FDD9D6", borderRadius: 16, padding: "48px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: "#B42318" }}>Couldn&apos;t load inventory</div>
        <button type="button" onClick={() => refetch()} style={{ marginTop: 15, border: 0, background: INV.primary, borderRadius: 12, padding: "12px 22px", fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46 }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <main style={{ padding: "16px 22px 26px", display: "flex", flexDirection: "column", gap: 15 }}>
      <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
        <button type="button" onClick={() => openPo()} style={outlineBtnStyle}>
          Record Purchase
        </button>
        <button type="button" onClick={() => openWastage()} style={outlineBtnStyle}>
          Record Wastage
        </button>
        <Link href="/inventory/stock-count" style={outlineBtnStyle}>
          Stock Count
        </Link>
        <Link href="/inventory/low-stock" style={outlineBtnStyle}>
          Reorder Low Stock
        </Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(175px,1fr))", gap: 14 }}>
        {isPending ? (
          <KpiSkeleton count={5} />
        ) : (
          <>
            <KpiTile label="Products Tracked" value={String(tracked)} />
            <KpiTile label="Stock Value at Cost" value={formatCurrency(stockValue, currency)} tone="green" />
            <KpiTile label="Low Stock" value={String(lowCount)} tone="amber" />
            <KpiTile label="Out of Stock" value={String(outCount)} tone="red" />
            <KpiTile label="Overstocked" value={String(overCount)} />
          </>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: 15, alignItems: "start" }}>
        <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 16, padding: 17, minWidth: 0 }}>
          <h3 style={{ margin: "0 0 6px", fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Where the capital sits</h3>
          {topByValue.length === 0 ? (
            <div style={{ fontSize: 12.5, color: INV.textFaint, padding: "20px 0" }}>No stocked products yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
              {topByValue.map((item) => (
                <div key={item.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: "#344054" }}>{item.name}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: "#101828" }}>{formatCurrency(item.stockValue, currency)}</span>
                  </div>
                  <div style={{ height: 9, borderRadius: 6, background: "#F2F4F7", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 6, background: INV.primary, width: `${Math.round((item.stockValue / topMax) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11, color: INV.textFaint, marginTop: 12, lineHeight: 1.5 }}>Daily stock-value snapshots aren&apos;t stored yet, so a historical trend line isn&apos;t shown here — these are today&apos;s real top holdings by cost value.</div>
        </div>
        <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 16, padding: 17 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Stock by category</h3>
          {categoryBars.length === 0 ? (
            <div style={{ fontSize: 12.5, color: INV.textFaint }}>No categories set yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {categoryBars.map((c) => (
                <div key={c.name}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: "#344054" }}>{c.name}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: "#101828" }}>{c.pct}%</span>
                  </div>
                  <div style={{ height: 9, borderRadius: 6, background: "#F2F4F7", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 6, background: c.color, width: `${c.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 16, overflow: "hidden" }}>
        <div style={{ padding: "13px 17px", borderBottom: "1px solid #F0F2F5", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} aria-label="Status" style={filterSelectStyle}>
            <option value="all">All statuses</option>
            <option value="Healthy">Healthy</option>
            <option value="Low">Low</option>
            <option value="Out">Out</option>
            <option value="Overstocked">Overstocked</option>
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" style={filterSelectStyle}>
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select value={supplier} onChange={(e) => setSupplier(e.target.value)} aria-label="Supplier" style={filterSelectStyle}>
            <option value="all">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="number" value={minValue} onChange={(e) => setMinValue(e.target.value)} placeholder="Min value" aria-label="Minimum value" style={{ width: 96, border: `1px solid ${INV.border}`, borderRadius: 10, padding: 9, fontSize: 12.5, minHeight: 42 }} />
            <span style={{ color: "#98A2B3", fontSize: 12 }}>–</span>
            <input type="number" value={maxValue} onChange={(e) => setMaxValue(e.target.value)} placeholder="Max" aria-label="Maximum value" style={{ width: 88, border: `1px solid ${INV.border}`, borderRadius: 10, padding: 9, fontSize: 12.5, minHeight: 42 }} />
          </span>
        </div>

        {isPending ? null : filtered.length === 0 ? (
          <EmptyBlock
            icon={Boxes}
            iconBg="#F2F4F7"
            iconColor="#98A2B3"
            title={items.length === 0 ? "Add products with stock tracking to see inventory" : "Nothing matches these filters"}
            description={items.length === 0 ? "Products you add with kind “Product” will show up here." : "Try a different search or filter."}
            action={
              items.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter("all");
                    setCategory("all");
                    setSupplier("all");
                    setMinValue("");
                    setMaxValue("");
                  }}
                  style={outlineBtnStyle}
                >
                  Clear filters
                </button>
              ) : undefined
            }
          />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1120 }}>
              <thead>
                <tr style={{ background: "#FAFBFC" }}>
                  <th style={th("left")}>Product</th>
                  <th style={th("right")}>On hand</th>
                  <th style={th("right")}>Threshold</th>
                  <th style={th("right")}>Value at cost</th>
                  <th style={th("left")}>Last purchase</th>
                  <th style={th("left")}>Last sold</th>
                  <th style={th("center")}>Days of cover</th>
                  <th style={th("left")}>Status</th>
                  <th style={th("right")}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const cover = coverStyle(item);
                  const chip = statusChip(item);
                  const needsReorder = reorderProductIds.has(item.id);
                  return (
                    <tr key={item.id} style={{ borderTop: "1px solid #F2F4F7" }}>
                      <td style={{ padding: "11px 17px" }}>
                        <button type="button" onClick={() => openHistory(item.id)} style={{ border: 0, background: "none", padding: 0, textAlign: "left", cursor: "pointer" }}>
                          <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#0E8442" }}>{item.name}</span>
                          <span style={{ display: "block", fontSize: 10.5, color: "#98A2B3", marginTop: 2 }}>
                            {item.sku ?? "No SKU"} · {item.category ?? "Uncategorized"}
                          </span>
                        </button>
                      </td>
                      <td style={{ padding: 11, fontSize: 13, fontWeight: 800, color: "#0F172A", textAlign: "right" }}>{item.stockQty}</td>
                      <td style={{ padding: 11, fontSize: 12.5, color: "#98A2B3", textAlign: "right" }}>{item.lowStockThreshold}</td>
                      <td style={{ padding: 11, fontSize: 12.5, fontWeight: 700, color: "#101828", textAlign: "right" }}>{formatCurrency(item.stockValue, currency)}</td>
                      <td style={{ padding: 11, fontSize: 12, color: "#667085", whiteSpace: "nowrap" }}>{item.lastPurchaseAt ? formatDate(item.lastPurchaseAt) : "—"}</td>
                      <td style={{ padding: 11, fontSize: 12, color: "#667085", whiteSpace: "nowrap" }}>{item.lastSoldAt ? formatDate(item.lastSoldAt) : "—"}</td>
                      <td style={{ padding: 11, textAlign: "center" }}>
                        <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: cover.bg, color: cover.fg, whiteSpace: "nowrap" }}>{cover.label}</span>
                      </td>
                      <td style={{ padding: 11 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: chip.background, color: chip.color, whiteSpace: "nowrap" }}>{chip.label}</span>
                      </td>
                      <td style={{ padding: "11px 17px", textAlign: "right" }}>
                        <span style={{ display: "inline-flex", gap: 7, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          {canAdjust && (
                            <button type="button" onClick={() => openAdjust(item.id)} style={{ border: `1px solid ${INV.border}`, background: "#fff", borderRadius: 9, padding: "8px 11px", fontSize: 11.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 40 }}>
                              Adjust
                            </button>
                          )}
                          {needsReorder && (
                            <Link href="/inventory/low-stock" style={{ border: 0, background: INV.primary, borderRadius: 9, padding: "8px 13px", fontSize: 11.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 40, display: "inline-flex", alignItems: "center" }}>
                              Reorder
                            </Link>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ padding: "11px 17px", borderTop: "1px solid #F0F2F5", fontSize: 11.5, color: "#98A2B3" }}>Every purchase, sale, wastage and adjustment writes a stock movement — these figures and the Movements screen never disagree.</div>
      </div>
    </main>
  );
}
