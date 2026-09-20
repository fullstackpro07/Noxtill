"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Lightbulb, TriangleAlert } from "lucide-react";
import { fetchRollupDashboard, fetchRollupCompare, fetchBranches } from "@/lib/branches-api";
import { formatCurrency } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useBranchesScope } from "@/components/branches/branches-context";
import { BR, KpiTile, KpiSkeleton, th, type Tone } from "@/components/branches/branches-ui";
import { ErrorBanner } from "@/components/shared/error-states";

const BRANCH_COLORS = ["#12A150", "#2563EB", "#F59E0B", "#DC2626", "#6D28D9", "#0891B2"];

function weeksForPeriod(days: number): number {
  return Math.max(4, Math.min(26, Math.ceil(days / 7) + 3));
}

export function PerformanceView() {
  const session = useSession();
  const currency = session.business.currency;
  const { scopeBranchId, periodDays } = useBranchesScope();
  const [compareA, setCompareA] = useState<string | null>(null);
  const [compareB, setCompareB] = useState<string | null>(null);

  const { data: rollup, isPending, isError, refetch } = useQuery({ queryKey: ["rollup-dashboard", periodDays], queryFn: () => fetchRollupDashboard(periodDays) });
  const { data: compare = [] } = useQuery({ queryKey: ["rollup-compare", weeksForPeriod(periodDays)], queryFn: () => fetchRollupCompare(weeksForPeriod(periodDays)) });
  const { data: branchMeta = [] } = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });

  const branches = (rollup?.branches ?? []).filter((b) => !scopeBranchId || b.businessId === scopeBranchId);
  const trading = branches.filter((b) => b.revenue > 0 || b.ordersCount > 0);
  const totalRevenue = trading.reduce((a, b) => a + b.revenue, 0);
  const totalProfit = trading.reduce((a, b) => a + b.grossProfit, 0);
  const totalOrders = trading.reduce((a, b) => a + b.ordersCount, 0);
  const totalCustomers = trading.reduce((a, b) => a + b.customerCount, 0);
  const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  const compareByBranch = new Map(compare.map((c) => [c.businessId, c]));
  const growthByBranch = trading.map((b) => {
    const weeks = compareByBranch.get(b.businessId)?.weeks ?? [];
    if (weeks.length < 2) return { businessId: b.businessId, name: b.name, pct: null as number | null };
    const last = weeks[weeks.length - 1];
    const prev = weeks[weeks.length - 2];
    return { businessId: b.businessId, name: b.name, pct: prev.revenue > 0 ? ((last.revenue - prev.revenue) / prev.revenue) * 100 : null };
  });
  const fastestGrowing = [...growthByBranch].filter((g) => g.pct != null).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))[0];

  const compareBranches = compare.filter((c) => !scopeBranchId || c.businessId === scopeBranchId);
  const allWeeks = compareBranches[0]?.weeks.map((w) => w.weekStart) ?? [];
  const maxRevenue = Math.max(...compareBranches.flatMap((b) => b.weeks.map((w) => w.revenue)), 1);

  const a = compareA ? branches.find((b) => b.businessId === compareA) : trading[0];
  const b = compareB ? branches.find((b2) => b2.businessId === compareB) : trading[1];
  const aMargin = a && a.revenue > 0 ? (a.grossProfit / a.revenue) * 100 : 0;
  const bMargin = b && b.revenue > 0 ? (b.grossProfit / b.revenue) * 100 : 0;

  const findings = buildFindings(trading, branchMeta);

  if (isError) {
    return <ErrorBanner title="Couldn't load branch performance" description="Check your connection and try again." onRetry={() => refetch()} />;
  }

  return (
    <main className="flex flex-col gap-[18px] px-6 pb-[30px] pt-[18px]">
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
        {isPending ? (
          <KpiSkeleton count={6} />
        ) : (
          <>
            <KpiTile label="Revenue" value={formatCurrency(totalRevenue, currency)} delta={fastestGrowing?.pct != null ? `${fastestGrowing.pct > 0 ? "+" : ""}${fastestGrowing.pct.toFixed(1)}%` : undefined} deltaDir={fastestGrowing?.pct != null ? (fastestGrowing.pct > 0 ? "up" : "down") : undefined} />
            <KpiTile label="Profit" value={formatCurrency(totalProfit, currency)} />
            <KpiTile label="Margin" value={`${margin.toFixed(1)}%`} tone={margin < 18 ? "amber" : undefined} />
            <KpiTile label="Orders" value={String(totalOrders)} />
            <KpiTile label="Customers" value={String(totalCustomers)} />
            <KpiTile label="Fastest growing" value={fastestGrowing?.name ?? "—"} delta={fastestGrowing?.pct != null ? `${fastestGrowing.pct > 0 ? "+" : ""}${fastestGrowing.pct.toFixed(1)}%` : undefined} deltaDir={fastestGrowing?.pct != null && fastestGrowing.pct > 0 ? "up" : "flat"} />
          </>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,380px),1fr))", gap: 18, alignItems: "start" }}>
        <div style={{ minWidth: 0, background: "#fff", border: `1px solid ${BR.border}`, borderRadius: 13, boxShadow: "0 1px 2px rgba(16,24,40,.05)", padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Revenue by branch over time</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {compareBranches.map((cb, i) => (
                <span key={cb.businessId} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: BR.textMuted, fontWeight: 600 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: BRANCH_COLORS[i % BRANCH_COLORS.length] }} />
                  {cb.name}
                </span>
              ))}
            </div>
          </div>
          {compareBranches.length === 0 || allWeeks.length === 0 ? (
            <div style={{ height: 190, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, color: BR.textFaint }}>No weekly data yet.</div>
          ) : (
            <>
              <svg viewBox="0 0 560 190" preserveAspectRatio="none" style={{ width: "100%", height: 190, display: "block", marginTop: 16 }}>
                {[18, 60, 102, 144, 176].map((y) => (
                  <line key={y} x1={0} y1={y} x2={560} y2={y} stroke={y === 176 ? "#E6E8EC" : "#F0F2F5"} strokeWidth={1} />
                ))}
                {compareBranches.map((cb, i) => {
                  const points = cb.weeks.map((w, wi) => ({
                    x: allWeeks.length > 1 ? (wi / (allWeeks.length - 1)) * 560 : 0,
                    y: 176 - (w.revenue / maxRevenue) * 160,
                  }));
                  return <polyline key={cb.businessId} points={points.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={BRANCH_COLORS[i % BRANCH_COLORS.length]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />;
                })}
              </svg>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: BR.textFaint, marginTop: 7 }}>
                {allWeeks.map((w, i) => (
                  <span key={w}>{i === allWeeks.length - 1 ? "Now" : `W${i + 1}`}</span>
                ))}
              </div>
            </>
          )}
          <div style={{ fontSize: 11, color: BR.textFaint, marginTop: 12, paddingTop: 12, borderTop: "1px solid #F0F2F5" }}>
            Weekly totals from real closed-order records. A branch with no trading history is excluded rather than shown as zero.
          </div>
        </div>

        <div style={{ minWidth: 0, background: "#fff", border: `1px solid ${BR.border}`, borderRadius: 13, boxShadow: "0 1px 2px rgba(16,24,40,.05)", padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Compare branches</div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <select value={a?.businessId ?? ""} onChange={(e) => setCompareA(e.target.value)} style={{ fontSize: 11.5, border: `1px solid ${BR.borderStrong}`, borderRadius: 8, padding: "4px 6px" }}>
                {trading.map((t) => (
                  <option key={t.businessId} value={t.businessId}>
                    {t.name}
                  </option>
                ))}
              </select>
              <select value={b?.businessId ?? ""} onChange={(e) => setCompareB(e.target.value)} style={{ fontSize: 11.5, border: `1px solid ${BR.borderStrong}`, borderRadius: 8, padding: "4px 6px" }}>
                {trading.map((t) => (
                  <option key={t.businessId} value={t.businessId}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {a && b ? (
            <div className="overflow-x-auto nx-scroll" style={{ marginTop: 14 }}>
              <table style={{ width: "100%", minWidth: 380, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#FAFBFC", borderBottom: `1px solid ${BR.border}` }}>
                    <th style={th("left")}>Metric</th>
                    <th style={th("right")}>{a.name}</th>
                    <th style={th("right")}>{b.name}</th>
                    <th style={th("right")}>Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "Revenue", av: a.revenue, bv: b.revenue, fmt: (n: number) => formatCurrency(n, currency) },
                    { label: "Profit", av: a.grossProfit, bv: b.grossProfit, fmt: (n: number) => formatCurrency(n, currency) },
                    { label: "Margin", av: aMargin, bv: bMargin, fmt: (n: number) => `${n.toFixed(1)}%` },
                    { label: "Orders", av: a.ordersCount, bv: b.ordersCount, fmt: (n: number) => String(n) },
                    { label: "Customers", av: a.customerCount, bv: b.customerCount, fmt: (n: number) => String(n) },
                    { label: "Credit outstanding", av: a.creditOutstanding, bv: b.creditOutstanding, fmt: (n: number) => formatCurrency(n, currency) },
                  ].map((row) => {
                    const diff = row.av - row.bv;
                    const pos = row.label === "Credit outstanding" ? diff <= 0 : diff >= 0;
                    return (
                      <tr key={row.label} style={{ borderBottom: "1px solid #F3F4F7" }}>
                        <td style={{ padding: "11px 12px 11px 18px", fontSize: 12, fontWeight: 700 }}>{row.label}</td>
                        <td style={{ padding: "11px 12px", textAlign: "right", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{row.fmt(row.av)}</td>
                        <td style={{ padding: "11px 12px", textAlign: "right", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{row.fmt(row.bv)}</td>
                        <td style={{ padding: "11px 18px 11px 12px", textAlign: "right" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", padding: "0 7px", height: 20, borderRadius: 6, fontSize: 11, fontWeight: 800, fontVariantNumeric: "tabular-nums", background: pos ? "#E8F7EE" : "#FEF3F2", color: pos ? "#0E8442" : "#B42318" }}>
                            {diff >= 0 ? "+" : ""}
                            {row.fmt(diff)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ marginTop: 14, fontSize: 12.5, color: BR.textFaint }}>Need at least two trading branches to compare.</div>
          )}
        </div>
      </div>

      {findings.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #DDD3FE", borderRadius: 13, boxShadow: "0 1px 2px rgba(16,24,40,.05)", padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 26, height: 26, borderRadius: 8, background: "#F5F3FF", color: "#6D28D9", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Lightbulb size={14} />
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 800 }}>Performance findings</div>
            <div style={{ marginLeft: "auto", fontSize: 10.5, color: BR.textFaint }}>Ranked by measured impact</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 11, marginTop: 14 }}>
            {findings.map((f, i) => (
              <div key={i} style={{ border: `1px solid ${f.tone === "red" ? "#FDD9D6" : f.tone === "amber" ? "#FDE3B3" : f.tone === "blue" ? "#C7D7FE" : "#BFE7CF"}`, borderRadius: 11, padding: 13, background: f.tone === "red" ? "#FEF3F2" : f.tone === "amber" ? "#FEF6E7" : f.tone === "blue" ? "#EEF4FF" : "#F9FEFB" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <f.Icon size={14} style={{ color: f.tone === "red" ? "#B42318" : f.tone === "amber" ? "#B54708" : f.tone === "blue" ? "#3538CD" : "#0E8442" }} />
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: f.tone === "red" ? "#B42318" : f.tone === "amber" ? "#B54708" : f.tone === "blue" ? "#3538CD" : "#0E8442" }}>{f.kind}</div>
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 8 }}>{f.title}</div>
                <div style={{ fontSize: 11, color: BR.textFaint, marginTop: 4, lineHeight: 1.45 }}>{f.meta}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

function buildFindings(
  trading: { businessId: string; name: string; revenue: number; grossProfit: number; creditOutstanding: number }[],
  branchMeta: { id: string; active: boolean }[],
): { kind: string; title: string; meta: string; tone: Tone; Icon: typeof TriangleAlert }[] {
  const out: ReturnType<typeof buildFindings> = [];
  const withMargin = trading.map((b) => ({ ...b, margin: b.revenue > 0 ? (b.grossProfit / b.revenue) * 100 : 0 }));

  const worst = [...withMargin].filter((b) => b.revenue > 0).sort((a, b) => a.margin - b.margin)[0];
  if (worst && worst.margin < 20) {
    out.push({ kind: "Decline", title: `${worst.name} margin is the lowest in the group`, meta: `${worst.margin.toFixed(1)}% margin against gross profit and revenue`, tone: "red", Icon: TrendingDown });
  }
  const best = [...withMargin].filter((b) => b.revenue > 0).sort((a, b) => b.margin - a.margin)[0];
  if (best && best.businessId !== worst?.businessId) {
    out.push({ kind: "Increase", title: `${best.name} holds the strongest margin`, meta: `${best.margin.toFixed(1)}% margin this period`, tone: "green", Icon: TrendingUp });
  }
  const highCredit = [...trading].sort((a, b) => b.creditOutstanding - a.creditOutstanding)[0];
  if (highCredit && highCredit.creditOutstanding > 0) {
    out.push({ kind: "Risk", title: `${highCredit.name} carries the most outstanding credit`, meta: "Money owed, not money collected", tone: "amber", Icon: TriangleAlert });
  }
  const notTrading = branchMeta.filter((m) => m.active && !trading.some((t) => t.businessId === m.id));
  if (notTrading.length > 0) {
    out.push({ kind: "Opportunity", title: `${notTrading.length} branch${notTrading.length === 1 ? "" : "es"} could start trading`, meta: "Complete setup to bring them into performance comparison", tone: "blue", Icon: Lightbulb });
  }
  return out;
}
