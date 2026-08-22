"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Undo2, Check, X, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
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
import { approveReturn, createReturn, fetchReturns, rejectReturn, type LiveReturn, type ReturnStatus } from "@/lib/returns-api";
import { fetchSalesHistory, fetchSalesHistoryDetail, type LiveSalesHistoryRow } from "@/lib/sales-history-api";

const STATUS_TONE: Record<ReturnStatus, "warning" | "success" | "danger"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

export function ReturnsPanel({ currency }: { currency: string }) {
  const session = useSession();
  const isOwnerOrManager = session.user.role !== "staff";
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<ReturnStatus | "all">("pending");
  const [newReturnOpen, setNewReturnOpen] = useState(false);
  const [rejecting, setRejecting] = useState<LiveReturn | null>(null);

  const { data: returns, isPending, isError, refetch } = useQuery({
    queryKey: ["returns", statusFilter],
    queryFn: () => fetchReturns(statusFilter === "all" ? undefined : statusFilter),
  });

  function onMutationError(err: unknown) {
    toast.error(err instanceof ApiError ? err.message : "Couldn't update this return — please try again.");
  }

  const approveMutation = useMutation({
    mutationFn: approveReturn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["returns"] });
      toast.success("Return approved and refunded.");
    },
    onError: onMutationError,
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => rejectReturn(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["returns"] });
      toast.success("Return rejected.");
      setRejecting(null);
    },
    onError: onMutationError,
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ReturnStatus | "all")} className="w-40" aria-label="Filter by status">
          <option value="all">All returns</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </Select>
        <Button size="sm" onClick={() => setNewReturnOpen(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          New return
        </Button>
      </div>

      {isError && <ErrorBanner title="Couldn't load returns" onRetry={() => refetch()} />}

      {isPending && (
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <SkeletonRow />
            <SkeletonRow />
          </CardContent>
        </Card>
      )}

      {returns && returns.length === 0 && (
        <Card>
          <CardContent>
            <EmptyState icon={Undo2} title="No returns" description="Return and refund requests will show up here." />
          </CardContent>
        </Card>
      )}

      {returns && returns.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {returns.map((ret) => (
            <Card key={ret.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">
                    Order #{ret.orderNo} · {ret.customerName ?? "Walk-in"}
                  </p>
                  <p className="truncate text-xs text-fg-muted">{ret.reason}</p>
                  <p className="text-xs text-fg-faint">
                    {ret.itemsCount} item(s) · {ret.refundMethod.replace("_", " ")} ·{" "}
                    {formatDate(ret.createdAt)} {formatTime(ret.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="font-display text-base font-bold tabular-nums text-fg">{formatCurrency(ret.refundAmount, currency)}</p>
                  <Badge tone={STATUS_TONE[ret.status]}>{ret.status}</Badge>
                </div>
                {ret.status === "pending" && isOwnerOrManager && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button size="sm" onClick={() => approveMutation.mutate(ret.id)} disabled={approveMutation.isPending}>
                      <Check className="h-3.5 w-3.5" aria-hidden />
                      Approve
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setRejecting(ret)}>
                      <X className="h-3.5 w-3.5" aria-hidden />
                      Reject
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NewReturnDialog open={newReturnOpen} onClose={() => setNewReturnOpen(false)} currency={currency} />

      <Dialog
        open={rejecting != null}
        onClose={() => setRejecting(null)}
        title="Reject this return?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => rejecting && rejectMutation.mutate({ id: rejecting.id })} disabled={rejectMutation.isPending}>
              {rejectMutation.isPending ? "Rejecting…" : "Reject"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">The requester will need to raise a new return if this was a mistake.</p>
      </Dialog>
    </div>
  );
}

function NewReturnDialog({ open, onClose, currency }: { open: boolean; onClose: () => void; currency: string }) {
  const [orderQuery, setOrderQuery] = useState("");
  const [selected, setSelected] = useState<LiveSalesHistoryRow | null>(null);
  const [qtyByProduct, setQtyByProduct] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState<"cash" | "card" | "online" | "credit" | "store_credit">("cash");
  const queryClient = useQueryClient();

  const { data: sales } = useQuery({ queryKey: ["sales-history", {}], queryFn: () => fetchSalesHistory({}), enabled: open });
  const matches = useMemo(() => {
    if (!sales || !orderQuery.trim()) return [];
    return sales.filter((s) => String(s.orderNo).includes(orderQuery.trim())).slice(0, 8);
  }, [sales, orderQuery]);

  const { data: detail } = useQuery({
    queryKey: ["sales-history-detail", selected?.id],
    queryFn: () => fetchSalesHistoryDetail(selected!.id),
    enabled: selected != null,
  });
  const returnable = (detail?.order?.items ?? []).filter((i) => i.productId != null);

  const mutation = useMutation({
    mutationFn: () =>
      createReturn({
        orderId: selected!.id,
        reason: reason.trim(),
        refundMethod,
        items: returnable
          .filter((i) => (qtyByProduct[i.productId as string] ?? 0) > 0)
          .map((i) => ({ productId: i.productId as string, qty: qtyByProduct[i.productId as string] })),
      }),
    onSuccess: () => {
      toast.success("Return request submitted for approval.");
      queryClient.invalidateQueries({ queryKey: ["returns"] });
      handleClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't submit this return — please try again."),
  });

  function handleClose() {
    setOrderQuery("");
    setSelected(null);
    setQtyByProduct({});
    setReason("");
    setRefundMethod("cash");
    onClose();
  }

  const anySelected = returnable.some((i) => (qtyByProduct[i.productId as string] ?? 0) > 0);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="New return"
      footer={
        selected && (
          <>
            <Button variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={!anySelected || !reason.trim() || mutation.isPending}>
              {mutation.isPending ? "Submitting…" : "Submit request"}
            </Button>
          </>
        )
      }
    >
      {!selected ? (
        <div className="flex flex-col gap-2.5">
          <Input value={orderQuery} onChange={(e) => setOrderQuery(e.target.value)} placeholder="Type the sale's order number…" />
          {matches.length > 0 && (
            <div className="flex flex-col divide-y divide-border rounded-[var(--radius-sm)] border border-border">
              {matches.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelected(s)}
                  className="flex items-center justify-between px-3 py-2 text-start text-sm hover:bg-surface-2"
                >
                  <span className="text-fg">
                    #{s.orderNo} · {formatDate(s.createdAt)}
                  </span>
                  <span className="tabular-nums text-fg-muted">{formatCurrency(s.total, currency)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-fg-muted">
            Order #{selected.orderNo} — {formatCurrency(selected.total, currency)}
          </p>
          {returnable.length === 0 ? (
            <p className="text-sm text-fg-faint">No returnable line items on this sale.</p>
          ) : (
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
          )}
          <Select label="Refund method" value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as typeof refundMethod)}>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="online">Online</option>
            <option value="credit">Credit</option>
            <option value="store_credit">Store credit</option>
          </Select>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for return" />
        </div>
      )}
    </Dialog>
  );
}
