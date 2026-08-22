"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ticket, Phone, Check, SkipForward, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { fetchQueue, joinQueue, callQueueToken, serveQueueToken, skipQueueToken, type QueueToken } from "@/lib/queue-api";

const STATUS_TONE: Record<QueueToken["status"], "primary" | "success" | "neutral" | "danger" | "warning"> = {
  waiting: "neutral",
  called: "warning",
  serving: "primary",
  served: "success",
  skipped: "danger",
  cancelled: "danger",
};

export function QueuePanel() {
  const queryClient = useQueryClient();
  const [joining, setJoining] = useState(false);

  const { data: tokens, isPending, isError, refetch } = useQuery({
    queryKey: ["queue"],
    queryFn: fetchQueue,
    refetchInterval: 15_000,
  });

  const nowServing = tokens?.find((t) => t.status === "called" || t.status === "serving");
  const waiting = (tokens ?? []).filter((t) => t.status === "waiting");
  const done = (tokens ?? []).filter((t) => ["served", "skipped", "cancelled"].includes(t.status));

  const callMutation = useMutation({
    mutationFn: (id: string) => callQueueToken(id),
    onSuccess: (t) => {
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      toast.success(`Calling token #${t.number}.`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't call this token."),
  });
  const serveMutation = useMutation({
    mutationFn: (id: string) => serveQueueToken(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      toast.success("Marked as served.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this token."),
  });
  const skipMutation = useMutation({
    mutationFn: (id: string) => skipQueueToken(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      toast.success("Token skipped.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this token."),
  });

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-fg-faint">Now serving</p>
          {nowServing ? (
            <>
              <p className="font-display text-5xl font-bold tabular-nums text-primary">#{nowServing.number}</p>
              <p className="text-sm text-fg-muted">{nowServing.customerName}</p>
              <Button size="sm" className="mt-2" onClick={() => serveMutation.mutate(nowServing.id)} disabled={serveMutation.isPending}>
                <Check className="h-3.5 w-3.5" aria-hidden />
                Mark served
              </Button>
            </>
          ) : (
            <p className="text-sm text-fg-faint">No one is being called right now.</p>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-fg">Waiting ({waiting.length})</p>
        <Button size="sm" onClick={() => setJoining(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add to queue
        </Button>
      </div>

      {isError && <ErrorBanner title="Couldn't load the queue" onRetry={() => refetch()} />}
      {isPending && (
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <SkeletonRow />
            <SkeletonRow />
          </CardContent>
        </Card>
      )}
      {tokens && waiting.length === 0 && !isPending && (
        <Card>
          <CardContent>
            <EmptyState icon={Ticket} title="No one waiting" description="Walk-ins added to the queue show up here." />
          </CardContent>
        </Card>
      )}
      {waiting.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {waiting.map((t) => (
            <Card key={t.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <p className="font-display text-lg font-bold tabular-nums text-fg">#{t.number}</p>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{t.customerName}</p>
                  {t.serviceName && <p className="truncate text-xs text-fg-muted">{t.serviceName}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => skipMutation.mutate(t.id)} disabled={skipMutation.isPending}>
                    <SkipForward className="h-3.5 w-3.5" aria-hidden />
                    Skip
                  </Button>
                  <Button size="sm" onClick={() => callMutation.mutate(t.id)} disabled={callMutation.isPending}>
                    <Phone className="h-3.5 w-3.5" aria-hidden />
                    Call
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {done.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-fg-muted">Today, earlier</p>
          {done.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-[var(--radius-sm)] bg-surface-2 px-3.5 py-2 text-sm">
              <span className="tabular-nums text-fg-muted">#{t.number}</span>
              <span className="min-w-0 flex-1 truncate text-fg">{t.customerName}</span>
              <Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge>
            </div>
          ))}
        </div>
      )}

      <JoinQueueDialog open={joining} onClose={() => setJoining(false)} />
    </div>
  );
}

function JoinQueueDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [customerName, setCustomerName] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => joinQueue({ customerName }),
    onSuccess: (t) => {
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      toast.success(`${t.customerName} added as token #${t.number}.`);
      setCustomerName("");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't add this walk-in to the queue."),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add to queue"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!customerName.trim() || mutation.isPending}>
            {mutation.isPending ? "Adding…" : "Add"}
          </Button>
        </>
      }
    >
      <Input label="Customer name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Walk-in" />
    </Dialog>
  );
}
