"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Percent, Boxes, UsersRound, UserRound, Building2, ArrowLeftRight } from "lucide-react";
import { fetchBranches, fetchRollupDashboard } from "@/lib/branches-api";
import { fetchStockTransfers } from "@/lib/stock-transfers-api";
import { fetchBranchInventory, fetchBranchAppointments, fetchBranchStaffList } from "@/lib/branch-scoped-api";
import { useBranchesScope } from "@/components/branches/branches-context";
import { BR, KpiTile, KpiSkeleton, Chip, type Tone } from "@/components/branches/branches-ui";
import { ErrorBanner } from "@/components/shared/error-states";

function todayRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

interface Alert {
  title: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  tone: Tone;
  branch: string;
  Icon: typeof Percent;
  evidence: string;
  action: string;
  count: number;
  onView: () => void;
}

export function BranchAlertsView() {
  const router = useRouter();
  const { scopeBranchId, periodDays } = useBranchesScope();
  const { from, to } = todayRange();

  const { data: branches = [] } = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });
  const scoped = scopeBranchId ? branches.filter((b) => b.id === scopeBranchId) : branches.filter((b) => b.active);
  const { data: rollup, isPending: rollupPending, isError, refetch } = useQuery({ queryKey: ["rollup-dashboard", periodDays], queryFn: () => fetchRollupDashboard(periodDays) });
  const { data: transfers = [] } = useQuery({ queryKey: ["stock-transfers", "pending-all"], queryFn: () => fetchStockTransfers("pending") });

  const { data: perBranch, isPending: signalsPending } = useQuery({
    queryKey: ["branch-alert-signals", scoped.map((b) => b.id).join(","), from],
    queryFn: async () => {
      return Promise.all(
        scoped.map(async (b) => {
          try {
            const [inventory, appts, staff] = await Promise.all([
              fetchBranchInventory(b.id),
              fetchBranchAppointments(b.id, from, to),
              fetchBranchStaffList(b.id),
            ]);
            return {
              branchId: b.id,
              lowStock: inventory.filter((i) => i.status === "low_stock").length,
              outOfStock: inventory.filter((i) => i.status === "out_of_stock").length,
              unassigned: appts.filter((a) => a.status !== "cancelled" && !a.staffUserId).length,
              hasManager: staff.some((s) => s.role === "manager" && s.active !== false),
            };
          } catch {
            return { branchId: b.id, lowStock: 0, outOfStock: 0, unassigned: 0, hasManager: true };
          }
        }),
      );
    },
    enabled: scoped.length > 0,
  });

  const isPending = rollupPending || signalsPending;

  const alerts: Alert[] = useMemo(() => {
    if (!rollup || !perBranch) return [];
    const signalsByBranch = new Map(perBranch.map((s) => [s.branchId, s]));
    const out: Alert[] = [];

    for (const b of scoped) {
      const roll = rollup.branches.find((r) => r.businessId === b.id);
      const signals = signalsByBranch.get(b.id);
      const trading = !!roll && (roll.revenue > 0 || roll.ordersCount > 0);
      const margin = roll && roll.revenue > 0 ? (roll.grossProfit / roll.revenue) * 100 : null;

      if (margin != null && margin < 16) {
        out.push({
          title: `${b.name} margin is critically low`, severity: "Critical", tone: "red", branch: b.name, Icon: Percent,
          evidence: `${margin.toFixed(1)}% margin this period`, action: "Review discounting and recent cost changes at this branch.", count: 1,
          onView: () => router.push(`/branches/profile?branch=${b.id}`),
        });
      } else if (margin != null && margin < 20) {
        out.push({
          title: `${b.name} margin needs attention`, severity: "Medium", tone: "amber", branch: b.name, Icon: Percent,
          evidence: `${margin.toFixed(1)}% margin this period`, action: "Compare against other branches to see if this is branch-specific.", count: 1,
          onView: () => router.push(`/branches/profile?branch=${b.id}`),
        });
      }

      if (signals && (signals.lowStock > 0 || signals.outOfStock > 0)) {
        out.push({
          title: `${signals.lowStock + signals.outOfStock} product${signals.lowStock + signals.outOfStock === 1 ? "" : "s"} below reorder point`,
          severity: signals.outOfStock > 0 ? "High" : "Medium", tone: signals.outOfStock > 0 ? "red" : "amber", branch: b.name, Icon: Boxes,
          evidence: `${signals.outOfStock} out of stock, ${signals.lowStock} low`, action: "Review a stock transfer from a branch with surplus, or reorder directly.",
          count: signals.lowStock + signals.outOfStock,
          onView: () => router.push("/branches/inventory"),
        });
      }

      if (signals && signals.unassigned > 0) {
        out.push({
          title: `${signals.unassigned} booking${signals.unassigned === 1 ? "" : "s"} with no staff assigned`, severity: "High", tone: "amber", branch: b.name, Icon: UsersRound,
          evidence: "Today's schedule", action: "Assign staff or contact the customer.", count: signals.unassigned,
          onView: () => router.push("/branches/bookings"),
        });
      }

      if (b.active && signals && !signals.hasManager) {
        out.push({
          title: "No branch manager assigned", severity: "Medium", tone: "amber", branch: b.name, Icon: UserRound,
          evidence: "Tasks and bookings escalate to the owner instead of being handled locally", action: "Assign a manager and set branch task routing.", count: 1,
          onView: () => router.push(`/branches/${b.id}/settings`),
        });
      }

      if (b.active && !trading) {
        out.push({
          title: "Branch cannot trade yet", severity: "Medium", tone: "blue", branch: b.name, Icon: Building2,
          evidence: "No orders recorded in this window", action: "Complete branch setup — services, stock and staff.", count: 1,
          onView: () => router.push(`/branches/${b.id}/settings`),
        });
      }
    }

    for (const t of transfers) {
      const fromName = branches.find((b) => b.id === t.sourceBusinessId)?.name ?? "—";
      const toName = branches.find((b) => b.id === t.destBusinessId)?.name ?? "—";
      out.push({
        title: `Transfer awaiting approval`, severity: "Low", tone: "neutral", branch: `${fromName} → ${toName}`, Icon: ArrowLeftRight,
        evidence: `${t.items.reduce((s, i) => s + i.qty, 0)} units requested`, action: "Approve or decline the transfer request.", count: 1,
        onView: () => router.push("/branches/transfers"),
      });
    }

    const order: Record<Alert["severity"], number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    return out.sort((a, b) => order[a.severity] - order[b.severity]);
  }, [rollup, perBranch, scoped, transfers, branches, router]);

  const critical = alerts.filter((a) => a.severity === "Critical").length;
  const high = alerts.filter((a) => a.severity === "High").length;

  if (isError) {
    return <ErrorBanner title="Couldn't load branch alerts" description="Check your connection and try again." onRetry={() => refetch()} />;
  }

  return (
    <main className="flex flex-col gap-[18px] px-6 pb-[30px] pt-[18px]">
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))" }}>
        {isPending ? (
          <KpiSkeleton count={4} />
        ) : (
          <>
            <KpiTile label="Active alerts" value={String(alerts.length)} tone={alerts.length > 0 ? "amber" : undefined} meta="grouped by issue" />
            <KpiTile label="Critical" value={String(critical)} tone={critical > 0 ? "red" : undefined} meta="needs immediate review" />
            <KpiTile label="High" value={String(high)} tone={high > 0 ? "amber" : undefined} meta="stock, staffing & bookings" />
            <KpiTile label="Pending transfers" value={String(transfers.length)} meta="awaiting approval" />
          </>
        )}
      </div>

      <div style={{ background: "#fff", border: `1px solid ${BR.border}`, borderRadius: 13, boxShadow: "0 1px 2px rgba(16,24,40,.05)", overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Active alerts</div>
          <div style={{ fontSize: 11, color: BR.textFaint }}>Related events grouped — low-stock lines at one branch are one alert, not several</div>
        </div>
        <div>
          {isPending ? (
            <div style={{ padding: 24, textAlign: "center", color: BR.textFaint, fontSize: 12.5 }}>Loading…</div>
          ) : alerts.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: BR.textFaint, fontSize: 12.5 }}>No active alerts across these branches right now.</div>
          ) : (
            alerts.map((a, i) => (
              <div key={i} onClick={a.onView} style={{ padding: "14px 18px", borderTop: i === 0 ? "none" : "1px solid #F3F4F7", cursor: "pointer", background: a.tone === "red" ? "#FEFBFB" : a.tone === "amber" ? "#FFFDF5" : "#fff" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ width: 38, height: 38, flex: "0 0 38px", borderRadius: 11, background: a.tone === "red" ? "#FEF3F2" : a.tone === "amber" ? "#FEF6E7" : a.tone === "blue" ? "#EEF4FF" : "#F1F3F6", color: a.tone === "red" ? "#B42318" : a.tone === "amber" ? "#B54708" : a.tone === "blue" ? "#3538CD" : "#5B6675", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <a.Icon size={16} />
                  </div>
                  <div style={{ flex: "1 1 300px", minWidth: 250 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ fontSize: 13, fontWeight: 800 }}>{a.title}</div>
                      <Chip tone={a.tone} style={{ height: 21, fontSize: 10 }}>
                        {a.severity}
                      </Chip>
                      <Chip tone="neutral" style={{ height: 21, fontSize: 10 }}>
                        {a.branch}
                      </Chip>
                    </div>
                    <div style={{ fontSize: 11.5, color: BR.textMuted, marginTop: 5, lineHeight: 1.5 }}>{a.evidence}</div>
                  </div>
                  <div style={{ flex: "1 1 200px", minWidth: 170 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: BR.textFaint, marginBottom: 6 }}>Recommended action</div>
                    <div style={{ fontSize: 11.5, color: "#45505F", lineHeight: 1.5 }}>{a.action}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        <div style={{ padding: "12px 18px", borderTop: "1px solid #F0F2F5", background: "#FCFCFD", fontSize: 11, color: BR.textFaint }}>
          Only meaningful, actionable changes raise an alert. Each one carries severity, branch and a recommended action.
        </div>
      </div>
    </main>
  );
}
