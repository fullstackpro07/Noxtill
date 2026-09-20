"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { fetchLowStock, fetchReorderSuggestions, fetchWaitlist, notifyWaitlist, type LowStockItem } from "@/lib/inventory-api";
import { formatCurrency } from "@/lib/format";
import { useInventoryDrawer, useInventorySearch, useRegisterExport } from "@/components/inventory/inventory-drawer-context";
import { INV, KpiTile, KpiSkeleton, filterSelectStyle, outlineBtnStyle, primaryBtnStyle, EmptyBlock, chipStyle } from "@/components/inventory/inventory-ui";
import { classifyUrgency, type Urgency } from "@/components/inventory/inventory-classification";
import { CheckCircle2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";

function priorityFor(item: LowStockItem): Urgency {
  return classifyUrgency(item.stockQty, item.daysOfCover);
}
const PRIORITY_TONE: Record<Urgency, "red" | "amber" | "neutral"> = { Critical: "red", High: "amber", Medium: "neutral" };

type DaysFilter = "all" | "under7" | "under14" | "over14";

export function LowStockView({ currency }: { currency: string }) {
  const [category, setCategory] = useState("all");
  const [supplier, setSupplier] = useState("all");
  const [daysFilter, setDaysFilter] = useState<DaysFilter>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { query } = useInventorySearch();
  const { openThresholds, openPo, openWaitlist } = useInventoryDrawer();

  const { data: items = [], isPending, isError, refetch } = useQuery({ queryKey: ["low-stock"], queryFn: fetchLowStock });
  const { data: reorderGroups = [] } = useQuery({ queryKey: ["reorder-suggestions"], queryFn: fetchReorderSuggestions });

  const suggestedByProduct = useMemo(() => {
    const map = new Map<string, { qty: number; supplierId: string; supplierName: string }>();
    for (const g of reorderGroups) {
      for (const item of g.items) {
        map.set(item.productId, { qty: item.suggestedQty, supplierId: g.supplierId, supplierName: g.supplierName });
      }
    }
    return map;
  }, [reorderGroups]);

  const categories = useMemo(() => [...new Set(items.map((i) => i.category).filter((c): c is string => Boolean(c)))].sort(), [items]);
  const suppliers = useMemo(() => [...new Set(items.map((i) => i.supplier).filter((s): s is string => Boolean(s)))].sort(), [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (q && !item.name.toLowerCase().includes(q)) return false;
      if (category !== "all" && item.category !== category) return false;
      if (supplier !== "all" && item.supplier !== supplier) return false;
      if (daysFilter !== "all") {
        const d = item.daysOfCover;
        if (daysFilter === "under7" && !(d != null && d < 7)) return false;
        if (daysFilter === "under14" && !(d != null && d < 14)) return false;
        if (daysFilter === "over14" && !(d == null || d >= 14)) return false;
      }
      return true;
    });
  }, [items, query, category, supplier, daysFilter]);

  const belowThreshold = items.filter((i) => i.status === "low_stock").length;
  const outCount = items.filter((i) => i.status === "out_of_stock").length;
  const totalLostSales = items.reduce((sum, i) => sum + i.lostSalesEstimate, 0);
  const reorderValue = [...suggestedByProduct.entries()].reduce((sum, [productId, s]) => {
    const item = items.find((i) => i.id === productId);
    return sum + s.qty * (item?.costPrice ?? 0);
  }, 0);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function buildPrefill(ids: string[]) {
    const withSuggestion = ids.map((id) => ({ id, s: suggestedByProduct.get(id) })).filter((x): x is { id: string; s: { qty: number; supplierId: string; supplierName: string } } => Boolean(x.s));
    if (withSuggestion.length === 0) return null;
    const bySupplier = new Map<string, typeof withSuggestion>();
    for (const row of withSuggestion) {
      const list = bySupplier.get(row.s.supplierId) ?? [];
      list.push(row);
      bySupplier.set(row.s.supplierId, list);
    }
    const [supplierId, rows] = [...bySupplier.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    return {
      supplierId: supplierId !== "unassigned" ? supplierId : undefined,
      prefill: rows.map((r) => ({ productId: r.id, qty: r.s.qty })),
      skipped: withSuggestion.length - rows.length,
    };
  }

  function reorder(ids: string[]) {
    const built = buildPrefill(ids);
    if (!built) {
      toast.error("None of these products have a supplier on record to reorder from.");
      return;
    }
    if (built.skipped > 0) {
      toast.success(`Opening a draft for one supplier — ${built.skipped} item(s) from a different supplier need a separate order.`);
    }
    openPo({ supplierId: built.supplierId, prefill: built.prefill });
  }

  const notifyAllMutation = useMutation({
    mutationFn: async () => {
      const lists = await Promise.all(filtered.map((item) => fetchWaitlist(item.id).then((w) => ({ item, waiting: w.filter((e) => !e.notifiedAt) }))));
      const withWaiting = lists.filter((l) => l.waiting.length > 0);
      const results = await Promise.all(withWaiting.map((l) => notifyWaitlist(l.item.id)));
      return results.reduce((sum, r) => sum + r.notifiedCount, 0);
    },
    onSuccess: (total) => {
      toast.success(total > 0 ? `Notified ${total} waiting customer${total === 1 ? "" : "s"} across ${filtered.length} products.` : "No one is waiting on any of these products right now.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't notify waitlists — please try again."),
  });

  useRegisterExport(() => {
    const header = ["Product", "Priority", "On hand", "Threshold", "Avg daily sales", "Days until out", "Suggested qty", "Supplier"];
    const rows = filtered.map((i) => {
      const suggestion = suggestedByProduct.get(i.id);
      return [i.name, priorityFor(i), i.stockQty, i.lowStockThreshold, i.velocityPerDay, i.daysOfCover ?? "", suggestion?.qty ?? "", i.supplier ?? ""];
    });
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "low-stock.csv";
    link.click();
    URL.revokeObjectURL(url);
  });

  if (isError) {
    return (
      <div style={{ margin: 22, background: "#fff", border: "1px solid #FDD9D6", borderRadius: 16, padding: "48px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: "#B42318" }}>Couldn&apos;t load low stock</div>
        <button type="button" onClick={() => refetch()} style={{ marginTop: 15, border: 0, background: INV.primary, borderRadius: 12, padding: "12px 22px", fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46 }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <main style={{ padding: "16px 22px 26px", display: "flex", flexDirection: "column", gap: 15 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: "#B54708", background: "#FEF6E7", borderRadius: 20, padding: "5px 12px" }}>
          {belowThreshold} below threshold · {outCount} out
        </span>
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
        <select value={daysFilter} onChange={(e) => setDaysFilter(e.target.value as DaysFilter)} aria-label="Days until out" style={filterSelectStyle}>
          <option value="all">All</option>
          <option value="under7">Under 7 days</option>
          <option value="under14">Under 14 days</option>
          <option value="over14">14 days or more</option>
        </select>
        <div style={{ display: "flex", gap: 9, marginLeft: "auto", flexWrap: "wrap" }}>
          <button type="button" onClick={() => openThresholds(selectedIds.size > 0 ? [...selectedIds] : filtered.map((i) => i.id))} style={outlineBtnStyle}>
            Adjust Thresholds{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
          </button>
          <button type="button" onClick={() => notifyAllMutation.mutate()} disabled={notifyAllMutation.isPending} style={{ ...outlineBtnStyle, opacity: notifyAllMutation.isPending ? 0.6 : 1 }}>
            {notifyAllMutation.isPending ? "Notifying…" : "Notify Waiting Customers"}
          </button>
          {selectedIds.size > 0 && (
            <button type="button" onClick={() => reorder([...selectedIds])} style={outlineBtnStyle}>
              Reorder Selected ({selectedIds.size})
            </button>
          )}
          <button type="button" onClick={() => reorder(filtered.map((i) => i.id))} style={primaryBtnStyle}>
            Reorder All
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14 }}>
        {isPending ? (
          <KpiSkeleton count={4} />
        ) : (
          <>
            <KpiTile label="Below Threshold" value={String(belowThreshold)} tone="amber" />
            <KpiTile label="Out of Stock" value={String(outCount)} tone="red" />
            <KpiTile label="Lost Sales" value={formatCurrency(totalLostSales, currency)} meta={<span style={{ fontSize: 10, fontWeight: 800, color: "#B54708", background: "#FEF6E7", borderRadius: 6, padding: "3px 7px" }}>Estimate</span>} />
            <KpiTile label="Reorder Value Needed" value={formatCurrency(reorderValue, currency)} />
          </>
        )}
      </div>

      <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 16, overflow: "hidden" }}>
        {isPending ? null : filtered.length === 0 ? (
          <EmptyBlock icon={CheckCircle2} iconBg="#E8F7EE" iconColor="#12A150" title="Nothing running low" description={items.length === 0 ? "Every tracked product is above its threshold." : "Nothing matches these filters."} />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1120 }}>
              <thead>
                <tr style={{ background: "#FAFBFC" }}>
                  <th style={{ padding: "10px 0 10px 17px", width: 34 }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filtered.length && filtered.length > 0}
                      onChange={(e) => setSelectedIds(e.target.checked ? new Set(filtered.map((i) => i.id)) : new Set())}
                      aria-label="Select all low stock"
                      style={{ width: 15, height: 15, accentColor: INV.primary }}
                    />
                  </th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Product</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Priority</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>On hand</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Threshold</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Avg daily sales</th>
                  <th style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Days until out</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Suggested qty</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Supplier</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const priority = priorityFor(item);
                  const suggestion = suggestedByProduct.get(item.id);
                  return (
                    <tr key={item.id} style={{ borderTop: "1px solid #F2F4F7" }}>
                      <td style={{ padding: "11px 0 11px 17px" }}>
                        <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelected(item.id)} aria-label={`Select ${item.name}`} style={{ width: 15, height: 15, accentColor: INV.primary }} />
                      </td>
                      <td style={{ padding: 11, fontSize: 12.5, fontWeight: 700, color: "#101828" }}>{item.name}</td>
                      <td style={{ padding: 11 }}>
                        <span style={chipStyle(PRIORITY_TONE[priority])}>{priority}</span>
                      </td>
                      <td style={{ padding: 11, fontSize: 13, fontWeight: 800, color: "#0F172A", textAlign: "right" }}>{item.stockQty}</td>
                      <td style={{ padding: 11, fontSize: 12.5, color: "#98A2B3", textAlign: "right" }}>{item.lowStockThreshold}</td>
                      <td style={{ padding: 11, fontSize: 12.5, color: "#475467", textAlign: "right" }}>{item.velocityPerDay > 0 ? `${item.velocityPerDay}/day` : "—"}</td>
                      <td style={{ padding: 11, fontSize: 12.5, fontWeight: 700, color: "#B54708", textAlign: "center" }}>{item.status === "out_of_stock" ? "Out now" : item.daysOfCover != null ? `${item.daysOfCover}d` : "—"}</td>
                      <td style={{ padding: 11, fontSize: 12.5, fontWeight: 800, color: "#0E8442", textAlign: "right" }}>{suggestion?.qty ?? "—"}</td>
                      <td style={{ padding: 11, fontSize: 12, color: "#667085" }}>{item.supplier ?? "—"}</td>
                      <td style={{ padding: "11px 17px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 7 }}>
                          <button type="button" onClick={() => openWaitlist(item.id)} style={{ border: `1px solid ${INV.border}`, background: "#fff", borderRadius: 9, padding: "8px 11px", fontSize: 11.5, fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: 40 }}>
                            Waitlist
                          </button>
                          <button
                            type="button"
                            onClick={() => reorder([item.id])}
                            disabled={!suggestion}
                            style={{ border: 0, background: INV.primary, borderRadius: 9, padding: "8px 13px", fontSize: 11.5, fontWeight: 800, color: "#fff", cursor: suggestion ? "pointer" : "default", minHeight: 40, opacity: suggestion ? 1 : 0.5 }}
                          >
                            Reorder
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
      </div>
    </main>
  );
}
