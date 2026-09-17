"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PosModalShell } from "@/components/pos/pos-modal-shell";
import { weekDates } from "@/lib/bookings";
import { fetchAppointments } from "@/lib/bookings-api";
import {
  fetchStaff,
  fetchShifts,
  createShift,
  deleteShift,
  fetchTimeOff,
  requestTimeOff,
  approveTimeOff,
  type Shift,
  type TimeOff,
} from "@/lib/staff-api";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const selectStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 10, padding: "9px 11px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 42 };
const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 10, padding: "9px 13px", fontSize: 12, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 42 };
const primaryBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 10, padding: "9px 16px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 42 };
const cancelModalBtn: React.CSSProperties = { background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)" };
const primaryModalBtn: React.CSSProperties = { background: "var(--app-primary)", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff" };
const fieldStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 10, padding: 9, fontSize: 12.5, minHeight: 42 };

function weekOffsetAnchor(weeks: number): string {
  const d = new Date();
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function AvailabilityPanel() {
  const session = useSession();
  const queryClient = useQueryClient();
  const isStaffOnly = session.user.role === "staff";
  const [staffFilter, setStaffFilter] = useState(isStaffOnly ? session.user.businessUserId ?? "" : "");
  const [weekOffset, setWeekOffset] = useState<-1 | 0 | 1>(0);
  const [hoursFor, setHoursFor] = useState<{ staffId: string; staffName: string } | null>(null);
  const [timeOffOpen, setTimeOffOpen] = useState(false);
  const [patternOpen, setPatternOpen] = useState(false);
  const [copyWeekConfirm, setCopyWeekConfirm] = useState(false);
  const [applyAllConfirm, setApplyAllConfirm] = useState(false);

  const anchor = weekOffsetAnchor(weekOffset);
  const dates = weekDates(anchor);
  const from = new Date(`${dates[0]}T00:00:00`).toISOString();
  const to = new Date(`${dates[6]}T23:59:59.999`).toISOString();

  const { data: allStaff = [] } = useQuery({ queryKey: ["staff"], queryFn: fetchStaff });
  const staff = isStaffOnly ? allStaff.filter((s) => s.id === session.user.businessUserId) : allStaff;

  const { data: shifts = [] } = useQuery({ queryKey: ["shifts", dates[0], dates[6]], queryFn: () => fetchShifts({ from, to }) });
  const { data: timeOff = [] } = useQuery({ queryKey: ["time-off"], queryFn: () => fetchTimeOff() });
  const { data: appointments = [] } = useQuery({ queryKey: ["appointments", "availability", dates[0], dates[6]], queryFn: () => fetchAppointments({ from, to }) });

  const shiftsByStaffDay = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const s of shifts) {
      const day = s.startsAt.slice(0, 10);
      const key = `${s.staffUserId}:${day}`;
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return map;
  }, [shifts]);

  const timeOffByStaffDay = useMemo(() => {
    const map = new Map<string, TimeOff>();
    for (const t of timeOff) {
      if (t.status !== "approved") continue;
      const start = new Date(t.startsAt);
      const end = new Date(t.endsAt);
      for (const d of dates) {
        const dayStart = new Date(`${d}T00:00:00`);
        const dayEnd = new Date(`${d}T23:59:59.999`);
        if (start < dayEnd && end > dayStart) map.set(`${t.staffUserId}:${d}`, t);
      }
    }
    return map;
  }, [timeOff, dates]);

  function shiftHours(list: Shift[]): number {
    return list.reduce((sum, s) => sum + (new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()) / (1000 * 60 * 60), 0);
  }

  const bookedHoursByStaff = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of appointments) {
      if (!a.staffId || a.status === "cancelled") continue;
      map.set(a.staffId, (map.get(a.staffId) ?? 0) + a.durationHours);
    }
    return map;
  }, [appointments]);

  const perStaff = useMemo(
    () =>
      staff.map((s) => {
        const available = dates.reduce((sum, d) => sum + shiftHours(shiftsByStaffDay.get(`${s.id}:${d}`) ?? []), 0);
        const booked = bookedHoursByStaff.get(s.id) ?? 0;
        return { staff: s, available, booked, pct: available > 0 ? Math.min(100, (booked / available) * 100) : 0 };
      }),
    [staff, dates, shiftsByStaffDay, bookedHoursByStaff],
  );

  const totals = useMemo(() => {
    const available = perStaff.reduce((s, p) => s + p.available, 0);
    const booked = perStaff.reduce((s, p) => s + p.booked, 0);
    return { available, booked, util: available > 0 ? (booked / available) * 100 : 0, unbooked: Math.max(0, available - booked) };
  }, [perStaff]);

  const copyWeekMutation = useMutation({
    mutationFn: async () => {
      const lastAnchor = weekOffsetAnchor(weekOffset - 1);
      const lastDates = weekDates(lastAnchor);
      const lastFrom = new Date(`${lastDates[0]}T00:00:00`).toISOString();
      const lastTo = new Date(`${lastDates[6]}T23:59:59.999`).toISOString();
      const lastWeekShifts = await fetchShifts({ from: lastFrom, to: lastTo });
      const targetStaffIds = staffFilter ? [staffFilter] : staff.map((s) => s.id);

      // Clear this week's shifts first so copying is idempotent, not additive.
      const toDelete = shifts.filter((s) => targetStaffIds.includes(s.staffUserId));
      await Promise.all(toDelete.map((s) => deleteShift(s.id)));

      const creates = lastWeekShifts
        .filter((s) => targetStaffIds.includes(s.staffUserId))
        .map((s) => {
          const newStart = new Date(s.startsAt);
          newStart.setDate(newStart.getDate() + 7);
          const newEnd = new Date(s.endsAt);
          newEnd.setDate(newEnd.getDate() + 7);
          return createShift({ staffUserId: s.staffUserId, startsAt: newStart.toISOString(), endsAt: newEnd.toISOString(), note: s.note ?? undefined });
        });
      return Promise.allSettled(creates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      toast.success("Last week's schedule copied.");
      setCopyWeekConfirm(false);
    },
    onError: () => toast.error("Couldn't copy last week's schedule."),
  });

  const applyAllMutation = useMutation({
    mutationFn: async () => {
      const referenceId = staffFilter || staff[0]?.id;
      if (!referenceId) throw new Error("No staff to copy from");
      const referenceShifts = shifts.filter((s) => s.staffUserId === referenceId);
      const others = staff.filter((s) => s.id !== referenceId);

      const toDelete = shifts.filter((s) => others.some((o) => o.id === s.staffUserId));
      await Promise.all(toDelete.map((s) => deleteShift(s.id)));

      const creates = others.flatMap((o) =>
        referenceShifts.map((s) => createShift({ staffUserId: o.id, startsAt: s.startsAt, endsAt: s.endsAt, note: s.note ?? undefined })),
      );
      return Promise.allSettled(creates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      toast.success("Schedule applied to all staff.");
      setApplyAllConfirm(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't apply this schedule."),
  });

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Availability</h2>
        {!isStaffOnly && (
          <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} aria-label="Staff" style={selectStyle}>
            <option value="">All staff</option>
            {allStaff.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
        <select value={weekOffset} onChange={(e) => setWeekOffset(Number(e.target.value) as -1 | 0 | 1)} aria-label="Week" style={selectStyle}>
          <option value={-1}>Last week</option>
          <option value={0}>This week</option>
          <option value={1}>Next week</option>
        </select>
        {!isStaffOnly && (
          <span className="ms-auto flex flex-wrap gap-2">
            <button type="button" onClick={() => setCopyWeekConfirm(true)} style={outlineBtn}>Copy Last Week</button>
            <button type="button" onClick={() => setApplyAllConfirm(true)} disabled={staff.length < 2} style={{ ...outlineBtn, opacity: staff.length < 2 ? 0.5 : 1 }}>Apply to All Staff</button>
            <button type="button" onClick={() => setPatternOpen(true)} style={outlineBtn}>Recurring Pattern</button>
            <button type="button" onClick={() => setTimeOffOpen(true)} style={outlineBtn}>Add Time Off</button>
            <button type="button" onClick={() => setHoursFor(staff[0] ? { staffId: staff[0].id, staffName: staff[0].name } : null)} disabled={staff.length === 0} style={primaryBtn}>Set Working Hours</button>
          </span>
        )}
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Total Available Hours</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{totals.available.toFixed(0)}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Booked Hours</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-primary)" }}>{totals.booked.toFixed(0)}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Utilisation</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{totals.util.toFixed(0)}%</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Unbooked Hours</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-warning-text)" }}>{totals.unbooked.toFixed(0)}</div>
        </div>
      </div>

      {perStaff.length > 0 && (
        <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-3 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Utilisation per staff</h3>
          <div className="flex flex-col gap-2.5">
            {perStaff.map((p) => (
              <div key={p.staff.id}>
                <div className="mb-1 flex justify-between"><span className="text-[12.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{p.staff.name}</span><span className="text-[11.5px] font-bold" style={{ color: "var(--app-text)" }}>{p.pct.toFixed(0)}%</span></div>
                <div className="h-2 overflow-hidden rounded-[6px]" style={{ background: "var(--app-surface-2)" }}>
                  <div className="h-full rounded-[6px]" style={{ width: `${p.pct}%`, background: "var(--app-primary)" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap items-center gap-3 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Week of {dates[0]} – {dates[6]}</h3>
          <span className="ms-auto text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>Green = working, red = time off.</span>
        </div>
        {staff.length === 0 ? (
          <div className="p-[52px_18px] text-center">
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No staff to schedule yet</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div style={{ minWidth: 900, padding: "15px 17px" }}>
              <div className="mb-2.5 grid gap-2" style={{ gridTemplateColumns: "120px repeat(7,minmax(0,1fr))" }}>
                <span />
                {dates.map((d, i) => (
                  <span key={d} className="text-center text-[11.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>{DAY_LABELS[i]} {Number(d.slice(-2))}</span>
                ))}
              </div>
              {staff.map((s) => {
                const available = dates.reduce((sum, d) => sum + shiftHours(shiftsByStaffDay.get(`${s.id}:${d}`) ?? []), 0);
                const booked = bookedHoursByStaff.get(s.id) ?? 0;
                return (
                  <div key={s.id} className="grid items-stretch gap-2 p-[8px_0]" style={{ gridTemplateColumns: "120px repeat(7,minmax(0,1fr))", borderTop: "1px solid var(--app-border)" }}>
                    <span className="flex flex-col justify-center">
                      <span className="text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{s.name}</span>
                      <span className="mt-0.5 text-[11px]" style={{ color: "var(--app-text-disabled)" }}>{available > 0 ? `${Math.round((booked / available) * 100)}% utilised` : "No hours set"}</span>
                    </span>
                    {dates.map((d) => {
                      const timeOffEntry = timeOffByStaffDay.get(`${s.id}:${d}`);
                      const dayShifts = shiftsByStaffDay.get(`${s.id}:${d}`) ?? [];
                      const isOff = !!timeOffEntry;
                      const hasShift = dayShifts.length > 0;
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => !isStaffOnly && setHoursFor({ staffId: s.id, staffName: s.name })}
                          disabled={isStaffOnly}
                          className="flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-[9px] p-[8px_6px] text-center"
                          style={{
                            border: isOff ? "1px solid #FDA29B" : hasShift ? "1px solid var(--app-success-border)" : "1px solid var(--app-border)",
                            background: isOff ? "#FEF3F2" : hasShift ? "var(--app-success-bg)" : "var(--app-surface-2)",
                          }}
                        >
                          {isOff ? (
                            <span className="text-[11px] font-extrabold" style={{ color: "var(--app-danger-strong)" }}>Off{timeOffEntry.reason ? ` · ${timeOffEntry.reason}` : ""}</span>
                          ) : hasShift ? (
                            <span className="text-[11px] font-extrabold" style={{ color: "var(--app-success-text)" }}>
                              {new Date(dayShifts[0].startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}–{new Date(dayShifts[0].endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                            </span>
                          ) : (
                            <span className="text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Off</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {isStaffOnly && (
        <div className="flex flex-wrap items-center gap-3 rounded-[12px] p-[11px_14px]" style={{ background: "var(--app-warning-bg)", border: "1px solid var(--app-warning-border)" }}>
          <span className="flex-1 text-[12px]" style={{ color: "#93370D" }}>Staff can view their own schedule and request time off — editing others is owner and manager only.</span>
          <button type="button" onClick={() => setTimeOffOpen(true)} style={{ border: "1px solid var(--app-warning-border)", background: "var(--app-surface)", borderRadius: 10, padding: "9px 14px", fontSize: 12, fontWeight: 700, color: "var(--app-warning-text)", minHeight: 42 }}>Request Time Off</button>
        </div>
      )}

      {hoursFor && <WorkingHoursModal staffId={hoursFor.staffId} staffName={hoursFor.staffName} dates={dates} shiftsByStaffDay={shiftsByStaffDay} onClose={() => setHoursFor(null)} />}
      {timeOffOpen && <TimeOffModal staff={staff} isStaffOnly={isStaffOnly} defaultStaffId={staffFilter} onClose={() => setTimeOffOpen(false)} />}
      {patternOpen && <RecurringPatternModal staff={staff} onClose={() => setPatternOpen(false)} />}

      <PosModalShell
        open={copyWeekConfirm}
        onClose={() => setCopyWeekConfirm(false)}
        title="Copy Last Week"
        footer={
          <>
            <button type="button" onClick={() => setCopyWeekConfirm(false)} style={cancelModalBtn}>Cancel</button>
            <button type="button" onClick={() => copyWeekMutation.mutate()} disabled={copyWeekMutation.isPending} style={{ ...primaryModalBtn, opacity: copyWeekMutation.isPending ? 0.6 : 1 }}>
              {copyWeekMutation.isPending ? "Copying…" : "Copy"}
            </button>
          </>
        }
      >
        <p className="m-0 p-[17px] text-[13px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>Last week&apos;s working hours will replace this week&apos;s schedule for {staffFilter ? "this staff member" : "every staff member shown"}.</p>
      </PosModalShell>

      <PosModalShell
        open={applyAllConfirm}
        onClose={() => setApplyAllConfirm(false)}
        title="Apply to All Staff"
        footer={
          <>
            <button type="button" onClick={() => setApplyAllConfirm(false)} style={cancelModalBtn}>Cancel</button>
            <button type="button" onClick={() => applyAllMutation.mutate()} disabled={applyAllMutation.isPending} style={{ ...primaryModalBtn, opacity: applyAllMutation.isPending ? 0.6 : 1 }}>
              {applyAllMutation.isPending ? "Applying…" : "Apply"}
            </button>
          </>
        }
      >
        <p className="m-0 p-[17px] text-[13px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
          {(staffFilter ? staff.find((s) => s.id === staffFilter)?.name : staff[0]?.name) ?? "This staff member"}&apos;s schedule this week will be applied to all {staff.length} staff members shown, replacing their current hours for this week.
        </p>
      </PosModalShell>
    </main>
  );
}

const WEEKDAY_KEYS = [0, 1, 2, 3, 4, 5, 6];

function WorkingHoursModal({
  staffId,
  staffName,
  dates,
  shiftsByStaffDay,
  onClose,
}: {
  staffId: string;
  staffName: string;
  dates: string[];
  shiftsByStaffDay: Map<string, Shift[]>;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [hours, setHours] = useState<Record<string, { on: boolean; start: string; end: string }>>(() => {
    const initial: Record<string, { on: boolean; start: string; end: string }> = {};
    for (const d of dates) {
      const existing = (shiftsByStaffDay.get(`${staffId}:${d}`) ?? [])[0];
      initial[d] = existing
        ? { on: true, start: new Date(existing.startsAt).toTimeString().slice(0, 5), end: new Date(existing.endsAt).toTimeString().slice(0, 5) }
        : { on: false, start: "09:00", end: "18:00" };
    }
    return initial;
  });

  const mutation = useMutation({
    mutationFn: async () => {
      await Promise.allSettled(
        dates.map(async (d) => {
          const existing = (shiftsByStaffDay.get(`${staffId}:${d}`) ?? [])[0];
          const cfg = hours[d];
          if (!cfg.on) {
            if (existing) await deleteShift(existing.id);
            return;
          }
          const startsAt = new Date(`${d}T${cfg.start}:00`).toISOString();
          const endsAt = new Date(`${d}T${cfg.end}:00`).toISOString();
          if (existing) await deleteShift(existing.id);
          await createShift({ staffUserId: staffId, startsAt, endsAt });
        }),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      toast.success(`${staffName}'s working hours saved.`);
      onClose();
    },
    onError: () => toast.error("Couldn't save these working hours."),
  });

  function update(d: string, patch: Partial<{ on: boolean; start: string; end: string }>) {
    setHours((h) => ({ ...h, [d]: { ...h[d], ...patch } }));
  }

  return (
    <PosModalShell
      open
      onClose={onClose}
      title={`Set Working Hours — ${staffName}`}
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelModalBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending} style={{ ...primaryModalBtn, opacity: mutation.isPending ? 0.6 : 1 }}>
            {mutation.isPending ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-2 p-[17px]">
        <div className="flex gap-2 text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>
          <span style={{ flex: "0 0 90px" }}>DAY</span>
          <span style={{ flex: 1 }}>START</span>
          <span style={{ flex: 1 }}>END</span>
        </div>
        {dates.map((d, i) => (
          <div key={d} className="flex items-center gap-2">
            <label className="flex items-center gap-1.5" style={{ flex: "0 0 90px" }}>
              <input type="checkbox" checked={hours[d].on} onChange={(e) => update(d, { on: e.target.checked })} style={{ accentColor: "var(--app-primary)" }} />
              <span className="text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>{DAY_LABELS[i]}</span>
            </label>
            <input type="time" value={hours[d].start} onChange={(e) => update(d, { start: e.target.value })} disabled={!hours[d].on} style={{ ...fieldStyle, flex: 1 }} />
            <input type="time" value={hours[d].end} onChange={(e) => update(d, { end: e.target.value })} disabled={!hours[d].on} style={{ ...fieldStyle, flex: 1 }} />
          </div>
        ))}
      </div>
    </PosModalShell>
  );
}

function TimeOffModal({ staff, isStaffOnly, defaultStaffId, onClose }: { staff: { id: string; name: string }[]; isStaffOnly: boolean; defaultStaffId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [staffUserId, setStaffUserId] = useState(defaultStaffId || staff[0]?.id || "");
  const [startDate, setStartDate] = useState(ymd(new Date()));
  const [endDate, setEndDate] = useState(ymd(new Date()));
  const [reason, setReason] = useState("Leave");

  const mutation = useMutation({
    mutationFn: async () => {
      const created = await requestTimeOff({
        staffUserId: isStaffOnly ? undefined : staffUserId,
        startsAt: new Date(`${startDate}T00:00:00`).toISOString(),
        endsAt: new Date(`${endDate}T23:59:59`).toISOString(),
        reason,
      });
      if (!isStaffOnly) await approveTimeOff(created.id);
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-off"] });
      toast.success(isStaffOnly ? "Time off requested — awaiting approval." : "Time off added.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this time off."),
  });

  return (
    <PosModalShell
      open
      onClose={onClose}
      title={isStaffOnly ? "Request Time Off" : "Add Time Off"}
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelModalBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending} style={{ ...primaryModalBtn, opacity: mutation.isPending ? 0.6 : 1 }}>
            {mutation.isPending ? "Saving…" : isStaffOnly ? "Request" : "Add Time Off"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 p-[17px]">
        {!isStaffOnly && (
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>STAFF</span>
            <select value={staffUserId} onChange={(e) => setStaffUserId(e.target.value)} className="w-full rounded-[11px] p-3 text-[13px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>START DATE</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-[11px] p-3 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>END DATE</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full rounded-[11px] p-3 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
          </label>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>REASON</span>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-[11px] p-3 text-[13px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
            <option>Leave</option>
            <option>Holiday</option>
            <option>Personal</option>
            <option>Other</option>
          </select>
        </label>
        <p className="m-0 rounded-[10px] p-[10px_12px] text-[12px]" style={{ background: "var(--app-warning-bg)", color: "#93370D" }}>Any existing bookings in this range stay put — move them first if needed.</p>
      </div>
    </PosModalShell>
  );
}

function RecurringPatternModal({ staff, onClose }: { staff: { id: string; name: string }[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [staffUserId, setStaffUserId] = useState(staff[0]?.id ?? "");
  const [days, setDays] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]));
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("18:00");

  const mutation = useMutation({
    mutationFn: async () => {
      const creates: Promise<Shift>[] = [];
      for (let week = 0; week < 4; week++) {
        for (const dayOfWeek of days) {
          const d = new Date();
          d.setDate(d.getDate() - d.getDay() + dayOfWeek + week * 7);
          if (d < new Date(new Date().toDateString())) continue;
          const day = ymd(d);
          creates.push(createShift({ staffUserId, startsAt: new Date(`${day}T${start}:00`).toISOString(), endsAt: new Date(`${day}T${end}:00`).toISOString() }));
        }
      }
      return Promise.allSettled(creates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shifts"] });
      toast.success("Recurring shifts created for the next 4 weeks.");
      onClose();
    },
    onError: () => toast.error("Couldn't create these shifts."),
  });

  function toggleDay(d: number) {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  return (
    <PosModalShell
      open
      onClose={onClose}
      title="Recurring Pattern"
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelModalBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={days.size === 0 || !staffUserId || mutation.isPending} style={{ ...primaryModalBtn, opacity: days.size === 0 || !staffUserId ? 0.6 : 1 }}>
            {mutation.isPending ? "Creating…" : "Save Pattern"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 p-[17px]">
        <p className="m-0 text-[12px]" style={{ color: "var(--app-text-disabled)" }}>Creates real shifts on these weekdays for the next 4 weeks — there&apos;s no open-ended recurring template, so it&apos;s generated concretely rather than promising an indefinite repeat.</p>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>STAFF</span>
          <select value={staffUserId} onChange={(e) => setStaffUserId(e.target.value)} className="w-full rounded-[11px] p-3 text-[13px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <div>
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>DAYS</span>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_KEYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                className="rounded-[9px] px-3 py-2 text-[12px] font-bold"
                style={days.has(d) ? { border: "1px solid var(--app-primary)", background: "var(--app-page-bg,#F7FCF9)", color: "var(--app-success-text)" } : { border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}
              >
                {DAY_LABELS[d]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>START</span>
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="w-full rounded-[11px] p-3 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>END</span>
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full rounded-[11px] p-3 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
          </label>
        </div>
      </div>
    </PosModalShell>
  );
}
