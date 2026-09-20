"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { fetchInventory, fetchLowStock, fetchStockMovements, type MovementKind } from "@/lib/inventory-api";
import { formatCurrency } from "@/lib/format";
import { KpiTile, KpiSkeleton, INV } from "@/components/inventory/inventory-ui";
import { classifyMovement, FAST_MOVER_MAX_DAYS_OF_COVER } from "@/components/inventory/inventory-classification";
import { useSession } from "@/lib/session";

interface Insight {
  title: string;
  why: string;
  evidence: string;
  action: string;
  route: string;
}

const FLOW_LABEL: Record<MovementKind, string> = {
  purchase: "Purchases",
  sale: "Sales",
  wastage: "Wastage",
  adjustment: "Adjustments",
  return: "Returns",
  transfer_out: "Transfers out",
  transfer_in: "Transfers in",
};
const FLOW_COLOR: Record<MovementKind, string> = {
  purchase: "#0E8442",
  sale: "#3538CD",
  wastage: "#B42318",
  adjustment: "#B54708",
  return: "#475467",
  transfer_out: "#7E22CE",
  transfer_in: "#7E22CE",
};

export function InventoryOverviewView() {
  const router = useRouter();
  const session = useSession();
  const currency = session.business.currency;

  const { data: items = [], isPending: itemsPending } = useQuery({ queryKey: ["inventory"], queryFn: fetchInventory });
  const { data: lowStock = [] } = useQuery({ queryKey: ["low-stock"], queryFn: fetchLowStock });
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { data: monthMovements = [], isPending: movementsPending } = useQuery({
    queryKey: ["stock-movements", "overview-month"],
    queryFn: () => fetchStockMovements({ from: monthStart.toISOString() }),
  });
  const isPending = itemsPending || movementsPending;

  const tracked = items.length;
  const units = items.reduce((s, i) => s + i.stockQty, 0);
  const value = items.reduce((s, i) => s + i.stockValue, 0);
  const lowCount = items.filter((i) => i.status === "low_stock").length;
  const outCount = items.filter((i) => i.status === "out_of_stock").length;
  const overCount = items.filter((i) => i.overstocked).length;
  const fastCount = items.filter((i) => classifyMovement(i.velocityPerDay, i.daysOfCover) === "Fast").length;
  const deadItems = items.filter((i) => i.velocityPerDay === 0 && i.stockQty > 0);
  const deadValue = deadItems.reduce((s, i) => s + i.stockValue, 0);
  const lostSalesEstimate = lowStock.reduce((s, i) => s + i.lostSalesEstimate, 0);

  const insights = useMemo(() => {
    const list: Insight[] = [];
    if (outCount > 0) {
      list.push({
        title: `${outCount} product${outCount === 1 ? " is" : "s are"} out of stock right now`,
        why: "Every day these stay at zero is lost revenue you can't get back — customers buy elsewhere or not at all.",
        evidence: `${outCount} product${outCount === 1 ? "" : "s"}, an estimated ${formatCurrency(lostSalesEstimate, currency)} in missed sales`,
        action: "Reorder now",
        route: "low-stock",
      });
    }
    if (deadItems.length > 0) {
      list.push({
        title: `${formatCurrency(deadValue, currency)} is tied up in stock that hasn't sold in 30+ days`,
        why: "That's real capital sitting on a shelf instead of funding your next purchase order.",
        evidence: `${deadItems.length} product${deadItems.length === 1 ? "" : "s"} with zero sales in the last 30 days`,
        action: "View valuation",
        route: "valuation",
      });
    }
    if (overCount > 0) {
      list.push({
        title: `${overCount} product${overCount === 1 ? " is" : "s are"} overstocked`,
        why: "More than four months of stock at current sales pace — worth checking before the next reorder.",
        evidence: `${overCount} product${overCount === 1 ? "" : "s"} holding over 120 days of cover`,
        action: "Review valuation",
        route: "valuation",
      });
    }
    if (fastCount > 0) {
      list.push({
        title: `${fastCount} product${fastCount === 1 ? " is" : "s are"} selling fast`,
        why: "These will need reordering soon if they haven't already dropped below threshold.",
        evidence: `${fastCount} product${fastCount === 1 ? "" : "s"} with ${FAST_MOVER_MAX_DAYS_OF_COVER} days of cover or less`,
        action: "View restock plan",
        route: "restock",
      });
    }
    if (list.length === 0) {
      list.push({
        title: "Your stock levels look healthy",
        why: "No stockouts, no dead stock, and nothing overstocked right now.",
        evidence: `${tracked} products tracked`,
        action: "View stock",
        route: "",
      });
    }
    return list;
  }, [outCount, deadItems, deadValue, overCount, fastCount, tracked, lostSalesEstimate, currency]);

  const healthInputs = useMemo(() => {
    const stockoutRate = tracked > 0 ? (outCount / tracked) * 100 : 0;
    const lowRate = tracked > 0 ? (lowCount / tracked) * 100 : 0;
    const deadShare = value > 0 ? (deadValue / value) * 100 : 0;
    const overRate = tracked > 0 ? (overCount / tracked) * 100 : 0;
    const withVelocity = items.filter((i) => i.velocityPerDay > 0 && i.daysOfCover != null);
    const avgCover = withVelocity.length > 0 ? Math.round(withVelocity.reduce((s, i) => s + (i.daysOfCover ?? 0), 0) / withVelocity.length) : null;
    return [
      { l: "Stockout rate", target: "target ≤2%", v: `${stockoutRate.toFixed(1)}%`, ok: stockoutRate <= 2 },
      { l: "Low stock rate", target: "target ≤10%", v: `${lowRate.toFixed(1)}%`, ok: lowRate <= 10 },
      { l: "Dead stock share of value", target: "target ≤5%", v: `${deadShare.toFixed(1)}%`, ok: deadShare <= 5 },
      { l: "Overstock rate", target: "target ≤10%", v: `${overRate.toFixed(1)}%`, ok: overRate <= 10 },
      { l: "Average days of cover", target: "target ≤60d", v: avgCover != null ? `${avgCover}d` : "No sales data", ok: avgCover == null ? true : avgCover <= 60 },
    ];
  }, [tracked, outCount, lowCount, value, deadValue, overCount, items]);

  const overallHealth = healthInputs.filter((h) => !h.ok).length === 0 ? "Good" : healthInputs.filter((h) => !h.ok).length <= 2 ? "Fair" : "Needs attention";
  const healthTone = overallHealth === "Good" ? { bg: "#E8F7EE", fg: "#0E8442" } : overallHealth === "Fair" ? { bg: "#FEF6E7", fg: "#B54708" } : { bg: "#FEF3F2", fg: "#B42318" };

  const flow = useMemo(() => {
    const sums = new Map<MovementKind, number>();
    for (const m of monthMovements) sums.set(m.kind, (sums.get(m.kind) ?? 0) + Math.abs(m.qty));
    return (Object.keys(FLOW_LABEL) as MovementKind[])
      .map((k) => ({ k, n: sums.get(k) ?? 0 }))
      .filter((f) => f.n > 0)
      .map((f) => ({ l: FLOW_LABEL[f.k], v: String(f.n), color: FLOW_COLOR[f.k] }));
  }, [monthMovements]);

  const topByValue = useMemo(() => [...items].sort((a, b) => b.stockValue - a.stockValue).slice(0, 5), [items]);
  const topMax = Math.max(1, ...topByValue.map((i) => i.stockValue));

  return (
    <main style={{ padding: "16px 22px 26px", display: "flex", flexDirection: "column", gap: 15 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(155px,1fr))", gap: 13 }}>
        {isPending ? (
          <KpiSkeleton count={7} />
        ) : (
          <>
            <KpiTile label="Products tracked" value={String(tracked)} />
            <KpiTile label="Units on hand" value={String(units)} />
            <KpiTile label="Inventory value" value={formatCurrency(value, currency)} tone="green" />
            <KpiTile label="Low stock" value={String(lowCount)} tone="amber" />
            <KpiTile label="Out of stock" value={String(outCount)} tone="red" />
            <KpiTile label="Overstocked" value={String(overCount)} />
            <KpiTile label="Fast movers" value={String(fastCount)} />
            <KpiTile label="Dead stock" value={String(deadItems.length)} meta={`${formatCurrency(deadValue, currency)} held`} />
          </>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 330px", gap: 15, alignItems: "start" }}>
        <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 16, padding: 17, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 13 }}>
            <Sparkles size={17} style={{ color: "#0E8442" }} />
            <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>What your stock is telling you</h3>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {insights.map((x) => (
              <div key={x.title} style={{ border: `1px solid ${INV.border}`, borderRadius: 13, padding: 14 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: "#101828" }}>{x.title}</div>
                <div style={{ fontSize: 12.5, color: "#475467", marginTop: 6, lineHeight: 1.6 }}>{x.why}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: "#98A2B3" }}>Evidence: {x.evidence}</span>
                  {x.route && (
                    <button
                      type="button"
                      onClick={() => router.push(`/inventory/${x.route}`)}
                      style={{ marginLeft: "auto", border: `1px solid ${INV.border}`, background: "#fff", borderRadius: 10, padding: "9px 14px", fontSize: 12, fontWeight: 700, color: "#0E8442", cursor: "pointer", minHeight: 42 }}
                    >
                      {x.action}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
          <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 16, padding: 17 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5 }}>
              <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Inventory health</h3>
              <span style={{ fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 20, background: healthTone.bg, color: healthTone.fg }}>{overallHealth}</span>
            </div>
            <div style={{ fontSize: 11, color: "#98A2B3", marginBottom: 12 }}>Five inputs, all visible — no hidden score. OK/Watch is just each input against the target shown next to it.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {healthInputs.map((h) => (
                <div key={h.l} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span style={{ flex: 1, fontSize: 12, color: "#344054" }}>
                    {h.l} <span style={{ color: "#98A2B3" }}>({h.target})</span>
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#101828" }}>{h.v}</span>
                  <span style={{ fontSize: 9.5, fontWeight: 800, padding: "2px 7px", borderRadius: 20, background: h.ok ? "#E8F7EE" : "#FEF3F2", color: h.ok ? "#0E8442" : "#B42318", whiteSpace: "nowrap" }}>{h.ok ? "OK" : "Watch"}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 16, padding: 17 }}>
            <h3 style={{ margin: "0 0 5px", fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Stock flow this month</h3>
            <div style={{ fontSize: 11, color: "#98A2B3", marginBottom: 12 }}>Every unit accounted for by source</div>
            {flow.length === 0 ? (
              <div style={{ fontSize: 12.5, color: INV.textFaint }}>No movements yet this month.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {flow.map((f) => (
                  <div key={f.l} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid #F2F4F7" }}>
                    <span style={{ fontSize: 12, color: "#667085" }}>{f.l}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: f.color }}>{f.v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 16, padding: 17 }}>
        <h3 style={{ margin: "0 0 5px", fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Where the capital sits</h3>
        <div style={{ fontSize: 11, color: "#98A2B3", marginBottom: 13 }}>Top five products by stock value</div>
        {topByValue.length === 0 ? (
          <div style={{ fontSize: 12.5, color: INV.textFaint }}>No stocked products yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {topByValue.map((t) => (
              <div key={t.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5 }}>
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "#344054" }}>{t.name}</span>
                  <span style={{ fontSize: 11, color: "#98A2B3" }}>{t.stockQty} units</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#101828" }}>{formatCurrency(t.stockValue, currency)}</span>
                </div>
                <div style={{ height: 8, borderRadius: 6, background: "#F2F4F7", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 6, background: "#BFE7CF", width: `${Math.round((t.stockValue / topMax) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
