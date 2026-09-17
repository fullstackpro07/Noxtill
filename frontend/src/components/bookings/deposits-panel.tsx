"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PosModalShell } from "@/components/pos/pos-modal-shell";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import {
  fetchDeposits,
  captureDeposit,
  refundDeposit,
  fetchDepositSettings,
  updateDepositSettings,
  type DepositStatus,
  type DepositAmountType,
} from "@/lib/deposits-api";
import { fetchProducts } from "@/lib/products-api";
import { useSession } from "@/lib/session";

const STATUS_TONE: Record<DepositStatus, { bg: string; fg: string }> = {
  pending: { bg: "var(--app-warning-bg)", fg: "var(--app-warning-text)" },
  captured: { bg: "var(--app-success-bg)", fg: "var(--app-success-text)" },
  refunded: { bg: "var(--app-surface-2)", fg: "var(--app-text-disabled)" },
  forfeited: { bg: "#FEE4E2", fg: "var(--app-danger-strong)" },
};

const selectStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 10, padding: "9px 11px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 42 };
const primaryHeaderBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };
const smallOutline: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 9, padding: "8px 12px", fontSize: 11.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 40 };
const cancelBtn: React.CSSProperties = { background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)" };
const primaryBtn: React.CSSProperties = { background: "var(--app-primary)", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff" };

const DATE_OPTIONS = [
  { key: "month", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "week", label: "This week" },
  { key: "all", label: "All time" },
] as const;

function inRange(dateIso: string, key: (typeof DATE_OPTIONS)[number]["key"]): boolean {
  const d = new Date(dateIso);
  const now = new Date();
  if (key === "all") return true;
  if (key === "week") {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
    return d >= weekAgo;
  }
  if (key === "month") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return d.getFullYear() === lastMonth.getFullYear() && d.getMonth() === lastMonth.getMonth();
}

export function DepositsPanel() {
  const session = useSession();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<DepositStatus | "">("");
  const [dateFilter, setDateFilter] = useState<(typeof DATE_OPTIONS)[number]["key"]>("month");
  const [serviceFilter, setServiceFilter] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { data: deposits } = useQuery({ queryKey: ["deposits"], queryFn: () => fetchDeposits() });
  const { data: services } = useQuery({ queryKey: ["products", "service"], queryFn: () => fetchProducts({ kind: "service" }) });

  const captureMutation = useMutation({
    mutationFn: (id: string) => captureDeposit(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["deposits"] }); toast.success("Deposit captured."); },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't capture this deposit."),
  });
  const refundMutation = useMutation({
    mutationFn: (id: string) => refundDeposit(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["deposits"] }); toast.success("Deposit refunded."); },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't refund this deposit."),
  });

  const filtered = useMemo(() => {
    return (deposits ?? []).filter((d) => {
      if (statusFilter && d.status !== statusFilter) return false;
      if (serviceFilter && d.serviceName !== services?.find((s) => s.id === serviceFilter)?.name) return false;
      if (!inRange(d.createdAt, dateFilter)) return false;
      return true;
    });
  }, [deposits, statusFilter, serviceFilter, dateFilter, services]);

  const kpis = useMemo(() => {
    const all = deposits ?? [];
    const now = new Date();
    const held = all.filter((d) => d.status === "pending").reduce((s, d) => s + Number(d.amount), 0);
    const capturedThisMonth = all.filter((d) => d.status === "captured" && new Date(d.createdAt).getMonth() === now.getMonth() && new Date(d.createdAt).getFullYear() === now.getFullYear()).reduce((s, d) => s + Number(d.amount), 0);
    const refunded = all.filter((d) => d.status === "refunded").reduce((s, d) => s + Number(d.amount), 0);
    const forfeited = all.filter((d) => d.status === "forfeited").reduce((s, d) => s + Number(d.amount), 0);
    return { held, capturedThisMonth, refunded, forfeited };
  }, [deposits]);

  const outcomes = useMemo(() => {
    const all = deposits ?? [];
    const total = all.length || 1;
    const statuses: DepositStatus[] = ["pending", "captured", "refunded", "forfeited"];
    return statuses.map((s) => ({ status: s, count: all.filter((d) => d.status === s).length, pct: (all.filter((d) => d.status === s).length / total) * 100 }));
  }, [deposits]);

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Deposits</h2>
        <button type="button" onClick={() => setSettingsOpen(true)} className="ms-auto" style={primaryHeaderBtn}>Deposit Settings</button>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Held</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(kpis.held, session.business.currency)}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Captured This Month</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-primary)" }}>{formatCurrency(kpis.capturedThisMonth, session.business.currency)}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Refunded</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(kpis.refunded, session.business.currency)}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid #FDD9D6" }}>
          <div className="text-[12px] font-bold" style={{ color: "var(--app-danger-strong)" }}>Forfeited — No-Shows</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(kpis.forfeited, session.business.currency)}</div>
        </div>
      </div>

      <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <h3 className="m-0 mb-3 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Deposit outcomes</h3>
        <div className="flex flex-col gap-2.5">
          {outcomes.map((o) => (
            <div key={o.status}>
              <div className="mb-1 flex justify-between"><span className="text-[12.5px] font-semibold capitalize" style={{ color: "var(--app-text-muted)" }}>{o.status}</span><span className="text-[11.5px] font-bold" style={{ color: "var(--app-text-faint)" }}>{o.count} · {o.pct.toFixed(0)}%</span></div>
              <div className="h-2 overflow-hidden rounded-[6px]" style={{ background: "var(--app-surface-2)" }}>
                <div className="h-full rounded-[6px]" style={{ width: `${o.pct}%`, background: STATUS_TONE[o.status].fg }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap gap-2 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as DepositStatus | "")} aria-label="Status" style={selectStyle}>
            <option value="">All statuses</option>
            <option value="pending">Held</option>
            <option value="captured">Captured</option>
            <option value="refunded">Refunded</option>
            <option value="forfeited">Forfeited</option>
          </select>
          <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value as typeof dateFilter)} aria-label="Date" style={selectStyle}>
            {DATE_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
          <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} aria-label="Service" style={selectStyle}>
            <option value="">All services</option>
            {(services ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {deposits && filtered.length === 0 ? (
          <div className="p-[52px_18px] text-center">
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No deposits held</div>
            <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Turn on deposits for high-value services to protect your time.</div>
            <button type="button" onClick={() => setSettingsOpen(true)} className="mt-[15px] rounded-[11px] px-5 py-3 text-[12.5px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>Deposit Settings</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 880 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Booking</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Customer</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Service</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Amount</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Held Since</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Status</th>
                  <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                    <td className="whitespace-nowrap p-[12px_17px] text-[12.5px] font-extrabold" style={{ color: "var(--app-success-text)" }}>{formatDate(d.appointmentStartsAt)} {formatTime(d.appointmentStartsAt)}</td>
                    <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{d.customerName}</td>
                    <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{d.serviceName}</td>
                    <td className="p-[12px] text-end text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(Number(d.amount), session.business.currency)}</td>
                    <td className="p-[12px] text-[12px]" style={{ color: "var(--app-text-disabled)" }}>{formatDate(d.createdAt)}</td>
                    <td className="p-[12px]"><span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: STATUS_TONE[d.status].bg, color: STATUS_TONE[d.status].fg }}>{d.status === "pending" ? "Held" : d.status}</span></td>
                    <td className="p-[12px_17px] text-end">
                      {d.status === "pending" && d.method === "cash" && (
                        <button type="button" onClick={() => captureMutation.mutate(d.id)} disabled={captureMutation.isPending} style={{ border: 0, background: "var(--app-primary)", borderRadius: 9, padding: "8px 14px", fontSize: 11.5, fontWeight: 800, color: "#fff", minHeight: 40 }}>Capture</button>
                      )}
                      {d.status === "captured" && (
                        <button type="button" onClick={() => refundMutation.mutate(d.id)} disabled={refundMutation.isPending} style={{ ...smallOutline, color: "var(--app-danger-strong)" }}>Refund</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {settingsOpen && <DepositSettingsModal onClose={() => setSettingsOpen(false)} />}
    </main>
  );
}

function DepositSettingsModal({ onClose }: { onClose: () => void }) {
  const { data: settings, isPending } = useQuery({ queryKey: ["deposit-settings"], queryFn: fetchDepositSettings });
  const { data: services } = useQuery({ queryKey: ["products", "service"], queryFn: () => fetchProducts({ kind: "service" }) });

  if (isPending || !settings) {
    return (
      <PosModalShell open onClose={onClose} title="Deposit Settings" footer={<button type="button" onClick={onClose} style={cancelBtn}>Close</button>}>
        <p className="m-0 p-[17px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Loading…</p>
      </PosModalShell>
    );
  }
  return <DepositSettingsForm settings={settings} services={services ?? []} onClose={onClose} />;
}

function DepositSettingsForm({
  settings,
  services,
  onClose,
}: {
  settings: { required: boolean; triggerAfterNoShows: number | null; amountType: DepositAmountType; amountValue: number | string; applicableServiceIds: string[] };
  services: { id: string; name: string }[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [required, setRequired] = useState(settings.required);
  const [triggerAfterNoShows, setTriggerAfterNoShows] = useState(settings.triggerAfterNoShows != null ? String(settings.triggerAfterNoShows) : "");
  const [amountType, setAmountType] = useState<DepositAmountType>(settings.amountType);
  const [amountValue, setAmountValue] = useState(Number(settings.amountValue));
  const [applicableServiceIds, setApplicableServiceIds] = useState<string[]>(settings.applicableServiceIds);

  const mutation = useMutation({
    mutationFn: () =>
      updateDepositSettings({
        required,
        triggerAfterNoShows: triggerAfterNoShows ? Number(triggerAfterNoShows) : null,
        amountType,
        amountValue,
        applicableServiceIds,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deposit-settings"] });
      toast.success("Deposit settings saved.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save deposit settings."),
  });

  function toggleService(id: string) {
    setApplicableServiceIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  }

  return (
    <PosModalShell
      open
      onClose={onClose}
      title="Deposit Settings"
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending} style={{ ...primaryBtn, opacity: mutation.isPending ? 0.6 : 1 }}>
            {mutation.isPending ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 p-[17px]">
        <label className="flex items-center gap-3 rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}>
          <span className="flex-1 text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>Deposits enabled</span>
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} style={{ accentColor: "var(--app-primary)", width: 18, height: 18 }} />
        </label>
        {required && (
          <>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>REQUIRED AFTER N NO-SHOWS (BLANK = ALWAYS)</span>
              <input type="number" min={0} value={triggerAfterNoShows} onChange={(e) => setTriggerAfterNoShows(e.target.value)} className="w-full rounded-[11px] p-3 text-[14px] font-bold" style={{ border: "1px solid var(--app-border)" }} />
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>AMOUNT TYPE</span>
                <select value={amountType} onChange={(e) => setAmountType(e.target.value as DepositAmountType)} className="w-full rounded-[11px] p-3 text-[13px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
                  <option value="flat">Flat amount</option>
                  <option value="percent">Percent of total</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>VALUE</span>
                <input type="number" min={0} step="0.01" value={amountValue} onChange={(e) => setAmountValue(Number(e.target.value))} className="w-full rounded-[11px] p-3 text-[14px] font-bold" style={{ border: "1px solid var(--app-border)" }} />
              </label>
            </div>
            <div>
              <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>APPLIES TO (BLANK = EVERY SERVICE)</span>
              <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto rounded-[11px] p-1" style={{ border: "1px solid var(--app-border)" }}>
                {services.map((s) => (
                  <label key={s.id} className="flex items-center gap-2.5 p-2 text-[12.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>
                    <input type="checkbox" checked={applicableServiceIds.includes(s.id)} onChange={() => toggleService(s.id)} style={{ accentColor: "var(--app-primary)" }} />
                    {s.name}
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </PosModalShell>
  );
}
