"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Tone } from "@/lib/receptionist-derive";
import { Ico } from "../rx-icon";
import { Chip } from "../rx-ui";
import { useRx } from "../rx-data";
import { useRxStore } from "../rx-store";
import { RxGate } from "../rx-gate";
import { CustomIntentsForm, HoldMessageForm, TimeoutForm, VoiceForm } from "../rx-settings-forms";
import { SharingForm, TransferNumberForm } from "../rx-forms";

export function SettingsScreen() {
  return (
    <RxGate>
      <Settings />
    </RxGate>
  );
}

interface Item {
  label: string;
  meta: string;
  value: string;
  tone: Tone;
  /** A real edit form, or a plain explanation. */
  form?: ReactNode;
  explain?: string[];
  /** Overrides the default panel action — e.g. jump to the screen that owns the setting. */
  go?: { label: string; href: string };
}
interface Group {
  title: string;
  icon: string;
  items: Item[];
  footer?: string;
}

function Settings() {
  const rx = useRx();
  const router = useRouter();
  const openPanel = useRxStore((s) => s.openPanel);
  const notify = useRxStore((s) => s.notify);
  const s = rx.settings;
  const num = rx.insights?.number;
  const lim = rx.insights?.limits;
  const maxTurns = lim?.maxCallTurns ?? 8;
  const transferOk = !!rx.insights?.transferConfigured;
  const ownTransfer = s?.transferNumber ?? null;
  const whc = !!rx.insights?.workingHoursConfigured;
  const voice = s?.voiceId ? s.voiceId.replace("Polly.", "") : "Default";
  const custom = s?.customIntents.length ?? 0;
  const catalog = s?.shareCatalog ?? true;
  const orders = s?.shareOrderStatus ?? false;
  const credit = s?.shareCreditBalance ?? false;
  const sharing = [catalog ? "Catalogue" : "", orders ? "Orders" : "", credit ? "Credit" : ""].filter(Boolean).join(" · ") || "Nothing";
  const rules = rx.routingRules;
  const activeRules = rules.filter((r) => r.active).length;

  const groups: Group[] = [
    {
      title: "General",
      icon: "settings-2",
      items: [
        { label: "AI answering", meta: "Whether the AI answers calls at all", value: num ? "On" : "Off", tone: num ? "green" : "amber", explain: [num ? "The AI answers every call to your Noxtill number" : "There is no number yet, so nothing is answering", "There is no on/off switch or schedule — answering is always on once a number exists"] },
        { label: "Mode", meta: "When the AI answers", value: "Always on", tone: "neutral", explain: ["The AI answers day and night; there are no business-hours-only or after-hours-only modes", "Your working hours are used to flag after-hours calls, and a routing rule can act on “outside working hours”"] },
        { label: "Number", meta: "The number callers ring", value: num ? "Provisioned" : "None", tone: num ? "green" : "amber", explain: [num ? num.phoneNumber : "Provision one under Numbers"], go: num ? undefined : { label: "Provision a number", href: "/receptionist/numbers" } },
        { label: "Working hours", meta: "Read by the AI, and flags after-hours calls", value: whc ? "Set" : "Not set", tone: whc ? "green" : "amber", explain: ["Working hours come from your business profile", "The AI is told them when a caller asks whether you're open (if catalogue sharing is on), and calls outside them are flagged", whc ? "Your hours are saved" : "Not saved — the AI will say it has no record of your hours"] },
        { label: "If the AI can't help", meta: "Where the call goes", value: transferOk ? "Transfer" : "Message", tone: "neutral", explain: [transferOk ? "It transfers when the caller asks for a person" : "It takes a message and the call joins the follow-up queue — set a transfer number to change this", "A routing rule of yours can override this for particular calls"] },
      ],
      footer: "There is no separate fallback configuration: a call is either answered by the AI or, if it never connects, recorded as missed.",
    },
    {
      title: "Call handling",
      icon: "phone-call",
      items: [
        { label: "Voice", meta: "The Twilio voice the AI speaks with", value: voice, tone: "neutral", form: <VoiceForm /> },
        { label: "Response window", meta: "Seconds it waits for the caller to speak", value: `${s?.responseTimeoutSeconds ?? 5} s`, tone: "neutral", form: <TimeoutForm /> },
        { label: "Length cap", meta: "Spoken lines before it arranges a callback", value: `${maxTurns} lines`, tone: "neutral", explain: ["Counts the caller's and the AI's lines together", "At the cap the AI says someone will call back, and the call is recorded as a message"] },
        { label: "Hold message", meta: "What the AI says when it takes a message", value: s?.queueHoldMessage ? "Set" : "Not set", tone: s?.queueHoldMessage ? "green" : "neutral", form: <HoldMessageForm /> },
        { label: "Records the AI may read", meta: "What it can look up to answer a caller", value: sharing, tone: catalog || orders || credit ? "green" : "amber", form: <SharingForm /> },
        { label: "Confidence and mood", meta: "The AI's own reading of each turn", value: "Recorded", tone: "green", explain: ["On every turn the AI reports how sure it is, what topic the caller asked about, whether it could answer, and how the caller sounds", "These are the AI's estimates, stored on the call — a reading it didn't give stays blank rather than being filled in", "Routing rules can act on them (for example: low confidence → take a message)"] },
      ],
    },
    {
      title: "Escalation",
      icon: "phone-forwarded",
      items: [
        { label: "Caller asks for a person", meta: "What happens", value: transferOk ? "Transfers" : "Takes a message", tone: transferOk ? "green" : "amber", explain: [transferOk ? "The call is dialled to your transfer number" : "No transfer number is set, so the call is recorded as a message instead"] },
        { label: "Transfer number", meta: "Where a transfer rings", value: ownTransfer ?? (transferOk ? "Server default" : "Not configured"), tone: transferOk ? "blue" : "amber", form: <TransferNumberForm />, explain: ["Used when a caller asks for a person, when the AI can't help, and by “Transfer” on a live call", "A routing rule can ring a different number for its own calls"] },
        { label: "Your routing rules", meta: "Checked on every turn, before the built-in handling", value: rules.length ? `${activeRules} of ${rules.length} on` : "None", tone: rules.length ? "green" : "neutral", go: { label: "Open Queue & Routing", href: "/receptionist/queue" }, explain: ["A rule can match a word, a topic, low confidence, how the caller sounds, or a call outside working hours", "Then it takes a message or transfers — the first match wins"] },
        { label: "Custom situations", meta: "Extra situations the AI recognises", value: custom ? `${custom} set` : "None", tone: custom ? "green" : "neutral", form: <CustomIntentsForm /> },
        { label: "Refund, credit, price, stock", meta: "What the AI can do with them", value: "Read only", tone: "neutral", explain: ["The AI can read a price or stock level, and (if you allow it) a matched caller's order status or balance", "It has no way to refund, change credit, change a price or adjust stock — those can never happen on a call"] },
      ],
      footer: "Refund, credit change, price change, stock adjustment, permission change and deletion aren't part of the receptionist at all.",
    },
    {
      title: "Bookings",
      icon: "calendar-check",
      items: [
        { label: "AI may book", meta: "Through the booking engine", value: "On", tone: "green", explain: ["The AI books once it has a clear service and a clear time", "There is no switch to turn phone booking off"] },
        { label: "Availability check", meta: "When a slot is checked", value: "At booking", tone: "amber", explain: ["The booking engine rejects a time that isn't free when the AI tries to create it", "The AI isn't given availability up front"] },
        { label: "Booking numbers", meta: "How a booking is referred to", value: "BK-numbers", tone: "green", explain: ["Every new booking — from a call, your booking page, a request or a waitlist offer — gets its own number (BK-1042), unique within your business", "It is shown in this module's Bookings tab and call workspace; bookings made before numbering were numbered oldest-first"] },
        { label: "Reschedule or cancel", meta: "Changes to an existing booking", value: "Not by AI", tone: "neutral", explain: ["The AI can create a booking but can't change or cancel one — that stays with your team in Bookings"] },
      ],
    },
    {
      title: "Leads and follow-up",
      icon: "user-round-plus",
      items: [
        { label: "Message taking", meta: "Callers can leave a message", value: "On", tone: "green", explain: ["A message becomes a follow-up in the queue until someone marks it handled"] },
        { label: "Name and email", meta: "Only if the caller says them", value: "As spoken", tone: "green", explain: ["A name or email is saved only when the caller says one on the call, exactly as the AI heard it", "An email that isn't a valid address is dropped, not repaired", "Nothing is filled in from a similar customer record"] },
        { label: "Missed-call follow-up", meta: "A missed call joins the queue", value: "On", tone: "green", explain: ["A missed call appears in the follow-up queue with its number and time"] },
        { label: "Missed-call message", meta: "Sent to the caller automatically", value: "On", tone: "green", explain: ["A missed-call message goes to the caller on your preferred messaging channel (WhatsApp or SMS)", "Delivery isn't recorded on the call"] },
        { label: "Auto match to customer", meta: "By exact phone number only", value: "Exact only", tone: "amber", explain: ["A caller is matched only when their number equals a saved customer's phone number", "Nothing is matched on a similar name or a partial number"] },
        { label: "Auto merge", meta: "Into an existing customer", value: "Blocked", tone: "red", explain: ["A lead is never merged into a customer record, on any guess"] },
      ],
      footer: "A lead is never merged into an existing customer record on a similarity guess.",
    },
    {
      title: "Recording and privacy",
      icon: "circle-dot",
      items: [
        { label: "Recording", meta: "What is recorded", value: "Caller turns", tone: "green", explain: ["Each thing the caller says is recorded and kept", "Recording can't be switched off per number", "The recording button in a call plays the caller's most recent turn"] },
        { label: "Transcription", meta: "Every caller turn", value: "Always on", tone: "amber", explain: ["Every recorded turn is transcribed into the call's transcript"] },
        { label: "Recording announcement", meta: "Said at the start of every call", value: "Fixed", tone: "amber", explain: [lim?.disclosure ?? "This call may be recorded, and you are speaking with an automated assistant."] },
        { label: "Retention", meta: "How long recordings are kept", value: `${lim?.retentionDays ?? 90} days`, tone: "neutral", explain: [`Recordings and their transcripts are deleted automatically after ${lim?.retentionDays ?? 90} days`, "This is fixed — it can't be shortened or extended here"] },
        { label: "Deleting a recording", meta: "Removing one call's audio early", value: "On request", tone: "green", explain: ["Anyone who can manage the receptionist can delete a call's recording and transcript from the call workspace", "The call log, outcome and any linked booking stay; the deletion itself is recorded in the audit trail"] },
        { label: "Access", meta: "Who may play a recording", value: "Your team", tone: "neutral", explain: ["Anyone on your team who can open Call History can play a recording"] },
        { label: "Access logging", meta: "Every playback is recorded", value: "Always", tone: "green", explain: ["Each time a recording is opened for playback, who and when are written to the append-only audit trail", "You can see them under Audit in any call's workspace"] },
      ],
      footer: "Noxtill applies the announcement and retention shown here. It makes no claim that this satisfies any particular jurisdiction's rules.",
    },
    {
      title: "Notifications",
      icon: "bell",
      items: [
        { label: "Missed call", meta: "Who is told", value: "Caller only", tone: "neutral", explain: ["The caller is sent a missed-call message", "Staff aren't sent an in-app alert — the call appears in the follow-up queue"] },
        { label: "New lead", meta: "Who is told", value: "Queue only", tone: "neutral", explain: ["A message appears in the queue and in Leads; no alert is sent"] },
        { label: "AI failure", meta: "When the AI can't reply", value: "Not alerted", tone: "amber", explain: ["If the AI fails it asks the caller to repeat itself; nothing is sent to staff"] },
        { label: "Sound and quiet hours", meta: "How alerts sound", value: "Not used", tone: "neutral", explain: ["This module doesn't send alerts, so sound and quiet hours don't apply here"] },
      ],
      footer: "This module doesn't have its own alerts. Follow-ups are read from the queue.",
    },
  ];

  const open = (group: Group, it: Item) =>
    openPanel({
      kicker: group.title,
      title: it.label,
      badge: it.value,
      badgeTone: it.tone,
      rows: [
        { label: "Current setting", value: it.value },
        { label: "What it controls", value: it.meta },
      ],
      body: it.form,
      bulletsTitle: it.form ? "How this behaves" : "What this means",
      bullets: it.explain ?? ["Saved settings apply from the very next call"],
      note: it.form ? "Saved settings apply from the very next call — nothing here is inert." : "Shown as a fact about how the receptionist works; it isn't configurable here.",
      primary: it.go?.label,
      onPrimary: it.go
        ? () => {
            useRxStore.getState().closeOverlays();
            router.push(it.go!.href);
          }
        : undefined,
      secondary: "Close",
    });

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="grid items-start gap-[18px]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))" }}>
        {groups.map((g) => (
          <div key={g.title} className="min-w-0 rounded-[13px] bg-white p-[18px]" style={{ border: "1px solid #E6E8EC", boxShadow: "0 1px 2px rgba(16,24,40,.05)" }}>
            <div className="flex items-center gap-[9px]">
              <Ico name={g.icon} size={16} className="text-[#15803D]" />
              <div className="text-[13.5px] font-extrabold">{g.title}</div>
            </div>
            <div className="mt-3 flex flex-col gap-0.5">
              {g.items.map((it) => (
                <div
                  key={it.label}
                  onClick={() => (it.form || it.explain ? open(g, it) : notify(it.label, `${it.meta} · currently ${it.value}.`))}
                  className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-[11px] hover:bg-[#F7F8FA]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-bold">{it.label}</div>
                    <div className="mt-0.5 text-[10.5px] leading-[1.45] text-[#94A3B8]">{it.meta}</div>
                  </div>
                  <Chip tone={it.tone}>{it.value}</Chip>
                </div>
              ))}
            </div>
            {g.footer ? <div className="mt-[11px] border-t border-[#EEF0F3] pt-[11px] text-[10.5px] leading-[1.5] text-[#94A3B8]">{g.footer}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
