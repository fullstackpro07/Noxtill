"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAttendance,
  fetchStaffList,
  fetchShifts,
  fetchTimesheetSettings,
  toggleAttendance,
  createManualAttendance,
  correctAttendance,
  type AttendanceRow,
  type Shift,
} from "@/lib/staff-api";
import { fetchBranches } from "@/lib/branches-api";
import { useSession } from "@/lib/session";
import {
  SimpleKpiTile,
  KpiSkeleton,
  Chip,
  selectStyle,
  outlineBtnStyle,
  primaryBtnStyle,
  handleFakeOption,
  exportCsv,
  DisclosureNote,
  CenterModal,
  bars,
  lineOf,
} from "@/components/staff/staff-ui";
import { DrawerLabel } from "@/components/shared/side-drawer";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function recentDays(count = 5): { value: string; label: string }[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    return { value: isoDate(d), label: i === 0 ? "Today" : i === 1 ? "Yesterday" : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d) };
  });
}

function recentMonths(count = 6): { start: Date; end: Date; label: string }[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - 1 - i), 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    return { start, end, label: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(start) };
  });
}

function durationHours(checkIn: string, checkOut: string | null, now: number): number {
  const end = checkOut ? new Date(checkOut).getTime() : now;
  return Math.max(0, (end - new Date(checkIn).getTime()) / (60 * 60 * 1000));
}

function attendanceStatus(row: AttendanceRow, shiftsForDay: Shift[], lateThresholdMinutes: number): "In" | "Out" | "Late" {
  if (row.checkOut !== null) return "Out";
  const shift = shiftsForDay.find((s) => s.staffUserId === row.staffUserId);
  if (shift) {
    const graceMs = lateThresholdMinutes * 60 * 1000;
    if (new Date(row.checkIn).getTime() > new Date(shift.startsAt).getTime() + graceMs) return "Late";
  }
  return "In";
}

export function AttendanceView() {
  const session = useSession();
  const isManager = session.user.role !== "staff";
  const queryClient = useQueryClient();
  const days = useMemo(() => recentDays(), []);
  const [date, setDate] = useState(days[0].value);
  const [staffFilter, setStaffFilter] = useState("All staff");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [manualOpen, setManualOpen] = useState(false);
  const [correcting, setCorrecting] = useState<AttendanceRow | null>(null);

  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd = new Date(new Date(dayStart).getTime() + 24 * 60 * 60 * 1000).toISOString();

  const { data: staffList = [] } = useQuery({ queryKey: ["staff-list"], queryFn: () => fetchStaffList() });
  const { data: rows = [], isPending, isError, refetch } = useQuery({ queryKey: ["attendance", date], queryFn: () => fetchAttendance({ from: dayStart, to: dayEnd }) });
  const { data: shiftsToday = [] } = useQuery({ queryKey: ["shifts", "day", date], queryFn: () => fetchShifts({ from: dayStart, to: dayEnd }) });
  const { data: settings } = useQuery({ queryKey: ["timesheet-settings"], queryFn: fetchTimesheetSettings });
  const { data: branches = [] } = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });

  const { data: myRows = [] } = useQuery({
    queryKey: ["attendance", "self", session.user.businessUserId],
    queryFn: () => fetchAttendance({ staffUserId: session.user.businessUserId ?? undefined }),
    enabled: !!session.user.businessUserId,
  });
  const myOpenRow = myRows.find((r) => r.checkOut === null);

  const toggleMutation = useMutation({
    mutationFn: toggleAttendance,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      toast.success(result.checkOut ? "Checked out." : "Checked in.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't record this — please try again."),
  });

  const lateThreshold = settings?.lateThresholdMinutes ?? 10;
  const now = new Date().getTime();

  const enriched = rows.map((r) => ({ ...r, status: attendanceStatus(r, shiftsToday, lateThreshold), hours: durationHours(r.checkIn, r.checkOut, now) }));
  const scheduledStaffIds = new Set(shiftsToday.map((s) => s.staffUserId));
  const attendedStaffIds = new Set(rows.map((r) => r.staffUserId));
  const absentStaff = staffList.filter((s) => s.active && scheduledStaffIds.has(s.id) && !attendedStaffIds.has(s.id));

  const filtered = enriched.filter((r) => {
    if (staffFilter !== "All staff" && r.staffName !== staffFilter) return false;
    if (statusFilter !== "All statuses" && r.status !== statusFilter) return false;
    return true;
  });

  const presentCount = new Set(rows.map((r) => r.staffUserId)).size;
  const lateCount = enriched.filter((r) => r.status === "Late").length;
  const totalHoursToday = enriched.reduce((a, r) => a + r.hours, 0);

  const hoursPerStaffMap = new Map<string, number>();
  for (const r of enriched) hoursPerStaffMap.set(r.staffName, (hoursPerStaffMap.get(r.staffName) ?? 0) + r.hours);
  const hoursPerStaffData = Array.from(hoursPerStaffMap.entries());
  const hoursBars = bars(hoursPerStaffData.map(([, h]) => h), Math.max(1, ...hoursPerStaffData.map(([, h]) => h)), 620, 96, 10);

  const months = useMemo(() => recentMonths(), []);
  const { data: trendShifts = [] } = useQuery({
    queryKey: ["shifts", "trend", months[0].start.toISOString()],
    queryFn: () => fetchShifts({ from: months[0].start.toISOString(), to: months[months.length - 1].end.toISOString() }),
  });
  const { data: trendAttendance = [] } = useQuery({
    queryKey: ["attendance", "trend", months[0].start.toISOString()],
    queryFn: () => fetchAttendance({ from: months[0].start.toISOString(), to: months[months.length - 1].end.toISOString() }),
  });
  const attRateByMonth = months.map((m) => {
    const scheduledDays = new Set(trendShifts.filter((s) => new Date(s.startsAt) >= m.start && new Date(s.startsAt) < m.end).map((s) => `${s.staffUserId}:${s.startsAt.slice(0, 10)}`));
    const attendedDays = new Set(trendAttendance.filter((a) => new Date(a.checkIn) >= m.start && new Date(a.checkIn) < m.end).map((a) => `${a.staffUserId}:${a.checkIn.slice(0, 10)}`));
    if (scheduledDays.size === 0) return null;
    let matched = 0;
    for (const key of scheduledDays) if (attendedDays.has(key)) matched++;
    return Math.round((matched / scheduledDays.size) * 100);
  });
  const validRatePoints = attRateByMonth.filter((v): v is number => v !== null);
  const attRateChart = validRatePoints.length >= 2 ? lineOf(validRatePoints, Math.min(70, ...validRatePoints), 100, 620, 100, 12) : null;

  function doExport() {
    exportCsv(
      `attendance-${date}.csv`,
      ["Staff", "Check-in", "Check-out", "Hours", "Status", "Edited"],
      filtered.map((r) => [r.staffName, r.checkIn, r.checkOut ?? "", r.hours.toFixed(1), r.status, r.edited ? "Yes" : "No"]),
    );
  }

  if (isError) {
    return (
      <div className="mx-6 mt-6 rounded-[16px] p-6 text-center" style={{ background: "var(--app-surface)", border: "1px solid #FDD9D6" }}>
        <p className="m-0 text-[14.5px] font-extrabold" style={{ color: "#B42318" }}>Unable to save attendance</p>
        <button type="button" onClick={() => refetch()} className="mt-3.5 rounded-[12px] px-5 py-3 text-[13px] font-extrabold text-white" style={primaryBtnStyle()}>Retry</button>
      </div>
    );
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[9px]">
        <select value={date} onChange={(e) => { if (handleFakeOption(e.target.value)) return; setDate(e.target.value); }} aria-label="Date" className="rounded-[11px]" style={selectStyle}>
          {days.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          <option>+ Add your own…</option>
        </select>
        <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} aria-label="Staff" className="rounded-[11px]" style={selectStyle}>
          <option>All staff</option>
          {staffList.map((s) => <option key={s.id}>{s.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status" className="rounded-[11px]" style={selectStyle}>
          <option>All statuses</option>
          <option>In</option>
          <option>Out</option>
          <option>Late</option>
        </select>
        <select
          onChange={(e) => {
            if (handleFakeOption(e.target.value)) return;
            if (e.target.value !== "All branches") toast.info("Cross-branch attendance isn't available yet — switch business context to view another branch's data.");
          }}
          aria-label="Branch"
          defaultValue="All branches"
          className="rounded-[11px]"
          style={selectStyle}
        >
          <option>All branches</option>
          {branches.filter((b) => b.id !== session.business.id).map((b) => <option key={b.id}>{b.name}</option>)}
          <option>+ Add your own…</option>
        </select>
        {!isManager && (
          <button type="button" onClick={() => toggleMutation.mutate()} disabled={toggleMutation.isPending} className="rounded-[11px] px-4 py-2.5 text-[12.5px] font-extrabold text-white" style={primaryBtnStyle(myOpenRow ? "#B42318" : undefined)}>
            {toggleMutation.isPending ? "Recording…" : myOpenRow ? "Clock myself out" : "Clock myself in"}
          </button>
        )}
        <button type="button" onClick={doExport} className="rounded-[11px]" style={outlineBtnStyle}>Export</button>
        {isManager && <button type="button" onClick={() => setManualOpen(true)} className="ml-auto rounded-[11px] px-4 py-2.5 text-[12.5px] font-extrabold text-white" style={primaryBtnStyle()}>Manual Check-in/Out</button>}
      </div>

      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        {isPending ? (
          <KpiSkeleton count={4} />
        ) : (
          <>
            <SimpleKpiTile label="Present Today" labelColor="#0E8442" value={String(presentCount)} valueSize={22} border="1.5px solid #BFE7CF" />
            <SimpleKpiTile label="Absent" value={String(absentStaff.length)} valueSize={22} valueColor="#B42318" />
            <SimpleKpiTile label="Late" value={String(lateCount)} valueSize={22} valueColor="#B54708" />
            <SimpleKpiTile label="Total Hours Today" value={`${totalHoursToday.toFixed(1)} h`} valueSize={22} />
          </>
        )}
      </div>

      <div className="grid gap-[15px]" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
        <div className="min-w-0 rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 17 }}>
          <h3 className="m-0 mb-1.5 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Attendance rate trend</h3>
          {!attRateChart ? (
            <div className="flex h-[130px] items-center justify-center text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Not enough scheduled shifts yet to compute a trend.</div>
          ) : (
            <svg viewBox="0 0 620 130" style={{ width: "100%", height: 130, display: "block" }}>
              <path d={attRateChart.area} fill="rgba(18,161,80,.10)" />
              <path d={attRateChart.line} fill="none" stroke="#12A150" strokeWidth={2.2} strokeLinejoin="round" />
              {attRateChart.pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={3} fill="#fff" stroke="#12A150" strokeWidth={1.6} />)}
            </svg>
          )}
        </div>
        <div className="min-w-0 rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 17 }}>
          <h3 className="m-0 mb-1.5 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Hours per staff today</h3>
          {hoursPerStaffData.length === 0 ? (
            <div className="flex h-[96px] items-center justify-center text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>No attendance recorded yet today.</div>
          ) : (
            <svg viewBox="0 0 620 120" style={{ width: "100%", height: 120, display: "block" }}>
              {hoursBars.map((b, i) => (
                <g key={i}>
                  <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={4} fill="#12A150" />
                  <text x={b.cx} y={112} textAnchor="middle" fontSize={10} fill="#667085" fontWeight={600}>{hoursPerStaffData[i][0].split(" ")[0]}</text>
                </g>
              ))}
            </svg>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        {filtered.length === 0 ? (
          <div className="text-center" style={{ padding: "52px 18px" }}>
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No attendance recorded for this day</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 820 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Staff</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Check-in</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Check-out</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Total hours</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Status</th>
                  {isManager && <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                    <td style={{ padding: "12px 17px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text)" }}>
                      {r.staffName}{r.edited && <span className="ml-1.5 rounded-full text-[10px] font-extrabold" style={{ padding: "1px 7px", background: "#FEF6E7", color: "#B54708" }}>Edited</span>}
                    </td>
                    <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-faint)" }}>{new Date(r.checkIn).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</td>
                    <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-faint)" }}>{r.checkOut ? new Date(r.checkOut).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "—"}</td>
                    <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-faint)", textAlign: "right" }}>{r.hours.toFixed(1)} h</td>
                    <td style={{ padding: 12 }}><Chip label={r.status} /></td>
                    {isManager && (
                      <td style={{ padding: "12px 17px", textAlign: "right" }}>
                        <button type="button" onClick={() => setCorrecting(r)} className="rounded-[9px] text-[11.5px] font-bold" style={{ ...outlineBtnStyle, minHeight: 34, padding: "6px 10px" }}>Correct entry</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DisclosureNote>Corrections never overwrite history — the original value stays in the activity log with the reason you gave.</DisclosureNote>

      {manualOpen && <ManualEntryModal staffList={staffList.filter((s) => s.active)} defaultDate={date} onClose={() => setManualOpen(false)} />}
      {correcting && <CorrectionModal row={correcting} onClose={() => setCorrecting(null)} />}
    </main>
  );
}

function ManualEntryModal({ staffList, defaultDate, onClose }: { staffList: { id: string; name: string }[]; defaultDate: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [staffUserId, setStaffUserId] = useState(staffList[0]?.id ?? "");
  const [checkInTime, setCheckInTime] = useState("09:00");
  const [checkOutTime, setCheckOutTime] = useState("17:00");
  const [reason, setReason] = useState("");

  const valid = staffUserId !== "" && reason.trim() !== "" && checkInTime < checkOutTime;

  const mutation = useMutation({
    mutationFn: () =>
      createManualAttendance({
        staffUserId,
        checkIn: `${defaultDate}T${checkInTime}:00.000Z`,
        checkOut: `${defaultDate}T${checkOutTime}:00.000Z`,
        reason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      toast.success("Entry saved and flagged as edited — the original is kept in the activity log.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this entry — please try again."),
  });

  return (
    <CenterModal
      title="Manual Check-in / Out"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-[11px] px-4 py-2.5 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Cancel</button>
          <button type="button" disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()} className="rounded-[11px] px-5 py-2.5 text-[12.5px] font-extrabold text-white disabled:opacity-50" style={primaryBtnStyle()}>
            {mutation.isPending ? "Saving…" : "Save Entry"}
          </button>
        </>
      }
    >
      <div>
        <DrawerLabel>Staff</DrawerLabel>
        <select value={staffUserId} onChange={(e) => setStaffUserId(e.target.value)} style={selectStyle} className="w-full">
          {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div>
        <DrawerLabel>Date</DrawerLabel>
        <input type="text" disabled value={defaultDate} className="w-full rounded-[10px] px-3 py-2.5 text-[13px]" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-faint)" }} />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <DrawerLabel>Check-in</DrawerLabel>
          <input type="time" value={checkInTime} onChange={(e) => setCheckInTime(e.target.value)} className="w-full rounded-[10px] px-3 py-2.5 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
        </div>
        <div>
          <DrawerLabel>Check-out</DrawerLabel>
          <input type="time" value={checkOutTime} onChange={(e) => setCheckOutTime(e.target.value)} className="w-full rounded-[10px] px-3 py-2.5 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
        </div>
      </div>
      <div>
        <DrawerLabel>Reason (required)</DrawerLabel>
        <select value={reason} onChange={(e) => setReason(e.target.value)} style={selectStyle} className="w-full">
          <option value="">Select…</option>
          <option value="Forgot to clock in">Forgot to clock in</option>
          <option value="Forgot to clock out">Forgot to clock out</option>
          <option value="Device/app issue">Device/app issue</option>
          <option value="Other">Other</option>
        </select>
      </div>
      <DisclosureNote>This entry will be flagged as edited, with your name and reason recorded in the activity log.</DisclosureNote>
    </CenterModal>
  );
}

function CorrectionModal({ row, onClose }: { row: AttendanceRow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [checkInTime, setCheckInTime] = useState(new Date(row.checkIn).toISOString().slice(11, 16));
  const [checkOutTime, setCheckOutTime] = useState(row.checkOut ? new Date(row.checkOut).toISOString().slice(11, 16) : "");
  const [note, setNote] = useState("");

  const dateKey = row.checkIn.slice(0, 10);
  const valid = note.trim() !== "";

  const mutation = useMutation({
    mutationFn: () =>
      correctAttendance(row.id, {
        checkIn: `${dateKey}T${checkInTime}:00.000Z`,
        checkOut: checkOutTime ? `${dateKey}T${checkOutTime}:00.000Z` : null,
        note,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      toast.success("Correction saved. The original value is preserved in the audit trail.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this correction — please try again."),
  });

  return (
    <CenterModal
      title="Correct Entry"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-[11px] px-4 py-2.5 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Cancel</button>
          <button type="button" disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()} className="rounded-[11px] px-5 py-2.5 text-[12.5px] font-extrabold text-white disabled:opacity-50" style={primaryBtnStyle()}>
            {mutation.isPending ? "Saving…" : "Save Correction"}
          </button>
        </>
      }
    >
      <p className="m-0 text-[13px] font-bold" style={{ color: "var(--app-text)" }}>{row.staffName}</p>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-[11px] p-2.5" style={{ background: "var(--app-surface-2)" }}>
          <DrawerLabel>Original</DrawerLabel>
          <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>
            {new Date(row.checkIn).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – {row.checkOut ? new Date(row.checkOut).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "—"}
          </p>
        </div>
        <div className="rounded-[11px] p-2.5" style={{ background: "#F7FCF9", border: "1px solid #BFE7CF" }}>
          <DrawerLabel>Corrected</DrawerLabel>
          <div className="flex flex-col gap-1.5">
            <input type="time" value={checkInTime} onChange={(e) => setCheckInTime(e.target.value)} className="w-full rounded-[8px] px-2 py-1.5 text-[12.5px]" style={{ border: "1px solid var(--app-border)" }} />
            <input type="time" value={checkOutTime} onChange={(e) => setCheckOutTime(e.target.value)} className="w-full rounded-[8px] px-2 py-1.5 text-[12.5px]" style={{ border: "1px solid var(--app-border)" }} />
          </div>
        </div>
      </div>
      <div>
        <DrawerLabel>Audit note (required)</DrawerLabel>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded-[10px] p-2.5 text-[13px]" style={{ border: "1px solid var(--app-border)" }} placeholder="Why is this being corrected?" />
      </div>
      <DisclosureNote>The original value is preserved permanently in the activity log — corrections add a record, they never replace one.</DisclosureNote>
    </CenterModal>
  );
}
