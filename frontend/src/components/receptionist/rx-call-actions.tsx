"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EnrichedCall } from "@/lib/voice-calls-api";
import { callerName, fmtWhen, intentLabel, outcomeChip } from "@/lib/receptionist-derive";
import { useRx } from "./rx-data";
import { useRxStore } from "./rx-store";
import { NoteForm } from "./rx-forms";

/**
 * The actions a person can take on a call. Every one is a real write (or a real hand-off to the
 * phone's dialler) — nothing here is a simulated toast.
 */
export function useCallActions() {
  const rx = useRx();
  const openConfirm = useRxStore((s) => s.openConfirm);
  const openPanel = useRxStore((s) => s.openPanel);
  const router = useRouter();
  const transferConfigured = !!rx.insights?.transferConfigured;

  /** Put a LIVE call through to a person — a real telephony-provider action. */
  const transfer = (c: EnrichedCall) => {
    if (!transferConfigured) {
      openPanel({
        kicker: "Transfer",
        title: "No transfer number is set",
        badge: "Needs a number",
        badgeTone: "amber",
        bullets: ["A transfer rings a phone number you choose — yours, or a colleague's.", "Add one under Assistant → Transfer number and it works on live calls straight away."],
        primary: "Open Assistant",
        onPrimary: () => {
          useRxStore.getState().closeOverlays();
          router.push("/receptionist/assistant");
        },
        secondary: "Close",
      });
      return;
    }
    openConfirm({
      title: "Transfer this call to a person?",
      tone: "amber",
      icon: "phone-forwarded",
      body: "The telephony provider is asked to put the caller through to your transfer number. The AI stops handling the call, and the call is recorded as a transfer.",
      rows: [
        { label: "Caller", value: `${callerName(c)} · ${c.fromNumber}` },
        { label: "Rings", value: rx.settings?.transferNumber ?? "Your server's transfer number" },
      ],
      primary: "Transfer now",
      cancel: "Keep with the AI",
      onConfirm: () => rx.actions.transfer(c.id),
    });
  };

  /** Hang up on a LIVE call — a real telephony-provider action. */
  const endCall = (c: EnrichedCall) =>
    openConfirm({
      title: "End this call now?",
      tone: "red",
      icon: "phone-off",
      body: "The telephony provider is asked to hang up on the caller straight away. What has been said so far stays in the call record.",
      rows: [
        { label: "Caller", value: `${callerName(c)} · ${c.fromNumber}` },
        { label: "Spoken so far", value: `${c.transcript.length} line${c.transcript.length === 1 ? "" : "s"}` },
      ],
      primary: "End call",
      cancel: "Keep the call",
      onConfirm: () => rx.actions.endCall(c.id),
    });

  const addNote = (c: EnrichedCall) =>
    openPanel({
      kicker: "Call note",
      title: `Note on the call with ${callerName(c)}`,
      badge: c.noteCount ? `${c.noteCount} note${c.noteCount === 1 ? "" : "s"} so far` : "No notes yet",
      badgeTone: "neutral",
      body: <NoteForm callId={c.id} />,
      bullets: ["Only your team can see notes", "Every note is recorded in the call's audit trail with who wrote it", "Earlier notes are listed under Follow-up in the call workspace"],
      secondary: "Close",
    });

  /** Permanently deletes the audio and transcript text; the call log entry itself stays. */
  const deleteRecording = (c: EnrichedCall) =>
    openConfirm({
      title: "Delete this call's recording?",
      tone: "red",
      icon: "trash-2",
      body: "The recording and its transcript are permanently removed. The call log, its outcome, any summary and any linked booking stay. This can't be undone.",
      rows: [
        { label: "Call", value: `${callerName(c)} · ${fmtWhen(c.startedAt, rx.timezone, rx.today, c.localDay)}` },
        { label: "Recording", value: "Deleted permanently", tone: "neg" },
        { label: "Transcript", value: "Deleted permanently", tone: "neg" },
        { label: "Call log", value: "Kept" },
        { label: "Recorded in the audit trail", value: "Yes" },
      ],
      primary: "Delete recording",
      cancel: "Keep recording",
      onConfirm: () => rx.actions.deleteRecording(c.id),
    });

  const callBack = (c: EnrichedCall) => {
    const missed = c.status === "missed";
    const hasTranscript = c.transcript.length > 0;
    openConfirm({
      title: "Call back this number?",
      tone: "green",
      icon: "phone-outgoing",
      body: `Your phone's dialler opens with this number, and Noxtill records that a callback was offered. ${
        hasTranscript ? "The transcript is in the call workspace if you want the context first." : "There is no transcript for this call, so you are starting without context — that is genuinely all that is known."
      }`,
      rows: [
        { label: "Number", value: c.fromNumber },
        { label: missed ? "Missed at" : "Called at", value: fmtWhen(c.startedAt, rx.timezone, rx.today, c.localDay) },
        { label: "Customer match", value: c.customer ? c.customer.name : "None found", tone: c.customer ? undefined : "muted" },
        { label: "Known intent", value: missed ? "None — not inferred" : intentLabel(c), tone: missed ? "muted" : undefined },
      ],
      primary: "Open dialler",
      cancel: "Cancel",
      onConfirm: async () => {
        if (!c.resolvedAt && !c.callbackRequestedAt) await rx.actions.offerCallback(c.id);
        window.location.href = `tel:${c.fromNumber}`;
      },
    });
  };

  const assign = (c: EnrichedCall) =>
    openPanel({
      kicker: "Assign follow-up",
      title: `Who should follow up ${callerName(c)}?`,
      badge: c.assignedToName ? `Currently ${c.assignedToName}` : "Unassigned",
      badgeTone: c.assignedToName ? "neutral" : "amber",
      rows: [
        { label: "Caller", value: `${callerName(c)} · ${c.fromNumber}` },
        { label: "Reason", value: outcomeChip(c).label },
      ],
      body: <AssignPicker callId={c.id} current={c.assignedToUserId} />,
      bulletsTitle: "What assigning does",
      bullets: ["The person shows as the owner on this call, in Leads and in the follow-up queue", "It doesn't notify them — tell them, or they'll see it when they open the queue", "Only active team members can be chosen"],
      note: "Assignment is recorded on the call itself.",
      secondary: "Close",
    });

  const join = (c: EnrichedCall, mode: "listen" | "takeover") =>
    openConfirm({
      title: mode === "listen" ? "Listen in on this call?" : "Take over this call?",
      tone: mode === "listen" ? "green" : "amber",
      icon: mode === "listen" ? "audio-lines" : "user-round",
      body:
        mode === "listen"
          ? "Noxtill rings YOUR phone and joins you to the live call, muted — you hear the caller and the AI, and they can't hear you."
          : "Noxtill rings YOUR phone and joins you to the live call, unmuted. You speak with the caller directly and the AI stops handling the call.",
      rows: [
        { label: "Caller", value: `${callerName(c)} · ${c.fromNumber}` },
        { label: "Your phone", value: "The number saved on your Noxtill account" },
        { label: "Anything the AI was about to do", value: mode === "takeover" ? "Will not happen — you are on the call" : "Carries on", tone: mode === "takeover" ? "neg" : undefined },
      ],
      primary: mode === "listen" ? "Ring my phone" : "Take over",
      cancel: "Cancel",
      onConfirm: () => (mode === "listen" ? rx.actions.listen(c.id) : rx.actions.takeOver(c.id)),
    });

  return { callBack, assign, join, transfer, endCall, addNote, deleteRecording };
}

export function AssignPicker({ callId, current }: { callId: string; current: string | null }) {
  const rx = useRx();
  const closeOverlays = useRxStore((s) => s.closeOverlays);
  const [pick, setPick] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  const staff = rx.staff.filter((s) => s.active);
  return (
    <div className="flex-none rounded-[12px] border border-[#E6E8EC] p-3.5">
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[.08em] text-[#7A8798]" htmlFor="assign-staff">
        Owner
      </label>
      <select id="assign-staff" value={pick} onChange={(e) => setPick(e.target.value)} className="h-[38px] w-full rounded-[10px] border border-[#D5DAE2] bg-white px-3 text-[12.5px] font-semibold">
        <option value="">Unassigned</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} · {s.role}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={busy || pick === (current ?? "")}
        onClick={async () => {
          setBusy(true);
          await rx.actions.assign(callId, pick || null);
          setBusy(false);
          closeOverlays();
        }}
        className="mt-3 flex h-[34px] cursor-pointer items-center rounded-[9px] border-0 bg-[#16A34A] px-3 text-[12.5px] font-bold text-white hover:bg-[#15803D] disabled:cursor-not-allowed disabled:opacity-55"
      >
        {busy ? "Saving…" : "Save owner"}
      </button>
    </div>
  );
}
