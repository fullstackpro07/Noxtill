"use client";

import { useMemo, useState } from "react";
import { useBranchDrawer } from "@/components/branches/branch-drawer-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Building2, Pencil, Power } from "lucide-react";
import { fetchBranches, deactivateBranch, reactivateBranch, fetchRollupDashboard, type Branch } from "@/lib/branches-api";
import { fetchStockTransfers } from "@/lib/stock-transfers-api";
import { fetchBranchStaffList } from "@/lib/branch-scoped-api";
import { formatCurrency } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useBranchesScope } from "@/components/branches/branches-context";
import { computeOpenStatus } from "@/lib/branch-hours";
import { BR, KpiTile, KpiSkeleton, Chip, th, marginPillStyle, ConfirmModal, type Tone } from "@/components/branches/branches-ui";
import { ErrorBanner } from "@/components/shared/error-states";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export function AllBranchesView() {
  const { openDrill, openSetup } = useBranchDrawer();
  const session = useSession();
  const currency = session.business.currency;
  const queryClient = useQueryClient();
  const { periodDays } = useBranchesScope();
  const [query, setQuery] = useState("");
  const [deactivating, setDeactivating] = useState<Branch | null>(null);

  const { data: branches = [], isPending, isError, refetch } = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });
  const { data: rollup } = useQuery({ queryKey: ["rollup-dashboard", periodDays], queryFn: () => fetchRollupDashboard(periodDays) });
  const { data: staffByBranch = {} } = useQuery({
    queryKey: ["branch-managers", branches.map((b) => b.id).join(",")],
    queryFn: async () => {
      const entries = await Promise.all(
        branches.map(async (b) => {
          try {
            const staff = await fetchBranchStaffList(b.id);
            const manager = staff.find((s) => s.role === "manager" && s.active !== false);
            return [b.id, { managerName: manager?.user.name ?? null, staffCount: staff.filter((s) => s.active !== false).length }] as const;
          } catch {
            return [b.id, { managerName: null, staffCount: 0 }] as const;
          }
        }),
      );
      return Object.fromEntries(entries) as Record<string, { managerName: string | null; staffCount: number }>;
    },
    enabled: branches.length > 0,
  });
  const managers = useMemo(() => Object.fromEntries(Object.entries(staffByBranch).map(([id, s]) => [id, s.managerName])), [staffByBranch]);

  // Pending/in-transit transfers touching a branch — scoped through whatever transfers the
  // caller's own business can see (a pre-existing backend limitation: a lateral transfer between
  // two non-root branches, neither the caller, wouldn't appear here either — not something this
  // screen can fix on its own).
  const { data: activeTransfers = [] } = useQuery({
    queryKey: ["stock-transfers", "active-for-deactivate"],
    queryFn: async () => {
      const [pending, approved, shipped] = await Promise.all([fetchStockTransfers("pending"), fetchStockTransfers("approved"), fetchStockTransfers("shipped")]);
      return [...pending, ...approved, ...shipped];
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => deactivateBranch(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      toast.success("Branch deactivated.");
      setDeactivating(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't deactivate this branch — please try again."),
  });
  const reactivateMutation = useMutation({
    mutationFn: (id: string) => reactivateBranch(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branches"] });
      toast.success("Branch reactivated.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't reactivate this branch — please try again."),
  });

  const statsByBranch = new Map((rollup?.branches ?? []).map((b) => [b.businessId, b]));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter((b) => b.name.toLowerCase().includes(q) || (b.country ?? "").toLowerCase().includes(q) || (managers[b.id] ?? "").toLowerCase().includes(q));
  }, [branches, query, managers]);

  const activeCount = branches.filter((b) => b.active).length;
  const openNowCount = branches.filter((b) => b.active && computeOpenStatus(b).isOpen).length;
  const needsAttention = branches.filter((b) => {
    const s = statsByBranch.get(b.id);
    if (!s || s.revenue <= 0) return false;
    const margin = (s.grossProfit / s.revenue) * 100;
    return margin < 18;
  }).length;

  if (isError) {
    return <ErrorBanner title="Couldn't load branches" description="Check your connection and try again." onRetry={() => refetch()} />;
  }

  return (
    <main className="flex flex-col gap-[18px] px-6 pb-[30px] pt-[18px]">
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))" }}>
        {isPending ? (
          <KpiSkeleton count={6} />
        ) : (
          <>
            <KpiTile label="All branches" value={String(branches.length)} meta={`${branches.length - activeCount} in setup`} />
            <KpiTile label="Active" value={String(activeCount)} meta="trading" />
            <KpiTile label="Inactive" value={String(branches.length - activeCount)} meta="deactivated" />
            <KpiTile label="Currently open" value={String(openNowCount)} meta="by local hours" />
            <KpiTile label="Closed now" value={String(activeCount - openNowCount)} meta="outside hours" />
            <KpiTile label="Needs attention" value={String(needsAttention)} tone={needsAttention > 0 ? "amber" : undefined} meta="margin below 18%" />
          </>
        )}
      </div>

      <div style={{ background: BR.surface, border: `1px solid ${BR.border}`, borderRadius: 13, boxShadow: "0 1px 2px rgba(16,24,40,.05)", overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ height: 34, flex: "1 1 200px", minWidth: 0, display: "flex", alignItems: "center", gap: 8, padding: "0 11px", border: `1px solid ${BR.borderStrong}`, borderRadius: 10, background: "#fff" }}>
            <Search size={14} style={{ flexShrink: 0, color: BR.textDim }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search branch name, country or manager…"
              style={{ flex: 1, minWidth: 0, fontSize: 12.5, border: 0, outline: "none" }}
            />
          </div>
        </div>
        <div className="overflow-x-auto nx-scroll">
          <table style={{ width: "100%", minWidth: 1200, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#FAFBFC", borderTop: "1px solid #F0F2F5", borderBottom: `1px solid ${BR.border}` }}>
                <th style={th("left")}>Branch</th>
                <th style={th("left")}>Manager</th>
                <th style={th("left")}>Location</th>
                <th style={th("left")}>Status</th>
                <th style={th("right")}>Revenue</th>
                <th style={th("right")}>Profit</th>
                <th style={th("right")}>Margin</th>
                <th style={th("center")}>Orders</th>
                <th style={th("center")}>Customers</th>
                <th style={th("right")}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isPending ? (
                <tr>
                  <td colSpan={10} style={{ padding: 24, textAlign: "center", color: BR.textFaint, fontSize: 12.5 }}>
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: 24, textAlign: "center", color: BR.textFaint, fontSize: 12.5 }}>
                    No branches match this search.
                  </td>
                </tr>
              ) : (
                filtered.map((b) => {
                  const s = statsByBranch.get(b.id);
                  const revenue = s?.revenue ?? 0;
                  const margin = revenue > 0 ? (s!.grossProfit / revenue) * 100 : null;
                  const openStatus = computeOpenStatus(b);
                  const manager = managers[b.id];
                  const healthTone: Tone = !b.active ? "neutral" : margin == null ? "blue" : margin < 18 ? "red" : margin < 22 ? "amber" : "green";
                  return (
                    <tr key={b.id} onClick={() => openDrill(b.id)} style={{ borderBottom: "1px solid #F3F4F7", cursor: "pointer", background: healthTone === "red" ? "#FEFBFB" : healthTone === "amber" ? "#FFFDF5" : "#fff" }}>
                      <td style={{ padding: "11px 12px 11px 18px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                          <div style={{ width: 28, height: 28, flex: "0 0 28px", borderRadius: 9, background: healthTone === "red" ? "#FEF3F2" : healthTone === "amber" ? "#FEF6E7" : healthTone === "blue" ? "#EEF4FF" : "#E8F7EE", color: healthTone === "red" ? "#B42318" : healthTone === "amber" ? "#B54708" : healthTone === "blue" ? "#3538CD" : "#0E8442", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Building2 size={14} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 700 }}>{b.name}</div>
                            {!b.parentId && <div style={{ fontSize: 10, color: BR.textFaint, fontFamily: "monospace" }}>ROOT</div>}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "11px 12px" }}>
                        <span style={{ fontSize: 12, fontWeight: !manager ? 700 : 500, color: !manager ? "#B42318" : "#45505F" }}>{manager ?? "Unassigned"}</span>
                      </td>
                      <td style={{ padding: "11px 12px", fontSize: 11.5, color: "#45505F" }}>{b.country ?? "—"}</td>
                      <td style={{ padding: "11px 12px" }}>
                        <Chip tone={!b.active ? "neutral" : openStatus.isOpen ? "green" : "neutral"} style={{ height: 21, fontSize: 10 }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: !b.active ? "#94A3B8" : openStatus.isOpen ? "#12A150" : "#94A3B8" }} />
                          <span>{!b.active ? "Deactivated" : openStatus.label}</span>
                        </Chip>
                      </td>
                      <td style={{ padding: "11px 12px", textAlign: "right", fontSize: 12.5, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{revenue ? formatCurrency(revenue, currency) : "—"}</td>
                      <td style={{ padding: "11px 12px", textAlign: "right", fontSize: 12.5, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{s ? formatCurrency(s.grossProfit, currency) : "—"}</td>
                      <td style={{ padding: "11px 12px", textAlign: "right" }}>{margin != null ? <span style={marginPillStyle(margin)}>{margin.toFixed(1)}%</span> : <span style={{ fontSize: 11, color: BR.textFaint }}>—</span>}</td>
                      <td style={{ padding: "11px 12px", textAlign: "center", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{s ? s.ordersCount : "—"}</td>
                      <td style={{ padding: "11px 12px", textAlign: "center", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{s ? s.customerCount : "—"}</td>
                      <td style={{ padding: "11px 18px 11px 12px", textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: "inline-flex", gap: 4, color: BR.textDim }}>
                          <button type="button" onClick={() => openSetup(b.id)} style={{ width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: 0, background: "transparent" }} aria-label="Edit">
                            <Pencil size={15} />
                          </button>
                          {b.parentId && (
                            <button
                              type="button"
                              onClick={() => (b.active ? setDeactivating(b) : reactivateMutation.mutate(b.id))}
                              style={{ width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: 0, background: "transparent" }}
                              aria-label={b.active ? "Deactivate" : "Reactivate"}
                            >
                              <Power size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "12px 18px", borderTop: "1px solid #F0F2F5", background: "#FCFCFD", fontSize: 11, color: BR.textFaint }}>
          Any row opens the same Branch 360 workspace. A branch that is not yet trading shows &ldquo;Not trading&rdquo; rather than a misleading zero.
        </div>
      </div>

      {deactivating && (
        <ConfirmModal
          title={`Deactivate "${deactivating.name}"?`}
          body="Deactivating stops new sales and bookings there. It disappears from branch pickers and roll-up totals from today. Every past sale, transfer and record stays exactly where it is — nothing financial is deleted."
          tone="red"
          rows={[
            ["Manager", staffByBranch[deactivating.id]?.managerName ?? "Unassigned"],
            ["Active staff", String(staffByBranch[deactivating.id]?.staffCount ?? 0)],
            [
              "Open transfers",
              `${activeTransfers.filter((t) => t.sourceBusinessId === deactivating.id || t.destBusinessId === deactivating.id).length} in progress`,
            ],
          ]}
          primary="Deactivate"
          pending={deactivateMutation.isPending}
          onConfirm={() => deactivateMutation.mutate(deactivating.id)}
          onClose={() => setDeactivating(null)}
        />
      )}
    </main>
  );
}
