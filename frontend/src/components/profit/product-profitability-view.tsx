"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Star, AlertTriangle, Sparkles } from "lucide-react";
import { SideDrawer } from "@/components/shared/side-drawer";
import { PriceAdjustmentDialog } from "./price-adjustment-dialog";
import { fetchBranches } from "@/lib/branches-api";
import { fetchProfitByProduct, fetchProductSuggestions, type ProfitProductRow } from "@/lib/profit-api";
import { formatCurrency } from "@/lib/format";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";

const MARGIN_BANDS = ["All margins", "Under 10%", "10–25%", "Over 25%"];

const selectStyle: React.CSSProperties = {
  border: "1px solid var(--app-border)",
  background: "var(--app-surface)",
  color: "var(--app-text-muted)",
  borderRadius: 11,
  padding: "10px 12px",
  fontSize: 12.5,
  fontWeight: 600,
  minHeight: 44,
};

const outlineBtnStyle: React.CSSProperties = {
  border: "1px solid var(--app-border)",
  background: "var(--app-surface)",
  borderRadius: 11,
  padding: "11px 15px",
  fontSize: 12.5,
  fontWeight: 700,
  color: "var(--app-text-muted)",
  minHeight: 44,
};

function handleFakeOption(value: string): boolean {
  if (value.indexOf("+ Add") === 0) {
    toast.info("Custom option builder — not available yet.");
    return true;
  }
  return false;
}

function marginColor(m: number): string {
  return m < 10 ? "#B42318" : m < 25 ? "#B54708" : "#0E8442";
}
function chipBg(m: number): string {
  return m < 10 ? "#FEF3F2" : m < 25 ? "#FEF6E7" : "#E8F7EE";
}
function treemapColor(m: number): { bg: string; fg: string } {
  if (m < 10) return { bg: "#FDD9D6", fg: "#93370D" };
  if (m < 25) return { bg: "#FEE9C4", fg: "#93370D" };
  if (m < 50) return { bg: "#BFE7CF", fg: "#0A1B2A" };
  return { bg: "#8FF0BB", fg: "#0A1B2A" };
}
const TREND_ARROW: Record<ProfitProductRow["trend"], { glyph: string; color: string }> = {
  up: { glyph: "▲", color: "#0E8442" },
  down: { glyph: "▼", color: "#B42318" },
  flat: { glyph: "–", color: "#98A2B3" },
};

function exportCsv(rows: ProfitProductRow[]) {
  const header = ["Product", "Category", "Units", "Revenue", "Cost", "Profit", "Margin %"];
  const lines = [header, ...rows.map((p) => [p.name, p.category, p.units, p.revenue, p.cost, p.profit, p.margin.toFixed(1)])];
  const csv = lines.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "product-profitability.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function ProductProfitabilityView() {
  const session = useSession();
  const currency = session.business.currency;
  const [windowDays, setWindowDays] = useState<30 | 90>(30);
  const [category, setCategory] = useState("All categories");
  const [band, setBand] = useState(MARGIN_BANDS[0]);
  const [branchId, setBranchId] = useState("all");
  const [adjustingProductId, setAdjustingProductId] = useState<string | null>(null);
  const [openProduct, setOpenProduct] = useState<ProfitProductRow | null>(null);
  const [aiSuggestOpen, setAiSuggestOpen] = useState(false);

  const { data, isPending } = useQuery({ queryKey: ["profit-products", windowDays, branchId], queryFn: () => fetchProfitByProduct(windowDays, branchId) });
  const { data: branches = [] } = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });
  const products = useMemo(() => data?.products ?? [], [data]);
  const categories = useMemo(() => [...new Set(products.map((p) => p.category))].sort(), [products]);

  const filtered = products.filter((p) => {
    if (category !== "All categories" && p.category !== category) return false;
    if (band === "Under 10%" && !(p.margin < 10)) return false;
    if (band === "10–25%" && !(p.margin >= 10 && p.margin < 25)) return false;
    if (band === "Over 25%" && !(p.margin >= 25)) return false;
    return true;
  });

  const mostProfitable = filtered.length ? filtered.reduce((max, p) => (p.profit > max.profit ? p : max)) : null;
  const leastProfitable = filtered.length ? filtered.reduce((min, p) => (p.profit < min.profit ? p : min)) : null;
  const totalRevenue = filtered.reduce((sum, p) => sum + p.revenue, 0);
  const totalProfit = filtered.reduce((sum, p) => sum + p.profit, 0);
  const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const lossCount = filtered.filter((p) => p.margin < 10).length;

  const bandCounts = [
    { l: "Under 10%", n: filtered.filter((p) => p.margin < 10).length, color: "#B42318" },
    { l: "10–25%", n: filtered.filter((p) => p.margin >= 10 && p.margin < 25).length, color: "#B54708" },
    { l: "25–50%", n: filtered.filter((p) => p.margin >= 25 && p.margin < 50).length, color: "#0D9488" },
    { l: "Over 50%", n: filtered.filter((p) => p.margin >= 50).length, color: "#0E8442" },
  ];
  const maxBand = Math.max(1, ...bandCounts.map((b) => b.n));

  const positiveProfit = filtered.filter((p) => p.profit > 0);
  const totalPositiveProfit = positiveProfit.reduce((sum, p) => sum + p.profit, 0);
  const treemap = [...positiveProfit].sort((a, b) => b.profit - a.profit).slice(0, 8);

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[9px]">
        <select
          value={windowDays === 30 ? "30 Days" : "90 Days"}
          onChange={(e) => {
            if (handleFakeOption(e.target.value)) return;
            if (e.target.value === "Custom") { toast.info("Custom window — not available yet."); return; }
            setWindowDays(e.target.value === "90 Days" ? 90 : 30);
          }}
          aria-label="Window"
          style={selectStyle}
        >
          <option>30 Days</option>
          <option>90 Days</option>
          <option>Custom</option>
          <option>+ Add your own…</option>
        </select>
        <select
          value={category}
          onChange={(e) => { if (handleFakeOption(e.target.value)) return; setCategory(e.target.value); }}
          aria-label="Category"
          style={selectStyle}
        >
          <option>All categories</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
          <option>+ Add your own…</option>
        </select>
        <select value={band} onChange={(e) => setBand(e.target.value)} aria-label="Margin band" style={selectStyle}>
          {MARGIN_BANDS.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
        <select
          value={branchId}
          onChange={(e) => { if (handleFakeOption(e.target.value)) return; setBranchId(e.target.value); }}
          aria-label="Branch"
          style={selectStyle}
        >
          <option value="all">All branches</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
          <option>+ Add your own…</option>
        </select>
        <div className="ml-auto flex flex-wrap gap-[9px]">
          <button type="button" onClick={() => exportCsv(filtered)} style={outlineBtnStyle}>Export</button>
          <button
            type="button"
            onClick={() => setAiSuggestOpen(true)}
            className="flex items-center gap-1.5"
            style={{ ...outlineBtnStyle, color: "#0E8442" }}
          >
            <Sparkles className="h-[15px] w-[15px]" aria-hidden />
            AI Suggestions
          </button>
        </div>
      </div>

      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        {isPending ? (
          Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[86px] animate-pulse rounded-[14px]" style={{ background: "var(--app-surface-2)" }} />)
        ) : (
          <>
            <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1.5px solid #BFE7CF" }}>
              <div className="text-[12px] font-bold" style={{ color: "#0E8442" }}>Most Profitable</div>
              <div className="mt-2 text-[13.5px] font-extrabold leading-snug" style={{ color: "var(--app-text)" }}>{mostProfitable?.name ?? "—"}</div>
            </div>
            <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1.5px solid #FDD9D6" }}>
              <div className="text-[12px] font-bold" style={{ color: "#B42318" }}>Least Profitable</div>
              <div className="mt-2 text-[13.5px] font-extrabold leading-snug" style={{ color: "var(--app-text)" }}>{leastProfitable?.name ?? "—"}</div>
            </div>
            <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faint)" }}>Average Margin</div>
              <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{avgMargin.toFixed(1)}%</div>
            </div>
            <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faint)" }}>Loss-Making Items</div>
              <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "#B42318" }}>{lossCount}</div>
              <div className="mt-1 text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>Margin under 10%</div>
            </div>
          </>
        )}
      </div>

      <div className="grid gap-[15px]" style={{ gridTemplateColumns: "340px minmax(0,1fr)", alignItems: "start" }}>
        <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-3 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Margin distribution</h3>
          <div className="flex flex-col gap-[11px]">
            {bandCounts.map((b) => (
              <div key={b.l}>
                <div className="mb-[5px] flex justify-between">
                  <span className="text-[12.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{b.l}</span>
                  <span className="text-[12px] font-extrabold" style={{ color: "var(--app-text)" }}>{b.n}</span>
                </div>
                <div className="h-[9px] overflow-hidden rounded-[6px]" style={{ background: "var(--app-surface-2)" }}>
                  <div className="h-full rounded-[6px]" style={{ width: `${(b.n / maxBand) * 100}%`, background: b.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-0 rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-3 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Profit contribution</h3>
          {treemap.length === 0 ? (
            <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>No profitable sales in this window yet.</p>
          ) : (
            <div className="flex flex-wrap gap-[6px]">
              {treemap.map((p) => {
                const share = totalPositiveProfit > 0 ? (p.profit / totalPositiveProfit) * 100 : 0;
                const { bg, fg } = treemapColor(p.margin);
                return (
                  <div key={p.productId} className="flex flex-col justify-between rounded-[11px] p-[11px]" style={{ flex: "0 0 auto", width: `${Math.max(share, 14)}%`, minWidth: 110, minHeight: 78, background: bg }}>
                    <span className="text-[11px] font-bold leading-snug" style={{ color: fg }}>{p.name}</span>
                    <span className="text-[11.5px] font-extrabold" style={{ color: fg }}>{formatCurrency(p.profit, currency)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        {!isPending && filtered.length === 0 ? (
          <div className="text-center" style={{ padding: "52px 18px" }}>
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Record some sales to see profitability</div>
            <div className="mt-1.5 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Nothing matches these filters.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 960 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Product</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Units</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Revenue</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Cost</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Profit</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Margin</th>
                  <th style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Trend</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {isPending
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                        <td colSpan={8} style={{ padding: 14 }}><div className="h-4 animate-pulse rounded" style={{ background: "var(--app-surface-2)" }} /></td>
                      </tr>
                    ))
                  : filtered.map((p) => {
                      const arrow = TREND_ARROW[p.trend];
                      return (
                        <tr key={p.productId} onClick={() => setOpenProduct(p)} style={{ borderTop: "1px solid var(--app-border-strong)", cursor: "pointer" }}>
                          <td style={{ padding: "12px 17px" }}>
                            <span className="flex items-center gap-2">
                              {p.isTopPerformer && <Star className="h-3.5 w-3.5 shrink-0" style={{ fill: "#F59E0B", color: "#F59E0B" }} aria-hidden />}
                              <span className="text-[12.5px] font-bold" style={{ color: "#0E8442" }}>{p.name}</span>
                            </span>
                          </td>
                          <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-faint)", textAlign: "right" }}>{p.units}</td>
                          <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-faint)", textAlign: "right" }}>{formatCurrency(p.revenue, currency)}</td>
                          <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-faint)", textAlign: "right" }}>{formatCurrency(p.cost, currency)}</td>
                          <td style={{ padding: 12, fontSize: 12.5, fontWeight: 800, color: "var(--app-text)", textAlign: "right" }}>{formatCurrency(p.profit, currency)}</td>
                          <td style={{ padding: 12, textAlign: "right" }}>
                            <span className="inline-flex items-center gap-1 rounded-full text-[11px] font-extrabold" style={{ padding: "3px 9px", background: chipBg(p.margin), color: marginColor(p.margin), whiteSpace: "nowrap" }}>
                              {p.reviewPricing && <AlertTriangle className="h-2.5 w-2.5" aria-hidden />}
                              {p.margin.toFixed(1)}%
                            </span>
                          </td>
                          <td style={{ padding: 12, textAlign: "center", fontSize: 13, fontWeight: 800, color: arrow.color }}>{arrow.glyph}</td>
                          <td style={{ padding: "12px 17px", textAlign: "right" }}>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setAdjustingProductId(p.productId); }}
                              className="rounded-[9px] text-[11.5px] font-bold"
                              style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", padding: "8px 12px", minHeight: 40 }}
                            >
                              Adjust price
                            </button>
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {adjustingProductId && <PriceAdjustmentDialog productId={adjustingProductId} onClose={() => setAdjustingProductId(null)} />}
      {openProduct && (
        <ProductDrawer
          product={openProduct}
          currency={currency}
          onClose={() => setOpenProduct(null)}
          onAdjustPrice={() => { setAdjustingProductId(openProduct.productId); setOpenProduct(null); }}
        />
      )}
      {aiSuggestOpen && <AiSuggestModal windowDays={windowDays} branchId={branchId} currency={currency} onClose={() => setAiSuggestOpen(false)} />}
    </main>
  );
}

function ProductDrawer({ product, currency, onClose, onAdjustPrice }: { product: ProfitProductRow; currency: string; onClose: () => void; onAdjustPrice: () => void }) {
  const unitPrice = product.units > 0 ? product.revenue / product.units : 0;
  const unitCost = product.units > 0 ? product.cost / product.units : 0;
  return (
    <SideDrawer
      title={product.name}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="flex-1 rounded-[11px] py-3 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Close</button>
          <button type="button" onClick={onAdjustPrice} className="flex-1 rounded-[11px] py-3 text-[13px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>Adjust Price</button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-[10px]">
        <div className="rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}>
          <div className="text-[11.5px] font-bold" style={{ color: "var(--app-text-faint)" }}>Units sold</div>
          <div className="mt-1 text-[17px] font-extrabold" style={{ color: "var(--app-text)" }}>{product.units}</div>
        </div>
        <div className="rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}>
          <div className="text-[11.5px] font-bold" style={{ color: "var(--app-text-faint)" }}>Revenue</div>
          <div className="mt-1 text-[17px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(product.revenue, currency)}</div>
        </div>
        <div className="rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}>
          <div className="text-[11.5px] font-bold" style={{ color: "var(--app-text-faint)" }}>Unit price</div>
          <div className="mt-1 text-[17px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(unitPrice, currency)}</div>
        </div>
        <div className="rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}>
          <div className="text-[11.5px] font-bold" style={{ color: "var(--app-text-faint)" }}>Unit cost</div>
          <div className="mt-1 text-[17px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(unitCost, currency)}</div>
        </div>
        <div className="col-span-2 rounded-[12px] p-3" style={{ border: "1.5px solid #BFE7CF", background: "#F7FCF9" }}>
          <div className="text-[11.5px] font-bold" style={{ color: "#0E8442" }}>Profit — {product.margin.toFixed(1)}% margin</div>
          <div className="mt-1 text-[17px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(product.profit, currency)}</div>
        </div>
      </div>
    </SideDrawer>
  );
}

function AiSuggestModal({ windowDays, branchId, currency, onClose }: { windowDays: 30 | 90; branchId: string; currency: string; onClose: () => void }) {
  const { data: suggestions = [], isPending } = useQuery({ queryKey: ["product-suggestions", windowDays, branchId], queryFn: () => fetchProductSuggestions(windowDays, branchId) });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5" style={{ background: "rgba(10,27,42,.42)" }} onClick={onClose}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="w-full max-w-[490px] max-h-[88vh] overflow-y-auto rounded-[18px]" style={{ background: "var(--app-surface)", boxShadow: "0 30px 80px rgba(10,27,42,.32)" }}>
        <div className="p-[17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>AI Suggestions</h3>
        </div>
        <div className="flex flex-col gap-3 p-[17px]">
          <span className="self-start rounded-[6px] text-[10.5px] font-extrabold uppercase tracking-[.4px]" style={{ color: "#0E8442", background: "#E8F7EE", padding: "4px 9px" }}>AI suggestion</span>
          {isPending ? (
            <div className="text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Loading…</div>
          ) : suggestions.length === 0 ? (
            <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>No low-margin products in this window right now.</p>
          ) : (
            suggestions.map((s) => (
              <div key={s.productId} className="rounded-[12px] p-[13px]" style={{ border: "1px solid var(--app-border)" }}>
                <div className="text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{s.name}</div>
                <div className="mt-2 flex items-center gap-2.5">
                  <span className="text-[12px]" style={{ color: "var(--app-text-faint)" }}>{formatCurrency(s.currentPrice, currency)}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#98A2B3" strokeWidth="2.2" strokeLinecap="round"><path d="m9 6 6 6-6 6" /></svg>
                  <span className="text-[13px] font-extrabold" style={{ color: "#0E8442" }}>{formatCurrency(s.suggestedPrice, currency)}</span>
                </div>
                <div className="mt-2 text-[11.5px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>{s.pitch}</div>
              </div>
            ))
          )}
          <div className="rounded-[11px] p-[11px_13px] text-[11.5px]" style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", color: "#93370D" }}>
            Suggestions from your own real sales figures. Review each one — nothing changes until you apply it.
          </div>
        </div>
        <div className="flex justify-end gap-2.5 p-[14px_17px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
          <button type="button" onClick={onClose} className="rounded-[11px] px-4 py-2.5 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Dismiss</button>
          <button type="button" onClick={onClose} className="rounded-[11px] px-5 py-2.5 text-[12.5px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>Review in table</button>
        </div>
      </div>
    </div>
  );
}
