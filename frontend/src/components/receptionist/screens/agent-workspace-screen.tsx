"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import {
  callerName,
  firstCallerLine,
  fmtShortDuration,
  fmtWhen,
  handlerChip,
  needsFollowUp,
} from "@/lib/receptionist-derive";
import {
  fetchVoiceAgentRoster,
  updateMyVoicePresence,
  type VoicePresenceStatus,
} from "@/lib/voice-agents-api";
import {
  generateVoiceCallCopilotSuggestion,
  type VoiceCopilotSuggestion,
} from "@/lib/voice-calls-api";
import {
  Card,
  CardHead,
  Chip,
  ChipFor,
  EmptyState,
  PrimaryBtn,
  SmallBtn,
} from "../rx-ui";
import { Ico } from "../rx-icon";
import { useCallActions } from "../rx-call-actions";
import { useRx } from "../rx-data";
import { useRxStore } from "../rx-store";
import { RxGate } from "../rx-gate";
import { RxSoftphone } from "../rx-softphone";

const statusTone: Record<VoicePresenceStatus, "green" | "amber" | "neutral"> = {
  available: "green",
  busy: "amber",
  away: "neutral",
  offline: "neutral",
};

const inputClass =
  "h-[36px] rounded-[9px] border border-[#D5DAE2] bg-white px-2.5 text-[12px] font-semibold text-[#0F172A] outline-none focus:border-[#16A34A]";

export function AgentWorkspaceScreen() {
  return (
    <RxGate>
      <Workspace />
    </RxGate>
  );
}

function Workspace() {
  const rx = useRx();
  const openCall = useRxStore((state) => state.openCall);
  const queryClient = useQueryClient();
  const callActions = useCallActions();
  const [copilotResult, setCopilotResult] =
    useState<VoiceCopilotSuggestion | null>(null);
  const [copilotError, setCopilotError] = useState<string | null>(null);
  const roster = useQuery({
    queryKey: ["voice-agent-roster"],
    queryFn: fetchVoiceAgentRoster,
    refetchInterval: 15_000,
  });
  const selfAgent = roster.data?.agents.find(
    (agent) => agent.isSelf && agent.active,
  );
  const presenceStatus = selfAgent?.presenceStatus;

  const presence = useMutation({
    mutationFn: updateMyVoicePresence,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["voice-agent-roster"] });
    },
  });
  const copilot = useMutation({
    mutationFn: generateVoiceCallCopilotSuggestion,
    onSuccess: (result) => {
      setCopilotResult(result);
      setCopilotError(null);
    },
    onError: (error) => {
      setCopilotError(
        error instanceof ApiError
          ? error.message
          : "The AI provider could not generate a suggestion.",
      );
      setCopilotResult(null);
    },
  });

  // Keep the self-reported presence fresh while this workspace is open, matching the Agents page.
  // This status is displayed to the team only; the server does not use it to route calls.
  useEffect(() => {
    if (!presenceStatus || presenceStatus === "offline") return;
    const timer = window.setInterval(() => {
      void updateMyVoicePresence(presenceStatus)
        .then(() => {
          void queryClient.invalidateQueries({
            queryKey: ["voice-agent-roster"],
          });
        })
        .catch(() => undefined);
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [presenceStatus, queryClient]);

  const followUps = rx.followUps.filter(needsFollowUp);
  const rosterError =
    roster.error instanceof ApiError
      ? roster.error.message
      : roster.error instanceof Error
        ? "Agent presence could not be loaded. Call data is still available below."
        : null;
  const presenceError =
    presence.error instanceof ApiError
      ? presence.error.message
      : presence.error instanceof Error
        ? presence.error.message
        : null;
  const hasStaffPhone = !!selfAgent?.phone;

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[20px] font-extrabold tracking-[-.03em] text-[#0F172A]">
            Agent Workspace
          </div>
          <div className="mt-1 text-[12px] text-[color:var(--app-text-faintest,#667085)]">
            Live calls and human follow-ups from this business&apos;s real phone
            records.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selfAgent ? (
            <label className="flex items-center gap-2 text-[11px] font-bold text-[#45505F]">
              My presence
              <select
                aria-label="My presence"
                className={inputClass}
                value={selfAgent.presenceStatus}
                onChange={(event) =>
                  presence.mutate(event.target.value as VoicePresenceStatus)
                }
                disabled={presence.isPending}
              >
                <option value="offline">Offline</option>
                <option value="available">Available</option>
                <option value="busy">Busy</option>
                <option value="away">Away</option>
              </select>
            </label>
          ) : (
            <Chip tone="amber">No active human voice profile</Chip>
          )}
          <SmallBtn
            icon="refresh-cw"
            onClick={() => {
              rx.refetch();
              void roster.refetch();
            }}
          >
            Refresh
          </SmallBtn>
        </div>
      </div>

      {rosterError ? (
        <div
          role="alert"
          className="rounded-[10px] border border-[#FBD5D2] bg-[#FEF3F2] px-3 py-2.5 text-[12px] text-[#B42318]"
        >
          {rosterError}
        </div>
      ) : null}
      {presenceError ? (
        <div
          role="alert"
          className="rounded-[10px] border border-[#FBD5D2] bg-[#FEF3F2] px-3 py-2.5 text-[12px] text-[#B42318]"
        >
          {presenceError}
        </div>
      ) : null}

      <RxSoftphone />

      <div className="grid gap-[18px] lg:grid-cols-[minmax(0,1fr)_minmax(280px,.52fr)]">
        <Card overflow>
          <CardHead
            icon="headset"
            iconColor="#16A34A"
            title="Agent status"
            right={
              selfAgent ? (
                <Chip tone={statusTone[selfAgent.presenceStatus]}>
                  {selfAgent.presenceStatus}
                </Chip>
              ) : undefined
            }
          />
          <div className="grid gap-4 p-[18px] sm:grid-cols-2">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[.08em] text-[color:var(--app-text-faintest,#667085)]">
                Signed-in agent
              </div>
              <div className="mt-1 text-[15px] font-extrabold text-[#0F172A]">
                {selfAgent?.name ?? "Not set up"}
              </div>
              <div className="mt-1 text-[11px] text-[color:var(--app-text-faintest,#667085)]">
                {selfAgent
                  ? `${selfAgent.role}${selfAgent.skillTags.length ? ` · ${selfAgent.skillTags.join(", ")}` : ""}`
                  : "Create a voice profile from an existing Staff record to report presence."}
              </div>
            </div>
            <div className="min-w-0 rounded-[10px] border border-[#FDE49B] bg-[#FFFBEB] p-3">
              <div className="flex items-center gap-2 text-[11.5px] font-extrabold text-[#92400E]">
                <Ico name="phone" size={14} /> Phone connection
              </div>
              <div className="mt-1 text-[11px] leading-[1.55] text-[#7C5A14]">
                {hasStaffPhone
                  ? `Your saved number is ${selfAgent?.phone}. Listen-in and take-over ring your account phone through the configured telephony provider. If no fixed transfer number is configured, available AI handoffs can also ring this phone while your profile has capacity.`
                  : "Your account has no phone number saved, so phone-based supervisor listen-in and take-over cannot ring you yet. Browser-phone readiness is shown in the Browser softphone panel. Automatic device-health checks are not available."}
              </div>
            </div>
          </div>
          <div className="border-t border-[#EEF0F3] bg-[#FCFCFD] px-[18px] py-3 text-[10.5px] leading-[1.5] text-[color:var(--app-text-faintest,#667085)]">
            Presence is self-reported and expires after{" "}
            {roster.data?.limitations.presenceTtlSeconds ?? "the configured"}{" "}
            seconds. A fresh available profile with capacity can receive
            AI-to-human handoffs; a classified caller topic prefers an exact
            matching skill tag, falling back to available capacity when none
            match. Direct ordinary calls still enter through the AI
            receptionist, and routing rules remain separate.
          </div>
        </Card>

        <Card overflow>
          <CardHead icon="sparkles" iconColor="#6D28D9" title="AI Copilot" />
          <div className="p-[16px]">
            <div className="rounded-[10px] border border-[#E6E8EC] bg-[#FAFBFC] p-3 text-[11.5px] leading-[1.6] text-[#5B6675]">
              Live-call suggestions are available for an active call after a
              caller transcript is recorded. An agent must request each
              suggestion; recent call text and matching active knowledge are
              sent to the configured AI provider, and the result is shown for
              human review only. Nothing is sent to the caller. If AI is not
              configured or enabled, the page shows the provider error.
            </div>
            <Link
              href="/receptionist/assistant"
              className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] font-bold text-[#15803D] hover:underline"
            >
              Open AI Call Assistant <Ico name="external-link" size={12} />
            </Link>
          </div>
        </Card>
      </div>

      <section
        className="flex flex-col gap-3"
        aria-labelledby="workspace-live-heading"
      >
        <div className="flex items-center gap-2">
          <Ico name="phone-call" size={15} style={{ color: "#1D4ED8" }} />
          <h2
            id="workspace-live-heading"
            className="text-[14px] font-extrabold text-[#0F172A]"
          >
            Active calls
          </h2>
          <Chip tone={rx.live.length ? "blue" : "neutral"}>
            {rx.live.length}
          </Chip>
          <span className="ml-auto text-[10.5px] text-[color:var(--app-text-faintest,#667085)]">
            Live call records · refresh automatically
          </span>
        </div>
        {rx.live.length === 0 ? (
          <Card overflow>
            <EmptyState
              icon="phone-call"
              title="No active call right now"
              body="This business has no call currently in progress. New connected calls appear here from telephony records. Incoming browser calls are answered in the Browser softphone panel."
            />
          </Card>
        ) : (
          <div className="grid items-start gap-3 lg:grid-cols-2">
            {rx.live.map((call) => {
              const elapsed = Math.max(
                0,
                Math.round(
                  (rx.now.getTime() - new Date(call.startedAt).getTime()) /
                    1000,
                ),
              );
              const lastCaller = [...call.transcript]
                .reverse()
                .find((turn) => turn.speaker === "caller")?.text;
              return (
                <Card key={call.id} overflow border="#C7DBFE">
                  <div className="flex items-start gap-3 border-b border-[#EEF0F3] p-4">
                    <div className="flex h-10 w-10 flex-none items-center justify-center rounded-[11px] bg-[#EFF6FF] text-[#1D4ED8]">
                      <Ico name="phone-incoming" size={17} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-extrabold text-[#0F172A]">
                        {callerName(call)}
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-[color:var(--app-text-faintest,#667085)]">
                        {call.fromNumber} ·{" "}
                        {fmtWhen(
                          call.startedAt,
                          rx.timezone,
                          rx.today,
                          call.localDay,
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <ChipFor spec={handlerChip(call.handledBy)} />
                        <Chip tone="blue">
                          {fmtShortDuration(elapsed)} elapsed
                        </Chip>
                        {call.customer ? (
                          <Chip tone="green">Matched customer</Chip>
                        ) : (
                          <Chip tone="neutral">No saved customer match</Chip>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2 p-4">
                    <div className="text-[10px] font-extrabold uppercase tracking-[.08em] text-[color:var(--app-text-faintest,#667085)]">
                      Customer context
                    </div>
                    <div className="text-[11.5px] text-[#45505F]">
                      {call.customer
                        ? `Matched record: ${call.customer.name}`
                        : "Customer record: not matched by caller number"}
                    </div>
                    <div className="text-[11.5px] text-[#45505F]">
                      {call.appointment
                        ? `Booking: ${call.appointment.serviceName} · ${call.appointment.status}`
                        : "Booking on this call: none recorded"}{" "}
                      · {call.previousCalls} earlier call
                      {call.previousCalls === 1 ? "" : "s"}
                    </div>
                    <div className="rounded-[9px] border border-[#E6E8EC] bg-[#FAFBFC] p-2.5 text-[11.5px] leading-[1.5] text-[#45505F]">
                      <span className="font-bold text-[color:var(--app-text-faintest,#667085)]">
                        Last caller words:{" "}
                      </span>
                      {lastCaller
                        ? `“${lastCaller}”`
                        : "Not available yet; no caller turn has been recorded."}
                    </div>
                    <div className="rounded-[10px] border border-[#DDD3FE] bg-[#FBFAFF] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-[11.5px] font-extrabold text-[#5B21B6]">
                          <Ico name="sparkles" size={13} /> AI Copilot · human
                          review
                        </div>
                        <SmallBtn
                          icon="sparkles"
                          disabled={!lastCaller || copilot.isPending}
                          onClick={() => {
                            setCopilotError(null);
                            copilot.mutate(call.id);
                          }}
                        >
                          {copilot.isPending
                            ? "Generating…"
                            : copilotResult?.callId === call.id
                              ? "Regenerate"
                              : "Generate suggestion"}
                        </SmallBtn>
                      </div>
                      <div className="mt-1 text-[10.5px] leading-[1.5] text-[color:var(--app-text-faintest,#667085)]">
                        Only on your click, recent call text and matching active
                        knowledge snippets are sent to the configured AI
                        provider. Nothing is sent to the caller.
                      </div>
                      {copilotError ? (
                        <div
                          role="alert"
                          className="mt-2 rounded-[8px] border border-[#FBD5D2] bg-[#FEF3F2] px-2.5 py-2 text-[10.5px] text-[#B42318]"
                        >
                          {copilotError}
                        </div>
                      ) : null}
                      {copilotResult?.callId === call.id ? (
                        <div className="mt-2 rounded-[8px] border border-[#E9DDFE] bg-white p-2.5">
                          <div className="text-[11.5px] leading-[1.55] text-[#334155]">
                            {copilotResult.suggestion}
                          </div>
                          <div className="mt-2 border-t border-[#F1ECFA] pt-2 text-[10px] text-[color:var(--app-text-faintest,#667085)]">
                            Context supplied:{" "}
                            {copilotResult.contextSupplied
                              .map((source) => source.label)
                              .join(" · ")}
                            . This is context sent to the model, not proof that
                            it relied on each source.
                          </div>
                          {copilotResult.contextSupplied.some(
                            (source) => source.snippet,
                          ) ? (
                            <details className="mt-2 text-[10px] text-[#5B6675]">
                              <summary className="cursor-pointer font-bold">
                                Show supplied knowledge snippets
                              </summary>
                              <div className="mt-2 flex flex-col gap-2">
                                {copilotResult.contextSupplied
                                  .filter((source) => source.snippet)
                                  .map((source) => (
                                    <div
                                      key={`${source.label}-${source.sourceFilename ?? ""}`}
                                      className="rounded-[7px] border border-[#E6E8EC] bg-[#FAFBFC] p-2"
                                    >
                                      <div className="font-bold">
                                        {source.label}
                                        {source.sourceFilename
                                          ? ` · ${source.sourceFilename}`
                                          : ""}
                                      </div>
                                      <div className="mt-0.5 leading-[1.45]">
                                        {source.snippet}
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            </details>
                          ) : null}
                          <div className="mt-1 text-[9.5px] text-[color:var(--app-text-faintest,#667085)]">
                            AI-generated ·{" "}
                            {copilotResult.usage.inputTokens +
                              copilotResult.usage.outputTokens}{" "}
                            tokens · not sent automatically
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-[#EEF0F3] bg-[#FCFCFD] p-3">
                    <PrimaryBtn onClick={() => openCall(call.id)}>
                      <Ico name="external-link" size={13} /> Open workspace
                    </PrimaryBtn>
                    <SmallBtn
                      icon="audio-lines"
                      disabled={!hasStaffPhone}
                      title={
                        hasStaffPhone
                          ? undefined
                          : "Add a phone number to your account first"
                      }
                      onClick={() => callActions.join(call, "listen")}
                    >
                      Listen in
                    </SmallBtn>
                    <SmallBtn
                      icon="user-round"
                      disabled={!hasStaffPhone}
                      title={
                        hasStaffPhone
                          ? undefined
                          : "Add a phone number to your account first"
                      }
                      onClick={() => callActions.join(call, "takeover")}
                    >
                      Take over
                    </SmallBtn>
                    <SmallBtn
                      icon="phone-forwarded"
                      onClick={() => callActions.transfer(call)}
                    >
                      Transfer
                    </SmallBtn>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section
        className="flex flex-col gap-3"
        aria-labelledby="workspace-followups-heading"
      >
        <div className="flex items-center gap-2">
          <Ico name="bell" size={15} style={{ color: "#B45309" }} />
          <h2
            id="workspace-followups-heading"
            className="text-[14px] font-extrabold text-[#0F172A]"
          >
            After-call work
          </h2>
          <Chip tone={followUps.length ? "amber" : "neutral"}>
            {followUps.length} waiting
          </Chip>
          <span className="ml-auto text-[10.5px] text-[color:var(--app-text-faintest,#667085)]">
            Unresolved missed calls, messages and custom situations
          </span>
        </div>
        {followUps.length === 0 ? (
          <Card overflow>
            <EmptyState
              icon="circle-check"
              title="No human follow-up waiting"
              body="Unresolved missed calls, caller messages and custom situations will appear here. Completed calls do not count as handled until they are resolved."
            />
          </Card>
        ) : (
          <Card overflow>
            <CardHead
              title="Follow-up queue"
              sub="Oldest first · sourced from call records"
            />
            <div className="divide-y divide-[#EEF0F3]">
              {followUps.map((call) => {
                const callerWords = firstCallerLine(call);
                return (
                  <div
                    key={call.id}
                    className="grid gap-3 p-4 xl:grid-cols-[minmax(150px,.8fr)_minmax(180px,1.1fr)_minmax(150px,.8fr)_auto] xl:items-center"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[12.5px] font-extrabold text-[#0F172A]">
                        {callerName(call)}
                      </div>
                      <div className="mt-0.5 font-mono text-[10.5px] text-[color:var(--app-text-faintest,#667085)]">
                        {call.fromNumber}
                      </div>
                      <div className="mt-1 text-[10px] text-[color:var(--app-text-faintest,#667085)]">
                        {fmtWhen(
                          call.startedAt,
                          rx.timezone,
                          rx.today,
                          call.localDay,
                        )}
                      </div>
                    </div>
                    <div className="min-w-0 text-[11px] leading-[1.5] text-[#45505F]">
                      {callerWords
                        ? `“${callerWords}”`
                        : call.status === "missed"
                          ? "No caller words recorded: this call was not answered."
                          : "No caller transcript is available on this record."}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <ChipFor spec={handlerChip(call.handledBy)} />
                      <Chip tone={call.assignedToName ? "blue" : "amber"}>
                        {call.assignedToName
                          ? `Assigned · ${call.assignedToName}`
                          : "Unassigned"}
                      </Chip>
                    </div>
                    <div className="flex flex-wrap gap-1.5 xl:justify-end">
                      <SmallBtn
                        onClick={() => openCall(call.id)}
                        icon="external-link"
                      >
                        Open
                      </SmallBtn>
                      <SmallBtn
                        onClick={() => callActions.callBack(call)}
                        icon="phone-outgoing"
                      >
                        Call back
                      </SmallBtn>
                      <SmallBtn
                        onClick={() => callActions.assign(call)}
                        icon="users-round"
                      >
                        Assign
                      </SmallBtn>
                      <SmallBtn
                        onClick={() => void rx.actions.markHandled(call.id)}
                        icon="circle-check"
                      >
                        Mark handled
                      </SmallBtn>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </section>
    </div>
  );
}
