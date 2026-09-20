"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Building2, Sparkles, TrendingUp, TrendingDown, Minus, TriangleAlert, Boxes, CircleAlert } from "lucide-react";
import { fetchRollupDashboard, fetchRollupCompare, fetchBranches, type RollupBranch } from "@/lib/branches-api";
import { formatCurrency } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useBranchesScope } from "@/components/branches/branches-context";
import { computeOpenStatus } from "@/lib/branch-hours";
import { BR, KpiTile, KpiSkeleton, Chip, DetailPanel, type Tone } from "@/components/branches/branches-ui";
import { ErrorBanner } from "@/components/shared/error-states";

const RANK_METRICS = ["Revenue", "Profit", "Margin", "Orders", "Bookings"] as const;
type RankMetric = (typeof RANK_METRICS)[number];

interface Enriched extends RollupBranch {
  margin: number;
  trendPct: number | null;
  trendDir: "up" | "down" | "flat";
  isTrading: boolean;
}

function useWeeklyTrend() {
  return useQuery({ queryKey: ["rollup-compare", "8w"], queryFn: () => fetchRollupCompare(8) });
}

export function OverviewView() {
  const router = useRouter();
  const session = useSession();
  const currency = session.business.currency;
  const { scopeBranchId, periodDays, periodLabel } = useBranchesScope();
  const [rankMetric, setRankMetric] = useState<RankMetric>("Revenue");
  const [panel, setPanel] = useState<null | { kicker: string; title: string; badge?: string; badgeTone?: Tone; rows: [string, string][]; bulletsTitle: string; bullets: string[]; note: string }>(null);

  const { data: rollup, isPending, isError, refetch } = useQuery({ queryKey: ["rollup-dashboard", periodDays], queryFn: () => fetchRollupDashboard(periodDays) });
  const { data: compare } = useWeeklyTrend();
  const { data: branchMeta = [] } = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });

  const enriched: Enriched[] = useMemo(() => {
    if (!rollup) return [];
    const trendByBranch = new Map((compare ?? []).map((c) => [c.businessId, c]));
    return rollup.branches
      .filter((b) => !scopeBranchId || b.businessId === scopeBranchId)
      .map((b) => {
        const margin = b.revenue > 0 ? (b.grossProfit / b.revenue) * 100 : 0;
        const weeks = trendByBranch.get(b.businessId)?.weeks ?? [];
        let trendPct: number | null = null;
        if (weeks.length >= 2) {
          const last = weeks[weeks.length - 1];
          const prev = weeks[weeks.length - 2];
          trendPct = prev.revenue > 0 ? ((last.revenue - prev.revenue) / prev.revenue) * 100 : null;
        }
        return {
          ...b,
          margin,
          trendPct,
          trendDir: trendPct == null ? "flat" : trendPct > 0.5 ? "up" : trendPct < -0.5 ? "down" : "flat",
          isTrading: b.ordersCount > 0 || b.revenue > 0,
        };
      });
  }, [rollup, compare, scopeBranchId]);

  const trading = enriched.filter((b) => b.isTrading);
  const activeBranches = branchMeta.filter((b) => b.active);
  const openNow = branchMeta.filter((b) => b.active && computeOpenStatus(b).isOpen).length;

  if (isError) {
    return <ErrorBanner title="Couldn't load branch overview" description="Check your connection and try again." onRetry={() => refetch()} />;
  }

  const totalRevenue = trading.reduce((a, b) => a + b.revenue, 0);
  const totalProfit = trading.reduce((a, b) => a + b.grossProfit, 0);
  const totalOrders = trading.reduce((a, b) => a + b.ordersCount, 0);
  const totalCustomers = rollup?.totals.customerCount ?? 0;
  const openAlertsCount = trading.filter((b) => b.margin > 0 && b.margin < 18).length + trading.filter((b) => b.creditOutstanding > 0 && b.creditOutstanding > totalRevenue * 0.1).length;

  function openMetricPanel(label: string, value: string, meta: string) {
    setPanel({
      kicker: "Branch metric",
      title: `${label} · ${value}`,
      badge: meta,
      badgeTone: "neutral",
      rows: [
        ["Value", value],
        ["Basis", meta],
        ["Period", periodLabel],
        ["Branches included", `${trading.length} trading`],
        ["Excluded", `${enriched.length - trading.length} not yet trading`],
      ],
      bulletsTitle: "What this counts",
      bullets: [
        "Every figure is read from the module that owns it — Branches never recomputes it independently",
        "A branch that is not yet trading is excluded rather than counted as zero",
        "Customers overlap across branches and are not summed from per-branch counts",
      ],
      note: "Branches owns the branch record. Sales, stock, staff and bookings are owned elsewhere.",
    });
  }

  const insights = buildInsights(trading, branchMeta);

  const pick = (b: Enriched): number =>
    rankMetric === "Revenue" ? b.revenue : rankMetric === "Profit" ? b.grossProfit : rankMetric === "Margin" ? b.margin : rankMetric === "Orders" ? b.ordersCount : b.customerCount;
  const fmt = (b: Enriched): string =>
    rankMetric === "Revenue" ? formatCurrency(b.revenue, currency) : rankMetric === "Profit" ? formatCurrency(b.grossProfit, currency) : rankMetric === "Margin" ? `${b.margin.toFixed(1)}%` : rankMetric === "Orders" ? String(b.ordersCount) : String(b.customerCount);
  const ranked = [...trading].sort((a, b) => pick(b) - pick(a));
  const maxVal = ranked.length > 0 ? pick(ranked[0]) || 1 : 1;

  return (
    <main className="flex flex-col gap-[18px] px-6 pb-[30px] pt-[18px]">
      <ScopeBar />

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
        {isPending ? (
          <KpiSkeleton count={8} />
        ) : (
          <>
            <KpiTile label="Total branches" value={String(branchMeta.length)} meta={`${activeBranches.length} active`} onClick={() => openMetricPanel("Total branches", String(branchMeta.length), `${activeBranches.length} active`)} />
            <KpiTile label="Active" value={String(activeBranches.length)} meta={`${branchMeta.length - activeBranches.length} inactive`} onClick={() => openMetricPanel("Active", String(activeBranches.length), "Deactivated branches keep their history")} />
            <KpiTile label="Currently open" value={String(openNow)} meta={`${activeBranches.length - openNow} outside hours`} onClick={() => openMetricPanel("Currently open", String(openNow), "Computed from each branch's own hours and timezone")} />
            <KpiTile label="Revenue" value={formatCurrency(totalRevenue, currency)} meta={`${trading.length} trading branches`} onClick={() => openMetricPanel("Revenue", formatCurrency(totalRevenue, currency), `${trading.length} trading branches, ${periodLabel.toLowerCase()}`)} />
            <KpiTile label="Profit" value={formatCurrency(totalProfit, currency)} meta="attributable only" onClick={() => openMetricPanel("Profit", formatCurrency(totalProfit, currency), "Gross profit, attributable only")} />
            <KpiTile label="Orders" value={String(totalOrders)} meta="across branches" onClick={() => openMetricPanel("Orders", String(totalOrders), "Across trading branches")} />
            <KpiTile label="Customers" value={String(totalCustomers)} meta="overlap between branches" onClick={() => openMetricPanel("Customers", String(totalCustomers), "A customer seen at two branches counts once")} />
            <KpiTile label="Open alerts" value={String(openAlertsCount)} tone={openAlertsCount > 0 ? "amber" : undefined} meta="margin & credit signals" onClick={() => router.push("/branches/alerts")} />
          </>
        )}
      </div>

      {!isPending && insights.length > 0 && (
        <div style={{ background: BR.surface, border: "1px solid #DDD3FE", borderRadius: 13, boxShadow: "0 1px 2px rgba(16,24,40,.05)", padding: 17 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ width: 28, height: 28, flex: "0 0 28px", borderRadius: 8, background: "#F5F3FF", color: "#6D28D9", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Sparkles size={15} />
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 800 }}>Across your branches</div>
            <div style={{ marginLeft: "auto", fontSize: 10.5, color: BR.textFaint }}>{periodLabel} · vs last week</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 10, marginTop: 13 }}>
            {insights.map((ins, i) => (
              <div
                key={i}
                onClick={() => setPanel(ins.panel)}
                style={{
                  border: `1px solid ${ins.tone === "red" ? "#FDD9D6" : ins.tone === "amber" ? "#FDE3B3" : ins.tone === "blue" ? "#C7D7FE" : "#BFE7CF"}`,
                  borderRadius: 11,
                  padding: 12,
                  cursor: "pointer",
                  background: ins.tone === "red" ? "#FEF3F2" : ins.tone === "amber" ? "#FEF6E7" : ins.tone === "blue" ? "#EEF4FF" : "#F9FEFB",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                  <ins.Icon size={15} style={{ flexShrink: 0, marginTop: 1, color: ins.tone === "red" ? "#B42318" : ins.tone === "amber" ? "#B54708" : ins.tone === "blue" ? "#3538CD" : "#0E8442" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>{ins.title}</div>
                    <div style={{ fontSize: 10.5, color: BR.textFaint, marginTop: 3 }}>{ins.meta}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ background: BR.surface, border: `1px solid ${BR.border}`, borderRadius: 13, boxShadow: "0 1px 2px rgba(16,24,40,.05)", padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Branch ranking</div>
          <div style={{ marginLeft: "auto", display: "inline-flex", padding: 3, background: "#F1F3F6", borderRadius: 10, gap: 2 }}>
            {RANK_METRICS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setRankMetric(m)}
                style={{ height: 26, display: "flex", alignItems: "center", padding: "0 10px", borderRadius: 8, fontSize: 11.5, cursor: "pointer", fontWeight: rankMetric === m ? 700 : 600, color: rankMetric === m ? BR.text : BR.textMuted, background: rankMetric === m ? "#fff" : "transparent", boxShadow: rankMetric === m ? "0 1px 2px rgba(16,24,40,.08)" : "none", border: 0 }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 15 }}>
          {ranked.map((b, i) => (
            <div key={b.businessId} onClick={() => router.push(`/branches/profile?branch=${b.businessId}`)} style={{ cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12, marginBottom: 5, flexWrap: "wrap" }}>
                <span style={{ width: 20, height: 20, borderRadius: 6, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, flexShrink: 0, background: i === 0 ? "#E8F7EE" : "#F1F3F6", color: i === 0 ? "#0E8442" : "#475467" }}>{i + 1}</span>
                <span style={{ fontWeight: 700 }}>{b.name}</span>
                <span style={{ color: BR.textFaint }}>{b.margin.toFixed(1)}% margin</span>
                <span style={{ marginLeft: "auto", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{fmt(b)}</span>
              </div>
              <div style={{ height: 9, borderRadius: 5, background: "#F1F3F6", overflow: "hidden" }}>
                <div style={{ width: `${Math.max(4, Math.round((pick(b) / maxVal) * 100))}%`, height: "100%", borderRadius: 5, background: pick(b) < 0 ? "#DC2626" : i === 0 ? BR.primary : "#4ADE80" }} />
              </div>
            </div>
          ))}
          {ranked.length === 0 && !isPending && <div style={{ fontSize: 12.5, color: BR.textFaint }}>No trading branches yet.</div>}
        </div>
        <div style={{ fontSize: 11, color: BR.textFaint, marginTop: 14, paddingTop: 12, borderTop: "1px solid #F0F2F5" }}>
          Ranked on {rankMetric.toLowerCase()} only. Noxtill does not produce a single &ldquo;best branch&rdquo; score — switch the metric and the order changes.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,300px),1fr))", gap: 14 }}>
        {isPending
          ? Array.from({ length: 4 }, (_, i) => <div key={i} style={{ height: 150, borderRadius: 13, background: "#fff", border: `1px solid ${BR.border}` }} />)
          : enriched.map((b) => {
              const meta = branchMeta.find((m) => m.id === b.businessId);
              const openStatus = meta ? computeOpenStatus(meta) : { label: "—", isOpen: false };
              const healthTone: Tone = !b.isTrading ? "blue" : b.margin < 18 ? "red" : b.margin < 22 ? "amber" : "green";
              const healthLabel = !b.isTrading ? "Opening" : b.margin < 18 ? "At Risk" : b.margin < 22 ? "Watch" : "Healthy";
              return (
                <div
                  key={b.businessId}
                  onClick={() => router.push(`/branches/profile?branch=${b.businessId}`)}
                  style={{ background: "#fff", borderRadius: 13, padding: 16, cursor: "pointer", boxShadow: "0 1px 2px rgba(16,24,40,.04)", border: `1px solid ${healthTone === "red" ? "#FDD9D6" : healthTone === "amber" ? "#FDE3B3" : BR.border}` }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 34, height: 34, flex: "0 0 34px", borderRadius: 10, background: healthTone === "red" ? "#FEF3F2" : healthTone === "amber" ? "#FEF6E7" : healthTone === "blue" ? "#EEF4FF" : "#E8F7EE", color: healthTone === "red" ? "#B42318" : healthTone === "amber" ? "#B54708" : healthTone === "blue" ? "#3538CD" : "#0E8442", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Building2 size={17} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</div>
                      <div style={{ fontSize: 10.5, color: BR.textFaint, marginTop: 1 }}>{openStatus.label}</div>
                    </div>
                    <Chip tone={healthTone} style={{ height: 21, fontSize: 10 }}>
                      {healthLabel}
                    </Chip>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-.03em", fontVariantNumeric: "tabular-nums" }}>{b.isTrading ? formatCurrency(b.revenue, currency) : "Not trading"}</div>
                    {b.trendPct != null && (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 800, color: b.trendDir === "up" ? "#0E8442" : b.trendDir === "down" ? "#B42318" : "#475467" }}>
                        {b.trendDir === "up" ? <TrendingUp size={12} /> : b.trendDir === "down" ? <TrendingDown size={12} /> : <Minus size={12} />}
                        <span>
                          {b.trendPct > 0 ? "+" : ""}
                          {b.trendPct.toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 14, marginTop: 12, paddingTop: 11, borderTop: "1px solid #F3F4F7", flexWrap: "wrap" }}>
                    {[
                      ["Margin", b.isTrading ? `${b.margin.toFixed(1)}%` : "—"],
                      ["Orders", b.isTrading ? String(b.ordersCount) : "—"],
                      ["Customers", b.isTrading ? String(b.customerCount) : "—"],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: BR.textFaint }}>{label}</div>
                        <div style={{ fontSize: 12.5, fontWeight: 800, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
      </div>

      {panel && <DetailPanel kicker={panel.kicker} title={panel.title} badge={panel.badge} badgeTone={panel.badgeTone} rows={panel.rows} bulletsTitle={panel.bulletsTitle} bullets={panel.bullets} note={panel.note} onClose={() => setPanel(null)} />}
    </main>
  );
}

function ScopeBar() {
  const { scopeBranchId, periodLabel, setScopeBranchId } = useBranchesScope();
  const { data: branches = [] } = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });
  const scopeName = scopeBranchId ? branches.find((b) => b.id === scopeBranchId)?.name ?? "All branches" : "All branches";
  return (
    <div style={{ background: "#fff", border: `1px solid ${BR.border}`, borderRadius: 11, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <div style={{ fontSize: 11.5, color: BR.textMuted }}>
        Scope: <strong style={{ color: BR.text }}>{scopeName}</strong> · {periodLabel} · this filter follows you into Inventory, Staff and Bookings
      </div>
      {scopeBranchId && (
        <button type="button" onClick={() => setScopeBranchId(null)} style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 700, color: "#0E8442", cursor: "pointer", background: "none", border: 0 }}>
          Reset
        </button>
      )}
    </div>
  );
}

function buildInsights(
  trading: Enriched[],
  branchMeta: { id: string; active: boolean }[],
): { title: string; meta: string; tone: Tone; Icon: typeof TriangleAlert; panel: { kicker: string; title: string; badge?: string; badgeTone?: Tone; rows: [string, string][]; bulletsTitle: string; bullets: string[]; note: string } }[] {
  const out: ReturnType<typeof buildInsights> = [];

  const worstMargin = [...trading].filter((b) => b.trendDir === "down").sort((a, b) => a.margin - b.margin)[0];
  if (worstMargin && worstMargin.margin < 20) {
    out.push({
      title: `${worstMargin.name} margin is under pressure`,
      meta: `${worstMargin.margin.toFixed(1)}% margin, trending down`,
      tone: "red",
      Icon: TriangleAlert,
      panel: {
        kicker: "Branch finding",
        title: `${worstMargin.name} margin is under pressure`,
        badge: `${worstMargin.margin.toFixed(1)}% margin`,
        badgeTone: "red",
        rows: [
          ["Branch", worstMargin.name],
          ["Margin", `${worstMargin.margin.toFixed(1)}%`],
          ["Revenue trend", worstMargin.trendPct != null ? `${worstMargin.trendPct.toFixed(1)}% vs last week` : "—"],
          ["Data period", "Trailing weeks, from rollup"],
        ],
        bulletsTitle: "What this measures",
        bullets: ["Margin is gross profit divided by revenue for this branch's own window", "Compared against the branch's own last two weeks of real orders", "Not a projection — a measured change in recorded revenue and cost of goods"],
        note: "Branches owns the branch record. Revenue and margin are read from the modules that own them.",
      },
    });
  }

  const bestGrowth = [...trading].filter((b) => b.trendDir === "up" && b.trendPct != null).sort((a, b) => (b.trendPct ?? 0) - (a.trendPct ?? 0))[0];
  if (bestGrowth) {
    out.push({
      title: `${bestGrowth.name} is growing fastest`,
      meta: `+${(bestGrowth.trendPct ?? 0).toFixed(1)}% vs last week`,
      tone: "green",
      Icon: TrendingUp,
      panel: {
        kicker: "Branch finding",
        title: `${bestGrowth.name} is growing fastest`,
        badge: `+${(bestGrowth.trendPct ?? 0).toFixed(1)}%`,
        badgeTone: "green",
        rows: [
          ["Branch", bestGrowth.name],
          ["Growth", `+${(bestGrowth.trendPct ?? 0).toFixed(1)}% vs last week`],
          ["Margin", `${bestGrowth.margin.toFixed(1)}%`],
        ],
        bulletsTitle: "What this measures",
        bullets: ["Week-over-week revenue change from real closed-order totals", "A branch is compared against its own recent weeks, not a flat target"],
        note: "Contributors are ranked by measured impact only.",
      },
    });
  }

  const highCredit = [...trading].sort((a, b) => b.creditOutstanding - a.creditOutstanding)[0];
  if (highCredit && highCredit.creditOutstanding > 0) {
    out.push({
      title: `${highCredit.name} carries the most credit exposure`,
      meta: `Outstanding balance across its customers`,
      tone: "amber",
      Icon: CircleAlert,
      panel: {
        kicker: "Branch finding",
        title: `${highCredit.name} carries the most credit exposure`,
        badgeTone: "amber",
        rows: [["Branch", highCredit.name], ["Outstanding", String(highCredit.creditOutstanding)]],
        bulletsTitle: "What this measures",
        bullets: ["Outstanding credit is money owed to this branch, not money collected", "Never added to revenue or treated as realised profit"],
        note: "Credit owns balances and ledgers. This is the branch view of them.",
      },
    });
  }

  const notTrading = branchMeta.filter((m) => m.active && !trading.some((t) => t.businessId === m.id));
  if (notTrading.length > 0) {
    out.push({
      title: `${notTrading.length} branch${notTrading.length === 1 ? "" : "es"} not yet trading`,
      meta: "Excluded from performance comparison",
      tone: "blue",
      Icon: Boxes,
      panel: {
        kicker: "Branch finding",
        title: `${notTrading.length} branch${notTrading.length === 1 ? "" : "es"} not yet trading`,
        badgeTone: "blue",
        rows: [["Branches", String(notTrading.length)]],
        bulletsTitle: "What this means",
        bullets: ["A branch with no orders in this window is excluded from ranking rather than shown as zero", "Check its setup — services, stock and staff assignment"],
        note: "Noxtill excludes a non-trading branch from comparison rather than counting it as a zero.",
      },
    });
  }

  return out.slice(0, 5);
}
