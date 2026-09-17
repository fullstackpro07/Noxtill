"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CalendarDays, CheckCircle2, UserX, Wallet2, ListChecks } from "lucide-react";
import { DayGrid, type CalendarBlockRange } from "./day-grid";
import { WeekSummary } from "./week-summary";
import { AppointmentStatusDrawer } from "./appointment-status-drawer";
import { BlockTimeModal } from "./block-time-modal";
import { weekDates, appointmentOccupying, dateHourToIso, type AppointmentStatus } from "@/lib/bookings";
import { fetchAppointments, updateAppointmentStatus, rescheduleAppointment, type LiveAppointment } from "@/lib/bookings-api";
import { fetchStaff } from "@/lib/staff-api";
import { fetchTimeOff } from "@/lib/staff-api";
import { fetchProducts } from "@/lib/products-api";
import { formatDate } from "@/lib/format";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { useSession } from "@/lib/session";

type ViewMode = "day" | "week";

const selectStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 10, padding: "9px 11px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 42 };
const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 10, padding: "9px 13px", fontSize: 12, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 42 };

export function BookingsCalendarView() {
  const session = useSession();
  const [view, setView] = useState<ViewMode>("day");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [staffFilter, setStaffFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | "">("");
  const [selected, setSelected] = useState<LiveAppointment | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);
  const [shakingId, setShakingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const dates = weekDates(date);
  const from = new Date(`${dates[0]}T00:00:00`).toISOString();
  const to = new Date(`${dates[6]}T23:59:59.999`).toISOString();
  const isStaffOnly = session.user.role === "staff";
  const effectiveStaffFilter = isStaffOnly ? session.user.businessUserId ?? "" : staffFilter;

  const {
    data: rawAppointments = [],
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["appointments", dates[0], dates[6], effectiveStaffFilter, statusFilter],
    queryFn: () => fetchAppointments({ from, to, staff: effectiveStaffFilter || undefined, status: statusFilter || undefined }),
  });
  const { data: allStaff = [] } = useQuery({ queryKey: ["staff"], queryFn: fetchStaff });
  const staff = isStaffOnly ? allStaff.filter((s) => s.id === session.user.businessUserId) : allStaff;
  const { data: services = [] } = useQuery({ queryKey: ["products", "service"], queryFn: () => fetchProducts({ kind: "service" }) });
  const { data: timeOff = [] } = useQuery({ queryKey: ["time-off"], queryFn: () => fetchTimeOff() });

  const appointments = useMemo(
    () => (serviceFilter ? rawAppointments.filter((a) => a.serviceId === serviceFilter) : rawAppointments),
    [rawAppointments, serviceFilter],
  );
  const dayAppointments = appointments.filter((a) => a.date === date);

  const blocks: CalendarBlockRange[] = useMemo(() => {
    const dayStart = new Date(`${date}T00:00:00`);
    const dayEnd = new Date(`${date}T23:59:59.999`);
    return timeOff
      .filter((t) => t.status === "approved" && new Date(t.startsAt) < dayEnd && new Date(t.endsAt) > dayStart)
      .map((t) => {
        const start = new Date(t.startsAt) < dayStart ? dayStart : new Date(t.startsAt);
        const end = new Date(t.endsAt) > dayEnd ? dayEnd : new Date(t.endsAt);
        return {
          staffUserId: t.staffUserId,
          startHour: start.getHours() + start.getMinutes() / 60,
          durationHours: Math.max((end.getTime() - start.getTime()) / (1000 * 60 * 60), 0.5),
          label: t.reason ?? "Blocked",
        };
      });
  }, [timeOff, date]);

  const kpis = useMemo(
    () => ({
      total: dayAppointments.length,
      confirmed: dayAppointments.filter((a) => a.status === "confirmed").length,
      completed: dayAppointments.filter((a) => a.status === "completed").length,
      noShow: dayAppointments.filter((a) => a.status === "no_show").length,
      depositsHeld: dayAppointments.filter((a) => a.status !== "completed").reduce((sum, a) => sum + a.depositPaid, 0),
    }),
    [dayAppointments],
  );

  const rescheduleMutation = useMutation({
    mutationFn: ({ id, startsAt, staffUserId }: { id: string; startsAt: string; staffUserId?: string }) =>
      rescheduleAppointment(id, { startsAt, staffUserId }),
    onError: (err, vars) => {
      setShakingId(vars.id);
      setTimeout(() => setShakingId(null), 400);
      toast.error(err instanceof ApiError && err.status === 409 ? "That slot was just taken." : "Couldn't reschedule this appointment.");
    },
    onSuccess: (updated) => toast.success(`${updated.customerName} rescheduled.`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["appointments"] }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AppointmentStatus }) => updateAppointmentStatus(id, status),
    onSuccess: (updated) => toast.success(`Appointment marked ${updated.status.replace("_", " ")}.`),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this appointment's status."),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["appointments"] }),
  });

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const [staffId, hourStr] = String(over.id).split(":");
    const hour = Number(hourStr);
    const appointment = appointments.find((a) => a.id === active.id);
    if (!appointment) return;
    if (appointment.staffId === staffId && appointment.startHour === hour) return;

    const conflict = appointmentOccupying(dayAppointments, staffId, hour, appointment.id);
    if (conflict) {
      setShakingId(appointment.id);
      toast.error(`That slot is taken by ${conflict.customerName}.`);
      setTimeout(() => setShakingId(null), 400);
      return;
    }
    rescheduleMutation.mutate({ id: appointment.id, startsAt: dateHourToIso(date, hour), staffUserId: staffId });
  }

  function printDaySheet() {
    if (dayAppointments.length === 0) return;
    const win = window.open("", "_blank", "noopener,noreferrer");
    if (!win) return;
    const rows = [...dayAppointments]
      .sort((a, b) => a.startHour - b.startHour)
      .map(
        (a) =>
          `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${a.startHour.toFixed(0).padStart(2, "0")}:00</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${a.customerName}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${a.serviceName}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${a.staffName ?? "Unassigned"}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${a.status.replace("_", " ")}</td></tr>`,
      )
      .join("");
    win.document.write(
      `<html><head><title>Day Sheet — ${formatDate(date)}</title></head><body><h2>${session.business.name} — ${formatDate(date)}</h2><table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:13px"><thead><tr><th style="text-align:left;padding:6px 10px">Time</th><th style="text-align:left;padding:6px 10px">Customer</th><th style="text-align:left;padding:6px 10px">Service</th><th style="text-align:left;padding:6px 10px">Staff</th><th style="text-align:left;padding:6px 10px">Status</th></tr></thead><tbody>${rows}</tbody></table></body></html>`,
    );
    win.document.close();
    win.focus();
    win.print();
  }

  if (isError) {
    return (
      <main className="flex flex-col items-center gap-3 p-[52px_20px] text-center">
        <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-danger-strong)" }}>Couldn&apos;t load bookings</div>
        <button type="button" onClick={() => refetch()} style={{ ...outlineBtn, minHeight: 46 }}>Retry</button>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex gap-[3px] rounded-[10px] p-[3px]" style={{ background: "var(--app-surface-2)" }}>
          <button type="button" onClick={() => setView("day")} style={{ border: 0, borderRadius: 8, padding: "9px 15px", fontSize: 12, fontWeight: 700, minHeight: 40, background: view === "day" ? "var(--app-surface)" : "transparent", color: view === "day" ? "var(--app-success-text)" : "var(--app-text-faint)" }}>Day</button>
          <button type="button" onClick={() => setView("week")} style={{ border: 0, borderRadius: 8, padding: "9px 15px", fontSize: 12, fontWeight: 700, minHeight: 40, background: view === "week" ? "var(--app-surface)" : "transparent", color: view === "week" ? "var(--app-success-text)" : "var(--app-text-faint)" }}>Week</button>
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" style={selectStyle} />
        {!isStaffOnly && (
          <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} aria-label="Staff" style={selectStyle}>
            <option value="">All staff</option>
            {allStaff.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
        <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} aria-label="Service" style={selectStyle}>
          <option value="">All services</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as AppointmentStatus | "")} aria-label="Status" style={selectStyle}>
          <option value="">All statuses</option>
          <option value="booked">Booked</option>
          <option value="confirmed">Confirmed</option>
          <option value="completed">Completed</option>
          <option value="no_show">No-show</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <span className="ms-auto flex gap-2">
          <button type="button" onClick={printDaySheet} style={outlineBtn}>Print Day Sheet</button>
          <button type="button" onClick={() => setBlockOpen(true)} style={outlineBtn}>Block Time</button>
        </span>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(168px,1fr))" }}>
        <KpiCard icon={<CalendarDays className="h-4 w-4" aria-hidden />} tint="#EEF4FF" color="#3538CD" label="Today's Bookings" value={kpis.total} note="All staff" />
        <KpiCard icon={<CheckCircle2 className="h-4 w-4" aria-hidden />} tint="var(--app-success-bg)" color="var(--app-success-text)" label="Confirmed" value={kpis.confirmed} note="Ready to serve" />
        <KpiCard icon={<ListChecks className="h-4 w-4" aria-hidden />} tint="var(--app-surface-2)" color="var(--app-text-faint)" label="Completed" value={kpis.completed} note="Served today" />
        <KpiCard icon={<UserX className="h-4 w-4" aria-hidden />} tint="#FEF3F2" color="var(--app-danger-strong)" label="No-Shows" value={kpis.noShow} note="Missed appointments" />
        <KpiCard icon={<Wallet2 className="h-4 w-4" aria-hidden />} tint="var(--app-success-bg)" color="var(--app-success-text)" label="Deposits Held" value={formatCurrencyShort(kpis.depositsHeld, session.business.currency)} note="Against today's bookings" />
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap items-center gap-3 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>{view === "day" ? formatDate(date) : `Week of ${formatDate(dates[0])}`}</h3>
          <span className="ms-auto flex flex-wrap gap-[11px] text-[11px] font-semibold" style={{ color: "var(--app-text-faint)" }}>
            <Legend swatch={{ border: "1.5px solid var(--app-primary)", background: "var(--app-surface)" }} label="Booked" />
            <Legend swatch={{ background: "var(--app-primary)" }} label="Confirmed" />
            <Legend swatch={{ background: "var(--app-surface-2)" }} label="Completed" />
            <Legend swatch={{ background: "repeating-linear-gradient(45deg,#FEE4E2,#FEE4E2 3px,#FDA29B 3px,#FDA29B 6px)" }} label="No-show" />
          </span>
        </div>

        {isPending ? (
          <div className="p-[52px_18px] text-center text-[13px]" style={{ color: "var(--app-text-disabled)" }}>Loading…</div>
        ) : view === "week" ? (
          <div className="p-[17px]">
            <WeekSummary anchor={date} appointments={appointments} onSelectDate={(d) => { setDate(d); setView("day"); }} />
          </div>
        ) : dayAppointments.length === 0 && blocks.length === 0 ? (
          <div className="p-[52px_18px] text-center">
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No bookings today — share your booking link</div>
            <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Nothing matches the current filters.</div>
          </div>
        ) : (
          <div className="p-[0_17px_17px]">
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <DayGrid appointments={dayAppointments} staff={staff} blocks={blocks} onSelect={setSelected} shakingId={shakingId} />
            </DndContext>
          </div>
        )}
        {view === "day" && (
          <div className="p-[12px_17px] text-[11.5px]" style={{ borderTop: "1px solid var(--app-surface-2)", color: "var(--app-text-disabled)" }}>
            Drag a booking to another slot, or open it and use Reschedule — dragging is never the only way.
          </div>
        )}
      </div>

      {isStaffOnly && (
        <div className="rounded-[12px] p-[11px_14px] text-[12px]" style={{ background: "var(--app-warning-bg)", border: "1px solid var(--app-warning-border)", color: "#93370D" }}>
          Staff role sees only their own column — the calendar above is filtered to your bookings.
        </div>
      )}

      <AppointmentStatusDrawer appointment={selected} onClose={() => setSelected(null)} onStatusChange={(id, status) => statusMutation.mutate({ id, status })} />
      <BlockTimeModal open={blockOpen} onClose={() => setBlockOpen(false)} date={date} />
    </main>
  );
}

function formatCurrencyShort(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function Legend({ swatch, label }: { swatch: React.CSSProperties; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-[11px] w-[11px] rounded-[3px]" style={swatch} />
      {label}
    </span>
  );
}

function KpiCard({ icon, tint, color, label, value, note }: { icon: React.ReactNode; tint: string; color: string; label: string; value: React.ReactNode; note: string }) {
  return (
    <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px]" style={{ background: tint, color }}>{icon}</span>
        <span className="text-[12px] font-semibold" style={{ color: "var(--app-text-faint)" }}>{label}</span>
      </div>
      <div className="text-[21px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.5px" }}>{value}</div>
      <div className="mt-1 text-[11px]" style={{ color: "var(--app-text-disabled)" }}>{note}</div>
    </div>
  );
}
