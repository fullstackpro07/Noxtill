"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Tone } from "@/lib/receptionist-derive";
import { Card, CardHead, Chip, Footnote, Notice, TableWrap, Th } from "../rx-ui";
import { useRx } from "../rx-data";
import { useRxStore } from "../rx-store";
import { RxGate } from "../rx-gate";
import { HoldMessageForm, TimeoutForm, VoiceForm } from "../rx-settings-forms";
import { SharingForm, TransferNumberForm } from "../rx-forms";

export function AssistantScreen() {
  return (
    <RxGate>
      <Assistant />
    </RxGate>
  );
}

const voiceLabel = (id: string | null | undefined) => (id ? id.replace("Polly.", "") : "Twilio default");

function Assistant() {
  const rx = useRx();
  const router = useRouter();
  const openPanel = useRxStore((s) => s.openPanel);
  const notify = useRxStore((s) => s.notify);
  const s = rx.settings;
  const maxTurns = rx.insights?.limits.maxCallTurns ?? 8;
  const transferOk = !!rx.insights?.transferConfigured;
  const ownTransfer = s?.transferNumber ?? null;
  const timeout = s?.responseTimeoutSeconds ?? 5;
  const catalog = s?.shareCatalog ?? true;
  const orders = s?.shareOrderStatus ?? false;
  const credit = s?.shareCreditBalance ?? false;
  const knowledgeCount = rx.knowledge.filter((k) => k.active).length;
  const sharing = catalog ? (orders || credit ? `Records + ${[orders ? "orders" : "", credit ? "credit" : ""].filter(Boolean).join(" & ")}` : "Catalogue only") : orders || credit ? "Account only" : "Nothing shared";

  interface Row {
    label: string;
    meta: string;
    value: string;
    tone: Tone;
    open: () => void;
  }
  const edit = (title: string, badge: string, form: ReactNode, rows: { label: string; value: string }[], bullets: string[], note: string) => () =>
    openPanel({ kicker: "Voice & identity", title, badge, badgeTone: "blue", rows, body: form, bulletsTitle: "How this behaves", bullets, note, secondary: "Close" });

  const voiceRows: Row[] = [
    {
      label: "Disclosure",
      meta: "Spoken at the start of every call, before anything else",
      value: "Fixed",
      tone: "amber",
      open: () =>
        openPanel({
          kicker: "Voice & identity",
          title: "The opening disclosure",
          badge: "Cannot be switched off",
          badgeTone: "amber",
          answerLabel: "Spoken on every call",
          answer: rx.insights?.limits.disclosure ?? "This call may be recorded, and you are speaking with an automated assistant.",
          bulletsTitle: "Why it is fixed",
          bullets: ["Every caller is told the call may be recorded and that they are speaking with an automated assistant", "It is not part of the settings, so it can't be edited out of the greeting", "The AI is never configured to imply it is a person"],
          note: "This is a compliance requirement, not a preference.",
          secondary: "Close",
        }),
    },
    {
      label: "Voice",
      meta: "The Twilio voice the AI speaks with",
      value: voiceLabel(s?.voiceId),
      tone: "neutral",
      open: edit("Choose the voice", voiceLabel(s?.voiceId), <VoiceForm />, [{ label: "Current voice", value: voiceLabel(s?.voiceId) }], ["Only Twilio's built-in voices are available", "“Polly” voices can be previewed here with the same engine used on a real call", "A change applies from the very next call"], "There is no custom voice cloning."),
    },
    {
      label: "Response window",
      meta: "How long it waits for the caller to speak",
      value: `${timeout} s`,
      tone: "neutral",
      open: edit("Response window", `${timeout} seconds`, <TimeoutForm />, [{ label: "Current", value: `${timeout} seconds` }], ["Sets how long each turn listens before it stops recording", "Too short cuts callers off; too long leaves dead air", "Allowed range is 2 to 20 seconds"], "Applies from the very next call."),
    },
    {
      label: "Hold message",
      meta: "What the AI says when it takes a message",
      value: s?.queueHoldMessage ? "Set" : "Not set",
      tone: s?.queueHoldMessage ? "green" : "neutral",
      open: edit("Hold message", s?.queueHoldMessage ? "Set" : "Not set", <HoldMessageForm />, [{ label: "Current wording", value: s?.queueHoldMessage ?? "None — the AI chooses its own words" }], ["Used to phrase the reply when the AI takes a message", `Spoken as the closing line if a call reaches the ${maxTurns}-line cap`, "Leave it blank and the AI uses its own words"], "The AI never promises more than a callback."),
    },
    {
      label: "Records the AI may read",
      meta: "What it can look up to answer a caller",
      value: sharing,
      tone: catalog || orders || credit ? "green" : "amber",
      open: edit(
        "Records the AI may read",
        sharing,
        <SharingForm />,
        [
          { label: "Prices, stock, services, hours, address", value: catalog ? "Shared" : "Not shared" },
          { label: "A caller's own order status", value: orders ? "Shared, matched callers only" : "Not shared" },
          { label: "A caller's own credit balance", value: credit ? "Shared, matched callers only" : "Not shared" },
        ],
        ["The AI is only ever shown the records that match what the caller just said — never your whole catalogue", "Order status and credit balance are shown only when the calling number exactly matches a saved customer", "Anything it isn't shown, it says it has no record of and offers a message or a transfer"],
        "Caller ID can be faked, so account details are off until you choose to share them.",
      ),
    },
    {
      label: "Human impersonation",
      meta: "The AI always says it is an automated assistant",
      value: "Blocked",
      tone: "red",
      open: () => notify("Human impersonation", "The AI opens every call by saying it is automated, and there is no setting that changes that."),
    },
    {
      label: "Length cap",
      meta: "Spoken lines before it arranges a callback",
      value: `${maxTurns} lines`,
      tone: "neutral",
      open: () => notify("Length cap", `A call is capped at ${maxTurns} spoken lines (caller and AI combined). At the cap the AI says someone will call back and the call is recorded as a message.`),
    },
    {
      label: "Transfer number",
      meta: "Where a transfer request rings",
      value: ownTransfer ? ownTransfer : transferOk ? "Server default" : "Not configured",
      tone: transferOk ? "green" : "amber",
      open: edit(
        "Transfer number",
        ownTransfer ? "Set for your business" : transferOk ? "Using the server default" : "Not configured",
        <TransferNumberForm />,
        [
          { label: "Your number", value: ownTransfer ?? "Not set" },
          { label: "Server-wide fallback", value: transferOk && !ownTransfer ? "In use" : "None or not needed" },
          { label: "When a caller asks for a person", value: transferOk ? "The call is dialled through" : "The AI tells them a message is noted, and it joins the follow-up queue" },
        ],
        ["Used when a caller asks for a person, when the AI can't help, and by “Transfer” on a live call", "A routing rule can ring a different number for its own calls", "Without any number, a transfer request is never lost — it is recorded as a message someone must return"],
        "Saved settings apply from the very next call.",
      ),
    },
  ];

  const script: [string, string][] = [
    ["Disclosure", "Says the call may be recorded and that it is an automated assistant."],
    ["Listen", `Records the caller's turn, waiting up to ${timeout} s for them to speak.`],
    ["Transcribe", "Turns the recording into text."],
    ["Find records", "Looks up only what matches what was said — a product or service, your hours and address, an FAQ or document, and (if you allow it) the caller's own order or balance."],
    ["Detect intent", "Decides: keep talking, book, take a message, transfer, end — or one of your custom situations. Also notes its own confidence, the topic, and how the caller sounds."],
    ["Check your rules", "Your routing rules are checked; the first match decides the call, whatever the AI would have done."],
    ["Reply", "Writes a short reply from the conversation and the records it was given — or says it has no record."],
    ["Act", "Books through Bookings, takes a message, or transfers — only when it has what it needs."],
    ["Close", `Ends the call, or after ${maxTurns} spoken lines says someone will call back and records a message.`],
  ];

  type Cell = [string, Tone];
  const answer = (on: boolean): Cell => (on ? ["Answer", "green"] : ["Not shared", "amber"]);
  const caps: { capability: string; source: string; clear: Cell; unclear: Cell; limit: Cell; why: string[]; red?: boolean }[] = [
    { capability: "Take a booking", source: "Your services · Bookings", clear: ["Book", "green"], unclear: ["Ask again", "amber"], limit: ["Arrange callback", "amber"], why: ["It books only once it has a clear service and a clear time", "The booking engine rejects a time that isn't free, and the AI asks for another"] },
    { capability: "Take a message", source: "The conversation", clear: ["Take it", "green"], unclear: ["Ask again", "amber"], limit: ["Take it", "green"], why: ["The call joins the follow-up queue until someone marks it handled", "If the caller gives their name or email, only what they said is kept"] },
    { capability: "Transfer to a person", source: ownTransfer ? "Your transfer number" : "Transfer number", clear: [transferOk ? "Transfer" : "Record message", transferOk ? "green" : "amber"], unclear: ["Ask again", "amber"], limit: ["Arrange callback", "amber"], why: [transferOk ? "The call is dialled to your transfer number" : "No transfer number is set, so it is recorded as a message instead"] },
    { capability: "Your custom situations", source: "Settings", clear: ["Take a message", "green"], unclear: ["Keep talking", "amber"], limit: ["Arrange callback", "amber"], why: ["The AI uses the situation's exact name when a conversation clearly matches it"] },
    { capability: "Business hours and address", source: "Business profile", clear: answer(catalog), unclear: ["Say no record", "amber"], limit: ["Arrange callback", "amber"], why: ["Given to the AI when a caller asks about hours or where you are", "If your working hours or address aren't saved, it says it has no record"] },
    { capability: "Product price and stock", source: "Products", clear: answer(catalog), unclear: ["Say no record", "amber"], limit: ["Arrange callback", "amber"], why: ["A product whose name matches what the caller said is given to the AI with its price and whether it is in stock", "If nothing matches, the AI says it has no record and offers a message"] },
    { capability: "Service price and duration", source: "Products · services", clear: answer(catalog), unclear: ["Say no record", "amber"], limit: ["Arrange callback", "amber"], why: ["A service that matches is given to the AI with its price and duration", "Booking itself always goes through the booking engine"] },
    { capability: "FAQs and documents", source: `Knowledge · ${knowledgeCount} active`, clear: knowledgeCount ? ["Answer", "green"] : ["None added", "neutral"], unclear: ["Say no record", "amber"], limit: ["Arrange callback", "amber"], why: ["The passage that best matches what the caller said is given to the AI", "Add FAQs or import a text document under Knowledge"] },
    { capability: "Order status", source: "Orders · matched callers", clear: answer(orders), unclear: ["Say no record", "amber"], limit: ["Arrange callback", "amber"], why: ["Only a caller whose number exactly matches a saved customer, and only their own most recent order", orders ? "Turned on in Records the AI may read" : "Off until you turn it on in Records the AI may read"] },
    { capability: "Credit balance", source: "Credit · matched callers", clear: answer(credit), unclear: ["Say no record", "amber"], limit: ["Arrange callback", "amber"], why: ["Only a caller whose number exactly matches a saved customer, and only their own balance", credit ? "Turned on in Records the AI may read" : "Off until you turn it on in Records the AI may read"] },
    { capability: "Refunds and complaints", source: "Not something it can do", clear: ["Not available", "red"], unclear: ["Not available", "red"], limit: ["—", "neutral"], red: true, why: ["It cannot process refunds or resolve complaints — it has no access to do either", "To send these to a person, add a routing rule: topic “Refund and returns” or “Complaint” → transfer"] },
  ];

  return (
    <div className="flex flex-col gap-[18px]">
      <Notice
        tone="green"
        icon="shield-check"
        action={
          <button type="button" onClick={() => router.push("/receptionist/knowledge")} className="flex h-[30px] cursor-pointer items-center whitespace-nowrap rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 text-[12px] font-bold hover:bg-[#F1F3F6]">
            Open Knowledge
          </button>
        }
      >
        The AI answers only from the words spoken on the call and the records it is actually given — a matching product or service, your hours and address, FAQs and documents you added, and (only if you allow it) a matched caller&apos;s own order status or balance. Where it has no record it says so and offers a message or a transfer; it never invents a price, a slot, a stock level or a balance.
      </Notice>

      <div className="grid items-start gap-[18px]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))" }}>
        <Card overflow>
          <CardHead icon="mic" title="Voice & identity" />
          {voiceRows.map((r, i) => (
            <div key={r.label} onClick={r.open} className="flex cursor-pointer items-center gap-[11px] px-[18px] py-[11px] hover:bg-[#FAFBFC]" style={{ borderTop: i === 0 ? "none" : "1px solid #F3F4F7" }}>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-bold">{r.label}</div>
                <div className="mt-0.5 text-[10.5px] leading-[1.45] text-[#94A3B8]">{r.meta}</div>
              </div>
              <Chip tone={r.tone}>{r.value}</Chip>
            </div>
          ))}
          <Footnote>The AI opens every call by identifying itself as an automated assistant. It is never configured to imply it is a person.</Footnote>
        </Card>

        <Card overflow>
          <CardHead icon="list-ordered" title="Call script" />
          {script.map(([step, detail], i) => (
            <div key={step} onClick={() => notify(`Step ${i + 1}: ${step}`, detail)} className="flex cursor-pointer items-start gap-[11px] px-[18px] py-3 hover:bg-[#FAFBFC]" style={{ borderTop: i === 0 ? "none" : "1px solid #F3F4F7" }}>
              <div className="flex h-6 w-6 flex-none items-center justify-center rounded-[7px] bg-[#ECFDF3] text-[11px] font-extrabold text-[#15803D]">{i + 1}</div>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-bold">{step}</div>
                <div className="mt-0.5 text-[10.5px] leading-[1.45] text-[#94A3B8]">{detail}</div>
              </div>
            </div>
          ))}
        </Card>
      </div>

      <Card overflow>
        <CardHead title="What the AI can and can't do on a call" sub="What it does when the caller is clear, unclear, or the conversation hits its cap" />
        <TableWrap
          minWidth={920}
          head={
            <>
              <Th>Capability</Th>
              <Th>Reads from</Th>
              <Th>When it&apos;s clear</Th>
              <Th>When it&apos;s unclear</Th>
              <Th>At the cap</Th>
            </>
          }
        >
          {caps.map((c) => (
            <tr
              key={c.capability}
              onClick={() =>
                openPanel({
                  kicker: "Capability",
                  title: c.capability,
                  badge: c.source,
                  badgeTone: c.red ? "red" : "neutral",
                  rows: [
                    { label: "Reads from", value: c.source },
                    { label: "When it's clear", value: c.clear[0] },
                    { label: "When it's unclear", value: c.unclear[0] },
                    { label: "At the cap", value: c.limit[0] },
                  ],
                  bulletsTitle: c.red ? "Why this isn't available" : "How this behaves",
                  bullets: c.why,
                  note: c.red ? "Noxtill would rather show a hard limit than imply the AI can do something it can't." : "“Say no record” means the AI tells the caller it doesn't have that information and offers a message or a transfer — it never guesses.",
                  secondary: "Close",
                })
              }
              className="cursor-pointer border-b border-[#F3F4F7] hover:bg-[#FAFBFC]!"
              style={{ background: c.red ? "#FEFBFB" : "#fff" }}
            >
              <td className="py-[11px] pl-[18px] pr-3 text-[12px] font-bold">{c.capability}</td>
              <td className="px-3 py-[11px] text-[11.5px] text-[#45505F]">{c.source}</td>
              <td className="px-3 py-[11px]"><Chip tone={c.clear[1]}>{c.clear[0]}</Chip></td>
              <td className="px-3 py-[11px]"><Chip tone={c.unclear[1]}>{c.unclear[0]}</Chip></td>
              <td className="py-[11px] pl-3 pr-[18px]"><Chip tone={c.limit[1]}>{c.limit[0]}</Chip></td>
            </tr>
          ))}
        </TableWrap>
        <Footnote>Refund, credit change, price change, stock adjustment, permission change and deletion aren&apos;t things the receptionist can do at all — it can read the records above, never change them.</Footnote>
      </Card>
    </div>
  );
}
