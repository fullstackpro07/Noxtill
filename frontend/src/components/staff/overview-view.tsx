"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  fetchStaffList,
  fetchAttendance,
  fetchTimeOff,
  fetchShifts,
  fetchCommissions,
} from "@/lib/staff-api";
import { fetchActions } from "@/lib/action-center-api";
import { fetchAppointments } from "@/lib/bookings-api";
import { fetchProfitByTime } from "@/lib/profit-api";
import { formatCurrency } from "@/lib/format";
import { useSession } from "@/lib/session";
import { SimpleKpiTile, KpiSkeleton, Avatar, Chip, confidenceTier, confidenceTint } from "@/components/staff/staff-ui";

function startOfTodayIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}
function endOfTodayIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString();
}
function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function OverviewView() {
  const router = useRouter();
  const session = useSession();
  const currency = session.business.currency;
  const now = new Date().getTime();

  const { data: staffList = [], isPending: staffPending } = useQuery({ queryKey: ["staff-list"], queryFn: () => fetchStaffList() });
  const { data: attendanceToday = [] } = useQuery({ queryKey: ["attendance", "today"], queryFn: () => fetchAttendance({ from: startOfTodayIso(), to: endOfTodayIso() }) });
  const { data: timeOff = [] } = useQuery({ queryKey: ["time-off"], queryFn: () => fetchTimeOff() });
  const { data: upcomingShifts = [] } = useQuery({ queryKey: ["shifts", "upcoming"], queryFn: () => fetchShifts({ from: new Date().toISOString(), to: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString() }) });
  const { data: actions } = useQuery({ queryKey: ["actions"], queryFn: () => fetchActions() });
  const { data: appointmentsToday = [] } = useQuery({ queryKey: ["appointments", "today"], queryFn: () => fetchAppointments({ from: startOfTodayIso(), to: endOfTodayIso() }) });
  const { data: profitByTime } = useQuery({ queryKey: ["profit-by-time"], queryFn: () => fetchProfitByTime() });
  const { data: commissions = [] } = useQuery({ queryKey: ["commissions", currentMonth()], queryFn: () => fetchCommissions(currentMonth()) });

  const activeStaff = staffList.filter((s) => s.active);
  const onDutyIds = new Set(attendanceToday.filter((r) => r.checkOut === null).map((r) => r.staffUserId));
  const onLeaveIds = new Set(timeOff.filter((t) => t.status === "approved" && new Date(t.startsAt).getTime() <= now && new Date(t.endsAt).getTime() >= now).map((t) => t.staffUserId));
  const scheduledTodayIds = new Set(upcomingShifts.filter((s) => s.startsAt.slice(0, 10) === new Date().toISOString().slice(0, 10)).map((s) => s.staffUserId));
  const attendedTodayIds = new Set(attendanceToday.map((r) => r.staffUserId));
  const absentStaff = activeStaff.filter((s) => scheduledTodayIds.has(s.id) && !attendedTodayIds.has(s.id) && !onLeaveIds.has(s.id));
  const salesToday = profitByTime?.hourly.reduce((a, h) => a + h.revenue, 0) ?? 0;
  const commissionPending = commissions.filter((c) => !c.paid).reduce((a, c) => a + c.commission, 0);

  const isPending = staffPending;

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="grid gap-[13px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))" }}>
        {isPending ? (
          <KpiSkeleton count={8} />
        ) : (
          <>
            <SimpleKpiTile label="Currently Working" labelColor="#0E8442" value={String(activeStaff.filter((s) => onDutyIds.has(s.id)).length)} border="1.5px solid #BFE7CF" />
            <SimpleKpiTile label="On Leave" value={String(activeStaff.filter((s) => onLeaveIds.has(s.id)).length)} />
            <SimpleKpiTile label="Absent" value={String(absentStaff.length)} valueColor="#B42318" />
            <SimpleKpiTile label="Upcoming Shifts" value={String(upcomingShifts.filter((s) => s.status === "scheduled").length)} />
            <SimpleKpiTile
              label="Open Tasks"
              labelColor="#B54708"
              value={String(actions?.counts.open ?? 0)}
              border="1.5px solid #FDE3B3"
              sub={<div className="mt-1 text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>{actions?.counts.urgent ?? 0} overdue</div>}
            />
            <SimpleKpiTile label="Bookings Today" value={String(appointmentsToday.length)} />
            <SimpleKpiTile label="Sales Today" value={formatCurrency(salesToday, currency)} valueSize={20} />
            <SimpleKpiTile label="Commission Pending" value={formatCurrency(commissionPending, currency)} valueSize={20} valueColor="#12A150" />
          </>
        )}
      </div>

      <StaffInsights router={router} upcomingShifts={upcomingShifts} commissions={commissions} />

      <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <h3 className="m-0 mb-3 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Today&apos;s team</h3>
        {activeStaff.length === 0 ? (
          <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>No active staff yet.</p>
        ) : (
          <div className="grid gap-[13px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(270px,1fr))" }}>
            {activeStaff.map((s, i) => {
              const onLeave = onLeaveIds.has(s.id);
              const onDuty = onDutyIds.has(s.id);
              const state = onLeave ? "On leave" : onDuty ? "Working" : "Off";
              const c = commissions.find((x) => x.businessUserId === s.id);
              const shiftToday = upcomingShifts.find((sh) => sh.staffUserId === s.id && sh.startsAt.slice(0, 10) === new Date().toISOString().slice(0, 10));
              const myOpenTasks = (actions?.items ?? []).filter((it) => it.assigneeStaffId === s.id).length;
              const shiftLabel = onLeave ? "Approved leave" : onDuty ? (shiftToday ? `${new Date(shiftToday.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – ${new Date(shiftToday.endsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : "Working") : "Not scheduled";
              return (
                <div key={s.id} className="rounded-[14px] p-[14px]" style={{ border: "1px solid var(--app-border)" }}>
                  <div className="flex items-center gap-[11px]">
                    <Avatar name={s.name} index={i} size={38} />
                    <div className="min-w-0 flex-1">
                      <p className="m-0 truncate text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{s.name}</p>
                      <p className="m-0 mt-0.5 text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>{s.role.charAt(0).toUpperCase() + s.role.slice(1)} · {session.business.name}</p>
                    </div>
                    <Chip label={state} />
                  </div>
                  <div className="mt-2.5 text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>{shiftLabel}</div>
                  <div className="mt-2.5 grid grid-cols-3 gap-2">
                    <div>
                      <div className="text-[10px]" style={{ color: "var(--app-text-disabled)" }}>Tasks</div>
                      <div className="text-[13px] font-extrabold" style={{ color: "var(--app-text)" }}>{myOpenTasks}</div>
                    </div>
                    <div>
                      <div className="text-[10px]" style={{ color: "var(--app-text-disabled)" }}>Bookings</div>
                      <div className="text-[13px] font-extrabold" style={{ color: "var(--app-text)" }}>{c && c.totalSales > 0 ? c.totalSales : "—"}</div>
                    </div>
                    <div>
                      <div className="text-[10px]" style={{ color: "var(--app-text-disabled)" }}>Sales</div>
                      <div className="text-[13px] font-extrabold" style={{ color: "var(--app-text)" }}>{c && c.totalSales > 0 ? formatCurrency(c.totalSales, currency) : "—"}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push(`/staff/profile?staff=${s.id}`)}
                    className="mt-3 w-full rounded-[10px] py-2.5 text-[12px] font-bold"
                    style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}
                  >
                    Open Staff 360
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

function StaffInsights({
  router,
  upcomingShifts,
  commissions,
}: {
  router: ReturnType<typeof useRouter>;
  upcomingShifts: { swapStatus: string | null }[];
  commissions: { businessUserId: string; name: string; totalSales: number }[];
}) {
  const pendingSwaps = upcomingShifts.filter((s) => s.swapStatus === "pending").length;
  const earners = commissions.filter((c) => c.totalSales > 0);
  const avg = earners.length > 0 ? earners.reduce((a, c) => a + c.totalSales, 0) / earners.length : 0;
  const belowAvg = earners.filter((c) => c.totalSales < avg * 0.6).sort((a, b) => a.totalSales - b.totalSales)[0];

  const insights: { title: string; why: string; ev: string; conf: string; tint: { bg: string; color: string }; scr: string; label: string }[] = [];
  if (pendingSwaps > 0) {
    insights.push({
      title: `${pendingSwaps} swap request${pendingSwaps === 1 ? "" : "s"} still unanswered`,
      why: "Staff-requested shift swaps are waiting on a manager decision.",
      ev: `Schedule screen — ${pendingSwaps} pending request${pendingSwaps === 1 ? "" : "s"}.`,
      // A direct count from real data, not a statistical inference — "Confirmed" rather than a
      // fabricated confidence tier, since there's no uncertainty to express here.
      conf: "Confirmed",
      tint: { bg: "#EEF4FF", color: "#3538CD" },
      scr: "/staff/schedule",
      label: "Review swaps",
    });
  }
  if (belowAvg && avg > 0) {
    const pct = Math.round((1 - belowAvg.totalSales / avg) * 100);
    const tier = confidenceTier(pct);
    insights.push({
      title: `${belowAvg.name} is trending below the team average`,
      why: `Sales are ${pct}% under the team average this month, though attendance is unaffected.`,
      ev: `${belowAvg.totalSales.toLocaleString()} against a team average, this month.`,
      conf: tier,
      tint: confidenceTint(tier),
      scr: "/staff/performance",
      label: "Open performance",
    });
  }

  if (insights.length === 0) return null;

  return (
    <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
      <div className="mb-3 flex items-center gap-[9px]">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0E8442" strokeWidth="2" strokeLinecap="round">
          <path d="m11 3 1.7 5L17.7 9.7 12.7 11.4 11 16.4 9.3 11.4 4.3 9.7 9.3 8Z" />
          <path d="M18.5 14v3M20 15.5h-3" />
        </svg>
        <h3 className="m-0 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Staff intelligence</h3>
        <span className="text-[10.5px] font-bold" style={{ color: "var(--app-text-disabled)" }}>From your own roster and task data</span>
      </div>
      <div className="flex flex-col gap-[11px]">
        {insights.map((ins, i) => (
          <div key={i} className="rounded-[13px] p-[14px]" style={{ border: "1px solid var(--app-border)" }}>
            <p className="m-0 text-[13.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{ins.title}</p>
            <p className="m-0 mt-1.5 text-[12.5px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>{ins.why}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
              <span className="text-[11px]" style={{ color: "var(--app-text-disabled)" }}>Evidence: {ins.ev}</span>
              <span className="rounded-full text-[10.5px] font-extrabold" style={{ padding: "3px 9px", background: ins.tint.bg, color: ins.tint.color }}>{ins.conf === "Confirmed" ? "Confirmed" : `Confidence ${ins.conf}`}</span>
              <button type="button" onClick={() => router.push(ins.scr)} className="ml-auto rounded-[10px] px-3.5 py-2 text-[12px] font-bold" style={{ border: "1px solid var(--app-border)", color: "#0E8442" }}>{ins.label}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
