"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileEdit, Play, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { convertDraftOrder, deleteDraftOrder, fetchDraftOrders } from "@/lib/draft-orders-api";
import type { LiveOrder } from "@/lib/orders-api";

type PaymentMethod = "cash" | "card" | "online" | "credit";
const PAYMENT_METHODS: { key: PaymentMethod; label: string }[] = [
  { key: "cash", label: "Cash" },
  { key: "card", label: "Card" },
  { key: "online", label: "Online" },
  { key: "credit", label: "Credit" },
];

export function DraftOrdersPanel({ currency }: { currency: string }) {
  const queryClient = useQueryClient();
  const [converting, setConverting] = useState<LiveOrder | null>(null);
  const [deleting, setDeleting] = useState<LiveOrder | null>(null);

  const { data: drafts, isPending, isError, refetch } = useQuery({
    queryKey: ["draft-orders"],
    queryFn: fetchDraftOrders,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDraftOrder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["draft-orders"] });
      toast.success("Draft deleted.");
      setDeleting(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't delete this draft — please try again."),
  });

  if (isError) {
    return <ErrorBanner title="Couldn't load draft orders" description="Check your connection and try again." onRetry={() => refetch()} />;
  }

  if (isPending) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-1 p-4">
          <SkeletonRow />
          <SkeletonRow />
        </CardContent>
      </Card>
    );
  }

  if (drafts.length === 0) {
    return <EmptyState icon={FileEdit} title="No draft orders" description="Orders saved as drafts before checkout will show up here." />;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {drafts.map((draft) => (
        <Card key={draft.id}>
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-fg">
                Draft #{draft.orderNo} · {draft.customerName}
              </p>
              <p className="truncate text-xs text-fg-muted">
                {draft.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}
              </p>
              <p className="text-xs text-fg-faint">
                {formatDate(draft.createdAt)} {formatTime(draft.createdAt)}
              </p>
            </div>
            <p className="font-display text-base font-bold tabular-nums text-fg">{formatCurrency(draft.total, currency)}</p>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button size="sm" onClick={() => setConverting(draft)}>
                <Play className="h-3.5 w-3.5" aria-hidden />
                Convert
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDeleting(draft)} aria-label="Delete draft">
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <ConvertDialog draft={converting} onClose={() => setConverting(null)} currency={currency} />

      <Dialog
        open={deleting != null}
        onClose={() => setDeleting(null)}
        title="Delete this draft?"
        description="This can't be undone — the draft order is cancelled permanently."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => deleting && deleteMutation.mutate(deleting.id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </>
        }
      />
    </div>
  );
}

function ConvertDialog({ draft, onClose, currency }: { draft: LiveOrder | null; onClose: () => void; currency: string }) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (id: string) => convertDraftOrder(id, method),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["draft-orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success(`Sale #${order.orderNo} recorded — ${formatCurrency(order.total, currency)} via ${method}.`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't convert this draft — please try again."),
  });

  return (
    <Dialog
      open={draft != null}
      onClose={onClose}
      title="Convert draft to a sale"
      description={draft ? `Total: ${formatCurrency(draft.total, currency)}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => draft && mutation.mutate(draft.id)} disabled={mutation.isPending}>
            {mutation.isPending ? "Confirming…" : "Confirm sale"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-4 gap-1.5">
        {PAYMENT_METHODS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMethod(m.key)}
            className={`rounded-[var(--radius-sm)] border px-2 py-2 text-xs font-medium transition-colors ${
              method === m.key ? "border-primary bg-primary/8 text-primary" : "border-border text-fg-muted hover:bg-surface-2"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
    </Dialog>
  );
}
