"use client";

import { useState } from "react";
import {
  TOPIC_LABELS,
  type KnowledgeEntry,
  type RoutingRule,
  type RoutingTrigger,
  type TopicKey,
} from "@/lib/voice-calls-api";
import { useRx } from "./rx-data";
import { useRxStore } from "./rx-store";
import { FormBox, inputCls, labelCls, saveCls, useSaveSettings } from "./rx-settings-forms";

const E164 = /^\+[1-9]\d{6,14}$/;
const hint = "mt-1.5 text-[11px] leading-[1.5] text-[#94A3B8]";

/** Where a "caller asks for a person" transfer rings — a real, saved setting the next call uses. */
export function TransferNumberForm() {
  const rx = useRx();
  const save = useSaveSettings();
  const [v, setV] = useState(rx.settings?.transferNumber ?? "");
  const [busy, setBusy] = useState(false);
  const trimmed = v.trim();
  const valid = trimmed === "" || E164.test(trimmed);
  return (
    <FormBox>
      <label className={labelCls} htmlFor="rx-transfer">
        Transfer number
      </label>
      <input id="rx-transfer" inputMode="tel" value={v} onChange={(e) => setV(e.target.value)} placeholder="+15551234567" className={inputCls} />
      <div className={hint}>
        {valid ? "International format, starting with +. Leave it blank to fall back to the server-wide number, if your host has set one." : "Use international format, e.g. +15551234567 — no spaces or dashes."}
      </div>
      <button
        type="button"
        disabled={busy || !valid || trimmed === (rx.settings?.transferNumber ?? "")}
        onClick={async () => {
          setBusy(true);
          await save({ transferNumber: trimmed === "" ? null : trimmed }, "Transfer number saved");
          setBusy(false);
        }}
        className={saveCls}
      >
        {busy ? "Saving…" : "Save number"}
      </button>
    </FormBox>
  );
}

function ShareRow({ id, checked, onChange, title, body }: { id: string; checked: boolean; onChange: (v: boolean) => void; title: string; body: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-[#EEF0F3] p-3 hover:bg-[#FAFBFC]">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 flex-none accent-[#16A34A]" />
      <span className="min-w-0">
        <span className="block text-[12.5px] font-bold">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-[1.5] text-[#7A8798]">{body}</span>
      </span>
    </label>
  );
}

/** What records the AI may read to answer a caller. Each switch is a real setting read on every call. */
export function SharingForm() {
  const rx = useRx();
  const save = useSaveSettings();
  const s = rx.settings;
  const [catalog, setCatalog] = useState(s?.shareCatalog ?? true);
  const [orders, setOrders] = useState(s?.shareOrderStatus ?? false);
  const [credit, setCredit] = useState(s?.shareCreditBalance ?? false);
  const [busy, setBusy] = useState(false);
  const dirty = catalog !== (s?.shareCatalog ?? true) || orders !== (s?.shareOrderStatus ?? false) || credit !== (s?.shareCreditBalance ?? false);

  return (
    <FormBox>
      <div className="flex flex-col gap-2">
        <ShareRow id="rx-share-catalog" checked={catalog} onChange={setCatalog} title="Prices, stock, services, hours and address" body="When a caller names a product or service, or asks about hours or where you are, the AI is given that record so it can answer instead of guessing." />
        <ShareRow id="rx-share-orders" checked={orders} onChange={setOrders} title="A caller's own order status" body="Only when the calling number exactly matches a saved customer. Caller ID can be faked, so this is off until you choose to turn it on." />
        <ShareRow id="rx-share-credit" checked={credit} onChange={setCredit} title="A caller's own credit balance" body="Only when the calling number exactly matches a saved customer. Off by default for the same reason — a balance is more sensitive than an order status." />
      </div>
      <button
        type="button"
        disabled={busy || !dirty}
        onClick={async () => {
          setBusy(true);
          await save({ shareCatalog: catalog, shareOrderStatus: orders, shareCreditBalance: credit }, "Sharing saved");
          setBusy(false);
        }}
        className={saveCls}
      >
        {busy ? "Saving…" : "Save"}
      </button>
    </FormBox>
  );
}

const TRIGGER_OPTIONS: { value: RoutingTrigger; label: string; needs: "text" | "topic" | "sentiment" | null }[] = [
  { value: "keyword", label: "The caller says a word or phrase", needs: "text" },
  { value: "topic", label: "The AI files the question under a topic", needs: "topic" },
  { value: "sentiment", label: "The caller sounds upset (AI's estimate)", needs: "sentiment" },
  { value: "low_confidence", label: "The AI isn't sure what the caller wants", needs: null },
  { value: "after_hours", label: "The call arrives outside working hours", needs: null },
];

/** Create or edit one routing rule. Rules are checked top to bottom on every caller turn, before the built-in handling. */
export function RoutingRuleForm({ rule }: { rule?: RoutingRule }) {
  const rx = useRx();
  const closeOverlays = useRxStore((s) => s.closeOverlays);
  const [name, setName] = useState(rule?.name ?? "");
  const [trigger, setTrigger] = useState<RoutingTrigger>(rule?.triggerKind ?? "keyword");
  const [match, setMatch] = useState(rule?.matchValue ?? "");
  const [action, setAction] = useState<"take_message" | "transfer">(rule?.action === "transfer" ? "transfer" : "take_message");
  const [number, setNumber] = useState(rule?.transferNumber ?? "");
  const [busy, setBusy] = useState(false);

  const needs = TRIGGER_OPTIONS.find((t) => t.value === trigger)?.needs ?? null;
  const num = number.trim();
  const numberOk = action !== "transfer" || num === "" || E164.test(num);
  const matchOk = needs === null || match.trim().length > 0;
  const valid = name.trim().length > 0 && matchOk && numberOk;

  const changeTrigger = (t: RoutingTrigger) => {
    setTrigger(t);
    const n = TRIGGER_OPTIONS.find((o) => o.value === t)?.needs;
    setMatch(n === "topic" ? "complaint" : n === "sentiment" ? "frustrated" : "");
  };

  const submit = async () => {
    setBusy(true);
    const payload = {
      name: name.trim(),
      triggerKind: trigger,
      matchValue: needs ? match.trim() : null,
      action,
      transferNumber: action === "transfer" && num ? num : null,
    };
    const ok = rule ? await rx.actions.updateRule(rule.id, payload) : await rx.actions.createRule(payload);
    setBusy(false);
    if (ok) closeOverlays();
  };

  return (
    <FormBox>
      <label className={labelCls} htmlFor="rx-rule-name">
        Rule name
      </label>
      <input id="rx-rule-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Legal threats go to the owner" className={inputCls} maxLength={80} />

      <label className={`${labelCls} mt-3`} htmlFor="rx-rule-trigger">
        When
      </label>
      <select id="rx-rule-trigger" value={trigger} onChange={(e) => changeTrigger(e.target.value as RoutingTrigger)} className={inputCls}>
        {TRIGGER_OPTIONS.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      {needs === "text" ? (
        <>
          <label className={`${labelCls} mt-3`} htmlFor="rx-rule-match">
            Word or phrase
          </label>
          <input id="rx-rule-match" value={match} onChange={(e) => setMatch(e.target.value)} placeholder="e.g. lawyer" className={inputCls} maxLength={120} />
          <div className={hint}>Matched anywhere in what the caller just said, ignoring capitals.</div>
        </>
      ) : null}
      {needs === "topic" ? (
        <>
          <label className={`${labelCls} mt-3`} htmlFor="rx-rule-topic">
            Topic
          </label>
          <select id="rx-rule-topic" value={match} onChange={(e) => setMatch(e.target.value)} className={inputCls}>
            {(Object.keys(TOPIC_LABELS) as TopicKey[]).map((k) => (
              <option key={k} value={k}>
                {TOPIC_LABELS[k]}
              </option>
            ))}
          </select>
        </>
      ) : null}
      {needs === "sentiment" ? (
        <>
          <label className={`${labelCls} mt-3`} htmlFor="rx-rule-sent">
            Sounds
          </label>
          <select id="rx-rule-sent" value={match} onChange={(e) => setMatch(e.target.value)} className={inputCls}>
            <option value="frustrated">Frustrated</option>
            <option value="negative">Negative</option>
          </select>
        </>
      ) : null}

      <label className={`${labelCls} mt-3`} htmlFor="rx-rule-action">
        Then
      </label>
      <select id="rx-rule-action" value={action} onChange={(e) => setAction(e.target.value as "take_message" | "transfer")} className={inputCls}>
        <option value="take_message">Take a message — it joins the follow-up queue</option>
        <option value="transfer">Transfer to a person</option>
      </select>

      {action === "transfer" ? (
        <>
          <label className={`${labelCls} mt-3`} htmlFor="rx-rule-number">
            Number to ring (optional)
          </label>
          <input id="rx-rule-number" inputMode="tel" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Uses your transfer number" className={inputCls} />
          <div className={hint}>{numberOk ? "Leave blank to use the transfer number in Settings." : "Use international format, e.g. +15551234567."}</div>
        </>
      ) : null}

      <button type="button" disabled={busy || !valid} onClick={() => void submit()} className={saveCls}>
        {busy ? "Saving…" : rule ? "Save rule" : "Add rule"}
      </button>
    </FormBox>
  );
}

const MAX_DOC_CHARS = 50_000;

/**
 * An FAQ answer, or an imported plain-text document. Only text is supported — a .txt, .md or .csv file
 * (read in the browser) or text pasted in; other formats aren't parsed.
 */
export function KnowledgeForm({ kind, entry, prefillQuestion }: { kind: "faq" | "document"; entry?: KnowledgeEntry; prefillQuestion?: string }) {
  const rx = useRx();
  const closeOverlays = useRxStore((s) => s.closeOverlays);
  const notify = useRxStore((s) => s.notify);
  const [title, setTitle] = useState(entry?.title ?? "");
  const [question, setQuestion] = useState(entry?.question ?? prefillQuestion ?? "");
  const [content, setContent] = useState(entry?.content ?? "");
  const [filename, setFilename] = useState(entry?.sourceFilename ?? "");
  const [busy, setBusy] = useState(false);

  const isFaq = kind === "faq";
  const effectiveTitle = isFaq ? (title.trim() || question.trim()).slice(0, 160) : title.trim();
  const valid = effectiveTitle.length > 0 && content.trim().length > 0 && content.length <= MAX_DOC_CHARS && (!isFaq || question.trim().length > 0);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.(txt|md|markdown|csv|text)$/i.test(file.name) && !file.type.startsWith("text/")) {
      notify("That file type isn't supported", "Import a .txt, .md or .csv file, or paste the text in.", "error");
      return;
    }
    const text = await file.text();
    if (text.length > MAX_DOC_CHARS) notify("That file is long", `Only the first ${MAX_DOC_CHARS.toLocaleString()} characters can be kept.`, "error");
    setContent(text.slice(0, MAX_DOC_CHARS));
    setFilename(file.name);
    if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ""));
  };

  const submit = async () => {
    setBusy(true);
    const ok = entry
      ? await rx.actions.updateKnowledge(entry.id, { title: effectiveTitle, ...(isFaq ? { question: question.trim() } : {}), content: content.trim() })
      : await rx.actions.createKnowledge({ kind, title: effectiveTitle, ...(isFaq ? { question: question.trim() } : {}), content: content.trim(), ...(filename ? { sourceFilename: filename } : {}) });
    setBusy(false);
    if (ok) closeOverlays();
  };

  return (
    <FormBox>
      {isFaq ? (
        <>
          <label className={labelCls} htmlFor="rx-kn-q">
            The question callers ask
          </label>
          <input id="rx-kn-q" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. Are you open on Eid?" className={inputCls} maxLength={300} />
        </>
      ) : (
        <>
          <label className={labelCls} htmlFor="rx-kn-title">
            Document title
          </label>
          <input id="rx-kn-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Returns policy" className={inputCls} maxLength={160} />
          {!entry ? (
            <div className="mt-3">
              <label className={labelCls} htmlFor="rx-kn-file">
                Import a text file
              </label>
              <input id="rx-kn-file" type="file" accept=".txt,.md,.markdown,.csv,.text,text/*" onChange={(e) => void onFile(e.target.files?.[0])} className="block w-full text-[12px] text-[#45505F] file:mr-3 file:h-[34px] file:cursor-pointer file:rounded-[9px] file:border file:border-[#D5DAE2] file:bg-white file:px-3 file:text-[12px] file:font-bold" />
              <div className={hint}>Plain text only — .txt, .md or .csv. PDFs and Word files aren&apos;t read; paste their text below instead.</div>
            </div>
          ) : null}
        </>
      )}

      <label className={`${labelCls} mt-3`} htmlFor="rx-kn-content">
        {isFaq ? "The answer" : "Text the AI may draw on"}
      </label>
      <textarea
        id="rx-kn-content"
        rows={isFaq ? 5 : 9}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={isFaq ? "e.g. We're closed on both days of Eid and open again the next morning at 9." : "Paste the text here."}
        className={`${inputCls} h-auto py-2.5 leading-[1.5]`}
      />
      <div className={hint}>
        {content.length.toLocaleString()} / {MAX_DOC_CHARS.toLocaleString()} characters. Only the passages that match what a caller says are shown to the AI, and only on that call.
      </div>

      <button type="button" disabled={busy || !valid} onClick={() => void submit()} className={saveCls}>
        {busy ? "Saving…" : entry ? "Save changes" : isFaq ? "Add FAQ" : "Import document"}
      </button>
    </FormBox>
  );
}

/** An internal note on a call — visible to your team only, and recorded in the call's audit trail. */
export function NoteForm({ callId }: { callId: string }) {
  const rx = useRx();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex-none rounded-[12px] border border-[#E6E8EC] p-3.5">
      <label className={labelCls} htmlFor={`rx-note-${callId}`}>
        Add a note
      </label>
      <textarea id={`rx-note-${callId}`} rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="e.g. Rang back, no answer — try again after 5 pm." className={`${inputCls} h-auto py-2.5 leading-[1.5]`} />
      <button
        type="button"
        disabled={busy || text.trim() === ""}
        onClick={async () => {
          setBusy(true);
          const ok = await rx.actions.addNote(callId, text.trim());
          setBusy(false);
          if (ok) setText("");
        }}
        className={saveCls}
      >
        {busy ? "Saving…" : "Save note"}
      </button>
    </div>
  );
}
