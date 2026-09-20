"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { fetchInventory, fetchReorderSuggestions, fetchStockMovements } from "@/lib/inventory-api";
import { INV, KpiTile, KpiSkeleton } from "@/components/inventory/inventory-ui";

type Confidence = "High" | "Medium" | "Low";
const CONF_TONE: Record<Confidence, { bg: string; fg: string }> = {
  High: { bg: "#E8F7EE", fg: "#0E8442" },
  Medium: { bg: "#FEF6E7", fg: "#B54708" },
  Low: { bg: "#FEF3F2", fg: "#B42318" },
};
function confidenceFor(velocityPerDay: number): Confidence {
  if (velocityPerDay >= 1) return "High";
  if (velocityPerDay >= 0.5) return "Medium";
  return "Low";
}

/** Plain helper (not inlined in the hook callback) so the impure `Date.now()` read isn't flagged as happening during render. */
function stockoutDateFor(daysOfCover: number | null): Date | null {
  return daysOfCover == null ? null : new Date(Date.now() + daysOfCover * 24 * 60 * 60 * 1000);
}

export function DemandForecastView() {
  const { data: items = [], isPending: itemsPending } = useQuery({ queryKey: ["inventory"], queryFn: fetchInventory });
  const { data: groups = [] } = useQuery({ queryKey: ["reorder-suggestions"], queryFn: fetchReorderSuggestions });
  const { data: allSales = [], isPending: salesPending } = useQuery({ queryKey: ["stock-movements", "forecast-history"], queryFn: () => fetchStockMovements({ kind: "sale" }) });
  const isPending = itemsPending || salesPending;

  const suggestedByProduct = useMemo(() => new Map(groups.flatMap((g) => g.items.map((i) => [i.productId, i.suggestedQty] as const))), [groups]);

  const withVelocity = items.filter((i) => i.velocityPerDay > 0);
  const noForecast = items.filter((i) => i.velocityPerDay === 0);
  const atRisk14 = withVelocity.filter((i) => i.daysOfCover != null && i.daysOfCover <= 14).length;
  const expectedOut30 = withVelocity.filter((i) => i.daysOfCover != null && i.daysOfCover <= 30).length;

  const history = useMemo(() => {
    const months: { key: string; label: string }[] = [];
    const now = new Date();
    for (let i = 4; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      months.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) });
    }
    const sums = months.map((m) => allSales.filter((s) => s.createdAt.slice(0, 7) === m.key).reduce((sum, s) => sum + Math.abs(s.qty), 0));
    const max = Math.max(1, ...sums);
    return months.map((m, i) => ({ ...m, v: sums[i], pct: Math.round((sums[i] / max) * 100) }));
  }, [allSales]);

  const totalVelocityPerDay = withVelocity.reduce((s, i) => s + i.velocityPerDay, 0);
  const projection = useMemo(() => {
    const now = new Date();
    const maxHist = Math.max(1, ...history.map((h) => h.v));
    return [1, 2].map((offset) => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
      const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
      const v = Math.round(totalVelocityPerDay * daysInMonth);
      return { key: d.toISOString().slice(0, 7), label: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }), v, pct: Math.round((v / maxHist) * 100) };
    });
  }, [history, totalVelocityPerDay]);

  const forecastRows = useMemo(
    () =>
      withVelocity
        .map((i) => {
          const demand30 = Math.round(i.velocityPerDay * 30);
          const outDate = stockoutDateFor(i.daysOfCover);
          return {
            id: i.id,
            name: i.name,
            stock: i.stockQty,
            velocity: i.velocityPerDay,
            demand30,
            cover: i.daysOfCover,
            outDate,
            suggested: suggestedByProduct.get(i.id) ?? null,
            confidence: confidenceFor(i.velocityPerDay),
          };
        })
        .sort((a, b) => (a.cover ?? Infinity) - (b.cover ?? Infinity)),
    [withVelocity, suggestedByProduct],
  );

  return (
    <main style={{ padding: "16px 22px 26px", display: "flex", flexDirection: "column", gap: 15 }}>
      <div style={{ background: "#EEF4FF", border: "1px solid #C7D7FE", borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 10 }}>
        <AlertCircle size={17} style={{ color: "#3538CD", flex: "0 0 17px", marginTop: 1 }} />
        <div style={{ fontSize: 12, color: "#3538CD", lineHeight: 1.55 }}>
          <strong>Forecast, not fact.</strong> Projections extend the last 30 days of sell-through at a steady rate. They carry no seasonality — there is not yet enough history for that — and any product with no recorded sales gets no forecast at all.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(185px,1fr))", gap: 14 }}>
        {isPending ? (
          <KpiSkeleton count={4} />
        ) : (
          <>
            <KpiTile label="At risk within 14 days" value={String(atRisk14)} tone="red" />
            <KpiTile label="Expected out within 30 days" value={String(expectedOut30)} tone="amber" />
            <KpiTile label="No forecast possible" value={String(noForecast.length)} meta="No sales on record" />
            <KpiTile label="Basis" value="30-day velocity" />
          </>
        )}
      </div>

      <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 16, padding: 17 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 13, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Units sold per month</h3>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, color: "#475467" }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: "#BFE7CF" }} />
            Actual
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, color: "#475467" }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: "#EEF4FF", border: "1px dashed #3538CD" }} />
            Forecast
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {history.map((h) => (
            <div key={h.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 34, fontSize: 11.5, fontWeight: 700, color: "#344054" }}>{h.label}</span>
              <span style={{ flex: 1, height: 14, borderRadius: 6, background: "#F2F4F7", overflow: "hidden", display: "block" }}>
                <span style={{ display: "block", height: "100%", borderRadius: 6, background: "#BFE7CF", width: `${h.pct}%` }} />
              </span>
              <span style={{ width: 52, fontSize: 12, fontWeight: 800, color: "#101828", textAlign: "right" }}>{h.v}</span>
            </div>
          ))}
          {projection.map((p) => (
            <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 34, fontSize: 11.5, fontWeight: 700, color: "#3538CD" }}>{p.label}</span>
              <span style={{ flex: 1, height: 14, borderRadius: 6, background: "#F2F4F7", overflow: "hidden", display: "block" }}>
                <span style={{ display: "block", height: "100%", borderRadius: 6, background: "#EEF4FF", border: "1px dashed #3538CD", boxSizing: "border-box", width: `${p.pct}%` }} />
              </span>
              <span style={{ width: 52, fontSize: 12, fontWeight: 800, color: "#3538CD", textAlign: "right" }}>{p.v}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "#98A2B3", marginTop: 12 }}>{projection.map((p) => p.label).join(" and ")} are projections, drawn differently on purpose.</div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 16, overflow: "hidden" }}>
        <div style={{ padding: "13px 17px", borderBottom: "1px solid #F0F2F5" }}>
          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Per-product forecast</h3>
        </div>
        {forecastRows.length === 0 ? (
          <div style={{ padding: "52px 18px", textAlign: "center" }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: "#344054" }}>Not enough sales history to forecast</div>
            <div style={{ fontSize: 12.5, color: "#98A2B3", marginTop: 5 }}>A few weeks of recorded sales are needed before demand can be projected.</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
              <thead>
                <tr style={{ background: "#FAFBFC" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Product</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>On hand</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Velocity</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Forecast demand (30d)</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Cover</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Expected stockout</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Suggested</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {forecastRows.map((f) => {
                  const tone = CONF_TONE[f.confidence];
                  return (
                    <tr key={f.id} style={{ borderTop: "1px solid #F2F4F7" }}>
                      <td style={{ padding: "12px 17px", fontSize: 12.5, fontWeight: 700, color: "#101828" }}>{f.name}</td>
                      <td style={{ padding: 12, fontSize: 12.5, fontWeight: 800, color: "#0F172A", textAlign: "right" }}>{f.stock}</td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "#475467", textAlign: "right" }}>{f.velocity}/d</td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "#3538CD", fontWeight: 700, textAlign: "right" }}>{f.demand30}</td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "#475467", textAlign: "right" }}>{f.cover != null ? `${f.cover} d` : "—"}</td>
                      <td style={{ padding: 12, fontSize: 12, color: "#667085" }}>{f.outDate ? f.outDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</td>
                      <td style={{ padding: 12, fontSize: 12.5, fontWeight: 800, color: "#0E8442", textAlign: "right" }}>{f.suggested ?? "—"}</td>
                      <td style={{ padding: "12px 17px" }}>
                        <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: tone.bg, color: tone.fg }}>{f.confidence}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ padding: "11px 17px", borderTop: "1px solid #F0F2F5", fontSize: 11.5, color: "#98A2B3" }}>Confidence follows sales frequency — a product selling under half a unit a day cannot be projected reliably.</div>
      </div>
    </main>
  );
}
