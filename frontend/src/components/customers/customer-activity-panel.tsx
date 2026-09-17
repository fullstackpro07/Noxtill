"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchOrders } from "@/lib/orders-api";
import { fetchAppointments } from "@/lib/bookings-api";
import { fetchReviewRequests } from "@/lib/reviews-api";
import { fetchCreditSales, fetchCreditPayments } from "@/lib/credit-api";
import { fetchRecentMessages } from "@/lib/messages-api";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useCustomersSearchStore } from "@/store/customers-search-store";

type ActivityType = "Purchase" | "Payment" | "Booking" | "Review" | "Message" | "Credit";

interface ActivityRow {
  id: string;
  ts: string;
  type: ActivityType;
  name: string;
  desc: string;
  amount: number;
  module: string;
  href: string;
}

const TYPE_TONE: Record<ActivityType, { bg: string; fg: string }> = {
  Purchase: { bg: "#E8F7EE", fg: "#0E8442" },
  Payment: { bg: "#E6F6F4", fg: "#0D7C74" },
  Booking: { bg: "#EEF4FF", fg: "#3538CD" },
  Review: { bg: "#FEF6E7", fg: "#B54708" },
  Message: { bg: "#F5EBFE", fg: "#7E22CE" },
  Credit: { bg: "#FEF3F2", fg: "#B42318" },
};

const selectStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 10, padding: "9px 11px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 42 };

export function CustomerActivityPanel() {
  const session = useSession();
  const currency = session.business.currency;
  const router = useRouter();
  const query = useCustomersSearchStore((s) => s.query);
  const [typeFilter, setTypeFilter] = useState<"All types" | ActivityType>("All types");
  const [dateFilter, setDateFilter] = useState("Last 7 days");

  const { data: orders = [] } = useQuery({ queryKey: ["orders", "recent"], queryFn: () => fetchOrders({ limit: 100 }) });
  const { data: appointments = [] } = useQuery({ queryKey: ["appointments", "all"], queryFn: () => fetchAppointments() });
  const { data: reviews = [] } = useQuery({ queryKey: ["review-requests"], queryFn: fetchReviewRequests });
  const { data: sales = [] } = useQuery({ queryKey: ["credit-sales"], queryFn: fetchCreditSales });
  const { data: payments = [] } = useQuery({ queryKey: ["credit-payments"], queryFn: fetchCreditPayments });
  const { data: messages = [] } = useQuery({ queryKey: ["messages", "recent"], queryFn: () => fetchRecentMessages(100) });

  const rows = useMemo(() => {
    const all: ActivityRow[] = [];
    for (const o of orders) {
      all.push({ id: `order-${o.id}`, ts: o.createdAt, type: "Purchase", name: o.customerName, desc: `Order #${o.orderNo} — ${o.items.map((i) => i.name).join(", ").slice(0, 60)}`, amount: o.total, module: "Fast Sale / Orders", href: "/orders" });
    }
    for (const a of appointments) {
      all.push({ id: `appt-${a.id}`, ts: a.createdAt, type: "Booking", name: a.customerName, desc: `${a.serviceName} booked`, amount: 0, module: "Bookings", href: "/bookings" });
    }
    for (const r of reviews.filter((r) => r.status === "rated")) {
      all.push({ id: `review-${r.id}`, ts: r.respondedAt ?? r.createdAt, type: "Review", name: r.customer?.name ?? "Customer", desc: `Left a ${r.stars ?? 0}-star review via ${r.source}`, amount: 0, module: "Reviews", href: "/reviews" });
    }
    for (const s of sales) {
      all.push({ id: `sale-${s.id}`, ts: s.createdAt, type: "Credit", name: s.customerName, desc: `Credit sale recorded${s.orderNo ? ` on order #${s.orderNo}` : ""}`, amount: s.amount, module: "Credit", href: "/credit/sales" });
    }
    for (const p of payments) {
      all.push({ id: `payment-${p.id}`, ts: p.createdAt, type: "Payment", name: p.customerName, desc: `Payment against credit balance`, amount: p.amount, module: "Credit", href: "/credit/payments" });
    }
    for (const m of messages) {
      all.push({ id: `msg-${m.id}`, ts: m.createdAt, type: "Message", name: m.customer?.name ?? "Customer", desc: m.customBody ? m.customBody.slice(0, 60) : m.templateKey, amount: 0, module: "Messaging", href: "/customers" });
    }
    return all.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  }, [orders, appointments, reviews, sales, payments, messages]);

  const filtered = useMemo(() => {
    const now = new Date().getTime();
    const cutoff = dateFilter === "Last 30 days" ? 30 : dateFilter === "This year" ? 366 : 7;
    return rows.filter((r) => {
      if (typeFilter !== "All types" && r.type !== typeFilter) return false;
      if (now - new Date(r.ts).getTime() > cutoff * 24 * 60 * 60 * 1000) return false;
      if (query && !r.name.toLowerCase().includes(query.toLowerCase()) && !r.desc.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [rows, typeFilter, dateFilter, query]);

  const today = new Date().toDateString();
  const kpi = (type: ActivityType) => filtered.filter((r) => r.type === type).length;
  const activitiesToday = filtered.filter((r) => new Date(r.ts).toDateString() === today).length;

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Activities Today</div>
          <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{activitiesToday}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Purchases</div>
          <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{kpi("Purchase")}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Bookings</div>
          <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{kpi("Booking")}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Messages</div>
          <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{kpi("Message")}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Reviews</div>
          <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{kpi("Review")}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap gap-2 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} aria-label="Date" style={selectStyle}>
            {["Last 7 days", "Last 30 days", "This year"].map((o) => <option key={o}>{o}</option>)}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)} aria-label="Activity type" style={selectStyle}>
            {["All types", "Purchase", "Payment", "Booking", "Review", "Message", "Credit"].map((o) => <option key={o}>{o}</option>)}
          </select>
        </div>

        {filtered.length === 0 && (
          <div className="p-[52px_18px] text-center">
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No customer activity in this period</div>
          </div>
        )}

        {filtered.map((a, i) => {
          const tone = TYPE_TONE[a.type];
          return (
            <div key={a.id} onClick={() => router.push(a.href)} className="flex cursor-pointer flex-wrap items-center gap-3 p-[13px_17px]" style={{ borderTop: i === 0 ? undefined : "1px solid var(--app-surface-2)" }}>
              <span className="w-[130px] flex-none text-[11.5px] font-bold" style={{ color: "var(--app-text-disabled)" }}>{formatDate(a.ts)} {formatTime(a.ts)}</span>
              <span className="flex-none whitespace-nowrap rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: tone.bg, color: tone.fg }}>{a.type}</span>
              <span className="min-w-[190px] flex-1">
                <span className="block text-[12.5px] font-bold" style={{ color: "var(--app-primary)" }}>{a.name}</span>
                <span className="mt-0.5 block text-[11.5px]" style={{ color: "var(--app-text-muted)" }}>{a.desc}</span>
              </span>
              {a.amount > 0 && <span className="whitespace-nowrap text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(a.amount, currency)}</span>}
              <span className="whitespace-nowrap text-[11px]" style={{ color: "var(--app-text-disabled)" }}>{a.module}</span>
            </div>
          );
        })}
        <div className="p-[11px_17px] text-[11.5px]" style={{ borderTop: "1px solid var(--app-surface-2)", color: "var(--app-text-disabled)" }}>
          This is an aggregated view. Each row opens the real module that owns it.
        </div>
      </div>
    </main>
  );
}
