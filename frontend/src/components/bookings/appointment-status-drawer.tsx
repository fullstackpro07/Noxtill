"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SlideDrawer } from "@/components/dashboard/slide-drawer";
import { PosModalShell } from "@/components/pos/pos-modal-shell";
import { canTransition, type AppointmentStatus } from "@/lib/bookings";
import { rescheduleAppointment, type LiveAppointment } from "@/lib/bookings-api";
import { fetchStaff } from "@/lib/staff-api";
import { formatHour } from "@/lib/profit";
import { formatDate, formatCurrency } from "@/lib/format";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { useSession } from "@/lib/session";

const STATUS_TONE: Record<AppointmentStatus, { bg: string; fg: string }> = {
  requested: { bg: "#EEF4FF", fg: "#3538CD" },
  booked: { bg: "var(--app-surface-2)", fg: "var(--app-text-muted)" },
  confirmed: { bg: "var(--app-success-bg)", fg: "var(--app-success-text)" },
  completed: { bg: "var(--app-surface-2)", fg: "var(--app-text-faint)" },
  cancelled: { bg: "var(--app-surface-2)", fg: "var(--app-text-disabled)" },
  no_show: { bg: "#FEE4E2", fg: "var(--app-danger-strong)" },
};

const STATUS_ACTIONS: { to: AppointmentStatus; label: string }[] = [
  { to: "confirmed", label: "Confirm Appointment" },
  { to: "completed", label: "Mark Completed" },
  { to: "no_show", label: "Mark No-show" },
  { to: "cancelled", label: "Cancel Appointment" },
];

const SOURCE_LABEL: Record<LiveAppointment["source"], string> = { link: "Link", qr: "QR", walk_in: "Walk-in", waitlist: "Waitlist", phone: "Phone" };

const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--app-surface-2)" };
const cancelBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: 12, fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)" };
const primaryBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: 12, fontSize: 13, fontWeight: 800, color: "#fff" };

export function AppointmentStatusDrawer({
  appointment,
  onClose,
  onStatusChange,
}: {
  appointment: LiveAppointment | null;
  onClose: () => void;
  onStatusChange: (id: string, status: AppointmentStatus) => void;
}) {
  const session = useSession();
  const [rescheduling, setRescheduling] = useState(false);

  return (
    <>
      <SlideDrawer open={appointment != null} onClose={onClose} title={appointment?.customerName ?? "Appointment"}>
        {appointment && (
          <div className="flex flex-col gap-[13px]">
            <span className="flex flex-wrap items-center gap-2">
              <span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: STATUS_TONE[appointment.status].bg, color: STATUS_TONE[appointment.status].fg }}>{appointment.status.replace("_", " ")}</span>
              <span className="ms-auto text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>{formatDate(appointment.date)} · {formatHour(appointment.startHour)}</span>
            </span>

            <div>
              <div className="text-[17px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.3px" }}>{appointment.customerName}</div>
              <div className="mt-0.5 text-[12px]" style={{ color: "var(--app-text-faintest)" }}>{appointment.customerPhone}</div>
            </div>

            <div>
              <div style={rowStyle}><span className="text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>Service</span><span className="text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{appointment.serviceName}</span></div>
              <div style={rowStyle}><span className="text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>Staff</span><span className="text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{appointment.staffName ?? "Unassigned"}</span></div>
              <div style={rowStyle}><span className="text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>Deposit</span><span className="text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{appointment.depositPaid > 0 ? formatCurrency(appointment.depositPaid, session.business.currency) : "None"}</span></div>
              <div style={{ ...rowStyle, borderBottom: "none" }}><span className="text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>Source</span><span className="text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{SOURCE_LABEL[appointment.source]}</span></div>
            </div>

            <div className="flex flex-col gap-2">
              {STATUS_ACTIONS.filter((a) => canTransition(appointment.status, a.to)).map((a) => (
                <button
                  key={a.to}
                  type="button"
                  onClick={() => { onStatusChange(appointment.id, a.to); onClose(); }}
                  style={a.to === "cancelled" ? { ...cancelBtn, color: "var(--app-danger-strong)" } : cancelBtn}
                >
                  {a.label}
                </button>
              ))}
              {canTransition(appointment.status, "confirmed") || appointment.status === "confirmed" || appointment.status === "booked" ? (
                <button type="button" onClick={() => setRescheduling(true)} style={{ ...cancelBtn, borderColor: "var(--app-primary)", color: "var(--app-success-text)" }}>
                  Reschedule
                </button>
              ) : null}
              {STATUS_ACTIONS.every((a) => !canTransition(appointment.status, a.to)) && (
                <p className="m-0 text-center text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>This appointment is already finalized.</p>
              )}
            </div>
          </div>
        )}
      </SlideDrawer>

      {appointment && rescheduling && <RescheduleModal appointment={appointment} onClose={() => setRescheduling(false)} onDone={onClose} />}
    </>
  );
}

function RescheduleModal({ appointment, onClose, onDone }: { appointment: LiveAppointment; onClose: () => void; onDone: () => void }) {
  const [date, setDate] = useState(appointment.date);
  const [hour, setHour] = useState(appointment.startHour);
  const [staffId, setStaffId] = useState(appointment.staffId ?? "");
  const queryClient = useQueryClient();
  const { data: staff = [] } = useQuery({ queryKey: ["staff"], queryFn: fetchStaff });

  const mutation = useMutation({
    mutationFn: () => {
      const [y, m, d] = date.split("-").map(Number);
      const startsAt = new Date(y, m - 1, d, Math.floor(hour), Math.round((hour % 1) * 60)).toISOString();
      return rescheduleAppointment(appointment.id, { startsAt, staffUserId: staffId || undefined });
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success(`${updated.customerName} rescheduled.`);
      onClose();
      onDone();
    },
    onError: (err) => toast.error(err instanceof ApiError && err.status === 409 ? "That slot already has a booking for this staff member." : "Couldn't reschedule this appointment."),
  });

  return (
    <PosModalShell
      open
      onClose={onClose}
      title="Reschedule"
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending} style={{ ...primaryBtn, opacity: mutation.isPending ? 0.6 : 1 }}>
            {mutation.isPending ? "Saving…" : "Confirm Reschedule"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 p-[17px]">
        <div className="rounded-[12px] p-[13px]" style={{ background: "var(--app-surface-2)" }}>
          <div style={rowStyle}><span className="text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>Customer</span><span className="text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{appointment.customerName}</span></div>
          <div style={{ ...rowStyle, borderBottom: "none" }}><span className="text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>Service</span><span className="text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>{appointment.serviceName}</span></div>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>DATE</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-[10px] p-2.5 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>TIME</span>
            <select value={hour} onChange={(e) => setHour(Number(e.target.value))} className="w-full rounded-[10px] p-2.5 text-[13px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
              {Array.from({ length: 20 }, (_, i) => 9 + i * 0.5).map((h) => (
                <option key={h} value={h}>{formatHour(h)}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>STAFF</span>
          <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className="w-full rounded-[10px] p-2.5 text-[13px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
            <option value="">Any available</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
      </div>
    </PosModalShell>
  );
}
