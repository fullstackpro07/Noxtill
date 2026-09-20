"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchBranches } from "@/lib/branches-api";
import { fetchBranchAppointments, type RawBranchAppointment } from "@/lib/branch-scoped-api";
import { useBranchesScope } from "@/components/branches/branches-context";
import { BR, KpiTile, KpiSkeleton, Chip, type Tone } from "@/components/branches/branches-ui";
import { ErrorBanner } from "@/components/shared/error-states";

function todayRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

const STATUS_TONE: Record<string, Tone> = {
  requested: "blue",
  booked: "blue",
  confirmed: "green",
  completed: "green",
  cancelled: "neutral",
  no_show: "red",
};

interface Row extends RawBranchAppointment {
  branchName: string;
}

export function BranchBookingsView() {
  const { scopeBranchId } = useBranchesScope();
  const { data: branches = [] } = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });
  const scoped = scopeBranchId ? branches.filter((b) => b.id === scopeBranchId) : branches.filter((b) => b.active);
  const { from, to } = todayRange();

  const { data: byBranch, isPending, isError, refetch } = useQuery({
    queryKey: ["branch-bookings", scoped.map((b) => b.id).join(","), from],
    queryFn: async () => {
      const entries = await Promise.all(
        scoped.map(async (b) => {
          try {
            return [b.id, await fetchBranchAppointments(b.id, from, to)] as const;
          } catch {
            return [b.id, [] as RawBranchAppointment[]] as const;
          }
        }),
      );
      return new Map(entries);
    },
    enabled: scoped.length > 0,
  });

  const rows: Row[] = useMemo(() => {
    if (!byBranch) return [];
    const out: Row[] = [];
    for (const b of scoped) {
      for (const a of byBranch.get(b.id) ?? []) out.push({ ...a, branchName: b.name });
    }
    return out.sort((x, y) => new Date(x.startsAt).getTime() - new Date(y.startsAt).getTime());
  }, [byBranch, scoped]);

  const total = rows.length;
  const completed = rows.filter((r) => r.status === "completed").length;
  const cancelled = rows.filter((r) => r.status === "cancelled").length;
  const noShow = rows.filter((r) => r.status === "no_show").length;
  const unassigned = rows.filter((r) => r.status !== "cancelled" && !r.staffUserId).length;

  if (isError) {
    return <ErrorBanner title="Couldn't load branch bookings" description="Check your connection and try again." onRetry={() => refetch()} />;
  }

  return (
    <main className="flex flex-col gap-[18px] px-6 pb-[30px] pt-[18px]">
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
        {isPending ? (
          <KpiSkeleton count={5} />
        ) : (
          <>
            <KpiTile label="Today's bookings" value={String(total)} meta={`across ${scoped.length} branch${scoped.length === 1 ? "" : "es"}`} />
            <KpiTile label="Completed" value={String(completed)} meta="so far today" />
            <KpiTile label="Cancelled" value={String(cancelled)} meta={total ? `${((cancelled / total) * 100).toFixed(1)}%` : "—"} />
            <KpiTile label="No-shows" value={String(noShow)} tone={noShow > 0 ? "red" : undefined} meta={total ? `${((noShow / total) * 100).toFixed(1)}%` : "—"} />
            <KpiTile label="Unassigned" value={String(unassigned)} tone={unassigned > 0 ? "amber" : undefined} meta="no staff assigned" />
          </>
        )}
      </div>

      <div style={{ background: "#fff", border: `1px solid ${BR.border}`, borderRadius: 13, boxShadow: "0 1px 2px rgba(16,24,40,.05)", overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>
            {new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date())}
          </div>
        </div>
        <div>
          {isPending ? (
            <div style={{ padding: 24, textAlign: "center", color: BR.textFaint, fontSize: 12.5 }}>Loading…</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: BR.textFaint, fontSize: 12.5 }}>No bookings today across these branches.</div>
          ) : (
            rows.map((r) => (
              <div key={`${r.branchName}-${r.id}`} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "13px 18px", borderTop: "1px solid #F3F4F7", background: !r.staffUserId && r.status !== "cancelled" ? "#FEFBFB" : "#fff" }}>
                <div style={{ width: 74, flexShrink: 0, fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#45505F" }}>
                  {new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(r.startsAt))}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Chip tone={STATUS_TONE[r.status] ?? "neutral"} style={{ height: 20, fontSize: 9.5 }}>
                      {r.status.replace("_", " ")}
                    </Chip>
                    {!r.staffUserId && r.status !== "cancelled" && (
                      <Chip tone="red" style={{ height: 20, fontSize: 9.5 }}>
                        Needs staff
                      </Chip>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 10, color: BR.textFaint }}>{r.branchName}</div>
                </div>
              </div>
            ))
          )}
        </div>
        <div style={{ padding: "12px 18px", borderTop: "1px solid #F0F2F5", background: "#FCFCFD", fontSize: 11, color: BR.textFaint }}>
          Bookings owns appointments. A branch with no services or availability configured cannot take one, so it never appears here.
        </div>
      </div>
    </main>
  );
}
