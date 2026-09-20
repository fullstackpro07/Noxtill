"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Package, Sparkles } from "lucide-react";
import { fetchInventory, fetchStockMovements } from "@/lib/inventory-api";
import { fetchProducts } from "@/lib/products-api";
import { formatCurrency, formatDate } from "@/lib/format";
import { INV, chipStyle } from "@/components/inventory/inventory-ui";
import { useSession } from "@/lib/session";

export function InventoryProductView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useSession();
  const currency = session.business.currency;
  const selectedId = searchParams.get("id");

  const { data: items = [], isPending: itemsPending } = useQuery({ queryKey: ["inventory"], queryFn: fetchInventory });
  const { data: products = [] } = useQuery({ queryKey: ["products", "active"], queryFn: () => fetchProducts({ active: true }) });

  const sorted = useMemo(() => [...items].sort((a, b) => a.name.localeCompare(b.name)), [items]);
  const productId = selectedId ?? sorted[0]?.id;
  const item = sorted.find((i) => i.id === productId);
  const sellingPrice = products.find((p) => p.id === productId)?.price ?? 0;

  const { data: movements = [] } = useQuery({
    queryKey: ["stock-movements", productId],
    queryFn: () => fetchStockMovements({ productId }),
    enabled: Boolean(productId),
  });

  if (itemsPending) {
    return <main style={{ padding: "16px 22px 26px" }} />;
  }
  if (!item) {
    return (
      <main style={{ padding: "16px 22px 26px" }}>
        <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 16, padding: "52px 18px", textAlign: "center" }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: "#344054" }}>No stocked products yet</div>
          <div style={{ fontSize: 12.5, color: "#98A2B3", marginTop: 5 }}>Products you add with stock tracking will show up here.</div>
        </div>
      </main>
    );
  }

  const sold30d = Math.round(item.velocityPerDay * 30);
  const revenue30d = sold30d * sellingPrice;
  const margin = sellingPrice > 0 ? ((sellingPrice - item.costPrice) / sellingPrice) * 100 : null;
  const statusLabel = item.status === "out_of_stock" ? "Out of stock" : item.status === "low_stock" ? "Low stock" : item.overstocked ? "Overstocked" : "Healthy";
  const statusTone = item.status === "out_of_stock" ? "red" : item.status === "low_stock" ? "amber" : item.overstocked ? "purple" : "green";

  let insight: string;
  if (item.status === "out_of_stock") {
    insight = item.velocityPerDay > 0 ? `This product is out of stock. It sells about ${item.velocityPerDay}/day when available, so each day out costs an estimated ${formatCurrency(item.velocityPerDay * sellingPrice, currency)} in missed sales.` : "This product is out of stock and hasn't sold in the last 30 days, so there's no recent velocity to estimate lost sales from.";
  } else if (item.status === "low_stock") {
    insight = `On hand is below the ${item.lowStockThreshold}-unit reorder threshold${item.daysOfCover != null ? `, with about ${item.daysOfCover} days of cover left at the current pace` : ""}.`;
  } else if (item.velocityPerDay === 0) {
    insight = "No sales recorded for this product in the last 30 days — it isn't moving right now.";
  } else if (item.overstocked) {
    insight = `Holding ${item.daysOfCover} days of cover at current velocity — well beyond the usual reorder point. Worth pausing new purchases.`;
  } else {
    insight = `Selling steadily at ${item.velocityPerDay}/day${item.daysOfCover != null ? ` with ${item.daysOfCover} days of cover` : ""} — no action needed right now.`;
  }

  return (
    <main style={{ padding: "16px 22px 26px", display: "flex", flexDirection: "column", gap: 15 }}>
      <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 16, padding: 17, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <span style={{ width: 50, height: 50, borderRadius: 14, background: "linear-gradient(160deg,#EDF0F4,#DDE3EA)", border: `1px solid ${INV.border}`, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 50px" }}>
          <Package size={23} color="#667085" />
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", letterSpacing: "-.4px" }}>{item.name}</span>
            <span style={chipStyle(statusTone)}>{statusLabel}</span>
          </span>
          <span style={{ display: "block", fontSize: 12, color: "#667085", marginTop: 4 }}>
            {item.sku ?? "No SKU"} · {item.category ?? "Uncategorized"} · {item.supplier ?? "No supplier on record"}
          </span>
        </span>
        <select
          value={productId}
          onChange={(e) => router.push(`/inventory/product?id=${e.target.value}`)}
          aria-label="Choose product"
          style={{ marginLeft: "auto", border: `1px solid ${INV.border}`, borderRadius: 11, padding: "10px 12px", fontSize: 12.5, fontWeight: 700, color: "#344054", background: "#fff", minHeight: 44 }}
        >
          {sorted.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 13 }}>
        <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 14, padding: 15 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#667085" }}>On hand</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", marginTop: 6 }}>{item.stockQty}</div>
          <div style={{ fontSize: 10.5, color: "#98A2B3", marginTop: 3 }}>Reorder at {item.lowStockThreshold}</div>
        </div>
        <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 14, padding: 15 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#667085" }}>Stock value</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", marginTop: 6 }}>{formatCurrency(item.stockValue, currency)}</div>
          <div style={{ fontSize: 10.5, color: "#98A2B3", marginTop: 3 }}>at {formatCurrency(item.costPrice, currency)} unit cost</div>
        </div>
        <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 14, padding: 15 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#667085" }}>Sales velocity</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", marginTop: 6 }}>{item.velocityPerDay}/day</div>
          <div style={{ fontSize: 10.5, color: "#98A2B3", marginTop: 3 }}>{sold30d} sold in 30 days</div>
        </div>
        <div style={{ background: "#fff", border: "1.5px solid #FDE3B3", borderRadius: 14, padding: 15 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#B54708" }}>Days of cover</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", marginTop: 6 }}>{item.daysOfCover != null ? `${item.daysOfCover}d` : "—"}</div>
        </div>
        <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 14, padding: 15 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#667085" }}>Revenue (30 days)</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", marginTop: 6 }}>{formatCurrency(revenue30d, currency)}</div>
          <div style={{ fontSize: 10.5, color: "#98A2B3", marginTop: 3 }}>{margin != null ? `${margin.toFixed(0)}%` : "—"} margin</div>
        </div>
      </div>

      <div style={{ background: "#F7FCF9", border: "1px solid #D5EFE0", borderRadius: 16, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8, flexWrap: "wrap" }}>
          <Sparkles size={16} color="#0E8442" />
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#0E8442" }}>Where this product stands</span>
        </div>
        <div style={{ fontSize: 13, color: "#344054", lineHeight: 1.65 }}>{insight}</div>
        <div style={{ display: "flex", gap: 9, marginTop: 12, flexWrap: "wrap" }}>
          <button type="button" onClick={() => router.push("/inventory/restock")} style={{ border: 0, background: INV.primary, borderRadius: 10, padding: "10px 15px", fontSize: 12, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 44 }}>
            Add to restock plan
          </button>
          <button type="button" onClick={() => router.push("/inventory/movements")} style={{ border: "1px solid #D5EFE0", background: "#fff", borderRadius: 10, padding: "10px 15px", fontSize: 12, fontWeight: 700, color: "#0E8442", cursor: "pointer", minHeight: 44 }}>
            View all movements
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: 15, alignItems: "start" }}>
        <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 16, overflow: "hidden", minWidth: 0 }}>
          <div style={{ padding: "13px 17px", borderBottom: "1px solid #F0F2F5" }}>
            <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Movement history</h3>
          </div>
          {movements.length === 0 ? (
            <div style={{ padding: "40px 18px", textAlign: "center", fontSize: 12.5, color: INV.textFaint }}>No movements recorded for this product yet.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                <thead>
                  <tr style={{ background: "#FAFBFC" }}>
                    <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>When</th>
                    <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Change</th>
                    <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Balance after</th>
                    <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.slice(0, 12).map((m) => (
                    <tr key={m.id} style={{ borderTop: "1px solid #F2F4F7" }}>
                      <td style={{ padding: "11px 17px", fontSize: 12, fontWeight: 600, color: "#344054", whiteSpace: "nowrap" }}>{formatDate(m.createdAt)}</td>
                      <td style={{ padding: 11, fontSize: 12.5, fontWeight: 800, color: m.qty > 0 ? "#0E8442" : "#B42318", textAlign: "right" }}>
                        {m.qty > 0 ? "+" : ""}
                        {m.qty}
                      </td>
                      <td style={{ padding: 11, fontSize: 12.5, color: "#475467", textAlign: "right" }}>{m.resultingBalance}</td>
                      <td style={{ padding: "11px 17px", fontSize: 12, color: "#0E8442", fontWeight: 600 }}>{m.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ padding: "11px 17px", borderTop: "1px solid #F0F2F5", fontSize: 11.5, color: "#98A2B3" }}>Every movement names its source — nothing changes stock silently.</div>
        </div>
        <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 16, padding: 17 }}>
          <h3 style={{ margin: "0 0 5px", fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Stock by branch</h3>
          <div style={{ fontSize: 12, color: "#667085", lineHeight: 1.6 }}>
            This business doesn&apos;t split stock per branch — the {item.stockQty} on hand above is a single, business-wide balance, not a per-location figure.
          </div>
        </div>
      </div>
    </main>
  );
}
