"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  completeCallback,
  fetchMissedCalls,
  placeCallback,
  type CallbackAttemptStatus,
  type CallbackOutcome,
  type MissedCallItem,
} from "@/lib/voice-callbacks-api";
import type { Tone } from "@/lib/receptionist-derive";
import { Card, CardHead, Chip, EmptyState, KpiCard, SmallBtn, kpiGrid } from "../rx-ui";

const toError = (error: unknown) =>
  error instanceof Error ? error.message : "The request could not be completed.";
const readable = (value: string) => value.replaceAll("_", " ");
const when = (value: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

const ATTEMPT: Record<CallbackAttemptStatus, { label: string; tone: Tone }> = {
  blocked: { label: "Blocked before dialing", tone: "red" },
  agent_ringing: { label: "Ringing your phone", tone: "blue" },
  agent_no_answer: { label: "You did not answer", tone: "amber" },
  customer_ringing: { label: "Calling the caller", tone: "blue" },
  answered: { label: "Connected", tone: "green" },
  busy: { label: "Busy", tone: "amber" },
  no_answer: { label: "No answer", tone: "amber" },
  failed: { label: "Failed", tone: "red" },
  canceled: { label: "Eligible · dial manually", tone: "neutral" },
};

const OUTCOMES: { value: CallbackOutcome; label: string }[] = [
  { value: "resolved", label: "Resolved" },
  { value: "booked", label: "Booked" },
  { value: "no_longer_needed", label: "No longer needed" },
  { value: "unreachable", label: "Unreachable — stop trying" },
  { value: "wrong_number", label: "Wrong number" },
  { value: "do_not_call", label: "Do not call again" },
];

/** Missed Calls & Call-backs: every call-back is compliance-checked before anything is dialed. */
export function MissedCallsScreen() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["voice-missed-calls"], queryFn: fetchMissedCalls, refetchInterval: 5000 });
  const [confirmFor, setConfirmFor] = useState<MissedCallItem | null>(null);
  const [requested, setRequested] = useState(false);
  const [closeFor, setCloseFor] = useState<MissedCallItem | null>(null);
  const [outcome, setOutcome] = useState<CallbackOutcome>("resolved");
  const [notes, setNotes] = useState("");
  const [notice, setNotice] = useState<{ text: string; error?: boolean; dial?: string } | null>(null);
  const [showHandled, setShowHandled] = useState(false);

  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ["voice-missed-calls"] }),
      client.invalidateQueries({ queryKey: ["rx-insights"] }),
      client.invalidateQueries({ queryKey: ["rx-queue"] }),
    ]);
  const place = useMutation({
    mutationFn: (item: MissedCallItem) => placeCallback(item.callId, requested),
    onSuccess: async (result) => {
      setConfirmFor(null);
      setNotice({
        text: result.eligible ? result.message : `Not called: ${readable(result.reasonCode ?? "blocked")}. ${result.message}`,
        error: !result.eligible,
        dial: result.manualDialNumber ?? undefined,
      });
      await refresh();
    },
    onError: (error) => setNotice({ text: toError(error), error: true }),
  });
  const close = useMutation({
    mutationFn: (item: MissedCallItem) => completeCallback(item.callback!.id, outcome, notes.trim()),
    onSuccess: async (result) => {
      setCloseFor(null);
      setNotes("");
      setNotice({
        text:
          result.outcome === "do_not_call"
            ? "Closed. The number was added to the suppression list."
            : "Call-back closed and the missed call marked handled.",
      });
      await refresh();
    },
    onError: (error) => setNotice({ text: toError(error), error: true }),
  });

  if (query.isPending) return <Card pad={20}><p className="text-[12px] text-[color:var(--app-text-faintest,#667085)]">Loading missed calls…</p></Card>;
  if (query.isError) return <Card pad={20}><p role="alert" className="text-[12px] text-[#B42318]">{toError(query.error)}</p></Card>;

  const data = query.data;
  const items = data.items.filter((item) => showHandled || !item.resolvedAt);

  return (
    <div className="flex flex-col gap-[18px]">
      <div>
        <h1 className="m-0 text-[18px] font-extrabold tracking-[-.02em] text-[#0F172A]">Missed Calls &amp; Call-backs</h1>
        <p className="mb-0 mt-1 max-w-[820px] text-[12px] leading-[1.6] text-[#667085]">
          Missed and callback-requested calls from the last {data.windowDays} days. Every call-back first checks consent,
          opt-out, the suppression list and calling hours. Your phone rings first; the caller is dialed from the business
          number only after you answer.
        </p>
      </div>

      <div style={kpiGrid(160)}>
        <KpiCard label="Open" value={String(data.summary.open)} sub="Missed or callback requested, not handled" tone={data.summary.open ? "amber" : undefined} />
        <KpiCard label="Never called back" value={String(data.summary.neverCalledBack)} sub="Open, no call-back attempt yet" />
        <KpiCard label="Blocked on last try" value={String(data.summary.blockedLastTry)} sub="Eligibility check refused" />
        <KpiCard label="Recovered" value={String(data.summary.recovered)} sub="Closed as resolved or booked" tone="green" />
      </div>

      {notice ? (
        <p role={notice.error ? "alert" : "status"} className={`m-0 rounded-[9px] border p-3 text-[12px] ${notice.error ? "border-[#FBD5D2] bg-[#FEF3F2] text-[#B42318]" : "border-[#D5E8DA] bg-[#F0FDF4] text-[#166534]"}`}>
          {notice.text}
          {notice.dial ? (
            <a href={`tel:${notice.dial}`} className="ml-2 font-bold text-[#15803D]">Dial {notice.dial}</a>
          ) : null}
        </p>
      ) : null}

      <Card overflow>
        <CardHead
          title="Call-back list"
          sub={`${items.length} shown · caller numbers are from the call log`}
          right={
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[#475569]">
              <input type="checkbox" checked={showHandled} onChange={(event) => setShowHandled(event.target.checked)} />
              Show handled
            </label>
          }
        />
        {!items.length ? (
          <EmptyState icon="circle-check" title="Nothing to call back" body="Missed calls and callback requests appear here until they are handled." />
        ) : (
          <div className="divide-y divide-[#EEF0F3]">
            {items.map((item) => {
              const cb = item.callback;
              const last = cb?.attempts[0];
              const busy = cb?.status === "calling";
              return (
                <div key={item.callId} className="px-[18px] py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-extrabold tabular-nums text-[#101828]">{item.caller}</span>
                        <Chip tone={item.status === "missed" ? "red" : "amber"}>{item.status === "missed" ? "Missed" : "Callback requested"}</Chip>
                        {item.resolvedAt ? <Chip tone="green">Handled</Chip> : null}
                        {cb?.outcome ? <Chip tone="neutral">{readable(cb.outcome)}</Chip> : null}
                        {item.trackingSource ? <Chip tone="blue">Source · {item.trackingSource}</Chip> : null}
                        {item.textBack ? <TextBackChip textBack={item.textBack} /> : null}
                      </div>
                      <div className="mt-1 text-[11px] text-[#667085]">
                        {when(item.startedAt)} · {cb ? `${cb.attemptCount} call-back${cb.attemptCount === 1 ? "" : "s"} connected to the caller` : "not called back"}
                        {cb?.lastAttemptAt ? ` · last ${when(cb.lastAttemptAt)}` : ""}
                      </div>
                      {last ? (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                          <Chip tone={ATTEMPT[last.status].tone}>{ATTEMPT[last.status].label}</Chip>
                          {last.blockReasonCode && last.status !== "canceled" ? <span className="text-[#B42318]">{readable(last.blockReasonCode)}</span> : null}
                          {last.durationSec != null ? <span className="text-[#667085]">{last.durationSec}s</span> : null}
                        </div>
                      ) : null}
                    </div>
                    {!item.resolvedAt ? (
                      <div className="flex gap-2">
                        <SmallBtn disabled={busy || place.isPending} onClick={() => { setRequested(false); setConfirmFor(item); setCloseFor(null); }}>
                          {busy ? "Calling…" : "Call back"}
                        </SmallBtn>
                        {cb && !busy ? <SmallBtn onClick={() => { setCloseFor(item); setConfirmFor(null); }}>Close</SmallBtn> : null}
                      </div>
                    ) : null}
                  </div>

                  {confirmFor?.callId === item.callId ? (
                    <div className="mt-3 grid gap-2 rounded-[9px] border border-[#E6E8EC] bg-[#FAFBFC] p-3 text-[11.5px]">
                      <label className="flex items-start gap-2 text-[#334155]">
                        <input type="checkbox" className="mt-0.5" checked={requested} onChange={(event) => setRequested(event.target.checked)} />
                        <span>
                          The caller asked to be called back (for example in a voicemail or message). This is saved as consent
                          evidence tied to this call, under your name. Leave unticked if you only have the missed call.
                        </span>
                      </label>
                      <div className="flex gap-2">
                        <SmallBtn disabled={place.isPending} onClick={() => place.mutate(item)}>{place.isPending ? "Checking…" : "Check & call"}</SmallBtn>
                        <SmallBtn onClick={() => setConfirmFor(null)}>Cancel</SmallBtn>
                      </div>
                    </div>
                  ) : null}

                  {closeFor?.callId === item.callId ? (
                    <form
                      className="mt-3 grid gap-2 rounded-[9px] border border-[#E6E8EC] bg-[#FAFBFC] p-3 sm:grid-cols-[200px_1fr_auto]"
                      onSubmit={(event) => {
                        event.preventDefault();
                        close.mutate(item);
                      }}
                    >
                      <select className="h-9 rounded-[8px] border border-[#D5DAE2] bg-white px-2 text-[12px]" value={outcome} onChange={(event) => setOutcome(event.target.value as CallbackOutcome)}>
                        {OUTCOMES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                      <input className="h-9 rounded-[8px] border border-[#D5DAE2] bg-white px-2 text-[12px]" maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Notes (optional)" />
                      <button type="submit" disabled={close.isPending} className="h-9 rounded-[8px] bg-[color:var(--app-primary-hover,#0e8442)] px-3 text-[12px] font-bold text-white disabled:opacity-60">
                        {close.isPending ? "Saving…" : "Close call-back"}
                      </button>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
        <div className="border-t border-[#EEF0F3] bg-[#FCFCFD] px-[18px] py-3 text-[11px] leading-5 text-[#667085]">
          When &ldquo;Text missed callers&rdquo; is on (AI &amp; Governance settings), each missed caller gets one message
          unless the number is suppressed or the customer opted out; the label shows the provider&apos;s delivery status. If
          Noxtill cannot place calls on this server, a passed check offers your own phone&apos;s dialer instead; those calls are
          not recorded. No external Do Not Call registry is checked.
        </div>
      </Card>
    </div>
  );
}

const TEXT_BACK_LABEL: Record<NonNullable<MissedCallItem["textBack"]>["status"], string> = {
  queued: "Text-back sent to provider",
  disabled: "Text-back off",
  skipped_suppressed: "Not texted · suppressed",
  skipped_opted_out: "Not texted · opted out",
  skipped_test_call: "Not texted · test call",
  failed: "Text-back failed",
};

function TextBackChip({ textBack }: { textBack: NonNullable<MissedCallItem["textBack"]> }) {
  if (textBack.status !== "queued") {
    return <Chip tone={textBack.status === "failed" ? "red" : "neutral"}>{TEXT_BACK_LABEL[textBack.status]}</Chip>;
  }
  const delivery = textBack.delivery;
  const tone: Tone = delivery === "delivered" || delivery === "read" ? "green" : delivery === "failed" ? "red" : "blue";
  const label =
    delivery === "delivered" || delivery === "read"
      ? "Text delivered"
      : delivery === "failed"
        ? "Text not delivered"
        : delivery === "sent"
          ? "Text sent · awaiting delivery"
          : "Text queued";
  return <Chip tone={tone}>{label}{textBack.channel ? ` · ${textBack.channel}` : ""}</Chip>;
}
