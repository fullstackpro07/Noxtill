"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PosModalShell } from "@/components/pos/pos-modal-shell";
import { formatDate, formatTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import {
  fetchWaitlist,
  offerWaitlistSlot,
  cancelWaitlistEntry,
  joinWaitlist,
  type WaitlistEntry,
  type WaitlistStatus,
} from "@/lib/waitlist-api";
import { fetchProducts } from "@/lib/products-api";
import { useNow } from "@/hooks/use-now";

const STATUS_TONE: Record<WaitlistStatus, { bg: string; fg: string }> = {
  waiting: { bg: "var(--app-surface-2)", fg: "var(--app-text-muted)" },
  offered: { bg: "#EEF4FF", fg: "#3538CD" },
  booked: { bg: "var(--app-success-bg)", fg: "var(--app-success-text)" },
  expired: { bg: "var(--app-warning-bg)", fg: "var(--app-warning-text)" },
  cancelled: { bg: "#FEE4E2", fg: "var(--app-danger-strong)" },
};

const HOLD_HOURS = 24;

/** No backend field tracks "when this was offered" separately from `createdAt`, so this uses
 * `createdAt` as the hold-clock start — an honest approximation, not a stored expiry. */
function isExpiredOffer(entry: WaitlistEntry, now: number): boolean {
  if (entry.status !== "offered") return false;
  return now - new Date(entry.createdAt).getTime() > HOLD_HOURS * 60 * 60 * 1000;
}

const selectStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 10, padding: "9px 11px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 42 };
const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };
const primaryHeaderBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };
const smallOutline: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 9, padding: "8px 13px", fontSize: 12, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 40 };
const cancelBtn: React.CSSProperties = { background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)" };
const primaryBtn: React.CSSProperties = { background: "var(--app-primary)", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff" };
const dangerBtn: React.CSSProperties = { background: "var(--app-danger-strong)", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff" };

export function WaitlistPanel() {
  const queryClient = useQueryClient();
  const [serviceFilter, setServiceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<WaitlistStatus | "">("");
  const [offering, setOffering] = useState<WaitlistEntry | null>(null);
  const [adding, setAdding] = useState(false);
  const [clearing, setClearing] = useState(false);
  const now = useNow();

  const { data: entries } = useQuery({ queryKey: ["waitlist", statusFilter], queryFn: () => fetchWaitlist(statusFilter || undefined) });
  const { data: services } = useQuery({ queryKey: ["products", "service"], queryFn: () => fetchProducts({ kind: "service" }) });

  const filtered = useMemo(() => (serviceFilter ? (entries ?? []).filter((e) => e.serviceName === services?.find((s) => s.id === serviceFilter)?.name) : entries ?? []), [entries, serviceFilter, services]);

  const kpis = useMemo(() => {
    const all = entries ?? [];
    const waiting = all.filter((e) => e.status === "waiting").length;
    const offersSent = all.filter((e) => e.offeredStartsAt != null).length;
    const converted = all.filter((e) => e.status === "booked").length;
    const rate = offersSent > 0 ? (converted / offersSent) * 100 : 0;
    return { waiting, offersSent, converted, rate };
  }, [entries]);

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelWaitlistEntry(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["waitlist"] }); toast.success("Waitlist entry cancelled."); },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't cancel this entry."),
  });

  const clearExpiredMutation = useMutation({
    mutationFn: async () => {
      const stale = (entries ?? []).filter((e) => isExpiredOffer(e, now));
      await Promise.all(stale.map((e) => cancelWaitlistEntry(e.id)));
      return stale.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["waitlist"] });
      toast.success(count > 0 ? `Cleared ${count} expired offer(s).` : "No expired offers to clear.");
      setClearing(false);
    },
    onError: () => toast.error("Couldn't clear expired offers."),
  });

  const expiredCount = (entries ?? []).filter((e) => isExpiredOffer(e, now)).length;

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Waiting List</h2>
        <span className="rounded-full px-[11px] py-[3px] text-[12px] font-extrabold" style={{ color: "var(--app-success-text)", background: "var(--app-success-bg)" }}>{kpis.waiting} waiting</span>
        <div className="ms-auto flex flex-wrap gap-2.5">
          <button type="button" onClick={() => setClearing(true)} disabled={expiredCount === 0} style={{ ...outlineBtn, opacity: expiredCount === 0 ? 0.5 : 1, color: "var(--app-danger-strong)" }}>Clear Expired</button>
          <button type="button" onClick={() => setAdding(true)} style={primaryHeaderBtn}>+ Add to Waitlist</button>
        </div>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>On Waitlist</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{kpis.waiting}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Offers Sent</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{kpis.offersSent}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Converted</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-primary)" }}>{kpis.converted}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Conversion Rate</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{kpis.rate.toFixed(0)}%</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap gap-2 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} aria-label="Service" style={selectStyle}>
            <option value="">All services</option>
            {(services ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as WaitlistStatus | "")} aria-label="Status" style={selectStyle}>
            <option value="">All statuses</option>
            <option value="waiting">Waiting</option>
            <option value="offered">Offered</option>
            <option value="booked">Booked</option>
            <option value="expired">Expired</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {entries && filtered.length === 0 ? (
          <div className="p-[52px_18px] text-center">
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Nobody waiting</div>
            <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Add a customer here when their preferred slot is full.</div>
            <button type="button" onClick={() => setAdding(true)} className="mt-[15px] rounded-[11px] px-5 py-3 text-[12.5px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>Add to Waitlist</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 900 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Customer</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Requested Service</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Preferred Date/Time</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Added At</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Status</th>
                  <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => {
                  const expired = isExpiredOffer(e, now);
                  const status = expired ? "expired" : e.status;
                  return (
                    <tr key={e.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                      <td className="p-[12px_17px] text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{e.customerName}</td>
                      <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{e.serviceName}</td>
                      <td className="p-[12px] text-[12.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{e.preferredFrom ? `${formatDate(e.preferredFrom)} ${formatTime(e.preferredFrom)}` : "Any time"}</td>
                      <td className="p-[12px] text-[12px]" style={{ color: "var(--app-text-disabled)" }}>{formatDate(e.createdAt)}</td>
                      <td className="p-[12px]"><span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: STATUS_TONE[status].bg, color: STATUS_TONE[status].fg }}>{status}</span></td>
                      <td className="p-[12px_17px] text-end">
                        <span className="inline-flex gap-1.5">
                          {e.status === "waiting" && <button type="button" onClick={() => setOffering(e)} style={smallOutline}>Offer Slot</button>}
                          {(e.status === "waiting" || e.status === "offered") && <button type="button" onClick={() => cancelMutation.mutate(e.id)} style={{ ...smallOutline, color: "var(--app-danger-strong)" }}>Cancel</button>}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {offering && <OfferModal entry={offering} onClose={() => setOffering(null)} />}
      {adding && <AddWaitlistModal onClose={() => setAdding(false)} />}

      <PosModalShell
        open={clearing}
        onClose={() => setClearing(false)}
        title="Clear Expired"
        footer={
          <>
            <button type="button" onClick={() => setClearing(false)} style={cancelBtn}>Cancel</button>
            <button type="button" onClick={() => clearExpiredMutation.mutate()} disabled={clearExpiredMutation.isPending} style={{ ...dangerBtn, opacity: clearExpiredMutation.isPending ? 0.6 : 1 }}>
              {clearExpiredMutation.isPending ? "Clearing…" : "Clear"}
            </button>
          </>
        }
      >
        <p className="m-0 p-[17px] text-[13px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>{expiredCount} expired entry(ies) will be removed from the waiting list. Customers are not notified.</p>
      </PosModalShell>
    </main>
  );
}

const DURATIONS = [
  { label: "10 minutes", minutes: 10 },
  { label: "30 minutes", minutes: 30 },
  { label: "1 hour", minutes: 60 },
];

function OfferModal({ entry, onClose }: { entry: WaitlistEntry; onClose: () => void }) {
  const [startsAt, setStartsAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => {
      const start = new Date(startsAt);
      const end = new Date(start.getTime() + durationMinutes * 60_000);
      return offerWaitlistSlot(entry.id, start.toISOString(), end.toISOString());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["waitlist"] });
      toast.success(`Slot offered to ${entry.customerName}.`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't offer this slot."),
  });

  return (
    <PosModalShell
      open
      onClose={onClose}
      title={`Offer a Slot to ${entry.customerName}`}
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={!startsAt || mutation.isPending} style={{ ...primaryBtn, opacity: !startsAt || mutation.isPending ? 0.6 : 1 }}>
            {mutation.isPending ? "Sending…" : "Send Offer"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 p-[17px]">
        <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{entry.serviceName}</p>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>START TIME</span>
          <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="w-full rounded-[11px] p-3 text-[13.5px]" style={{ border: "1px solid var(--app-border)" }} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>HOLD DURATION</span>
          <select value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} className="w-full rounded-[11px] p-3 text-[13px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
            {DURATIONS.map((d) => (
              <option key={d.minutes} value={d.minutes}>{d.label}</option>
            ))}
          </select>
        </label>
      </div>
    </PosModalShell>
  );
}

function AddWaitlistModal({ onClose }: { onClose: () => void }) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [preferredFrom, setPreferredFrom] = useState("");
  const queryClient = useQueryClient();
  const { data: services } = useQuery({ queryKey: ["products", "service"], queryFn: () => fetchProducts({ kind: "service" }) });

  const mutation = useMutation({
    mutationFn: () =>
      joinWaitlist({
        serviceId,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        preferredFrom: preferredFrom ? new Date(preferredFrom).toISOString() : undefined,
      }),
    onSuccess: (entry) => {
      queryClient.invalidateQueries({ queryKey: ["waitlist"] });
      toast.success(`${entry.customerName} added to the waiting list.`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't add this entry."),
  });

  const canSave = customerName.trim() !== "" && customerPhone.trim() !== "" && !!serviceId;

  return (
    <PosModalShell
      open
      onClose={onClose}
      title="Add to Waitlist"
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={!canSave || mutation.isPending} style={{ ...primaryBtn, opacity: !canSave || mutation.isPending ? 0.6 : 1 }}>
            {mutation.isPending ? "Adding…" : "Add to Waitlist"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 p-[17px]">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>CUSTOMER NAME</span>
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="w-full rounded-[11px] p-3 text-[13.5px]" style={{ border: "1px solid var(--app-border)" }} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>PHONE</span>
          <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="03xx xxxxxxx" className="w-full rounded-[11px] p-3 text-[13.5px]" style={{ border: "1px solid var(--app-border)" }} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>SERVICE</span>
          <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className="w-full rounded-[11px] p-3 text-[13px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
            <option value="" disabled>Select a service…</option>
            {(services ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>PREFERRED DATE / TIME (OPTIONAL)</span>
          <input type="datetime-local" value={preferredFrom} onChange={(e) => setPreferredFrom(e.target.value)} className="w-full rounded-[11px] p-3 text-[13.5px]" style={{ border: "1px solid var(--app-border)" }} />
        </label>
      </div>
    </PosModalShell>
  );
}
