"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Check, Sparkles } from "lucide-react";
import { fetchInventory, fetchLowStock, fetchReorderSuggestions } from "@/lib/inventory-api";
import { formatCurrency } from "@/lib/format";
import { useInventoryDrawer, useInventorySearch, useRegisterExport } from "@/components/inventory/inventory-drawer-context";
import { INV, KpiTile, KpiSkeleton, filterSelectStyle, outlineBtnStyle, primaryBtnStyle, EmptyBlock, chipStyle, type Tone } from "@/components/inventory/inventory-ui";
import { classifyUrgency, type Urgency } from "@/components/inventory/inventory-classification";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";

const URGENCY_TONE: Record<Urgency, Tone> = { Critical: "red", High: "amber", Medium: "neutral" };

export function ReorderSuggestionsView() {
  const session = useSession();
  const currency = session.business.currency;
  const [supplier, setSupplier] = useState("all");
  const [urgency, setUrgency] = useState<Urgency | "all">("all");
  const [category, setCategory] = useState("all");
  const [decisions, setDecisions] = useState<Record<string, "accepted" | "dismissed">>({});
  const { query } = useInventorySearch();
  const { openPo, openRationale } = useInventoryDrawer();
  const queryClient = useQueryClient();

  const { data: items = [] } = useQuery({ queryKey: ["inventory"], queryFn: fetchInventory });
  const { data: lowStock = [] } = useQuery({ queryKey: ["low-stock"], queryFn: fetchLowStock });
  const { data: groups = [], isPending, dataUpdatedAt } = useQuery({ queryKey: ["reorder-suggestions"], queryFn: fetchReorderSuggestions });

  const rows = useMemo(() => {
    const itemById = new Map(items.map((i) => [i.id, i]));
    return groups.flatMap((g) =>
      g.items.map((s) => {
        const item = itemById.get(s.productId);
        return {
          productId: s.productId,
          name: s.name,
          category: item?.category ?? null,
          supplierId: g.supplierId,
          supplierName: g.supplierName,
          stock: s.currentStock,
          velocity: s.velocityPerDay,
          cover: item?.daysOfCover ?? null,
          suggested: s.suggestedQty,
          estCost: s.suggestedQty * (item?.costPrice ?? 0),
          urgency: classifyUrgency(item?.stockQty ?? s.currentStock, item?.daysOfCover ?? null),
        };
      }),
    );
  }, [groups, items]);

  const suppliers = useMemo(() => [...new Set(rows.map((r) => r.supplierName))].sort(), [rows]);
  const categories = useMemo(() => [...new Set(rows.map((r) => r.category).filter((c): c is string => Boolean(c)))].sort(), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (supplier !== "all" && r.supplierName !== supplier) return false;
      if (urgency !== "all" && r.urgency !== urgency) return false;
      if (category !== "all" && r.category !== category) return false;
      if (q && !r.name.toLowerCase().includes(q) && !r.supplierName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, supplier, urgency, category, query]);

  const suggestionCount = rows.length;
  const orderValue = rows.reduce((s, r) => s + r.estCost, 0);
  const atRisk = rows.filter((r) => r.cover != null && r.cover < 7).length;
  const lostSalesEstimate = lowStock.reduce((sum, i) => sum + i.lostSalesEstimate, 0);

  const velocityChart = useMemo(() => {
    const top = [...rows].sort((a, b) => b.velocity - a.velocity).slice(0, 6);
    const maxVel = Math.max(1, ...top.map((r) => r.velocity));
    const maxCover = Math.max(1, ...top.map((r) => r.cover ?? 0));
    return top.map((r) => ({ name: r.name, velPct: Math.round((r.velocity / maxVel) * 100), coverPct: r.cover != null ? Math.round((r.cover / maxCover) * 100) : 0, coverColor: r.cover != null && r.cover <= 7 ? "#B42318" : "#12A150", velLabel: `${r.velocity}/day`, coverLabel: r.cover != null ? `${r.cover}d cover` : "No sales" }));
  }, [rows]);

  function accept(productId: string) {
    const row = rows.find((r) => r.productId === productId);
    if (!row) return;
    setDecisions((prev) => ({ ...prev, [productId]: "accepted" }));
    openPo({ supplierId: row.supplierId !== "unassigned" ? row.supplierId : undefined, prefill: [{ productId: row.productId, qty: row.suggested }] });
  }
  function dismiss(productId: string) {
    setDecisions((prev) => ({ ...prev, [productId]: "dismissed" }));
  }
  function acceptAll() {
    const pending = filtered.filter((r) => !decisions[r.productId]);
    if (pending.length === 0) return;
    const bySupplier = new Map<string, typeof pending>();
    for (const r of pending) {
      const list = bySupplier.get(r.supplierId) ?? [];
      list.push(r);
      bySupplier.set(r.supplierId, list);
    }
    const [supplierId, group] = [...bySupplier.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    setDecisions((prev) => {
      const next = { ...prev };
      for (const r of group) next[r.productId] = "accepted";
      return next;
    });
    if (group.length < pending.length) {
      toast.success(`Opening a draft for one supplier — ${pending.length - group.length} item(s) from other suppliers need a separate order.`);
    }
    openPo({ supplierId: supplierId !== "unassigned" ? supplierId : undefined, prefill: group.map((r) => ({ productId: r.productId, qty: r.suggested })) });
  }

  useRegisterExport(() => {
    const header = ["Product", "Urgency", "Current stock", "Daily velocity", "Days of cover", "Suggested qty", "Supplier", "Est. cost"];
    const csvRows = filtered.map((r) => [r.name, r.urgency, r.stock, r.velocity, r.cover ?? "", r.suggested, r.supplierName, r.estCost]);
    const csv = [header, ...csvRows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "reorder-suggestions.csv";
    link.click();
    URL.revokeObjectURL(url);
  });

  return (
    <main style={{ padding: "16px 22px 26px", display: "flex", flexDirection: "column", gap: 15 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "#3538CD", background: "#EEF4FF", borderRadius: 20, padding: "5px 12px" }}>
          Generated {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "…"}
        </span>
        <select value={supplier} onChange={(e) => setSupplier(e.target.value)} aria-label="Supplier" style={filterSelectStyle}>
          <option value="all">All suppliers</option>
          {suppliers.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={urgency} onChange={(e) => setUrgency(e.target.value as Urgency | "all")} aria-label="Urgency" style={filterSelectStyle}>
          <option value="all">All urgency</option>
          <option value="Critical">Critical</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" style={filterSelectStyle}>
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 9, marginLeft: "auto", flexWrap: "wrap" }}>
          <button type="button" onClick={() => queryClient.invalidateQueries({ queryKey: ["reorder-suggestions"] })} style={{ ...outlineBtnStyle, display: "flex", alignItems: "center", gap: 7 }}>
            <RefreshCw size={14} />
            Refresh
          </button>
          <button type="button" onClick={acceptAll} style={outlineBtnStyle}>
            Accept All
          </button>
          <button type="button" onClick={acceptAll} style={primaryBtnStyle}>
            Create Purchase Orders
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14 }}>
        {isPending ? (
          <KpiSkeleton count={4} />
        ) : (
          <>
            <KpiTile label="Suggestions" value={String(suggestionCount)} />
            <KpiTile label="Order Value" value={formatCurrency(orderValue, currency)} meta={<span style={{ fontSize: 10, fontWeight: 800, color: "#B54708", background: "#FEF6E7", borderRadius: 6, padding: "3px 7px" }}>Estimate</span>} />
            <KpiTile label="Products at Risk" value={String(atRisk)} tone="red" meta="Under a week of cover" />
            <KpiTile label="Potential Lost Sales" value={formatCurrency(lostSalesEstimate, currency)} meta={<span style={{ fontSize: 10, fontWeight: 800, color: "#B54708", background: "#FEF6E7", borderRadius: 6, padding: "3px 7px" }}>Estimate</span>} />
          </>
        )}
      </div>

      {velocityChart.length > 0 && (
        <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 16, padding: 17 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Sales velocity vs stock cover</h3>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: "#475467" }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: "#C7D7FE" }} />
              Daily velocity
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: "#475467" }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: "#12A150" }} />
              Days of cover
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            {velocityChart.map((v) => (
              <div key={v.name}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#344054", marginBottom: 6 }}>{v.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ flex: 1, height: 8, borderRadius: 6, background: "#F2F4F7", overflow: "hidden", display: "block" }}>
                    <span style={{ display: "block", height: "100%", borderRadius: 6, background: "#C7D7FE", width: `${v.velPct}%` }} />
                  </span>
                  <span style={{ width: 76, fontSize: 10.5, fontWeight: 700, color: "#475467", textAlign: "right" }}>{v.velLabel}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ flex: 1, height: 8, borderRadius: 6, background: "#F2F4F7", overflow: "hidden", display: "block" }}>
                    <span style={{ display: "block", height: "100%", borderRadius: 6, background: v.coverColor, width: `${v.coverPct}%` }} />
                  </span>
                  <span style={{ width: 76, fontSize: 10.5, fontWeight: 700, color: "#475467", textAlign: "right" }}>{v.coverLabel}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 16, overflow: "hidden" }}>
        {isPending ? null : filtered.length === 0 ? (
          <EmptyBlock icon={Sparkles} iconBg="#F5EBFE" iconColor="#7E22CE" title="We need a few weeks of sales history to suggest reorder quantities" description="Nothing matches these filters, or there is not enough sales data yet." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1120 }}>
              <thead>
                <tr style={{ background: "#FAFBFC" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Product</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Urgency</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Current stock</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Daily velocity</th>
                  <th style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Days of cover</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Suggested qty</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Supplier</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Est. cost</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const decision = decisions[r.productId];
                  return (
                    <tr key={r.productId} style={{ borderTop: "1px solid #F2F4F7" }}>
                      <td style={{ padding: "11px 17px" }}>
                        <button type="button" onClick={() => openRationale(r.productId)} style={{ border: 0, background: "none", padding: 0, fontSize: 12.5, fontWeight: 700, color: "#0E8442", cursor: "pointer", textAlign: "left" }}>
                          {r.name}
                        </button>
                      </td>
                      <td style={{ padding: 11 }}>
                        <span style={chipStyle(URGENCY_TONE[r.urgency])}>{r.urgency}</span>
                      </td>
                      <td style={{ padding: 11, fontSize: 13, fontWeight: 800, color: "#0F172A", textAlign: "right" }}>{r.stock}</td>
                      <td style={{ padding: 11, fontSize: 12.5, color: "#475467", textAlign: "right" }}>{r.velocity}/day</td>
                      <td style={{ padding: 11, fontSize: 12.5, fontWeight: 700, color: "#B54708", textAlign: "center" }}>{r.cover != null ? `${r.cover}d` : "—"}</td>
                      <td style={{ padding: 11, fontSize: 12.5, fontWeight: 800, color: "#0E8442", textAlign: "right" }}>{r.suggested}</td>
                      <td style={{ padding: 11, fontSize: 12, color: "#667085" }}>{r.supplierName}</td>
                      <td style={{ padding: 11, fontSize: 12.5, fontWeight: 700, color: "#101828", textAlign: "right" }}>{formatCurrency(r.estCost, currency)}</td>
                      <td style={{ padding: "11px 17px", textAlign: "right" }}>
                        <span style={{ display: "inline-flex", gap: 7, justifyContent: "flex-end" }}>
                          {!decision && (
                            <>
                              <button type="button" onClick={() => dismiss(r.productId)} style={{ border: `1px solid ${INV.border}`, background: "#fff", borderRadius: 9, padding: "8px 11px", fontSize: 11.5, fontWeight: 700, color: "#667085", cursor: "pointer", minHeight: 40 }}>
                                Dismiss
                              </button>
                              <button type="button" onClick={() => accept(r.productId)} style={{ border: 0, background: INV.primary, borderRadius: 9, padding: "8px 13px", fontSize: 11.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 40 }}>
                                Accept
                              </button>
                            </>
                          )}
                          {decision === "accepted" && (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 800, color: "#0E8442" }}>
                              <Check size={13} />
                              Accepted
                            </span>
                          )}
                          {decision === "dismissed" && <span style={{ fontSize: 11.5, fontWeight: 700, color: "#98A2B3" }}>Dismissed</span>}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ padding: "11px 17px", borderTop: "1px solid #F0F2F5", fontSize: 11.5, color: "#98A2B3" }}>
          Suggestions come from your own sales velocity over the last 30 days. Click a product name to see exactly how its quantity was worked out. Accept/Dismiss is just for this screen — it isn&apos;t saved anywhere, since there&apos;s nowhere in the backend to store it yet.
        </div>
      </div>
    </main>
  );
}
