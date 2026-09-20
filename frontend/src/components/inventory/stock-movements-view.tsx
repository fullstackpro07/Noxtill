"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchStockMovements, type StockMovementRow, type MovementKind } from "@/lib/inventory-api";
import { fetchProducts } from "@/lib/products-api";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { useInventoryDrawer, useInventorySearch, useRegisterExport } from "@/components/inventory/inventory-drawer-context";
import { INV, filterSelectStyle, chipStyle, type Tone } from "@/components/inventory/inventory-ui";

const KIND_LABEL: Record<MovementKind, string> = {
  purchase: "Purchase",
  sale: "Sale",
  wastage: "Wastage",
  adjustment: "Adjustment",
  return: "Return",
  transfer_out: "Transfer out",
  transfer_in: "Transfer in",
};
const KIND_TONE: Record<MovementKind, Tone> = {
  purchase: "green",
  sale: "blue",
  wastage: "red",
  adjustment: "amber",
  return: "neutral",
  transfer_out: "purple",
  transfer_in: "purple",
};
const BAR_COLORS: Record<MovementKind, string> = {
  purchase: "#0E8442",
  sale: "#3538CD",
  wastage: "#B42318",
  adjustment: "#B54708",
  return: "#475467",
  transfer_out: "#7E22CE",
  transfer_in: "#7E22CE",
};
const RANGE_DAYS: Record<string, number> = { "Last 7 days": 7, "Last 30 days": 30, "Last 90 days": 90 };

function referenceFor(row: StockMovementRow): string {
  const raw = row.description;
  if (raw.startsWith("Purchase order")) return raw;
  if (row.kind === "adjustment") return "Stock count";
  return "—";
}

function KpiBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 14, padding: 15 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: INV.textMuted }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 800, color: color ?? "#0F172A", marginTop: 6 }}>{value}</div>
    </div>
  );
}

export function StockMovementsView({ currency }: { currency: string }) {
  const [range, setRange] = useState("Last 30 days");
  const [productId, setProductId] = useState("");
  const [kind, setKind] = useState<MovementKind | "">("");
  const { query } = useInventorySearch();
  const { openHistory } = useInventoryDrawer();

  const { data: products = [] } = useQuery({ queryKey: ["products", "active"], queryFn: () => fetchProducts({ active: true }) });
  const { data: movements = [], isPending, isError, refetch } = useQuery({
    queryKey: ["stock-movements", productId, kind, range],
    queryFn: () => fetchStockMovements({ productId: productId || undefined, kind: kind || undefined, from: new Date(Date.now() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000).toISOString() }),
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return movements;
    return movements.filter((m) => m.productName.toLowerCase().includes(q) || referenceFor(m).toLowerCase().includes(q));
  }, [movements, query]);

  const sums = useMemo(() => {
    const byKind: Partial<Record<MovementKind, number>> = {};
    for (const m of filtered) byKind[m.kind] = (byKind[m.kind] ?? 0) + Math.abs(m.qty);
    const netChange = filtered.reduce((sum, m) => sum + m.qty, 0);
    return { byKind, netChange };
  }, [filtered]);

  const typeBars = useMemo(() => {
    const total = filtered.length || 1;
    return (Object.keys(KIND_LABEL) as MovementKind[])
      .map((k) => ({ k, n: sums.byKind[k] ?? 0, count: filtered.filter((m) => m.kind === k).length }))
      .filter((b) => b.count > 0)
      .sort((a, b) => b.count - a.count)
      .map((b) => ({ t: KIND_LABEL[b.k], n: b.n, width: Math.round((b.count / total) * 100), color: BAR_COLORS[b.k] }));
  }, [filtered, sums]);

  const dailyVolume = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const m of filtered) {
      const day = m.createdAt.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }
    const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
    const max = Math.max(1, ...days.map(([, n]) => n));
    return days.map(([day, n]) => ({ day, n, pct: Math.round((n / max) * 100) }));
  }, [filtered]);

  useRegisterExport(() => {
    const header = ["Date", "Product", "Type", "Quantity", "Unit cost", "Balance after", "Reference"];
    const rows = filtered.map((m) => [formatDate(m.createdAt), m.productName, KIND_LABEL[m.kind], m.qty, m.unitCost ?? "", m.resultingBalance, referenceFor(m)]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "stock-movements.csv";
    link.click();
    URL.revokeObjectURL(url);
  });

  if (isError) {
    return (
      <div style={{ margin: 22, background: "#fff", border: "1px solid #FDD9D6", borderRadius: 16, padding: "48px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: "#B42318" }}>Couldn&apos;t load stock movements</div>
        <button type="button" onClick={() => refetch()} style={{ marginTop: 15, border: 0, background: INV.primary, borderRadius: 12, padding: "12px 22px", fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46 }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <main style={{ padding: "16px 22px 26px", display: "flex", flexDirection: "column", gap: 15 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <select value={range} onChange={(e) => setRange(e.target.value)} aria-label="Date range" style={filterSelectStyle}>
          <option>Last 7 days</option>
          <option>Last 30 days</option>
          <option>Last 90 days</option>
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value as MovementKind | "")} aria-label="Movement type" style={filterSelectStyle}>
          <option value="">All types</option>
          {Object.entries(KIND_LABEL).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <select value={productId} onChange={(e) => setProductId(e.target.value)} aria-label="Product" style={filterSelectStyle}>
          <option value="">All products</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 14 }}>
        {isPending ? (
          Array.from({ length: 6 }).map((_, i) => <KpiBox key={i} label="…" value="—" />)
        ) : (
          <>
            <KpiBox label="Movements" value={String(filtered.length)} />
            <KpiBox label="Purchases" value={String(sums.byKind.purchase ?? 0)} color="#0E8442" />
            <KpiBox label="Sales" value={String(sums.byKind.sale ?? 0)} color="#3538CD" />
            <KpiBox label="Wastage" value={String(sums.byKind.wastage ?? 0)} color="#B42318" />
            <KpiBox label="Adjustments" value={String(sums.byKind.adjustment ?? 0)} color="#B54708" />
            <KpiBox label="Net Change" value={`${sums.netChange > 0 ? "+" : ""}${sums.netChange}`} color={sums.netChange >= 0 ? "#0E8442" : "#B42318"} />
          </>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "340px minmax(0,1fr)", gap: 15, alignItems: "start" }}>
        <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 16, padding: 17 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Movement type breakdown</h3>
          {typeBars.length === 0 ? (
            <div style={{ fontSize: 12.5, color: INV.textFaint }}>No movements in this period.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {typeBars.map((b) => (
                <div key={b.t}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: "#344054" }}>{b.t}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: "#101828" }}>{b.n}</span>
                  </div>
                  <div style={{ height: 9, borderRadius: 6, background: "#F2F4F7", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 6, background: b.color, width: `${b.width}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 16, padding: 17, minWidth: 0 }}>
          <h3 style={{ margin: "0 0 6px", fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Daily movement volume</h3>
          {dailyVolume.length === 0 ? (
            <div style={{ fontSize: 12.5, color: INV.textFaint, padding: "20px 0" }}>No movements in this period.</div>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 100, marginTop: 10 }}>
              {dailyVolume.map((d) => (
                <div key={d.day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ width: "100%", maxWidth: 26, height: Math.max(4, d.pct), borderRadius: 5, background: "#C7D7FE" }} title={`${d.n} movement${d.n === 1 ? "" : "s"}`} />
                  <span style={{ fontSize: 9.5, color: "#667085", fontWeight: 600 }}>{new Date(d.day).getUTCDate()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 16, overflow: "hidden" }}>
        {isPending ? null : filtered.length === 0 ? (
          <div style={{ padding: "52px 18px", textAlign: "center" }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: "#344054" }}>No movements in this period</div>
            <div style={{ fontSize: 12.5, color: "#98A2B3", marginTop: 5 }}>Nothing matches these filters.</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
              <thead>
                <tr style={{ background: "#FAFBFC" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Date / time</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Product</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Type</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Quantity</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Unit cost</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Balance after</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Reference</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id} onClick={() => openHistory(m.productId)} style={{ borderTop: "1px solid #F2F4F7", cursor: "pointer" }}>
                    <td style={{ padding: "11px 17px", fontSize: 12, fontWeight: 600, color: "#344054", whiteSpace: "nowrap" }}>
                      {formatDate(m.createdAt)} {formatTime(m.createdAt)}
                    </td>
                    <td style={{ padding: 11, fontSize: 12.5, fontWeight: 700, color: "#0E8442" }}>{m.productName}</td>
                    <td style={{ padding: 11 }}>
                      <span style={chipStyle(KIND_TONE[m.kind])}>{KIND_LABEL[m.kind]}</span>
                    </td>
                    <td style={{ padding: 11, fontSize: 13, fontWeight: 800, color: m.qty > 0 ? "#0E8442" : "#B42318", textAlign: "right" }}>
                      {m.qty > 0 ? "+" : ""}
                      {m.qty}
                    </td>
                    <td style={{ padding: 11, fontSize: 12.5, color: "#475467", textAlign: "right" }}>{m.unitCost != null ? formatCurrency(m.unitCost, currency) : "—"}</td>
                    <td style={{ padding: 11, fontSize: 12.5, fontWeight: 700, color: "#101828", textAlign: "right" }}>{m.resultingBalance}</td>
                    <td style={{ padding: "11px 17px", fontSize: 12, fontWeight: 600, color: "#3538CD" }}>{referenceFor(m)}</td>
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
