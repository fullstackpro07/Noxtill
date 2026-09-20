"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { fetchInventory, fetchReorderSuggestions } from "@/lib/inventory-api";
import { formatCurrency } from "@/lib/format";
import { useInventoryDrawer, useInventorySearch, useRegisterExport } from "@/components/inventory/inventory-drawer-context";
import { INV, KpiTile, KpiSkeleton, EmptyBlock, chipStyle, type Tone } from "@/components/inventory/inventory-ui";
import { useSession } from "@/lib/session";

type Why = "Out of stock" | "Critical velocity" | "Below reorder point";
const WHY_TONE: Record<Why, Tone> = { "Out of stock": "red", "Critical velocity": "amber", "Below reorder point": "neutral" };

export function RestockPlanningView() {
  const session = useSession();
  const currency = session.business.currency;
  const { query } = useInventorySearch();
  const { openPo } = useInventoryDrawer();

  const { data: items = [], isPending: itemsPending } = useQuery({ queryKey: ["inventory"], queryFn: fetchInventory });
  const { data: groups = [], isPending: groupsPending } = useQuery({ queryKey: ["reorder-suggestions"], queryFn: fetchReorderSuggestions });
  const isPending = itemsPending || groupsPending;

  const rows = useMemo(() => {
    const itemById = new Map(items.map((i) => [i.id, i]));
    return groups
      .flatMap((g) => g.items.map((s) => ({ ...s, supplierId: g.supplierId, supplierName: g.supplierName })))
      .map((s) => {
        const item = itemById.get(s.productId);
        const cost = item?.costPrice ?? 0;
        const why: Why = (item?.stockQty ?? s.currentStock) <= 0 ? "Out of stock" : item?.daysOfCover != null && item.daysOfCover <= 3 ? "Critical velocity" : "Below reorder point";
        return {
          productId: s.productId,
          name: s.name,
          supplierId: s.supplierId,
          supplierName: s.supplierName,
          stock: s.currentStock,
          threshold: item?.lowStockThreshold ?? 0,
          velocity: s.velocityPerDay,
          cover: item?.daysOfCover ?? 0,
          suggested: s.suggestedQty,
          estCost: s.suggestedQty * cost,
          why,
        };
      });
  }, [groups, items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.supplierName.toLowerCase().includes(q));
  }, [rows, query]);

  const critical = rows.filter((r) => r.why !== "Below reorder point").length;
  const totalUnits = rows.reduce((s, r) => s + r.suggested, 0);
  const totalCost = rows.reduce((s, r) => s + r.estCost, 0);

  useRegisterExport(() => {
    const header = ["Product", "Supplier", "On hand", "Reorder at", "Velocity/day", "Cover (days)", "Suggested", "Est. cost", "Why"];
    const csvRows = filtered.map((r) => [r.name, r.supplierName, r.stock, r.threshold, r.velocity, r.cover, r.suggested, r.estCost, r.why]);
    const csv = [header, ...csvRows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "restock-planning.csv";
    link.click();
    URL.revokeObjectURL(url);
  });

  return (
    <main style={{ padding: "16px 22px 26px", display: "flex", flexDirection: "column", gap: 15 }}>
      <div style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 10 }}>
        <AlertTriangle size={17} style={{ color: "#B54708", flex: "0 0 17px", marginTop: 1 }} />
        <div style={{ fontSize: 12, color: "#93370D", lineHeight: 1.55 }}>
          <strong>Suggested quantities are a starting point, not an order.</strong> Nothing is committed to a supplier until you approve it — quantities target 14 days of lead-time cover on top of your reorder threshold, from your real sales velocity over the last 30 days.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14 }}>
        {isPending ? (
          <KpiSkeleton count={4} />
        ) : (
          <>
            <KpiTile label="Products to restock" value={String(rows.length)} />
            <KpiTile label="Critical" value={String(critical)} tone="red" />
            <KpiTile label="Units suggested" value={String(totalUnits)} />
            <KpiTile label="Estimated cost" value={formatCurrency(totalCost, currency)} tone="green" />
          </>
        )}
      </div>

      <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 16, overflow: "hidden" }}>
        {isPending ? null : filtered.length === 0 ? (
          <EmptyBlock icon={CheckCircle2} iconBg="#E8F7EE" iconColor="#12A150" title="Every tracked product is above its reorder point" description="Nothing needs restocking right now." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1020 }}>
              <thead>
                <tr style={{ background: "#FAFBFC" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Product</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>On hand</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Reorder at</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Velocity</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Cover</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Suggested</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Est. cost</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Why</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.productId} style={{ borderTop: "1px solid #F2F4F7" }}>
                    <td style={{ padding: "12px 17px" }}>
                      <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#101828" }}>{r.name}</span>
                      <span style={{ display: "block", fontSize: 10.5, color: "#98A2B3", marginTop: 2 }}>{r.supplierName}</span>
                    </td>
                    <td style={{ padding: 12, fontSize: 12.5, fontWeight: 800, color: "#0F172A", textAlign: "right" }}>{r.stock}</td>
                    <td style={{ padding: 12, fontSize: 12.5, color: "#475467", textAlign: "right" }}>{r.threshold}</td>
                    <td style={{ padding: 12, fontSize: 12.5, color: "#475467", textAlign: "right" }}>{r.velocity}/d</td>
                    <td style={{ padding: 12, fontSize: 12.5, color: "#475467", textAlign: "right" }}>{r.cover} d</td>
                    <td style={{ padding: 12, fontSize: 13, fontWeight: 800, color: "#0E8442", textAlign: "right" }}>{r.suggested}</td>
                    <td style={{ padding: 12, fontSize: 12.5, color: "#475467", textAlign: "right" }}>{formatCurrency(r.estCost, currency)}</td>
                    <td style={{ padding: 12 }}>
                      <span style={chipStyle(WHY_TONE[r.why])}>{r.why}</span>
                    </td>
                    <td style={{ padding: "12px 17px", textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => openPo({ supplierId: r.supplierId !== "unassigned" ? r.supplierId : undefined, prefill: [{ productId: r.productId, qty: r.suggested }] })}
                        style={{ border: 0, background: INV.primary, borderRadius: 9, padding: "8px 13px", fontSize: 11.5, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 40 }}
                      >
                        Create PO
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ padding: "11px 17px", borderTop: "1px solid #F0F2F5", fontSize: 11.5, color: "#98A2B3" }}>Products with no recorded sales are excluded — there is no basis for a quantity.</div>
      </div>
    </main>
  );
}
