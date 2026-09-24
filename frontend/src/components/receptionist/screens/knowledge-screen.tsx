"use client";

import { useRouter } from "next/navigation";
import { TOPIC_LABELS, type KnowledgeEntry, type QuestionCluster, type TopicKey } from "@/lib/voice-calls-api";
import { fmtDateTime, knowledgeGaps, relAgo, type Tone } from "@/lib/receptionist-derive";
import { Ico } from "../rx-icon";
import { Card, CardHead, Chip, EmptyState, Footnote, TableWrap, Th } from "../rx-ui";
import { useRx } from "../rx-data";
import { useRxStore } from "../rx-store";
import { RxGate } from "../rx-gate";
import { KnowledgeForm, SharingForm } from "../rx-forms";

export function KnowledgeScreen() {
  return (
    <RxGate>
      <Knowledge />
    </RxGate>
  );
}

interface Source {
  source: string;
  type: string;
  owner: string;
  freshness: string;
  freshTone: Tone;
  used: string;
  usedTone: Tone;
  status: string;
  statusTone: Tone;
  entries: string;
  bullets: string[];
}

/** What to do about a topic the AI kept declining, decided only from the topic and the current settings. */
function gapAdvice(topic: TopicKey, orders: boolean, credit: boolean): { hint: string; needsSharing: boolean; needsRule?: boolean } {
  switch (topic) {
    case "opening_hours":
      return { hint: "Check your working hours are saved in your business profile, or add the answer (for example a holiday closure) as an FAQ.", needsSharing: false };
    case "location":
      return { hint: "Check your address is saved in your business profile, or add directions as an FAQ.", needsSharing: false };
    case "product_price_stock":
    case "service_pricing":
      return { hint: "Check the item exists in Products with the name callers use — or add the answer as an FAQ.", needsSharing: false };
    case "order_status":
      return { hint: orders ? "Sharing is on, but the caller's number must match a saved customer with an order. Add an FAQ for the general case." : "The AI isn't allowed to read order status. Allow it, or add an FAQ.", needsSharing: !orders };
    case "credit_balance":
      return { hint: credit ? "Sharing is on, but the caller's number must match a saved customer. Add an FAQ for the general case." : "The AI isn't allowed to read credit balances. Allow it, or add an FAQ.", needsSharing: !credit };
    case "refund_returns":
    case "complaint":
      return { hint: "The AI can't process refunds or resolve complaints, so it declines. Send these to a person with a routing rule — or add an FAQ explaining your policy.", needsSharing: false, needsRule: true };
    case "booking_availability":
      return { hint: "The AI books once a caller names a service and a time; it doesn't list open slots. Add an FAQ describing how booking works.", needsSharing: false };
    default:
      return { hint: "Add the real answer as an FAQ so the AI can give it next time.", needsSharing: false };
  }
}

function Knowledge() {
  const rx = useRx();
  const router = useRouter();
  const openPanel = useRxStore((s) => s.openPanel);
  const openConfirm = useRxStore((s) => s.openConfirm);
  const s = rx.settings;
  const custom = s?.customIntents.length ?? 0;
  const whc = !!rx.insights?.workingHoursConfigured;
  const catalog = s?.shareCatalog ?? true;
  const orders = s?.shareOrderStatus ?? false;
  const credit = s?.shareCreditBalance ?? false;
  const faqs = rx.knowledge.filter((k) => k.kind === "faq");
  const docs = rx.knowledge.filter((k) => k.kind === "document");
  const activeFaqs = faqs.filter((k) => k.active);
  const activeDocs = docs.filter((k) => k.active);
  const gaps = knowledgeGaps(rx.clusters);
  const newest = (list: KnowledgeEntry[]) => [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

  const openSharing = () =>
    openPanel({
      kicker: "Knowledge",
      title: "Records the AI may read",
      badge: "Applies from the next call",
      badgeTone: "blue",
      body: <SharingForm />,
      bullets: ["Order status and credit balance are only ever shown for a caller whose number exactly matches a saved customer", "Caller ID can be faked, so both are off until you choose to share them"],
      secondary: "Close",
    });

  const openFaq = (prefillQuestion?: string, entry?: KnowledgeEntry) =>
    openPanel({
      kicker: entry ? "Edit FAQ" : "New FAQ",
      title: entry ? entry.title : "Teach the AI an answer",
      badge: "Used from the next call",
      badgeTone: "blue",
      body: <KnowledgeForm kind="faq" entry={entry} prefillQuestion={prefillQuestion} />,
      bulletsTitle: "How an FAQ is used",
      bullets: ["When a caller's words match it, the answer is put in front of the AI on that call", "The AI answers from it and says so plainly — it doesn't add details that aren't in your answer", "Only you can change it; the AI never edits your FAQs"],
      secondary: "Close",
    });

  const openImport = (entry?: KnowledgeEntry) =>
    openPanel({
      kicker: entry ? "Edit document" : "Import document",
      title: entry ? entry.title : "Give the AI a document to draw on",
      badge: "Plain text only",
      badgeTone: "neutral",
      body: <KnowledgeForm kind="document" entry={entry} />,
      bulletsTitle: "How a document is used",
      bullets: ["The whole text is stored, but the AI is only shown the passage that best matches what a caller just said", "Use it for policies, price lists, menus, directions — anything callers ask about", "Only text is read: a .txt, .md or .csv file, or pasted text. PDFs and Word files aren't parsed"],
      secondary: "Close",
    });

  const sources: Source[] = [
    {
      source: "Products and pricing",
      type: "Live module",
      owner: "Products",
      freshness: "Read per question",
      freshTone: catalog ? "green" : "neutral",
      used: catalog ? "Yes" : "No",
      usedTone: catalog ? "green" : "neutral",
      status: catalog ? "Active" : "Off",
      statusTone: catalog ? "green" : "amber",
      entries: String(rx.productCount),
      bullets: ["When a caller names a product, the matching record is given to the AI with its price and whether it is in stock", "Read live, so a price you change is the price the AI quotes on the next call", catalog ? "Turned on — change it in Assistant → Records the AI may read" : "Turned off, so the AI is never shown a price or stock level"],
    },
    {
      source: "Services and durations",
      type: "Live module",
      owner: "Products",
      freshness: "Read per question",
      freshTone: catalog ? "green" : "neutral",
      used: catalog ? "Yes" : "Booking only",
      usedTone: catalog ? "green" : "neutral",
      status: "Active",
      statusTone: "green",
      entries: String(rx.services.length),
      bullets: ["A service that matches what the caller said is given to the AI with its price and duration", "When a caller books, the AI's service name is matched against these services", "Products owns this data — the AI reads it, never copies it"],
    },
    {
      source: "Booking availability",
      type: "Live module",
      owner: "Bookings",
      freshness: "At booking time",
      freshTone: "green",
      used: "Booking only",
      usedTone: "green",
      status: "Active",
      statusTone: "green",
      entries: "—",
      bullets: ["The booking engine checks the time when the booking is created and rejects one that isn't free", "The AI isn't given open slots up front, so it can't offer times — the caller names one and it is checked at booking"],
    },
    {
      source: "Business hours and address",
      type: "Live module",
      owner: "Business profile",
      freshness: whc ? "Read per question" : "Not set",
      freshTone: whc ? "green" : "amber",
      used: catalog ? (whc ? "Yes" : "No — hours not saved") : "No",
      usedTone: catalog && whc ? "green" : "neutral",
      status: catalog && whc ? "Active" : whc ? "Off" : "Missing",
      statusTone: catalog && whc ? "green" : "amber",
      entries: "—",
      bullets: ["When a caller asks about hours or where you are, your saved working hours and address are given to the AI", whc ? "Your working hours are saved" : "Your working hours aren't saved — the AI will say it has no record. Add them in your business profile", "Special or holiday hours aren't a separate record: add them as an FAQ"],
    },
    {
      source: "Order status",
      type: "Live module",
      owner: "Orders",
      freshness: orders ? "Real time" : "Not shared",
      freshTone: orders ? "green" : "neutral",
      used: orders ? "Matched callers only" : "No",
      usedTone: orders ? "amber" : "neutral",
      status: orders ? "Active" : "Off",
      statusTone: orders ? "green" : "amber",
      entries: "—",
      bullets: ["Only a caller whose number exactly matches a saved customer, and only their own most recent order (status and total)", "Caller ID can be faked, which is why this is off until you turn it on", "The AI can't change an order or promise a delivery date"],
    },
    {
      source: "Credit balances",
      type: "Live module",
      owner: "Credit",
      freshness: credit ? "Real time" : "Not shared",
      freshTone: credit ? "green" : "neutral",
      used: credit ? "Matched callers only" : "No",
      usedTone: credit ? "amber" : "neutral",
      status: credit ? "Active" : "Off",
      statusTone: credit ? "green" : "amber",
      entries: "—",
      bullets: ["Only a caller whose number exactly matches a saved customer, and only their own balance", "Off by default — a balance is more sensitive than an order status", "The AI can't record a payment or change a balance"],
    },
    {
      source: "Your FAQs",
      type: "FAQ",
      owner: "Knowledge",
      freshness: faqs.length ? relAgo(newest(faqs).updatedAt, rx.now) : "None yet",
      freshTone: faqs.length ? "green" : "neutral",
      used: activeFaqs.length ? "Yes" : "No",
      usedTone: activeFaqs.length ? "green" : "neutral",
      status: activeFaqs.length ? "Active" : "None added",
      statusTone: activeFaqs.length ? "green" : "neutral",
      entries: String(activeFaqs.length),
      bullets: ["Each FAQ is a question callers ask and the real answer you give", "The best match to what a caller says is shown to the AI on that call", "Add one from a knowledge gap above, or with Add FAQ"],
    },
    {
      source: "Imported documents",
      type: "Document",
      owner: "Knowledge",
      freshness: docs.length ? relAgo(newest(docs).updatedAt, rx.now) : "None yet",
      freshTone: docs.length ? "green" : "neutral",
      used: activeDocs.length ? "Yes" : "No",
      usedTone: activeDocs.length ? "green" : "neutral",
      status: activeDocs.length ? "Active" : "None added",
      statusTone: activeDocs.length ? "green" : "neutral",
      entries: String(activeDocs.length),
      bullets: ["Plain-text documents you import — policies, price lists, directions", "Only the passage that matches what the caller said is shown to the AI", "PDFs and Word files aren't read; paste their text instead"],
    },
    {
      source: "Your custom situations",
      type: "Setting",
      owner: "Receptionist settings",
      freshness: "Saved",
      freshTone: "green",
      used: "Yes",
      usedTone: "green",
      status: custom ? "Active" : "None set",
      statusTone: custom ? "green" : "neutral",
      entries: String(custom),
      bullets: ["Sent to the AI on every call so it can recognise these situations by name", "Edit them under Queue & Routing"],
    },
    {
      source: "Hold message",
      type: "Setting",
      owner: "Receptionist settings",
      freshness: "Saved",
      freshTone: "green",
      used: "Yes",
      usedTone: "green",
      status: s?.queueHoldMessage ? "Set" : "Not set",
      statusTone: s?.queueHoldMessage ? "green" : "neutral",
      entries: s?.queueHoldMessage ? "1" : "0",
      bullets: ["Used to phrase a message-taking reply, and as the closing line at the length cap"],
    },
  ];

  const gapRow = (g: QuestionCluster) => {
    const advice = gapAdvice(g.topic, orders, credit);
    return (
      <div key={g.topic} className="rounded-[12px] border border-[#FDE49B] bg-white px-4 py-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[220px] flex-1">
            <div className="text-[13px] font-bold" style={{ textWrap: "pretty" }}>
              {g.sampleQuestion ? `“${g.sampleQuestion}”` : TOPIC_LABELS[g.topic]}
            </div>
            <div className="mt-[3px] text-[11px] text-[#94A3B8]">
              {TOPIC_LABELS[g.topic]} · asked {g.asked} time{g.asked === 1 ? "" : "s"} · the AI had no record {g.declined} time{g.declined === 1 ? "" : "s"}
              {g.lastAskedAt ? ` · last ${relAgo(g.lastAskedAt, rx.now)}` : ""}
            </div>
            <div className="mt-1.5 text-[11.5px] leading-[1.5] text-[#7A5B0B]">{advice.hint}</div>
          </div>
          <div className="flex-none text-right">
            <div className="text-[20px] font-extrabold tabular-nums text-[#B45309]">{g.declined}</div>
            <div className="text-[9.5px] text-[#94A3B8]">declined · 30 days</div>
          </div>
          <div className="flex flex-none gap-1.5">
            {advice.needsRule ? (
              <button type="button" onClick={() => router.push("/receptionist/queue")} className="flex h-8 cursor-pointer items-center rounded-[9px] border border-[#D5DAE2] bg-white px-3 text-[12px] font-bold hover:bg-[#F1F3F6]">
                Add rule
              </button>
            ) : null}
            {advice.needsSharing ? (
              <button type="button" onClick={openSharing} className="flex h-8 cursor-pointer items-center rounded-[9px] border border-[#D5DAE2] bg-white px-3 text-[12px] font-bold hover:bg-[#F1F3F6]">
                Allow it
              </button>
            ) : null}
            <button type="button" onClick={() => openFaq(g.sampleQuestion ?? undefined)} className="flex h-8 cursor-pointer items-center rounded-[9px] border-0 bg-[#16A34A] px-3 text-[12px] font-bold text-white hover:bg-[#15803D]">
              Add FAQ
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-[18px]">
      <Card border="#FDE49B" pad={16}>
        <div className="flex flex-wrap items-center gap-2.5 px-[2px]">
          <Ico name="lightbulb" size={16} className="text-[#B45309]" />
          <div className="text-[13.5px] font-extrabold">Knowledge gaps from real calls</div>
          <div className="ml-auto text-[10.5px] text-[#94A3B8]">Counted from questions the AI itself said it had no record for · last 30 days</div>
        </div>
        {gaps.length === 0 ? (
          <div className="mt-3 rounded-[11px] border border-[#BBF0CB] bg-[#F6FEF9] px-3.5 py-3 text-[12.5px] leading-[1.6] text-[#45505F]">
            <strong className="text-[#15803D]">No gaps right now.</strong> In the last 30 days the AI hasn&apos;t had to decline a question for lack of a record. When it does, the caller&apos;s own words are listed here with what to do about it.
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-2.5">{gaps.map(gapRow)}</div>
        )}
        <div className="mt-3 text-[11px] leading-[1.5] text-[#94A3B8]">Declining is correct behaviour — the AI won&apos;t invent an answer. But a question asked again and again is a real cost, and the loop only closes when a person adds the real answer.</div>
      </Card>

      <Card overflow>
        <CardHead
          title="Your FAQs and documents"
          sub={rx.knowledge.length ? `${activeFaqs.length} FAQ${activeFaqs.length === 1 ? "" : "s"} · ${activeDocs.length} document${activeDocs.length === 1 ? "" : "s"} active` : undefined}
          right={
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => openImport()} className="flex h-[30px] cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 text-[12px] font-bold hover:bg-[#F1F3F6]">
                <Ico name="upload" size={13} />
                Import document
              </button>
              <button type="button" onClick={() => openFaq()} className="flex h-[30px] cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[8px] border-0 bg-[#16A34A] px-2.5 text-[12px] font-bold text-white hover:bg-[#15803D]">
                <Ico name="plus" size={13} strokeWidth={2.25} />
                Add FAQ
              </button>
            </div>
          }
        />
        {rx.knowledge.length === 0 ? (
          <EmptyState icon="book-open" title="Nothing added yet" body="Add an FAQ for a question callers keep asking, or import a text document — a policy, a price list, directions. The AI draws on only the passage that matches what a caller says." />
        ) : (
          rx.knowledge.map((k, i) => (
            <div key={k.id} className="flex flex-wrap items-center gap-3 px-[18px] py-3.5" style={{ borderTop: i === 0 ? "none" : "1px solid #F3F4F7", opacity: k.active ? 1 : 0.6 }}>
              <div className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-[#F1F3F6] text-[#45505F]">
                <Ico name={k.kind === "faq" ? "lightbulb" : "file-text"} size={15} />
              </div>
              <div className="min-w-[220px] flex-[1_1_260px]">
                <div className="flex items-center gap-2">
                  <div className="text-[12.5px] font-bold">{k.kind === "faq" ? (k.question ?? k.title) : k.title}</div>
                  <Chip tone={k.kind === "faq" ? "purple" : "blue"}>{k.kind === "faq" ? "FAQ" : "Document"}</Chip>
                  {!k.active ? <Chip tone="neutral">Off</Chip> : null}
                </div>
                <div className="mt-[3px] line-clamp-2 text-[11px] leading-[1.5] text-[#7A8798]">{k.content}</div>
                <div className="mt-1 text-[10.5px] text-[#94A3B8]">
                  {k.usedCount ? `Used on ${k.usedCount} call${k.usedCount === 1 ? "" : "s"}${k.lastUsedAt ? ` · last ${relAgo(k.lastUsedAt, rx.now)}` : ""}` : "Not used on a call yet"} · updated {fmtDateTime(k.updatedAt, rx.timezone)}
                  {k.sourceFilename ? ` · from ${k.sourceFilename}` : ""}
                </div>
              </div>
              <div className="flex flex-none gap-1.5">
                <button type="button" onClick={() => (k.kind === "faq" ? openFaq(undefined, k) : openImport(k))} className="flex h-[30px] cursor-pointer items-center rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 text-[12px] font-bold hover:bg-[#F1F3F6]">
                  Edit
                </button>
                <button type="button" onClick={() => void rx.actions.updateKnowledge(k.id, { active: !k.active })} className="flex h-[30px] cursor-pointer items-center rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 text-[12px] font-bold hover:bg-[#F1F3F6]">
                  {k.active ? "Turn off" : "Turn on"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    openConfirm({
                      title: `Remove “${k.title}”?`,
                      tone: "red",
                      icon: "trash-2",
                      body: "The AI stops drawing on it from the next call. Past calls that used it keep their record of what was given.",
                      primary: "Remove",
                      cancel: "Keep it",
                      onConfirm: () => rx.actions.deleteKnowledge(k.id),
                    })
                  }
                  className="flex h-[30px] cursor-pointer items-center rounded-[8px] border border-[#FBD5D2] bg-white px-2.5 text-[12px] font-bold text-[#B42318] hover:bg-[#FEF3F2]"
                >
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </Card>

      <Card overflow>
        <CardHead title="Knowledge sources" sub="Everything the AI can draw on, and whether it is switched on" />
        <TableWrap
          minWidth={940}
          head={
            <>
              <Th>Source</Th>
              <Th>Type</Th>
              <Th>Owned by</Th>
              <Th>Freshness</Th>
              <Th>Used by AI</Th>
              <Th>Status</Th>
              <Th align="center">Entries</Th>
            </>
          }
        >
          {sources.map((r) => (
            <tr
              key={r.source}
              onClick={() =>
                openPanel({
                  kicker: "Knowledge source",
                  title: r.source,
                  badge: `${r.status} · ${r.freshness}`,
                  badgeTone: r.statusTone,
                  rows: [
                    { label: "Type", value: r.type },
                    { label: "Owned by", value: r.owner },
                    { label: "Freshness", value: r.freshness },
                    { label: "Used by AI", value: r.used },
                    { label: "Entries", value: r.entries },
                    { label: "Status", value: r.status },
                  ],
                  body: ["Order status", "Credit balances", "Products and pricing", "Business hours and address"].includes(r.source) ? <SharingForm /> : undefined,
                  bulletsTitle: "How the AI uses it",
                  bullets: r.bullets,
                  note: "Noxtill never presents a source as connected when it isn't.",
                  secondary: "Close",
                })
              }
              className="cursor-pointer border-b border-[#F3F4F7] hover:bg-[#FAFBFC]!"
              style={{ background: r.statusTone === "amber" ? "#FFFDF5" : "#fff" }}
            >
              <td className="py-[11px] pl-[18px] pr-3 text-[12px] font-bold">{r.source}</td>
              <td className="px-3 py-[11px] text-[11.5px] text-[#45505F]">{r.type}</td>
              <td className="px-3 py-[11px] text-[11.5px] text-[#45505F]">{r.owner}</td>
              <td className="px-3 py-[11px]"><Chip tone={r.freshTone}>{r.freshness}</Chip></td>
              <td className="px-3 py-[11px]"><Chip tone={r.usedTone}>{r.used}</Chip></td>
              <td className="px-3 py-[11px]"><Chip tone={r.statusTone}>{r.status}</Chip></td>
              <td className="py-[11px] pl-3 pr-[18px] text-center text-[11.5px] tabular-nums">{r.entries}</td>
            </tr>
          ))}
        </TableWrap>
        <Footnote>Live modules are read directly, so nothing here is a stale copy. A source that is switched off is listed as such rather than hidden.</Footnote>
      </Card>
    </div>
  );
}
