"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchInventory } from "@/lib/inventory-api";
import { fetchProducts } from "@/lib/products-api";
import { formatCurrency } from "@/lib/format";
import { useInventorySearch, useRegisterExport } from "@/components/inventory/inventory-drawer-context";
import { INV, KpiTile, KpiSkeleton, EmptyBlock } from "@/components/inventory/inventory-ui";
import { classifyMovement, type Movement } from "@/components/inventory/inventory-classification";
import { useSession } from "@/lib/session";
import { PackageSearch } from "lucide-react";

const MOVE_COLOR: Record<Movement, string> = { Fast: "#0E8442", Slow: "#B54708", Dead: "#B42318" };

export function ValuationView() {
  const router = useRouter();
  const session = useSession();
  const currency = session.business.currency;
  const { query } = useInventorySearch();

  const { data: items = [], isPending: itemsPending } = useQuery({ queryKey: ["inventory"], queryFn: fetchInventory });
  const { data: products = [], isPending: productsPending } = useQuery({ queryKey: ["products", "active"], queryFn: () => fetchProducts({ active: true }) });
  const isPending = itemsPending || productsPending;

  const rows = useMemo(() => {
    const priceById = new Map(products.map((p) => [p.id, p.price]));
    return items
      .map((i) => {
        const sellingPrice = priceById.get(i.id) ?? 0;
        const margin = sellingPrice > 0 ? ((sellingPrice - i.costPrice) / sellingPrice) * 100 : null;
        const sold30d = Math.round(i.velocityPerDay * 30);
        return { ...i, sellingPrice, margin, sold30d, movement: classifyMovement(i.velocityPerDay, i.daysOfCover) };
      })
      .sort((a, b) => b.stockValue - a.stockValue);
  }, [items, products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [rows, query]);

  const totalValue = rows.reduce((s, r) => s + r.stockValue, 0);
  const fastValue = rows.filter((r) => r.movement === "Fast").reduce((s, r) => s + r.stockValue, 0);
  const slowValue = rows.filter((r) => r.movement === "Slow").reduce((s, r) => s + r.stockValue, 0);
  const deadValue = rows.filter((r) => r.movement === "Dead").reduce((s, r) => s + r.stockValue, 0);
  const maxValue = Math.max(1, ...rows.map((r) => r.stockValue));

  useRegisterExport(() => {
    const header = ["Product", "Stock value", "Units", "Unit cost", "Sold (30d)", "Margin %", "Movement"];
    const csvRows = filtered.map((r) => [r.name, r.stockValue, r.stockQty, r.costPrice, r.sold30d, r.margin != null ? r.margin.toFixed(1) : "", r.movement]);
    const csv = [header, ...csvRows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "inventory-valuation.csv";
    link.click();
    URL.revokeObjectURL(url);
  });

  return (
    <main style={{ padding: "16px 22px 26px", display: "flex", flexDirection: "column", gap: 15 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14 }}>
        {isPending ? (
          <KpiSkeleton count={4} />
        ) : (
          <>
            <KpiTile label="Total inventory value" value={formatCurrency(totalValue, currency)} tone="green" />
            <KpiTile label="Fast-moving value" value={formatCurrency(fastValue, currency)} />
            <KpiTile label="Slow-moving value" value={formatCurrency(slowValue, currency)} tone="amber" />
            <KpiTile label="Dead stock value" value={formatCurrency(deadValue, currency)} tone="red" />
          </>
        )}
      </div>

      <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 16, padding: 17 }}>
        <h3 style={{ margin: "0 0 5px", fontSize: 14.5, fontWeight: 800, color: "#101828" }}>How this figure is calculated</h3>
        <div style={{ fontSize: 11, color: "#98A2B3", marginBottom: 12 }}>The method is stated so the number can be checked</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {[
            { l: "Stock value", v: "On-hand quantity × cost price, per product" },
            { l: "Fast-moving", v: "Selling steadily — 30 days of cover or less at current velocity" },
            { l: "Slow-moving", v: "Still selling, but more than 30 days of cover" },
            { l: "Dead stock", v: "No sales at all in the last 30 days" },
            { l: "Margin", v: "(Selling price − cost price) ÷ selling price" },
          ].map((m) => (
            <div key={m.l} style={{ display: "flex", justifyContent: "space-between", gap: 14, padding: "9px 0", borderBottom: "1px solid #F2F4F7" }}>
              <span style={{ fontSize: 12, color: "#667085" }}>{m.l}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "#344054", textAlign: "right" }}>{m.v}</span>
            </div>
          ))}
        </div>
        <div style={{ background: "#EEF4FF", border: "1px solid #C7D7FE", borderRadius: 11, padding: "11px 13px", fontSize: 11.5, color: "#3538CD", marginTop: 13, lineHeight: 1.55 }}>
          Inventory value is capital tied up in stock — it is not cash and not revenue. Those live in Profit &amp; Analytics.
        </div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 16, overflow: "hidden" }}>
        <div style={{ padding: "13px 17px", borderBottom: "1px solid #F0F2F5" }}>
          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Value by product</h3>
        </div>
        {filtered.length === 0 ? (
          <EmptyBlock
            icon={PackageSearch}
            iconBg="#F2F4F7"
            iconColor="#98A2B3"
            title={rows.length === 0 ? "No stocked products yet" : "Nothing matches this search"}
            description={rows.length === 0 ? "Products you add with stock tracking will show up here." : "Try a different search."}
          />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 960 }}>
              <thead>
                <tr style={{ background: "#FAFBFC" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Product</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Stock value</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Units</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Unit cost</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Sold (30d)</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Margin</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Movement</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} onClick={() => router.push(`/inventory/product?id=${r.id}`)} style={{ borderTop: "1px solid #F2F4F7", cursor: "pointer" }}>
                    <td style={{ padding: "12px 17px", fontSize: 12.5, fontWeight: 700, color: "#0E8442" }}>{r.name}</td>
                    <td style={{ padding: 12 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <span style={{ flex: 1, height: 8, borderRadius: 6, background: "#F2F4F7", overflow: "hidden", minWidth: 60, display: "block" }}>
                          <span style={{ display: "block", height: "100%", borderRadius: 6, background: "#BFE7CF", width: `${Math.round((r.stockValue / maxValue) * 100)}%` }} />
                        </span>
                        <span style={{ fontSize: 12.5, fontWeight: 800, color: "#101828", whiteSpace: "nowrap" }}>{formatCurrency(r.stockValue, currency)}</span>
                      </span>
                    </td>
                    <td style={{ padding: 12, fontSize: 12.5, color: "#475467", textAlign: "right" }}>{r.stockQty}</td>
                    <td style={{ padding: 12, fontSize: 12.5, color: "#475467", textAlign: "right" }}>{formatCurrency(r.costPrice, currency)}</td>
                    <td style={{ padding: 12, fontSize: 12.5, color: "#475467", textAlign: "right" }}>{r.sold30d}</td>
                    <td style={{ padding: 12, fontSize: 12.5, fontWeight: 700, color: r.margin == null ? "#98A2B3" : r.margin < 15 ? "#B42318" : r.margin < 30 ? "#B54708" : "#0E8442", textAlign: "right" }}>{r.margin != null ? `${r.margin.toFixed(0)}%` : "—"}</td>
                    <td style={{ padding: "12px 17px", textAlign: "right" }}>
                      <span style={{ fontSize: 11.5, fontWeight: 800, color: MOVE_COLOR[r.movement] }}>{r.movement}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
