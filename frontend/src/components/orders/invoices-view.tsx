"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/session";
import { fetchStaffList } from "@/lib/staff-api";
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { generateInvoice } from "@/lib/orders-api";
import { fetchInvoiceSummary, fetchInvoices, recordInvoicePayment, remindAllInvoices, type InvoiceFilters, type InvoiceStatus, type LiveInvoiceRow } from "@/lib/invoices-api";
import { PosModalShell } from "@/components/pos/pos-modal-shell";

const selectStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 10, padding: "9px 11px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 42 };
const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };
const smallOutline: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 9, padding: "8px 11px", fontSize: 11.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 40 };
const smallPrimary: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 9, padding: "8px 13px", fontSize: 11.5, fontWeight: 800, color: "#fff", minHeight: 40 };
const cancelBtn: React.CSSProperties = { background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)" };
const primaryBtn: React.CSSProperties = { background: "var(--app-primary)", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff" };

const STATUS_BADGE: Record<InvoiceStatus, { bg: string; fg: string }> = {
  paid: { bg: "var(--app-success-bg)", fg: "var(--app-success-text)" },
  unpaid: { bg: "var(--app-warning-bg)", fg: "var(--app-warning-text)" },
  overdue: { bg: "#FEF3F2", fg: "var(--app-danger-strong)" },
};

type DateRange = "month" | "lastMonth" | "quarter";

function rangeFor(preset: DateRange): { from: string; to?: string } {
  const now = new Date();
  if (preset === "lastMonth") {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: from.toISOString(), to: to.toISOString() };
  }
  if (preset === "quarter") {
    const from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    return { from: from.toISOString() };
  }
  return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString() };
}

function PaidUnpaidChart({ data }: { data: { date: string; paidAmount: number; unpaidAmount: number }[] }) {
  const chart = useMemo(() => {
    const W = 620, H = 152, T = 10, B = 26, PH = H - T - B, gap = data.length > 0 ? (W - 20) / data.length : W;
    const max = Math.max(1, ...data.map((d) => d.paidAmount + d.unpaidAmount));
    return data.map((d, i) => {
      const totalH = ((d.paidAmount + d.unpaidAmount) / max) * PH;
      const paidH = (d.paidAmount / max) * PH;
      const unpaidH = totalH - paidH;
      const x = 10 + i * gap;
      const w = Math.min(34, gap * 0.6);
      return { x, w, py: T + PH - totalH, ph: unpaidH, uy: T + PH - unpaidH, uh: unpaidH, sy: T + PH - totalH, sh: paidH, cx: x + w / 2, m: new Date(d.date).toLocaleDateString(undefined, { day: "numeric", month: "short" }) };
    });
  }, [data]);

  return (
    <svg viewBox="0 0 620 152" className="block w-full" style={{ height: 152 }}>
      {chart.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={b.py} width={b.w} height={Math.max(0, b.uh)} rx={4} fill="#FDBA74" />
          <rect x={b.x} y={b.py + b.uh} width={b.w} height={Math.max(0, b.sh)} rx={4} fill="var(--app-primary)" />
          <text x={b.cx} y={148} textAnchor="middle" fontSize={10.5} fill="#667085" fontWeight={600}>{b.m}</text>
        </g>
      ))}
    </svg>
  );
}

export function InvoicesView() {
  const session = useSession();
  const isOwnerOrManager = session.user.role !== "staff";
  const queryClient = useQueryClient();
  const [dateRange, setDateRange] = useState<DateRange>("month");
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "all">("all");
  const [staffFilter, setStaffFilter] = useState("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [paying, setPaying] = useState<LiveInvoiceRow | null>(null);
  const [previewing, setPreviewing] = useState<LiveInvoiceRow | null>(null);
  const [confirmRemind, setConfirmRemind] = useState(false);

  const range = rangeFor(dateRange);
  const filters: InvoiceFilters = { from: range.from, to: range.to, status: statusFilter === "all" ? undefined : statusFilter, staffUserId: staffFilter === "all" ? undefined : staffFilter };

  const { data: staff } = useQuery({ queryKey: ["staff-roster"], queryFn: fetchStaffList, staleTime: 5 * 60_000 });
  const { data: rows } = useQuery({ queryKey: ["invoices", filters], queryFn: () => fetchInvoices(filters) });
  const { data: summary } = useQuery({ queryKey: ["invoices-summary", range.from, range.to], queryFn: () => fetchInvoiceSummary({ from: range.from, to: range.to }) });

  const filtered = useMemo(() => (rows ?? []).filter((r) => !overdueOnly || r.status === "overdue"), [rows, overdueOnly]);
  const issuedCount = summary ? summary.counts.paid + summary.counts.unpaid + summary.counts.overdue : 0;
  const totalValue = summary ? summary.totals.paid + summary.totals.unpaid + summary.totals.overdue : 0;

  const remindMutation = useMutation({
    mutationFn: remindAllInvoices,
    onSuccess: (result) => {
      toast.success(`Reminders sent to ${result.sent}, ${result.skipped} skipped.`);
      setConfirmRemind(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send reminders — please try again."),
  });

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Invoices</h2>
        <div className="ms-auto flex flex-wrap items-center gap-2.5">
          <select value={dateRange} onChange={(e) => setDateRange(e.target.value as DateRange)} aria-label="Date range" style={{ ...selectStyle, minHeight: 44 }}>
            <option value="month">This month</option>
            <option value="lastMonth">Last month</option>
            <option value="quarter">This quarter</option>
          </select>
          <button type="button" onClick={() => setConfirmRemind(true)} style={outlineBtn}>Bulk Send Reminders</button>
        </div>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Issued This Month</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{issuedCount}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Paid</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-primary)" }}>{summary?.counts.paid ?? "—"}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Unpaid</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-warning-text)" }}>{summary?.counts.unpaid ?? "—"}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Overdue</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-danger-strong)" }}>{summary?.counts.overdue ?? "—"}</div>
        </div>
        {isOwnerOrManager && (
          <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Total Value</div>
            <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(totalValue, session.business.currency)}</div>
          </div>
        )}
      </div>

      <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="mb-1.5 flex flex-wrap items-center gap-3.5">
          <h3 className="m-0 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Paid vs unpaid over time</h3>
          <span className="flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: "var(--app-text-faint)" }}><span className="h-2 w-2 rounded-[2px]" style={{ background: "var(--app-primary)" }} />Paid</span>
          <span className="flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: "var(--app-text-faint)" }}><span className="h-2 w-2 rounded-[2px]" style={{ background: "#F97316" }} />Unpaid</span>
        </div>
        {summary && summary.trend.length > 0 ? <PaidUnpaidChart data={summary.trend} /> : <p className="py-10 text-center text-[13px]" style={{ color: "var(--app-text-faintest)" }}>No invoices in this range yet.</p>}
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap items-center gap-2.5 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as InvoiceStatus | "all")} aria-label="Status" style={selectStyle}>
            <option value="all">All statuses</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
            <option value="overdue">Overdue</option>
          </select>
          {staff && staff.length > 0 && (
            <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} aria-label="Staff" style={selectStyle}>
              <option value="all">All staff</option>
              {staff.map((s) => (
                <option key={s.userId} value={s.userId}>{s.name}</option>
              ))}
            </select>
          )}
          <span className="ms-1.5 flex items-center gap-2.5">
            <span className="text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>Overdue only</span>
            <button type="button" role="switch" aria-checked={overdueOnly} onClick={() => setOverdueOnly((v) => !v)} className="relative h-[22px] w-10 rounded-full" style={{ background: overdueOnly ? "var(--app-primary)" : "var(--app-border-strong)" }}>
              <span className="absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white transition-all" style={{ left: overdueOnly ? 20 : 2 }} />
            </button>
          </span>
        </div>

        {rows && filtered.length === 0 ? (
          <div className="p-[52px_18px] text-center">
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No invoices in this period</div>
            <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Change the date range, or issue an invoice from an order.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 960 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Invoice #</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Customer</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Issue Date</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Amount</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Paid</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Balance</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Status</th>
                  <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const badge = STATUS_BADGE[row.status];
                  return (
                    <tr key={row.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                      <td className="p-[12px_17px]"><button type="button" onClick={() => setPreviewing(row)} className="text-[12.5px] font-extrabold" style={{ color: "var(--app-success-text)" }}>#{row.orderNo}</button></td>
                      <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{row.customerName ?? "Walk-in"}</td>
                      <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{formatDate(row.createdAt)}</td>
                      <td className="p-[12px] text-end text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(row.total, session.business.currency)}</td>
                      <td className="p-[12px] text-end text-[12.5px] font-bold" style={{ color: "var(--app-primary)" }}>{formatCurrency(row.amountPaid, session.business.currency)}</td>
                      <td className="p-[12px] text-end text-[12.5px] font-bold" style={{ color: "var(--app-danger-strong)" }}>{formatCurrency(row.amountDue, session.business.currency)}</td>
                      <td className="p-[12px]"><span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: badge.bg, color: badge.fg }}>{row.status}</span></td>
                      <td className="p-[12px_17px] text-end">
                        <span className="inline-flex flex-wrap justify-end gap-1.5">
                          <InvoiceRowActions row={row} />
                          {row.status !== "paid" && <button type="button" onClick={() => setPaying(row)} style={smallPrimary}>Record Payment</button>}
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

      <RecordPaymentModal row={paying} onClose={() => setPaying(null)} currency={session.business.currency} onSuccess={() => queryClient.invalidateQueries({ queryKey: ["invoices"] })} />
      <InvoicePreviewModal row={previewing} currency={session.business.currency} businessName={session.business.name} onClose={() => setPreviewing(null)} />

      <PosModalShell
        open={confirmRemind}
        onClose={() => setConfirmRemind(false)}
        title="Send Payment Reminders"
        footer={
          <>
            <button type="button" onClick={() => setConfirmRemind(false)} style={cancelBtn}>Cancel</button>
            <button type="button" onClick={() => remindMutation.mutate()} disabled={remindMutation.isPending} style={{ ...primaryBtn, opacity: remindMutation.isPending ? 0.6 : 1 }}>
              {remindMutation.isPending ? "Sending…" : "Send Reminders"}
            </button>
          </>
        }
      >
        <p className="m-0 p-[17px] text-[13px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
          A WhatsApp reminder is sent to every customer with a real unpaid or overdue invoice — opted-out customers are skipped automatically.
        </p>
      </PosModalShell>
    </main>
  );
}

function InvoiceRowActions({ row }: { row: LiveInvoiceRow }) {
  const downloadMutation = useMutation({
    mutationFn: () => generateInvoice(row.id, false),
    onSuccess: ({ url }) => window.open(url, "_blank", "noopener,noreferrer"),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't generate the invoice PDF — please try again."),
  });
  const sendMutation = useMutation({
    mutationFn: () => generateInvoice(row.id, true),
    onSuccess: () => toast.success(`Invoice sent to ${row.customerName ?? "the customer"}.`),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send the invoice — please try again."),
  });

  return (
    <>
      <button type="button" onClick={() => downloadMutation.mutate()} disabled={downloadMutation.isPending} style={smallOutline}>PDF</button>
      {row.customerId && <button type="button" onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending} style={smallOutline}>Send</button>}
    </>
  );
}

function RecordPaymentModal({ row, onClose, currency, onSuccess }: { row: LiveInvoiceRow | null; onClose: () => void; currency: string; onSuccess: () => void }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "card" | "online">("cash");

  const mutation = useMutation({
    mutationFn: () => recordInvoicePayment(row!.id, { amount: Number(amount), method }),
    onSuccess: () => {
      toast.success("Payment recorded.");
      onSuccess();
      setAmount("");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't record this payment — please try again."),
  });

  return (
    <PosModalShell
      open={row != null}
      onClose={onClose}
      title="Record Payment"
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={!amount || Number(amount) <= 0 || mutation.isPending} style={{ ...primaryBtn, opacity: !amount || Number(amount) <= 0 || mutation.isPending ? 0.6 : 1 }}>
            {mutation.isPending ? "Recording…" : "Record Payment"}
          </button>
        </>
      }
    >
      {row && (
        <div className="flex flex-col gap-3.5 p-[17px]">
          <div className="flex justify-between">
            <span className="text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>Balance on #{row.orderNo}</span>
            <span className="text-[14px] font-extrabold" style={{ color: "var(--app-danger-strong)" }}>{formatCurrency(row.amountDue, currency)}</span>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>AMOUNT</span>
            <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus className="w-full rounded-[11px] p-[12px] text-[17px] font-extrabold" style={{ border: "1px solid var(--app-border)" }} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>PAYMENT METHOD</span>
            <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className="w-full rounded-[11px] p-3 text-[13px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="online">Online</option>
            </select>
          </label>
        </div>
      )}
    </PosModalShell>
  );
}

function InvoicePreviewModal({ row, currency, businessName, onClose }: { row: LiveInvoiceRow | null; currency: string; businessName: string; onClose: () => void }) {
  const downloadMutation = useMutation({
    mutationFn: () => generateInvoice(row!.id, false),
    onSuccess: ({ url }) => window.open(url, "_blank", "noopener,noreferrer"),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't generate the invoice PDF — please try again."),
  });

  return (
    <PosModalShell
      open={row != null}
      onClose={onClose}
      title="Invoice"
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelBtn}>Close</button>
          <button type="button" onClick={() => downloadMutation.mutate()} disabled={downloadMutation.isPending} style={outlineBtn}>Download PDF</button>
        </>
      }
    >
      {row && (
        <div className="p-[17px]">
          <div className="rounded-[14px] p-[18px]" style={{ border: "1px solid var(--app-border)" }}>
            <div className="flex items-start gap-3">
              <div>
                <div className="text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>{businessName}</div>
              </div>
              <div className="ms-auto text-end">
                <div className="text-[13px] font-extrabold" style={{ color: "var(--app-success-text)" }}>#{row.orderNo}</div>
                <div className="mt-1 text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>Issued {formatDate(row.createdAt)}</div>
              </div>
            </div>
            <div className="my-3.5 border-t" style={{ borderColor: "var(--app-surface-2)" }} />
            <div className="text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>BILLED TO</div>
            <div className="mt-1 text-[13px] font-bold" style={{ color: "var(--app-text)" }}>{row.customerName ?? "Walk-in"}</div>
            <div className="my-3.5 border-t" style={{ borderColor: "var(--app-surface-2)" }} />
            <div className="flex justify-between py-1"><span className="text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>Amount</span><span className="text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>{formatCurrency(row.total, currency)}</span></div>
            <div className="flex justify-between py-1"><span className="text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>Balance</span><span className="text-[15px] font-extrabold" style={{ color: "var(--app-danger-strong)" }}>{formatCurrency(row.amountDue, currency)}</span></div>
          </div>
        </div>
      )}
    </PosModalShell>
  );
}
