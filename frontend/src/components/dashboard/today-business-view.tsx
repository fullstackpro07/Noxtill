"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Clock3, Download, Printer, Plus } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { useSession } from "@/lib/session";
import { useNow } from "@/hooks/use-now";
import { fetchStaffList } from "@/lib/staff-api";
import { formatCurrency, formatTime } from "@/lib/format";
import { fetchTodayBusiness, type TodayBusinessFilters, type LiveTodayBusiness } from "@/lib/today-business-api";
import type { LivePaymentMethod } from "@/lib/orders-api";

const PAYMENT_METHODS: LivePaymentMethod[] = ["cash", "card", "online", "credit"];
const ORDER_TYPES = ["counter", "online", "dine_in", "takeaway", "delivery"] as const;
const PAYMENT_LABEL: Record<string, string> = { cash: "Cash", card: "Card", online: "Online", credit: "Credit" };
const ORDER_TYPE_LABEL: Record<string, string> = {
  counter: "Counter",
  online: "Online",
  dine_in: "Dine-in",
  takeaway: "Takeaway",
  delivery: "Delivery",
};

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  completed: { bg: "var(--app-success-bg)", fg: "var(--app-success-text)" },
  pending: { bg: "var(--app-warning-bg)", fg: "var(--app-warning-text)" },
  processing: { bg: "var(--app-warning-bg)", fg: "var(--app-warning-text)" },
  refunded: { bg: "var(--app-surface-2)", fg: "var(--app-text-faint)" },
  cancelled: { bg: "#FEE4E2", fg: "var(--app-danger-strong)" },
  default: { bg: "var(--app-warning-bg)", fg: "var(--app-warning-text)" },
};

const outlineBtnStyle: React.CSSProperties = {
  border: "1px solid var(--app-border)",
  borderRadius: 10,
  padding: "9px 14px",
  fontSize: 12.5,
  fontWeight: 600,
  color: "var(--app-text-muted)",
  background: "var(--app-surface)",
  display: "flex",
  alignItems: "center",
  gap: 6,
};

function exportTodayCsv(data: LiveTodayBusiness) {
  const lines = [
    "time,items,staff,method,amount,status",
    ...data.transactions.map((t) => [t.time, `"${t.items}"`, t.staffName ?? "", t.method ?? "", t.amount, t.status].join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `today-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

const selectStyle: React.CSSProperties = {
  border: "1px solid var(--app-border)",
  borderRadius: 9,
  padding: "7px 10px",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--app-text-muted)",
  background: "var(--app-surface)",
};

export function TodayBusinessView() {
  const session = useSession();
  const [filters, setFilters] = useState<TodayBusinessFilters>({});
  const now = useNow(60_000);

  const { data: staff } = useQuery({ queryKey: ["staff-roster"], queryFn: fetchStaffList, staleTime: 5 * 60 * 1000 });
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["today-business", filters],
    queryFn: () => fetchTodayBusiness(filters),
    refetchInterval: 60_000,
  });

  const cardsList = useMemo(
    () =>
      data
        ? [
            { label: "Sales count", value: String(data.cards.salesCount) },
            { label: "Revenue", value: formatCurrency(data.cards.revenue, session.business.currency) },
            { label: "Average ticket", value: formatCurrency(data.cards.avgTicket, session.business.currency) },
            { label: "Customers served", value: String(data.cards.customersServed) },
            { label: "Staff on duty", value: String(data.cards.staffOnDuty) },
            { label: "Open orders", value: String(data.cards.openOrders) },
          ]
        : [],
    [data, session.business.currency],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-[19px] font-extrabold tracking-tight" style={{ color: "var(--app-text)" }}>Today</h2>
          <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>
            {new Date(now).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-[10px] px-3 py-2" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)" }}>
          <Clock3 className="h-3.5 w-3.5" style={{ color: "var(--app-primary)" }} aria-hidden />
          <span className="text-[12.5px] font-bold tabular-nums" style={{ color: "var(--app-text)" }}>{formatTime(new Date(now).toISOString())}</span>
        </div>
        <div className="flex items-center gap-[7px] rounded-full px-3 py-1.5" style={{ background: "var(--app-success-bg)", border: "1px solid var(--app-success-border)" }}>
          <span className="h-[7px] w-[7px] animate-pulse rounded-full" style={{ background: "var(--app-primary)" }} />
          <span className="text-[11.5px] font-bold" style={{ color: "var(--app-success-text)" }}>Auto-refreshing every 60s</span>
        </div>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => data && exportTodayCsv(data)} disabled={!data} style={outlineBtnStyle}>
            <Download className="h-3.5 w-3.5" aria-hidden />
            Export today
          </button>
          <button type="button" onClick={() => window.print()} style={outlineBtnStyle}>
            <Printer className="h-3.5 w-3.5" aria-hidden />
            Print day sheet
          </button>
          <Link
            href="/sales"
            className="flex items-center gap-1.5 rounded-[10px] px-4 py-[9px] text-[12.5px] font-bold text-white"
            style={{ background: "var(--app-primary)" }}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            New sale
          </Link>
        </div>
      </div>

      {isError && (
        <div className="rounded-[14px] p-4" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <ErrorBanner title="Couldn't load today's business" onRetry={() => refetch()} />
        </div>
      )}

      {isPending && (
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[74px] animate-pulse rounded-[14px]" style={{ background: "var(--app-surface-2)" }} />
          ))}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-6">
            {cardsList.map((c) => (
              <div key={c.label} className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
                <p className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>{c.label}</p>
                <p className="mt-1.5 text-[23px] font-extrabold tabular-nums tracking-tight" style={{ color: "var(--app-text)" }}>{c.value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
            <div className="rounded-[14px] p-[18px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <h3 className="mb-2 text-[15px] font-bold" style={{ color: "var(--app-text)" }}>Hourly revenue — running total</h3>
              <HourlyRevenueChart data={data.hourlyRevenue} />
            </div>
            <div className="rounded-[14px] p-[18px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <h3 className="mb-2.5 text-[15px] font-bold" style={{ color: "var(--app-text)" }}>Payment method split</h3>
              <PaymentSplitDonut data={data.paymentMethodSplit} currency={session.business.currency} />
            </div>
          </div>

          <div className="rounded-[14px] overflow-hidden" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
            <div className="flex flex-wrap items-center gap-2.5 p-[14px_18px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
              <h3 className="text-[15px] font-bold" style={{ color: "var(--app-text)" }}>Every transaction today</h3>
              <span className="rounded-full px-2.5 py-0.5 text-[11.5px] font-bold" style={{ background: "var(--app-success-bg)", color: "var(--app-success-text)" }}>
                {data.transactions.length} shown
              </span>
              <div className="ms-auto flex flex-wrap items-center gap-2">
                {staff && staff.length > 0 && (
                  <select
                    value={filters.staffUserId ?? "all"}
                    onChange={(e) => setFilters((f) => ({ ...f, staffUserId: e.target.value === "all" ? undefined : e.target.value }))}
                    style={selectStyle}
                    aria-label="Filter by staff"
                  >
                    <option value="all">All staff</option>
                    {staff.map((s) => (
                      <option key={s.userId} value={s.userId}>{s.name}</option>
                    ))}
                  </select>
                )}
                <select
                  value={filters.paymentMethod ?? "all"}
                  onChange={(e) => setFilters((f) => ({ ...f, paymentMethod: e.target.value === "all" ? undefined : e.target.value }))}
                  style={selectStyle}
                  aria-label="Filter by payment method"
                >
                  <option value="all">All methods</option>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>{PAYMENT_LABEL[m]}</option>
                  ))}
                </select>
                <select
                  value={filters.orderType ?? "all"}
                  onChange={(e) => setFilters((f) => ({ ...f, orderType: e.target.value === "all" ? undefined : e.target.value }))}
                  style={selectStyle}
                  aria-label="Filter by order type"
                >
                  <option value="all">All types</option>
                  {ORDER_TYPES.map((t) => (
                    <option key={t} value={t}>{ORDER_TYPE_LABEL[t]}</option>
                  ))}
                </select>
              </div>
            </div>
            {data.transactions.length === 0 ? (
              <EmptyState icon={Clock3} title="No sales yet today" description="Ring up your first sale to see it here." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr style={{ background: "var(--app-surface-2)" }}>
                      <th className="px-[18px] py-2.5 text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Time</th>
                      <th className="px-2.5 py-2.5 text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Item(s)</th>
                      <th className="px-2.5 py-2.5 text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Staff</th>
                      <th className="px-2.5 py-2.5 text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Method</th>
                      <th className="px-2.5 py-2.5 text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Amount</th>
                      <th className="px-[18px] py-2.5 text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.transactions.map((t) => {
                      const style = STATUS_STYLE[t.status.toLowerCase()] ?? STATUS_STYLE.default;
                      return (
                        <tr key={t.id} style={{ borderTop: "1px solid var(--app-surface-2)" }}>
                          <td className="px-[18px] py-2.5 font-semibold whitespace-nowrap" style={{ color: "var(--app-text-muted)" }}>{formatTime(t.time)}</td>
                          <td className="max-w-xs truncate px-2.5 py-2.5" style={{ color: "var(--app-text-faint)" }}>{t.items}</td>
                          <td className="px-2.5 py-2.5" style={{ color: "var(--app-text-faint)" }}>{t.staffName ?? "—"}</td>
                          <td className="px-2.5 py-2.5" style={{ color: "var(--app-text-faint)" }}>{t.method ? PAYMENT_LABEL[t.method] ?? t.method : "—"}</td>
                          <td className="px-2.5 py-2.5 text-end font-bold tabular-nums" style={{ color: "var(--app-text)" }}>
                            {formatCurrency(t.amount, session.business.currency)}
                          </td>
                          <td className="px-[18px] py-2.5 text-end">
                            <span className="rounded-full px-2.5 py-1 text-[10.5px] font-bold" style={{ background: style.bg, color: style.fg }}>{t.status}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function HourlyRevenueChart({ data }: { data: { hour: number; revenue: number }[] }) {
  const width = 620;
  const height = 190;
  const max = Math.max(...data.map((d) => d.revenue), 1);
  const points = data.map((d, i) => ({
    x: (i / Math.max(1, data.length - 1)) * width,
    y: height - (d.revenue / max) * height,
  }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Hourly revenue running total">
      <path d={areaPath} fill="var(--app-primary)" opacity={0.1} />
      <path d={linePath} fill="none" stroke="var(--app-primary)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const METHOD_COLOR: Record<string, string> = {
  cash: "#12A150",
  card: "#2563EB",
  online: "#9333EA",
  credit: "#F97316",
};

function PaymentSplitDonut({ data, currency }: { data: { method: string; amount: number; count: number }[]; currency: string }) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>No payments yet today.</p>;
  }
  const total = data.reduce((sum, d) => sum + d.amount, 0) || 1;
  const C = 2 * Math.PI * 46;
  let acc = 0;
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 130 130" className="h-28 w-28 shrink-0">
        <g transform="rotate(-90 65 65)">
          {data.map((d) => {
            const len = (d.amount / total) * C;
            const el = (
              <circle key={d.method} cx={65} cy={65} r={46} fill="none" stroke={METHOD_COLOR[d.method] ?? "#98A2B3"} strokeWidth={26} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} />
            );
            acc += len;
            return el;
          })}
        </g>
        <circle cx={65} cy={65} r={30} fill="var(--app-surface)" />
      </svg>
      <div className="flex flex-1 flex-col gap-2">
        {data.map((d) => (
          <div key={d.method} className="flex items-center gap-2 text-[12px]">
            <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: METHOD_COLOR[d.method] ?? "#98A2B3" }} aria-hidden />
            <span className="min-w-0 flex-1 truncate font-semibold" style={{ color: "var(--app-text-muted)" }}>{PAYMENT_LABEL[d.method] ?? d.method}</span>
            <span className="font-bold tabular-nums" style={{ color: "var(--app-text)" }}>{formatCurrency(d.amount, currency)}</span>
            <span className="w-9 shrink-0 text-end text-[11px] tabular-nums" style={{ color: "var(--app-text-faintest)" }}>
              {Math.round((d.amount / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
