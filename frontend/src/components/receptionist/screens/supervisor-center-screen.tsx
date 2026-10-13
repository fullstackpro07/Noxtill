"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import {
  fetchVoiceSupervisorLive,
  type VoiceSupervisorLiveCall,
} from "@/lib/voice-supervisor-api";
import { Ico } from "../rx-icon";
import {
  Card,
  CardHead,
  Chip,
  EmptyState,
  Footnote,
  KpiCard,
  SmallBtn,
  kpiGrid,
} from "../rx-ui";
import { useRx } from "../rx-data";
import { useRxStore } from "../rx-store";

const elapsed = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return minutes ? `${minutes}m ${remaining}s` : `${remaining}s`;
};

const time = (value: string, timezone: string) =>
  new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));

const sentimentTone = (value: VoiceSupervisorLiveCall["sentiment"]) =>
  value === "frustrated" || value === "negative"
    ? "red"
    : value === "positive"
      ? "green"
      : value === "neutral"
        ? "neutral"
        : "neutral";

const sentimentLabel = (value: VoiceSupervisorLiveCall["sentiment"]) =>
  value
    ? `${value[0].toUpperCase()}${value.slice(1)} · AI estimate`
    : "Not reported";

function CallControls({ call }: { call: VoiceSupervisorLiveCall }) {
  const rx = useRx();
  const openConfirm = useRxStore((state) => state.openConfirm);
  const openCall = useRxStore((state) => state.openCall);
  const queryClient = useQueryClient();

  const confirmJoin = (mode: "listen" | "takeOver") => {
    const listen = mode === "listen";
    openConfirm({
      title: listen ? "Join this call muted?" : "Take over this call?",
      tone: listen ? "green" : "amber",
      icon: listen ? "audio-lines" : "user-round",
      body: listen
        ? "Noxtill rings your saved phone and bridges it into a Twilio conference with the caller. You join muted. This is not a silent background tap, and the AI turn-based loop stops when the caller is moved into the conference."
        : "Noxtill rings your saved phone and joins you to the call unmuted. The AI turn-based loop stops when the caller is moved into the conference.",
      rows: [
        { label: "Caller", value: call.caller },
        {
          label: "Current handler",
          value:
            call.joinedByName ??
            (call.handler === "ai"
              ? "AI receptionist"
              : call.handler.replaceAll("_", " ")),
        },
        {
          label: "Rings",
          value: "The phone number on your Noxtill user account",
        },
      ],
      primary: listen ? "Ring my phone · muted" : "Take over call",
      cancel: "Cancel",
      onConfirm: async () => {
        if (listen) await rx.actions.listen(call.id);
        else await rx.actions.takeOver(call.id);
        await queryClient.invalidateQueries({
          queryKey: ["voice-supervisor-live"],
        });
      },
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      <SmallBtn icon="audio-lines" onClick={() => confirmJoin("listen")}>
        Join muted
      </SmallBtn>
      <SmallBtn icon="user-round" onClick={() => confirmJoin("takeOver")}>
        Take over
      </SmallBtn>
      <SmallBtn icon="external-link" onClick={() => openCall(call.id)}>
        Call workspace
      </SmallBtn>
    </div>
  );
}

export function SupervisorCenterScreen() {
  const query = useQuery({
    queryKey: ["voice-supervisor-live"],
    queryFn: fetchVoiceSupervisorLive,
    refetchInterval: 5_000,
    staleTime: 2_000,
  });

  if (query.isPending) {
    return (
      <div
        className="flex flex-col gap-3"
        aria-label="Loading supervisor center"
      >
        {[120, 220, 150].map((height) => (
          <div
            key={height}
            className="animate-pulse rounded-[13px] bg-white"
            style={{ height, border: "1px solid #E6E8EC" }}
          />
        ))}
      </div>
    );
  }

  if (query.isError) {
    const forbidden =
      query.error instanceof ApiError && query.error.status === 403;
    return (
      <Card pad={20}>
        <div className="flex items-start gap-3">
          <Ico
            name={forbidden ? "lock-keyhole" : "triangle-alert"}
            size={19}
            style={{ color: forbidden ? "#B45309" : "#B42318" }}
          />
          <div>
            <h2 className="text-[14px] font-extrabold">
              {forbidden
                ? "Supervisor access required"
                : "Couldn't load live supervision"}
            </h2>
            <p className="mt-1 text-[12px] text-[#667085]">
              {forbidden
                ? "Your role does not have the voice.supervise permission. Ask the business owner to grant supervisor access."
                : "Live call data was not loaded. No counts or agent status are being estimated."}
            </p>
            {!forbidden ? (
              <button
                type="button"
                onClick={() => void query.refetch()}
                className="mt-3 rounded-[8px] border border-[#D5DAE2] bg-white px-3 py-1.5 text-[12px] font-bold"
              >
                Try again
              </button>
            ) : null}
          </div>
        </div>
      </Card>
    );
  }

  const snapshot = query.data;
  const metrics = snapshot.metrics;
  const sentimentRisk = snapshot.calls.filter(
    (call) => call.sentiment === "negative" || call.sentiment === "frustrated",
  ).length;

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[18px] font-extrabold tracking-[-.02em]">
              Live operations
            </h1>
            <Chip tone="green" icon="radio">
              Live snapshot
            </Chip>
          </div>
          <p className="mt-1 text-[12px] text-[#667085]">
            From current call records and voice-agent presence · refreshed every
            5 seconds · {time(snapshot.generatedAt, snapshot.timezone)}
          </p>
        </div>
        <SmallBtn icon="refresh-cw" onClick={() => void query.refetch()}>
          Refresh
        </SmallBtn>
      </div>

      <div style={kpiGrid(150)}>
        <KpiCard
          label="Active calls"
          value={String(metrics.activeCalls)}
          sub="In-progress call records"
        />
        <KpiCard
          label="Agents online"
          value={String(metrics.onlineAgents)}
          sub={`${metrics.availableAgents} available · ${metrics.busyAgents} busy`}
          tone={metrics.onlineAgents ? "green" : "neutral"}
        />
        <KpiCard
          label="Callback backlog"
          value={String(metrics.callbackBacklog)}
          sub="Real unresolved follow-ups"
          tone={metrics.callbackBacklog ? "amber" : "neutral"}
        />
        <KpiCard
          label="Waiting callers"
          value="Not tracked"
          sub="No on-hold call state"
        />
        <KpiCard
          label="SLA risk"
          value="Not configured"
          sub="No voice SLA target"
        />
        <KpiCard
          label="AI errors"
          value="Not tracked"
          sub="No live error metric stored"
        />
      </div>

      {sentimentRisk > 0 ? (
        <div className="flex items-start gap-2 rounded-[11px] border border-[#FDE49B] bg-[#FFFBEB] px-3.5 py-3 text-[12px] text-[#92400E]">
          <Ico name="triangle-alert" size={15} />
          <span>
            {sentimentRisk} live call{sentimentRisk === 1 ? "" : "s"} has an
            AI-estimated negative or frustrated sentiment. This is an estimate,
            not a verified caller state.
          </span>
        </div>
      ) : null}

      <Card overflow>
        <CardHead
          icon="phone-call"
          iconColor="#1D4ED8"
          title="Live calls"
          right={
            <Chip tone={metrics.activeCalls ? "blue" : "neutral"}>
              {metrics.activeCalls} active
            </Chip>
          }
          sub="caller ID masked"
        />
        {snapshot.calls.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon="phone-call"
              title="No calls in progress"
              body="When a call is actually in progress, it appears here from the live call record. This screen does not create sample calls."
            />
          </div>
        ) : (
          <div className="divide-y divide-[#EEF0F3]">
            {snapshot.calls.map((call) => (
              <article
                key={call.id}
                className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[13px] font-bold">
                      {call.caller}
                    </span>
                    <Chip
                      tone={call.handler === "human_joined" ? "blue" : "purple"}
                    >
                      {call.joinedByName
                        ? `Human · ${call.joinedByName}`
                        : call.handler === "ai_to_human"
                          ? "Transfer requested"
                          : "AI receptionist"}
                    </Chip>
                    <Chip tone={sentimentTone(call.sentiment)}>
                      {sentimentLabel(call.sentiment)}
                    </Chip>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#667085]">
                    <span>
                      Started {time(call.startedAt, snapshot.timezone)}
                    </span>
                    <span>Duration {elapsed(call.elapsedSeconds)}</span>
                    <span>Language: Not tracked</span>
                    <span>
                      Recording:{" "}
                      {call.recording === "saved"
                        ? "saved"
                        : call.recording === "deleted"
                          ? "deleted"
                          : "not saved yet"}
                    </span>
                    {call.confidence ? (
                      <span>AI confidence: {call.confidence}</span>
                    ) : (
                      <span>AI confidence: not reported</span>
                    )}
                  </div>
                </div>
                <CallControls call={call} />
              </article>
            ))}
          </div>
        )}
        <Footnote>
          <span className="block pr-14">
            {snapshot.limitations.identity} {snapshot.limitations.monitoring}
          </span>
        </Footnote>
      </Card>

      <div className="grid gap-[18px] lg:grid-cols-[1.2fr_.8fr]">
        <Card overflow>
          <CardHead
            icon="users-round"
            iconColor="#16A34A"
            title="Agent status"
            right={
              <span className="text-[11px] text-[#94A3B8]">
                Configured capacity: {metrics.configuredCapacity}
              </span>
            }
          />
          {snapshot.agents.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon="users-round"
                title="No human voice agents configured"
                body="Link active team members from Agents & Availability to see their presence and skills here."
              />
            </div>
          ) : (
            <div className="divide-y divide-[#EEF0F3]">
              {snapshot.agents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3"
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${agent.status === "available" ? "bg-[#16A34A]" : agent.status === "busy" ? "bg-[#F59E0B]" : agent.status === "away" ? "bg-[#64748B]" : "bg-[#CBD5E1]"}`}
                  />
                  <div className="min-w-[150px] flex-1">
                    <div className="text-[12px] font-bold">
                      {agent.name}{" "}
                      <span className="font-normal text-[#94A3B8]">
                        · {agent.role}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[10.5px] text-[#667085]">
                      {agent.skills.length
                        ? agent.skills.join(" · ")
                        : "Skills not configured"}
                      {agent.presenceExpired ? " · Presence expired" : ""}
                    </div>
                  </div>
                  <Chip
                    tone={
                      agent.status === "available"
                        ? "green"
                        : agent.status === "busy"
                          ? "amber"
                          : "neutral"
                    }
                  >
                    {agent.status}
                  </Chip>
                  <span className="text-[11px] tabular-nums text-[#667085]">
                    {agent.liveCalls}/{agent.maxConcurrentCalls} calls
                  </span>
                </div>
              ))}
            </div>
          )}
          <Footnote>
            Agent presence and concurrency come from saved voice profiles and
            live call assignments. {snapshot.limitations.language}
          </Footnote>
        </Card>

        <Card overflow>
          <CardHead
            icon="shield-check"
            iconColor="#6D28D9"
            title="Coaching & controls"
          />
          <div className="flex flex-col gap-3 p-4">
            <p className="text-[12px] leading-5 text-[#667085]">
              Use the existing Quality screen for review assignments and
              coaching records. The supervisor page does not create a second
              task or review system.
            </p>
            <Link
              href="/phone/quality"
              className="inline-flex h-9 w-fit items-center gap-2 rounded-[9px] border border-[#D5DAE2] bg-white px-3 text-[12px] font-bold text-[#344054] hover:bg-[#F8FAFC]"
            >
              <Ico name="badge-check" size={14} /> Open Call Quality
            </Link>
            <div className="rounded-[10px] border border-[#E6E8EC] bg-[#FAFBFC] p-3 text-[11px] leading-5 text-[#667085]">
              <div className="font-bold text-[#344054]">
                Not available: whisper / barge
              </div>
              {snapshot.limitations.whisperAndBarge}
            </div>
            <Link
              href="/receptionist/queue"
              className="text-[12px] font-bold text-[#1D4ED8] hover:underline"
            >
              Open callback follow-up queue ({metrics.callbackBacklog})
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
