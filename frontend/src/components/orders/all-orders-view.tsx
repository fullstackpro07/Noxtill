"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, MoreVertical, PackageX } from "lucide-react";
import { useSession } from "@/lib/session";
import { fetchStaffList } from "@/lib/staff-api";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import {
  bulkUpdateOrderStatus,
  fetchOrders,
  fetchOrdersSummary,
  updateOrderStatus,
  type LiveOrder,
  type LivePaymentStatus,
  type OrdersFilters,
} from "@/lib/orders-api";
import type { OrderStatus } from "@/lib/orders";
import { useOrdersSearchStore } from "@/store/orders-search-store";
import { OrderDetailDrawer } from "./order-detail-drawer";
import { OrderFormDrawer } from "./order-form-drawer";
import { ChangeStatusModal, CancelOrderModal, PrintOrderModal } from "./order-action-modals";

const selectStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 10, padding: "9px 11px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 42 };
const STATUS_LABEL: Record<OrderStatus, string> = { draft: "Draft", pending: "Pending", confirmed: "Confirmed", in_progress: "In Progress", completed: "Completed", cancelled: "Cancelled" };
const STATUS_BADGE: Record<OrderStatus, { bg: string; fg: string }> = {
  draft: { bg: "var(--app-surface-2)", fg: "var(--app-text-faint)" },
  pending: { bg: "var(--app-warning-bg)", fg: "var(--app-warning-text)" },
  confirmed: { bg: "#EEF4FF", fg: "#3538CD" },
  in_progress: { bg: "#E8F1FE", fg: "#1849A9" },
  completed: { bg: "var(--app-success-bg)", fg: "var(--app-success-text)" },
  cancelled: { bg: "#FEF3F2", fg: "var(--app-danger-strong)" },
};
const PAY_LABEL: Record<LivePaymentStatus, string> = { paid: "Paid", unpaid: "Unpaid", partial: "Partial", refunded: "Refunded" };
const PAY_BADGE: Record<LivePaymentStatus, { bg: string; fg: string }> = {
  paid: { bg: "var(--app-success-bg)", fg: "var(--app-success-text)" },
  unpaid: { bg: "#FEF3F2", fg: "var(--app-danger-strong)" },
  partial: { bg: "var(--app-warning-bg)", fg: "var(--app-warning-text)" },
  refunded: { bg: "var(--app-surface-2)", fg: "var(--app-text-faint)" },
};
const TYPE_LABEL: Record<string, string> = { counter: "Counter", online: "Online", dine_in: "Dine-in", takeaway: "Takeaway", delivery: "Delivery", quotation: "Quotation" };
const TYPE_COLOR: Record<string, string> = { counter: "var(--app-primary)", online: "#2563EB", delivery: "#9333EA", dine_in: "#F97316", takeaway: "#0D9488", quotation: "#98A2B3" };

type DatePreset = "today" | "yesterday" | "week" | "month";

function dateRangeFor(preset: DatePreset): { from?: string; to?: string } {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === "today") return { from: startOfToday.toISOString() };
  if (preset === "yesterday") {
    const y = new Date(startOfToday);
    y.setDate(y.getDate() - 1);
    return { from: y.toISOString(), to: startOfToday.toISOString() };
  }
  if (preset === "week") {
    const w = new Date(startOfToday);
    w.setDate(w.getDate() - 6);
    return { from: w.toISOString() };
  }
  const m = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: m.toISOString() };
}

function KpiCard({ icon, tint, color, label, value, note }: { icon: React.ReactNode; tint: string; color: string; label: string; value: React.ReactNode; note: string }) {
  return (
    <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px]" style={{ background: tint, color }}>{icon}</span>
        <span className="text-[12px] font-semibold" style={{ color: "var(--app-text-faint)" }}>{label}</span>
      </div>
      <div className="text-[21px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.5px" }}>{value}</div>
      <div className="mt-1 text-[11px]" style={{ color: "var(--app-text-disabled)" }}>{note}</div>
    </div>
  );
}

function OrdersByDayChart({ data }: { data: { date: string; count: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const chart = useMemo(() => {
    const L = 30, gap = 82, barW = 46, max = Math.max(1, ...data.map((d) => d.count));
    return data.map((d, i) => {
      const h = (d.count / max) * 120;
      return { x: L + i * gap, w: barW, h, y: 16 + 120 - h, cx: L + barW / 2 + i * gap, day: new Date(d.date).toLocaleDateString(undefined, { weekday: "short" }) };
    });
  }, [data]);

  return (
    <svg viewBox="0 0 620 160" className="block w-full" style={{ height: 160 }} onMouseLeave={() => setHover(null)}>
      {chart.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={b.y} width={b.w} height={Math.max(2, b.h)} rx={5} fill={hover === i ? "var(--app-primary-hover, #0E8442)" : "var(--app-success-border)"} onMouseEnter={() => setHover(i)} />
          <text x={b.cx} y={152} textAnchor="middle" fontSize={10.5} fill="#667085" fontWeight={600}>{b.day}</text>
          {hover === i && <text x={b.cx} y={b.y - 7} textAnchor="middle" fontSize={11} fontWeight={800} fill="#0F172A">{data[i].count} orders</text>}
        </g>
      ))}
    </svg>
  );
}

function TypeSplitDonut({ data }: { data: { type: string; count: number }[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  const C = 2 * Math.PI * 46;
  const arcs = data.reduce<{ type: string; len: number; offset: number }[]>((acc, d) => {
    const pct = total > 0 ? d.count / total : 0;
    const len = pct * C;
    const offset = acc.length > 0 ? acc[acc.length - 1].offset + acc[acc.length - 1].len : 0;
    acc.push({ type: d.type, len, offset });
    return acc;
  }, []);
  return (
    <div className="flex items-center gap-[13px]">
      <svg viewBox="0 0 130 130" style={{ width: 104, height: 104, flex: "0 0 104px" }}>
        <g transform="rotate(-90 65 65)">
          {arcs.map((a) => (
            <circle key={a.type} cx={65} cy={65} r={46} fill="none" stroke={TYPE_COLOR[a.type] ?? "#98A2B3"} strokeWidth={24} strokeDasharray={`${a.len.toFixed(1)} ${(C - a.len).toFixed(1)}`} strokeDashoffset={(-a.offset).toFixed(1)} />
          ))}
        </g>
        <circle cx={65} cy={65} r={31} fill="var(--app-surface)" />
      </svg>
      <div className="flex flex-1 flex-col gap-1.5">
        {data.length === 0 ? (
          <p className="text-[12px]" style={{ color: "var(--app-text-disabled)" }}>No orders in the last 30 days.</p>
        ) : (
          data.map((d) => (
            <div key={d.type} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-[2px]" style={{ background: TYPE_COLOR[d.type] ?? "#98A2B3" }} />
              <span className="flex-1 text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{TYPE_LABEL[d.type] ?? d.type}</span>
              <span className="text-[12px] font-extrabold" style={{ color: "var(--app-text)" }}>{total > 0 ? Math.round((d.count / total) * 100) : 0}%</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function AllOrdersView() {
  const session = useSession();
  const isOwnerOrManager = session.user.role !== "staff";
  const queryClient = useQueryClient();
  const query = useOrdersSearchStore((s) => s.query);

  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [payFilter, setPayFilter] = useState<LivePaymentStatus | "all">("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("week");
  const [staffFilter, setStaffFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewing, setViewing] = useState<LiveOrder | null>(null);
  const [changingStatus, setChangingStatus] = useState<LiveOrder | null>(null);
  const [cancelling, setCancelling] = useState<LiveOrder | null>(null);
  const [printing, setPrinting] = useState<LiveOrder | null>(null);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [newOrderOpen, setNewOrderOpen] = useState(false);

  const { data: summary } = useQuery({ queryKey: ["orders-summary"], queryFn: fetchOrdersSummary });
  const { data: staff } = useQuery({ queryKey: ["staff-roster"], queryFn: fetchStaffList, staleTime: 5 * 60_000 });

  const filters: OrdersFilters = useMemo(() => {
    const range = dateRangeFor(datePreset);
    return {
      status: statusFilter === "all" ? undefined : statusFilter,
      orderType: typeFilter === "all" ? undefined : typeFilter,
      paymentStatus: payFilter === "all" ? undefined : payFilter,
      staffUserId: staffFilter === "all" ? undefined : staffFilter,
      from: range.from,
      to: range.to,
    };
  }, [statusFilter, typeFilter, payFilter, staffFilter, datePreset]);

  const { data: orders } = useQuery({ queryKey: ["orders", filters], queryFn: () => fetchOrders(filters) });

  const filtered = useMemo(() => {
    if (!orders) return [];
    const q = query.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => String(o.orderNo).includes(q) || o.customerName.toLowerCase().includes(q) || o.orderType.toLowerCase().includes(q));
  }, [orders, query]);

  const statusMutation = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: OrderStatus; reason?: string }) => updateOrderStatus(id, status, reason),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders-summary"] });
      toast.success(`Order #${updated.orderNo} moved to ${STATUS_LABEL[updated.status]}.`);
      setChangingStatus(null);
      setCancelling(null);
      setViewing(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this order."),
  });

  const bulkMutation = useMutation({
    mutationFn: (status: OrderStatus) => bulkUpdateOrderStatus(Array.from(selected), status),
    onSuccess: ({ succeeded, failed }) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders-summary"] });
      toast[failed > 0 ? "error" : "success"](failed > 0 ? `${succeeded} updated, ${failed} couldn't move to that status.` : `${succeeded} order(s) updated.`);
      setSelected(new Set());
      setBulkStatusOpen(false);
    },
  });

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((o) => o.id))));
  }

  function exportCsv() {
    const rows = selected.size > 0 ? filtered.filter((o) => selected.has(o.id)) : filtered;
    if (rows.length === 0) return;
    const header = ["Order #", "Customer", "Items", "Type", "Payment", "Status", "Staff", "Date", "Total"];
    const lines = rows.map((o) => [o.orderNo, o.customerName, o.items.reduce((n, i) => n + i.qty, 0), o.orderType, o.paymentStatus, o.status, o.staffName ?? "", o.createdAt, o.total]);
    const csv = [header, ...lines].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "orders.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const today = summary?.today;

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))" }}>
        <KpiCard icon={<ClipboardList className="h-4 w-4" aria-hidden />} tint="#EEF4FF" color="#3538CD" label="Total Orders" value={today?.total ?? "—"} note="Today" />
        <KpiCard icon={<ClipboardList className="h-4 w-4" aria-hidden />} tint="var(--app-warning-bg)" color="var(--app-warning-text)" label="Pending" value={today?.pending ?? "—"} note="Awaiting action" />
        <KpiCard icon={<ClipboardList className="h-4 w-4" aria-hidden />} tint="#E8F1FE" color="#1849A9" label="In Progress" value={today?.inProgress ?? "—"} note="Being fulfilled" />
        <KpiCard icon={<ClipboardList className="h-4 w-4" aria-hidden />} tint="var(--app-success-bg)" color="var(--app-success-text)" label="Completed Today" value={today?.completed ?? "—"} note="Since midnight" />
        <KpiCard icon={<ClipboardList className="h-4 w-4" aria-hidden />} tint="#FEF3F2" color="var(--app-danger-strong)" label="Cancelled" value={today?.cancelled ?? "—"} note="Today" />
        {isOwnerOrManager && (
          <KpiCard icon={<ClipboardList className="h-4 w-4" aria-hidden />} tint="var(--app-success-bg)" color="var(--app-success-text)" label="Revenue" value={formatCurrency(today?.revenuePaid ?? 0, session.business.currency)} note="Paid orders today" />
        )}
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "minmax(0,1fr) 320px" }}>
        <div className="min-w-0 rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-1.5 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Orders by day</h3>
          <OrdersByDayChart data={summary?.last7Days ?? []} />
        </div>
        <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-2.5 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Order type split</h3>
          <TypeSplitDonut data={summary?.typeSplit ?? []} />
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap items-center gap-2 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as OrderStatus | "all")} aria-label="Order status" style={selectStyle}>
            <option value="all">All statuses</option>
            {(["pending", "confirmed", "in_progress", "completed", "cancelled"] as OrderStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Order type" style={selectStyle}>
            <option value="all">All types</option>
            {["counter", "online", "dine_in", "takeaway", "delivery"].map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </select>
          <select value={payFilter} onChange={(e) => setPayFilter(e.target.value as LivePaymentStatus | "all")} aria-label="Payment status" style={selectStyle}>
            <option value="all">All payments</option>
            {(["paid", "unpaid", "partial", "refunded"] as LivePaymentStatus[]).map((p) => (
              <option key={p} value={p}>{PAY_LABEL[p]}</option>
            ))}
          </select>
          <select value={datePreset} onChange={(e) => setDatePreset(e.target.value as DatePreset)} aria-label="Date" style={selectStyle}>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
          </select>
          {staff && staff.length > 0 && (
            <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} aria-label="Staff" style={selectStyle}>
              <option value="all">All staff</option>
              {staff.map((s) => (
                <option key={s.userId} value={s.userId}>{s.name}</option>
              ))}
            </select>
          )}
          <button type="button" onClick={() => { setStatusFilter("all"); setTypeFilter("all"); setPayFilter("all"); setDatePreset("week"); setStaffFilter("all"); }} style={{ ...selectStyle, fontWeight: 700 }}>
            Clear
          </button>
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 p-[11px_17px]" style={{ background: "var(--app-sidebar-bg)" }}>
            <span className="text-[12.5px] font-bold text-white">{selected.size} selected</span>
            <button type="button" onClick={() => setSelected(new Set())} className="text-[12px] font-semibold" style={{ color: "#8FF0BB" }}>Clear selection</button>
            <span className="ms-auto flex flex-wrap gap-2">
              <button type="button" onClick={() => setBulkStatusOpen(true)} className="rounded-[9px] px-3.5 py-2 text-[12px] font-bold text-white" style={{ background: "var(--app-primary)" }}>Change Status</button>
              <button type="button" onClick={exportCsv} className="rounded-[9px] px-3.5 py-2 text-[12px] font-bold text-white" style={{ border: "1px solid var(--app-sidebar-hover)" }}>Export</button>
            </span>
          </div>
        )}

        {orders && filtered.length === 0 ? (
          <div className="p-[52px_18px] text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[14px]" style={{ background: "var(--app-surface-2)" }}>
              <PackageX className="h-[23px] w-[23px]" style={{ color: "var(--app-text-disabled)" }} aria-hidden />
            </div>
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No orders match these filters</div>
            <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Clear the filters, or create the first order of the day.</div>
            <div className="mt-[15px] flex flex-wrap justify-center gap-2.5">
              <button type="button" onClick={() => setNewOrderOpen(true)} className="rounded-[11px] px-5 py-3 text-[12.5px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>New Order</button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 1000 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="w-[34px] p-[10px_0_10px_17px]"><input type="checkbox" checked={filtered.length > 0 && selected.size === filtered.length} onChange={toggleAll} aria-label="Select all orders" style={{ accentColor: "var(--app-primary)" }} /></th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Order #</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Customer</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Items</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Type</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Payment</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Status</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Staff</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Date</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Total</th>
                  <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => {
                  const stBadge = STATUS_BADGE[o.status];
                  const payBadge = PAY_BADGE[o.paymentStatus];
                  return (
                    <tr key={o.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                      <td className="p-[11px_0_11px_17px]"><input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} aria-label={`Select order ${o.orderNo}`} style={{ accentColor: "var(--app-primary)" }} /></td>
                      <td className="p-[11px]">
                        <button type="button" onClick={() => setViewing(o)} className="text-[12.5px] font-extrabold" style={{ color: "var(--app-success-text)" }}>#{o.orderNo}</button>
                      </td>
                      <td className="p-[11px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{o.customerName}</td>
                      <td className="p-[11px] text-end text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{o.items.reduce((n, i) => n + i.qty, 0)}</td>
                      <td className="p-[11px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{TYPE_LABEL[o.orderType] ?? o.orderType}</td>
                      <td className="p-[11px]"><span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: payBadge.bg, color: payBadge.fg }}>{PAY_LABEL[o.paymentStatus]}</span></td>
                      <td className="p-[11px]"><span className="whitespace-nowrap rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: stBadge.bg, color: stBadge.fg }}>{STATUS_LABEL[o.status]}</span></td>
                      <td className="p-[11px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{o.staffName ?? "—"}</td>
                      <td className="whitespace-nowrap p-[11px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>{formatDate(o.createdAt)} {formatTime(o.createdAt)}</td>
                      <td className="p-[11px] text-end text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(o.total, session.business.currency)}</td>
                      <td className="relative p-[11px_17px] text-end">
                        <button type="button" onClick={() => setMenuOpenId(menuOpenId === o.id ? null : o.id)} aria-label={`Actions for order ${o.orderNo}`} className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-[9px]" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-faint)" }}>
                          <MoreVertical className="h-4 w-4" aria-hidden />
                        </button>
                        {menuOpenId === o.id && (
                          <div className="absolute right-[17px] top-11 z-20 w-[170px] rounded-[11px] p-[5px] text-start" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", boxShadow: "0 14px 34px rgba(16,24,40,.16)" }}>
                            <button type="button" onClick={() => { setViewing(o); setMenuOpenId(null); }} className="block w-full rounded-[8px] p-[9px_10px] text-start text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>View</button>
                            <button type="button" onClick={() => { setChangingStatus(o); setMenuOpenId(null); }} className="block w-full rounded-[8px] p-[9px_10px] text-start text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Change Status</button>
                            <button type="button" onClick={() => { setPrinting(o); setMenuOpenId(null); }} className="block w-full rounded-[8px] p-[9px_10px] text-start text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Print</button>
                            <button
                              type="button"
                              onClick={() => { setCancelling(o); setMenuOpenId(null); }}
                              disabled={o.status === "completed" || o.status === "cancelled"}
                              className="block w-full rounded-[8px] p-[9px_10px] text-start text-[12px] font-semibold disabled:opacity-40"
                              style={{ color: "var(--app-danger-strong)" }}
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <OrderDetailDrawer
        order={viewing}
        currency={session.business.currency}
        onClose={() => setViewing(null)}
        onPrint={() => setPrinting(viewing)}
        onCancel={() => setCancelling(viewing)}
        onChangeStatus={() => setChangingStatus(viewing)}
      />
      <ChangeStatusModal order={changingStatus} onClose={() => setChangingStatus(null)} applying={statusMutation.isPending} onApply={(status, reason) => changingStatus && statusMutation.mutate({ id: changingStatus.id, status, reason })} />
      <CancelOrderModal order={cancelling} currency={session.business.currency} onClose={() => setCancelling(null)} cancelling={statusMutation.isPending} onCancel={(reason) => cancelling && statusMutation.mutate({ id: cancelling.id, status: "cancelled", reason })} />
      <PrintOrderModal order={printing} currency={session.business.currency} businessName={session.business.name} onClose={() => setPrinting(null)} />
      <OrderFormDrawer open={newOrderOpen} onClose={() => setNewOrderOpen(false)} />

      {bulkStatusOpen && (
        <ChangeStatusModal
          order={filtered.find((o) => selected.has(o.id)) ?? null}
          onClose={() => setBulkStatusOpen(false)}
          applying={bulkMutation.isPending}
          onApply={(status) => bulkMutation.mutate(status)}
        />
      )}
    </main>
  );
}
