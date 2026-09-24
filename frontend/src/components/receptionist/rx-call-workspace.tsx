"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { TOPIC_LABELS, fetchCallContext, fetchRecordingUrl, type CallContext, type EnrichedCall } from "@/lib/voice-calls-api";
import { formatCurrency } from "@/lib/format";
import { useSession } from "@/lib/session";
import {
  bookingRef,
  callerName,
  confidenceChip,
  directionIcon,
  fmtClock,
  fmtDateTime,
  fmtDuration,
  fmtWhen,
  firstCallerLine,
  handlerChip,
  intentLabel,
  isLead,
  matchChip,
  needsFollowUp,
  outcomeChip,
  sentimentChip,
  statusChip,
} from "@/lib/receptionist-derive";
import { Ico } from "./rx-icon";
import { ChipFor } from "./rx-ui";
import { CALL_SECTIONS, useRxStore, type CallSection, type PanelRow } from "./rx-store";
import { useRx } from "./rx-data";
import { Bullets, NoteBox, RowTable } from "./rx-overlays";
import { useCallActions } from "./rx-call-actions";

interface SectionData {
  lineage: string;
  rows: PanelRow[];
  title: string;
  bullets: string[];
  note: string;
  transcript?: { speaker: "Caller" | "AI" | "System" | "Staff"; text: string; time: string }[];
}

const offset = (iso: string, start: string): string => {
  const s = Math.max(0, Math.round((new Date(iso).getTime() - new Date(start).getTime()) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function CallWorkspace() {
  const open = useRxStore((s) => s.call);
  const rx = useRx();
  const call = open ? rx.calls.find((c) => c.id === open.id) : undefined;
  if (!open || !call) return null;
  return <Workspace key={call.id} call={call} section={open.section} />;
}

function Workspace({ call, section }: { call: EnrichedCall; section: CallSection }) {
  const router = useRouter();
  const { business } = useSession();
  const rx = useRx();
  const closeOverlays = useRxStore((s) => s.closeOverlays);
  const setSection = useRxStore((s) => s.setSection);
  const openPanel = useRxStore((s) => s.openPanel);
  const notify = useRxStore((s) => s.notify);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [summarising, setSummarising] = useState(false);

  const { data: ctx } = useQuery({ queryKey: ["rx-call-context", call.id], queryFn: () => fetchCallContext(call.id), staleTime: 30_000 });
  const money = (n: number) => formatCurrency(n, business.currency, business.locale);
  const tz = rx.timezone;
  const missed = call.status === "missed";
  const when = fmtWhen(call.startedAt, tz, rx.today, call.localDay);
  const status = statusChip(call);
  const hasTranscript = call.transcript.length > 0;
  const data = sectionFor(section, call, ctx, { tz, money, businessName: rx.insights?.businessName ?? "your business", maxTurns: rx.insights?.limits.maxCallTurns ?? 8, retentionDays: rx.insights?.limits.retentionDays ?? 90, transferConfigured: !!rx.insights?.transferConfigured, customIntents: rx.settings?.customIntents.length ?? 0, holdMessage: !!rx.settings?.queueHoldMessage, shareCatalog: rx.settings?.shareCatalog ?? true, shareOrderStatus: rx.settings?.shareOrderStatus ?? false, shareCreditBalance: rx.settings?.shareCreditBalance ?? false, today: rx.today });

  const playRecording = async () => {
    if (call.recordingDeletedAt) {
      notify("The recording was deleted", `Deleted on ${fmtDateTime(call.recordingDeletedAt, tz)}. The call log stays; the audio and transcript are gone.`);
      return;
    }
    if (!call.hasRecording) {
      notify("No recording exists", missed ? "This call was never answered, so nothing was recorded. Noxtill will not show a player for audio that does not exist." : "No audio was kept for this call.");
      return;
    }
    setLoadingAudio(true);
    try {
      const { url } = await fetchRecordingUrl(call.id);
      if (url) setAudioUrl(url);
      else notify("No recording exists", "The recording is no longer stored.");
    } catch {
      notify("Couldn't load the recording", "Please try again.", "error");
    } finally {
      setLoadingAudio(false);
    }
  };

  const ca = useCallActions();
  const doCallBack = () => ca.callBack(call);
  const openAssign = () => ca.assign(call);

  const openTrace = () =>
    openPanel({
      kicker: "Answer trace",
      title: "What the AI had to work with",
      badge: "Sources, not reasoning",
      badgeTone: "purple",
      rows: [
        { label: "Customer match", value: call.customer ? `${call.customer.name} · saved phone number` : "None — number not on any customer record" },
        { label: "Intent recorded", value: intentLabel(call) },
        { label: "Records given to the AI", value: [...new Set(call.transcript.flatMap((t) => t.analysis?.sources ?? []))].join(" · ") || "None — only the conversation", tone: call.transcript.some((t) => t.analysis?.sources?.length) ? undefined : "muted" },
        { label: "Appointment created", value: call.appointment ? `${call.appointment.serviceName} · ${fmtDateTime(call.appointment.startsAt, tz)}` : "No" },
        { label: "Answers declined", value: String(call.analysis?.declinedCount ?? 0), tone: call.analysis?.declinedCount ? "neg" : undefined },
        { label: "Confidence", value: call.analysis?.confidence ? call.analysis.confidence[0].toUpperCase() + call.analysis.confidence.slice(1) : "Not reported", tone: call.analysis?.confidence ? undefined : "muted" },
        { label: "Routing rule applied", value: call.routedRuleName ?? "None", tone: call.routedRuleName ? undefined : "muted" },
      ],
      bulletsTitle: "What a trace shows and does not show",
      bullets: [
        "The AI is given the words spoken on this call, your custom situations and your hold message — plus, on each turn, only the records that matched what the caller said",
        call.outcome === "booking" ? "The booking was created through Bookings, which rejects a time that isn't free" : "No booking was made from this call",
        "It does not expose private model reasoning — only what was said, what it was given and what was recorded",
        "“Given to the AI” means the record was put in front of it, not that the reply used it",
      ],
      note: "An answer with no traceable source would be a guess, so Noxtill lists only what actually exists on the record.",
      secondary: "Close",
    });

  const next = nextStep(call);
  const actions: { label: string; icon: string; risky?: boolean; disabled?: boolean; onClick: () => void }[] = [
    { label: "Call back", icon: "phone-outgoing", onClick: doCallBack },
    { label: loadingAudio ? "Loading…" : "Play recording", icon: "play", disabled: !call.hasRecording, onClick: () => void playRecording() },
    { label: "Open customer", icon: "user-round", disabled: !call.customer && !call.appointment, onClick: () => router.push(`/customers/${call.customer?.id ?? call.appointment!.customerId}`) },
    { label: "Open booking", icon: "calendar-check", disabled: !call.appointment, onClick: () => router.push("/bookings/appointments") },
    { label: "Create follow-up", icon: "bell", disabled: !!call.resolvedAt || !!call.callbackRequestedAt, onClick: () => void rx.actions.offerCallback(call.id) },
    { label: call.assignedToName ? "Reassign staff" : "Assign staff", icon: "users-round", onClick: openAssign },
    ...(needsFollowUp(call) ? [{ label: "Mark handled", icon: "circle-check", onClick: () => void rx.actions.markHandled(call.id) }] : []),
    { label: call.noteCount ? `Add note · ${call.noteCount}` : "Add note", icon: "pencil", onClick: () => ca.addNote(call) },
    ...(call.status === "in_progress"
      ? [
          { label: "Transfer", icon: "phone-forwarded", onClick: () => ca.transfer(call) },
          { label: "End call", icon: "phone-off", risky: true, onClick: () => ca.endCall(call) },
        ]
      : []),
    { label: "Delete recording", icon: "trash-2", risky: true, disabled: !call.hasRecording && call.transcript.length === 0, onClick: () => ca.deleteRecording(call) },
  ];

  return (
    <div onClick={closeOverlays} className="fixed inset-0 z-[80] flex justify-end" style={{ background: "rgba(12,23,39,.38)" }}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-[820px] max-w-full flex-col bg-white"
        style={{ boxShadow: "-18px 0 44px rgba(12,23,39,.16)", animation: "nxDrawerIn .22s cubic-bezier(.2,.8,.3,1)" }}
      >
        {/* header */}
        <div className="flex items-start gap-[13px] border-b border-[#EEF0F3] px-5 py-4">
          <div
            className="flex h-11 w-11 flex-none items-center justify-center rounded-[12px]"
            style={{ background: missed ? "#FEE4E2" : status.tone === "blue" ? "#EFF6FF" : "#ECFDF3", color: missed ? "#B42318" : status.tone === "blue" ? "#1D4ED8" : "#15803D" }}
          >
            <Ico name={directionIcon(call)} size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-extrabold tracking-[-.015em]" style={{ textWrap: "pretty" }}>
              {callerName(call)}
            </div>
            <div className="mt-[3px] font-mono text-[11.5px] text-[#7A8798]">
              {call.fromNumber} · {when} · {fmtDuration(call.durationSeconds)} · {rx.insights?.businessName ?? "Your business"}
            </div>
            <div className="mt-[9px] flex flex-wrap items-center gap-[7px]">
              <ChipFor spec={status} h={23} fontSize={10.5} />
              <ChipFor spec={handlerChip(call.handledBy)} h={23} fontSize={10.5} />
              <ChipFor spec={matchChip(call)} h={23} fontSize={10.5} />
              <ChipFor spec={{ label: intentLabel(call), tone: "neutral" }} h={23} fontSize={10.5} />
              <ChipFor spec={outcomeChip(call)} h={23} fontSize={10.5} />
              {confidenceChip(call.analysis?.confidence ?? null) ? <ChipFor spec={confidenceChip(call.analysis?.confidence ?? null)!} h={23} fontSize={10.5} /> : null}
              {sentimentChip(call.analysis?.sentiment ?? null) ? <ChipFor spec={sentimentChip(call.analysis?.sentiment ?? null)!} h={23} fontSize={10.5} /> : null}
              {call.routedRuleName ? <ChipFor spec={{ label: `Rule: ${call.routedRuleName}`, tone: "blue", icon: "list-ordered" }} h={23} fontSize={10.5} /> : null}
            </div>
          </div>
          <button type="button" onClick={closeOverlays} aria-label="Close" className="flex h-[30px] w-[30px] flex-none cursor-pointer items-center justify-center rounded-[9px] border-0 bg-transparent text-[#7A8798] hover:bg-[#F1F3F6] hover:text-[#0F172A]">
            <Ico name="x" size={16} strokeWidth={2.25} />
          </button>
        </div>

        {/* summary */}
        <div className="border-b border-[#EEF0F3] bg-[#FAFBFC] px-5 py-3.5">
          <div className="flex flex-wrap items-center gap-[9px]">
            <Ico name="audio-lines" size={15} className="text-[#45505F]" />
            <div className="text-[11px] font-bold uppercase tracking-[.08em] text-[#7A8798]">Call summary</div>
            <div className="ml-auto flex flex-wrap gap-[7px]">
              <button
                type="button"
                onClick={() => void playRecording()}
                className="flex h-[30px] cursor-pointer items-center gap-1.5 rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 text-[12px] font-bold hover:bg-[#F1F3F6]"
                style={call.hasRecording ? undefined : { opacity: 0.55, cursor: "not-allowed" }}
              >
                <Ico name="play" size={13} />
                {call.recordingDeletedAt ? "Recording deleted" : call.hasRecording ? (loadingAudio ? "Loading…" : "Play recording") : "No recording"}
              </button>
              <button type="button" onClick={() => setSection("Transcript")} className="flex h-[30px] cursor-pointer items-center gap-1.5 rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 text-[12px] font-bold hover:bg-[#F1F3F6]">
                <Ico name="audio-lines" size={13} />
                Transcript
              </button>
            </div>
          </div>
          {audioUrl ? <audio controls autoPlay src={audioUrl} className="mt-3 h-9 w-full" /> : null}
          <div className="mt-[9px] text-[12.5px] leading-[1.6] text-[#0F172A]" style={{ textWrap: "pretty" }}>
            {call.summary ? (
              call.summary
            ) : missed ? (
              `Missed call from ${call.fromNumber} at ${fmtClock(call.startedAt, tz)}. It was never answered, so there is no transcript or recording, and Noxtill doesn't guess why they rang.`
            ) : hasTranscript ? (
              <span className="text-[#5B6675]">
                No summary has been written for this call yet.{" "}
                <button
                  type="button"
                  disabled={summarising}
                  onClick={async () => {
                    setSummarising(true);
                    await rx.actions.summarise(call.id);
                    setSummarising(false);
                  }}
                  className="cursor-pointer border-0 bg-transparent p-0 font-bold text-[#15803D] underline disabled:opacity-60"
                >
                  {summarising ? "Writing…" : "Write one from the transcript"}
                </button>
              </span>
            ) : (
              "This call has no transcript, so there is nothing to summarise."
            )}
          </div>
          {call.summary ? <div className="mt-1.5 text-[10.5px] text-[#94A3B8]">Written by AI from the transcript alone{call.summaryGeneratedAt ? ` · ${fmtDateTime(call.summaryGeneratedAt, tz)}` : ""}</div> : null}
        </div>

        {/* what should I do */}
        <div className="border-b border-[#EEF0F3] bg-[#FBFAFF] px-5 py-3.5">
          <div className="flex items-center gap-[9px]">
            <div className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-[8px] bg-[#F5F3FF] text-[#6D28D9]">
              <Ico name="sparkles" size={14} />
            </div>
            <div className="text-[11px] font-bold uppercase tracking-[.09em] text-[#6D28D9]">What should I do?</div>
            <div className="ml-auto">
              <ChipFor spec={{ label: "From the call record", tone: "neutral" }} h={23} fontSize={10.5} />
            </div>
          </div>
          <div className="mt-2.5 text-[13.5px] font-extrabold" style={{ textWrap: "pretty" }}>
            {next.title}
          </div>
          <div className="mt-[5px] text-[12px] leading-[1.55] text-[#45505F]" style={{ textWrap: "pretty" }}>
            {next.why}
          </div>
          <div className="mt-[11px] flex flex-wrap items-center gap-[7px]">
            <button
              type="button"
              onClick={next.actionable ? doCallBack : () => setSection("Summary")}
              className="flex h-8 cursor-pointer items-center rounded-[9px] border-0 bg-[#16A34A] px-3 text-[12.5px] font-bold text-white hover:bg-[#15803D]"
            >
              {next.actionable ? "Take action" : "Open call"}
            </button>
            <button type="button" onClick={openTrace} className="flex h-8 cursor-pointer items-center rounded-[9px] border border-[#D5DAE2] bg-white px-3 text-[12.5px] font-bold text-[#45505F] hover:bg-[#F1F3F6]">
              Answer trace
            </button>
            <div className="ml-auto text-[10.5px] text-[#94A3B8]">{next.evidence}</div>
          </div>
        </div>

        {/* section tabs */}
        <div className="flex gap-[3px] overflow-x-auto border-b border-[#EEF0F3] px-5">
          {CALL_SECTIONS.map((label) => {
            const on = section === label;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setSection(label)}
                className="cursor-pointer whitespace-nowrap border-0 bg-transparent px-[9px] py-[11px] text-[12.5px]"
                style={{ fontWeight: on ? 700 : 600, color: on ? "#0F172A" : "#5B6675", boxShadow: on ? "inset 0 -2px 0 #16A34A" : "none" }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* section body */}
        <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-5 py-[18px]">
          {data.transcript ? (
            <div className="flex flex-none flex-col gap-2.5">
              {data.transcript.map((t, i) => (
                <div
                  key={i}
                  className="flex items-start gap-[11px] rounded-[11px] px-[13px] py-[11px]"
                  style={{ border: `1px solid ${t.speaker === "AI" ? "#DDD3FE" : t.speaker === "System" ? "#E1E5EB" : "#E6E8EC"}`, background: t.speaker === "AI" ? "#FBFAFF" : t.speaker === "System" ? "#FCFCFD" : "#fff" }}
                >
                  <ChipFor spec={{ label: t.speaker, tone: t.speaker === "AI" ? "purple" : t.speaker === "System" ? "neutral" : "green" }} h={21} fontSize={9.5} />
                  <div className="min-w-0 flex-1 text-[12.5px] leading-[1.55] text-[#0F172A]" style={{ textWrap: "pretty" }}>
                    {t.text}
                  </div>
                  <div className="flex-none font-mono text-[10px] text-[#94A3B8]">{t.time}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-none overflow-hidden rounded-[12px] border border-[#E6E8EC]">
              <div className="flex items-center gap-[9px] border-b border-[#EEF0F3] bg-[#FAFBFC] px-[13px] py-[11px]">
                <div className="text-[11px] font-bold uppercase tracking-[.08em] text-[#7A8798]">{section}</div>
                <div className="ml-auto text-[10.5px] text-[#94A3B8]">{data.lineage}</div>
              </div>
              <RowTable rows={data.rows} />
            </div>
          )}
          <Bullets title={data.title} items={data.bullets} />
          <NoteBox>{data.note}</NoteBox>
        </div>

        {/* actions */}
        <div className="flex gap-[7px] overflow-x-auto border-t border-[#EEF0F3] bg-[#FCFCFD] py-3 pl-5 pr-[76px]">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              disabled={a.disabled}
              className="flex h-[34px] flex-none cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[9px] border bg-white px-[11px] text-[12.5px] font-bold hover:bg-[#F1F3F6] disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: a.risky ? "#FBD5D2" : "#D5DAE2", color: a.risky ? "#B42318" : "#45505F" }}
            >
              <Ico name={a.icon} size={14} />
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────── next step (rule-based, from the record) ─────────────────────────────── */

function nextStep(c: EnrichedCall): { title: string; why: string; evidence: string; actionable: boolean } {
  if (c.status === "missed" && !c.resolvedAt)
    return { title: "Call back — this call was never answered.", why: "There is no transcript or recording, and Noxtill doesn't guess why they rang. The number and the time are all that is known.", evidence: "Based on the call status", actionable: true };
  if (needsFollowUp(c)) {
    const said = firstCallerLine(c);
    return { title: c.outcome === "custom" ? `Follow up — matched “${c.customIntentName}”.` : "Return this caller's message.", why: said ? `They said: “${said}”` : "They asked for a callback.", evidence: "Based on the transcript", actionable: true };
  }
  if (c.outcome === "transfer") return { title: "Review the transfer — the AI handed this call to a person.", why: "The AI chose to transfer. Whether the person answered isn't recorded, so check that the caller was helped.", evidence: "Based on the call outcome", actionable: false };
  if (c.outcome === "booking" && c.appointment) return { title: "No action needed — a booking was created.", why: `${c.appointment.serviceName}${c.appointment.staffName ? ` with ${c.appointment.staffName}` : ""} — it now lives in Bookings.`, evidence: "Based on the booking record", actionable: false };
  if (c.status === "in_progress") return { title: "This call is live right now.", why: "Open Live Calls to listen in or take over.", evidence: "Based on the call status", actionable: false };
  return { title: "No action needed.", why: c.resolvedAt ? "This follow-up has been marked handled." : "The call completed and nothing was left waiting for a person.", evidence: "Based on the call record", actionable: false };
}

/* ─────────────────────────────── the 13 sections ─────────────────────────────── */

interface Helpers {
  tz: string;
  money: (n: number) => string;
  businessName: string;
  maxTurns: number;
  retentionDays: number;
  transferConfigured: boolean;
  customIntents: number;
  holdMessage: boolean;
  shareCatalog: boolean;
  shareOrderStatus: boolean;
  shareCreditBalance: boolean;
  today: string;
}

const AUDIT_LABELS: Record<string, string> = {
  "call.recording_played": "Played the recording",
  "call.recording_deleted": "Deleted the recording and transcript",
  "call.note_added": "Added a note",
  "call.assigned": "Changed the follow-up owner",
  "call.summary_generated": "Wrote an AI summary",
  "call.marked_handled": "Marked it handled",
  "call.callback_offered": "Recorded a callback offer",
  "call.listened_in": "Listened in live",
  "call.taken_over": "Took over the call",
  "call.transferred_by_staff": "Transferred the call to a person",
  "call.ended_by_staff": "Ended the call",
};

/** Every distinct record block the AI was given on any turn of this call. */
const sourcesGiven = (c: EnrichedCall): string[] => [...new Set(c.transcript.flatMap((t) => t.analysis?.sources ?? []))];

function sectionFor(name: CallSection, c: EnrichedCall, ctx: CallContext | undefined, h: Helpers): SectionData {
  const missed = c.status === "missed";
  const when = fmtWhen(c.startedAt, h.tz, h.today, c.localDay);
  const row = (label: string, value: string, tone?: PanelRow["tone"]): PanelRow => ({ label, value, tone });
  const appt = c.appointment;
  const staff = c.joinedByName ?? c.assignedToName ?? appt?.staffName ?? "—";
  const a = c.analysis;
  const conf = a?.confidence ?? null;
  const mood = a?.sentiment ?? null;
  const given = sourcesGiven(c);
  const confText = conf ? `${conf[0].toUpperCase()}${conf.slice(1)}${a.lowConfidenceTurns ? ` · low on ${a.lowConfidenceTurns} turn${a.lowConfidenceTurns === 1 ? "" : "s"}` : ""}` : "Not reported";
  const moodText = mood ? `${mood[0].toUpperCase()}${mood.slice(1)} (AI estimate)` : "Not reported";

  switch (name) {
    case "Summary":
      return {
        lineage: "From the call log",
        rows: [
          row("Caller", callerName(c)), row("Number", c.fromNumber), row("Direction", "Inbound"), row("Started", when),
          row("Duration", fmtDuration(c.durationSeconds)), row("Status", statusChip(c).label), row("Handled by", handlerChip(c.handledBy).label),
          row("Staff", staff), row("Intent", intentLabel(c)), row("Outcome", outcomeChip(c).label),
          row("AI confidence", confText, conf ? undefined : "muted"), row("Caller sounded", moodText, mood ? undefined : "muted"),
          ...(c.routedRuleName ? [row("Routed by rule", c.routedRuleName)] : []),
          row("Recording", c.recordingDeletedAt ? "Deleted" : c.hasRecording ? "Available" : "None", c.hasRecording ? undefined : "muted"),
        ],
        title: "What this is",
        bullets: [
          "The facts of the call, read from your call log",
          "Confidence and how the caller sounded are the AI's own estimates, taken from what it reported on each turn — not certainties",
          missed ? "This call was never answered, so there is no transcript to summarise beyond the fact that it was missed" : "Outcome is what actually happened on the call, not what the AI hoped would happen",
          "A written summary is only created when you ask for one, and it is written from the transcript alone",
        ],
        note: missed ? "Noxtill does not invent a reason for a missed call." : "The summary never adds a detail the call did not contain.",
      };

    case "Transcript": {
      const turns = c.transcript.map((t) => ({ speaker: (t.speaker === "caller" ? "Caller" : "AI") as "Caller" | "AI", text: t.text, time: offset(t.at, c.startedAt) }));
      const out: NonNullable<SectionData["transcript"]> = missed
        ? [
            { speaker: "System", text: `Call arrived at ${fmtClock(c.startedAt, h.tz)} and was not answered. No audio was captured.`, time: fmtClock(c.startedAt, h.tz) },
            { speaker: "System", text: "Recorded as missed. Caller intent is unknown — Noxtill did not infer one.", time: fmtClock(c.startedAt, h.tz) },
          ]
        : turns.length
          ? turns
          : [{ speaker: "System", text: c.recordingDeletedAt ? `The transcript was deleted on ${fmtDateTime(c.recordingDeletedAt, h.tz)}.` : "This call has no transcript.", time: "—" }];
      if (c.joinedAt) out.push({ speaker: "System", text: `${c.joinedByName ?? "A staff member"} joined the call live.`, time: offset(c.joinedAt, c.startedAt) });
      return {
        lineage: missed ? "No transcript exists" : "Speaker-separated, timed from the start of the call",
        rows: [],
        transcript: out,
        title: "What a transcript shows",
        bullets: ["Caller speech and the AI's spoken replies, timed from the start of the call", "It never shows private model reasoning — only what was said", missed ? "For a missed call there is no speech to show" : "The AI opens every call with the recording and automated-assistant disclosure, which is not part of the transcript"],
        note: "The AI identifies itself as an automated assistant rather than implying it is a person.",
      };
    }

    case "Caller":
      return {
        lineage: "Telephony provider, call log and what the caller said",
        rows: [
          row("Number", c.fromNumber), row("Direction", "Inbound"), row("Time", when), row("Duration", fmtDuration(c.durationSeconds)),
          row("Business", h.businessName), row("Provider", "Twilio"),
          row("Name they gave", c.callerName ?? "Not given", c.callerName ? undefined : "muted"), row("Email they gave", c.callerEmail ?? "Not given", c.callerEmail ? undefined : "muted"),
          row("Caller ID name", "Not recorded", "muted"),
          row("Previous calls", String(ctx?.previousCallsTotal ?? c.previousCalls)), row("First-time caller", (ctx?.previousCallsTotal ?? c.previousCalls) === 0 ? "Yes" : "No"),
          row("Arrived", c.afterHours == null ? "Working hours not set" : c.afterHours ? "Outside working hours" : "During working hours", c.afterHours == null ? "muted" : undefined),
        ],
        title: "What we know about the caller",
        bullets: ["The number, timing and duration, from the telephony provider", "A name or email appears only if the caller said it on this call — it is kept exactly as the AI heard it, and an email that isn't a valid address is dropped, not repaired", "Caller ID name is not stored, and location is not inferred from a number prefix"],
        note: "Noxtill does not guess a caller's identity from anything but what they said and the number they rang from.",
      };

    case "Customer":
      return c.customer && ctx?.customer
        ? {
            lineage: "From Customers",
            rows: [
              row("Customer", ctx.customer.name), row("Matched on", "Saved phone number", "pos"), row("Customer since", fmtDateTime(ctx.customer.since, h.tz).replace(/, .*/, "")),
              row("Total visits", String(ctx.customer.visitCount)), row("Lifetime spend", h.money(ctx.customer.lifetimeSpend)),
              row("Upcoming bookings", String(ctx.customer.upcomingAppointments)), row("Last visit", ctx.customer.lastVisitAt ? fmtDateTime(ctx.customer.lastVisitAt, h.tz).replace(/, .*/, "") : "—"),
            ],
            title: "What is matched",
            bullets: ["The caller's number equals this customer's saved phone number", "The customer record itself lives in Customers — this is a reference", "Caller ID can be faked, so treat a match as a strong hint, not proof of identity"],
            note: "Noxtill never merges records on a similarity guess.",
          }
        : {
            lineage: "From Customers",
            rows: [row("Customer match", "None found", "neg"), row("Matched on", "Nothing — number not on any customer record"), row("What the AI could see", given.length ? given.join(" · ") : "Only the words spoken on the call", "muted"), row("Action available", "Create the customer from Customers if they become one")],
            title: "Why there is no match",
            bullets: ["A match means the calling number appears on a saved customer's phone", "Without one, the AI can't share anyone's order status or balance, and had no customer record to work from", "A caller who books by phone is saved as a customer with the number they called from"],
            note: "Noxtill never auto-merges an uncertain customer match.",
          };

    case "Intent":
      return {
        lineage: "The AI's own reading, turn by turn",
        rows: [
          row("Recorded intent", intentLabel(c)), row("Classification", missed ? "Not possible — no audio" : c.outcome === "none" && !a?.topic ? "None matched" : "From the caller's own words"),
          row("Topic asked about", a?.topic ? TOPIC_LABELS[a.topic] : "None recorded", a?.topic ? undefined : "muted"),
          row("Custom situation", c.customIntentName ?? "—"), row("Confidence", confText, conf ? undefined : "muted"), row("Caller sounded", moodText, mood ? undefined : "muted"),
          row("Escalated to a person", c.outcome === "transfer" ? (c.routedRuleName ? `Yes — ${c.routedRuleName}` : "Yes — AI chose to transfer") : "No"),
        ],
        title: "How intent is used",
        bullets: [missed ? "A missed call has no intent, and Noxtill leaves it as unknown" : "The intent decides what happens next: book, take a message, transfer, or a custom situation you defined", "Confidence, topic and how the caller sounds are what the AI itself reported about each turn — estimates, and blank when the AI gave none", "A routing rule of yours can override the AI's choice on any of these readings"],
        note: "Intent comes from what the caller said, not from who they are.",
      };

    case "Actions taken":
      return {
        lineage: "Real writes only",
        rows: [
          row("Booking created", appt ? `${appt.serviceName} · ${fmtDateTime(appt.startsAt, h.tz)}` : "None"),
          row("Transfer", c.outcome === "transfer" ? (c.routedRuleName ?? "AI chose to transfer this call") : "None"),
          row("Message taken", c.outcome === "message" ? "Yes — waiting in the follow-up queue" : "None"),
          row("Routing rule applied", c.routedRuleName ?? "None", c.routedRuleName ? undefined : "muted"),
          row("Callback offered", c.callbackRequestedAt ? fmtDateTime(c.callbackRequestedAt, h.tz) : "No"),
          row("Marked handled", c.resolvedAt ? fmtDateTime(c.resolvedAt, h.tz) : "No"),
          row("Assigned to", c.assignedToName ?? "Unassigned", c.assignedToName ? undefined : "muted"),
          row("Staff joined live", c.joinedByName ? `${c.joinedByName}${c.joinedAt ? ` · ${fmtClock(c.joinedAt, h.tz)}` : ""}` : "No"),
          row("Message to caller", missed ? "Missed-call message attempted automatically · delivery not recorded" : "None", missed ? "muted" : undefined),
        ],
        title: "What the AI is able to write",
        bullets: ["Bookings (through the booking engine), messages left for follow-up, and a transfer", "It can read your records but cannot refund, change credit, adjust stock, change a price or alter permissions — it has no way to write to any of those", "Every write is attached to this call"],
        note: "Actions listed as None were genuinely not taken, not merely not shown.",
      };

    case "Booking":
      return appt
        ? {
            lineage: "From Bookings",
            rows: [
              row("Booking", bookingRef(appt)), row("Customer", appt.customerName), row("Service", appt.serviceName), row("Staff", appt.staffName ?? "Not assigned", appt.staffName ? undefined : "muted"),
              row("Starts", fmtDateTime(appt.startsAt, h.tz)), row("Ends", fmtDateTime(appt.endsAt, h.tz)), row("Deposit paid", appt.depositPaid > 0 ? h.money(appt.depositPaid) : "None recorded"), row("Status", appt.status.replace("_", " ").replace(/^./, (ch) => ch.toUpperCase())),
              row("Created by", "AI receptionist · phone"),
            ],
            title: "How it was created",
            bullets: ["The AI passes the service and time to the booking engine, which rejects a time that isn't free", "The booking lives in Bookings — this is a reference to it", "A failed attempt isn't logged on the call, so it doesn't appear here"],
            note: "Bookings owns the record; changes made there are reflected here.",
          }
        : {
            lineage: "From Bookings",
            rows: [row("Booking", "None from this call"), row("Reason", c.outcome === "booking" ? "The appointment was removed" : "No booking was requested")],
            title: "Nothing to show",
            bullets: ["A booking appears here only where the AI actually created one"],
            note: "A booking is only reported once it exists in Bookings.",
          };

    case "Order": {
      const gave = given.includes("Orders");
      return {
        lineage: "From Orders, only if allowed",
        rows: [
          row("Order record given to the AI", gave ? "Yes — this caller's most recent order" : "No", gave ? undefined : "muted"),
          row("Sharing order status", h.shareOrderStatus ? "On" : "Off", h.shareOrderStatus ? "pos" : "muted"),
          row("Caller matched to a customer", c.customer ? "Yes — saved phone number" : "No", c.customer ? "pos" : "muted"),
        ],
        title: gave ? "What the AI was shown" : "Nothing to show",
        bullets: [
          "The AI can read a caller's own most recent order — status and total — but only when sharing is on and the calling number exactly matches a saved customer",
          h.shareOrderStatus ? "Sharing is on, and it only looks when the caller mentions an order" : "Sharing is off, so the AI is never shown an order — turn it on in Assistant → Records the AI may read",
          "It cannot change an order, promise a delivery date or refund one",
        ],
        note: "Noxtill would rather show nothing than imply the AI looked something up.",
      };
    }

    case "Lead":
      return isLead(c)
        ? {
            lineage: "From this call",
            rows: [
              row("Name", c.callerName ?? "Not given", c.callerName ? undefined : "muted"), row("Phone", c.fromNumber), row("Email", c.callerEmail ?? "Not captured", c.callerEmail ? undefined : "muted"), row("What they said", firstCallerLine(c) ? `“${firstCallerLine(c)}”` : "—"),
              row("Source", "Phone"), row("Captured", when), row("Customer match", "None — new contact"), row("Assigned", c.assignedToName ?? "Unassigned", c.assignedToName ? undefined : "neg"), row("Status", outcomeChip(c).label),
            ],
            title: "What is captured, and what is not",
            bullets: ["The number they called from, their own words, and a name or email only if they said one", "No budget or company is stored, because the receptionist doesn't collect them", "It is not merged into any customer record"],
            note: "Noxtill stores what a caller says, never what it could guess about them.",
          }
        : {
            lineage: "From this call",
            rows: [row("Lead", "None from this call"), row("Reason", c.customer ? "The caller is an existing customer" : missed ? "The call was never answered" : "The caller didn't ask to be contacted")],
            title: "When a lead is created",
            bullets: ["A lead is a caller who isn't a saved customer and asked to be contacted"],
            note: "A lead is never created from a guess.",
          };

    case "Knowledge used": {
      const qs = a?.questions ?? [];
      return {
        lineage: "What the AI was given, turn by turn",
        rows: [
          row("Records given to the AI", given.length ? given.join(" · ") : "None — only the conversation", given.length ? undefined : "muted"),
          row("Custom situations available", String(h.customIntents)), row("Hold message set", h.holdMessage ? "Yes" : "No"),
          row("Questions asked", String(qs.length)), row("Answers declined", String(a?.declinedCount ?? 0), a?.declinedCount ? "neg" : undefined),
          ...qs.slice(0, 6).map((q) => row(TOPIC_LABELS[q.topic], `${q.text ? `“${q.text.length > 70 ? `${q.text.slice(0, 70)}…` : q.text}” · ` : ""}${q.answered === true ? "Answered" : q.answered === false ? "Declined — no record" : "Not stated"}`, q.answered === false ? "neg" : undefined)),
        ],
        title: "Where every answer came from",
        bullets: [
          "On each turn the AI is shown only the records that match what the caller just said — a product or service, your hours and address, an FAQ or document, and (if you allow it) the caller's own order or balance",
          "“Given to the AI” means it was put in front of the AI, not that the reply used it",
          "When it has no record it says so and doesn't guess — each of those is counted as a declined answer, and repeated ones show up under Knowledge as gaps to fill",
          !h.shareCatalog ? "Catalogue sharing is turned off in Settings, so prices, stock and hours are never given" : "Catalogue sharing is on",
        ],
        note: "A reading the AI didn't give is shown as not stated, never filled in.",
      };
    }

    case "Follow-up":
      return {
        lineage: "Queue, assignment and notes",
        rows: [
          row("Follow-up needed", needsFollowUp(c) ? "Yes" : "No", needsFollowUp(c) ? "neg" : undefined), row("Callback offered", c.callbackRequestedAt ? fmtDateTime(c.callbackRequestedAt, h.tz) : "No"),
          row("Assigned to", c.assignedToName ?? "Unassigned", c.assignedToName ? undefined : "muted"), row("Handled", c.resolvedAt ? fmtDateTime(c.resolvedAt, h.tz) : "Not yet", c.resolvedAt ? "pos" : undefined),
          row("Message to caller", missed ? "Missed-call message · attempted automatically" : "None", missed ? "muted" : undefined),
          row("Notes", ctx ? String(ctx.notes.length) : "…"),
          ...(ctx?.notes ?? []).map((n) => row(`${n.authorName ?? "Someone"} · ${fmtDateTime(n.createdAt, h.tz)}`, n.body)),
        ],
        title: "What sends automatically",
        bullets: ["A missed call triggers a message to the caller on your preferred messaging channel — delivery isn't recorded here", "Nothing else is sent to the caller automatically", "The follow-up stays in the queue until someone marks it handled", "Notes are for your team only; add one from the action bar"],
        note: "The AI never messages a customer on a channel you haven't connected.",
      };

    case "AI":
      return {
        lineage: "Explainable",
        rows: [
          row("Handled by", handlerChip(c.handledBy).label), row("Recorded intent", intentLabel(c)), row("Confidence", confText, conf ? undefined : "muted"), row("Answers declined", String(a?.declinedCount ?? 0), a?.declinedCount ? "neg" : undefined),
          row("Routing rule applied", c.routedRuleName ?? "None", c.routedRuleName ? undefined : "muted"),
          row("Escalation", c.outcome === "transfer" ? (c.routedRuleName ? "A rule of yours transferred it" : "AI chose to transfer") : "Not triggered"), row("Length cap", `${h.maxTurns} spoken lines, then it arranges a callback`),
          row("Transfer number", h.transferConfigured ? "Configured" : "Not configured — a transfer request is recorded as a message", h.transferConfigured ? "pos" : "neg"),
        ],
        title: "The rules that applied",
        bullets: ["Every call opens with the recording and automated-assistant disclosure — it cannot be switched off", `A conversation is capped at ${h.maxTurns} spoken lines (caller and AI combined); then the AI says someone will call back and the call is recorded as a message`, "Your routing rules are checked on every turn and override the AI's own choice", "A booking goes through the booking engine, so a time that isn't free is rejected", "The AI can read some records but has no access to change refunds, credit, stock, prices or permissions"],
        note: "Every one of these boundaries is fixed behaviour you can read, not a claim you have to trust.",
      };

    case "Audit": {
      const trail = ctx?.audit ?? [];
      return {
        lineage: "The append-only audit trail",
        rows: [
          row("Call recorded", c.recordingDeletedAt ? "Deleted" : c.hasRecording ? "Yes" : "No", c.hasRecording ? undefined : "muted"),
          row("Recording kept for", `${h.retentionDays} days, then deleted automatically`),
          ...(c.recordingDeletedAt ? [row("Recording deleted", fmtDateTime(c.recordingDeletedAt, h.tz), "neg")] : []),
          row("Customer matched", c.customer ? "Yes · saved phone number" : "No match found"), row("Staff joined", c.joinedByName ?? "No"),
          row("Assigned to", c.assignedToName ?? "—"), row("Marked handled", c.resolvedAt ? fmtDateTime(c.resolvedAt, h.tz) : "No"),
          row("Recording playback logged", "Yes — every time it is opened", "pos"),
          ...(ctx ? (trail.length ? trail.map((t) => row(`${t.actorName ?? "System"} · ${fmtDateTime(t.at, h.tz)}`, AUDIT_LABELS[t.action] ?? t.action)) : [row("Staff actions on this call", "None yet", "muted")]) : [row("Staff actions on this call", "Loading…", "muted")]),
        ],
        title: "What is recorded about this call",
        bullets: ["The call itself: time, duration, transcript, recording, outcome", "Every staff action on it — playing or deleting the recording, assigning, marking handled, listening in, transferring, ending, adding a note — with who and when", `Recordings and their transcripts are deleted automatically after ${h.retentionDays} days`],
        note: "Recording follows the retention above; Noxtill makes no claim that it satisfies any particular jurisdiction's rules.",
      };
    }
  }
}
