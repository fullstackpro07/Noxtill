"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchVoiceOperations,
  fetchVoiceProviderWebhookFailures,
  replayVoiceProviderWebhook,
} from "@/lib/voice-supervisor-api";
import { ApiError } from "@/lib/api-client";
import { Card, CardHead } from "./rx-ui";

export function VoiceOperationsHealth() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["voice-operations"],
    queryFn: fetchVoiceOperations,
    refetchInterval: 30_000,
  });
  const failures = useQuery({
    queryKey: ["voice-provider-webhook-failures"],
    queryFn: fetchVoiceProviderWebhookFailures,
    refetchInterval: 30_000,
  });
  const replay = useMutation({
    mutationFn: replayVoiceProviderWebhook,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["voice-provider-webhook-failures"],
      });
    },
  });
  const webhookEventsForbidden =
    failures.error instanceof ApiError && failures.error.status === 403;
  if (query.error instanceof ApiError && query.error.status === 403)
    return null;
  return (
    <Card overflow>
      <CardHead
        title="Live-audio operations"
        sub="Saved measurements · last 24 hours · non-test calls"
      />
      {query.isPending ? (
        <p className="p-4 text-xs">Loading operational evidence…</p>
      ) : query.error ? (
        <p role="alert" className="p-4 text-xs text-[#B42318]">
          {query.error.message}
        </p>
      ) : (
        query.data && (
          <div className="space-y-2 p-4 text-xs text-[#475467]">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Audio sessions", query.data.sessions],
                ["Completed", query.data.completed],
                ["Failed", query.data.failed],
                ["Interruptions", query.data.interruptions],
                [
                  "First-audio p95",
                  query.data.firstAudioP95Ms === null
                    ? "Not tracked yet"
                    : `${Math.round(query.data.firstAudioP95Ms)} ms`,
                ],
                ["Latency samples", query.data.latencySamples],
                ["Control API samples", query.data.controlRequestSamples],
                ["Control API failures", query.data.controlRequestFailures],
                [
                  "Control API p95",
                  query.data.controlRequestP95Ms === null
                    ? "Not tracked yet"
                    : `${Math.round(query.data.controlRequestP95Ms)} ms`,
                ],
                [
                  "Usage pending over an hour",
                  query.data.pendingUsageOlderThanHour,
                ],
                [
                  "Server instance uptime",
                  `${Math.floor(query.data.instanceUptimeSeconds / 60)} min`,
                ],
              ].map(([name, value]) => (
                <div key={name} className="rounded bg-[#F7F9FB] p-2">
                  <dt className="text-[10px] text-[color:var(--app-text-faintest,#667085)]">{name}</dt>
                  <dd className="mt-1 font-bold">{value}</dd>
                </div>
              ))}
            </dl>
            {query.data.sampleLimited && (
              <p>Showing the latest 1,000 sessions in the window.</p>
            )}
            {query.data.errors.length > 0 && (
              <p role="status">
                Saved failure codes:{" "}
                {[...new Set(query.data.errors)].join(" · ")}
              </p>
            )}
            <p>{query.data.availabilityNote}</p>
            <p>
              Owners receive an in-app alert after 3 non-test audio failures in
              10 minutes, at most once per hour. External paging and deployment
              uptime probes must be configured separately.
            </p>
            <div className="border-t border-[#E6E8EC] pt-3">
              <h3 className="font-bold text-[#344054]">Provider callback recovery</h3>
              <p className="mt-1">
                Signed Twilio call, transfer and agent-leg status, conference usage and
                completed realtime-recording events retry automatically and move
                to the dead-letter list after five consecutive failures.
                Replaying a failure is audited.
                An agent call with an uncertain provider result waits for
                provider confirmation instead of placing another call.
              </p>
              {webhookEventsForbidden ? null : failures.isPending ? (
                <p className="mt-2">Loading callback failures…</p>
              ) : failures.error ? (
                <p role="alert" className="mt-2 text-[#B42318]">
                  {failures.error.message}
                </p>
              ) : failures.data?.length ? (
                <ul className="mt-2 space-y-2">
                  {failures.data.map((event) => (
                    <li
                      key={event.id}
                      className="flex flex-wrap items-start justify-between gap-2 rounded border border-[#E6E8EC] p-2"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-[#344054]">
                          {event.eventType} · {event.state.replace("_", " ")}
                        </p>
                        <p>
                          Call …{event.callSid.slice(-8)} · {event.consecutiveFailures} consecutive failures · {event.attemptCount} attempts
                        </p>
                        {event.lastError ? (
                          <p className="mt-1 break-words text-[#B42318]">{event.lastError}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="rounded border border-[#D0D5DD] px-2 py-1 font-semibold disabled:opacity-50"
                        disabled={replay.isPending}
                        onClick={() => replay.mutate(event.id)}
                      >
                        Replay
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2">No failed provider callbacks.</p>
              )}
              {replay.error ? (
                <p role="alert" className="mt-2 text-[#B42318]">
                  {replay.error.message}
                </p>
              ) : null}
            </div>
          </div>
        )
      )}
    </Card>
  );
}
