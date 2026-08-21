"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Receipt, Printer, Send, Undo2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { useSession } from "@/lib/session";
import { fetchStaffList } from "@/lib/staff-api";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { generateInvoice } from "@/lib/orders-api";
import type { LivePaymentMethod } from "@/lib/orders-api";
import { createReturn } from "@/lib/returns-api";
import {
  fetchSalesHistory,
  fetchSalesHistoryDetail,
  fetchSalesHistorySummary,
  type SalesHistoryFilters,
} from "@/lib/sales-history-api";

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

export function SalesHistoryView() {
  const session = useSession();
  const [filters, setFilters] = useState<SalesHistoryFilters>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: staff } = useQuery({ queryKey: ["staff-roster"], queryFn: fetchStaffList, staleTime: 5 * 60 * 1000 });
  const { data: rows, isPending, isError, refetch } = useQuery({
    queryKey: ["sales-history", filters],
    queryFn: () => fetchSalesHistory(filters),
  });
  const { data: summary } = useQuery({
    queryKey: ["sales-history-summary", filters.from, filters.to],
    queryFn: () => fetchSalesHistorySummary({ from: filters.from, to: filters.to }),
  });

  function setFilter<K extends keyof SalesHistoryFilters>(key: K, value: SalesHistoryFilters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Input type="date" value={filters.from ?? ""} onChange={(e) => setFilter("from", e.target.value || undefined)} className="w-40" aria-label="From date" />
        <Input type="date" value={filters.to ?? ""} onChange={(e) => setFilter("to", e.target.value || undefined)} className="w-40" aria-label="To date" />
        {staff && staff.length > 0 && (
          <Select value={filters.staffUserId ?? "all"} onChange={(e) => setFilter("staffUserId", e.target.value === "all" ? undefined : e.target.value)} className="w-36" aria-label="Filter by staff">
            <option value="all">All staff</option>
            {staff.map((s) => (
              <option key={s.userId} value={s.userId}>
                {s.name}
              </option>
            ))}
          </Select>
        )}
        <Select value={filters.paymentMethod ?? "all"} onChange={(e) => setFilter("paymentMethod", e.target.value === "all" ? undefined : (e.target.value as LivePaymentMethod))} className="w-32" aria-label="Filter by payment method">
          <option value="all">All methods</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_LABEL[m]}
            </option>
          ))}
        </Select>
        <Select value={filters.orderType ?? "all"} onChange={(e) => setFilter("orderType", e.target.value === "all" ? undefined : e.target.value)} className="w-32" aria-label="Filter by order type">
          <option value="all">All types</option>
          {ORDER_TYPES.map((t) => (
            <option key={t} value={t}>
              {ORDER_TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
        <Input type="number" min={0} value={filters.minAmount ?? ""} onChange={(e) => setFilter("minAmount", e.target.value ? Number(e.target.value) : undefined)} placeholder="Min amount" className="w-28" />
        <Input type="number" min={0} value={filters.maxAmount ?? ""} onChange={(e) => setFilter("maxAmount", e.target.value ? Number(e.target.value) : undefined)} placeholder="Max amount" className="w-28" />
      </div>

      {summary && summary.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Daily revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <DailyRevenueChart data={summary} />
          </CardContent>
        </Card>
      )}

      {isError && <ErrorBanner title="Couldn't load sales history" onRetry={() => refetch()} />}

      <Card>
        <CardContent className="p-0">
          {isPending && (
            <div className="flex flex-col gap-1 p-4">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          )}
          {rows && rows.length === 0 && (
            <EmptyState icon={Receipt} title="No sales match these filters" description="Completed and cancelled sales show up here." />
          )}
          {rows && rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-fg-faint">
                    <th className="px-5 py-2 font-medium">Sale #</th>
                    <th className="px-5 py-2 font-medium">Date</th>
                    <th className="px-5 py-2 font-medium">Items</th>
                    <th className="px-5 py-2 font-medium">Staff</th>
                    <th className="px-5 py-2 font-medium">Method</th>
                    <th className="px-5 py-2 text-end font-medium">Discount</th>
                    <th className="px-5 py-2 text-end font-medium">Total</th>
                    <th className="px-5 py-2 text-end font-medium">Profit</th>
                    <th className="px-5 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => (
                    <tr key={row.id} onClick={() => setSelectedId(row.id)} className="cursor-pointer hover:bg-surface-2/40">
                      <td className="px-5 py-2.5 font-medium text-fg">#{row.orderNo}</td>
                      <td className="px-5 py-2.5 text-fg-muted">
                        {formatDate(row.createdAt)} {formatTime(row.createdAt)}
                      </td>
                      <td className="px-5 py-2.5 text-fg-muted">{row.itemsCount}</td>
                      <td className="px-5 py-2.5 text-fg-muted">{row.staffName ?? "—"}</td>
                      <td className="px-5 py-2.5 text-fg-muted">{row.method ? PAYMENT_LABEL[row.method] ?? row.method : "—"}</td>
                      <td className="px-5 py-2.5 text-end tabular-nums text-fg-muted">{formatCurrency(row.discount, session.business.currency)}</td>
                      <td className="px-5 py-2.5 text-end font-medium tabular-nums text-fg">{formatCurrency(row.total, session.business.currency)}</td>
                      <td className="px-5 py-2.5 text-end tabular-nums text-whatsapp">{formatCurrency(row.profit, session.business.currency)}</td>
                      <td className="px-5 py-2.5">
                        <Badge tone={row.status === "completed" ? "success" : "danger"}>{row.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <SaleDetailDialog id={selectedId} onClose={() => setSelectedId(null)} currency={session.business.currency} />
    </div>
  );
}

function DailyRevenueChart({ data }: { data: { date: string; revenue: number }[] }) {
  const width = 560;
  const height = 140;
  const max = Math.max(...data.map((d) => d.revenue), 1);
  const points = data.map((d, i) => ({
    x: data.length > 1 ? (i / (data.length - 1)) * width : width / 2,
    y: height - (d.revenue / max) * height,
  }));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Daily revenue">
      <path d={areaPath} fill="var(--chart-1)" opacity={0.08} />
      <path d={linePath} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SaleDetailDialog({ id, onClose, currency }: { id: string | null; onClose: () => void; currency: string }) {
  const { data, isPending } = useQuery({
    queryKey: ["sales-history-detail", id],
    queryFn: () => fetchSalesHistoryDetail(id as string),
    enabled: id != null,
  });
  const [refundOpen, setRefundOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<"reprint" | "resend" | null>(null);

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

  const order = data?.order;

  return (
    <Dialog
      open={id != null}
      onClose={onClose}
      title={order ? `Sale #${order.orderNo}` : "Sale detail"}
      footer={
        order && (
          <>
            <Button variant="outline" size="sm" onClick={handleReprint} disabled={busyAction != null}>
              <Printer className="h-3.5 w-3.5" aria-hidden />
              {busyAction === "reprint" ? "Preparing…" : "Reprint"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleResend} disabled={busyAction != null}>
              <Send className="h-3.5 w-3.5" aria-hidden />
              {busyAction === "resend" ? "Sending…" : "Resend receipt"}
            </Button>
            {order.status === "completed" && (
              <Button variant="ghost" size="sm" onClick={() => setRefundOpen(true)}>
                <Undo2 className="h-3.5 w-3.5" aria-hidden />
                Request refund
              </Button>
            )}
          </>
        )
      }
      className="max-w-lg"
    >
      {isPending && <SkeletonRow />}
      {order && (
        <div className="flex flex-col gap-4 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <p className="text-fg-muted">Date</p>
            <p className="text-end text-fg">
              {formatDate(order.createdAt)} {formatTime(order.createdAt)}
            </p>
            <p className="text-fg-muted">Staff</p>
            <p className="text-end text-fg">{order.staffName ?? "—"}</p>
            <p className="text-fg-muted">Customer</p>
            <p className="text-end text-fg">{order.customer?.name ?? "Walk-in"}</p>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-fg-faint">Items (cost snapshot)</p>
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-xs text-fg-faint">
                  <th className="py-1 font-medium">Item</th>
                  <th className="py-1 text-end font-medium">Qty</th>
                  <th className="py-1 text-end font-medium">Price</th>
                  <th className="py-1 text-end font-medium">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {order.items.map((item, i) => (
                  <tr key={i}>
                    <td className="py-1.5 text-fg">{item.name}</td>
                    <td className="py-1.5 text-end tabular-nums text-fg-muted">{item.qty}</td>
                    <td className="py-1.5 text-end tabular-nums text-fg-muted">{formatCurrency(item.price, currency)}</td>
                    <td className="py-1.5 text-end tabular-nums text-fg-faint">{formatCurrency(item.cost, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
            <p className="text-fg-muted">Subtotal</p>
            <p className="text-end tabular-nums text-fg">{formatCurrency(order.subtotal, currency)}</p>
            <p className="text-fg-muted">Discount</p>
            <p className="text-end tabular-nums text-fg">{formatCurrency(order.discount, currency)}</p>
            <p className="text-fg-muted">Tax</p>
            <p className="text-end tabular-nums text-fg">{formatCurrency(order.tax, currency)}</p>
            <p className="font-medium text-fg">Total</p>
            <p className="text-end font-medium tabular-nums text-fg">{formatCurrency(order.total, currency)}</p>
          </div>

          {data && data.auditTrail.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-fg-faint">Audit trail</p>
              <ul className="flex flex-col gap-1">
                {data.auditTrail.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between text-xs text-fg-muted">
                    <span>{entry.action}</span>
                    <span>
                      {formatDate(entry.createdAt)} {formatTime(entry.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {order && (
        <RefundDialog
          open={refundOpen}
          onClose={() => setRefundOpen(false)}
          orderId={order.id}
          items={order.items}
          currency={currency}
        />
      )}
    </Dialog>
  );
}

function RefundDialog({
  open,
  onClose,
  orderId,
  items,
  currency,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  items: { productId: string | null; name: string; price: number; qty: number }[];
  currency: string;
}) {
  const returnable = items.filter((i) => i.productId != null);
  const [qtyByProduct, setQtyByProduct] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState<"cash" | "card" | "online" | "credit" | "store_credit">("cash");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      createReturn({
        orderId,
        reason: reason.trim(),
        refundMethod,
        items: returnable
          .filter((i) => (qtyByProduct[i.productId as string] ?? 0) > 0)
          .map((i) => ({ productId: i.productId as string, qty: qtyByProduct[i.productId as string] })),
      }),
    onSuccess: () => {
      toast.success("Refund request submitted for approval.");
      queryClient.invalidateQueries({ queryKey: ["sales-history"] });
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't submit this refund request — please try again."),
  });

  const anySelected = returnable.some((i) => (qtyByProduct[i.productId as string] ?? 0) > 0);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Request a refund"
      description="This creates a pending return — an owner or manager with return-approval access still needs to approve it before anything is refunded."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!anySelected || !reason.trim() || mutation.isPending}>
            {mutation.isPending ? "Submitting…" : "Submit request"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          {returnable.map((item) => (
            <div key={item.productId} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm text-fg">{item.name}</span>
              <span className="text-xs text-fg-faint">{formatCurrency(item.price, currency)} each</span>
              <Input
                type="number"
                min={0}
                max={item.qty}
                value={qtyByProduct[item.productId as string] ?? 0}
                onChange={(e) =>
                  setQtyByProduct((q) => ({ ...q, [item.productId as string]: Math.min(item.qty, Math.max(0, Number(e.target.value))) }))
                }
                className="w-20"
              />
            </div>
          ))}
        </div>
        <Select label="Refund method" value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as typeof refundMethod)}>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="online">Online</option>
          <option value="credit">Credit</option>
          <option value="store_credit">Store credit</option>
        </Select>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for return" />
      </div>
    </Dialog>
  );
}
