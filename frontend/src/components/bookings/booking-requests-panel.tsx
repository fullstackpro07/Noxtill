"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Check, X, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { formatDate } from "@/lib/format";
import { formatHour } from "@/lib/profit";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import {
  approveAppointmentRequest,
  declineAppointmentRequest,
  suggestAlternativeTime,
  fetchAppointments,
  type LiveAppointment,
} from "@/lib/bookings-api";

export function BookingRequestsPanel() {
  const queryClient = useQueryClient();
  const [declining, setDeclining] = useState<LiveAppointment | null>(null);
  const [suggesting, setSuggesting] = useState<LiveAppointment | null>(null);

  const { data: requests, isPending, isError, refetch } = useQuery({
    queryKey: ["appointments", "requested"],
    queryFn: () => fetchAppointments({ status: "requested" }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => approveAppointmentRequest(id),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success(`${updated.customerName}'s booking confirmed.`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't approve this request."),
  });

  return (
    <div className="flex flex-col gap-5">
      {isError && <ErrorBanner title="Couldn't load booking requests" onRetry={() => refetch()} />}

      {isPending && (
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <SkeletonRow />
            <SkeletonRow />
          </CardContent>
        </Card>
      )}

      {requests && requests.length === 0 && (
        <Card>
          <CardContent>
            <EmptyState icon={ClipboardCheck} title="No pending requests" description="Booking requests awaiting approval will show up here." />
          </CardContent>
        </Card>
      )}

      {requests && requests.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {requests.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{r.customerName}</p>
                  <p className="truncate text-xs text-fg-muted">
                    {r.serviceName} · {formatDate(r.date)} at {formatHour(r.startHour)}
                    {r.staffName ? ` · ${r.staffName}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => setSuggesting(r)}>
                    <Clock className="h-3.5 w-3.5" aria-hidden />
                    Suggest time
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => setDeclining(r)}>
                    <X className="h-3.5 w-3.5" aria-hidden />
                    Decline
                  </Button>
                  <Button size="sm" onClick={() => approveMutation.mutate(r.id)} disabled={approveMutation.isPending}>
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    Approve
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {declining && <DeclineDialog appointment={declining} onClose={() => setDeclining(null)} />}
      {suggesting && <SuggestAlternativeDialog appointment={suggesting} onClose={() => setSuggesting(null)} />}
    </div>
  );
}

function DeclineDialog({ appointment, onClose }: { appointment: LiveAppointment; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => declineAppointmentRequest(appointment.id, reason || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success(`${appointment.customerName}'s request declined.`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't decline this request."),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Decline ${appointment.customerName}'s request?`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Declining…" : "Decline"}
          </Button>
        </>
      }
    >
      <Input label="Reason (sent to the customer)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Please contact us to rebook." />
    </Dialog>
  );
}

function SuggestAlternativeDialog({ appointment, onClose }: { appointment: LiveAppointment; onClose: () => void }) {
  const [startsAt, setStartsAt] = useState("");

  const mutation = useMutation({
    mutationFn: () => suggestAlternativeTime(appointment.id, new Date(startsAt).toISOString()),
    onSuccess: () => {
      toast.success(`Alternative time sent to ${appointment.customerName}.`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send an alternative time."),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Suggest a different time to ${appointment.customerName}`}
      description="This doesn't change the request's status — the customer still needs to accept."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!startsAt || mutation.isPending}>
            {mutation.isPending ? "Sending…" : "Send suggestion"}
          </Button>
        </>
      }
    >
      <Input label="Proposed date & time" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
    </Dialog>
  );
}
