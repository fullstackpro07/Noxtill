"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { provisionVoiceNumber } from "@/lib/voice-calls-api";
import { fetchVoiceProviderHealth } from "@/lib/voice-provider-health-api";
import { ApiError } from "@/lib/api-client";
import { fmtDateTime, relAgo, sliceDay } from "@/lib/receptionist-derive";
import { Ico } from "../rx-icon";
import { Card, Chip, EmptyState, PrimaryBtn } from "../rx-ui";
import { useRx } from "../rx-data";
import { useRxStore } from "../rx-store";
import { RxGate } from "../rx-gate";

export function NumbersScreen() {
  return (
    <RxGate>
      <Numbers />
    </RxGate>
  );
}

const mins = (secs: number) => String(Math.round(secs / 60));

function Numbers() {
  const rx = useRx();
  const qc = useQueryClient();
  const notify = useRxStore((s) => s.notify);
  const openPanel = useRxStore((s) => s.openPanel);
  const openConfirm = useRxStore((s) => s.openConfirm);
  const [busy, setBusy] = useState(false);
  const num = rx.insights?.number ?? null;
  const businessCalls = rx.calls.filter((call) => !call.isTestCall);
  const t = sliceDay(businessCalls, rx.today);
  const health = useQuery({ queryKey: ["voice-provider-health"], queryFn: fetchVoiceProviderHealth, retry: false, staleTime: 60_000 });
  const routing = health.data?.checks.find((check) => check.key === "business_line");
  const routingVerified = routing?.status === "ok";
  const routingLabel = health.isPending ? "Checking routing…" : routingVerified ? "Routing verified" : routing?.status === "error" ? "Routing needs attention" : "Routing not verified";

  const provision = async () => {
    setBusy(true);
    try {
      await provisionVoiceNumber();
      await qc.invalidateQueries({ queryKey: ["rx-insights"] });
      notify("Number provisioned", "Twilio returned a phone number and Noxtill saved it for this business.");
    } catch (e) {
      notify("Couldn't provision a number", e instanceof ApiError ? e.message : "Please try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  const confirmProvision = () => {
    openConfirm({
      title: "Provision a Twilio phone number?",
      tone: "amber",
      icon: "phone",
      body: "Continuing sends a request to Twilio to add a phone number to its account. The current server flow selects a US local number and connects its incoming-call webhook to Noxtill. Twilio may charge for the number and call usage; this screen cannot quote the final price. Check the Twilio account's rates before continuing.",
      rows: [
        { label: "Provider", value: "Twilio" },
        { label: "Number region", value: "US local (selected by the server)" },
        { label: "Business limit", value: "One number per business" },
      ],
      primary: "Continue to Twilio provisioning",
      cancel: "Cancel",
      onConfirm: provision,
    });
  };

  const durationOf = (list: typeof t.calls) => list.reduce((s, c) => s + (c.durationSeconds ?? 0), 0);
  const latest = businessCalls[0];

  // Provider cost is exactly what Twilio itself reported for each call. A call it hasn't priced yet is
  // left out of the total — never estimated.
  const cost = (list: typeof t.calls) => {
    const priced = list.filter((c) => c.providerCost != null);
    const ended = list.filter((c) => c.endedAt);
    const unit = priced[0]?.providerCostUnit ?? "USD";
    const sum = priced.reduce((n, c) => n + (c.providerCost ?? 0), 0);
    return { priced: priced.length, ended: ended.length, text: priced.length ? `${sum.toFixed(sum < 1 ? 4 : 2)} ${unit}` : null };
  };
  const costToday = cost(t.calls);
  const cost30 = cost(businessCalls);

  const stats: [string, string][] = [
    ["Calls today", String(t.calls.length)],
    ["Answered", String(t.answered.length)],
    ["AI handled", String(t.ai.length + t.transferred.filter((c) => c.handledBy === "ai_to_human").length)],
  ];

  const account: { label: string; value: string; meta: string; muted?: boolean }[] = [
    { label: "Provider", value: "Twilio", meta: num ? `Number connected ${fmtDateTime(num.provisionedAt, rx.timezone)}` : "No number connected yet" },
    { label: "Numbers", value: num ? "1" : "0", meta: "One primary number per business" },
    { label: "Call handling", value: "Consent-based recording", meta: "Recording requires a published policy and caller consent. Transcription also needs its provider. Missed-call SMS follows business settings and suppression/opt-out checks." },
    { label: "Call minutes today", value: mins(durationOf(t.calls)), meta: "Calculated from call start and end times" },
    { label: "AI-handled minutes today", value: mins(durationOf(t.ai.concat(t.transferred.filter((c) => c.handledBy === "ai_to_human")))), meta: "Calculated from your call log" },
    { label: "Transcribed calls today", value: String(t.calls.filter((c) => c.transcript.length > 0).length), meta: "Calls with a transcript" },
    {
      label: "Provider cost today",
      value: costToday.text ?? "Not priced yet",
      meta: costToday.text ? `${costToday.priced} of ${costToday.ended} ended call${costToday.ended === 1 ? "" : "s"} priced by Twilio` : costToday.ended ? "Twilio hasn't priced today's calls yet — Noxtill asks hourly" : "No finished calls today",
      muted: !costToday.text,
    },
    {
      label: "Provider cost · 30 days",
      value: cost30.text ?? "Not priced yet",
      meta: cost30.text ? `${cost30.priced} of ${cost30.ended} ended calls priced by Twilio` : cost30.ended ? "Twilio prices a call a little after it ends" : "No finished business calls in this period",
      muted: !cost30.text,
    },
    { label: "Latest business call", value: latest ? relAgo(latest.startedAt, rx.now) : "None yet", meta: latest ? "Most recent non-test call in the log" : "No non-test calls recorded" },
  ];

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))" }}>
        {num ? (
          <div
            onClick={() =>
              openPanel({
                kicker: "Phone number",
                title: num.phoneNumber,
                badge: "Connected",
                badgeTone: "green",
                rows: [
                  { label: "Assignment", value: `${rx.insights?.businessName ?? "Your business"} · general reception` },
                  { label: "Provider", value: "Twilio" },
                  { label: "Inbound handling", value: routing?.detail ?? "Routing has not been verified. Check Provider health in Settings." },
                  { label: "AI response", value: "Uses the configured AI provider; falls back if unavailable" },
                  { label: "Recording and transcript", value: "Recording starts only after a published regional policy and the caller's consent; transcription also needs its configured provider." },
                  { label: "Connected", value: fmtDateTime(num.provisionedAt, rx.timezone) },
                  { label: "Calls today", value: String(t.calls.length) },
                ],
                bulletsTitle: "How this number behaves",
                bullets: [routing?.detail ?? "Routing has not been verified. Check Provider health in Settings.", "The call handler identifies the assistant as automated; it reads the published regional recording notice and starts recording only after the caller presses 1", "Without an approved policy, a public consent callback, or caller consent, no caller audio is recorded", "AI responses depend on the configured AI service; when it is unavailable, the handler uses its fallback response"],
                note: "Recording follows the retention shown in Settings; Noxtill makes no claim about legal compliance.",
                secondary: "Close",
              })
            }
            className="cursor-pointer rounded-[13px] bg-white p-4 transition-all hover:border-[#CBD5E1]! hover:shadow-[0_4px_12px_rgba(16,24,40,.07)]"
            style={{ border: "1px solid #E6E8EC", boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}
          >
            <div className="flex items-start gap-[11px]">
              <div className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] bg-[#ECFDF3] text-[#15803D]">
                <Ico name="phone" size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[13.5px] font-extrabold">{num.phoneNumber}</div>
                <div className="mt-0.5 text-[11px] text-[#94A3B8]">{rx.insights?.businessName ?? "Your business"} · general reception</div>
              </div>
              <Chip tone="green" h={22} fontSize={10.5}>Connected</Chip>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Chip tone={routingVerified ? "green" : routing?.status === "error" ? "amber" : "neutral"}>{routingLabel}</Chip>
              <Chip tone="neutral">Consent required to record</Chip>
              <Chip tone="neutral">Transcription follows consent</Chip>
            </div>
            <div className="mt-[13px] grid gap-[9px] border-t border-[#EEF0F3] pt-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(74px, 1fr))" }}>
              {stats.map(([l, v]) => (
                <div key={l}>
                  <div className="text-[9.5px] font-bold uppercase tracking-[.06em] text-[#94A3B8]">{l}</div>
                  <div className="mt-[3px] text-[14px] font-extrabold tabular-nums">{v}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <Card overflow>
            <EmptyState icon="phone" title="No number yet" body="No Noxtill phone number is connected, so inbound calls cannot reach this receptionist. Provisioning uses the configured Twilio account and currently selects a US local number. Twilio charges may apply; the final price is not shown here." />
            <div className="flex justify-center pb-6">
              <PrimaryBtn onClick={confirmProvision} disabled={busy} height={36}>
                Review number provisioning
              </PrimaryBtn>
            </div>
          </Card>
        )}
      </div>

      <Card pad={18}>
        <div className="flex items-center gap-[9px]">
          <Ico name="plug-zap" size={16} className="text-[#45505F]" />
          <div className="text-[13.5px] font-extrabold">Telephony account</div>
          <div className="ml-auto">
            <Chip tone={routingVerified ? "green" : "neutral"} h={22} fontSize={10.5}>{num ? routingLabel : "Not set up"}</Chip>
          </div>
        </div>
        <div className="mt-3.5 grid gap-[11px]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))" }}>
          {account.map((a) => (
            <div key={a.label} onClick={() => notify(`${a.label} · ${a.value}`, a.meta)} className="cursor-pointer rounded-[11px] border border-[#EEF0F3] p-3 hover:bg-[#F7F8FA]">
              <div className="text-[9.5px] font-bold uppercase tracking-[.07em] text-[#94A3B8]">{a.label}</div>
              <div className="mt-[5px] font-extrabold tabular-nums" style={{ fontSize: a.muted ? 12 : 15, color: a.muted ? "#94A3B8" : "#0F172A" }}>
                {a.value}
              </div>
              <div className="mt-1 text-[10.5px] leading-[1.45] text-[#94A3B8]">{a.meta}</div>
            </div>
          ))}
        </div>
        <div className="mt-[13px] text-[11px] leading-[1.5] text-[#94A3B8]">Test calls are excluded from these business metrics. Minutes are calculated from each call&apos;s start and end time. Cost is the price Twilio reports, checked hourly after the call ends; unpriced calls are left out, never estimated. One primary number is connected per business. Additional campaign numbers are managed in Tracking &amp; Attribution; per-branch primary-number routing is not supported.</div>
      </Card>
    </div>
  );
}
