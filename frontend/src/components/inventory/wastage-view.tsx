"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { fetchStockMovements, fetchInventory, type StockMovementRow, type WastageReason } from "@/lib/inventory-api";
import { formatCurrency, formatDate } from "@/lib/format";
import { useInventoryDrawer, useInventorySearch, useRegisterExport } from "@/components/inventory/inventory-drawer-context";
import { INV, KpiTile, KpiSkeleton, filterSelectStyle, primaryBtnStyle, EmptyBlock, chipStyle, type Tone } from "@/components/inventory/inventory-ui";

const REASON_TONE: Record<string, Tone> = { Expired: "amber", Damaged: "red", Theft: "purple", Other: "neutral" };
const REASON_COLOR: Record<string, string> = { Expired: "#B54708", Damaged: "#B42318", Theft: "#7E22CE", Other: "#475467" };

/** Plain helper (not inlined in the hook callback) so the impure `Date.now()` read isn't flagged as happening during render. */
function rangeStartFor(days: number | null): Date | null {
  return days == null ? null : new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function noteFor(m: StockMovementRow): string {
  if (!m.wastageReason) return m.description;
  const prefix = `${m.wastageReason}: `;
  return m.description.startsWith(prefix) ? m.description.slice(prefix.length) : "—";
}

export function WastageView({ currency }: { currency: string }) {
  const [reason, setReason] = useState<WastageReason | "all">("all");
  const [productId, setProductId] = useState("");
  const [range, setRange] = useState<"month" | "90" | "all">("month");
  const { query } = useInventorySearch();
  const { openWastage } = useInventoryDrawer();

  const { data: products = [] } = useQuery({ queryKey: ["inventory"], queryFn: fetchInventory });
  const { data: movements = [], isPending, isError, refetch } = useQuery({
    queryKey: ["stock-movements", "", "wastage"],
    queryFn: () => fetchStockMovements({ kind: "wastage" }),
  });

  const rangeDays = range === "all" ? null : range === "month" ? 30 : 90;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rangeStart = rangeStartFor(rangeDays);
    return movements.filter((m) => {
      if (reason !== "all" && m.wastageReason !== reason) return false;
      if (productId && m.productId !== productId) return false;
      if (rangeStart && new Date(m.createdAt) < rangeStart) return false;
      if (q && !m.productName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [movements, reason, productId, rangeDays, query]);

  const thisMonth = new Date().toISOString().slice(0, 7);

  const stats = useMemo(() => {
    const productCostByName = new Map<string, number>();
    for (const p of products) productCostByName.set(p.name, p.costPrice);

    const wastageThisMonth = filtered.filter((m) => m.createdAt.slice(0, 7) === thisMonth);
    const valueLostThisMonth = wastageThisMonth.reduce((sum, m) => sum + Math.abs(m.qty) * (m.unitCost ?? productCostByName.get(m.productName) ?? 0), 0);
    const valueLostFiltered = filtered.reduce((sum, m) => sum + Math.abs(m.qty) * (m.unitCost ?? productCostByName.get(m.productName) ?? 0), 0);

    const byProduct = new Map<string, number>();
    const byProductValue = new Map<string, number>();
    for (const m of filtered) {
      byProduct.set(m.productName, (byProduct.get(m.productName) ?? 0) + Math.abs(m.qty));
      byProductValue.set(m.productName, (byProductValue.get(m.productName) ?? 0) + Math.abs(m.qty) * (m.unitCost ?? productCostByName.get(m.productName) ?? 0));
    }
    const topWasted = [...byProductValue.entries()].sort((a, b) => b[1] - a[1])[0];

    const byReason = new Map<string, number>();
    for (const m of filtered) {
      const r = m.wastageReason ?? "Other";
      byReason.set(r, (byReason.get(r) ?? 0) + Math.abs(m.qty));
    }

    const totalStockValue = products.reduce((sum, p) => sum + p.stockValue, 0);

    return {
      countThisMonth: wastageThisMonth.length,
      valueLostThisMonth,
      valueLostFiltered,
      pctOfStockValue: totalStockValue > 0 ? (valueLostThisMonth / totalStockValue) * 100 : 0,
      topWasted: topWasted ? `${topWasted[0]} (${formatCurrency(topWasted[1], currency)})` : "—",
      byReason: [...byReason.entries()].sort((a, b) => b[1] - a[1]),
      byProduct: [...byProductValue.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
    };
  }, [filtered, products, thisMonth, currency]);

  const trend = useMemo(() => {
    const months: { key: string; label: string }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      months.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) });
    }
    const productCostByName = new Map(products.map((p) => [p.name, p.costPrice]));
    const sums = months.map((m) => movements.filter((mv) => mv.createdAt.slice(0, 7) === m.key).reduce((s, mv) => s + Math.abs(mv.qty) * (mv.unitCost ?? productCostByName.get(mv.productName) ?? 0), 0));
    const max = Math.max(1, ...sums);
    return months.map((m, i) => ({ ...m, pct: Math.round((sums[i] / max) * 100), value: sums[i] }));
  }, [movements, products]);

  const maxReasonQty = Math.max(1, ...stats.byReason.map(([, v]) => v));
  const maxProductVal = Math.max(1, ...stats.byProduct.map(([, v]) => v));

  useRegisterExport(() => {
    const header = ["Date", "Product", "Quantity", "Reason", "Note"];
    const rows = filtered.map((m) => [formatDate(m.createdAt), m.productName, Math.abs(m.qty), m.wastageReason ?? "Other", noteFor(m)]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "wastage.csv";
    link.click();
    URL.revokeObjectURL(url);
  });

  if (isError) {
    return (
      <div style={{ margin: 22, background: "#fff", border: "1px solid #FDD9D6", borderRadius: 16, padding: "48px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: "#B42318" }}>Couldn&apos;t load wastage</div>
        <button type="button" onClick={() => refetch()} style={{ marginTop: 15, border: 0, background: INV.primary, borderRadius: 12, padding: "12px 22px", fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46 }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <main style={{ padding: "16px 22px 26px", display: "flex", flexDirection: "column", gap: 15 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <select value={reason} onChange={(e) => setReason(e.target.value as WastageReason | "all")} aria-label="Reason" style={filterSelectStyle}>
          <option value="all">All reasons</option>
          <option value="Expired">Expired</option>
          <option value="Damaged">Damaged</option>
          <option value="Theft">Theft</option>
          <option value="Other">Other</option>
        </select>
        <select value={productId} onChange={(e) => setProductId(e.target.value)} aria-label="Product" style={filterSelectStyle}>
          <option value="">All products</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select value={range} onChange={(e) => setRange(e.target.value as "month" | "90" | "all")} aria-label="Date" style={filterSelectStyle}>
          <option value="month">This month</option>
          <option value="90">Last 90 days</option>
          <option value="all">All time</option>
        </select>
        <div style={{ marginLeft: "auto" }}>
          <button type="button" onClick={() => openWastage()} style={primaryBtnStyle}>
            Record Wastage
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14 }}>
        {isPending ? (
          <KpiSkeleton count={4} />
        ) : (
          <>
            <KpiTile label="Wastage This Month" value={String(stats.countThisMonth)} />
            <KpiTile label="Value Lost" value={formatCurrency(stats.valueLostThisMonth, currency)} tone="red" />
            <KpiTile label="% of Stock Value" value={`${stats.pctOfStockValue.toFixed(1)}%`} />
            <KpiTile label="Top Wasted Product" value={stats.topWasted} />
          </>
        )}
      </div>

      {!isPending && filtered.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 15 }}>
          <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 16, padding: 17, minWidth: 0 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Wastage by reason</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {stats.byReason.map(([r, qty]) => (
                <div key={r}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: "#344054" }}>{r}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: "#101828" }}>{qty}</span>
                  </div>
                  <div style={{ height: 9, borderRadius: 6, background: "#F2F4F7", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 6, background: REASON_COLOR[r] ?? "#475467", width: `${Math.round((qty / maxReasonQty) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 16, padding: 17, minWidth: 0 }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Wastage trend</h3>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 96, marginTop: 10 }}>
              {trend.map((m) => (
                <div key={m.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ width: "100%", maxWidth: 34, height: Math.max(4, m.pct), borderRadius: 5, background: "#FEC84B" }} title={formatCurrency(m.value, currency)} />
                  <span style={{ fontSize: 10.5, color: "#667085", fontWeight: 600 }}>{m.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!isPending && stats.byProduct.length > 0 && (
        <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 16, padding: 17 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Wastage by product</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {stats.byProduct.map(([name, value]) => (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 150, fontSize: 12, fontWeight: 600, color: "#344054", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                <span style={{ flex: 1, height: 9, borderRadius: 6, background: "#F2F4F7", overflow: "hidden", display: "block" }}>
                  <span style={{ display: "block", height: "100%", borderRadius: 6, background: "#B42318", width: `${Math.round((value / maxProductVal) * 100)}%` }} />
                </span>
                <span style={{ width: 88, fontSize: 11.5, fontWeight: 800, color: "#101828", textAlign: "right" }}>{formatCurrency(value, currency)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 16, overflow: "hidden" }}>
        {isPending ? null : filtered.length === 0 ? (
          <EmptyBlock icon={Trash2} iconBg="#F2F4F7" iconColor="#98A2B3" title="No wastage recorded — remember to log it so profit figures stay accurate" action={<button type="button" onClick={() => openWastage()} style={primaryBtnStyle}>Record Wastage</button>} />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
              <thead>
                <tr style={{ background: "#FAFBFC" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Date</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Product</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Quantity</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Value</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Reason</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Note</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const productCost = products.find((p) => p.id === m.productId)?.costPrice ?? 0;
                  const value = Math.abs(m.qty) * (m.unitCost ?? productCost);
                  const r = m.wastageReason ?? "Other";
                  return (
                    <tr key={m.id} style={{ borderTop: "1px solid #F2F4F7" }}>
                      <td style={{ padding: "11px 17px", fontSize: 12.5, fontWeight: 600, color: "#344054", whiteSpace: "nowrap" }}>{formatDate(m.createdAt)}</td>
                      <td style={{ padding: 11, fontSize: 12.5, fontWeight: 700, color: "#101828" }}>{m.productName}</td>
                      <td style={{ padding: 11, fontSize: 13, fontWeight: 800, color: "#B42318", textAlign: "right" }}>− {Math.abs(m.qty)}</td>
                      <td style={{ padding: 11, fontSize: 12.5, fontWeight: 700, color: "#101828", textAlign: "right" }}>{formatCurrency(value, currency)}</td>
                      <td style={{ padding: 11 }}>
                        <span style={chipStyle(REASON_TONE[r] ?? "neutral")}>{r}</span>
                      </td>
                      <td style={{ padding: "11px 17px", fontSize: 12, color: "#98A2B3" }}>{noteFor(m)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ padding: "11px 17px", borderTop: "1px solid #F0F2F5", fontSize: 11.5, color: "#98A2B3" }}>Recorded wastage reduces stock and feeds straight into profit — that is why logging it keeps your figures honest. Photo attachments aren&apos;t supported yet.</div>
      </div>
    </main>
  );
}
