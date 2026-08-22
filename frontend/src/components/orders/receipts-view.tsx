"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Receipt, Printer, Send, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { useSession } from "@/lib/session";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { fetchReceiptStats, fetchReceipts, resendReceipt, type LiveReceiptRow } from "@/lib/receipts-api";

export function ReceiptsView() {
  const session = useSession();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);

  const { data: stats } = useQuery({ queryKey: ["receipt-stats"], queryFn: fetchReceiptStats });
  const { data: rows, isPending, isError, refetch } = useQuery({
    queryKey: ["receipts", q],
    queryFn: () => fetchReceipts({ q: q.trim() || undefined }),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["receipts"] });
    queryClient.invalidateQueries({ queryKey: ["receipt-stats"] });
  }

  const resendMutation = useMutation({
    mutationFn: ({ id, channel }: { id: string; channel: "digital" | "print" }) => resendReceipt(id, channel),
    onSuccess: (result, { channel }) => {
      invalidate();
      if (channel === "print") window.open(result.url, "_blank", "noopener,noreferrer");
      else toast.success("Receipt resent to the customer.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't resend this receipt — please try again."),
  });

  const bulkMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected);
      await Promise.all(ids.map((id) => resendReceipt(id, "digital")));
      return ids.length;
    },
    onSuccess: (count) => {
      invalidate();
      toast.success(`Resent ${count} receipt(s).`);
      setSelected(new Set());
      setConfirmBulk(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't resend some receipts — please try again."),
  });

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by order # or phone…" className="w-64" leadingSlot={<Search className="h-4 w-4" aria-hidden />} />
        {selected.size > 0 && (
          <Button size="sm" onClick={() => setConfirmBulk(true)}>
            <Send className="h-3.5 w-3.5" aria-hidden />
            Resend {selected.size} selected
          </Button>
        )}
      </div>

      {stats && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-6 p-4">
            <div>
              <p className="font-display text-xl font-bold text-fg">{stats.digitalPercent}%</p>
              <p className="text-xs text-fg-muted">Sent digitally (30 days)</p>
            </div>
            <div className="text-sm text-fg-muted">
              {stats.digitalCount} digital · {stats.printedCount} printed
            </div>
          </CardContent>
        </Card>
      )}

      {isError && <ErrorBanner title="Couldn't load receipts" onRetry={() => refetch()} />}

      <Card>
        <CardContent className="p-0">
          {isPending && (
            <div className="flex flex-col gap-1 p-4">
              <SkeletonRow />
              <SkeletonRow />
            </div>
          )}
          {rows && rows.length === 0 && <EmptyState icon={Receipt} title="No sales found" description="Completed sales show up here — search by order # or phone." />}
          {rows && rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-fg-faint">
                    <th className="w-8 px-5 py-2" />
                    <th className="px-5 py-2 font-medium">Order #</th>
                    <th className="px-5 py-2 font-medium">Date</th>
                    <th className="px-5 py-2 font-medium">Customer</th>
                    <th className="px-5 py-2 text-end font-medium">Total</th>
                    <th className="px-5 py-2 font-medium">Last sent</th>
                    <th className="px-5 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => (
                    <ReceiptRow
                      key={row.id}
                      row={row}
                      currency={session.business.currency}
                      checked={selected.has(row.id)}
                      onToggle={() => toggleRow(row.id)}
                      onResend={(channel) => resendMutation.mutate({ id: row.id, channel })}
                      busy={resendMutation.isPending}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={confirmBulk}
        onClose={() => setConfirmBulk(false)}
        title={`Resend ${selected.size} receipt(s)?`}
        description="Each customer gets a fresh WhatsApp copy of their receipt."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmBulk(false)}>
              Cancel
            </Button>
            <Button onClick={() => bulkMutation.mutate()} disabled={bulkMutation.isPending}>
              {bulkMutation.isPending ? "Sending…" : "Resend"}
            </Button>
          </>
        }
      />
    </div>
  );
}

function ReceiptRow({
  row,
  currency,
  checked,
  onToggle,
  onResend,
  busy,
}: {
  row: LiveReceiptRow;
  currency: string;
  checked: boolean;
  onToggle: () => void;
  onResend: (channel: "digital" | "print") => void;
  busy: boolean;
}) {
  return (
    <tr>
      <td className="px-5 py-2.5">
        <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Select order #${row.orderNo}`} />
      </td>
      <td className="px-5 py-2.5 font-medium text-fg">#{row.orderNo}</td>
      <td className="px-5 py-2.5 text-fg-muted">{formatDate(row.createdAt)}</td>
      <td className="px-5 py-2.5 text-fg-muted">
        {row.customerName ?? "Walk-in"}
        {row.customerPhone && <span className="text-fg-faint"> · {row.customerPhone}</span>}
      </td>
      <td className="px-5 py-2.5 text-end tabular-nums text-fg">{formatCurrency(row.total, currency)}</td>
      <td className="px-5 py-2.5 text-fg-muted">
        {row.lastSentAt ? (
          <span className="flex items-center gap-1.5">
            {formatDate(row.lastSentAt)} {formatTime(row.lastSentAt)}
            <Badge tone={row.lastChannel === "digital" ? "primary" : "neutral"}>{row.lastChannel}</Badge>
          </span>
        ) : (
          "Never sent"
        )}
      </td>
      <td className="px-5 py-2.5 text-end">
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => onResend("print")} disabled={busy} aria-label="Reprint">
            <Printer className="h-3.5 w-3.5" aria-hidden />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onResend("digital")} disabled={busy} aria-label="Resend">
            <Send className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      </td>
    </tr>
  );
}
