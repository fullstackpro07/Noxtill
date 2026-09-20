"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchBranches } from "@/lib/branches-api";
import { fetchBranchStaffList, fetchBranchShifts, fetchBranchAppointments, type RawBranchStaffMember } from "@/lib/branch-scoped-api";
import { useBranchesScope } from "@/components/branches/branches-context";
import { BR, KpiTile, KpiSkeleton, Chip, th, type Tone } from "@/components/branches/branches-ui";
import { ErrorBanner } from "@/components/shared/error-states";

function todayRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

interface BranchCapacity {
  branchId: string;
  branchName: string;
  staff: RawBranchStaffMember[];
  scheduledHours: number;
  bookedHours: number;
  unassignedBookings: number;
}

export function BranchStaffView() {
  const { scopeBranchId } = useBranchesScope();
  const { data: branches = [] } = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });
  const scoped = scopeBranchId ? branches.filter((b) => b.id === scopeBranchId) : branches.filter((b) => b.active);
  const { from, to } = todayRange();

  const { data: capacityByBranch, isPending, isError, refetch } = useQuery({
    queryKey: ["branch-capacity", scoped.map((b) => b.id).join(","), from],
    queryFn: async (): Promise<BranchCapacity[]> => {
      return Promise.all(
        scoped.map(async (b): Promise<BranchCapacity> => {
          try {
            const [staff, shifts, appts] = await Promise.all([
              fetchBranchStaffList(b.id),
              fetchBranchShifts(b.id, from, to),
              fetchBranchAppointments(b.id, from, to),
            ]);
            const scheduledHours = shifts
              .filter((s) => s.status === "scheduled")
              .reduce((sum, s) => sum + (new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()) / 3_600_000, 0);
            const bookedHours = appts
              .filter((a) => a.status !== "cancelled")
              .reduce((sum, a) => sum + (new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime()) / 3_600_000, 0);
            const unassignedBookings = appts.filter((a) => a.status !== "cancelled" && !a.staffUserId).length;
            return { branchId: b.id, branchName: b.name, staff, scheduledHours, bookedHours, unassignedBookings };
          } catch {
            return { branchId: b.id, branchName: b.name, staff: [], scheduledHours: 0, bookedHours: 0, unassignedBookings: 0 };
          }
        }),
      );
    },
    enabled: scoped.length > 0,
  });

  const rows = capacityByBranch ?? [];
  const totalStaff = rows.reduce((a, r) => a + r.staff.length, 0);
  const totalUnassigned = rows.reduce((a, r) => a + r.unassignedBookings, 0);
  const overStaffed = rows.filter((r) => r.scheduledHours > 0 && r.bookedHours / r.scheduledHours < 0.5).length;
  const overBooked = rows.filter((r) => r.scheduledHours > 0 && r.bookedHours / r.scheduledHours > 1).length;

  const allStaffRows = rows.flatMap((r) => r.staff.map((s) => ({ ...s, branchName: r.branchName })));

  if (isError) {
    return <ErrorBanner title="Couldn't load branch staff & capacity" description="Check your connection and try again." onRetry={() => refetch()} />;
  }

  return (
    <main className="flex flex-col gap-[18px] px-6 pb-[30px] pt-[18px]">
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
        {isPending ? (
          <KpiSkeleton count={4} />
        ) : (
          <>
            <KpiTile label="Staff" value={String(totalStaff)} meta={`across ${scoped.length} branch${scoped.length === 1 ? "" : "es"}`} />
            <KpiTile label="Unassigned bookings" value={String(totalUnassigned)} tone={totalUnassigned > 0 ? "red" : undefined} meta="today, no staff assigned" />
            <KpiTile label="Understaffed today" value={String(overBooked)} tone={overBooked > 0 ? "red" : undefined} meta="booked demand exceeds schedule" />
            <KpiTile label="Overstaffed today" value={String(overStaffed)} tone={overStaffed > 0 ? "amber" : undefined} meta="schedule exceeds booked demand" />
          </>
        )}
      </div>

      <div style={{ background: "#fff", border: `1px solid ${BR.border}`, borderRadius: 13, boxShadow: "0 1px 2px rgba(16,24,40,.05)", padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Capacity against booked demand</div>
          <div style={{ marginLeft: "auto", fontSize: 11, color: BR.textFaint }}>Today · by branch</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 15 }}>
          {isPending ? (
            <div style={{ fontSize: 12.5, color: BR.textFaint }}>Loading…</div>
          ) : rows.length === 0 ? (
            <div style={{ fontSize: 12.5, color: BR.textFaint }}>No branches to show.</div>
          ) : (
            rows.map((r) => {
              const pct = r.scheduledHours > 0 ? Math.round((r.bookedHours / r.scheduledHours) * 100) : r.bookedHours > 0 ? 999 : 0;
              const tone: Tone | undefined = pct > 100 ? "red" : pct > 0 && pct < 50 ? "amber" : undefined;
              return (
                <div key={r.branchId}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12, marginBottom: 6, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700 }}>{r.branchName}</span>
                    <span style={{ color: BR.textFaint }}>
                      {r.scheduledHours.toFixed(1)} scheduled hours · {r.bookedHours.toFixed(1)} booked
                    </span>
                    {r.unassignedBookings > 0 && (
                      <Chip tone="red" style={{ height: 20, fontSize: 9.5 }}>
                        {r.unassignedBookings} unassigned
                      </Chip>
                    )}
                    <span style={{ marginLeft: "auto", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{pct === 999 ? ">100%" : `${pct}%`}</span>
                  </div>
                  <div style={{ height: 10, borderRadius: 5, background: "#F1F3F6", overflow: "hidden", position: "relative" }}>
                    <div style={{ width: `${Math.min(pct, 130) / 1.3}%`, height: "100%", borderRadius: 5, background: tone === "red" ? "#DC2626" : tone === "amber" ? "#F59E0B" : BR.primary }} />
                    <div style={{ position: "absolute", left: "100%", top: 0, bottom: 0, width: 1, background: "#94A3B8" }} />
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div style={{ fontSize: 11, color: BR.textFaint, marginTop: 14, paddingTop: 12, borderTop: "1px solid #F0F2F5" }}>
          The marker is 100% of scheduled hours. A bar past it means booked demand exceeds the staff scheduled to cover it.
        </div>
      </div>

      <div style={{ background: "#fff", border: `1px solid ${BR.border}`, borderRadius: 13, boxShadow: "0 1px 2px rgba(16,24,40,.05)", overflow: "hidden" }}>
        <div className="overflow-x-auto nx-scroll">
          <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#FAFBFC", borderBottom: `1px solid ${BR.border}` }}>
                <th style={th("left")}>Staff</th>
                <th style={th("left")}>Branch</th>
                <th style={th("left")}>Role</th>
              </tr>
            </thead>
            <tbody>
              {isPending ? (
                <tr>
                  <td colSpan={3} style={{ padding: 24, textAlign: "center", color: BR.textFaint, fontSize: 12.5 }}>
                    Loading…
                  </td>
                </tr>
              ) : (
                allStaffRows.map((s) => (
                  <tr key={`${s.branchName}-${s.id}`} style={{ borderBottom: "1px solid #F3F4F7" }}>
                    <td style={{ padding: "11px 12px 11px 18px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <div style={{ width: 26, height: 26, flex: "0 0 26px", borderRadius: 8, background: "#E8F7EE", color: "#0E8442", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800 }}>
                          {s.user.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                        </div>
                        <div style={{ fontSize: 12.5, fontWeight: 700 }}>{s.user.name}</div>
                      </div>
                    </td>
                    <td style={{ padding: "11px 12px", fontSize: 12, color: "#45505F" }}>{s.branchName}</td>
                    <td style={{ padding: "11px 18px 11px 12px", fontSize: 12, color: "#45505F", textTransform: "capitalize" }}>{s.role}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "12px 18px", borderTop: "1px solid #F0F2F5", background: "#FCFCFD", fontSize: 11, color: BR.textFaint }}>
          Staff owns people and schedules. Branches shows the location view and never changes a schedule on its own.
        </div>
      </div>
    </main>
  );
}
