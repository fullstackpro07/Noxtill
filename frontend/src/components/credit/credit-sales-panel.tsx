"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCreditSales, type CreditSaleRow } from "@/lib/credit-api";
import { formatCurrency, formatDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useCreditSearchStore } from "@/store/credit-search-store";

const selectStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 10, padding: "9px 11px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 42 };
const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 10, padding: "9px 13px", fontSize: 12, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 42 };

function inDateRange(iso: string, key: string): boolean {
  const d = new Date(iso).getTime();
  const now = Date.now();
  if (key === "Last 30 days") return now - d <= 30 * 24 * 60 * 60 * 1000;
  if (key === "This year") return new Date(iso).getFullYear() === new Date().getFullYear();
  return now - d <= 90 * 24 * 60 * 60 * 1000;
}

function downloadCsv(rows: CreditSaleRow[]) {
  const header = "Sale,Customer,Phone,Date,Amount,Paid,Remaining,Status,Source,Staff\n";
  const body = rows
    .map((s) => `"${s.id.slice(0, 8)}","${s.customerName}","${s.customerPhone}","${s.createdAt}",${s.amount},${s.paid},${s.remaining},"${s.remaining <= 0 ? "Settled" : "Open"}","${s.orderNo ? `Order #${s.orderNo}` : "Fast Sale"}","${s.staffName ?? ""}"`)
    .join("\n");
  const blob = new Blob([header + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `credit-sales-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function CreditSalesPanel() {
  const session = useSession();
  const currency = session.business.currency;
  const query = useCreditSearchStore((s) => s.query);
  const [dateFilter, setDateFilter] = useState("Last 90 days");
  const [customerFilter, setCustomerFilter] = useState("All customers");
  const [statusFilter, setStatusFilter] = useState("All statuses");

  const { data: sales = [], isPending } = useQuery({ queryKey: ["credit-sales"], queryFn: fetchCreditSales });

  const customerNames = useMemo(() => Array.from(new Set(sales.map((s) => s.customerName))).sort(), [sales]);

  const filtered = useMemo(() => {
    return sales.filter((s) => {
      if (query && !s.customerName.toLowerCase().includes(query.toLowerCase()) && !s.customerPhone.includes(query)) return false;
      if (!inDateRange(s.createdAt, dateFilter)) return false;
      if (customerFilter !== "All customers" && s.customerName !== customerFilter) return false;
      const status = s.remaining <= 0 ? "Settled" : "Open";
      if (statusFilter !== "All statuses" && statusFilter !== status) return false;
      return true;
    });
  }, [sales, query, dateFilter, customerFilter, statusFilter]);

  const kpis = useMemo(() => {
    const value = sales.reduce((s, r) => s + r.amount, 0);
    const open = sales.filter((r) => r.remaining > 0).length;
    return { count: sales.length, value, avg: sales.length ? value / sales.length : 0, open };
  }, [sales]);

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Credit Sales</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{kpis.count}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Credit Value</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(kpis.value, currency)}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Average Credit Sale</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(kpis.avg, currency)}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Open Credit Sales</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "#B54708" }}>{kpis.open}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap gap-2 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} aria-label="Date range" style={selectStyle}>
            {["Last 90 days", "Last 30 days", "This year"].map((o) => <option key={o}>{o}</option>)}
          </select>
          <select value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} aria-label="Customer" style={selectStyle}>
            <option>All customers</option>
            {customerNames.map((n) => <option key={n}>{n}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status" style={selectStyle}>
            {["All statuses", "Open", "Settled"].map((o) => <option key={o}>{o}</option>)}
          </select>
          <button type="button" onClick={() => downloadCsv(filtered)} className="ml-auto" style={outlineBtn}>Export</button>
        </div>

        {!isPending && filtered.length === 0 && (
          <div className="p-[52px_18px] text-center text-[13px]" style={{ color: "var(--app-text-disabled)" }}>No credit sales match these filters.</div>
        )}

        {filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 920 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Sale</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Customer</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Date</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Amount</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Paid</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Remaining</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Status</th>
                  <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Source</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const settled = s.remaining <= 0;
                  return (
                    <tr key={s.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                      <td className="whitespace-nowrap p-[11px_17px] text-[12.5px] font-extrabold" style={{ color: "var(--app-primary)" }}>CS-{s.id.slice(0, 6).toUpperCase()}</td>
                      <td className="p-[11px] text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{s.customerName}</td>
                      <td className="whitespace-nowrap p-[11px] text-[12px]" style={{ color: "var(--app-text-disabled)" }}>{formatDate(s.createdAt)}</td>
                      <td className="p-[11px] text-end text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{formatCurrency(s.amount, currency)}</td>
                      <td className="p-[11px] text-end text-[12.5px]" style={{ color: "var(--app-primary)" }}>{formatCurrency(s.paid, currency)}</td>
                      <td className="p-[11px] text-end text-[13px] font-extrabold" style={{ color: settled ? "var(--app-text-disabled)" : "#B42318" }}>{formatCurrency(s.remaining, currency)}</td>
                      <td className="p-[11px]"><span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: settled ? "#E8F7EE" : "#FEF6E7", color: settled ? "#0E8442" : "#B54708" }}>{settled ? "Settled" : "Open"}</span></td>
                      <td className="whitespace-nowrap p-[11px_17px] text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>{s.orderNo ? `Order #${s.orderNo}` : "Fast Sale"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="p-[11px_17px] text-[11.5px]" style={{ borderTop: "1px solid var(--app-surface-2)", color: "var(--app-text-disabled)" }}>
          Credit references the original sale — it does not duplicate it. Paid/Remaining are allocated oldest-first across each customer&apos;s own payments, since Noxtill tracks one running balance per customer rather than per-sale settlement.
        </div>
      </div>
    </main>
  );
}
