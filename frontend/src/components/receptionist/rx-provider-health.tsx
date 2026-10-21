"use client";

import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { fetchVoiceProviderHealth, fetchVoiceUsage, type HealthStatus } from "@/lib/voice-provider-health-api";
import type { Tone } from "@/lib/receptionist-derive";
import { Card, CardHead, Chip, SmallBtn } from "./rx-ui";

const TONE: Record<HealthStatus, Tone> = { ok: "green", warning: "amber", error: "red", not_configured: "neutral" };
const LABEL: Record<HealthStatus, string> = { ok: "OK", warning: "Check", error: "Problem", not_configured: "Not configured" };
const when = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

/** Receptionist Settings: live provider health and this month's measured usage (managers only). */
export function ProviderHealthCard() {
  const health = useQuery({ queryKey: ["voice-provider-health"], queryFn: fetchVoiceProviderHealth, retry: false, staleTime: 60_000 });
  const usage = useQuery({ queryKey: ["voice-usage"], queryFn: fetchVoiceUsage, retry: false, staleTime: 60_000 });
  const forbidden = [health.error, usage.error].some((error) => error instanceof ApiError && error.status === 403);
  if (forbidden) return null;

  return (
    <div className="grid gap-[18px] lg:grid-cols-2">
      <Card overflow>
        <CardHead
          title="Provider health"
          sub={health.data ? `Checked ${when(health.data.checkedAt)}` : "Live checks against the phone provider"}
          right={<SmallBtn icon="refresh-cw" disabled={health.isFetching} onClick={() => void health.refetch()}>{health.isFetching ? "Checking…" : "Re-check"}</SmallBtn>}
        />
        {health.isPending ? (
          <p className="m-0 p-[18px] text-[12px] text-[color:var(--app-text-faintest,#667085)]">Checking…</p>
        ) : health.isError ? (
          <p className="m-0 p-[18px] text-[12px] text-[#B42318]">{health.error.message}</p>
        ) : (
          <div className="divide-y divide-[#EEF0F3]">
            {health.data.checks.map((check) => (
              <div key={check.key} className="flex items-start justify-between gap-3 px-[18px] py-2.5">
                <div className="min-w-0">
                  <div className="text-[12px] font-bold text-[#334155]">{check.label}</div>
                  <div className="mt-0.5 text-[11px] leading-[1.5] text-[#667085]">{check.detail}</div>
                </div>
                <Chip tone={TONE[check.status]}>{LABEL[check.status]}</Chip>
              </div>
            ))}
            <div className="px-[18px] py-2.5 text-[11px] text-[#667085]">
              Last call received: {health.data.lastCallAt ? when(health.data.lastCallAt) : "none yet"} · {health.data.activeTrackingNumbers} active tracking number{health.data.activeTrackingNumbers === 1 ? "" : "s"}
            </div>
          </div>
        )}
      </Card>
      <Card overflow>
        <CardHead title="Usage this month" sub={usage.data ? `Since ${new Date(usage.data.periodStart).toLocaleString(undefined, { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" })} (UTC)` : "Measured from saved calls"} />
        {usage.isPending ? (
          <p className="m-0 p-[18px] text-[12px] text-[color:var(--app-text-faintest,#667085)]">Loading…</p>
        ) : usage.isError ? (
          <p className="m-0 p-[18px] text-[12px] text-[#B42318]">{usage.error.message}</p>
        ) : (
          <div className="p-[18px]">
            <div className="grid grid-cols-2 gap-2.5 text-[12px] sm:grid-cols-3">
              {[
                ["Inbound calls", usage.data.inboundCalls],
                ["Automated calls admitted", usage.data.limits.automatedCalls],
                ["Calls routed around the cap", usage.data.limits.quotaRejectedCalls],
                ["Missed", usage.data.missedCalls],
                ["Inbound minutes", usage.data.inboundMinutes],
                ["With an AI agent", usage.data.callsWithAiAgent],
                ["Human connected", usage.data.callsWithHumanConnected],
                ["Outbound + call-back dials", usage.data.outboundDials + usage.data.callbackDials],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[9px] bg-[#F7F9FB] p-2.5">
                  <div className="text-[16px] font-extrabold tabular-nums">{value}</div>
                  <div className="text-[10.5px] text-[color:var(--app-text-faintest,#667085)]">{label}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-[11px] text-[#667085]">
              Monthly automated-call limit: {usage.data.limits.maxInboundCallsPerMonth === null ? "no limit configured" : `${usage.data.limits.automatedCalls} of ${usage.data.limits.maxInboundCallsPerMonth} admitted`}.
            </div>
            <div className="mt-2 text-[11px] text-[#667085]">
              Provider-priced charges:{" "}
              {usage.data.providerCharges.length ? usage.data.providerCharges.map((row) => `${row.amount} ${row.unit}`).join(" · ") : "none priced yet"}
            </div>
            <div className="mt-2 rounded-[8px] border border-[#FDE49B] bg-[#FFFBEB] p-2.5 text-[11px] text-[#92400E]">{usage.data.limits.note}</div>
          </div>
        )}
      </Card>
    </div>
  );
}
