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
import { ProviderHealthCard } from "../rx-provider-health";
import { MeteredVoiceUsageCard } from "../rx-metered-usage";
import { PhoneSystemCard } from "../rx-phone-system";

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
        { label: "AI answering", meta: "What an incoming AI conversation needs", value: num ? "Provider dependent" : "No number", tone: "amber", explain: [num ? "A business number is saved; this alone does not prove that AI conversations are available" : "Provision a number before receiving calls", "AI conversations depend on speech transcription, the AI reply provider and the caller's recording consent", "Provider health below separates saved configuration from previous test results and provider failures"] },
        { label: "Mode", meta: "When the AI answers", value: "Always on", tone: "neutral", explain: ["The AI answers day and night; there are no business-hours-only or after-hours-only modes", "Your working hours are used to flag after-hours calls, and a routing rule can act on “outside working hours”"] },
        { label: "Number", meta: "The number callers ring", value: num ? "Provisioned" : "None", tone: num ? "green" : "amber", explain: [num ? num.phoneNumber : "Provision one under Numbers"], go: num ? undefined : { label: "Provision a number", href: "/receptionist/numbers" } },
        { label: "Working hours", meta: "Read by the AI, and flags after-hours calls", value: whc ? "Set" : "Not set", tone: whc ? "green" : "amber", explain: ["Working hours come from your business profile", "The AI is told them when a caller asks whether you're open (if catalogue sharing is on), and calls outside them are flagged", whc ? "Your hours are saved" : "Not saved — the AI will say it has no record of your hours"] },
        { label: "If the AI can't help", meta: "Where the call goes", value: transferOk ? "Transfer" : "Message", tone: "neutral", explain: [transferOk ? "It transfers when the caller asks for a person" : "It takes a message and the call joins the follow-up queue — set a transfer number to change this", "A routing rule of yours can override this for particular calls"] },
      ],
      footer: "Provider failures end the AI conversation and save the call for team follow-up. A call that never connects is recorded as missed.",
    },
    {
      title: "Call handling",
      icon: "phone-call",
      items: [
        { label: "Voice", meta: "Twilio voice for recorded turns; live-audio voice is set by its runtime", value: voice, tone: "neutral", form: <VoiceForm /> },
        { label: "Response window", meta: "Seconds it waits for the caller to speak", value: `${s?.responseTimeoutSeconds ?? 5} s`, tone: "neutral", form: <TimeoutForm /> },
        { label: "Length cap", meta: "Consented conversation lines before callback", value: `${maxTurns} lines`, tone: "neutral", explain: ["Counts the caller's and the AI's lines together after recording consent", "At the cap the AI arranges a callback; caller audio is kept only when consent was granted"] },
        { label: "Hold message", meta: "What the AI says when it takes a message", value: s?.queueHoldMessage ? "Set" : "Not set", tone: s?.queueHoldMessage ? "green" : "neutral", form: <HoldMessageForm /> },
        { label: "Records the AI may read", meta: "What it can look up to answer a caller", value: sharing, tone: catalog || orders || credit ? "green" : "amber", form: <SharingForm /> },
        { label: "Confidence and mood", meta: "The AI's own reading of each turn", value: "Recorded", tone: "green", explain: ["On every turn the AI reports how sure it is, what topic the caller asked about, whether it could answer, and how the caller sounds", "These are the AI's estimates, stored on the call — a reading it didn't give stays blank rather than being filled in", "Routing rules can act on them (for example: low confidence → take a message)"] },
      ],
    },
    {
      title: "Escalation",
      icon: "phone-forwarded",
      items: [
        { label: "Caller asks for a person", meta: "What happens", value: transferOk ? "Transfers" : "Follow-up queue", tone: transferOk ? "green" : "amber", explain: [transferOk ? "The call is dialled to your transfer number" : "No transfer number is set, so the call joins the follow-up queue; caller audio is kept only with consent"] },
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
        { label: "Reschedule or cancel", meta: "Changes to an existing booking", value: "Verified reschedule", tone: "neutral", explain: ["Live-audio agents can reschedule only when their pinned tool allowlist permits it, the caller supplies the private booking-management reference and confirms with the keypad", "Recorded-turn agents cannot reschedule. AI cancellation is not available; cancellation stays with your team in Bookings"] },
      ],
    },
    {
      title: "Leads and follow-up",
      icon: "user-round-plus",
      items: [
        { label: "Message taking", meta: "Callers can leave a message", value: "On", tone: "green", explain: ["A message becomes a follow-up in the queue until someone marks it handled"] },
        { label: "Name and email", meta: "Only if the caller says them", value: "As spoken", tone: "green", explain: ["A name or email is saved only when the caller says one on the call, exactly as the AI heard it", "An email that isn't a valid address is dropped, not repaired", "Nothing is filled in from a similar customer record"] },
        { label: "Missed-call follow-up", meta: "A missed call joins the queue", value: "On", tone: "green", explain: ["A missed call appears in the follow-up queue with its number and time"] },
        { label: "Missed-call message", meta: "Controlled by the business's messaging policy", value: "Policy controlled", tone: "neutral", explain: ["The missed-call text-back policy, suppression list and saved customer opt-outs determine whether a message may be sent", "The send outcome and linked provider delivery status are shown in Missed Calls"] },
        { label: "Auto match to customer", meta: "By exact phone number only", value: "Exact only", tone: "amber", explain: ["A caller is matched only when their number equals a saved customer's phone number", "Nothing is matched on a similar name or a partial number"] },
        { label: "Auto merge", meta: "Into an existing customer", value: "Blocked", tone: "red", explain: ["A lead is never merged into a customer record, on any guess"] },
      ],
      footer: "A lead is never merged into an existing customer record on a similarity guess.",
    },
    {
      title: "Recording and privacy",
      icon: "circle-dot",
      items: [
        { label: "Recording", meta: "What is recorded", value: "Only after consent", tone: "green", explain: ["Caller audio is recorded only when a published regional policy allows it and the caller presses 1", "Pressing 2, giving no response, or lacking an approved policy keeps caller audio off", "The recording button in a call plays caller-turn audio only when it was actually stored"] },
        { label: "Recording policy and consent", meta: "Before caller audio is recorded", value: "Policy + caller choice", tone: "green", explain: ["The caller hears the automated-assistant and recording notices from the business's published regional policy", "Recording starts only after the caller presses 1; pressing 2 or giving no response does not start recording", "If no published policy allows recording for the caller's region, the call is not recorded and the system tries the human-team path", "This records a choice in the call record; it is not a legal-compliance guarantee"] },
        { label: "Transcription", meta: "Converts consented caller audio into text", value: "Provider dependent", tone: "amber", explain: ["Recorded caller turns are submitted to the configured speech provider", "If transcription is unavailable the recording is retained under the call's policy and the call goes to the follow-up list", "Provider health shows configuration and recorded failures without making a paid test request"] },
        { label: "Recording announcement", meta: "Read from the published regional policy", value: "Policy notice", tone: "neutral", explain: ["The automated-assistant and recording notices come from the published Voice Compliance policy for the caller's region", "If that policy is missing, unpublished, or disallows recording, caller audio is not recorded"] },
        { label: "Retention", meta: "How long each call's media is kept", value: "Per policy", tone: "neutral", explain: [`A call uses its published policy's retention period; when that policy leaves retention blank, the default is ${lim?.retentionDays ?? 90} days`, "The daily cleanup removes expired call media and transcript; active calls are kept"] },
        { label: "Deleting a recording", meta: "Removing one call's audio early", value: "On request", tone: "green", explain: ["Anyone who can manage the receptionist can delete a call's recording and transcript from the call workspace", "The call log, outcome and any linked booking stay; the deletion itself is recorded in the audit trail"] },
        { label: "Access", meta: "Who may play a recording", value: "Your team", tone: "neutral", explain: ["Anyone on your team who can open Call History can play a recording"] },
        { label: "Access logging", meta: "Every playback is recorded", value: "Always", tone: "green", explain: ["Each time a recording is opened for playback, who and when are written to the append-only audit trail", "You can see them under Audit in any call's workspace"] },
      ],
      footer: "Noxtill records the selected policy version and the caller's keypad choice. This is not a legal-compliance guarantee; the business must review its policy for each jurisdiction.",
    },
    {
      title: "Notifications",
      icon: "bell",
      items: [
        { label: "Missed call", meta: "Who may receive a message", value: "Policy controlled", tone: "neutral", explain: ["A caller message depends on the text-back policy and contact eligibility; see Missed Calls for the actual send outcome", "Staff aren't sent an in-app alert — the call appears in the follow-up queue"] },
        { label: "New lead", meta: "Who is told", value: "Queue only", tone: "neutral", explain: ["A message appears in the queue and in Leads; no alert is sent"] },
        { label: "AI failure", meta: "When the AI provider can't reply", value: "Follow-up + monitoring", tone: "amber", explain: ["Provider failures end the conversation and save the call for team review instead of requesting more caller recordings", "The call workspace shows the recorded reason such as insufficient provider credit or rejected access", "AI outbound campaigns pause after a provider failure and record the reason in the audit trail", "Owners receive an in-app alert after 3 failed non-test live-audio sessions in 10 minutes, at most once per hour"] },
        { label: "Sound and quiet hours", meta: "How operational alerts are delivered", value: "In-app only", tone: "neutral", explain: ["Budget and repeated live-audio failure alerts are in-app notifications. This module does not send an external page or sound an alarm"] },
      ],
      footer: "Owners receive budget warnings at 70% and 90% of a configured phone spending cap and alerts for repeated live-audio failures. Individual follow-ups remain in the queue.",
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
                <button
                  type="button"
                  key={it.label}
                  aria-label={`${it.label}: ${it.value}`}
                  onClick={() => (it.form || it.explain ? open(g, it) : notify(it.label, `${it.meta} · currently ${it.value}.`))}
                  className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-[11px] text-left hover:bg-[#F7F8FA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15803D]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-bold">{it.label}</div>
                    <div className="mt-0.5 text-[10.5px] leading-[1.45] text-[color:var(--app-text-faintest,#667085)]">{it.meta}</div>
                  </div>
                  <Chip tone={it.tone}>{it.value}</Chip>
                </button>
              ))}
            </div>
            {g.footer ? <div className="mt-[11px] border-t border-[#EEF0F3] pt-[11px] text-[10.5px] leading-[1.5] text-[color:var(--app-text-faintest,#667085)]">{g.footer}</div> : null}
          </div>
        ))}
      </div>
      <ProviderHealthCard />
      <MeteredVoiceUsageCard />
      <PhoneSystemCard />
    </div>
  );
}
