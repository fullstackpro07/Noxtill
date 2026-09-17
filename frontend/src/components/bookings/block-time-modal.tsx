"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PosModalShell } from "@/components/pos/pos-modal-shell";
import { fetchStaff, requestTimeOff, approveTimeOff } from "@/lib/staff-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const cancelBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)" };
const primaryBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff" };
const fieldStyle: React.CSSProperties = { width: "100%", border: "1px solid var(--app-border)", borderRadius: 11, padding: 12, fontSize: 13, fontWeight: 700, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 48 };

const DURATIONS = [
  { label: "30 min", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
  { label: "Rest of day", minutes: 480 },
];

/** "Block Time" reuses the real `TimeOff` model (owner/manager-created requests are auto-approved
 * here since there's no separate reviewer) — there's no dedicated "blocked slot" concept in the
 * schema, and no code path checks TimeOff before a booking is created, so this visually marks the
 * slot on the calendar/availability grids without claiming it prevents new bookings. */
export function BlockTimeModal({ open, onClose, date }: { open: boolean; onClose: () => void; date: string }) {
  const [staffId, setStaffId] = useState("");
  const [reason, setReason] = useState("Maintenance");
  const [start, setStart] = useState("13:00");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const queryClient = useQueryClient();

  const { data: staff = [] } = useQuery({ queryKey: ["staff"], queryFn: fetchStaff, enabled: open });

  const mutation = useMutation({
    mutationFn: async () => {
      const [h, m] = start.split(":").map(Number);
      const startsAt = new Date(`${date}T00:00:00`);
      startsAt.setHours(h, m, 0, 0);
      const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
      const created = await requestTimeOff({
        staffUserId: staffId || undefined,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        reason,
      });
      return approveTimeOff(created.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-off"] });
      toast.success("Time blocked on the calendar.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't block this time."),
  });

  return (
    <PosModalShell
      open={open}
      onClose={onClose}
      title="Block Time"
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={!staffId || mutation.isPending} style={{ ...primaryBtn, opacity: !staffId || mutation.isPending ? 0.6 : 1 }}>
            {mutation.isPending ? "Blocking…" : "Block Time"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 p-[17px]">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>STAFF</span>
          <select value={staffId} onChange={(e) => setStaffId(e.target.value)} style={fieldStyle}>
            <option value="" disabled>Select a staff member…</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>REASON</span>
          <select value={reason} onChange={(e) => setReason(e.target.value)} style={fieldStyle}>
            <option>Maintenance</option>
            <option>Break</option>
            <option>Private</option>
            <option>Other</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2.5">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>START</span>
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} style={{ ...fieldStyle, minHeight: 46 }} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>DURATION</span>
            <select value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} style={{ ...fieldStyle, minHeight: 46 }}>
              {DURATIONS.map((d) => (
                <option key={d.minutes} value={d.minutes}>{d.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </PosModalShell>
  );
}
