"use client";

import { useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  fetchStaffList,
  fetchAttendance,
  fetchShifts,
  fetchCommissions,
  fetchPayrollPreview,
} from "@/lib/staff-api";
import { fetchStaffAnalytics } from "@/lib/analytics-api";
import { fetchActions } from "@/lib/action-center-api";
import { fetchAuditLog } from "@/lib/audit-log-api";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { useSession } from "@/lib/session";
import { SimpleKpiTile, KpiSkeleton, Avatar, Chip, chip, selectStyle, recentMonths } from "@/components/staff/staff-ui";

function startOfMonthIso(offsetMonths = 0): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offsetMonths, 1)).toISOString();
}

export function StaffProfileView() {
  const session = useSession();
  const currency = session.business.currency;
  const isOwner = session.user.role === "owner";
  const router = useRouter();
  const searchParams = useSearchParams();
  const months = useMemo(() => recentMonths(), []);
  const thisMonth = months[0].value;
  const lastMonth = months[1].value;

  const { data: staffList = [] } = useQuery({ queryKey: ["staff-list"], queryFn: () => fetchStaffList() });
  const activeStaff = staffList.filter((s) => s.active);
  const selectedId = searchParams.get("staff") ?? activeStaff[0]?.id ?? "";
  const me = activeStaff.find((s) => s.id === selectedId) ?? activeStaff[0];

  const { data: analytics = [] } = useQuery({ queryKey: ["staff-analytics"], queryFn: () => fetchStaffAnalytics() });
  const { data: myAttendance = [] } = useQuery({ queryKey: ["attendance", "self-month", me?.id], queryFn: () => fetchAttendance({ staffUserId: me?.id, from: startOfMonthIso() }), enabled: !!me });
  const { data: myShifts = [] } = useQuery({ queryKey: ["shifts", "self-month", me?.id], queryFn: () => fetchShifts({ staffUserId: me?.id, from: startOfMonthIso() }), enabled: !!me });
  const { data: todayShifts = [] } = useQuery({ queryKey: ["shifts", "today-all"], queryFn: () => fetchShifts({ from: new Date().toISOString().slice(0, 10) + "T00:00:00.000Z", to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }) });
  const { data: commissionsThis = [] } = useQuery({ queryKey: ["commissions", thisMonth], queryFn: () => fetchCommissions(thisMonth) });
  const { data: commissionsLast = [] } = useQuery({ queryKey: ["commissions", lastMonth], queryFn: () => fetchCommissions(lastMonth) });
  const { data: payrollPreview } = useQuery({ queryKey: ["payroll-preview", thisMonth], queryFn: () => fetchPayrollPreview(thisMonth), enabled: isOwner });
  const { data: actions } = useQuery({ queryKey: ["actions"], queryFn: () => fetchActions() });
  const { data: timeline } = useQuery({ queryKey: ["audit-log", "self", me?.userId], queryFn: () => fetchAuditLog({ actorUserId: me?.userId, pageSize: 10 }), enabled: !!me });
  const { data: attendanceToday = [] } = useQuery({ queryKey: ["attendance", "today"], queryFn: () => fetchAttendance({ from: new Date().toISOString().slice(0, 10) + "T00:00:00.000Z" }) });

  if (!me) {
    return <p className="p-6 text-[13px]" style={{ color: "var(--app-text-disabled)" }}>No staff to show yet.</p>;
  }

  const row = analytics.find((a) => a.staffUserId === me.id);
  const thisCommission = commissionsThis.find((c) => c.businessUserId === me.id);
  const lastCommission = commissionsLast.find((c) => c.businessUserId === me.id);
  const payrollRow = payrollPreview?.rows.find((r) => r.businessUserId === me.id);
  const myTodayShift = todayShifts.find((s) => s.staffUserId === me.id);
  const isWorkingNow = attendanceToday.some((a) => a.staffUserId === me.id && a.checkOut === null);
  const attState = isWorkingNow ? "Working" : "Off";

  const scheduledDaysThisMonth = new Set(myShifts.map((s) => s.startsAt.slice(0, 10))).size;
  const attendedDaysThisMonth = new Set(myAttendance.map((a) => a.checkIn.slice(0, 10))).size;
  const attendancePct = scheduledDaysThisMonth > 0 ? Math.round((attendedDaysThisMonth / scheduledDaysThisMonth) * 100) : null;

  const myTasks = (actions?.items ?? []).filter((it) => it.assigneeStaffId === me.id);

  const salesDelta = thisCommission && lastCommission && lastCommission.totalSales > 0 ? Math.round(((thisCommission.totalSales - lastCommission.totalSales) / lastCommission.totalSales) * 100) : null;

  const priChip = (p: string) => (p === "urgent" ? chip("High") : chip("Normal"));

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[14px] rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <Avatar name={me.name} size={52} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-[9px]">
            <span className="text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>{me.name}</span>
            <Chip label={attState} />
          </div>
          <div className="mt-1 text-[12px]" style={{ color: "var(--app-text-faint)" }}>
            {me.role.charAt(0).toUpperCase() + me.role.slice(1)} · {session.business.name} · {myTodayShift ? `${formatTime(myTodayShift.startsAt)} – ${formatTime(myTodayShift.endsAt)}` : "Not scheduled today"}
          </div>
        </div>
        <select
          value={selectedId}
          onChange={(e) => router.push(`/staff/profile?staff=${e.target.value}`)}
          aria-label="Choose staff member"
          className="ml-auto rounded-[11px]"
          style={selectStyle}
        >
          {activeStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div className="grid gap-[13px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))" }}>
        {!row ? (
          <KpiSkeleton count={isOwner ? 6 : 5} />
        ) : (
          <>
            <SimpleKpiTile label="Revenue attributed" value={formatCurrency(row.totalSales, currency)} valueSize={20} />
            <SimpleKpiTile label="Sales count" value={String(row.orders)} valueSize={20} />
            <SimpleKpiTile label="Bookings" value={String(row.appointmentsCount)} valueSize={20} />
            <SimpleKpiTile
              label="Tasks open"
              value={String(myTasks.length)}
              valueSize={20}
              valueColor="#B54708"
              sub={<div className="mt-1 text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>Same records as the Action Center</div>}
            />
            <SimpleKpiTile label="Attendance" value={attendancePct !== null ? `${attendancePct}%` : "—"} valueSize={20} />
            {isOwner && (
              <SimpleKpiTile
                label="Net payable"
                labelColor="#0E8442"
                value={payrollRow ? formatCurrency(payrollRow.netPay, currency) : "—"}
                valueSize={20}
                border="1.5px solid #BFE7CF"
                sub={<div className="mt-1 text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>{thisCommission?.ruleLabel ?? "No rule set"}</div>}
              />
            )}
          </>
        )}
      </div>

      <div className="rounded-[16px] p-4" style={{ background: "#F7FCF9", border: "1px solid #D5EFE0" }}>
        <div className="mb-2 flex items-center gap-[9px]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0E8442" strokeWidth="2" strokeLinecap="round">
            <path d="m11 3 1.7 5L17.7 9.7 12.7 11.4 11 16.4 9.3 11.4 4.3 9.7 9.3 8Z" />
          </svg>
          <span className="text-[10.5px] font-extrabold uppercase tracking-[.4px]" style={{ color: "#0E8442" }}>Summary — this month vs last</span>
        </div>
        <p className="m-0 text-[13px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
          {thisCommission ? (
            <>
              {salesDelta !== null
                ? `Sales are ${salesDelta >= 0 ? "up" : "down"} ${Math.abs(salesDelta)}% on last month (${formatCurrency(thisCommission.totalSales, currency)} vs ${formatCurrency(lastCommission!.totalSales, currency)}).`
                : `${formatCurrency(thisCommission.totalSales, currency)} in attributed sales so far this month.`}
              {attendancePct !== null ? ` Attendance is steady at ${attendancePct}%.` : ""}
              {myTasks.length > 0 ? ` ${myTasks.length} assigned task${myTasks.length === 1 ? " is" : "s are"} open, neither overdue yet.` : " No assigned tasks are open right now."}
            </>
          ) : (
            "No commission activity recorded yet this month."
          )}
        </p>
      </div>

      <div className="grid gap-[15px]" style={{ gridTemplateColumns: "minmax(0,1fr) 340px" }}>
        <div className="min-w-0 rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-3 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Activity timeline</h3>
          <div className="flex flex-col">
            {!timeline || timeline.rows.length === 0 ? (
              <p className="m-0 py-3 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>No recorded activity yet.</p>
            ) : (
              timeline.rows.map((r, i) => (
                <div key={r.id} className="flex gap-3 py-[11px]" style={{ borderTop: i === 0 ? "none" : "1px solid var(--app-surface-2)" }}>
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: "#BFE7CF" }} />
                  <div className="min-w-0 flex-1">
                    <p className="m-0 text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{r.action}</p>
                    <p className="m-0 mt-0.5 text-[11px]" style={{ color: "var(--app-text-disabled)" }}>{formatDate(r.createdAt)} {formatTime(r.createdAt)} · {r.entity}</p>
                  </div>
                </div>
              ))
            )}
          </div>
          <p className="m-0 mt-3 text-[11px]" style={{ color: "var(--app-text-disabled)" }}>Each entry links back to its source module — Staff never stores a second copy.</p>
        </div>

        <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-3 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Assigned tasks</h3>
          {myTasks.length === 0 ? (
            <p className="m-0 py-[26px] text-center text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>No open tasks assigned.</p>
          ) : (
            <div className="flex flex-col gap-[9px]">
              {myTasks.map((t) => {
                const c = priChip(t.priority);
                return (
                  <div key={t.id} className="rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full text-[10px] font-extrabold" style={{ padding: "2px 8px", background: c.bg, color: c.fg }}>{t.priority === "urgent" ? "High" : "Normal"}</span>
                      <span className="text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>{t.type} · {formatRelativeDue(t.ageMs)}</span>
                    </div>
                    <p className="m-0 mt-1.5 text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{t.title}</p>
                  </div>
                );
              })}
            </div>
          )}
          <button type="button" onClick={() => router.push("/staff/tasks")} className="mt-3 w-full rounded-[11px] py-2.5 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Open all tasks</button>
        </div>
      </div>
    </main>
  );
}

function formatRelativeDue(ageMs: number): string {
  const hours = ageMs / (60 * 60 * 1000);
  if (hours < 24) return "today";
  return `${Math.round(hours / 24)}d ago`;
}
