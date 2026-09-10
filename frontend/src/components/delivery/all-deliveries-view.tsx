"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, Star, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { EmptyState } from "@/components/shared/empty-state";
import {
  fetchDeliveries,
  fetchDeliveryProof,
  fetchOnTimeStats,
  updateDeliveryStatus,
  rateDelivery,
  DELIVERY_STATUS_LABELS,
  DELIVERY_FAILURE_REASONS,
  type Delivery,
  type DeliveryStatus,
} from "@/lib/deliveries-api";
import { OnTimeTrendChart } from "@/components/delivery/on-time-trend-chart";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { formatDate, formatTime } from "@/lib/format";

const STATUS_TONE: Record<DeliveryStatus, "neutral" | "primary" | "success" | "danger"> = {
  unassigned: "neutral",
  assigned: "primary",
  picked_up: "primary",
  en_route: "primary",
  delivered: "success",
  failed: "danger",
};

const STATUS_FILTERS: (DeliveryStatus | "all")[] = ["all", "unassigned", "assigned", "picked_up", "en_route", "delivered", "failed"];

export function AllDeliveriesView() {
  const [statusFilter, setStatusFilter] = useState<DeliveryStatus | "all">("all");
  const [selected, setSelected] = useState<Delivery | null>(null);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["deliveries", statusFilter],
    queryFn: () => fetchDeliveries(statusFilter === "all" ? undefined : statusFilter),
  });
  const { data: onTimeStats } = useQuery({ queryKey: ["deliveries-on-time-stats"], queryFn: fetchOnTimeStats });

  const total = data?.length ?? 0;
  const delivered = data?.filter((d) => d.status === "delivered").length ?? 0;
  const failed = data?.filter((d) => d.status === "failed").length ?? 0;
  const successRate = delivered + failed > 0 ? Math.round((delivered / (delivered + failed)) * 100) : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-fg">All Deliveries</h1>
        <p className="mt-0.5 text-sm text-fg-muted">Every delivery, with real outcomes and a real on-time rate measured against each business&apos;s configured delivery SLA.</p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
          <p className="text-xs text-fg-faint">Total</p>
          <p className="font-display text-xl font-bold text-fg">{total}</p>
        </div>
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
          <p className="text-xs text-fg-faint">Delivered</p>
          <p className="font-display text-xl font-bold text-fg">{delivered}</p>
        </div>
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
          <p className="text-xs text-fg-faint">Success rate</p>
          <p className="font-display text-xl font-bold text-fg">{successRate != null ? `${successRate}%` : "—"}</p>
        </div>
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
          <p className="text-xs text-fg-faint">On-time rate</p>
          <p className="font-display text-xl font-bold text-fg">{onTimeStats?.onTimeRate != null ? `${onTimeStats.onTimeRate}%` : "—"}</p>
          {onTimeStats && onTimeStats.sampleSize === 0 && <p className="mt-0.5 text-[11px] text-fg-faint">No promised deliveries yet</p>}
        </div>
      </div>

      {onTimeStats && onTimeStats.trend.length > 0 && (
        <div className="mb-4 rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
          <p className="mb-2 text-xs font-medium text-fg-muted">On-time rate, last 14 days</p>
          <OnTimeTrendChart trend={onTimeStats.trend} />
        </div>
      )}

      <div className="mb-4 flex gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
              statusFilter === s ? "border-primary bg-primary/10 text-primary" : "border-border-strong text-fg hover:bg-surface-2"
            }`}
          >
            {s === "all" ? "All" : DELIVERY_STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load deliveries" onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState icon={Package} title="No deliveries" description="Nothing matches this filter." />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-fg-faint">
                <th className="px-4 py-2 font-medium">Order</th>
                <th className="px-4 py-2 font-medium">Address</th>
                <th className="px-4 py-2 font-medium">Rider</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.id} onClick={() => setSelected(d)} className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-2 font-medium text-fg">#{d.order?.orderNo ?? "—"}</td>
                  <td className="max-w-[220px] truncate px-4 py-2 text-fg-muted">{d.addressLine}</td>
                  <td className="px-4 py-2 text-fg-muted">{d.rider?.name ?? "—"}</td>
                  <td className="px-4 py-2">
                    <Badge tone={STATUS_TONE[d.status]}>{DELIVERY_STATUS_LABELS[d.status]}</Badge>
                  </td>
                  <td className="px-4 py-2 text-xs text-fg-faint">
                    {formatDate(d.createdAt)} · {formatTime(d.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DeliveryDetailDialog delivery={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function DeliveryDetailDialog({ delivery, onClose }: { delivery: Delivery | null; onClose: () => void }) {
  return delivery ? <DeliveryDetailDialogBody delivery={delivery} onClose={onClose} /> : null;
}

function DeliveryDetailDialogBody({ delivery, onClose }: { delivery: Delivery; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [failureReason, setFailureReason] = useState(DELIVERY_FAILURE_REASONS[0]);
  const [customReason, setCustomReason] = useState("");
  const [rating, setRating] = useState(delivery.qualityRating ?? 0);

  const { data: proof } = useQuery({
    queryKey: ["delivery-proof", delivery.id],
    queryFn: () => fetchDeliveryProof(delivery.id),
    enabled: delivery.status === "delivered",
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["deliveries"] });

  const failMutation = useMutation({
    mutationFn: () => updateDeliveryStatus(delivery.id, "failed", customReason.trim() || failureReason),
    onSuccess: () => {
      toast.success("Marked as failed.");
      invalidate();
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this delivery."),
  });

  const rateMutation = useMutation({
    mutationFn: (value: number) => rateDelivery(delivery.id, value),
    onSuccess: () => {
      toast.success("Rating saved.");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this rating."),
  });

  const canFail = !["delivered", "failed"].includes(delivery.status);

  return (
    <Dialog open onClose={onClose} title={`Order #${delivery.order?.orderNo ?? ""}`} description={delivery.addressLine} className="max-w-lg">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Badge tone={STATUS_TONE[delivery.status]}>{DELIVERY_STATUS_LABELS[delivery.status]}</Badge>
          {delivery.rider && <span className="text-xs text-fg-muted">{delivery.rider.name}</span>}
        </div>

        {delivery.status === "failed" && delivery.failureReason && (
          <div className="rounded-[var(--radius-sm)] bg-destructive/6 px-3 py-2 text-sm text-destructive">{delivery.failureReason}</div>
        )}

        {delivery.status === "delivered" && (
          <>
            {proof?.submitted && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-fg-muted">Proof of delivery</p>
                <div className="flex gap-2">
                  {proof.signatureUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proof.signatureUrl} alt="Signature" className="h-20 rounded-[var(--radius-sm)] border border-border bg-white" />
                  )}
                  {proof.photoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proof.photoUrl} alt="Delivery photo" className="h-20 w-20 rounded-[var(--radius-sm)] border border-border object-cover" />
                  )}
                </div>
              </div>
            )}
            <div>
              <p className="mb-1.5 text-xs font-medium text-fg-muted">Delivery quality rating (staff-recorded)</p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => { setRating(n); rateMutation.mutate(n); }} aria-label={`Rate ${n} stars`}>
                    <Star className={`h-6 w-6 ${n <= rating ? "fill-accent text-accent" : "text-fg-faint"}`} aria-hidden />
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {canFail && (
          <div className="border-t border-border pt-3">
            <p className="mb-1.5 text-xs font-medium text-fg-muted">Mark as failed</p>
            <div className="flex flex-col gap-2">
              <Select value={failureReason} onChange={(e) => setFailureReason(e.target.value)}>
                {DELIVERY_FAILURE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
              <Input value={customReason} onChange={(e) => setCustomReason(e.target.value)} placeholder="Or type a custom reason…" />
              <Button variant="destructive" size="sm" onClick={() => failMutation.mutate()} disabled={failMutation.isPending}>
                {failMutation.isPending ? "Saving…" : "Mark failed"}
              </Button>
            </div>
          </div>
        )}

        {delivery.status === "delivered" && (
          <div className="flex items-center gap-1.5 text-xs text-whatsapp">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            Delivered {delivery.deliveredAt ? `${formatDate(delivery.deliveredAt)} · ${formatTime(delivery.deliveredAt)}` : ""}
          </div>
        )}
      </div>
    </Dialog>
  );
}
