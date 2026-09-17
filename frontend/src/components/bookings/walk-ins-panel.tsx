"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PosModalShell } from "@/components/pos/pos-modal-shell";
import { fetchQueue, type QueueToken } from "@/lib/queue-api";
import { fetchAppointments } from "@/lib/bookings-api";
import { fetchProducts } from "@/lib/products-api";
import { useNow } from "@/hooks/use-now";
import { createCustomer } from "@/lib/customers-api";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";

const STATUS_TONE: Record<QueueToken["status"], { bg: string; fg: string }> = {
  waiting: { bg: "var(--app-surface-2)", fg: "var(--app-text-muted)" },
  called: { bg: "var(--app-warning-bg)", fg: "var(--app-warning-text)" },
  serving: { bg: "var(--app-success-bg)", fg: "var(--app-success-text)" },
  served: { bg: "var(--app-success-bg)", fg: "var(--app-success-text)" },
  skipped: { bg: "#FEE4E2", fg: "var(--app-danger-strong)" },
  cancelled: { bg: "var(--app-surface-2)", fg: "var(--app-text-disabled)" },
};

const selectStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 10, padding: "9px 11px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 42 };
const cancelBtn: React.CSSProperties = { background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)" };
const primaryBtn: React.CSSProperties = { background: "var(--app-primary)", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff" };
const smallOutline: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 9, padding: "8px 13px", fontSize: 12, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 40 };

const RANGE_OPTIONS = [
  { key: "today", label: "Today", days: 0 },
  { key: "yesterday", label: "Yesterday", days: -1, single: true },
  { key: "week", label: "This week", days: -6 },
] as const;

function dayRange(offsetStart: number, offsetEnd = 0): { from: string; to: string } {
  const from = new Date();
  from.setDate(from.getDate() + offsetStart);
  from.setHours(0, 0, 0, 0);
  const to = new Date();
  to.setDate(to.getDate() + offsetEnd);
  to.setHours(23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

function waitMinutes(t: QueueToken, now: number): number {
  const start = new Date(t.createdAt).getTime();
  const end = t.servedAt ? new Date(t.servedAt).getTime() : t.calledAt ? new Date(t.calledAt).getTime() : now;
  return Math.max(0, Math.round((end - start) / 60_000));
}

export function WalkInsPanel() {
  const queryClient = useQueryClient();
  const [range, setRange] = useState<(typeof RANGE_OPTIONS)[number]["key"]>("today");
  const [serviceFilter, setServiceFilter] = useState("");
  const [converting, setConverting] = useState<QueueToken | null>(null);

  const todayRange = useMemo(() => dayRange(0), []);
  const { data: todayTokens } = useQuery({ queryKey: ["queue-history", "today"], queryFn: () => fetchQueue(todayRange) });
  const { data: todayAppointments } = useQuery({ queryKey: ["appointments", "today-for-walkins"], queryFn: () => fetchAppointments({ from: todayRange.from, to: todayRange.to }) });

  const activeRange = RANGE_OPTIONS.find((r) => r.key === range)!;
  const filterRange = useMemo(() => dayRange(activeRange.days, "single" in activeRange && activeRange.single ? activeRange.days : 0), [activeRange]);
  const { data: tokens, isPending } = useQuery({ queryKey: ["queue-history", range], queryFn: () => fetchQueue(filterRange) });
  const { data: services } = useQuery({ queryKey: ["products", "service"], queryFn: () => fetchProducts({ kind: "service" }) });

  const filtered = useMemo(() => (tokens ?? []).filter((t) => !serviceFilter || t.serviceName === services?.find((s) => s.id === serviceFilter)?.name), [tokens, serviceFilter, services]);

  const now = useNow();
  const kpis = useMemo(() => {
    const walkIns = todayTokens ?? [];
    const appts = todayAppointments ?? [];
    const total = walkIns.length + appts.length;
    const pct = total > 0 ? (walkIns.length / total) * 100 : 0;
    const avgWait = walkIns.length > 0 ? Math.round(walkIns.reduce((sum, t) => sum + waitMinutes(t, now), 0) / walkIns.length) : 0;
    const converted = walkIns.filter((t) => t.status !== "cancelled" && t.status !== "skipped").length;
    return { walkInsToday: walkIns.length, pct, avgWait, converted };
  }, [todayTokens, todayAppointments, now]);

  const byHour = useMemo(() => {
    const counts = new Array(14).fill(0); // 8am - 9pm
    for (const t of filtered) {
      const h = new Date(t.createdAt).getHours();
      if (h >= 8 && h < 22) counts[h - 8] += 1;
    }
    return counts;
  }, [filtered]);
  const maxHour = Math.max(...byHour, 1);

  const convertMutation = useMutation({
    mutationFn: (phone: string) => createCustomer({ name: converting!.customerName, phone }),
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: ["queue-history"] });
      toast.success(`${customer.name} saved as a customer.`);
      setConverting(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't create this customer."),
  });

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Walk-ins</h2>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Walk-ins Today</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{kpis.walkInsToday}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>% of Total Visits</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{kpis.pct.toFixed(0)}%</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Average Wait</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{kpis.avgWait}m</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Served or Serving</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-primary)" }}>{kpis.converted}</div>
        </div>
      </div>

      <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <h3 className="m-0 mb-1.5 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Walk-ins by hour</h3>
        <div className="flex items-end gap-1.5" style={{ height: 130 }}>
          {byHour.map((count, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div className="w-full rounded-t-[4px]" style={{ height: `${(count / maxHour) * 100}px`, background: "var(--app-success-border)" }} />
              <span className="text-[9.5px] font-semibold" style={{ color: "var(--app-text-faint)" }}>{i + 8}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap gap-2 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <select value={range} onChange={(e) => setRange(e.target.value as typeof range)} aria-label="Date" style={selectStyle}>
            {RANGE_OPTIONS.map((r) => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </select>
          <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} aria-label="Service" style={selectStyle}>
            <option value="">All services</option>
            {(services ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {!isPending && filtered.length === 0 ? (
          <div className="p-[52px_18px] text-center">
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No walk-ins in this range</div>
            <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Add one from the Queue tab or the header&apos;s Walk-in button.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 780 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Time</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Customer / Guest</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Service</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Wait Time</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Status</th>
                  <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                    <td className="whitespace-nowrap p-[12px_17px] text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>{new Date(t.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</td>
                    <td className="p-[12px] text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>#{t.number} · {t.customerName}</td>
                    <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{t.serviceName ?? "—"}</td>
                    <td className="p-[12px] text-end text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{waitMinutes(t, now)}m</td>
                    <td className="p-[12px]"><span className="whitespace-nowrap rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: STATUS_TONE[t.status].bg, color: STATUS_TONE[t.status].fg }}>{t.status}</span></td>
                    <td className="p-[12px_17px] text-end">
                      <button type="button" onClick={() => setConverting(t)} style={smallOutline}>Convert to Customer</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {converting && <ConvertModal token={converting} onClose={() => setConverting(null)} onConfirm={(phone) => convertMutation.mutate(phone)} pending={convertMutation.isPending} />}
    </main>
  );
}

function ConvertModal({ token, onClose, onConfirm, pending }: { token: QueueToken; onClose: () => void; onConfirm: (phone: string) => void; pending: boolean }) {
  const [phone, setPhone] = useState("");

  return (
    <PosModalShell
      open
      onClose={onClose}
      title={`Convert ${token.customerName} to a Customer`}
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
          <button type="button" onClick={() => onConfirm(phone)} disabled={!phone.trim() || pending} style={{ ...primaryBtn, opacity: !phone.trim() || pending ? 0.6 : 1 }}>
            {pending ? "Saving…" : "Create Customer"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 p-[17px]">
        <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>A queue ticket only captures a name — add a phone number to save this walk-in as a real customer record.</p>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>PHONE</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03xx xxxxxxx" className="w-full rounded-[11px] p-3 text-[13.5px]" style={{ border: "1px solid var(--app-border)" }} />
        </label>
      </div>
    </PosModalShell>
  );
}
