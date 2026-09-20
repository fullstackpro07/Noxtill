"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Printer } from "lucide-react";
import { useSession } from "@/lib/session";
import { fetchStaffList } from "@/lib/staff-api";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { generateInvoice } from "@/lib/orders-api";
import type { LivePaymentMethod } from "@/lib/orders-api";
import { createReturn } from "@/lib/returns-api";
import { fetchSalesHistory, fetchSalesHistoryDetail, fetchSalesHistorySummary, type SalesHistoryFilters } from "@/lib/sales-history-api";
import { SlideDrawer } from "@/components/dashboard/slide-drawer";
import { PosModalShell } from "./pos-modal-shell";

const btnOutline: React.CSSProperties = { display: "flex", alignItems: "center", gap: 7, border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 14px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };
const selectStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 10, padding: "9px 11px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 42 };
const cancelStyle: React.CSSProperties = { background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)" };
const btnDanger: React.CSSProperties = { background: "var(--app-danger-strong)", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff" };

const PAYMENT_METHODS: LivePaymentMethod[] = ["cash", "card", "online", "credit"];
const ORDER_TYPES = ["counter", "online", "dine_in", "takeaway", "delivery"] as const;
const PAYMENT_LABEL: Record<string, string> = { cash: "Cash", card: "Card", online: "Online", credit: "Credit" };
const ORDER_TYPE_LABEL: Record<string, string> = { counter: "Counter", online: "Online", dine_in: "Dine-in", takeaway: "Takeaway", delivery: "Delivery" };
const STATUS_BADGE: Record<string, { bg: string; fg: string }> = {
  completed: { bg: "var(--app-success-bg)", fg: "var(--app-success-text)" },
  cancelled: { bg: "#FEF3F2", fg: "var(--app-danger-strong)" },
};

function StatCard({ label, value, valueColor }: { label: string; value: React.ReactNode; valueColor?: string }) {
  return (
    <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
      <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>{label}</div>
      <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: valueColor ?? "var(--app-text)" }}>{value}</div>
    </div>
  );
}

function DailyRevenueChart({ data, currency }: { data: { date: string; revenue: number }[]; currency: string }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const chart = useMemo(() => {
    const W = 860, L = 4, R = 4, T = 8, B = 26, PH = 196 - T - B, PW = W - L - R;
    const max = Math.max(1, ...data.map((d) => d.revenue));
    const barW = Math.min(34, (PW / data.length) * 0.55);
    const gap = data.length > 1 ? (PW - barW) / (data.length - 1) : 0;
    const bars = data.map((d, i) => {
      const h = (d.revenue / max) * PH;
      return { x: L + i * gap, y: T + (PH - h), w: barW, h, day: new Date(d.date).toLocaleDateString(undefined, { day: "numeric", month: "short" }) };
    });
    return { bars, W };
  }, [data]);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${chart.W} 196`} className="block w-full" style={{ height: 196 }} onMouseLeave={() => setHoverIdx(null)}>
        {chart.bars.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={b.w} height={Math.max(2, b.h)} rx={5} fill={hoverIdx === i ? "var(--app-primary)" : "#BFE7CF"} onMouseEnter={() => setHoverIdx(i)} />
        ))}
        {chart.bars.map((b, i) => (
          <text key={i} x={b.x + b.w / 2} y={190} textAnchor="middle" fontSize={10} fill="#667085" fontWeight={600}>{b.day}</text>
        ))}
      </svg>
      {hoverIdx != null && chart.bars[hoverIdx] && (
        <div className="pointer-events-none absolute right-[18px] top-[14px] rounded-[11px] p-[9px_12px] text-[11.5px]" style={{ background: "var(--app-sidebar-bg)", color: "#fff" }}>
          <div className="font-extrabold">{chart.bars[hoverIdx].day}</div>
          <div className="mt-[3px]" style={{ color: "#8FF0BB" }}>{formatCurrency(data[hoverIdx].revenue, currency)}</div>
        </div>
      )}
    </div>
  );
}

export function SalesHistoryView() {
  const session = useSession();
  const [filters, setFilters] = useState<SalesHistoryFilters>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: staff } = useQuery({ queryKey: ["staff-roster"], queryFn: () => fetchStaffList(), staleTime: 5 * 60 * 1000 });
  const { data: rows } = useQuery({ queryKey: ["sales-history", filters], queryFn: () => fetchSalesHistory(filters) });
  const { data: summary } = useQuery({ queryKey: ["sales-history-summary", filters.from, filters.to], queryFn: () => fetchSalesHistorySummary({ from: filters.from, to: filters.to }) });

  function setFilter<K extends keyof SalesHistoryFilters>(key: K, value: SalesHistoryFilters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  const salesCount = rows?.length ?? 0;
  const revenue = (rows ?? []).filter((r) => r.status === "completed").reduce((s, r) => s + r.total, 0);
  const avgTicket = salesCount > 0 ? revenue / salesCount : 0;
  const refunds = (rows ?? []).filter((r) => r.status === "cancelled").reduce((s, r) => s + r.total, 0);
  const net = revenue - refunds;

  function exportCsv() {
    if (!rows || rows.length === 0) return;
    const header = ["Sale #", "Date", "Customer", "Items", "Staff", "Payment", "Discount", "Total", "Profit", "Status"];
    const lines = rows.map((r) => [r.orderNo, r.createdAt, r.customerName ?? "", r.itemsCount, r.staffName ?? "", r.method ?? "", r.discount, r.total, r.profit, r.status]);
    const csv = [header, ...lines].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sales-history.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="m-0 text-[20px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.5px" }}>Sales History</h2>
          <p className="mt-[3px] text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>Every completed sale</p>
        </div>
        <div className="ms-auto flex flex-wrap items-center gap-[9px]">
          <input type="date" value={filters.from ?? ""} onChange={(e) => setFilter("from", e.target.value || undefined)} aria-label="From date" style={selectStyle} />
          <input type="date" value={filters.to ?? ""} onChange={(e) => setFilter("to", e.target.value || undefined)} aria-label="To date" style={selectStyle} />
          <button type="button" onClick={exportCsv} style={btnOutline}>
            <FileSpreadsheet className="h-[15px] w-[15px]" aria-hidden />
            Export CSV
          </button>
          <button type="button" onClick={() => window.print()} style={btnOutline}>
            <Printer className="h-[15px] w-[15px]" aria-hidden />
            Print
          </button>
        </div>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }}>
        <StatCard label="Sales Count" value={salesCount} />
        <StatCard label="Revenue" value={formatCurrency(revenue, session.business.currency)} />
        <StatCard label="Average Ticket" value={formatCurrency(avgTicket, session.business.currency)} />
        <StatCard label="Refunds" value={formatCurrency(refunds, session.business.currency)} valueColor="var(--app-danger-strong)" />
        <StatCard label="Net" value={formatCurrency(net, session.business.currency)} valueColor="var(--app-primary)" />
      </div>

      <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <h3 className="m-0 mb-2 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Daily revenue</h3>
        {summary && summary.length > 0 ? (
          <DailyRevenueChart data={summary} currency={session.business.currency} />
        ) : (
          <p className="py-10 text-center text-[13px]" style={{ color: "var(--app-text-faintest)" }}>No revenue recorded in this range yet.</p>
        )}
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap items-center gap-2 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          {staff && staff.length > 0 && (
            <select value={filters.staffUserId ?? "all"} onChange={(e) => setFilter("staffUserId", e.target.value === "all" ? undefined : e.target.value)} aria-label="Staff" style={selectStyle}>
              <option value="all">All staff</option>
              {staff.map((s) => (
                <option key={s.userId} value={s.userId}>{s.name}</option>
              ))}
            </select>
          )}
          <select value={filters.paymentMethod ?? "all"} onChange={(e) => setFilter("paymentMethod", e.target.value === "all" ? undefined : (e.target.value as LivePaymentMethod))} aria-label="Payment method" style={selectStyle}>
            <option value="all">All methods</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>{PAYMENT_LABEL[m]}</option>
            ))}
          </select>
          <select value={filters.orderType ?? "all"} onChange={(e) => setFilter("orderType", e.target.value === "all" ? undefined : e.target.value)} aria-label="Order type" style={selectStyle}>
            <option value="all">All types</option>
            {ORDER_TYPES.map((t) => (
              <option key={t} value={t}>{ORDER_TYPE_LABEL[t]}</option>
            ))}
          </select>
          <span className="flex items-center gap-1.5">
            <input type="number" min={0} value={filters.minAmount ?? ""} onChange={(e) => setFilter("minAmount", e.target.value ? Number(e.target.value) : undefined)} placeholder="Min" aria-label="Minimum amount" className="w-[86px]" style={selectStyle} />
            <span style={{ color: "var(--app-text-disabled)" }}>–</span>
            <input type="number" min={0} value={filters.maxAmount ?? ""} onChange={(e) => setFilter("maxAmount", e.target.value ? Number(e.target.value) : undefined)} placeholder="Max" aria-label="Maximum amount" className="w-[86px]" style={selectStyle} />
          </span>
        </div>

        {rows && rows.length === 0 ? (
          <div className="p-[52px_18px] text-center">
            <div className="text-[14px] font-bold" style={{ color: "var(--app-text-muted)" }}>No sales in this period</div>
            <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Try a wider date range or clear the filters.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 1080 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Sale #</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Date / Time</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Customer</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Items</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Staff</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Payment</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Discount</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Total</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Profit</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Status</th>
                  <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(rows ?? []).map((row) => {
                  const badge = STATUS_BADGE[row.status] ?? STATUS_BADGE.completed;
                  return (
                    <tr key={row.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                      <td className="whitespace-nowrap p-[12px_17px] text-[12.5px] font-extrabold" style={{ color: "var(--app-success-text)" }}>#{row.orderNo}</td>
                      <td className="whitespace-nowrap p-[12px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{formatDate(row.createdAt)} {formatTime(row.createdAt)}</td>
                      <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{row.customerName ?? "Walk-in"}</td>
                      <td className="p-[12px] text-end text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{row.itemsCount}</td>
                      <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{row.staffName ?? "—"}</td>
                      <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{row.method ? PAYMENT_LABEL[row.method] ?? row.method : "—"}</td>
                      <td className="p-[12px] text-end text-[12.5px]" style={{ color: "var(--app-danger-strong)" }}>{formatCurrency(row.discount, session.business.currency)}</td>
                      <td className="p-[12px] text-end text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(row.total, session.business.currency)}</td>
                      <td className="p-[12px] text-end text-[12.5px] font-bold" style={{ color: "var(--app-primary)" }}>{formatCurrency(row.profit, session.business.currency)}</td>
                      <td className="p-[12px]">
                        <span className="whitespace-nowrap rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: badge.bg, color: badge.fg }}>{row.status}</span>
                      </td>
                      <td className="p-[12px_17px] text-end">
                        <button
                          type="button"
                          onClick={() => setSelectedId(row.id)}
                          style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 9, padding: "8px 13px", fontSize: 12, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 40 }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SaleDetailDrawer id={selectedId} onClose={() => setSelectedId(null)} currency={session.business.currency} />
    </main>
  );
}

function SaleDetailDrawer({ id, onClose, currency }: { id: string | null; onClose: () => void; currency: string }) {
  const { data } = useQuery({ queryKey: ["sales-history-detail", id], queryFn: () => fetchSalesHistoryDetail(id as string), enabled: id != null });
  const [refundOpen, setRefundOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<"reprint" | "resend" | null>(null);
  const order = data?.order;
  const badge = order ? (STATUS_BADGE[order.status] ?? STATUS_BADGE.completed) : STATUS_BADGE.completed;

  async function handleReprint() {
    if (!id) return;
    setBusyAction("reprint");
    try {
      const { url } = await generateInvoice(id, false);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't generate the receipt — please try again.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleResend() {
    if (!id) return;
    setBusyAction("resend");
    try {
      await generateInvoice(id, true);
      toast.success("Receipt resent to the customer.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't resend the receipt — please try again.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <SlideDrawer open={id != null} onClose={onClose} title={order ? `Sale #${order.orderNo}` : "Sale detail"}>
      {order && (
        <div className="flex flex-col gap-[15px]">
          <div className="flex items-baseline gap-2.5 rounded-[13px] p-[14px]" style={{ background: "var(--app-success-bg)", border: "1px solid var(--app-success-border)" }}>
            <span className="text-[12px] font-bold" style={{ color: "var(--app-success-text)" }}>Total</span>
            <span className="ms-auto text-[25px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.8px" }}>{formatCurrency(order.total, currency)}</span>
            <span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: badge.bg, color: badge.fg }}>{order.status}</span>
          </div>

          <div>
            <div className="mb-1.5 text-[10.5px] font-extrabold uppercase" style={{ color: "var(--app-text-disabled)", letterSpacing: ".4px" }}>Customer</div>
            <div className="flex justify-between p-[6px_0]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}><span className="text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>Name</span><span className="text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{order.customer?.name ?? "Walk-in"}</span></div>
            <div className="flex justify-between p-[6px_0]"><span className="text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>Sold by</span><span className="text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{order.staffName ?? "—"}</span></div>
          </div>

          <div>
            <div className="mb-1.5 text-[10.5px] font-extrabold uppercase" style={{ color: "var(--app-text-disabled)", letterSpacing: ".4px" }}>Line items (cost snapshot)</div>
            <div className="overflow-x-auto">
              <table className="w-full" style={{ minWidth: 380 }}>
                <thead>
                  <tr>
                    <th className="pb-1.5 text-start text-[10.5px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Item</th>
                    <th className="pb-1.5 text-end text-[10.5px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Qty</th>
                    <th className="pb-1.5 text-end text-[10.5px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Price</th>
                    <th className="pb-1.5 text-end text-[10.5px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item, i) => (
                    <tr key={i} style={{ borderTop: "1px solid var(--app-surface-2)" }}>
                      <td className="p-[8px_0] text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{item.name}</td>
                      <td className="p-[8px_0] text-end text-[12px]" style={{ color: "var(--app-text-faint)" }}>{item.qty}</td>
                      <td className="p-[8px_0] text-end text-[12px]" style={{ color: "var(--app-text-faint)" }}>{formatCurrency(item.price, currency)}</td>
                      <td className="p-[8px_0] text-end text-[12px]" style={{ color: "var(--app-text-disabled)" }}>{formatCurrency(item.cost, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-1.5 text-[11px]" style={{ color: "var(--app-text-disabled)" }}>Cost snapshot is stored at the time of sale, so later price changes never rewrite history.</div>
          </div>

          <div>
            <div className="mb-1.5 text-[10.5px] font-extrabold uppercase" style={{ color: "var(--app-text-disabled)", letterSpacing: ".4px" }}>Totals</div>
            <div className="flex justify-between p-[6px_0]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}><span className="text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>Subtotal</span><span className="text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{formatCurrency(order.subtotal, currency)}</span></div>
            <div className="flex justify-between p-[6px_0]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}><span className="text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>Discount</span><span className="text-[12.5px] font-bold" style={{ color: "var(--app-danger-strong)" }}>{formatCurrency(order.discount, currency)}</span></div>
            <div className="flex justify-between p-[6px_0]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}><span className="text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>Tax</span><span className="text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>{formatCurrency(order.tax, currency)}</span></div>
            <div className="flex justify-between p-[6px_0]"><span className="text-[13px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Total</span><span className="text-[13px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(order.total, currency)}</span></div>
          </div>

          {data && data.auditTrail.length > 0 && (
            <div>
              <div className="mb-1.5 text-[10.5px] font-extrabold uppercase" style={{ color: "var(--app-text-disabled)", letterSpacing: ".4px" }}>Audit trail</div>
              {data.auditTrail.map((entry) => (
                <div key={entry.id} className="flex items-start gap-2.5 p-[5px_0]">
                  <span className="mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: "var(--app-success-border)" }} />
                  <span className="text-[12px]" style={{ color: "var(--app-text-faint)" }}>
                    <strong style={{ color: "var(--app-text-muted)" }}>{entry.action}</strong> — {formatDate(entry.createdAt)} {formatTime(entry.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-[9px] pt-[14px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
            <button type="button" onClick={handleReprint} disabled={busyAction != null} style={{ ...cancelStyle, minHeight: 46, opacity: busyAction != null ? 0.6 : 1 }}>
              <Download className="me-1.5 inline h-3.5 w-3.5" aria-hidden />
              {busyAction === "reprint" ? "Preparing…" : "Reprint Receipt"}
            </button>
            <button type="button" onClick={handleResend} disabled={busyAction != null} style={{ ...cancelStyle, minHeight: 46, opacity: busyAction != null ? 0.6 : 1 }}>
              {busyAction === "resend" ? "Sending…" : "Resend Receipt"}
            </button>
            {order.status === "completed" && (
              <button type="button" onClick={() => setRefundOpen(true)} style={{ ...btnDanger, gridColumn: "1 / span 2", minHeight: 46 }}>Refund</button>
            )}
          </div>
        </div>
      )}

      {order && <RefundModal open={refundOpen} onClose={() => setRefundOpen(false)} orderId={order.id} orderNo={order.orderNo} items={order.items} currency={currency} />}
    </SlideDrawer>
  );
}

function RefundModal({
  open,
  onClose,
  orderId,
  orderNo,
  items,
  currency,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNo: number;
  items: { productId: string | null; name: string; price: number; qty: number }[];
  currency: string;
}) {
  const returnable = items.filter((i) => i.productId != null);
  const [qtyByProduct, setQtyByProduct] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("Customer changed mind");
  const [refundMethod, setRefundMethod] = useState<"cash" | "card" | "online" | "credit" | "store_credit">("cash");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      createReturn({
        orderId,
        reason: reason.trim(),
        refundMethod,
        items: returnable.filter((i) => (qtyByProduct[i.productId as string] ?? 0) > 0).map((i) => ({ productId: i.productId as string, qty: qtyByProduct[i.productId as string] })),
      }),
    onSuccess: () => {
      toast.success("Refund request submitted for approval.");
      queryClient.invalidateQueries({ queryKey: ["sales-history"] });
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't submit this refund request — please try again."),
  });

  const anySelected = returnable.some((i) => (qtyByProduct[i.productId as string] ?? 0) > 0);
  const refundAmount = returnable.reduce((sum, i) => sum + (qtyByProduct[i.productId as string] ?? 0) * i.price, 0);

  return (
    <PosModalShell
      open={open}
      onClose={onClose}
      title={`Refund Sale #${orderNo}`}
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelStyle}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={!anySelected || !reason.trim() || mutation.isPending} style={{ ...btnDanger, opacity: !anySelected || !reason.trim() || mutation.isPending ? 0.6 : 1 }}>
            {mutation.isPending ? "Submitting…" : "Refund"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 p-[17px]">
        <div className="flex flex-col gap-2">
          {returnable.map((item) => (
            <div key={item.productId} className="flex items-center gap-[11px] rounded-[12px] p-3" style={{ border: "1px solid var(--app-border)" }}>
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{item.name}</span>
              <span className="text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>{formatCurrency(item.price, currency)} each</span>
              <input
                type="number"
                min={0}
                max={item.qty}
                value={qtyByProduct[item.productId as string] ?? 0}
                onChange={(e) => setQtyByProduct((q) => ({ ...q, [item.productId as string]: Math.min(item.qty, Math.max(0, Number(e.target.value))) }))}
                aria-label={`Quantity for ${item.name}`}
                className="w-[70px] rounded-[9px] p-2 text-center text-[13px] font-bold"
                style={{ border: "1px solid var(--app-border)" }}
              />
            </div>
          ))}
        </div>
        <div className="rounded-[11px] p-[11px_13px] text-[12px]" style={{ background: "var(--app-success-bg)", color: "var(--app-success-text)" }}>
          Refund amount: {formatCurrency(refundAmount, currency)}. Stock will be restored for returned physical products.
        </div>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>REASON</span>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-[11px] p-3 text-[13px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
            <option>Damaged item</option>
            <option>Wrong item</option>
            <option>Customer changed mind</option>
            <option>Duplicate charge</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>REFUND METHOD</span>
          <select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as typeof refundMethod)} className="w-full rounded-[11px] p-3 text-[13px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
            <option value="cash">Cash</option>
            <option value="card">Card reversal</option>
            <option value="online">Online reversal</option>
            <option value="credit">Credit adjustment</option>
            <option value="store_credit">Store credit</option>
          </select>
        </label>
      </div>
    </PosModalShell>
  );
}
