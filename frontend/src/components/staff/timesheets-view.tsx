"use client";

import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  fetchTimesheets,
  approveTimesheet,
  fetchTimesheetSettings,
  updateTimesheetSettings,
  fetchAttendance,
  correctAttendance,
  type AttendanceRow,
} from "@/lib/staff-api";
import {
  SimpleKpiTile,
  KpiSkeleton,
  Chip,
  ToggleSwitch,
  selectStyle,
  outlineBtnStyle,
  primaryBtnStyle,
  exportCsv,
  recentMonths,
  bars,
  DisclosureNote,
  CenterModal,
} from "@/components/staff/staff-ui";
import { DrawerLabel } from "@/components/shared/side-drawer";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

function durationHours(checkIn: string, checkOut: string | null, breakMinutesPerShift: number, breakThresholdHours: number, now: number): { hours: number; brokeThreshold: boolean } {
  const end = checkOut ? new Date(checkOut).getTime() : now;
  const raw = Math.max(0, (end - new Date(checkIn).getTime()) / (60 * 60 * 1000));
  const brokeThreshold = raw > breakThresholdHours;
  return { hours: brokeThreshold ? Math.max(0, raw - breakMinutesPerShift / 60) : raw, brokeThreshold };
}

export function TimesheetsView() {
  const months = useMemo(() => recentMonths(), []);
  const [month, setMonth] = useState(months[0].value);
  const [staffFilter, setStaffFilter] = useState("All staff");
  const [approvedFilter, setApprovedFilter] = useState("All entries");
  const [overtimeOnly, setOvertimeOnly] = useState(false);
  const [breakRulesOpen, setBreakRulesOpen] = useState(false);
  const [otConfigOpen, setOtConfigOpen] = useState(false);
  const [approveAllOpen, setApproveAllOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const { data: rows = [], isPending, isError, refetch } = useQuery({ queryKey: ["timesheets", month], queryFn: () => fetchTimesheets(month) });
  const { data: settings } = useQuery({ queryKey: ["timesheet-settings"], queryFn: fetchTimesheetSettings });

  const approveMutation = useMutation({
    mutationFn: (staffUserId: string) => approveTimesheet(staffUserId, month),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timesheets", month] });
      toast.success("Timesheet approved.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't approve this timesheet — please try again."),
  });

  const approveAllMutation = useMutation({
    mutationFn: async () => {
      const unapproved = rows.filter((r) => !r.approved);
      await Promise.all(unapproved.map((r) => approveTimesheet(r.businessUserId, month)));
      return unapproved.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["timesheets", month] });
      toast.success(`${count} entries approved.`);
      setApproveAllOpen(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't approve all entries — please try again."),
  });

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filtered = rows.filter((r) => {
    if (staffFilter !== "All staff" && r.name !== staffFilter) return false;
    if (approvedFilter === "Approved only" && !r.approved) return false;
    if (approvedFilter === "Unapproved only" && r.approved) return false;
    if (overtimeOnly && r.overtimeHours <= 0) return false;
    return true;
  });

  const totalHours = rows.reduce((a, r) => a + r.hoursWorked, 0);
  const totalOvertime = rows.reduce((a, r) => a + r.overtimeHours, 0);
  const avgPerStaff = rows.length > 0 ? totalHours / rows.length : 0;
  const unapprovedCount = rows.filter((r) => !r.approved).length;

  const hoursPerStaffBars = bars(rows.map((r) => r.hoursWorked), Math.max(1, ...rows.map((r) => r.hoursWorked)), 620, 96, 10);

  function doExport() {
    exportCsv(
      `timesheets-${month}.csv`,
      ["Staff", "Hours worked", "Overtime", "Scheduled shifts", "Approved"],
      filtered.map((r) => [r.name, r.hoursWorked, r.overtimeHours, r.scheduledShiftCount, r.approved ? "Yes" : "No"]),
    );
  }

  if (isError) {
    return (
      <div className="mx-6 mt-6 rounded-[16px] p-6 text-center" style={{ background: "var(--app-surface)", border: "1px solid #FDD9D6" }}>
        <p className="m-0 text-[14.5px] font-extrabold" style={{ color: "#B42318" }}>Unable to load timesheets</p>
        <button type="button" onClick={() => refetch()} className="mt-3.5 rounded-[12px] px-5 py-3 text-[13px] font-extrabold text-white" style={primaryBtnStyle()}>Retry</button>
      </div>
    );
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[9px]">
        <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Period" className="rounded-[11px]" style={selectStyle}>
          {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} aria-label="Staff" className="rounded-[11px]" style={selectStyle}>
          <option>All staff</option>
          {rows.map((r) => <option key={r.businessUserId}>{r.name}</option>)}
        </select>
        <select value={approvedFilter} onChange={(e) => setApprovedFilter(e.target.value)} aria-label="Approval status" className="rounded-[11px]" style={selectStyle}>
          <option>All entries</option>
          <option>Approved only</option>
          <option>Unapproved only</option>
        </select>
        <span className="flex items-center gap-[9px] rounded-[11px]" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", padding: "9px 13px", minHeight: 44 }}>
          <span className="text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>Overtime only</span>
          <ToggleSwitch on={overtimeOnly} onToggle={() => setOvertimeOnly((v) => !v)} label="Overtime only" />
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-[9px]">
          <button type="button" onClick={() => setBreakRulesOpen(true)} className="rounded-[11px]" style={outlineBtnStyle}>Break Rules</button>
          <button type="button" onClick={() => setOtConfigOpen(true)} className="rounded-[11px]" style={outlineBtnStyle}>Overtime Thresholds</button>
          <button type="button" onClick={doExport} className="rounded-[11px]" style={outlineBtnStyle}>Export</button>
          <button type="button" onClick={() => setApproveAllOpen(true)} disabled={unapprovedCount === 0} className="rounded-[11px] px-4 py-2.5 text-[12.5px] font-extrabold text-white disabled:opacity-50" style={primaryBtnStyle()}>Approve All</button>
        </div>
      </div>

      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        {isPending ? (
          <KpiSkeleton count={4} />
        ) : (
          <>
            <SimpleKpiTile label="Total Hours" value={`${totalHours.toFixed(0)} h`} valueSize={22} />
            <SimpleKpiTile label="Overtime Hours" labelColor="#B54708" value={`${totalOvertime.toFixed(0)} h`} valueSize={22} border="1.5px solid #FDE3B3" />
            <SimpleKpiTile label="Average Per Staff" value={`${avgPerStaff.toFixed(1)} h`} valueSize={22} />
            <SimpleKpiTile label="Unapproved Entries" value={String(unapprovedCount)} valueSize={22} valueColor="#B54708" />
          </>
        )}
      </div>

      <div className="rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 17 }}>
        <h3 className="m-0 mb-2 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Hours per staff</h3>
        {rows.length === 0 ? (
          <div className="flex h-[96px] items-center justify-center text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>No staff to report on this month.</div>
        ) : (
          <svg viewBox="0 0 620 120" style={{ width: "100%", height: 120, display: "block" }}>
            {hoursPerStaffBars.map((b, i) => (
              <g key={i}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={4} fill="#12A150" />
                <text x={b.cx} y={112} textAnchor="middle" fontSize={10} fill="#667085" fontWeight={600}>{rows[i].name.split(" ")[0]}</text>
              </g>
            ))}
          </svg>
        )}
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        {filtered.length === 0 ? (
          <div className="text-center" style={{ padding: "52px 18px" }}>
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No staff to report on</div>
            <div className="mt-1.5 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Timesheets are computed from real attendance for this month.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 820 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th style={{ width: 30 }} />
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Staff</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Hours</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Overtime</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Scheduled shifts</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Status</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <Fragment key={r.businessUserId}>
                    <tr style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                      <td style={{ padding: "12px 0 12px 17px" }}>
                        <button type="button" onClick={() => toggleExpand(r.businessUserId)} aria-label="View sessions" style={{ color: "var(--app-text-faint)" }}>
                          {expanded.has(r.businessUserId) ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                        </button>
                      </td>
                      <td style={{ padding: 12, fontSize: 12.5, fontWeight: 700, color: "var(--app-text)" }}>{r.name}</td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-faint)", textAlign: "right" }}>{r.hoursWorked} h</td>
                      <td style={{ padding: 12, textAlign: "right" }}>{r.overtimeHours > 0 ? <span className="text-[12.5px] font-bold" style={{ color: "#B54708" }}>+{r.overtimeHours} h</span> : <span className="text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>—</span>}</td>
                      <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-faint)", textAlign: "right" }}>{r.scheduledShiftCount}</td>
                      <td style={{ padding: 12 }}><Chip label={r.approved ? "Approved" : "Pending"} /></td>
                      <td style={{ padding: "12px 17px", textAlign: "right" }}>
                        {!r.approved && (
                          <button type="button" onClick={() => approveMutation.mutate(r.businessUserId)} disabled={approveMutation.isPending} className="rounded-[9px] text-[11.5px] font-bold" style={{ ...outlineBtnStyle, minHeight: 34, padding: "6px 10px" }}>Approve</button>
                        )}
                      </td>
                    </tr>
                    {expanded.has(r.businessUserId) && (
                      <tr>
                        <td colSpan={7} style={{ padding: 0, background: "var(--app-surface-2)" }}>
                          <SessionsBreakdown staffUserId={r.businessUserId} month={month} settings={settings} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DisclosureNote>Overtime is a rolling weekly total across sessions, not attributable to a single day — expand a row to see its real daily attendance sessions.</DisclosureNote>

      {breakRulesOpen && <BreakRulesModal onClose={() => setBreakRulesOpen(false)} />}
      {otConfigOpen && <OtConfigModal onClose={() => setOtConfigOpen(false)} />}
      {approveAllOpen && (
        <CenterModal
          title="Approve All Entries"
          onClose={() => setApproveAllOpen(false)}
          footer={
            <>
              <button type="button" onClick={() => setApproveAllOpen(false)} className="rounded-[11px] px-4 py-2.5 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Cancel</button>
              <button type="button" onClick={() => approveAllMutation.mutate()} disabled={approveAllMutation.isPending} className="rounded-[11px] px-5 py-2.5 text-[12.5px] font-extrabold text-white" style={primaryBtnStyle()}>
                {approveAllMutation.isPending ? "Approving…" : "Approve All"}
              </button>
            </>
          }
        >
          <p className="m-0 text-[13px] font-bold" style={{ color: "var(--app-text)" }}>Approve {unapprovedCount} entries?</p>
          <DisclosureNote>Approved hours feed straight into the payroll sheet. You can still correct an underlying attendance entry afterwards — each correction is logged.</DisclosureNote>
        </CenterModal>
      )}
    </main>
  );
}

function SessionsBreakdown({ staffUserId, month, settings }: { staffUserId: string; month: string; settings?: { breakThresholdHours: number; breakMinutesPerShift: number } }) {
  const from = `${month}-01T00:00:00.000Z`;
  const to = new Date(new Date(from).getFullYear(), new Date(from).getMonth() + 1, 1).toISOString();
  const { data: sessions = [], isPending } = useQuery({ queryKey: ["attendance", "sessions", staffUserId, month], queryFn: () => fetchAttendance({ staffUserId, from, to }) });
  const [correcting, setCorrecting] = useState<AttendanceRow | null>(null);
  const now = new Date().getTime();
  const breakThreshold = settings?.breakThresholdHours ?? 6;
  const breakMinutes = settings?.breakMinutesPerShift ?? 30;

  if (isPending) return <div className="p-3 text-[12px]" style={{ color: "var(--app-text-disabled)" }}>Loading sessions…</div>;
  if (sessions.length === 0) return <div className="p-3 text-[12px]" style={{ color: "var(--app-text-disabled)" }}>No attendance sessions this month.</div>;

  return (
    <div className="flex flex-col gap-1.5 p-3">
      {sessions.map((s) => {
        const { hours, brokeThreshold } = durationHours(s.checkIn, s.checkOut, breakMinutes, breakThreshold, now);
        return (
          <div key={s.id} className="flex items-center justify-between rounded-[9px] px-3 py-2" style={{ background: "var(--app-surface)" }}>
            <span className="text-[11.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{new Date(s.checkIn).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
            <span className="text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>{new Date(s.checkIn).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – {s.checkOut ? new Date(s.checkOut).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "—"}</span>
            <span className="text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>{brokeThreshold ? `${breakMinutes} min break` : "—"}</span>
            <span className="text-[11.5px] font-bold" style={{ color: "var(--app-text)" }}>{hours.toFixed(1)} h</span>
            {s.edited && <Chip label="Edited" />}
            <button type="button" onClick={() => setCorrecting(s)} className="rounded-[8px] text-[11px] font-bold" style={{ ...outlineBtnStyle, minHeight: 28, padding: "4px 8px" }}>Correct</button>
          </div>
        );
      })}
      {correcting && <SessionCorrectionModal row={correcting} onClose={() => setCorrecting(null)} />}
    </div>
  );
}

function SessionCorrectionModal({ row, onClose }: { row: AttendanceRow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [checkInTime, setCheckInTime] = useState(row.checkIn.slice(11, 16));
  const [checkOutTime, setCheckOutTime] = useState(row.checkOut ? row.checkOut.slice(11, 16) : "");
  const [note, setNote] = useState("");
  const dateKey = row.checkIn.slice(0, 10);
  const valid = note.trim() !== "";

  const mutation = useMutation({
    mutationFn: () => correctAttendance(row.id, { checkIn: `${dateKey}T${checkInTime}:00.000Z`, checkOut: checkOutTime ? `${dateKey}T${checkOutTime}:00.000Z` : null, note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      queryClient.invalidateQueries({ queryKey: ["timesheets"] });
      toast.success("Correction saved. The original value is preserved in the audit trail.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this correction — please try again."),
  });

  return (
    <CenterModal
      title="Correct Time Entry"
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
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded-[10px] p-2.5 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
      </div>
    </CenterModal>
  );
}

function BreakRulesModal({ onClose }: { onClose: () => void }) {
  const { data: settings, isPending } = useQuery({ queryKey: ["timesheet-settings"], queryFn: fetchTimesheetSettings });
  const [breakThreshold, setBreakThreshold] = useState<string | null>(null);
  const [breakMinutes, setBreakMinutes] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const threshold = breakThreshold ?? String(settings?.breakThresholdHours ?? "");
  const minutes = breakMinutes ?? String(settings?.breakMinutesPerShift ?? "");

  const mutation = useMutation({
    mutationFn: () => updateTimesheetSettings({ breakThresholdHours: Number(threshold), breakMinutesPerShift: Number(minutes) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timesheet-settings"] });
      toast.success("Rules updated.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save these rules — please try again."),
  });

  return (
    <CenterModal
      title="Break Rules"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-[11px] px-4 py-2.5 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Cancel</button>
          <button type="button" disabled={isPending || mutation.isPending} onClick={() => mutation.mutate()} className="rounded-[11px] px-5 py-2.5 text-[12.5px] font-extrabold text-white" style={primaryBtnStyle()}>
            {mutation.isPending ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div>
        <DrawerLabel>Minimum shift length before a break applies (hours)</DrawerLabel>
        <input type="number" min={1} value={threshold} onChange={(e) => setBreakThreshold(e.target.value)} className="w-full rounded-[10px] px-3 py-2.5 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
      </div>
      <div>
        <DrawerLabel>Unpaid break deducted (minutes)</DrawerLabel>
        <input type="number" min={0} value={minutes} onChange={(e) => setBreakMinutes(e.target.value)} className="w-full rounded-[10px] px-3 py-2.5 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
      </div>
      <DisclosureNote>Deducted from any single attendance session longer than the threshold above.</DisclosureNote>
    </CenterModal>
  );
}

function OtConfigModal({ onClose }: { onClose: () => void }) {
  const { data: settings, isPending } = useQuery({ queryKey: ["timesheet-settings"], queryFn: fetchTimesheetSettings });
  const [weeklyThreshold, setWeeklyThreshold] = useState<string | null>(null);
  const [multiplier, setMultiplier] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const threshold = weeklyThreshold ?? String(settings?.overtimeThresholdHoursPerWeek ?? "");
  const rate = multiplier ?? String(settings?.overtimeRateMultiplier ?? "");

  const mutation = useMutation({
    mutationFn: () => updateTimesheetSettings({ overtimeThresholdHoursPerWeek: Number(threshold), overtimeRateMultiplier: Number(rate) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["timesheet-settings"] });
      toast.success("Settings saved.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save these settings — please try again."),
  });

  return (
    <CenterModal
      title="Overtime Thresholds"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-[11px] px-4 py-2.5 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Cancel</button>
          <button type="button" disabled={isPending || mutation.isPending} onClick={() => mutation.mutate()} className="rounded-[11px] px-5 py-2.5 text-[12.5px] font-extrabold text-white" style={primaryBtnStyle()}>
            {mutation.isPending ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div>
        <DrawerLabel>Weekly overtime threshold (hours)</DrawerLabel>
        <input type="number" min={1} value={threshold} onChange={(e) => setWeeklyThreshold(e.target.value)} className="w-full rounded-[10px] px-3 py-2.5 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
      </div>
      <div>
        <DrawerLabel>Overtime pay multiplier</DrawerLabel>
        <input type="number" min={1} step={0.1} value={rate} onChange={(e) => setMultiplier(e.target.value)} className="w-full rounded-[10px] px-3 py-2.5 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
      </div>
      <div className="rounded-[11px] p-3 text-[12px] leading-relaxed" style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", color: "#93370D" }}>
        Noxtill flags overtime hours for you. It does not calculate overtime pay or apply local labour law — check your own requirements.
      </div>
    </CenterModal>
  );
}
