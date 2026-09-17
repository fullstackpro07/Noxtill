"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PosModalShell } from "@/components/pos/pos-modal-shell";
import { formatDate, formatTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import {
  approveAppointmentRequest,
  declineAppointmentRequest,
  suggestAlternativeTime,
  fetchAppointments,
  type LiveAppointment,
} from "@/lib/bookings-api";
import { fetchProducts } from "@/lib/products-api";

const selectStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 10, padding: "9px 11px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 42 };
const primaryHeaderBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };
const smallOutline: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 9, padding: "8px 11px", fontSize: 11.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 40 };
const cancelBtn: React.CSSProperties = { background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)" };
const primaryBtn: React.CSSProperties = { background: "var(--app-primary)", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff" };
const dangerBtn: React.CSSProperties = { background: "var(--app-danger-strong)", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff" };

export function BookingRequestsPanel() {
  const queryClient = useQueryClient();
  const [serviceFilter, setServiceFilter] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [declining, setDeclining] = useState<LiveAppointment | null>(null);
  const [suggesting, setSuggesting] = useState<LiveAppointment | null>(null);
  const [bulkApproveOpen, setBulkApproveOpen] = useState(false);

  const { data: requests } = useQuery({ queryKey: ["appointments", "requested"], queryFn: () => fetchAppointments({ status: "requested" }) });
  const { data: services } = useQuery({ queryKey: ["products", "service"], queryFn: () => fetchProducts({ kind: "service" }) });

  const filtered = useMemo(() => (serviceFilter ? (requests ?? []).filter((r) => r.serviceId === serviceFilter) : requests ?? []), [requests, serviceFilter]);

  const approveMutation = useMutation({
    mutationFn: (id: string) => approveAppointmentRequest(id),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success(`${updated.customerName}'s booking confirmed.`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't approve this request."),
  });

  const bulkApproveMutation = useMutation({
    mutationFn: async () => {
      const results = await Promise.allSettled(selected.map((id) => approveAppointmentRequest(id)));
      return results.filter((r) => r.status === "fulfilled").length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success(`Approved ${count} request(s).`);
      setSelected([]);
      setBulkApproveOpen(false);
    },
    onError: () => toast.error("Couldn't approve these requests."),
  });

  function toggle(id: string) {
    setSelected((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Booking Requests</h2>
        <span className="rounded-full px-[11px] py-[3px] text-[12px] font-extrabold" style={{ color: "var(--app-warning-text)", background: "var(--app-warning-bg)" }}>{(requests ?? []).length} pending</span>
        <button type="button" onClick={() => setBulkApproveOpen(true)} disabled={selected.length === 0} className="ms-auto" style={{ ...primaryHeaderBtn, opacity: selected.length === 0 ? 0.5 : 1 }}>Bulk Approve</button>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap gap-2 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} aria-label="Service" style={selectStyle}>
            <option value="">All services</option>
            {(services ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {requests && filtered.length === 0 ? (
          <div className="p-[52px_18px] text-center">
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No pending requests</div>
            <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Requests appear here when auto-confirm is off.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 900 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="w-[34px] p-[10px_0_10px_17px]"></th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Requested At</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Customer</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Service</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Requested Slot</th>
                  <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                    <td className="p-[11px_0_11px_17px]"><input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} aria-label={`Select request from ${r.customerName}`} style={{ accentColor: "var(--app-primary)" }} /></td>
                    <td className="whitespace-nowrap p-[11px] text-[12px]" style={{ color: "var(--app-text-disabled)" }}>{formatDate(r.createdAt)} {formatTime(r.createdAt)}</td>
                    <td className="p-[11px] text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{r.customerName}</td>
                    <td className="p-[11px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{r.serviceName}</td>
                    <td className="whitespace-nowrap p-[11px] text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>{formatDate(r.startsAt)} {formatTime(r.startsAt)}{r.staffName ? ` · ${r.staffName}` : ""}</td>
                    <td className="p-[11px_17px] text-end">
                      <span className="inline-flex flex-wrap justify-end gap-1.5">
                        <button type="button" onClick={() => setSuggesting(r)} style={smallOutline}>Suggest Time</button>
                        <button type="button" onClick={() => setDeclining(r)} style={{ ...smallOutline, color: "var(--app-danger-strong)" }}>Decline</button>
                        <button type="button" onClick={() => approveMutation.mutate(r.id)} disabled={approveMutation.isPending} style={{ border: 0, background: "var(--app-primary)", borderRadius: 9, padding: "8px 13px", fontSize: 11.5, fontWeight: 800, color: "#fff", minHeight: 40 }}>Approve</button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {declining && <DeclineModal appointment={declining} onClose={() => setDeclining(null)} />}
      {suggesting && <SuggestModal appointment={suggesting} onClose={() => setSuggesting(null)} />}

      <PosModalShell
        open={bulkApproveOpen}
        onClose={() => setBulkApproveOpen(false)}
        title="Bulk Approve"
        footer={
          <>
            <button type="button" onClick={() => setBulkApproveOpen(false)} style={cancelBtn}>Cancel</button>
            <button type="button" onClick={() => bulkApproveMutation.mutate()} disabled={bulkApproveMutation.isPending} style={{ ...primaryBtn, opacity: bulkApproveMutation.isPending ? 0.6 : 1 }}>
              {bulkApproveMutation.isPending ? "Approving…" : "Approve Selected"}
            </button>
          </>
        }
      >
        <div className="p-[17px]">
          <p className="m-0 text-[13px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>{selected.length} request(s) will be approved and placed on the calendar at the times the customers asked for.</p>
          <div className="mt-3 flex flex-col gap-1 rounded-[11px] p-3" style={{ background: "var(--app-surface-2)" }}>
            {(requests ?? []).filter((r) => selected.includes(r.id)).map((r) => (
              <div key={r.id} className="text-[12px]" style={{ color: "var(--app-text-muted)" }}>{r.customerName} · {r.serviceName} · {formatDate(r.startsAt)} {formatTime(r.startsAt)}</div>
            ))}
          </div>
        </div>
      </PosModalShell>
    </main>
  );
}

function DeclineModal({ appointment, onClose }: { appointment: LiveAppointment; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => declineAppointmentRequest(appointment.id, reason || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success(`${appointment.customerName}'s request declined.`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't decline this request."),
  });

  return (
    <PosModalShell
      open
      onClose={onClose}
      title={`Decline ${appointment.customerName}'s Request?`}
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelBtn}>Keep Appointment</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending} style={{ ...dangerBtn, opacity: mutation.isPending ? 0.6 : 1 }}>
            {mutation.isPending ? "Declining…" : "Decline Request"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-2.5 p-[17px]">
        <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{appointment.serviceName} · {formatDate(appointment.startsAt)} {formatTime(appointment.startsAt)}</p>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>REASON (SENT TO THE CUSTOMER)</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Please contact us to rebook." className="w-full rounded-[11px] p-3 text-[13.5px]" style={{ border: "1px solid var(--app-border)" }} />
        </label>
      </div>
    </PosModalShell>
  );
}

function SuggestModal({ appointment, onClose }: { appointment: LiveAppointment; onClose: () => void }) {
  const [startsAt, setStartsAt] = useState("");

  const mutation = useMutation({
    mutationFn: () => suggestAlternativeTime(appointment.id, new Date(startsAt).toISOString()),
    onSuccess: () => {
      toast.success(`Alternative time sent to ${appointment.customerName}.`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send an alternative time."),
  });

  return (
    <PosModalShell
      open
      onClose={onClose}
      title={`Suggest a Different Time to ${appointment.customerName}`}
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={!startsAt || mutation.isPending} style={{ ...primaryBtn, opacity: !startsAt || mutation.isPending ? 0.6 : 1 }}>
            {mutation.isPending ? "Sending…" : "Suggest Time"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-2.5 p-[17px]">
        <p className="m-0 text-[12px]" style={{ color: "var(--app-text-disabled)" }}>This doesn&apos;t change the request&apos;s status — the customer still needs to accept.</p>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>PROPOSED DATE &amp; TIME</span>
          <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="w-full rounded-[11px] p-3 text-[13.5px]" style={{ border: "1px solid var(--app-border)" }} />
        </label>
      </div>
    </PosModalShell>
  );
}
