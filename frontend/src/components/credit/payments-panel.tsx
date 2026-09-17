"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCreditPayments, fetchDebtors, type CreditPaymentRow, type LiveDebtor } from "@/lib/credit-api";
import { RecordPaymentDialog } from "./record-payment-dialog";
import { PosModalShell } from "@/components/pos/pos-modal-shell";
import { formatCurrency, formatDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useCreditSearchStore } from "@/store/credit-search-store";

const METHOD_LABEL: Record<string, string> = { cash: "Cash", card: "Card", online: "Online" };
const selectStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 10, padding: "9px 11px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 42 };
const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };
const primaryBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };

function inDateRange(iso: string, key: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  if (key === "Last 30 days") return now.getTime() - d.getTime() <= 30 * 24 * 60 * 60 * 1000;
  if (key === "This year") return d.getFullYear() === now.getFullYear();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function downloadCsv(rows: CreditPaymentRow[]) {
  const header = "Payment,Customer,Phone,Date,Amount,Method,Note,Balance After\n";
  const body = rows.map((p) => `"${p.id.slice(0, 8)}","${p.customerName}","${p.customerPhone}","${p.createdAt}",${p.amount},"${p.method ?? ""}","${p.note ?? ""}",${p.balanceAfter}`).join("\n");
  const blob = new Blob([header + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `credit-payments-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function PaymentsPanel() {
  const session = useSession();
  const currency = session.business.currency;
  const query = useCreditSearchStore((s) => s.query);
  const [dateFilter, setDateFilter] = useState("This month");
  const [methodFilter, setMethodFilter] = useState("All methods");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [payingDebtor, setPayingDebtor] = useState<LiveDebtor | null>(null);

  const { data: payments = [], isPending } = useQuery({ queryKey: ["credit-payments"], queryFn: fetchCreditPayments });

  const filtered = useMemo(() => {
    return payments.filter((p) => {
      if (query && !p.customerName.toLowerCase().includes(query.toLowerCase()) && !p.customerPhone.includes(query)) return false;
      if (!inDateRange(p.createdAt, dateFilter)) return false;
      if (methodFilter !== "All methods" && METHOD_LABEL[p.method ?? ""] !== methodFilter) return false;
      return true;
    });
  }, [payments, query, dateFilter, methodFilter]);

  const kpis = useMemo(() => {
    const today = new Date().toDateString();
    const todays = payments.filter((p) => new Date(p.createdAt).toDateString() === today);
    const collected = filtered.reduce((s, p) => s + p.amount, 0);
    return {
      todayCount: todays.length,
      todayTotal: todays.reduce((s, p) => s + p.amount, 0),
      collected,
      average: filtered.length ? collected / filtered.length : 0,
    };
  }, [payments, filtered]);

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[10px]">
        <span className="text-[13px] font-bold" style={{ color: "var(--app-text-muted)" }}>Payments recorded against credit balances</span>
        <div className="ml-auto flex flex-wrap gap-[9px]">
          <button type="button" onClick={() => downloadCsv(filtered)} style={outlineBtn}>Export</button>
          <button type="button" onClick={() => setPickerOpen(true)} style={primaryBtn}>Record Payment</button>
        </div>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Payments Today</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{kpis.todayCount}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1.5px solid #BFE7CF" }}>
          <div className="text-[12px] font-bold" style={{ color: "#0E8442" }}>Collected Today</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(kpis.todayTotal, currency)}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Collected (filtered)</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(kpis.collected, currency)}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Average Payment</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(kpis.average, currency)}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap gap-2 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} aria-label="Date" style={selectStyle}>
            {["This month", "Last 30 days", "This year"].map((o) => <option key={o}>{o}</option>)}
          </select>
          <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)} aria-label="Method" style={selectStyle}>
            {["All methods", "Cash", "Card", "Online"].map((o) => <option key={o}>{o}</option>)}
          </select>
        </div>

        {!isPending && filtered.length === 0 && (
          <div className="p-[52px_18px] text-center text-[13px]" style={{ color: "var(--app-text-disabled)" }}>No payments match these filters.</div>
        )}

        {filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 920 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Payment</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Customer</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Date</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Amount</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Method</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Note</th>
                  <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Balance After</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                    <td className="whitespace-nowrap p-[11px_17px] text-[12.5px] font-extrabold" style={{ color: "var(--app-primary)" }}>PY-{p.id.slice(0, 6).toUpperCase()}</td>
                    <td className="p-[11px] text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{p.customerName}</td>
                    <td className="whitespace-nowrap p-[11px] text-[12px]" style={{ color: "var(--app-text-disabled)" }}>{formatDate(p.createdAt)}</td>
                    <td className="p-[11px] text-end text-[13px] font-extrabold" style={{ color: "var(--app-primary)" }}>{formatCurrency(p.amount, currency)}</td>
                    <td className="p-[11px] text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{p.method ? METHOD_LABEL[p.method] : "—"}</td>
                    <td className="p-[11px] text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>{p.note ?? "—"}</td>
                    <td className="p-[11px_17px] text-end text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{formatCurrency(p.balanceAfter, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="p-[11px_17px] text-[11.5px]" style={{ borderTop: "1px solid var(--app-surface-2)", color: "var(--app-text-disabled)" }}>
          Every payment here is a real, cleared entry — Noxtill only records a payment once it has actually happened.
        </div>
      </div>

      <DebtorPickerDialog open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={(d) => { setPickerOpen(false); setPayingDebtor(d); }} />
      <RecordPaymentDialog debtor={payingDebtor} currency={currency} onClose={() => setPayingDebtor(null)} />
    </main>
  );
}

function DebtorPickerDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (d: LiveDebtor) => void }) {
  const [search, setSearch] = useState("");
  const { data: debtors = [] } = useQuery({ queryKey: ["debtors", "overdue"], queryFn: () => fetchDebtors("overdue"), enabled: open });
  const filtered = debtors.filter((d) => d.name.toLowerCase().includes(search.toLowerCase()) || d.phone.includes(search));

  return (
    <PosModalShell open={open} onClose={onClose} title="Record payment — choose a customer">
      <div className="flex flex-col gap-2.5 p-[17px]">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer or phone..."
          aria-label="Search customer"
          className="w-full rounded-[10px] p-3 text-[13px]"
          style={{ border: "1px solid var(--app-border)" }}
        />
        <div className="flex max-h-[320px] flex-col gap-1.5 overflow-y-auto">
          {filtered.map((d) => (
            <button key={d.customerId} type="button" onClick={() => onPick(d)} className="flex items-center justify-between rounded-[10px] p-3 text-start" style={{ border: "1px solid var(--app-border)" }}>
              <span>
                <span className="block text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{d.name}</span>
                <span className="block text-[11px]" style={{ color: "var(--app-text-disabled)" }}>{d.phone}</span>
              </span>
              <span className="text-[13px] font-extrabold" style={{ color: "#B42318" }}>{d.balance}</span>
            </button>
          ))}
          {filtered.length === 0 && <div className="p-4 text-center text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>No customers with a balance.</div>}
        </div>
      </div>
    </PosModalShell>
  );
}
