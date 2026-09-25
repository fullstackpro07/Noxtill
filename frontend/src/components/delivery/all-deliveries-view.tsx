"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { KpiGrid, DeliveryTableCard, StatusChip, LoadingBlock, type TableColumn } from "./delivery-ui";
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
import { formatTime } from "@/lib/format";
import { fetchRiders, VEHICLE_TYPE_LABELS } from "@/lib/riders-api";
import { assignDelivery } from "@/lib/deliveries-api";
import { invalidateDeliveryData } from "./delivery-actions";

const STATUS_TONE: Record<DeliveryStatus, "neutral" | "primary" | "success" | "danger"> = {
  unassigned: "neutral",
  assigned: "primary",
  picked_up: "primary",
  en_route: "primary",
  delivered: "success",
  failed: "danger",
};
const STATUS_CHIP: Record<DeliveryStatus, { bg: string; fg: string }> = {
  unassigned: { bg: "#FEF6E7", fg: "#B54708" },
  assigned: { bg: "#EEF4FF", fg: "#3538CD" },
  picked_up: { bg: "#EEF4FF", fg: "#3538CD" },
  en_route: { bg: "#EEF4FF", fg: "#3538CD" },
  delivered: { bg: "#E8F7EE", fg: "#0E8442" },
  failed: { bg: "#FEF3F2", fg: "#B42318" },
};

function paymentText(d: Delivery): { text: string; paid: boolean } {
  const total = Number(d.order?.total ?? 0);
  const paid = (d.order?.payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const isPaid = paid >= total && total > 0;
  return { text: `Rs. ${Math.round(total).toLocaleString("en-US")} · ${isPaid ? "paid" : "cash on delivery"}`, paid: isPaid };
}

export function AllDeliveriesView() {
  const params = useSearchParams();
  const initial = params.get("status");
  const openId = params.get("open");
  const [statusFilter, setStatusFilter] = useState<DeliveryStatus | "all">(
    initial && initial in DELIVERY_STATUS_LABELS ? (initial as DeliveryStatus) : "all",
  );
  const [selected, setSelected] = useState<Delivery | null>(null);
  const [dismissedOpen, setDismissedOpen] = useState(false);
  // Cards are counted over every delivery, never over the filtered rows, so a filter can't change them.
  const { data: all, isLoading } = useQuery({ queryKey: ["deliveries", "all"], queryFn: () => fetchDeliveries() });
  const data = useMemo(() => (all ? (statusFilter === "all" ? all : all.filter((d) => d.status === statusFilter)) : undefined), [all, statusFilter]);
  const { data: onTimeStats } = useQuery({ queryKey: ["deliveries-on-time-stats"], queryFn: fetchOnTimeStats });

  const kpis = useMemo(() => {
    const rows = all ?? [];
    const delivered = rows.filter((d) => d.status === "delivered").length;
    const failed = rows.filter((d) => d.status === "failed").length;
    const inProgress = rows.filter((d) => ["assigned", "picked_up", "en_route"].includes(d.status)).length;
    return [
      { l: "All deliveries", v: String(rows.length), sub: `${delivered} delivered`, color: "#0F172A", bd: "#E6EAF0" },
      { l: "In progress", v: String(inProgress), sub: "assigned, picked up or en route", color: "#0F172A", bd: "#E6EAF0" },
      { l: "On-time rate", v: onTimeStats?.onTimeRate != null ? `${onTimeStats.onTimeRate}%` : "Not enough data", sub: onTimeStats ? `${onTimeStats.sampleSize} with a real promise` : "", color: "#0F172A", bd: "#E6EAF0" },
      { l: "Failed", v: String(failed), sub: failed > 0 ? "see Exceptions" : "none recorded", color: failed > 0 ? "#B54708" : "#0F172A", bd: "#E6EAF0" },
    ];
  }, [all, onTimeStats]);

  const columns: TableColumn<Delivery>[] = [
    { label: "Delivery", render: (d) => <span style={{ fontWeight: 700, color: "#0E8442" }}>{d.order ? `DEL-${d.order.orderNo}` : "—"}</span> },
    { label: "Customer", render: (d) => <span style={{ fontWeight: 700, color: "#101828" }}>{d.order?.customer?.name ?? "Walk-in customer"}</span> },
    { label: "Zone", render: (d) => <span style={{ color: "#475467" }}>{d.zone?.name ?? "No zone"}</span> },
    { label: "Rider", render: (d) => <span style={{ color: d.rider ? "#475467" : "#B42318", fontWeight: d.rider ? 400 : 700 }}>{d.rider?.name ?? "Not assigned"}</span> },
    {
      label: "Status",
      render: (d) => {
        const c = STATUS_CHIP[d.status];
        return (
          <StatusChip bg={c.bg} fg={c.fg}>
            {DELIVERY_STATUS_LABELS[d.status]}
          </StatusChip>
        );
      },
    },
    { label: "Payment", render: (d) => <span style={{ color: "#475467" }}>{paymentText(d).text}</span> },
    { label: "Promised", align: "right", render: (d) => <span style={{ fontWeight: 700, color: "#101828" }}>{d.promisedAt ? formatTime(d.promisedAt) : "—"}</span> },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {(["all", "unassigned", "assigned", "picked_up", "en_route", "delivered", "failed"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              border: `1px solid ${statusFilter === s ? "#12A150" : "#E6EAF0"}`,
              background: statusFilter === s ? "#F7FCF9" : "#fff",
              color: statusFilter === s ? "#0E8442" : "#475467",
              borderRadius: "20px",
              padding: "7px 13px",
              fontSize: "12px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {s === "all" ? "All" : DELIVERY_STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {onTimeStats && onTimeStats.trend.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: "16px", padding: "16px" }}>
          <p style={{ margin: "0 0 8px", fontSize: "12px", fontWeight: 700, color: "#475467" }}>On-time rate, last 14 days</p>
          <OnTimeTrendChart trend={onTimeStats.trend} />
        </div>
      )}

      <KpiGrid kpis={kpis} minWidth={180} />

      {isLoading || !data ? (
        <LoadingBlock label="Loading deliveries…" />
      ) : (
        <DeliveryTableCard
          title="Every delivery"
          sub="Newest first"
          columns={columns}
          rows={data.map((d) => ({ ...d, i: d.id }))}
          footer="Promised time is the promise recorded when the rider was assigned (the zone or default SLA plus your ETA padding)."
          onRowClick={(d) => setSelected(d)}
          emptyTitle="No deliveries"
          emptySub="Nothing matches this filter."
        />
      )}

      <DeliveryDetailDialog
        delivery={selected ?? (!dismissedOpen && openId ? (all?.find((d) => d.id === openId) ?? null) : null)}
        onClose={() => {
          setSelected(null);
          setDismissedOpen(true);
        }}
      />
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

  const { data: riders } = useQuery({ queryKey: ["delivery-riders"], queryFn: fetchRiders });
  const [newRiderId, setNewRiderId] = useState("");
  const NEXT: Partial<Record<DeliveryStatus, { to: "picked_up" | "en_route" | "delivered"; label: string }>> = {
    assigned: { to: "picked_up", label: "Mark picked up" },
    picked_up: { to: "en_route", label: "Mark on the way" },
    en_route: { to: "delivered", label: "Mark delivered" },
  };
  const next = NEXT[delivery.status];
  const advanceMutation = useMutation({
    mutationFn: (to: "picked_up" | "en_route" | "delivered") => updateDeliveryStatus(delivery.id, to),
    onSuccess: () => {
      toast.success("Status updated.");
      invalidateDeliveryData(queryClient);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this delivery."),
  });
  const reassignMutation = useMutation({
    mutationFn: () => assignDelivery(delivery.id, newRiderId),
    onSuccess: () => {
      toast.success("Rider assigned.");
      invalidateDeliveryData(queryClient);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't assign this rider."),
  });
  const canReassign = delivery.status === "unassigned" || delivery.status === "assigned";
  const trackingUrl = delivery.trackingToken && typeof window !== "undefined" ? `${window.location.origin}/track/${delivery.trackingToken}` : null;

  return (
    <Dialog open onClose={onClose} title={delivery.order ? `DEL-${delivery.order.orderNo}` : "Delivery"} description={delivery.addressLine} className="max-w-lg">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Badge tone={STATUS_TONE[delivery.status]}>{DELIVERY_STATUS_LABELS[delivery.status]}</Badge>
          {delivery.rider && <span className="text-xs text-fg-muted">{delivery.rider.name}</span>}
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-fg-muted">
          <span>Delivery fee</span>
          <span className="text-right font-medium text-fg">{delivery.deliveryFee !== null ? `Rs. ${Math.round(Number(delivery.deliveryFee)).toLocaleString("en-US")}` : "Not quoted (no zone fee)"}</span>
          <span>Delivery cost</span>
          <span className="text-right font-medium text-fg">{delivery.deliveryCost !== null ? `Rs. ${Math.round(Number(delivery.deliveryCost)).toLocaleString("en-US")}` : "Not configured"}</span>
          <span>Distance from hub</span>
          <span className="text-right font-medium text-fg">{delivery.distanceKm !== null ? `${Number(delivery.distanceKm)} km` : "Unknown"}</span>
          <span>Customer message queued</span>
          <span className="text-right font-medium text-fg">{delivery.customerNotifiedAt ? formatTime(delivery.customerNotifiedAt) : "Not yet"}</span>
        </div>
        {delivery.deliveryNote && <div className="rounded-[var(--radius-sm)] bg-surface-2 px-3 py-2 text-sm text-fg">Note for the rider: {delivery.deliveryNote}</div>}
        {trackingUrl && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(trackingUrl);
              toast.success("Tracking link copied.");
            }}
          >
            Copy customer tracking link
          </Button>
        )}
        {next && (
          <Button size="sm" onClick={() => advanceMutation.mutate(next.to)} disabled={advanceMutation.isPending}>
            {advanceMutation.isPending ? "Saving…" : next.label}
          </Button>
        )}
        {canReassign && (
          <div className="flex items-end gap-2">
            <Select label={delivery.riderId ? "Give to a different rider" : "Assign a rider"} value={newRiderId} onChange={(e) => setNewRiderId(e.target.value)}>
              <option value="">Choose a rider…</option>
              {(riders ?? [])
                .filter((r) => r.status === "active" && r.id !== delivery.riderId)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {r.displayStatus} · {r.activeDeliveries} active{r.vehicleType ? ` · ${VEHICLE_TYPE_LABELS[r.vehicleType]}` : ""}
                  </option>
                ))}
            </Select>
            <Button size="sm" onClick={() => reassignMutation.mutate()} disabled={!newRiderId || reassignMutation.isPending}>
              Assign
            </Button>
          </div>
        )}

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
                  <button
                    key={n}
                    onClick={() => {
                      setRating(n);
                      rateMutation.mutate(n);
                    }}
                    aria-label={`Rate ${n} stars`}
                  >
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
            Delivered {delivery.deliveredAt ? formatTime(delivery.deliveredAt) : ""}
          </div>
        )}
      </div>
    </Dialog>
  );
}
