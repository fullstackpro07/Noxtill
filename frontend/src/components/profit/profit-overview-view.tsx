"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SideDrawer } from "@/components/shared/side-drawer";
import {
  fetchFinancialAgentRuns,
  fetchPnl,
  fetchProfitByProduct,
  fetchXeroOpenItems,
  runFinancialAgent,
  type FinancialAgentRun,
  type PnlCategoryRow,
  type PnlPeriod,
} from "@/lib/profit-api";
import { fetchBranches } from "@/lib/branches-api";
import { formatCurrency } from "@/lib/format";
import { useSession } from "@/lib/session";
import { ApiError } from "@/lib/api-client";
import { XeroBankTransactionStatusPanel } from "./xero-bank-transaction-status-panel";
import { toast } from "@/lib/toast";
import { SpecialistAgentUsage } from "@/components/agents/specialist-agent-usage";
import { FinanceBudgetsPanel } from "@/components/profit/finance-budgets-panel";

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

function XeroOpenItemsPanel({ branchId }: { branchId: string }) {
  const session = useSession();
  const query = useQuery({
    queryKey: ["finance-xero-open-items", session.business.id, branchId],
    queryFn: () => fetchXeroOpenItems(branchId),
    enabled: false,
  });
  const review = query.data;

  return (
    <section className="rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 17 }} aria-label="Xero open items">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Xero open invoices and bills</h2>
          <p className="mb-0 mt-1 text-[12px]" style={{ color: "var(--app-text-faint)" }}>
            Read-only provider check. It does not run AI or create a saved Finance Agent review.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/integrations" className="rounded-[9px] px-3 py-2 text-[11px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
            Integrations
          </Link>
          <button
            type="button"
            onClick={() => { void query.refetch(); }}
            disabled={query.isFetching}
            className="rounded-[11px] px-4 py-2.5 text-[12px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--app-primary)" }}
          >
            {query.isFetching ? "Checking…" : review ? "Refresh Xero" : "Check Xero"}
          </button>
        </div>
      </div>

      {query.isError ? (
        <p role="alert" className="mb-0 mt-3 text-[12px]" style={{ color: "var(--app-text-muted)" }}>
          {query.error instanceof ApiError ? query.error.message : "Xero could not be checked. Try again."}
        </p>
      ) : !review ? (
        <p className="mb-0 mt-3 text-[12px]" style={{ color: "var(--app-text-disabled)" }}>
          Check for authorized invoices and bills when you want. If Xero is not connected, the page will say so without treating missing data as zero.
        </p>
      ) : review.status !== "available" ? (
        <p role="status" className="mb-0 mt-3 text-[12px]" style={{ color: "var(--app-text-muted)" }}>
          {review.unavailableReason || "Xero data is not available for this business scope."}
        </p>
      ) : (
        <div className="mt-3">
          <p className="mb-0 text-[10.5px]" style={{ color: "var(--app-text-faint)" }}>
            Fetched {review.observedAt ? new Date(review.observedAt).toLocaleString() : "time unavailable"} · due-date aging as of {review.asOfDate || "date unavailable"}.
            {review.partial ? " The page limit was reached, so totals are partial." : ""}
          </p>
          {review.currencies.length === 0 ? (
            <p role="status" className="mb-0 mt-2 text-[12px]" style={{ color: "var(--app-text-muted)" }}>Xero returned no authorized invoices or bills with an amount due.</p>
          ) : (
            <div className="mt-2 grid gap-2 lg:grid-cols-2">
              {review.currencies.map((currencyItems) => (
                <div key={currencyItems.currencyCode} className="rounded-[10px] p-3" style={{ background: "var(--app-surface-2)" }}>
                  <div className="mb-2 text-[11px] font-extrabold" style={{ color: "var(--app-text)" }}>{currencyItems.currencyCode}</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {([ ["Receivables", currencyItems.receivables], ["Payables", currencyItems.payables] ] as const).map(([label, side]) => (
                      <div key={label} className="rounded-[8px] p-2" style={{ border: "1px solid var(--app-border)" }}>
                        <div className="text-[10px] font-semibold" style={{ color: "var(--app-text-faint)" }}>{label} · {side.invoiceCount} open</div>
                        <div className="mt-0.5 text-[13px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(Number(side.amountDue), currencyItems.currencyCode)}</div>
                        <div className="mt-1 space-y-0.5">
                          {side.buckets.filter((bucket) => bucket.invoiceCount > 0).map((bucket) => (
                            <div key={bucket.key} className="flex justify-between gap-2 text-[9.5px]" style={{ color: "var(--app-text-faint)" }}>
                              <span>{bucket.label} · {bucket.invoiceCount}</span>
                              <span>{formatCurrency(Number(bucket.amountDue), currencyItems.currencyCode)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mb-0 mt-2 text-[10px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
            External Xero invoice records only. This is not a reconciled Noxtill ledger or proof of payment; customer and supplier names are not returned.
          </p>
        </div>
      )}
    </section>
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
  const queryClient = useQueryClient();

  const month = useMemo(() => currentMonth(), []);
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ["profit-pnl", month, period, branchId], queryFn: () => fetchPnl(month, period, branchId) });
  const { data: branches = [] } = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });
  const canRunFinancialAgent = session.user.role === "owner" || session.user.role === "manager";
  const agentRunsQuery = useQuery({
    queryKey: ["financial-agent-runs", session.business.id],
    queryFn: fetchFinancialAgentRuns,
    enabled: canRunFinancialAgent,
  });
  const runAgent = useMutation({
    mutationFn: () => runFinancialAgent({ month, period, branchId }),
    onSuccess: (run) => {
      queryClient.setQueryData<FinancialAgentRun[]>(
        ["financial-agent-runs", session.business.id],
        (current = []) => [run, ...current.filter((item) => item.id !== run.id)].slice(0, 10),
      );
      queryClient.invalidateQueries({ queryKey: ["financial-agent-runs", session.business.id] });
      toast.success("Financial snapshot reviewed. No accounting entries were changed.");
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Couldn't run the financial review."),
  });

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

      <FinanceBudgetsPanel />

      <FinancialAgentPanel
        run={agentRunsQuery.data?.[0]}
        businessName={session.business.name}
        loading={agentRunsQuery.isPending}
        error={agentRunsQuery.isError}
        canRun={canRunFinancialAgent}
        canSubmit={!isPending && Boolean(data) && !runAgent.isPending}
        running={runAgent.isPending}
        currency={currency}
        onRun={() => runAgent.mutate()}
      />

      <XeroOpenItemsPanel branchId={branchId} />
      <XeroBankTransactionStatusPanel branchId={branchId} />

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

function FinancialAgentPanel({
  run,
  businessName,
  loading,
  error,
  canRun,
  canSubmit,
  running,
  currency,
  onRun,
}: {
  run?: FinancialAgentRun;
  businessName: string;
  loading: boolean;
  error: boolean;
  canRun: boolean;
  canSubmit: boolean;
  running: boolean;
  currency: string;
  onRun: () => void;
}) {
  const snapshot = run?.output.snapshot;
  const recommendation = run?.recommendations[0];
  const profitEvidence = recommendation?.evidence.find(
    (item) => item.resourceType === "profit_period",
  );
  const expenseDuplicateReview = run?.output.expenseDuplicateReview;
  const expenseCategoryVariance = run?.output.expenseCategoryVariance;
  const expenseAnomalyReview = run?.output.expenseAnomalyReview;
  const periodVariance = run?.output.periodVariance;
  const cashFlowReview = run?.output.cashFlowReview;
  const creditAgingReview = run?.output.creditAgingReview;
  const xeroOpenItemsReview = run?.output.xeroOpenItemsReview;
  const xeroBankTransactionStatusReview = run?.output.xeroBankTransactionStatusReview;
  const approvedReturnReview = run?.output.approvedReturnReview;
  const budgetActualReview = run?.output.budgetActualReview;
  const periodCloseReadiness = run?.output.periodCloseReadiness;
  const bankStatementReview = run?.output.bankStatementReview;
  const financeTrialBalance = run?.output.financeTrialBalance;
  const aiSummary = run?.output.aiSummary;
  const expenseScopeCount = expenseDuplicateReview?.scopeBusinessCount ?? 1;

  return (
    <section className="rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 17 }} aria-label="Financial Intelligence Agent">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Financial Intelligence Agent</h2>
          <p className="mb-0 mt-1 text-[12px]" style={{ color: "var(--app-text-faint)" }}>
            Read-only review using this page’s Profit Analytics calculation. It does not post journals or reconcile accounts.
          </p>
        </div>
        {canRun && (
          <button
            type="button"
            onClick={onRun}
            disabled={!canSubmit}
            className="rounded-[11px] px-4 py-2.5 text-[12px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--app-primary)" }}
          >
            {running ? "Reviewing…" : "Run review"}
          </button>
        )}
      </div>

      {loading ? (
        <p className="mb-0 mt-3 text-[12px]" style={{ color: "var(--app-text-disabled)" }}>Loading saved reviews…</p>
      ) : error ? (
        <p className="mb-0 mt-3 text-[12px]" style={{ color: "var(--app-text-disabled)" }}>Saved reviews are temporarily unavailable. The Profit Analytics figures above are unaffected.</p>
      ) : !run ? (
        <p className="mb-0 mt-3 text-[12px]" style={{ color: "var(--app-text-disabled)" }}>
          No saved financial-agent review yet. {canRun ? "Run a review to save the current period and branch scope with its source and assumptions." : "An owner or manager can run a review."}
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] p-3" style={{ background: "var(--app-surface-2)" }}>
            <div>
              <div className="text-[12px] font-bold" style={{ color: "var(--app-text)" }}>{run.status === "completed" ? "Review saved" : `Run ${run.status}`}</div>
              <div className="mt-0.5 text-[11px]" style={{ color: "var(--app-text-disabled)" }}>
                {snapshot ? `${snapshot.period} · ${snapshot.month} · ${snapshot.scopeBusinessCount} business scope` : "Snapshot unavailable"} · {new Date(run.createdAt).toLocaleString()}
              </div>
            </div>
            {snapshot && (
              <div className="text-right">
                <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--app-text-disabled)" }}>Recorded net profit</div>
                <div className="text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(snapshot.netProfit, snapshot.currency || currency)}</div>
              </div>
            )}
          </div>

          {run.output.summary && <p className="m-0 text-[12px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>{run.output.summary}</p>}

          {snapshot && (
            <div className="grid gap-2 sm:grid-cols-4">
              {[
                ["Revenue", snapshot.revenue],
                ["COGS", snapshot.cogs],
                ["Recorded expenses + wastage", snapshot.totalExpenses + snapshot.wastageCost],
                ["Net profit", snapshot.netProfit],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-[10px] p-2.5" style={{ border: "1px solid var(--app-border)" }}>
                  <div className="text-[10.5px] font-semibold" style={{ color: "var(--app-text-disabled)" }}>{label}</div>
                  <div className="mt-1 text-[12px] font-bold" style={{ color: "var(--app-text-muted)" }}>{formatCurrency(Number(value), snapshot.currency || currency)}</div>
                </div>
              ))}
            </div>
          )}

          {snapshot && (
            <section className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }} aria-label="Finance Agent partial trial balance">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold" style={{ color: "var(--app-text)" }}>Partial posted-journal trial balance</div>
                  {financeTrialBalance ? (
                    <>
                      <p className="mb-0 mt-1 text-[10.5px]" style={{ color: "var(--app-text-faint)" }}>
                        As of {financeTrialBalance.asOf} · {financeTrialBalance.scopeBusinessCount} business scope · balances are kept separate by entity and currency.
                      </p>
                      {financeTrialBalance.entities.map((entity) => (
                        <div key={entity.businessId} className="mt-3 rounded-[9px] p-2.5" style={{ background: "var(--app-surface-2)" }}>
                          <div className="text-[10.5px] font-bold" style={{ color: "var(--app-text)" }}>{entity.businessName}</div>
                          {entity.currencies.length > 0 ? entity.currencies.map((currencyRow) => (
                            <div key={`${entity.businessId}:${currencyRow.currencyCode}`} className="mt-2 overflow-x-auto">
                              <div className="mb-1 flex flex-wrap justify-between gap-2 text-[10px]" style={{ color: "var(--app-text-muted)" }}>
                                <span>{currencyRow.currencyCode}</span>
                                <span>Debits {formatCurrency(Number(currencyRow.totalDebitBalances), currencyRow.currencyCode)} · Credits {formatCurrency(Number(currencyRow.totalCreditBalances), currencyRow.currencyCode)} · {currencyRow.balanced ? "balanced" : "out of balance"}</span>
                              </div>
                              <table className="w-full min-w-[560px] text-left text-[10px]">
                                <thead style={{ color: "var(--app-text-faint)" }}>
                                  <tr><th className="py-1 pr-3 font-semibold">Account</th><th className="py-1 pr-3 font-semibold">Debits</th><th className="py-1 pr-3 font-semibold">Credits</th><th className="py-1 pr-3 font-semibold">Debit balance</th><th className="py-1 font-semibold">Credit balance</th></tr>
                                </thead>
                                <tbody>
                                  {currencyRow.accounts.map((account) => (
                                    <tr key={account.accountId} className="border-t" style={{ borderColor: "var(--app-border)" }}>
                                      <td className="py-1.5 pr-3" style={{ color: "var(--app-text-muted)" }}>{account.accountCode} · {account.accountName}</td>
                                      <td className="py-1.5 pr-3" style={{ color: "var(--app-text-muted)" }}>{formatCurrency(Number(account.debits), currencyRow.currencyCode)}</td>
                                      <td className="py-1.5 pr-3" style={{ color: "var(--app-text-muted)" }}>{formatCurrency(Number(account.credits), currencyRow.currencyCode)}</td>
                                      <td className="py-1.5 pr-3" style={{ color: "var(--app-text-muted)" }}>{formatCurrency(Number(account.debitBalance), currencyRow.currencyCode)}</td>
                                      <td className="py-1.5" style={{ color: "var(--app-text-muted)" }}>{formatCurrency(Number(account.creditBalance), currencyRow.currencyCode)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )) : (
                            <p className="mb-0 mt-2 text-[10.5px]" style={{ color: "var(--app-text-faint)" }}>No posted manual journal balances were recorded for this business by the as-of date.</p>
                          )}
                        </div>
                      ))}
                      <p className="mb-0 mt-2 text-[10px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>{financeTrialBalance.disclosure}</p>
                    </>
                  ) : (
                    <p className="mb-0 mt-1 text-[11px]" style={{ color: "var(--app-text-faint)" }}>Not included in this older saved review. Run a new review to read posted manual-journal balances.</p>
                  )}
                </div>
                <Link href="/profit/journals" className="rounded-[9px] px-3 py-2 text-[11px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Journals &amp; accounts</Link>
              </div>
            </section>
          )}

          {snapshot && (
            <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }} aria-label="Imported bank statement review">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold" style={{ color: "var(--app-text)" }}>Imported bank statement review</div>
                  {bankStatementReview?.status === "available" ? (
                    <>
                      <p className="mb-0 mt-1 text-[10.5px]" style={{ color: "var(--app-text-faint)" }}>
                        {bankStatementReview.importCount} imports · {bankStatementReview.lineCount} lines · last statement date {bankStatementReview.latestStatementDate} · recent {bankStatementReview.windowDays}-day window.
                      </p>
                      <div className="mt-2 grid gap-2 lg:grid-cols-2">
                        {bankStatementReview.currencyBreakdown.map((item) => (
                          <div key={item.currencyCode} className="rounded-[9px] p-2.5" style={{ background: "var(--app-surface-2)" }}>
                            <div className="text-[10px] font-bold" style={{ color: "var(--app-text-faint)" }}>{item.currencyCode}</div>
                            <div className="mt-1 grid gap-2 sm:grid-cols-2">
                              <div>
                                <div className="text-[10px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Human accepted · {item.matchedCount} lines</div>
                                <div className="text-[12px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(Number(item.humanAcceptedSignedAmount), item.currencyCode)}</div>
                              </div>
                              <div>
                                <div className="text-[10px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Awaiting review · {item.unmatchedCount} · no match {item.noMatchCount}</div>
                                <div className="text-[12px] font-extrabold" style={{ color: "var(--app-text)" }}>Imported signed total {formatCurrency(Number(item.importedSignedAmount), item.currencyCode)}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="mb-0 mt-2 text-[10px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>{bankStatementReview.calculation}</p>
                    </>
                  ) : (
                    <p className="mb-0 mt-1 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
                      {bankStatementReview?.unavailableReason || "Not included in this older saved review. No statement lines are counted as reconciled."}
                    </p>
                  )}
                </div>
                <Link href="/profit/reconciliation" className="rounded-[9px] px-3 py-2 text-[11px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Review statements</Link>
              </div>
            </div>
          )}

          {snapshot && (
            <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold" style={{ color: "var(--app-text)" }}>Approved budget vs recorded expenses</div>
                  {budgetActualReview?.status === "available" ? (
                    <>
                      <p className="mb-0 mt-1 text-[10.5px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
                        {budgetActualReview.month} · {budgetActualReview.scopeBusinessCount} business scope · latest approved budget version compared with expenses recorded in the same category and month.
                      </p>
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full min-w-[560px] text-left text-[10.5px]">
                          <thead style={{ color: "var(--app-text-faint)" }}>
                            <tr><th className="pb-1 pr-3 font-semibold">Business · category</th><th className="pb-1 pr-3 font-semibold">Budget</th><th className="pb-1 pr-3 font-semibold">Actual</th><th className="pb-1 font-semibold">Variance</th></tr>
                          </thead>
                          <tbody>
                            {budgetActualReview.lines.map((line) => (
                              <tr key={`${line.businessName}:${line.category}`} className="border-t" style={{ borderColor: "var(--app-border)" }}>
                                <td className="py-1.5 pr-3" style={{ color: "var(--app-text-muted)" }}>{line.businessName} · {line.category || "blank category"}</td>
                                <td className="py-1.5 pr-3" style={{ color: "var(--app-text-muted)" }}>{line.approvedAmount === null ? "Not budgeted" : formatCurrency(Number(line.approvedAmount), snapshot.currency || currency)}</td>
                                <td className="py-1.5 pr-3" style={{ color: "var(--app-text-muted)" }}>{formatCurrency(Number(line.actualAmount), snapshot.currency || currency)}</td>
                                <td className="py-1.5 font-semibold" style={{ color: Number(line.variance ?? 0) > 0 ? "#B54708" : "var(--app-text-muted)" }}>{line.variance === null ? "Not available" : `${Number(line.variance) > 0 ? "Over" : "Under / at"} ${formatCurrency(Math.abs(Number(line.variance)), snapshot.currency || currency)}`}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <p className="mb-0 mt-1 text-[11px]" style={{ color: "var(--app-text-faint)" }}>No approved native budget exists for this month and business scope. Actual expenses are not treated as a target.</p>
                  )}
                  <p className="mb-0 mt-1 text-[10px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>{budgetActualReview?.calculation || "This older saved review predates native budget tracking."}</p>
                </div>
                <Link href="#finance-budgets" className="rounded-[9px] px-3 py-2 text-[11px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Manage budgets</Link>
              </div>
            </div>
          )}

          {snapshot && (
            <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }}>
              <div className="text-[11px] font-bold" style={{ color: "var(--app-text)" }}>Xero bank transaction flags</div>
              {xeroBankTransactionStatusReview?.status === "available" ? (
                <>
                  <p className="mb-0 mt-1 text-[10.5px]" style={{ color: "var(--app-text-faint)" }}>
                    {xeroBankTransactionStatusReview.fromDate} to {xeroBankTransactionStatusReview.toDate} · Xero data only.
                    {xeroBankTransactionStatusReview.partial ? " The page limit was reached, so the result is partial." : ""}
                  </p>
                  {xeroBankTransactionStatusReview.currencies.length > 0 ? (
                    <div className="mt-2 grid gap-2 lg:grid-cols-2">
                      {xeroBankTransactionStatusReview.currencies.map((item) => (
                        <div key={item.currencyCode} className="rounded-[9px] p-2.5" style={{ background: "var(--app-surface-2)" }}>
                          <div className="text-[10px] font-bold" style={{ color: "var(--app-text-faint)" }}>{item.currencyCode}</div>
                          <div className="mt-1 grid gap-2 sm:grid-cols-2">
                            {([["Xero marked reconciled", item.reconciled], ["Xero marked unreconciled", item.unreconciled]] as const).map(([label, side]) => (
                              <div key={label}>
                                <div className="text-[10px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{label} · {side.transactionCount}</div>
                                <div className="text-[12px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(Number(side.amount), item.currencyCode)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mb-0 mt-2 text-[11px]" style={{ color: "var(--app-text-faint)" }}>Xero returned no authorized bank transactions in this date range.</p>
                  )}
                  <p className="mb-0 mt-2 text-[10px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
                    This reports Xero&rsquo;s IsReconciled flags only. No bank statement lines are read, and no Noxtill ledger matches are created.
                  </p>
                </>
              ) : (
                <p className="mb-0 mt-1 text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>
                  {xeroBankTransactionStatusReview?.unavailableReason || "Not available in this saved review. Check the Xero connection and bank transaction read access."}
                </p>
              )}
            </div>
          )}

          {snapshot && (
            <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }} aria-label="Period close readiness">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold" style={{ color: "var(--app-text)" }}>Period close source-record readiness</div>
                  {periodCloseReadiness ? (
                    <>
                      <p className="mb-0 mt-1 text-[10.5px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
                        {periodCloseReadiness.month} · {periodCloseReadiness.scope} · generated {new Date(periodCloseReadiness.generatedAt).toLocaleString()}. This is partial preparation, not a reconciled or certified accounting close.
                      </p>
                      <div className="mt-2 grid gap-2 lg:grid-cols-2">
                        {periodCloseReadiness.businesses.map((business) => (
                          <div key={business.businessId} className="rounded-[9px] p-2.5" style={{ background: "var(--app-surface-2)" }}>
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <span className="text-[10.5px] font-bold" style={{ color: "var(--app-text)" }}>{business.businessName}</span>
                              <span className="text-[10px] font-semibold" style={{ color: "var(--app-text-faint)" }}>{business.currency}</span>
                            </div>
                            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                              <div className="rounded-[7px] p-2" style={{ border: "1px solid var(--app-border)" }}>
                                <div className="text-[9.5px] font-semibold" style={{ color: "var(--app-text-faint)" }}>Sales · recorded orders</div>
                                <div className="mt-0.5 text-[10.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>
                                  {business.sales.completedOrderCount} completed / {business.sales.orderCount} total · {formatCurrency(Number(business.sales.completedOrderTotal), business.currency)}
                                </div>
                                <div className="mt-0.5 text-[9px]" style={{ color: "var(--app-text-faint)" }}>{business.sales.openOrderCount} open · {business.sales.cancelledOrderCount} cancelled</div>
                              </div>
                              <div className="rounded-[7px] p-2" style={{ border: "1px solid var(--app-border)" }}>
                                <div className="text-[9.5px] font-semibold" style={{ color: "var(--app-text-faint)" }}>Expenses · recorded</div>
                                <div className="mt-0.5 text-[10.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>
                                  {business.expenses.count} · {formatCurrency(Number(business.expenses.recordedTotal), business.currency)}
                                </div>
                                <div className="mt-0.5 text-[9px]" style={{ color: "var(--app-text-faint)" }}>
                                  {business.expenses.withoutAttachedReceiptCount} without attached receipt · {formatCurrency(Number(business.expenses.withoutAttachedReceiptTotal), business.currency)}
                                </div>
                              </div>
                              <div className="rounded-[7px] p-2" style={{ border: "1px solid var(--app-border)" }}>
                                <div className="text-[9.5px] font-semibold" style={{ color: "var(--app-text-faint)" }}>Pending returns</div>
                                <div className="mt-0.5 text-[10.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>
                                  {business.pendingReturns.count} · {formatCurrency(Number(business.pendingReturns.refundAmount), business.currency)}
                                </div>
                              </div>
                              <div className="rounded-[7px] p-2" style={{ border: "1px solid var(--app-border)" }}>
                                <div className="text-[9.5px] font-semibold" style={{ color: "var(--app-text-faint)" }}>Noxtill manual journals</div>
                                <div className="mt-0.5 text-[10.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>
                                  {business.manualJournals.balancedPostedCount}/{business.manualJournals.postedCount} posted balanced · {business.manualJournals.unbalancedPostedCount} unbalanced · {business.manualJournals.unresolvedCount} unresolved
                                </div>
                                <div className="mt-0.5 text-[9px]" style={{ color: "var(--app-text-faint)" }}>
                                  Posting lock: {business.manualJournals.postingLocked ? `locked${business.manualJournals.lockReason ? ` · ${business.manualJournals.lockReason}` : ""}` : "not locked"}
                                </div>
                              </div>
                              <div className="rounded-[7px] p-2 sm:col-span-2" style={{ border: "1px solid var(--app-border)" }}>
                                <div className="text-[9.5px] font-semibold" style={{ color: "var(--app-text-faint)" }}>Xero sync evidence</div>
                                <div className="mt-0.5 text-[10.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>
                                  {business.xeroSync.status === "connected" ? `Connected · ${business.xeroSync.unsyncedOrderCount ?? "Not available"} unsynced orders` : "Not connected"}
                                </div>
                                {business.xeroSync.lastSyncAt && <div className="mt-0.5 text-[9px]" style={{ color: "var(--app-text-faint)" }}>Last sync {new Date(business.xeroSync.lastSyncAt).toLocaleString()}</div>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="mb-0 mt-2 text-[10px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
                        {periodCloseReadiness.note} {periodCloseReadiness.unavailable.map((item) => `${item.label}: Not available`).join(" · ")}
                      </p>
                    </>
                  ) : (
                    <p className="mb-0 mt-1 text-[11px]" style={{ color: "var(--app-text-faint)" }}>Not included in this saved review. Run a new review to check source-record period readiness.</p>
                  )}
                </div>
                <Link href={periodCloseReadiness ? `/profit/period-close?month=${encodeURIComponent(periodCloseReadiness.month)}` : "/profit/period-close"} className="rounded-[9px] px-3 py-2 text-[11px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
                  Open Period Close
                </Link>
              </div>
            </div>
          )}

          {snapshot && (
            <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }} aria-label="Expense anomaly review">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold" style={{ color: "var(--app-text)" }}>Unusual expense patterns · review cues</div>
                  {expenseAnomalyReview ? (
                    <>
                      <p className="mb-0 mt-1 text-[10.5px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
                        {expenseAnomalyReview.status === "available"
                          ? `${expenseAnomalyReview.candidateCount} category pattern(s) crossed the comparison rule for ${expenseAnomalyReview.selectedMonth}.`
                          : `Not enough recorded monthly history to evaluate categories for ${expenseAnomalyReview.selectedMonth}.`}
                        {expenseAnomalyReview.insufficientHistoryCategoryCount > 0
                          ? ` ${expenseAnomalyReview.insufficientHistoryCategoryCount} current category group(s) lacked four observed baseline months and were not scored.`
                          : ""}
                      </p>
                      {expenseAnomalyReview.candidates.length > 0 ? (
                        <div className="mt-2 overflow-x-auto">
                          <table className="w-full min-w-[820px] text-left text-[10.5px]">
                            <thead style={{ color: "var(--app-text-faint)" }}>
                              <tr>
                                <th className="pb-1 pr-3 font-semibold">Business · category</th>
                                <th className="pb-1 pr-3 font-semibold">Recorded</th>
                                <th className="pb-1 pr-3 font-semibold">Baseline median</th>
                                <th className="pb-1 pr-3 font-semibold">Review threshold</th>
                                <th className="pb-1 font-semibold">Above threshold</th>
                                <th className="pb-1 pl-3 font-semibold">Source expenses</th>
                              </tr>
                            </thead>
                            <tbody>
                              {expenseAnomalyReview.candidates.map((item) => (
                                <tr key={`${item.businessName}:${item.category}`} className="border-t" style={{ borderColor: "var(--app-border)" }}>
                                  <td className="py-1.5 pr-3 font-semibold" style={{ color: "var(--app-text-muted)" }}>{item.businessName} · {item.category || "blank category"}</td>
                                  <td className="py-1.5 pr-3" style={{ color: "var(--app-text-muted)" }}>{formatCurrency(Number(item.currentAmount), snapshot.currency || currency)}</td>
                                  <td className="py-1.5 pr-3" style={{ color: "var(--app-text-muted)" }}>{formatCurrency(Number(item.baselineMedian), snapshot.currency || currency)} · {item.observedBaselineMonths} months</td>
                                  <td className="py-1.5 pr-3" style={{ color: "var(--app-text-muted)" }}>{formatCurrency(Number(item.reviewThreshold), snapshot.currency || currency)}</td>
                                  <td className="py-1.5 font-semibold" style={{ color: "var(--app-warning-text)" }}>{formatCurrency(Number(item.amountAboveThreshold), snapshot.currency || currency)}</td>
                                  <td className="py-1.5 pl-3">
                                    {item.businessName === businessName && item.category ? (
                                      <Link
                                        href={`/expenses?month=${encodeURIComponent(expenseAnomalyReview.selectedMonth)}&category=${encodeURIComponent(item.category)}`}
                                        className="font-bold"
                                        style={{ color: "var(--app-primary)" }}
                                      >
                                        Review expenses
                                      </Link>
                                    ) : item.category ? (
                                      <span style={{ color: "var(--app-text-faint)" }}>Switch to this business to review</span>
                                    ) : (
                                      <span style={{ color: "var(--app-text-faint)" }}>Blank category · open Expenses</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="mb-0 mt-2 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
                          {expenseAnomalyReview.status === "available"
                            ? "No eligible category crossed this review rule. That does not prove expenses are error-free."
                            : "No anomaly conclusion is available because the baseline is too sparse."}
                        </p>
                      )}
                      {expenseAnomalyReview.omittedCandidateCount > 0 && (
                        <p className="mb-0 mt-1 text-[10px]" style={{ color: "var(--app-text-faint)" }}>Showing the 10 largest amounts above the review threshold.</p>
                      )}
                      <p className="mb-0 mt-1 text-[10px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>{expenseAnomalyReview.calculation}</p>
                    </>
                  ) : (
                    <p className="mb-0 mt-1 text-[11px]" style={{ color: "var(--app-text-faint)" }}>Not available in this saved review. Run a new review to compare expense history.</p>
                  )}
                </div>
                <Link href={expenseAnomalyReview ? `/expenses?month=${encodeURIComponent(expenseAnomalyReview.selectedMonth)}` : "/expenses"} className="rounded-[9px] px-3 py-2 text-[11px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
                  Review in Expenses
                </Link>
              </div>
            </div>
          )}

          {snapshot && (
            <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold" style={{ color: "var(--app-text)" }}>Xero open invoices and bills</div>
                  {xeroOpenItemsReview?.status === "available" ? (
                    <>
                      <p className="mb-0 mt-1 text-[10.5px]" style={{ color: "var(--app-text-faint)" }}>
                        Read from Xero on {xeroOpenItemsReview.asOfDate}. Amounts are grouped by each invoice&rsquo;s currency.
                        {xeroOpenItemsReview.partial ? " The page limit was reached, so these totals are partial." : ""}
                      </p>
                      {xeroOpenItemsReview.currencies.length > 0 ? (
                        <div className="mt-2 grid gap-2 lg:grid-cols-2">
                          {xeroOpenItemsReview.currencies.map((currencyItems) => (
                            <div key={currencyItems.currencyCode} className="rounded-[9px] p-2.5" style={{ background: "var(--app-surface-2)" }}>
                              <div className="text-[10px] font-bold" style={{ color: "var(--app-text-faint)" }}>{currencyItems.currencyCode}</div>
                              <div className="mt-1 grid gap-2 sm:grid-cols-2">
                                {([
                                  ["Receivables", currencyItems.receivables],
                                  ["Payables", currencyItems.payables],
                                ] as const).map(([label, side]) => (
                                  <div key={label}>
                                    <div className="text-[10px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{label} · {side.invoiceCount} open</div>
                                    <div className="text-[12px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(Number(side.amountDue), currencyItems.currencyCode)}</div>
                                    <div className="mt-1 space-y-0.5">
                                      {side.buckets.filter((bucket) => bucket.invoiceCount > 0).map((bucket) => (
                                        <div key={bucket.key} className="flex justify-between gap-2 text-[9.5px]" style={{ color: "var(--app-text-faint)" }}>
                                          <span>{bucket.label} · {bucket.invoiceCount}</span>
                                          <span>{formatCurrency(Number(bucket.amountDue), currencyItems.currencyCode)}</span>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="mt-2 border-t pt-1.5" style={{ borderColor: "var(--app-border)" }}>
                                      <div className="mb-1 text-[9px] font-semibold" style={{ color: "var(--app-text-faint)" }}>Upcoming invoice due dates · not confirmed cash</div>
                                      {side.upcomingDue?.some((bucket) => bucket.invoiceCount > 0) ? (
                                        <div className="space-y-0.5">
                                          {side.upcomingDue.filter((bucket) => bucket.invoiceCount > 0).map((bucket) => (
                                            <div key={bucket.key} className="flex justify-between gap-2 text-[9.5px]" style={{ color: "var(--app-text-faint)" }}>
                                              <span>{bucket.label} · {bucket.invoiceCount}</span>
                                              <span>{formatCurrency(Number(bucket.amountDue), currencyItems.currencyCode)}</span>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="text-[9.5px]" style={{ color: "var(--app-text-faint)" }}>No future due dates recorded.</div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mb-0 mt-2 text-[11px]" style={{ color: "var(--app-text-faint)" }}>Xero returned no authorized invoices or bills with an amount due.</p>
                      )}
                      <p className="mb-0 mt-2 text-[10px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
                        These are external Xero invoice records, not a reconciled Noxtill ledger or proof of payment. No customer or supplier names are copied into the Finance Agent result.
                      </p>
                    </>
                  ) : xeroOpenItemsReview?.unavailableReason ? (
                    <p className="mb-0 mt-1 text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>{xeroOpenItemsReview.unavailableReason}</p>
                  ) : (
                    <p className="mb-0 mt-1 text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>
                      Not available in this saved review. Run a new review to check the selected business&rsquo;s Xero connection.
                    </p>
                  )}
                </div>
                <Link href="/integrations" className="rounded-[9px] px-3 py-2 text-[11px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
                  Integrations
                </Link>
              </div>
            </div>
          )}

          {snapshot && (
            <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold" style={{ color: "var(--app-text)" }}>Potential exact-match expense entries</div>
                  {expenseDuplicateReview ? (
                    <>
                      <p className="mb-0 mt-1 text-[11.5px]" style={{ color: "var(--app-text-muted)" }}>
                        {expenseDuplicateReview.candidateGroups} candidate groups · {expenseDuplicateReview.additionalEntries} additional entries · {formatCurrency(Number(expenseDuplicateReview.additionalEntryAmount), snapshot.currency || currency)} in additional-entry amounts
                      </p>
                      <p className="mb-0 mt-1 text-[10.5px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
                        Scanned {expenseDuplicateReview.calendarMonth} within the selected business scope. Candidates match business, incurred date, normalized description and category, exact amount, and recurring status. A match is not proof of a duplicate or fraud; review the source entries before taking action.
                      </p>
                      {expenseScopeCount > 1 && (
                        <p className="mb-0 mt-1 text-[10.5px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
                          This summary covers {expenseScopeCount} businesses. The Expenses link opens only the current business, so branch records must be reviewed in their own business context.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mb-0 mt-1 text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>
                      Not available in this saved review. Run a new review to check the selected calendar month.
                    </p>
                  )}
                </div>
                <Link
                  href={expenseDuplicateReview?.calendarMonth ? `/expenses?month=${encodeURIComponent(expenseDuplicateReview.calendarMonth)}${expenseScopeCount === 1 ? "&review=exact-match" : ""}` : "/expenses"}
                  className="rounded-[9px] px-3 py-2 text-[11px] font-bold"
                  style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}
                >
                  {expenseScopeCount === 1 ? "Review in Expenses" : "Open current business Expenses"}
                </Link>
              </div>
            </div>
          )}

          {snapshot && (
            <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }}>
              <div className="text-[11px] font-bold" style={{ color: "var(--app-text)" }}>Month-over-month variance</div>
              {periodVariance?.status === "available" ? (
                <>
                  <p className="mb-0 mt-1 text-[10.5px]" style={{ color: "var(--app-text-faint)" }}>
                    {periodVariance.currentMonth} compared with {periodVariance.priorMonth}. Differences describe the recorded totals; they do not explain the cause.
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {([
                      ["Revenue", periodVariance.metrics.revenue],
                      ["COGS", periodVariance.metrics.cogs],
                      ["Expenses + wastage", periodVariance.metrics.expensesAndWastage],
                      ["Net profit", periodVariance.metrics.netProfit],
                    ] as const).map(([label, metric]) => (
                      <div key={label} className="rounded-[9px] p-2" style={{ background: "var(--app-surface-2)" }}>
                        <div className="text-[10px] font-semibold" style={{ color: "var(--app-text-faint)" }}>{label}</div>
                        {metric ? (
                          <>
                            <div className="mt-1 text-[10.5px]" style={{ color: "var(--app-text-muted)" }}>
                              Current {formatCurrency(metric.current, snapshot.currency || currency)} · Prior {formatCurrency(metric.prior, snapshot.currency || currency)}
                            </div>
                            <div className="mt-0.5 text-[11px] font-bold" style={{ color: "var(--app-text-muted)" }}>
                              Difference {metric.delta > 0 ? "+" : ""}{formatCurrency(metric.delta, snapshot.currency || currency)}
                            </div>
                          </>
                        ) : <div className="mt-1 text-[10.5px]" style={{ color: "var(--app-text-faint)" }}>Not available</div>}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mb-0 mt-1 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
                  {periodVariance?.unavailableReason || "Not available in this saved review. Run a new monthly review to compare calendar months."}
                </p>
              )}
            </div>
          )}

          {snapshot && (
            <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold" style={{ color: "var(--app-text)" }}>Expense category movement</div>
                  {expenseCategoryVariance ? (
                    <>
                      <p className="mb-0 mt-1 text-[10.5px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
                        Recorded expenses for {expenseCategoryVariance.currentMonth} compared with {expenseCategoryVariance.priorMonth}, grouped by business and stored category. Differences describe the records only; they do not explain why spending changed or establish an error.
                      </p>
                      {expenseCategoryVariance.categories.length > 0 ? (
                        <div className="mt-2 overflow-x-auto">
                          <table className="w-full min-w-[620px] text-left text-[10.5px]">
                            <thead style={{ color: "var(--app-text-faint)" }}>
                              <tr>
                                <th className="pb-1 pr-3 font-semibold">Business · category</th>
                                <th className="pb-1 pr-3 font-semibold">Current</th>
                                <th className="pb-1 pr-3 font-semibold">Prior</th>
                                <th className="pb-1 font-semibold">Difference</th>
                              </tr>
                            </thead>
                            <tbody>
                              {expenseCategoryVariance.categories.map((item) => (
                                <tr key={`${item.businessName}:${item.category}`} className="border-t" style={{ borderColor: "var(--app-border)" }}>
                                  <td className="py-1.5 pr-3 font-semibold" style={{ color: "var(--app-text-muted)" }}>{item.businessName} · {item.category}</td>
                                  <td className="py-1.5 pr-3" style={{ color: "var(--app-text-muted)" }}>{formatCurrency(Number(item.currentAmount), snapshot.currency || currency)}</td>
                                  <td className="py-1.5 pr-3" style={{ color: "var(--app-text-muted)" }}>{formatCurrency(Number(item.priorAmount), snapshot.currency || currency)}</td>
                                  <td className="py-1.5 font-semibold" style={{ color: "var(--app-text-muted)" }}>{Number(item.difference) > 0 ? "+" : ""}{formatCurrency(Number(item.difference), snapshot.currency || currency)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="mb-0 mt-2 text-[11px]" style={{ color: "var(--app-text-faint)" }}>No recorded expenses in either compared month.</p>
                      )}
                      {expenseCategoryVariance.omittedCategoryCount > 0 && (
                        <p className="mb-0 mt-1 text-[10px]" style={{ color: "var(--app-text-faint)" }}>
                          Showing the 10 largest absolute differences of {expenseCategoryVariance.categoryCount} business/category groups.
                        </p>
                      )}
                      <p className="mb-0 mt-1 text-[10px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>{expenseCategoryVariance.calculation}</p>
                      {expenseCategoryVariance.scopeBusinessCount > 1 && (
                        <p className="mb-0 mt-1 text-[10px]" style={{ color: "var(--app-text-faint)" }}>
                          This comparison covers {expenseCategoryVariance.scopeBusinessCount} businesses; the Expenses screen below opens only the current business.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mb-0 mt-1 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
                      Not available in this saved review. Run a new review to compare recorded expense categories.
                    </p>
                  )}
                </div>
                <Link href={expenseCategoryVariance ? `/expenses?month=${encodeURIComponent(expenseCategoryVariance.currentMonth)}` : "/expenses"} className="rounded-[9px] px-3 py-2 text-[11px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
                  {expenseCategoryVariance?.scopeBusinessCount === 1 ? "Review month in Expenses" : "Open current business Expenses"}
                </Link>
              </div>
            </div>
          )}

          {snapshot && (
            <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold" style={{ color: "var(--app-text)" }}>Cash-flow context</div>
                  {cashFlowReview?.status === "available" ? (
                    <>
                      <p className="mb-0 mt-1 text-[11.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>
                        {cashFlowReview.days}-day projected cumulative net flow: {cashFlowReview.endingRelativeNetFlow === null ? "Not available" : formatCurrency(cashFlowReview.endingRelativeNetFlow, snapshot.currency || currency)}
                      </p>
                      <p className="mb-0 mt-1 text-[10.5px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
                        Reuses the existing cash forecast: trailing recorded sales/expense averages plus scheduled recurring obligations. The projection starts at zero; it is not an account balance, and it does not include scheduled receivables/payables. A connected Xero open-invoice check appears separately below; invoice due dates are not confirmed cash.
                      </p>
                      <p className="mb-0 mt-1 text-[10.5px]" style={{ color: "var(--app-text-faint)" }}>
                        Scheduled recurring obligations in this projection: {cashFlowReview.scheduledObligationsTotal === null ? "Not available" : formatCurrency(cashFlowReview.scheduledObligationsTotal, snapshot.currency || currency)} · {cashFlowReview.negativeRelativeNetFlowDays ?? "Not available"} negative relative-flow days
                      </p>
                    </>
                  ) : cashFlowReview?.unavailableReason ? (
                    <p className="mb-0 mt-1 text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>{cashFlowReview.unavailableReason}</p>
                  ) : (
                    <p className="mb-0 mt-1 text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>
                      Not available in this saved review. Run a new review to include current forecast context.
                    </p>
                  )}
                </div>
                <Link href="/profit/cash-flow" className="rounded-[9px] px-3 py-2 text-[11px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
                  Open Cash Flow
                </Link>
              </div>
            </div>
          )}

          {snapshot && (
            <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold" style={{ color: "var(--app-text)" }}>Customer credit balance age</div>
                  {creditAgingReview?.status === "available" ? (
                    <>
                      <p className="mb-0 mt-1 text-[11.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>
                        {creditAgingReview.debtorCount} customers · {formatCurrency(Number(creditAgingReview.totalBalance), snapshot.currency || currency)} outstanding in the Credit module
                      </p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-4">
                        {creditAgingReview.buckets.map((bucket) => {
                          const label = bucket.key === "current" ? "0–29 days" : bucket.key === "thirtyPlus" ? "30–59 days" : bucket.key === "sixtyPlus" ? "60–89 days" : "90+ days";
                          return (
                            <div key={bucket.key} className="rounded-[9px] p-2" style={{ background: "var(--app-surface-2)" }}>
                              <div className="text-[10px] font-semibold" style={{ color: "var(--app-text-faint)" }}>{label} · {bucket.debtorCount}</div>
                              <div className="mt-0.5 text-[11px] font-bold" style={{ color: "var(--app-text-muted)" }}>{formatCurrency(Number(bucket.balance), snapshot.currency || currency)}</div>
                            </div>
                          );
                        })}
                      </div>
                      <p className="mb-0 mt-2 text-[10.5px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
                        Uses the Credit module’s balance-aging view. Age is since the balance last reached zero or the first credit entry; it is not invoice due-date aging or a finance-owned A/R ledger.
                      </p>
                    </>
                  ) : creditAgingReview?.unavailableReason ? (
                    <p className="mb-0 mt-1 text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>{creditAgingReview.unavailableReason}</p>
                  ) : (
                    <p className="mb-0 mt-1 text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>
                      Not available in this saved review. Run a new review to include the current business’s customer-credit summary.
                    </p>
                  )}
                </div>
                <Link href="/credit" className="rounded-[9px] px-3 py-2 text-[11px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
                  Review in Credit
                </Link>
              </div>
            </div>
          )}

          {snapshot && (
            <div className="rounded-[11px] p-3" style={{ border: "1px solid var(--app-border)" }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold" style={{ color: "var(--app-text)" }}>Approved return records</div>
                  {approvedReturnReview ? (
                    <>
                      <p className="mb-0 mt-1 text-[11.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>
                        {approvedReturnReview.approvedCount} approved {approvedReturnReview.approvedCount === 1 ? "return" : "returns"} · {formatCurrency(Number(approvedReturnReview.refundAmountTotal), snapshot.currency || currency)} recorded for {approvedReturnReview.calendarMonth}
                      </p>
                      {approvedReturnReview.byMethod.length > 0 ? (
                        <div className="mt-2 grid gap-2 sm:grid-cols-3">
                          {approvedReturnReview.byMethod.map((item) => (
                            <div key={item.method} className="rounded-[9px] p-2" style={{ background: "var(--app-surface-2)" }}>
                              <div className="text-[10px] font-semibold capitalize" style={{ color: "var(--app-text-faint)" }}>{item.method.replaceAll("_", " ")} · {item.count}</div>
                              <div className="mt-0.5 text-[11px] font-bold" style={{ color: "var(--app-text-muted)" }}>{formatCurrency(Number(item.amount), snapshot.currency || currency)}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mb-0 mt-2 text-[11px]" style={{ color: "var(--app-text-faint)" }}>No approved return records in this calendar month.</p>
                      )}
                      <p className="mb-0 mt-2 text-[10.5px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
                        Uses approved Return rows and `updatedAt` because a separate approval timestamp is not stored. These amounts are separate from Profit Analytics and are not deducted from P&L. Approval alone does not prove a provider settlement or cash payout.
                      </p>
                      {approvedReturnReview.scopeBusinessCount > 1 && (
                        <p className="mb-0 mt-1 text-[10px]" style={{ color: "var(--app-text-faint)" }}>
                          This review covers {approvedReturnReview.scopeBusinessCount} businesses in the selected branch scope.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mb-0 mt-1 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
                      Not available in this saved review. Run a new review to inspect approved return records for the selected month.
                    </p>
                  )}
                </div>
                <Link href="/orders" className="rounded-[9px] px-3 py-2 text-[11px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
                  Open Orders & Returns
                </Link>
              </div>
            </div>
          )}

          {aiSummary && (
            <div className="rounded-[11px] p-3" style={{ background: "var(--app-surface-2)", borderLeft: "3px solid var(--app-primary)" }}>
              <div className="text-[11px] font-bold" style={{ color: "var(--app-text)" }}>AI explanation · {aiSummary.status.replaceAll("_", " ")}</div>
              <p className="mb-0 mt-1 text-[12px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
                {aiSummary.text || aiSummary.message || "Not available"}
              </p>
            </div>
          )}
          <SpecialistAgentUsage calls={run?.aiCallLogs} />

          {recommendation && (
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-[11px] font-bold" style={{ color: "var(--app-text)" }}>Calculation & assumptions</div>
                <p className="mb-1 mt-1 text-[11.5px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>{profitEvidence?.calculation || "Calculation not available"}</p>
                <ul className="m-0 list-disc pl-4 text-[11px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
                  {recommendation.assumptions.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <div>
                <div className="text-[11px] font-bold" style={{ color: "var(--app-text)" }}>Source coverage</div>
                <p className="mb-1 mt-1 text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>
                  {profitEvidence?.sourceType || "Not available"} · {profitEvidence?.fieldRefs.join(", ") || "No source fields"}
                </p>
                <ul className="m-0 list-disc pl-4 text-[11px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
                  {recommendation.missingData.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
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
