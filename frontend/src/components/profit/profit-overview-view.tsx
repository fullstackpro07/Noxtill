"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SideDrawer } from "@/components/shared/side-drawer";
import { fetchPnl, fetchProfitByProduct, type PnlCategoryRow, type PnlPeriod } from "@/lib/profit-api";
import { fetchBranches } from "@/lib/branches-api";
import { formatCurrency } from "@/lib/format";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";

const KPI_ICON = {
  revenue: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6.5v11M14 9.5A2.6 2.6 0 0 0 11.5 8",
  cogs: "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Zm-17.7-1 8.7 5 8.7-5M12 22V12",
  gross: "m22 7-8.5 8.5-5-5L2 17M16 7h6v6",
  expenses: "M20 8H5a3 3 0 0 1 0-6h13v6M2 5v13a3 3 0 0 0 3 3h16a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H5",
  net: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6.5v11M14.5 9.5A2.6 2.6 0 0 0 12 8c-1.6 0-2.6.9-2.6 2s1 1.9 2.6 2.2",
  margin: "M19 5 5 19M7.5 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM16.5 19.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
};

const PERIOD_LABEL: Record<PnlPeriod, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
  quarter: "Quarter",
  year: "Year",
};

const WIDGET_KEYS = ["trend", "revcost", "margin", "summary"] as const;
type WidgetKey = (typeof WIDGET_KEYS)[number];
const WIDGET_LABEL: Record<WidgetKey, string> = {
  trend: "Net profit trend",
  revcost: "Revenue vs cost",
  margin: "Margin by category",
  summary: "Category summary",
};
const WIDGETS_STORAGE_KEY = "profit-overview-widgets";

function loadWidgetPrefs(): WidgetKey[] {
  try {
    const raw = localStorage.getItem(WIDGETS_STORAGE_KEY);
    if (!raw) return [...WIDGET_KEYS];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((k): k is WidgetKey => WIDGET_KEYS.includes(k)) : [...WIDGET_KEYS];
  } catch {
    return [...WIDGET_KEYS];
  }
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function short(n: number): string {
  const a = Math.abs(n);
  return (n < 0 ? "−" : "") + (a >= 1000 ? Math.round(a / 1000) + "K" : String(Math.round(a)));
}

function marginColor(m: number): string {
  return m < 10 ? "#B42318" : m < 25 ? "#B54708" : "#0E8442";
}

function deltaPct(current: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((current - prev) / Math.abs(prev)) * 100;
}

function DeltaBadge({ pct, invert }: { pct: number | null; invert?: boolean }) {
  if (pct === null) return null;
  const good = invert ? pct <= 0 : pct >= 0;
  return (
    <div className="mt-1 text-[11px] font-bold" style={{ color: good ? "#0E8442" : "#B54708" }}>
      {pct >= 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}% vs previous
    </div>
  );
}

function linePath(vals: number[], W = 620, PH = 108, T = 14) {
  const n = vals.length;
  const min = Math.min(0, ...vals);
  const max = Math.max(...vals, min + 1);
  const x = (i: number) => 34 + i * ((W - 48) / Math.max(1, n - 1));
  const y = (v: number) => T + PH * (1 - (v - min) / (max - min));
  const pts = vals.map((v, i) => ({ x: +x(i).toFixed(1), y: +y(v).toFixed(1) }));
  const line = pts.map((p, i) => (i ? "L" : "M") + p.x + " " + p.y).join(" ");
  const area = `${line} L${pts[n - 1].x} ${T + PH} L${pts[0].x} ${T + PH} Z`;
  const gridVals = [0, 1 / 3, 2 / 3, 1].map((f) => min + (max - min) * f);
  const grid = gridVals.map((v) => ({ y: +y(v).toFixed(1), label: short(v) }));
  return { pts, line, area, grid };
}

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

function KpiTile({ label, value, icon, bg, color, border, delta }: { label: string; value: string; icon: string; bg: string; color: string; border?: string; delta?: React.ReactNode }) {
  return (
    <div className="rounded-[14px]" style={{ background: "var(--app-surface)", border: border ?? "1px solid var(--app-border)", padding: 15 }}>
      <div className="mb-[9px] flex items-center gap-[9px]">
        <span className="flex items-center justify-center rounded-[9px]" style={{ width: 30, height: 30, background: bg, flex: "0 0 30px" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={icon} />
          </svg>
        </span>
        <span className="text-[12px] font-semibold" style={{ color: "var(--app-text-faint)" }}>{label}</span>
      </div>
      <div className="text-[21px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.5px" }}>{value}</div>
      {delta}
    </div>
  );
}

export function ProfitOverviewView() {
  const session = useSession();
  const currency = session.business.currency;
  const [period, setPeriod] = useState<PnlPeriod>("month");
  const [compare, setCompare] = useState(true);
  const [branchId, setBranchId] = useState("all");
  const [category, setCategory] = useState("All categories");
  const [drawerCategory, setDrawerCategory] = useState<PnlCategoryRow | null>(null);
  const [customiseOpen, setCustomiseOpen] = useState(false);
  const [widgets, setWidgets] = useState<WidgetKey[]>(() => loadWidgetPrefs());

  const month = useMemo(() => currentMonth(), []);
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["profit-pnl", month, period, branchId], queryFn: () => fetchPnl(month, period, branchId) });
  const { data: branches = [] } = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });

  if (isError) {
    return (
      <div className="mx-6 mt-6 rounded-[16px] p-6 text-center" style={{ background: "var(--app-surface)", border: "1px solid #FDD9D6" }}>
        <p className="m-0 text-[14.5px] font-extrabold" style={{ color: "#B42318" }}>Unable to load analytics</p>
        <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>No partial figures are shown — incomplete financial calculations can mislead.</p>
        <button type="button" onClick={() => refetch()} className="mt-3.5 rounded-[12px] px-5 py-3 text-[13px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>Retry</button>
      </div>
    );
  }

  const categories = data?.categoryBreakdown ?? [];
  const filteredCategories = category === "All categories" ? categories : categories.filter((c) => c.category === category);
  const grossProfit = data ? round2(data.revenue - data.cogs) : 0;
  const margin = data && data.revenue > 0 ? (data.netProfit / data.revenue) * 100 : 0;

  const trend = data?.trend ?? [];
  const prev = trend.length >= 2 ? trend[trend.length - 2] : null;
  const prevMargin = prev && prev.revenue > 0 ? (prev.netProfit / prev.revenue) * 100 : null;

  const profitTrendVals = trend.map((t) => t.netProfit);
  const profitChart = trend.length >= 2 ? linePath(profitTrendVals) : null;
  const revCostMax = Math.max(1, ...trend.map((t) => t.revenue), ...trend.map((t) => t.cogs));

  function onPeriodChange(value: string) {
    if (handleFakeOption(value)) return;
    if (value === "Custom") {
      toast.info("Custom date range — not available yet.");
      return;
    }
    const entry = (Object.entries(PERIOD_LABEL) as [PnlPeriod, string][]).find(([, label]) => label === value);
    if (entry) setPeriod(entry[0]);
  }

  function saveWidgets(next: WidgetKey[]) {
    setWidgets(next);
    try {
      localStorage.setItem(WIDGETS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* per-browser preference only — nothing to recover if storage is unavailable */
    }
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[9px]">
        <select value={PERIOD_LABEL[period]} onChange={(e) => onPeriodChange(e.target.value)} aria-label="Period" className="rounded-[11px]" style={selectStyle}>
          <option>Today</option>
          <option>This Week</option>
          <option>This Month</option>
          <option>Quarter</option>
          <option>Year</option>
          <option>Custom</option>
          <option>+ Add your own…</option>
        </select>
        <span className="flex items-center gap-[9px] rounded-[11px]" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", padding: "9px 13px", minHeight: 44 }}>
          <span className="text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>Compare to previous</span>
          <button
            type="button"
            role="switch"
            aria-checked={compare}
            aria-label="Compare to previous period"
            onClick={() => setCompare((v) => !v)}
            className="relative rounded-full"
            style={{ width: 38, height: 21, border: 0, background: compare ? "#12A150" : "#D5DCE4" }}
          >
            <span className="absolute rounded-full bg-white" style={{ top: 2, width: 17, height: 17, left: compare ? 19 : 2 }} />
          </button>
        </span>
        <select
          value={branchId}
          onChange={(e) => {
            if (handleFakeOption(e.target.value)) return;
            setBranchId(e.target.value);
          }}
          aria-label="Branch"
          className="rounded-[11px]"
          style={selectStyle}
        >
          <option value="all">All branches</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
          <option>+ Add your own…</option>
        </select>
        <select
          value={category}
          onChange={(e) => {
            if (handleFakeOption(e.target.value)) return;
            setCategory(e.target.value);
          }}
          aria-label="Category"
          className="rounded-[11px]"
          style={selectStyle}
        >
          <option>All categories</option>
          {categories.map((c) => (
            <option key={c.category}>{c.category}</option>
          ))}
          <option>+ Add your own…</option>
        </select>
        <button type="button" onClick={() => setCustomiseOpen(true)} className="ml-auto rounded-[11px]" style={outlineBtnStyle}>
          Customise View
        </button>
      </div>

      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(175px,1fr))" }}>
        {isPending || !data ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[86px] animate-pulse rounded-[14px]" style={{ background: "var(--app-surface-2)" }} />
          ))
        ) : (
          <>
            <KpiTile label="Revenue" value={formatCurrency(data.revenue, currency)} icon={KPI_ICON.revenue} bg="#E8F7EE" color="#12A150" delta={compare && prev && <DeltaBadge pct={deltaPct(data.revenue, prev.revenue)} />} />
            <KpiTile label="Cost of Goods" value={formatCurrency(data.cogs, currency)} icon={KPI_ICON.cogs} bg="#FEF0E6" color="#F97316" delta={compare && prev && <DeltaBadge pct={deltaPct(data.cogs, prev.cogs)} invert />} />
            <KpiTile label="Gross Profit" value={formatCurrency(grossProfit, currency)} icon={KPI_ICON.gross} bg="#E8F7EE" color="#12A150" delta={compare && prev && <DeltaBadge pct={deltaPct(grossProfit, round2(prev.revenue - prev.cogs))} />} />
            <KpiTile label="Expenses" value={formatCurrency(data.totalExpenses + data.wastageCost, currency)} icon={KPI_ICON.expenses} bg="#FEF6E7" color="#B54708" delta={compare && prev && <DeltaBadge pct={deltaPct(data.totalExpenses + data.wastageCost, prev.totalExpenses + prev.wastageCost)} invert />} />
            <KpiTile label="Net Profit" value={formatCurrency(data.netProfit, currency)} icon={KPI_ICON.net} bg="#E8F7EE" color="#0E8442" border="1.5px solid #BFE7CF" delta={compare && prev && <DeltaBadge pct={deltaPct(data.netProfit, prev.netProfit)} />} />
            <KpiTile
              label="Margin"
              value={`${margin.toFixed(1)}%`}
              icon={KPI_ICON.margin}
              bg="#EEF4FF"
              color="#3538CD"
              delta={
                compare &&
                prevMargin !== null && (
                  <div className="mt-1 text-[11px] font-bold" style={{ color: margin >= prevMargin ? "#0E8442" : "#B54708" }}>
                    {margin >= prevMargin ? "▲" : "▼"} {Math.abs(margin - prevMargin).toFixed(1)} pts vs previous
                  </div>
                )
              }
            />
          </>
        )}
      </div>

      {(widgets.includes("trend") || widgets.includes("revcost")) && (
        <div className="grid gap-[15px]" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
          {widgets.includes("trend") && (
            <div className="min-w-0 rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 17 }}>
              <div className="mb-1.5 flex items-center gap-3.5">
                <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Net profit trend</h3>
                <span className="text-[11px] font-semibold" style={{ color: "var(--app-text-disabled)" }}>Revenue less cost of goods and expenses</span>
              </div>
              {!profitChart ? (
                <div className="flex h-[150px] items-center justify-center text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Not enough months of history yet.</div>
              ) : (
                <svg viewBox="0 0 620 150" style={{ width: "100%", height: 150, display: "block" }}>
                  {profitChart.grid.map((g, i) => (
                    <g key={i}>
                      <line x1={44} x2={608} y1={g.y} y2={g.y} stroke="#EDF0F4" strokeDasharray="4 4" />
                      <text x={38} y={g.y + 3.5} textAnchor="end" fontSize={10} fill="#98A2B3" fontWeight={600}>{g.label}</text>
                    </g>
                  ))}
                  <path d={profitChart.area} fill="rgba(18,161,80,.10)" />
                  <path d={profitChart.line} fill="none" stroke="#12A150" strokeWidth={2.4} strokeLinejoin="round" />
                  {profitChart.pts.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={3.2} fill="#fff" stroke="#12A150" strokeWidth={1.8} />
                  ))}
                  {trend.map((t, i) => (
                    <text key={t.month} x={profitChart.pts[i].x} y={145} textAnchor="middle" fontSize={10.5} fill="#667085" fontWeight={600}>
                      {new Date(`${t.month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}
                    </text>
                  ))}
                </svg>
              )}
            </div>
          )}

          {widgets.includes("revcost") && (
            <div className="min-w-0 rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 17 }}>
              <div className="mb-1.5 flex flex-wrap items-center gap-[14px]">
                <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Revenue vs cost</h3>
                <span className="flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: "var(--app-text-faint)" }}>
                  <span className="h-2 w-2 rounded-[2px]" style={{ background: "#12A150" }} />Revenue
                </span>
                <span className="flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: "var(--app-text-faint)" }}>
                  <span className="h-2 w-2 rounded-[2px]" style={{ background: "#F97316" }} />Cost
                </span>
              </div>
              {trend.length === 0 ? (
                <div className="flex h-[150px] items-center justify-center text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Not enough months of history yet.</div>
              ) : (
                <svg viewBox="0 0 620 150" style={{ width: "100%", height: 150, display: "block" }}>
                  {trend.map((t, i) => {
                    const slot = (620 - 44) / trend.length;
                    const x = 34 + i * slot + slot * 0.14;
                    const x2 = 34 + i * slot + slot * 0.5;
                    const w = slot * 0.32;
                    const revH = (t.revenue / revCostMax) * 108;
                    const costH = (t.cogs / revCostMax) * 108;
                    return (
                      <g key={t.month}>
                        <rect x={x} y={122 - revH} width={w} height={revH} rx={4} fill="#12A150" />
                        <rect x={x2} y={122 - costH} width={w} height={costH} rx={4} fill="#F97316" />
                        <text x={x + w} y={145} textAnchor="middle" fontSize={10.5} fill="#667085" fontWeight={600}>
                          {new Date(`${t.month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              )}
            </div>
          )}
        </div>
      )}

      {widgets.includes("margin") && (
        <div className="rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 17 }}>
          <div className="mb-3 flex flex-wrap items-center gap-2.5">
            <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Margin by category</h3>
            <span className="text-[11px] font-semibold" style={{ color: "var(--app-text-disabled)" }}>Net margin, full track = 100%</span>
          </div>
          {filteredCategories.length === 0 ? (
            <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>No completed sales in this period yet.</p>
          ) : (
            <div className="flex flex-col gap-[11px]">
              {filteredCategories.map((c) => (
                <div key={c.category}>
                  <div className="mb-[5px] flex justify-between">
                    <span className="text-[12.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{c.category}</span>
                    <span className="text-[12px] font-extrabold" style={{ color: marginColor(c.margin) }}>{c.margin.toFixed(1)}%</span>
                  </div>
                  <div className="h-[10px] overflow-hidden rounded-[7px]" style={{ background: "var(--app-surface-2)" }}>
                    <div className="h-full rounded-[7px]" style={{ width: `${Math.min(100, Math.max(2, c.margin))}%`, background: marginColor(c.margin) }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {widgets.includes("summary") && (
        <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div style={{ padding: "13px 17px", borderBottom: "1px solid var(--app-surface-2)" }}>
            <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Category summary</h3>
          </div>
          {filteredCategories.length === 0 ? (
            <div className="text-center" style={{ padding: "52px 18px" }}>
              <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>We need about a month of sales before profit figures mean anything</div>
              <div className="mt-1.5 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Nothing matches these filters.</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: 900 }}>
                <thead>
                  <tr style={{ background: "var(--app-surface-2)" }}>
                    <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Category</th>
                    <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Revenue</th>
                    <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Cost of goods</th>
                    <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Gross profit</th>
                    <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Expenses</th>
                    <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Net profit</th>
                    <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Margin</th>
                    <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCategories.map((c) => (
                    <tr key={c.category} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                      <td style={{ padding: "12px 17px" }}>
                        <span className="flex items-center gap-[9px]">
                          <span className="h-2 w-2 rounded-[2px]" style={{ background: marginColor(c.margin) }} />
                          <span className="text-[12.5px] font-bold" style={{ color: "#0E8442" }}>{c.category}</span>
                        </span>
                      </td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-faint)", textAlign: "right" }}>{formatCurrency(c.revenue, currency)}</td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-faint)", textAlign: "right" }}>{formatCurrency(c.cost, currency)}</td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-faint)", textAlign: "right" }}>{formatCurrency(c.grossProfit, currency)}</td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "#B54708", textAlign: "right" }}>{formatCurrency(c.allocatedExpenses, currency)}</td>
                      <td style={{ padding: 12, fontSize: 12.5, fontWeight: 800, color: "var(--app-text)", textAlign: "right" }}>{formatCurrency(c.netProfit, currency)}</td>
                      <td style={{ padding: 12, textAlign: "right" }}>
                        <span className="rounded-full text-[11px] font-extrabold" style={{ padding: "3px 9px", background: `${marginColor(c.margin)}1A`, color: marginColor(c.margin) }}>{c.margin.toFixed(1)}%</span>
                      </td>
                      <td style={{ padding: "12px 17px", textAlign: "right" }}>
                        <button
                          type="button"
                          onClick={() => setDrawerCategory(c)}
                          className="rounded-[9px] text-[11.5px] font-bold"
                          style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", padding: "8px 12px", minHeight: 40 }}
                        >
                          Drill down
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="m-0 text-[11px]" style={{ padding: "10px 17px", borderTop: "1px solid var(--app-surface-2)", color: "var(--app-text-disabled)" }}>
            Expenses/Net profit per category split your real overhead total proportionally by revenue share — overhead has no per-category tracking in this data.
          </p>
        </div>
      )}

      {drawerCategory && <CategoryDrawer category={drawerCategory} currency={currency} branchId={branchId} onClose={() => setDrawerCategory(null)} />}
      {customiseOpen && (
        <CustomiseViewDrawer
          widgets={widgets}
          compare={compare}
          onToggleCompare={() => setCompare((v) => !v)}
          onSave={saveWidgets}
          onClose={() => setCustomiseOpen(false)}
        />
      )}
    </main>
  );
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function CustomiseViewDrawer({
  widgets,
  compare,
  onToggleCompare,
  onSave,
  onClose,
}: {
  widgets: WidgetKey[];
  compare: boolean;
  onToggleCompare: () => void;
  onSave: (next: WidgetKey[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<WidgetKey[]>(widgets);

  return (
    <SideDrawer
      title="Customise View"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={() => setDraft([...WIDGET_KEYS])} className="rounded-[11px] px-4 py-3 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Reset</button>
          <button
            type="button"
            onClick={() => { onSave(draft); onClose(); }}
            className="flex-1 rounded-[11px] py-3 text-[13px] font-extrabold text-white"
            style={{ background: "var(--app-primary)" }}
          >
            Save Layout
          </button>
        </>
      }
    >
      <p className="m-0 text-[12.5px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>Choose which cards and charts appear on your Profit Overview.</p>
      <div className="flex flex-col gap-2">
        {WIDGET_KEYS.map((key) => (
          <label key={key} className="flex items-center gap-2.5 rounded-[11px] p-[11px]" style={{ border: "1px solid var(--app-border)" }}>
            <span className="flex-1 text-[12.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{WIDGET_LABEL[key]}</span>
            <input
              type="checkbox"
              aria-label={`Show ${WIDGET_LABEL[key]}`}
              checked={draft.includes(key)}
              onChange={(e) => setDraft((d) => (e.target.checked ? [...d, key] : d.filter((k) => k !== key)))}
              className="h-4 w-4"
              style={{ accentColor: "#12A150" }}
            />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3 rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}>
        <span className="flex-1 text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>Show comparison to previous period</span>
        <button type="button" role="switch" aria-checked={compare} aria-label="Show comparison" onClick={onToggleCompare} className="relative rounded-full" style={{ width: 40, height: 22, border: 0, background: compare ? "#12A150" : "#D5DCE4" }}>
          <span className="absolute rounded-full bg-white" style={{ top: 2, width: 18, height: 18, left: compare ? 20 : 2 }} />
        </button>
      </div>
    </SideDrawer>
  );
}

function CategoryDrawer({ category, currency, branchId, onClose }: { category: PnlCategoryRow; currency: string; branchId: string; onClose: () => void }) {
  const { data, isPending } = useQuery({ queryKey: ["profit-products", 30, branchId], queryFn: () => fetchProfitByProduct(30, branchId) });
  const products = (data?.products ?? []).filter((p) => p.category === category.category);

  return (
    <SideDrawer title={category.category} onClose={onClose} footer={<button type="button" onClick={onClose} className="w-full rounded-[11px] py-3 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Close</button>}>
      <div className="grid grid-cols-2 gap-[10px]">
        <div className="rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}>
          <div className="text-[11.5px] font-bold" style={{ color: "var(--app-text-faint)" }}>Revenue</div>
          <div className="mt-1 text-[17px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(category.revenue, currency)}</div>
        </div>
        <div className="rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}>
          <div className="text-[11.5px] font-bold" style={{ color: "var(--app-text-faint)" }}>Cost of goods</div>
          <div className="mt-1 text-[17px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(category.cost, currency)}</div>
        </div>
        <div className="rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}>
          <div className="text-[11.5px] font-bold" style={{ color: "var(--app-text-faint)" }}>Gross profit</div>
          <div className="mt-1 text-[17px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(category.grossProfit, currency)}</div>
        </div>
        <div className="rounded-[12px] p-3" style={{ border: "1.5px solid #BFE7CF", background: "#F7FCF9" }}>
          <div className="text-[11.5px] font-bold" style={{ color: "#0E8442" }}>Net profit</div>
          <div className="mt-1 text-[17px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(category.netProfit, currency)}</div>
        </div>
      </div>
      <div className="flex justify-between border-t py-2" style={{ borderColor: "var(--app-surface-2)" }}>
        <span className="text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>Expenses allocated</span>
        <span className="text-[12.5px] font-bold" style={{ color: "#B54708" }}>{formatCurrency(category.allocatedExpenses, currency)}</span>
      </div>
      <div className="flex justify-between border-b py-2" style={{ borderColor: "var(--app-surface-2)" }}>
        <span className="text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>Net margin</span>
        <span className="text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>{category.margin.toFixed(1)}%</span>
      </div>
      <p className="m-0 text-[11px]" style={{ color: "var(--app-text-disabled)" }}>Expenses allocated is your real overhead total split proportionally by this category&apos;s revenue share, not a tracked figure.</p>

      <div>
        <div className="mb-2 text-[11px] font-extrabold uppercase tracking-[.4px]" style={{ color: "var(--app-text-disabled)" }}>Products in this category — last 30 days</div>
        {isPending ? (
          <div className="text-[12px]" style={{ color: "var(--app-text-disabled)" }}>Loading…</div>
        ) : (
          <div className="flex flex-col gap-2">
            {products.length === 0 ? (
              <p className="m-0 text-[12px]" style={{ color: "var(--app-text-disabled)" }}>No product-level sales in the last 30 days.</p>
            ) : (
              products.map((p) => (
                <div key={p.productId} className="flex items-center gap-2.5 rounded-[11px] p-2.5" style={{ border: "1px solid var(--app-border)" }}>
                  <span className="min-w-0 flex-1 truncate text-[12px] font-bold" style={{ color: "var(--app-text)" }}>{p.name}</span>
                  <span className="text-[11.5px] font-extrabold" style={{ color: marginColor(p.margin) }}>{p.margin.toFixed(1)}%</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      <Link href="/profit/product-profitability" className="text-[12px] font-bold" style={{ color: "var(--app-primary)" }}>
        Open Product Profitability <ChevronRight className="inline h-3 w-3" aria-hidden />
      </Link>
    </SideDrawer>
  );
}
