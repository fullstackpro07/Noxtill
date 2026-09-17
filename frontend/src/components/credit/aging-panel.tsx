"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { fetchDebtors, fetchOverdueAgeing, bulkRemindDebtors, type LiveDebtor } from "@/lib/credit-api";
import { RecordPaymentDialog } from "./record-payment-dialog";
import { ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";
import { useSession } from "@/lib/session";
import { useCreditSearchStore } from "@/store/credit-search-store";

const BUCKET_LABEL: Record<string, string> = { current: "Current", thirtyPlus: "1–30 days", sixtyPlus: "31–60 days", ninetyPlus: "60+ days" };
const BUCKET_COLOR: Record<string, string> = { current: "#12A150", thirtyPlus: "#F59E0B", sixtyPlus: "#F97316", ninetyPlus: "#B42318" };

function bucketFor(days: number): "current" | "thirtyPlus" | "sixtyPlus" | "ninetyPlus" {
  if (days >= 90) return "ninetyPlus";
  if (days >= 60) return "sixtyPlus";
  if (days >= 30) return "thirtyPlus";
  return "current";
}

function riskFor(days: number): { label: string; bg: string; fg: string } {
  if (days >= 90) return { label: "Currently Overdue", bg: "#FEF3F2", fg: "#B42318" };
  if (days >= 30) return { label: "Some Delays", bg: "#FEF6E7", fg: "#B54708" };
  return { label: "Good History", bg: "#E8F7EE", fg: "#0E8442" };
}

const selectStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 10, padding: "9px 11px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 42 };
const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };
const primaryBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };
const smallOutline: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 9, padding: "8px 11px", fontSize: 11.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 40 };
const smallPrimary: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 9, padding: "8px 13px", fontSize: 11.5, fontWeight: 800, color: "#fff", minHeight: 40 };

function downloadCsv(rows: LiveDebtor[]) {
  const header = "Customer,Phone,Balance,Days Outstanding,Reminders\n";
  const body = rows.map((d) => `"${d.name}","${d.phone}",${d.balance},${d.daysOutstanding},${d.optedOutOfReminders ? "Opted out" : "Allowed"}`).join("\n");
  const blob = new Blob([header + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `credit-outstanding-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function AgingPanel() {
  const session = useSession();
  const currency = session.business.currency;
  const router = useRouter();
  const query = useCreditSearchStore((s) => s.query);
  const [selected, setSelected] = useState<string[]>([]);
  const [payingDebtor, setPayingDebtor] = useState<LiveDebtor | null>(null);
  const [ageFilter, setAgeFilter] = useState("All ageing");
  const [activityFilter, setActivityFilter] = useState("Any activity");
  const [riskFilter, setRiskFilter] = useState("All risk");
  const [remindFilter, setRemindFilter] = useState("All reminders");

  const { data: debtors = [], isPending } = useQuery({ queryKey: ["debtors", "overdue"], queryFn: () => fetchDebtors("overdue") });
  const { data: ageing } = useQuery({ queryKey: ["credit-overdue"], queryFn: fetchOverdueAgeing });

  const remindMutation = useMutation({
    mutationFn: (customerIds: string[]) => bulkRemindDebtors(customerIds),
    onSuccess: (result) => { toast.success(`Sent ${result.sent} reminder(s)${result.skipped ? `, ${result.skipped} skipped` : ""}.`); setSelected([]); },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send reminders."),
  });

  const total = useMemo(() => debtors.reduce((s, d) => s + d.balance, 0), [debtors]);
  const largest = useMemo(() => debtors.reduce((m, d) => Math.max(m, d.balance), 0), [debtors]);

  const filtered = useMemo(() => {
    const ageMap: Record<string, string> = { Current: "current", "1–30 days": "thirtyPlus", "31–60 days": "sixtyPlus", "60+ days": "ninetyPlus" };
    return debtors.filter((d) => {
      if (query && !d.name.toLowerCase().includes(query.toLowerCase()) && !d.phone.includes(query)) return false;
      if (ageFilter !== "All ageing" && bucketFor(d.daysOutstanding) !== ageMap[ageFilter]) return false;
      if (activityFilter === "Last 7 days" && d.daysOutstanding > 7) return false;
      if (activityFilter === "Last 30 days" && d.daysOutstanding > 30) return false;
      const risk = riskFor(d.daysOutstanding).label;
      if (riskFilter !== "All risk" && risk !== riskFilter) return false;
      if (remindFilter === "Opted out" && !d.optedOutOfReminders) return false;
      if (remindFilter === "Reminders allowed" && d.optedOutOfReminders) return false;
      return true;
    });
  }, [debtors, query, ageFilter, activityFilter, riskFilter, remindFilter]);

  function toggle(id: string) {
    setSelected((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[10px]">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Outstanding</h2>
        <div className="ml-auto flex flex-wrap gap-[9px]">
          <button type="button" onClick={() => downloadCsv(filtered)} style={outlineBtn}>Export</button>
          {selected.length > 0 && (
            <button type="button" onClick={() => remindMutation.mutate(selected)} disabled={remindMutation.isPending} style={primaryBtn}>Remind Selected ({selected.length})</button>
          )}
        </div>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1.5px solid #FDD9D6" }}>
          <div className="text-[12px] font-bold" style={{ color: "#B42318" }}>Total Outstanding</div>
          <div className="mt-[5px] text-[23px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.6px" }}>{formatCurrency(total, currency)}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Customers Owing</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{debtors.length}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Average Balance</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(debtors.length ? total / debtors.length : 0, currency)}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Largest Balance</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "#B54708" }}>{formatCurrency(largest, currency)}</div>
        </div>
      </div>

      <div className="grid gap-[15px]" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
        <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", minWidth: 0 }}>
          <h3 className="m-0 mb-3 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Outstanding by ageing bucket</h3>
          <div className="flex flex-col gap-[11px]">
            {(ageing?.buckets ?? []).map((b) => {
              const pct = total > 0 ? Math.round((b.total / total) * 100) : 0;
              return (
                <div key={b.key}>
                  <div className="mb-[5px] flex justify-between">
                    <span className="text-[12.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{BUCKET_LABEL[b.key]}</span>
                    <span className="text-[11.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(b.total, currency)}</span>
                  </div>
                  <div className="h-[9px] overflow-hidden rounded-[6px]" style={{ background: "var(--app-surface-2)" }}>
                    <div className="h-full rounded-[6px]" style={{ width: `${pct}%`, background: BUCKET_COLOR[b.key] }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", minWidth: 0 }}>
          <h3 className="m-0 mb-3 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Balance distribution</h3>
          <div className="flex flex-col gap-[9px]">
            {[...debtors].sort((a, b) => b.balance - a.balance).slice(0, 8).map((d) => (
              <div key={d.customerId} className="flex items-center gap-[10px]">
                <span className="w-[118px] overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{d.name}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-[6px]" style={{ background: "var(--app-surface-2)" }}>
                  <span className="block h-full rounded-[6px]" style={{ width: `${largest > 0 ? (d.balance / largest) * 100 : 0}%`, background: "#B42318" }} />
                </span>
                <span className="w-[88px] text-end text-[11.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(d.balance, currency)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap items-center gap-2 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <select value={ageFilter} onChange={(e) => setAgeFilter(e.target.value)} aria-label="Ageing bucket" style={selectStyle}>
            {["All ageing", "Current", "1–30 days", "31–60 days", "60+ days"].map((o) => <option key={o}>{o}</option>)}
          </select>
          <select value={activityFilter} onChange={(e) => setActivityFilter(e.target.value)} aria-label="Last activity" style={selectStyle}>
            {["Any activity", "Last 7 days", "Last 30 days"].map((o) => <option key={o}>{o}</option>)}
          </select>
          <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} aria-label="Risk signal" style={selectStyle}>
            {["All risk", "Good History", "Some Delays", "Currently Overdue"].map((o) => <option key={o}>{o}</option>)}
          </select>
          <select value={remindFilter} onChange={(e) => setRemindFilter(e.target.value)} aria-label="Reminder status" style={selectStyle}>
            {["All reminders", "Opted out", "Reminders allowed"].map((o) => <option key={o}>{o}</option>)}
          </select>
          {selected.length > 0 && (
            <span className="ml-auto flex items-center gap-2.5">
              <span className="text-[12px] font-bold" style={{ color: "var(--app-primary)" }}>{selected.length} selected</span>
              <button type="button" onClick={() => setSelected([])} className="text-[12px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Clear</button>
            </span>
          )}
        </div>

        {!isPending && filtered.length === 0 && (
          <div className="p-[52px_18px] text-center">
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No outstanding credit — nice</div>
            <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Nothing matches these filters.</div>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 1080 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="w-[34px] p-[10px_0_10px_17px]" />
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Customer</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Phone</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Balance</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Last Activity</th>
                  <th className="p-[10px] text-center text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Days Outstanding</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Risk Signal</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Reminder Status</th>
                  <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => {
                  const risk = riskFor(d.daysOutstanding);
                  return (
                    <tr key={d.customerId} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                      <td className="p-[11px_0_11px_17px]"><input type="checkbox" checked={selected.includes(d.customerId)} onChange={() => toggle(d.customerId)} aria-label={`Select ${d.name}`} style={{ width: 15, height: 15, accentColor: "var(--app-primary)" }} /></td>
                      <td className="p-[11px]"><button type="button" onClick={() => router.push(`/credit/customer?id=${d.customerId}`)} className="text-[12.5px] font-bold" style={{ color: "var(--app-primary)" }}>{d.name}</button></td>
                      <td className="whitespace-nowrap p-[11px] text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{d.phone}</td>
                      <td className="p-[11px] text-end text-[13.5px] font-extrabold" style={{ color: "#B42318" }}>{formatCurrency(d.balance, currency)}</td>
                      <td className="whitespace-nowrap p-[11px] text-[12px]" style={{ color: "var(--app-text-disabled)" }}>{d.daysOutstanding}d ago</td>
                      <td className="p-[11px] text-center"><span className="whitespace-nowrap rounded-full px-[9px] py-[3px] text-[11px] font-extrabold" style={{ background: risk.bg, color: risk.fg }}>{d.daysOutstanding} days</span></td>
                      <td className="p-[11px]"><span className="whitespace-nowrap rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: risk.bg, color: risk.fg }}>{risk.label}</span></td>
                      <td className="p-[11px]">
                        {d.optedOutOfReminders ? (
                          <span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: "var(--app-surface-2)", color: "var(--app-text-muted)" }}>Opted out</span>
                        ) : (
                          <span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: "#E8F7EE", color: "#0E8442" }}>Allowed</span>
                        )}
                      </td>
                      <td className="p-[11px_17px] text-end">
                        <span className="inline-flex gap-[7px]">
                          <button type="button" onClick={() => remindMutation.mutate([d.customerId])} disabled={d.optedOutOfReminders} style={smallOutline}>Remind</button>
                          <button type="button" onClick={() => setPayingDebtor(d)} style={smallPrimary}>Record Payment</button>
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

      <RecordPaymentDialog debtor={payingDebtor} currency={currency} onClose={() => setPayingDebtor(null)} />
    </main>
  );
}
