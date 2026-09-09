"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone, PhoneCall as PhoneCallIcon, Play, CalendarCheck, Headphones, PhoneForwarded, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { EmptyState } from "@/components/shared/empty-state";
import {
  fetchCalls,
  fetchRecordingUrl,
  listenToCall,
  takeOverCall,
  type PhoneCall,
  type PhoneCallStatus,
  type PhoneCallOutcome,
} from "@/lib/voice-calls-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { formatDate, formatTime } from "@/lib/format";

const STATUS_TONE: Record<PhoneCallStatus, "primary" | "success" | "danger" | "neutral"> = {
  in_progress: "primary",
  completed: "success",
  missed: "danger",
  transferred: "neutral",
};

const STATUS_LABEL: Record<PhoneCallStatus, string> = {
  in_progress: "In progress",
  completed: "Completed",
  missed: "Missed",
  transferred: "Transferred",
};

const OUTCOME_LABEL: Record<PhoneCallOutcome, string> = {
  none: "—",
  booking: "Booked",
  message: "Message taken",
  transfer: "Transferred",
  custom: "Custom",
};

export function CallOverviewView() {
  const [selected, setSelected] = useState<PhoneCall | null>(null);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["voice-calls"],
    queryFn: fetchCalls,
    refetchInterval: 15_000,
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-fg">Call Overview</h1>
        <p className="mt-0.5 text-sm text-fg-muted">
          Every call the AI receptionist has answered. On an in-progress call, listen in or take over — your own phone rings and
          bridges you live onto the call.
        </p>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load calls" onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState icon={Phone} title="No calls yet" description="Calls will show up here once your number is provisioned and receiving calls." />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-fg-faint">
                <th className="px-4 py-2 font-medium">From</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Outcome</th>
                <th className="px-4 py-2 font-medium">Started</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.map((call) => (
                <tr key={call.id} onClick={() => setSelected(call)} className="cursor-pointer border-b border-border last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-2 font-medium text-fg">{call.fromNumber}</td>
                  <td className="px-4 py-2">
                    <Badge tone={STATUS_TONE[call.status]}>
                      {call.status === "in_progress" && <PhoneCallIcon className="h-3 w-3 animate-pulse" aria-hidden />}
                      {STATUS_LABEL[call.status]}
                    </Badge>
                    {call.joinedAt && (
                      <Badge tone="neutral" className="ml-1">
                        <UserCheck className="h-3 w-3" aria-hidden />
                        Staff live
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-2 text-fg-muted">
                    {OUTCOME_LABEL[call.outcome]}
                    {call.outcome === "custom" && call.customIntentName ? ` (${call.customIntentName})` : ""}
                  </td>
                  <td className="px-4 py-2 text-xs text-fg-faint">
                    {formatDate(call.startedAt)} · {formatTime(call.startedAt)}
                  </td>
                  <td className="px-4 py-2 text-end" onClick={(e) => e.stopPropagation()}>
                    {call.status === "in_progress" && <LiveJoinButtons call={call} compact />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CallDetailDialog call={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function LiveJoinButtons({ call, compact }: { call: PhoneCall; compact?: boolean }) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["voice-calls"] });
  };

  const listenMutation = useMutation({
    mutationFn: () => listenToCall(call.id),
    onSuccess: () => {
      toast.success("Calling your phone to listen in…");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't join this call."),
  });

  const takeOverMutation = useMutation({
    mutationFn: () => takeOverCall(call.id),
    onSuccess: () => {
      toast.success("Calling your phone to take over…");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't join this call."),
  });

  const pending = listenMutation.isPending || takeOverMutation.isPending;

  return (
    <div className="flex justify-end gap-1.5">
      <Button variant="ghost" size={compact ? "sm" : "md"} onClick={() => listenMutation.mutate()} disabled={pending}>
        <Headphones className="h-3.5 w-3.5" aria-hidden />
        Listen
      </Button>
      <Button size={compact ? "sm" : "md"} onClick={() => takeOverMutation.mutate()} disabled={pending}>
        <PhoneForwarded className="h-3.5 w-3.5" aria-hidden />
        Take over
      </Button>
    </div>
  );
}

function CallDetailDialog({ call, onClose }: { call: PhoneCall | null; onClose: () => void }) {
  return call ? <CallDetailDialogBody call={call} onClose={onClose} /> : null;
}

function CallDetailDialogBody({ call, onClose }: { call: PhoneCall; onClose: () => void }) {
  const { data: recording } = useQuery({
    queryKey: ["voice-recording-url", call.id],
    queryFn: () => fetchRecordingUrl(call.id),
    enabled: !!call.recordingKey,
  });

  return (
    <Dialog open onClose={onClose} title={call.fromNumber} description={`${STATUS_LABEL[call.status]} · ${OUTCOME_LABEL[call.outcome]}`} className="max-w-lg">
      <div className="flex flex-col gap-4">
        {call.status === "in_progress" && (
          <div className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] bg-primary/8 px-3 py-2">
            <p className="text-xs text-fg-muted">
              {call.joinedAt
                ? "A staff member has been bridged onto this call."
                : "This call is live right now — your own phone will ring to join it."}
            </p>
            <LiveJoinButtons call={call} />
          </div>
        )}

        {call.appointment && (
          <div className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-whatsapp/8 px-3 py-2 text-sm text-whatsapp">
            <CalendarCheck className="h-4 w-4 shrink-0" aria-hidden />
            Booked for {formatDate(call.appointment.startsAt)} at {formatTime(call.appointment.startsAt)}
          </div>
        )}

        {recording?.url && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-fg-muted">Recording</p>
            <audio controls src={recording.url} className="w-full">
              <Play className="h-4 w-4" aria-hidden />
            </audio>
          </div>
        )}

        <div>
          <p className="mb-1.5 text-xs font-medium text-fg-muted">Transcript</p>
          {call.transcript.length === 0 ? (
            <p className="text-xs text-fg-faint">No conversation recorded yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {call.transcript.map((turn, i) => (
                <div
                  key={i}
                  className={`max-w-[85%] rounded-[var(--radius-sm)] px-3 py-2 text-sm ${
                    turn.speaker === "caller" ? "self-start bg-surface-2 text-fg" : "self-end bg-primary/10 text-fg"
                  }`}
                >
                  <p>{turn.text}</p>
                  <p className="mt-0.5 text-[10px] text-fg-faint">{formatTime(turn.at)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
