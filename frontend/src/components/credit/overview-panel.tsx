"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  fetchDebtors,
  fetchOverdueAgeing,
  fetchInstallments,
  fetchRecoveryReport,
  fetchCreditBalanceHistory,
  bulkRemindDebtors,
  type LiveDebtor,
} from "@/lib/credit-api";
import { RecordPaymentDialog } from "./record-payment-dialog";
import { StatementDialog } from "./statement-dialog";
import { ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";
import { useSession } from "@/lib/session";
import { useCreditSearchStore } from "@/store/credit-search-store";

const BUCKET_LABEL: Record<string, string> = { current: "Current", thirtyPlus: "1–30 days", sixtyPlus: "31–60 days", ninetyPlus: "60+ days" };
const BUCKET_COLOR: Record<string, string> = { current: "#12A150", thirtyPlus: "#F59E0B", sixtyPlus: "#F97316", ninetyPlus: "#B42318" };

function priorityFor(daysOutstanding: number): { label: string; bg: string; fg: string } {
  if (daysOutstanding >= 90) return { label: "High risk", bg: "#FEF3F2", fg: "#B42318" };
  if (daysOutstanding >= 30) return { label: "Watch", bg: "#FEF6E7", fg: "#B54708" };
  return { label: "Low risk", bg: "#E8F7EE", fg: "#0E8442" };
}

function bucketFor(days: number): "current" | "thirtyPlus" | "sixtyPlus" | "ninetyPlus" {
  if (days >= 90) return "ninetyPlus";
  if (days >= 60) return "sixtyPlus";
  if (days >= 30) return "thirtyPlus";
  return "current";
}

const kpiCard: React.CSSProperties = { background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 14, padding: 15 };
const selectStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 10, padding: "9px 11px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 42 };
const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 9, padding: "8px 11px", fontSize: 11.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 40 };
const primaryBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 9, padding: "8px 13px", fontSize: 11.5, fontWeight: 800, color: "#fff", minHeight: 40 };

function downloadCsv(rows: LiveDebtor[]) {
  const header = "Customer,Phone,Balance,Days Outstanding,Reminders\n";
  const body = rows
    .map((d) => `"${d.name}","${d.phone}",${d.balance},${d.daysOutstanding},${d.optedOutOfReminders ? "Opted out" : "Allowed"}`)
    .join("\n");
  const blob = new Blob([header + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `credit-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function OverviewPanel() {
  const session = useSession();
  const router = useRouter();
  const currency = session.business.currency;
  const query = useCreditSearchStore((s) => s.query);
  const [payingDebtor, setPayingDebtor] = useState<LiveDebtor | null>(null);
  const [statementDebtor, setStatementDebtor] = useState<LiveDebtor | null>(null);
  const [ageFilter, setAgeFilter] = useState("All ageing");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [activityFilter, setActivityFilter] = useState("Any activity");
  const [optOutFilter, setOptOutFilter] = useState("All customers");

  const { data: debtors = [], isPending } = useQuery({ queryKey: ["debtors", "overdue"], queryFn: () => fetchDebtors("overdue") });
  const { data: ageing } = useQuery({ queryKey: ["credit-overdue"], queryFn: fetchOverdueAgeing });
  const { data: dueToday = [] } = useQuery({ queryKey: ["installments", "today"], queryFn: () => fetchInstallments("today") });
  const { data: recovery } = useQuery({ queryKey: ["recovery-report", 1], queryFn: () => fetchRecoveryReport(1) });
  const { data: history = [] } = useQuery({ queryKey: ["credit-balance-history", 90], queryFn: () => fetchCreditBalanceHistory(90) });

  const remindMutation = useMutation({
    mutationFn: (customerIds: string[]) => bulkRemindDebtors(customerIds),
    onSuccess: (result) => toast.success(`Sent ${result.sent} reminder(s)${result.skipped ? `, ${result.skipped} skipped` : ""}.`),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send reminders."),
  });

  const totalReceivable = useMemo(() => debtors.reduce((s, d) => s + d.balance, 0), [debtors]);
  const overduePct = useMemo(() => {
    if (!ageing || totalReceivable === 0) return 0;
    const overdue = ageing.buckets.filter((b) => b.key !== "current").reduce((s, b) => s + b.total, 0);
    return Math.round((overdue / totalReceivable) * 100);
  }, [ageing, totalReceivable]);
  const dueTodayTotal = useMemo(() => dueToday.reduce((s, i) => s + i.amount, 0), [dueToday]);
  const avgDays = useMemo(() => (debtors.length ? Math.round(debtors.reduce((s, d) => s + d.daysOutstanding, 0) / debtors.length) : 0), [debtors]);
  const overdue30 = useMemo(() => {
    if (!ageing) return { total: 0, count: 0 };
    const buckets = ageing.buckets.filter((b) => b.key !== "current");
    return { total: buckets.reduce((s, b) => s + b.total, 0), count: buckets.reduce((s, b) => s + b.count, 0) };
  }, [ageing]);

  const priorityQueue = useMemo(() => [...debtors].sort((a, b) => b.balance - a.balance).slice(0, 6), [debtors]);

  const concentration = useMemo(() => {
    const top3 = [...debtors].sort((a, b) => b.balance - a.balance).slice(0, 3);
    const top3Total = top3.reduce((s, d) => s + d.balance, 0);
    return {
      pct: totalReceivable > 0 ? Math.round((top3Total / totalReceivable) * 100) : 0,
      rows: top3.map((d) => ({ name: d.name, amount: d.balance, share: totalReceivable > 0 ? Math.round((d.balance / totalReceivable) * 100) : 0 })),
    };
  }, [debtors, totalReceivable]);

  const filtered = useMemo(() => {
    return debtors.filter((d) => {
      if (query && !d.name.toLowerCase().includes(query.toLowerCase()) && !d.phone.includes(query)) return false;
      if (ageFilter !== "All ageing") {
        const map: Record<string, string> = { Current: "current", "1–30 days": "thirtyPlus", "31–60 days": "sixtyPlus", "60+ days": "ninetyPlus" };
        if (bucketFor(d.daysOutstanding) !== map[ageFilter]) return false;
      }
      if (minAmount && d.balance < Number(minAmount)) return false;
      if (maxAmount && d.balance > Number(maxAmount)) return false;
      if (activityFilter === "Last 7 days" && d.daysOutstanding > 7) return false;
      if (activityFilter === "Last 30 days" && d.daysOutstanding > 30) return false;
      if (activityFilter === "Over 30 days ago" && d.daysOutstanding <= 30) return false;
      if (optOutFilter === "Opted out only" && !d.optedOutOfReminders) return false;
      if (optOutFilter === "Reminders allowed" && d.optedOutOfReminders) return false;
      return true;
    });
  }, [debtors, query, ageFilter, minAmount, maxAmount, activityFilter, optOutFilter]);

  function clearFilters() {
    setAgeFilter("All ageing");
    setMinAmount("");
    setMaxAmount("");
    setActivityFilter("Any activity");
    setOptOutFilter("All customers");
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))" }}>
        <div style={kpiCard}>
          <div className="text-[11.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Overdue %</div>
          <div className="mt-[5px] text-[20px] font-extrabold" style={{ color: "#B42318" }}>{overduePct}%</div>
        </div>
        <div style={kpiCard}>
          <div className="text-[11.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Due Today</div>
          <div className="mt-[5px] text-[20px] font-extrabold" style={{ color: "#B54708" }}>{formatCurrency(dueTodayTotal, currency)}</div>
        </div>
        <div style={kpiCard}>
          <div className="text-[11.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>High-Risk Accounts</div>
          <div className="mt-[5px] text-[20px] font-extrabold" style={{ color: "#B42318" }}>{ageing?.atRisk.count ?? 0}</div>
        </div>
        <div style={kpiCard}>
          <div className="text-[11.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Recovery Rate</div>
          <div className="mt-[5px] text-[20px] font-extrabold" style={{ color: "var(--app-primary)" }}>{recovery ? `${Math.round(recovery.recoveryRate)}%` : "—"}</div>
        </div>
      </div>

      <div className="grid gap-[15px] items-start" style={{ gridTemplateColumns: "minmax(0,1fr) 330px" }}>
        <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", minWidth: 0 }}>
          <div className="flex flex-wrap items-center gap-2.5 p-[14px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
            <h3 className="m-0 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Today&apos;s collection queue</h3>
            <span className="text-[11px]" style={{ color: "var(--app-text-disabled)" }}>Largest outstanding balances, most urgent first</span>
          </div>
          <div>
            {priorityQueue.map((c, i) => {
              const p = priorityFor(c.daysOutstanding);
              return (
                <div key={c.customerId} className="flex flex-wrap items-center gap-3 p-[13px_17px]" style={{ borderTop: i === 0 ? undefined : "1px solid var(--app-surface-2)" }}>
                  <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[8px] text-[11.5px] font-extrabold" style={{ background: "var(--app-surface-2)", color: "var(--app-text-muted)" }}>{i + 1}</span>
                  <span className="min-w-[170px] flex-1">
                    <span className="block cursor-pointer text-[12.5px] font-bold" style={{ color: "var(--app-text)" }} onClick={() => router.push(`/credit/customer?id=${c.customerId}`)}>{c.name}</span>
                    <span className="mt-0.5 block text-[11px]" style={{ color: "var(--app-text-disabled)" }}>{c.daysOutstanding} days outstanding</span>
                  </span>
                  <span className="whitespace-nowrap rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: p.bg, color: p.fg }}>{p.label}</span>
                  <span className="whitespace-nowrap text-[13px] font-extrabold" style={{ color: "#B42318" }}>{formatCurrency(c.balance, currency)}</span>
                  <span className="flex gap-[7px]">
                    <button type="button" onClick={() => remindMutation.mutate([c.customerId])} disabled={c.optedOutOfReminders} style={outlineBtn}>Remind</button>
                    <button type="button" onClick={() => setPayingDebtor(c)} style={primaryBtn}>Record Payment</button>
                  </span>
                </div>
              );
            })}
            {!isPending && priorityQueue.length === 0 && (
              <div className="p-[26px_17px] text-center text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Everyone&apos;s paid up.</div>
            )}
          </div>
        </div>

        <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="mb-3 flex items-baseline gap-2.5">
            <h3 className="m-0 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Concentration risk</h3>
            <span className="ml-auto text-[15px] font-extrabold" style={{ color: "#B54708" }}>{concentration.pct}%</span>
          </div>
          <div className="mb-3 text-[11.5px] leading-[1.55]" style={{ color: "var(--app-text-muted)" }}>Share of all outstanding credit held by your three largest accounts.</div>
          <div className="flex flex-col gap-[11px]">
            {concentration.rows.map((r) => (
              <div key={r.name}>
                <div className="mb-[5px] flex justify-between gap-2">
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{r.name}</span>
                  <span className="text-[11.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(r.amount, currency)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-[6px]" style={{ background: "var(--app-surface-2)" }}>
                  <div className="h-full rounded-[6px]" style={{ width: `${r.share}%`, background: "#B54708" }} />
                </div>
                <div className="mt-1 text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>{r.share}% of total outstanding</div>
              </div>
            ))}
            {concentration.rows.length === 0 && <div className="text-[12px]" style={{ color: "var(--app-text-disabled)" }}>No outstanding balances yet.</div>}
          </div>
          <div className="mt-[13px] rounded-[11px] p-[11px_13px] text-[11.5px] leading-[1.55]" style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", color: "#93370D" }}>
            Concentration is an observation, not an instruction — Noxtill takes no action on it.
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-[10px]">
        <span className="text-[13px] font-bold" style={{ color: "var(--app-text-muted)" }}>{debtors.length} customers with a balance</span>
        <span className="flex items-center gap-1.5 rounded-full px-[10px] py-1 text-[11px] font-bold" style={{ color: "#B54708", background: "#FEF6E7" }}>
          Noxtill records credit — it never lends
        </span>
        <span className="ml-auto flex gap-2">
          <button type="button" onClick={() => downloadCsv(filtered)} style={{ ...outlineBtn, padding: "9px 14px", minHeight: 42 }}>Export</button>
        </span>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        <div className="rounded-[14px] p-[17px]" style={{ background: "var(--app-surface)", border: "1.5px solid #FDD9D6" }}>
          <div className="mb-[9px] text-[12px] font-bold" style={{ color: "#B42318" }}>Total Receivable</div>
          <div className="text-[27px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.8px" }}>{formatCurrency(totalReceivable, currency)}</div>
          <div className="mt-1 text-[11px]" style={{ color: "var(--app-text-disabled)" }}>Owed to you across {debtors.length} customers</div>
        </div>
        <div className="rounded-[14px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="mb-[9px] text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Recovered This Month</div>
          <div className="text-[22px] font-extrabold" style={{ color: "var(--app-primary)", letterSpacing: "-.5px" }}>{recovery ? formatCurrency(recovery.recovered, currency) : "—"}</div>
          <div className="mt-1 text-[11px]" style={{ color: "var(--app-text-disabled)" }}>Payments received, trailing 30 days</div>
        </div>
        <div className="rounded-[14px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="mb-[9px] text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Overdue 30+ Days</div>
          <div className="text-[22px] font-extrabold" style={{ color: "#B54708", letterSpacing: "-.5px" }}>{formatCurrency(overdue30.total, currency)}</div>
          <div className="mt-1 text-[11px]" style={{ color: "var(--app-text-disabled)" }}>{overdue30.count} customers past 30 days</div>
        </div>
        <div className="rounded-[14px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="mb-[9px] text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Average Days Outstanding</div>
          <div className="text-[22px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.5px" }}>{avgDays}</div>
          <div className="mt-1 text-[11px]" style={{ color: "var(--app-text-disabled)" }}>Across all open balances</div>
        </div>
      </div>

      <div className="grid gap-[15px] items-start" style={{ gridTemplateColumns: "minmax(0,1fr) 330px" }}>
        <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", minWidth: 0 }}>
          <h3 className="m-0 mb-1.5 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Receivable trend</h3>
          <ReceivableTrendChart points={history} />
        </div>
        <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-3 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Ageing breakdown</h3>
          <div className="flex flex-col gap-[11px]">
            {(ageing?.buckets ?? []).map((b) => {
              const pct = totalReceivable > 0 ? Math.round((b.total / totalReceivable) * 100) : 0;
              return (
                <div key={b.key}>
                  <div className="mb-[5px] flex justify-between">
                    <span className="text-[12.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{BUCKET_LABEL[b.key]}</span>
                    <span className="text-[11.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(b.total, currency)}</span>
                  </div>
                  <div className="h-[9px] overflow-hidden rounded-[6px]" style={{ background: "var(--app-surface-2)" }}>
                    <div className="h-full rounded-[6px]" style={{ width: `${pct}%`, background: BUCKET_COLOR[b.key] }} />
                  </div>
                  <div className="mt-1 text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>{b.count} customers · {pct}%</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap items-center gap-2 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <select value={ageFilter} onChange={(e) => setAgeFilter(e.target.value)} aria-label="Ageing bucket" style={selectStyle}>
            {["All ageing", "Current", "1–30 days", "31–60 days", "60+ days"].map((o) => <option key={o}>{o}</option>)}
          </select>
          <span className="flex items-center gap-1.5">
            <input type="number" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} placeholder="Min" aria-label="Minimum amount" className="w-[88px] rounded-[10px] p-[9px] text-[12.5px]" style={{ border: "1px solid var(--app-border)" }} />
            <span style={{ color: "var(--app-text-disabled)" }}>–</span>
            <input type="number" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} placeholder="Max" aria-label="Maximum amount" className="w-[88px] rounded-[10px] p-[9px] text-[12.5px]" style={{ border: "1px solid var(--app-border)" }} />
          </span>
          <select value={activityFilter} onChange={(e) => setActivityFilter(e.target.value)} aria-label="Last activity" style={selectStyle}>
            {["Any activity", "Last 7 days", "Last 30 days", "Over 30 days ago"].map((o) => <option key={o}>{o}</option>)}
          </select>
          <select value={optOutFilter} onChange={(e) => setOptOutFilter(e.target.value)} aria-label="Opted out" style={selectStyle}>
            {["All customers", "Opted out only", "Reminders allowed"].map((o) => <option key={o}>{o}</option>)}
          </select>
          <button type="button" onClick={clearFilters} style={outlineBtn}>Clear</button>
        </div>

        {!isPending && filtered.length === 0 && (
          <div className="p-[52px_18px] text-center">
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No outstanding credit — nice</div>
            <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Nothing matches these filters.</div>
            <button type="button" onClick={clearFilters} className="mt-[15px]" style={{ ...outlineBtn, padding: "12px 20px", minHeight: 46 }}>Clear filters</button>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 1000 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Customer</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Phone</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Balance</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Last Activity</th>
                  <th className="p-[10px] text-center text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Days Outstanding</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Reminders</th>
                  <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const p = priorityFor(c.daysOutstanding);
                  return (
                    <tr key={c.customerId} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                      <td className="p-[11px]">
                        <button type="button" onClick={() => router.push(`/credit/customer?id=${c.customerId}`)} className="block text-start">
                          <span className="block text-[12.5px] font-bold" style={{ color: "var(--app-primary)" }}>{c.name}</span>
                          <span className="mt-0.5 block text-[11px]" style={{ color: "var(--app-text-disabled)" }}>{p.label}</span>
                        </button>
                      </td>
                      <td className="whitespace-nowrap p-[11px] text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{c.phone}</td>
                      <td className="p-[11px] text-end text-[13.5px] font-extrabold" style={{ color: "#B42318" }}>{formatCurrency(c.balance, currency)}</td>
                      <td className="whitespace-nowrap p-[11px] text-[12px]" style={{ color: "var(--app-text-disabled)" }}>{c.daysOutstanding}d ago</td>
                      <td className="p-[11px] text-center"><span className="whitespace-nowrap rounded-full px-[9px] py-[3px] text-[11px] font-extrabold" style={{ background: p.bg, color: p.fg }}>{c.daysOutstanding} days</span></td>
                      <td className="p-[11px]">
                        {c.optedOutOfReminders ? (
                          <span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: "var(--app-surface-2)", color: "var(--app-text-muted)" }}>Opted out</span>
                        ) : (
                          <span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: "#E8F7EE", color: "#0E8442" }}>Allowed</span>
                        )}
                      </td>
                      <td className="p-[11px_17px] text-end">
                        <span className="inline-flex flex-wrap justify-end gap-[7px]">
                          <button type="button" onClick={() => remindMutation.mutate([c.customerId])} disabled={c.optedOutOfReminders} style={outlineBtn}>Remind</button>
                          <button type="button" onClick={() => setStatementDebtor(c)} style={outlineBtn}>Statement</button>
                          <button type="button" onClick={() => setPayingDebtor(c)} style={primaryBtn}>Record Payment</button>
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
      <StatementDialog debtor={statementDebtor} currency={currency} onClose={() => setStatementDebtor(null)} />
    </main>
  );
}

function ReceivableTrendChart({ points }: { points: { date: string; balance: number }[] }) {
  if (points.length < 2) {
    return <div className="flex h-[168px] items-center justify-center text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Not enough history yet.</div>;
  }
  const width = 620;
  const height = 168;
  const max = Math.max(...points.map((p) => p.balance), 1);
  const coords = points.map((p, i) => ({ x: (i / (points.length - 1)) * (width - 44) + 44, y: height - 20 - (p.balance / max) * (height - 40) }));
  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${coords[coords.length - 1].x},${height - 20} L${coords[0].x},${height - 20} Z`;
  const labelStep = Math.max(1, Math.floor(points.length / 6));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" style={{ height }}>
      {[0, 1, 2, 3].map((i) => {
        const y = 10 + (i * (height - 40)) / 3;
        return <line key={i} x1={44} y1={y} x2={width - 12} y2={y} stroke="var(--app-surface-2)" strokeDasharray="4 4" />;
      })}
      <path d={areaPath} fill="#B42318" opacity={0.08} />
      <path d={linePath} fill="none" stroke="#B42318" strokeWidth={2.4} strokeLinejoin="round" />
      {coords.map((c, i) => (i % labelStep === 0 || i === coords.length - 1 ? <circle key={i} cx={c.x} cy={c.y} r={3.4} fill="#fff" stroke="#B42318" strokeWidth={1.8} /> : null))}
      {points.map((p, i) =>
        i % labelStep === 0 || i === points.length - 1 ? (
          <text key={i} x={coords[i].x} y={height - 4} textAnchor="middle" fontSize={10.5} fill="var(--app-text-disabled)" fontWeight={600}>
            {new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </text>
        ) : null,
      )}
    </svg>
  );
}
