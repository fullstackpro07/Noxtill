"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { updateMyVoicePresence } from "@/lib/voice-agents-api";
import {
  campaignApprovalAction,
  controlOutboundCampaign,
  fetchCampaignReport,
  fetchCampaignAttempts,
  fetchDialerNext,
  placeDialAttempt,
  saveDialDisposition,
  skipDialContact,
  type DialAttemptStatus,
  type DialDisposition,
  type OutboundCampaign,
} from "@/lib/voice-outbound-api";
import type { Tone } from "@/lib/receptionist-derive";
import { Card, CardHead, Chip, SmallBtn } from "../rx-ui";

const toError = (error: unknown) =>
  error instanceof Error ? error.message : "The request could not be completed.";
const readable = (value: string) => value.replaceAll("_", " ");

const ATTEMPT_LABEL: Record<DialAttemptStatus, { label: string; tone: Tone }> = {
  blocked: { label: "Blocked before dialing", tone: "red" },
  agent_ringing: { label: "Ringing your phone", tone: "blue" },
  agent_no_answer: { label: "Agent did not answer", tone: "amber" },
  customer_ringing: { label: "Customer leg in progress", tone: "blue" },
  answered: { label: "Answered", tone: "green" },
  voicemail: { label: "Voicemail (machine detected)", tone: "amber" },
  busy: { label: "Busy", tone: "amber" },
  no_answer: { label: "No answer", tone: "amber" },
  failed: { label: "Failed", tone: "red" },
  canceled: { label: "Canceled before customer dial", tone: "neutral" },
};

const DISPOSITIONS: { value: DialDisposition; label: string }[] = [
  { value: "interested", label: "Interested" },
  { value: "callback_requested", label: "Callback requested" },
  { value: "completed", label: "Completed" },
  { value: "not_interested", label: "Not interested" },
  { value: "wrong_number", label: "Wrong number" },
  { value: "do_not_call", label: "Do not call again" },
];

/** Run controls, the assigned agent's power dialer and the provider-confirmed attempt log. */
export function OutboundCampaignRun({ campaign }: { campaign: OutboundCampaign }) {
  const client = useQueryClient();
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [dialing, setDialing] = useState(false);
  const [disposition, setDisposition] = useState<DialDisposition>("completed");
  const [notes, setNotes] = useState("");
  const live = campaign.status === "running" || campaign.status === "paused";

  const attempts = useQuery({
    queryKey: ["voice-outbound-attempts", campaign.id],
    queryFn: () => fetchCampaignAttempts(campaign.id),
    enabled: campaign.status !== "draft",
    refetchInterval: campaign.status === "running" ? 5000 : false,
    retry: false,
  });
  const dialer = useQuery({
    queryKey: ["voice-dialer-next", campaign.id],
    queryFn: () => fetchDialerNext(campaign.id),
    enabled: campaign.callerType === "live_agent" && live,
    refetchInterval: campaign.status === "running" ? 4000 : false,
    retry: false,
  });
  const notAssigned = dialer.error instanceof ApiError && dialer.error.code === "VOICE_DIALER_NOT_ASSIGNED";

  // Same 20 s presence heartbeat as Agents & Availability, only while the agent opts in here.
  useEffect(() => {
    if (!dialing) return;
    const beat = () => void updateMyVoicePresence("available").catch(() => setDialing(false));
    beat();
    const timer = window.setInterval(beat, 20_000);
    return () => window.clearInterval(timer);
  }, [dialing]);

  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["voice-outbound-campaigns"] }),
      client.invalidateQueries({ queryKey: ["voice-outbound-attempts", campaign.id] }),
      client.invalidateQueries({ queryKey: ["voice-dialer-next", campaign.id] }),
    ]);
  };
  const report = useQuery({
    queryKey: ["voice-outbound-report", campaign.id],
    queryFn: () => fetchCampaignReport(campaign.id),
    enabled: campaign.status !== "draft" && campaign.status !== "pending_approval",
    refetchInterval: campaign.status === "running" ? 10_000 : false,
    retry: false,
  });
  const approval = useMutation({
    mutationFn: (action: "request-approval" | "approve" | "send-back") => campaignApprovalAction(campaign.id, action),
    onSuccess: async (result) => {
      setNotice({ text: `Campaign ${readable(result.status)}.` });
      await refresh();
    },
    onError: (error) => setNotice({ text: toError(error), error: true }),
  });
  const control = useMutation({
    mutationFn: (action: "start" | "pause" | "stop") => controlOutboundCampaign(campaign.id, action),
    onSuccess: async (result) => {
      setNotice({ text: `Campaign ${readable(result.status)}.` });
      await refresh();
    },
    onError: (error) => setNotice({ text: toError(error), error: true }),
  });
  const call = useMutation({
    mutationFn: (memberId: string) => placeDialAttempt(campaign.id, memberId),
    onSuccess: async (result) => {
      setNotice(
        result.placed
          ? { text: "Your phone is ringing. Answer it and the customer will be dialed." }
          : { text: `Not dialed: ${readable(result.reasonCode ?? "blocked")}. The contact was re-checked and blocked.`, error: true },
      );
      await refresh();
    },
    onError: (error) => setNotice({ text: toError(error), error: true }),
  });
  const skip = useMutation({
    mutationFn: (memberId: string) => skipDialContact(campaign.id, memberId),
    onSuccess: refresh,
    onError: (error) => setNotice({ text: toError(error), error: true }),
  });
  const outcome = useMutation({
    mutationFn: (attemptId: string) => saveDialDisposition(attemptId, disposition, notes.trim()),
    onSuccess: async (result) => {
      setNotice({
        text:
          result.disposition === "do_not_call"
            ? "Saved. The number was added to the suppression list and will not be called again."
            : "Call outcome saved.",
      });
      setNotes("");
      setDisposition("completed");
      await refresh();
    },
    onError: (error) => setNotice({ text: toError(error), error: true }),
  });

  const next = dialer.data;
  const busy = control.isPending || call.isPending;

  return (
    <Card overflow>
      <CardHead
        title="Run campaign"
        sub={campaign.callerType === "ai_voice" ? "AI outbound calling is not available yet" : "Human power dialer"}
        right={<Chip tone={campaign.status === "running" ? "green" : campaign.status === "paused" ? "amber" : "neutral"}>{readable(campaign.status)}</Chip>}
      />
      <div className="flex flex-col gap-3 p-3.5">
        {notice ? (
          <p role={notice.error ? "alert" : "status"} className={`rounded-[8px] border p-2.5 text-[11px] ${notice.error ? "border-[#FBD5D2] bg-[#FEF3F2] text-[#B42318]" : "border-[#D5E8DA] bg-[#F0FDF4] text-[#166534]"}`}>
            {notice.text}
          </p>
        ) : null}

        {campaign.callerType === "ai_voice" ? (
          <p className="text-[11px] leading-[1.6] text-[#64748B]">
            This draft can be previewed, but AI agents do not place outbound calls yet. Use a human agent campaign to dial.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {campaign.status === "draft" ? (
              <SmallBtn disabled={approval.isPending || !campaign.eligibilityCheckedAt} onClick={() => approval.mutate("request-approval")}>
                Request approval
              </SmallBtn>
            ) : null}
            {campaign.status === "pending_approval" ? (
              <>
                <SmallBtn disabled={approval.isPending} onClick={() => approval.mutate("approve")}>Approve</SmallBtn>
                <SmallBtn disabled={approval.isPending} onClick={() => approval.mutate("send-back")}>Send back to draft</SmallBtn>
                <span className="self-center text-[10px] text-[#7A8798]">A different manager approves; the owner may approve their own.</span>
              </>
            ) : null}
            {campaign.status === "approved" ? (
              <>
                <SmallBtn disabled={busy} onClick={() => control.mutate("start")}>Start now</SmallBtn>
                <SmallBtn disabled={approval.isPending} onClick={() => approval.mutate("send-back")}>Send back to draft</SmallBtn>
                <span className="self-center text-[10px] text-[#7A8798]">
                  {campaign.scheduledAt ? `Starts automatically at ${new Date(campaign.scheduledAt).toLocaleString()}.` : "No schedule set; start it when ready."}
                </span>
              </>
            ) : null}
            {campaign.status === "paused" ? (
              <SmallBtn disabled={busy} onClick={() => control.mutate("start")}>Resume</SmallBtn>
            ) : null}
            {campaign.status === "running" ? <SmallBtn disabled={busy} onClick={() => control.mutate("pause")}>Pause</SmallBtn> : null}
            {live || campaign.status === "approved" ? <SmallBtn disabled={busy} onClick={() => control.mutate("stop")}>Stop for good</SmallBtn> : null}
            {campaign.status === "draft" && !campaign.eligibilityCheckedAt ? (
              <span className="self-center text-[10px] text-[#7A8798]">Run the eligibility preview first.</span>
            ) : null}
          </div>
        )}

        {live && campaign.callerType === "live_agent" ? (
          <section className="rounded-[10px] border border-[#E6E8EC] p-3">
            <h3 className="text-[12px] font-extrabold text-[#334155]">Power dialer</h3>
            {notAssigned ? (
              <p className="mt-1.5 text-[11px] text-[#64748B]">
                Only {campaign.humanAgent?.name ?? "the assigned agent"} can dial this campaign.
              </p>
            ) : dialer.error ? (
              <p className="mt-1.5 text-[11px] text-[#B42318]">{toError(dialer.error)}</p>
            ) : !next ? (
              <p className="mt-1.5 text-[11px] text-[#7A8798]">Loading…</p>
            ) : (
              <div className="mt-2 flex flex-col gap-2.5 text-[11px]">
                <label className="flex items-center gap-2 font-semibold text-[#334155]">
                  <input type="checkbox" checked={dialing} onChange={(event) => setDialing(event.target.checked)} />
                  I&apos;m available to dial (keeps my status Available while this page is open)
                </label>
                {!next.agentAvailable ? (
                  <p className="text-[#9A6700]">You are not Available, so nothing can be dialed.</p>
                ) : null}
                <p className="rounded-[8px] bg-[#F7F9FB] p-2 leading-[1.55] text-[#475569]">
                  <span className="font-bold">Opening script: </span>
                  {next.openingScript}
                </p>
                {next.inFlight ? (
                  <div className="flex items-center justify-between gap-2 rounded-[8px] border border-[#DBE7F6] bg-[#F5F9FF] p-2.5">
                    <span>{next.inFlight.contactName} <span className="text-[#7A8798]">{next.inFlight.phone}</span></span>
                    <Chip tone={ATTEMPT_LABEL[next.inFlight.status].tone}>{ATTEMPT_LABEL[next.inFlight.status].label}</Chip>
                  </div>
                ) : null}
                {next.awaitingDisposition ? (
                  <form
                    className="grid gap-2 rounded-[8px] border border-[#D5E8DA] bg-[#F0FDF4] p-2.5"
                    onSubmit={(event) => {
                      event.preventDefault();
                      outcome.mutate(next.awaitingDisposition!.id);
                    }}
                  >
                    <span className="font-bold text-[#166534]">
                      Outcome for {next.awaitingDisposition.contactName}
                      {next.awaitingDisposition.durationSec != null ? ` · ${next.awaitingDisposition.durationSec}s` : ""}
                    </span>
                    <select className="h-[32px] rounded-[7px] border border-[#D5DAE2] bg-white px-2" value={disposition} onChange={(event) => setDisposition(event.target.value as DialDisposition)}>
                      {DISPOSITIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                    <input className="h-[32px] rounded-[7px] border border-[#D5DAE2] bg-white px-2" maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes (optional)" />
                    <button type="submit" disabled={outcome.isPending} className="h-[30px] rounded-[8px] bg-[#16A34A] px-3 text-[12px] font-bold text-white disabled:opacity-60">
                      {outcome.isPending ? "Saving…" : "Save outcome"}
                    </button>
                  </form>
                ) : null}
                {next.contact ? (
                  <div className="rounded-[8px] border border-[#E6E8EC] p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span>
                        <span className="block text-[12px] font-extrabold text-[#243041]">{next.contact.name}</span>
                        <span className="text-[#7A8798]">{next.contact.phone} · attempt {next.contact.attemptCount + 1} of {next.contact.maxAttempts}</span>
                      </span>
                      <Chip tone="neutral">{readable(next.contact.status)}</Chip>
                    </div>
                    {next.contact.priorAttempts.length ? (
                      <ul className="mt-2 text-[10px] text-[#64748B]">
                        {next.contact.priorAttempts.map((row) => (
                          <li key={row.id}>{new Date(row.createdAt).toLocaleString()} · {ATTEMPT_LABEL[row.status].label}{row.disposition ? ` · ${readable(row.disposition)}` : ""}</li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="mt-2.5 flex gap-2">
                      <SmallBtn
                        disabled={busy || !next.agentAvailable || !!next.inFlight || !!next.awaitingDisposition || campaign.status !== "running"}
                        onClick={() => call.mutate(next.contact!.memberId)}
                      >
                        {call.isPending ? "Checking & calling…" : "Call now"}
                      </SmallBtn>
                      <SmallBtn disabled={skip.isPending || !!next.inFlight} onClick={() => skip.mutate(next.contact!.memberId)}>Skip</SmallBtn>
                    </div>
                  </div>
                ) : !next.inFlight && !next.awaitingDisposition ? (
                  <p className="text-[#7A8798]">No contact is callable right now (all called, blocked, at their attempt limit or cooling down).</p>
                ) : null}
                <p className="text-[10px] leading-[1.5] text-[#7A8798]">
                  Each call re-checks consent, opt-out, suppression and calling hours first. Your own phone rings, and the customer is dialed from the business number only after you answer.
                </p>
              </div>
            )}
          </section>
        ) : null}

        {report.data ? (
          <section className="rounded-[10px] border border-[#E6E8EC] p-3">
            <h3 className="mb-2 text-[12px] font-extrabold text-[#334155]">Report</h3>
            <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
              {[
                ["Contacts", String(report.data.contacts)],
                ["Customer dials", String(report.data.customerDialed)],
                ["Connect rate", report.data.connectRate == null ? "—" : `${Math.round(report.data.connectRate * 100)}%`],
                ["Voicemails", String(report.data.voicemails)],
                ["Blocked tries", report.data.blockedRate == null ? "—" : `${report.data.blockedAttempts} (${Math.round(report.data.blockedRate * 100)}%)`],
                ["Opt-outs", String(report.data.optOuts)],
                ["Dials per reached contact", report.data.averageDialsPerContactedContact == null ? "—" : report.data.averageDialsPerContactedContact.toFixed(1)],
                ["Talk time", `${Math.round(report.data.talkSeconds / 60)} min`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[8px] bg-[#F7F9FB] p-2">
                  <div className="text-[14px] font-extrabold tabular-nums">{value}</div>
                  <div className="text-[10px] text-[#7A8798]">{label}</div>
                </div>
              ))}
            </div>
            {Object.keys(report.data.dispositions).length ? (
              <p className="mb-0 mt-2 text-[10.5px] text-[#64748B]">
                Outcomes: {Object.entries(report.data.dispositions).map(([key, n]) => `${readable(key)} ${n}`).join(" · ")}
              </p>
            ) : null}
            {Object.keys(report.data.blockedReasons).length ? (
              <p className="mb-0 mt-1 text-[10.5px] text-[#64748B]">
                Blocked because: {Object.entries(report.data.blockedReasons).map(([key, n]) => `${readable(key)} ${n}`).join(" · ")}
              </p>
            ) : null}
            <p className="mb-0 mt-1 text-[10px] text-[#94A3B8]">Provider cost and revenue are not attributed to campaigns yet.</p>
          </section>
        ) : null}

        {campaign.status !== "draft" ? (
          <section>
            <h3 className="mb-1.5 text-[12px] font-extrabold text-[#334155]">Attempts</h3>
            {attempts.error ? (
              <p className="text-[11px] text-[#7A8798]">{toError(attempts.error)}</p>
            ) : !(attempts.data?.attempts ?? []).length ? (
              <p className="text-[11px] text-[#7A8798]">No dial attempts yet.</p>
            ) : (
              <div className="max-h-[260px] overflow-y-auto">
                {(attempts.data?.attempts ?? []).map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-2 border-b border-[#EEF0F3] py-1.5 text-[11px] last:border-0">
                    <span className="min-w-0 truncate">
                      {row.contactName} <span className="text-[#7A8798]">{row.phone} · {new Date(row.createdAt).toLocaleTimeString()}</span>
                      {row.blockReasonCode ? <span className="text-[#B42318]"> · {readable(row.blockReasonCode)}</span> : null}
                      {row.disposition ? <span className="text-[#475569]"> · {readable(row.disposition)}</span> : null}
                    </span>
                    <Chip tone={ATTEMPT_LABEL[row.status].tone}>{ATTEMPT_LABEL[row.status].label}</Chip>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </div>
    </Card>
  );
}
