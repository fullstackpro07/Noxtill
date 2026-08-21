"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { useSession } from "@/lib/session";
import { useNow } from "@/hooks/use-now";
import { fetchStaffList } from "@/lib/staff-api";
import { formatCurrency, formatTime } from "@/lib/format";
import { fetchTodayBusiness, type TodayBusinessFilters } from "@/lib/today-business-api";
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
            { label: "Sales", value: String(data.cards.salesCount) },
            { label: "Revenue", value: formatCurrency(data.cards.revenue, session.business.currency) },
            { label: "Avg ticket", value: formatCurrency(data.cards.avgTicket, session.business.currency) },
            { label: "Customers served", value: String(data.cards.customersServed) },
            { label: "Staff on duty", value: String(data.cards.staffOnDuty) },
            { label: "Open orders", value: String(data.cards.openOrders) },
          ]
        : [],
    [data, session.business.currency],
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-fg-muted">
          <Clock3 className="h-4 w-4" aria-hidden />
          Live · {formatTime(new Date(now).toISOString())}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {staff && staff.length > 0 && (
            <Select
              value={filters.staffUserId ?? "all"}
              onChange={(e) => setFilters((f) => ({ ...f, staffUserId: e.target.value === "all" ? undefined : e.target.value }))}
              className="w-36"
              aria-label="Filter by staff"
            >
              <option value="all">All staff</option>
              {staff.map((s) => (
                <option key={s.userId} value={s.userId}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
          <Select
            value={filters.paymentMethod ?? "all"}
            onChange={(e) => setFilters((f) => ({ ...f, paymentMethod: e.target.value === "all" ? undefined : e.target.value }))}
            className="w-32"
            aria-label="Filter by payment method"
          >
            <option value="all">All methods</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_LABEL[m]}
              </option>
            ))}
          </Select>
          <Select
            value={filters.orderType ?? "all"}
            onChange={(e) => setFilters((f) => ({ ...f, orderType: e.target.value === "all" ? undefined : e.target.value }))}
            className="w-32"
            aria-label="Filter by order type"
          >
            <option value="all">All types</option>
            {ORDER_TYPES.map((t) => (
              <option key={t} value={t}>
                {ORDER_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {isError && (
        <Card>
          <CardContent>
            <ErrorBanner title="Couldn't load today's business" onRetry={() => refetch()} />
          </CardContent>
        </Card>
      )}

      {isPending && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <SkeletonRow />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            {cardsList.map((c) => (
              <Card key={c.label}>
                <CardContent className="p-4">
                  <p className="font-display text-lg font-bold tabular-nums text-fg">{c.value}</p>
                  <p className="text-xs text-fg-muted">{c.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Hourly revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <HourlyRevenueChart data={data.hourlyRevenue} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Payment method split</CardTitle>
              </CardHeader>
              <CardContent>
                <PaymentSplitDonut data={data.paymentMethodSplit} currency={session.business.currency} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Transactions today</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.transactions.length === 0 ? (
                <EmptyState icon={Clock3} title="No sales yet today" description="Ring up your first sale to see it here." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-fg-faint">
                        <th className="px-5 py-2 font-medium">Time</th>
                        <th className="px-5 py-2 font-medium">Item(s)</th>
                        <th className="px-5 py-2 font-medium">Staff</th>
                        <th className="px-5 py-2 font-medium">Method</th>
                        <th className="px-5 py-2 font-medium">Status</th>
                        <th className="px-5 py-2 text-end font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {data.transactions.map((t) => (
                        <tr key={t.id}>
                          <td className="px-5 py-2.5 text-fg-muted">{formatTime(t.time)}</td>
                          <td className="max-w-xs truncate px-5 py-2.5 text-fg">{t.items}</td>
                          <td className="px-5 py-2.5 text-fg-muted">{t.staffName ?? "—"}</td>
                          <td className="px-5 py-2.5 text-fg-muted">{t.method ? PAYMENT_LABEL[t.method] ?? t.method : "—"}</td>
                          <td className="px-5 py-2.5 text-fg-muted">{t.status}</td>
                          <td className="px-5 py-2.5 text-end font-medium tabular-nums text-fg">
                            {formatCurrency(t.amount, session.business.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function HourlyRevenueChart({ data }: { data: { hour: number; revenue: number }[] }) {
  const width = 560;
  const height = 140;
  const max = Math.max(...data.map((d) => d.revenue), 1);
  const points = data.map((d, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - (d.revenue / max) * height,
  }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Hourly revenue running total">
      <path d={areaPath} fill="var(--chart-1)" opacity={0.08} />
      <path d={linePath} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const METHOD_COLOR: Record<string, string> = {
  cash: "var(--chart-1)",
  card: "var(--chart-2)",
  online: "var(--chart-3)",
  credit: "var(--chart-4)",
};

function PaymentSplitDonut({ data, currency }: { data: { method: string; amount: number; count: number }[]; currency: string }) {
  if (data.length === 0) {
    return <p className="py-6 text-center text-sm text-fg-faint">No payments yet today.</p>;
  }
  const total = data.reduce((sum, d) => sum + d.amount, 0);
  return (
    <div className="flex flex-col gap-2">
      {data.map((d) => (
        <div key={d.method} className="flex items-center gap-2.5 text-sm">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: METHOD_COLOR[d.method] ?? "var(--chart-5)" }} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-fg">{PAYMENT_LABEL[d.method] ?? d.method}</span>
          <span className="font-medium tabular-nums text-fg">{formatCurrency(d.amount, currency)}</span>
          <span className="w-10 shrink-0 text-end text-xs tabular-nums text-fg-faint">
            {total > 0 ? Math.round((d.amount / total) * 100) : 0}%
          </span>
        </div>
      ))}
    </div>
  );
}
