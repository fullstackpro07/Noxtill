"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Receipt, Send, DollarSign } from "lucide-react";
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
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import {
  fetchInvoiceSummary,
  fetchInvoices,
  recordInvoicePayment,
  remindAllInvoices,
  type InvoiceFilters,
  type InvoiceStatus,
  type LiveInvoiceRow,
} from "@/lib/invoices-api";

const STATUS_TONE: Record<InvoiceStatus, "success" | "warning" | "danger"> = {
  paid: "success",
  unpaid: "warning",
  overdue: "danger",
};

export function InvoicesView() {
  const session = useSession();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<InvoiceFilters>({});
  const [paying, setPaying] = useState<LiveInvoiceRow | null>(null);
  const [confirmRemind, setConfirmRemind] = useState(false);

  const { data: staff } = useQuery({ queryKey: ["staff-roster"], queryFn: fetchStaffList, staleTime: 5 * 60 * 1000 });
  const { data: rows, isPending, isError, refetch } = useQuery({
    queryKey: ["invoices", filters],
    queryFn: () => fetchInvoices(filters),
  });
  const { data: summary } = useQuery({
    queryKey: ["invoices-summary", filters.from, filters.to],
    queryFn: () => fetchInvoiceSummary({ from: filters.from, to: filters.to }),
  });

  const remindMutation = useMutation({
    mutationFn: remindAllInvoices,
    onSuccess: (result) => {
      toast.success(`Reminders sent to ${result.sent}, ${result.skipped} skipped.`);
      setConfirmRemind(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send reminders — please try again."),
  });

  function setFilter<K extends keyof InvoiceFilters>(key: K, value: InvoiceFilters[K]) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={filters.from ?? ""} onChange={(e) => setFilter("from", e.target.value || undefined)} className="w-40" aria-label="From date" />
          <Input type="date" value={filters.to ?? ""} onChange={(e) => setFilter("to", e.target.value || undefined)} className="w-40" aria-label="To date" />
          <Select value={filters.status ?? "all"} onChange={(e) => setFilter("status", e.target.value === "all" ? undefined : (e.target.value as InvoiceStatus))} className="w-32" aria-label="Filter by status">
            <option value="all">All statuses</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
            <option value="overdue">Overdue</option>
          </Select>
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
        </div>
        <Button size="sm" variant="outline" onClick={() => setConfirmRemind(true)}>
          <Send className="h-3.5 w-3.5" aria-hidden />
          Send reminders
        </Button>
      </div>

      {summary && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Paid" value={summary.counts.paid} amount={summary.totals.paid} currency={session.business.currency} tone="text-whatsapp" />
          <StatCard label="Unpaid" value={summary.counts.unpaid} amount={summary.totals.unpaid} currency={session.business.currency} tone="text-accent" />
          <StatCard label="Overdue" value={summary.counts.overdue} amount={summary.totals.overdue} currency={session.business.currency} tone="text-destructive" />
        </div>
      )}

      {summary && summary.trend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Paid vs. unpaid</CardTitle>
          </CardHeader>
          <CardContent>
            <PaidUnpaidTrend data={summary.trend} />
          </CardContent>
        </Card>
      )}

      {isError && <ErrorBanner title="Couldn't load invoices" onRetry={() => refetch()} />}

      <Card>
        <CardContent className="p-0">
          {isPending && (
            <div className="flex flex-col gap-1 p-4">
              <SkeletonRow />
              <SkeletonRow />
            </div>
          )}
          {rows && rows.length === 0 && <EmptyState icon={Receipt} title="No invoices match these filters" />}
          {rows && rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-fg-faint">
                    <th className="px-5 py-2 font-medium">Order #</th>
                    <th className="px-5 py-2 font-medium">Date</th>
                    <th className="px-5 py-2 font-medium">Customer</th>
                    <th className="px-5 py-2 font-medium">Staff</th>
                    <th className="px-5 py-2 text-end font-medium">Total</th>
                    <th className="px-5 py-2 text-end font-medium">Paid</th>
                    <th className="px-5 py-2 text-end font-medium">Due</th>
                    <th className="px-5 py-2 font-medium">Status</th>
                    <th className="px-5 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-5 py-2.5 font-medium text-fg">#{row.orderNo}</td>
                      <td className="px-5 py-2.5 text-fg-muted">{formatDate(row.createdAt)}</td>
                      <td className="px-5 py-2.5 text-fg-muted">{row.customerName ?? "Walk-in"}</td>
                      <td className="px-5 py-2.5 text-fg-muted">{row.staffName ?? "—"}</td>
                      <td className="px-5 py-2.5 text-end tabular-nums text-fg">{formatCurrency(row.total, session.business.currency)}</td>
                      <td className="px-5 py-2.5 text-end tabular-nums text-fg-muted">{formatCurrency(row.amountPaid, session.business.currency)}</td>
                      <td className="px-5 py-2.5 text-end font-medium tabular-nums text-fg">{formatCurrency(row.amountDue, session.business.currency)}</td>
                      <td className="px-5 py-2.5">
                        <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge>
                      </td>
                      <td className="px-5 py-2.5 text-end">
                        {row.status !== "paid" && (
                          <Button variant="ghost" size="sm" onClick={() => setPaying(row)}>
                            <DollarSign className="h-3.5 w-3.5" aria-hidden />
                            Record payment
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <RecordPaymentDialog
        row={paying}
        onClose={() => setPaying(null)}
        currency={session.business.currency}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["invoices"] })}
      />

      <Dialog
        open={confirmRemind}
        onClose={() => setConfirmRemind(false)}
        title="Send payment reminders?"
        description="A WhatsApp reminder is sent to every customer with a real unpaid or overdue invoice — opted-out customers are skipped automatically."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRemind(false)}>
              Cancel
            </Button>
            <Button onClick={() => remindMutation.mutate()} disabled={remindMutation.isPending}>
              {remindMutation.isPending ? "Sending…" : "Send reminders"}
            </Button>
          </>
        }
      />
    </div>
  );
}

function StatCard({ label, value, amount, currency, tone }: { label: string; value: number; amount: number; currency: string; tone: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className={`font-display text-xl font-bold tabular-nums ${tone}`}>{value}</p>
        <p className="text-xs text-fg-muted">{label}</p>
        <p className="mt-1 text-sm font-medium tabular-nums text-fg">{formatCurrency(amount, currency)}</p>
      </CardContent>
    </Card>
  );
}

function PaidUnpaidTrend({ data }: { data: { date: string; paidAmount: number; unpaidAmount: number }[] }) {
  const width = 560;
  const height = 140;
  const max = Math.max(...data.map((d) => d.paidAmount + d.unpaidAmount), 1);
  const barWidth = data.length > 0 ? width / data.length : width;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Paid vs unpaid amount by day">
      {data.map((d, i) => {
        const paidH = (d.paidAmount / max) * height;
        const unpaidH = (d.unpaidAmount / max) * height;
        const x = i * barWidth + barWidth * 0.15;
        const w = barWidth * 0.7;
        return (
          <g key={d.date}>
            <rect x={x} y={height - paidH} width={w} height={paidH} fill="var(--chart-1)" opacity={0.85} />
            <rect x={x} y={height - paidH - unpaidH} width={w} height={unpaidH} fill="var(--chart-4)" opacity={0.7} />
          </g>
        );
      })}
    </svg>
  );
}

function RecordPaymentDialog({
  row,
  onClose,
  currency,
  onSuccess,
}: {
  row: LiveInvoiceRow | null;
  onClose: () => void;
  currency: string;
  onSuccess: () => void;
}) {
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
    <Dialog
      open={row != null}
      onClose={onClose}
      title="Record a payment"
      description={row ? `Order #${row.orderNo} — ${formatCurrency(row.amountDue, currency)} due` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!amount || Number(amount) <= 0 || mutation.isPending}>
            {mutation.isPending ? "Recording…" : "Record payment"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Input label="Amount" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Select label="Method" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="online">Online</option>
        </Select>
      </div>
    </Dialog>
  );
}
