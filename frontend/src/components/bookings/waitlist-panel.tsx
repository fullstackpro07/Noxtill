"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Hourglass, Send, Check, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { formatDate, formatTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import {
  fetchWaitlist,
  offerWaitlistSlot,
  cancelWaitlistEntry,
  type WaitlistEntry,
  type WaitlistStatus,
} from "@/lib/waitlist-api";

const STATUS_TONE: Record<WaitlistStatus, "primary" | "success" | "neutral" | "danger" | "warning"> = {
  waiting: "neutral",
  offered: "primary",
  booked: "success",
  expired: "warning",
  cancelled: "danger",
};

const HOLD_HOURS = 24;

/** No backend field tracks "when this was offered" separately from `createdAt`, so this uses
 * `createdAt` as the hold-clock start — an honest approximation, not a stored expiry. Mirrors the
 * backend's own documented `WAITLIST_OFFER_HOLD_HOURS` constant. */
function isExpiredOffer(entry: WaitlistEntry): boolean {
  if (entry.status !== "offered") return false;
  return Date.now() - new Date(entry.createdAt).getTime() > HOLD_HOURS * 60 * 60 * 1000;
}

export function WaitlistPanel() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<WaitlistStatus | "">("");
  const [offering, setOffering] = useState<WaitlistEntry | null>(null);

  const { data: entries, isPending, isError, refetch } = useQuery({
    queryKey: ["waitlist", statusFilter],
    queryFn: () => fetchWaitlist(statusFilter || undefined),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelWaitlistEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["waitlist"] });
      toast.success("Waitlist entry cancelled.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't cancel this entry."),
  });

  const clearExpiredMutation = useMutation({
    mutationFn: async () => {
      const stale = (entries ?? []).filter((e) => e.status === "offered" && Date.now() - new Date(e.createdAt).getTime() > HOLD_HOURS * 60 * 60 * 1000);
      await Promise.all(stale.map((e) => cancelWaitlistEntry(e.id)));
      return stale.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["waitlist"] });
      toast.success(count > 0 ? `Cleared ${count} expired offer(s).` : "No expired offers to clear.");
    },
    onError: () => toast.error("Couldn't clear expired offers."),
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as WaitlistStatus | "")} className="w-44">
          <option value="">All statuses</option>
          <option value="waiting">Waiting</option>
          <option value="offered">Offered</option>
          <option value="booked">Booked</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
        </Select>
        <Button variant="outline" size="sm" onClick={() => clearExpiredMutation.mutate()} disabled={clearExpiredMutation.isPending}>
          {clearExpiredMutation.isPending ? "Clearing…" : "Clear expired"}
        </Button>
      </div>

      {isError && <ErrorBanner title="Couldn't load the waiting list" onRetry={() => refetch()} />}

      {isPending && (
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <SkeletonRow />
            <SkeletonRow />
          </CardContent>
        </Card>
      )}

      {entries && entries.length === 0 && (
        <Card>
          <CardContent>
            <EmptyState icon={Hourglass} title="No one on the waiting list" description="Customers waiting for a freed-up slot show up here." />
          </CardContent>
        </Card>
      )}

      {entries && entries.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {entries.map((e) => (
            <Card key={e.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-fg">{e.customerName}</p>
                    <Badge tone={STATUS_TONE[e.status]}>{isExpiredOffer(e) ? "expired" : e.status}</Badge>
                  </div>
                  <p className="truncate text-xs text-fg-muted">
                    {e.serviceName}
                    {e.offeredStartsAt ? ` · offered ${formatDate(e.offeredStartsAt)} ${formatTime(e.offeredStartsAt)}` : ""}
                  </p>
                </div>
                {e.status === "waiting" && (
                  <Button variant="outline" size="sm" onClick={() => setOffering(e)}>
                    <Send className="h-3.5 w-3.5" aria-hidden />
                    Offer slot
                  </Button>
                )}
                {(e.status === "waiting" || e.status === "offered") && (
                  <Button variant="ghost" size="sm" onClick={() => cancelMutation.mutate(e.id)} aria-label="Cancel">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {offering && <OfferDialog entry={offering} onClose={() => setOffering(null)} />}
    </div>
  );
}

const DURATIONS = [
  { label: "10 minutes", minutes: 10 },
  { label: "30 minutes", minutes: 30 },
  { label: "1 hour", minutes: 60 },
];

function OfferDialog({ entry, onClose }: { entry: WaitlistEntry; onClose: () => void }) {
  const [startsAt, setStartsAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [customMinutes, setCustomMinutes] = useState(45);
  const queryClient = useQueryClient();

  const effectiveMinutes = durationMinutes === -1 ? customMinutes : durationMinutes;

  const mutation = useMutation({
    mutationFn: () => {
      const start = new Date(startsAt);
      const end = new Date(start.getTime() + effectiveMinutes * 60 * 1000);
      return offerWaitlistSlot(entry.id, start.toISOString(), end.toISOString());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["waitlist"] });
      toast.success(`Slot offered to ${entry.customerName}.`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't offer this slot."),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Offer a slot to ${entry.customerName}`}
      description={entry.serviceName}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!startsAt || mutation.isPending}>
            <Check className="h-3.5 w-3.5" aria-hidden />
            {mutation.isPending ? "Sending…" : "Send offer"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Input label="Start time" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        <Select label="Duration" value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))}>
          {DURATIONS.map((d) => (
            <option key={d.minutes} value={d.minutes}>
              {d.label}
            </option>
          ))}
          <option value={-1}>Custom…</option>
        </Select>
        {durationMinutes === -1 && (
          <Input label="Custom duration (minutes)" type="number" min={5} value={customMinutes} onChange={(e) => setCustomMinutes(Math.max(5, Number(e.target.value)))} />
        )}
      </div>
    </Dialog>
  );
}
