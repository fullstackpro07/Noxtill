"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  addInternalNote,
  discardDraft,
  fetchConversation,
  fetchConversations,
  markConversationRead,
  replyToConversation,
  requestDraft,
  sendDraft,
  translateReply,
  type ContextAction,
  type ConversationDetail,
  type ThreadItem,
} from "@/lib/inbox-api";
import { useInboxStore } from "./inbox-store";
import { clock, dayKey, errorText, useInboxInvalidate } from "./inbox-ui";

export function useConversationList() {
  const view = useInboxStore((s) => s.view);
  const channel = useInboxStore((s) => s.channel);
  const search = useInboxStore((s) => s.search);
  const sort = useInboxStore((s) => s.sort);
  const tag = useInboxStore((s) => s.tag);
  const assignee = useInboxStore((s) => s.assignee);
  const [debounced, setDebounced] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);
  return useQuery({
    queryKey: ["inbox-list", view, channel, debounced, sort, tag, assignee],
    queryFn: () => fetchConversations({ view, channel, q: debounced, sort, tag, assignee }),
    refetchInterval: 30000,
  });
}

/** The conversation every screen is about: the one picked, else the newest in the current list. */
export function useSelectedConversation() {
  const selectedId = useInboxStore((s) => s.selectedId);
  const select = useInboxStore((s) => s.select);
  const list = useConversationList();
  const fallback = list.data?.items[0]?.id ?? null;
  const id = selectedId ?? fallback;
  useEffect(() => {
    if (!selectedId && fallback) select(fallback);
  }, [selectedId, fallback, select]);
  const detail = useQuery({ queryKey: ["inbox-conversation", id], queryFn: () => fetchConversation(id!), enabled: !!id, refetchInterval: 20000 });
  const invalidate = useInboxInvalidate();
  const readFor = useRef<string | null>(null);
  useEffect(() => {
    if (!id || !detail.data || readFor.current === id) return;
    readFor.current = id;
    const hadUnread = list.data?.items.find((i) => i.id === id)?.unread;
    if (hadUnread) void markConversationRead(id).then(() => invalidate());
  }, [id, detail.data, list.data, invalidate]);
  return { id, detail, list };
}

const BUBBLE: Record<ThreadItem["kind"], { bg: string; bd: string; align: string; label: string }> = {
  in: { bg: "#fff", bd: "#E6EAF0", align: "flex-start", label: "" },
  out: { bg: "#F7FCF9", bd: "#D5EFE0", align: "flex-end", label: "" },
  note: { bg: "#FFFBF2", bd: "#FDE3B3", align: "flex-start", label: "Internal note — the customer never sees this" },
  event: { bg: "#FAFBFC", bd: "#F0F2F5", align: "flex-start", label: "" },
};

const SOURCE_LABEL: Record<string, string> = { ai_draft: "AI draft, approved", ai_draft_edited: "AI draft, edited", away: "Away message", social: "Replied in Social" };

function deliveryLabel(m: ThreadItem): string {
  if (m.error) return `Not sent — ${m.error}`;
  if (!m.delivery) return "";
  return m.delivery === "queued" ? "Queued" : m.delivery.charAt(0).toUpperCase() + m.delivery.slice(1);
}

export function Thread({ detail, compact = false }: { detail: ConversationDetail; compact?: boolean }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [detail.id, detail.thread.length]);
  const pad = compact ? "11px 13px" : "12px 14px";
  const radius = compact ? "14px" : "13px";
  const maxW = compact ? "72%" : "78%";
  return (
    <>
      {detail.systemCard && (
        <div style={{ display: "flex", justifyContent: "flex-start" }}>
          <div style={{ maxWidth: maxW, border: "1px solid #C7D7FE", background: "#EEF4FF", borderRadius: radius, padding: pad }}>
            <div style={{ fontSize: "9.5px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: "5px" }}>Business context</div>
            <div style={{ fontSize: "12.5px", color: "#101828", lineHeight: 1.6 }}>{detail.systemCard.text}</div>
            <div style={{ fontSize: "10.5px", color: "#3538CD", marginTop: "5px" }}>{detail.systemCard.sub}</div>
          </div>
        </div>
      )}
      {detail.thread.length === 0 && <div style={{ alignSelf: "center", fontSize: "12px", color: "#98A2B3", padding: "30px 0" }}>No messages yet.</div>}
      {detail.thread.map((m, i) => {
        const meta = BUBBLE[m.kind];
        const day = dayKey(m.at);
        const showDay = i === 0 || day !== dayKey(detail.thread[i - 1].at);
        const status = m.kind === "out" ? deliveryLabel(m) : "";
        return (
          <div key={m.id} style={{ display: "contents" }}>
            {showDay && (
              <div style={{ alignSelf: "center", fontSize: "10.5px", fontWeight: 700, color: "#667085", background: "#fff", border: "1px solid #E6EAF0", borderRadius: "20px", padding: "4px 12px" }}>{day}</div>
            )}
            <div style={{ display: "flex", justifyContent: meta.align }}>
              <div style={{ maxWidth: maxW, border: `1px solid ${m.error ? "#FDD9D6" : meta.bd}`, background: m.error ? "#FEF3F2" : meta.bg, borderRadius: radius, padding: pad }}>
                {meta.label && <div style={{ fontSize: "9.5px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: compact ? "5px" : "6px" }}>{meta.label}</div>}
                <div style={{ fontSize: m.kind === "event" ? "12px" : "12.5px", color: m.kind === "event" ? "#475467" : "#101828", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.text}</div>
                {m.source && SOURCE_LABEL[m.source] && <div style={{ fontSize: "10.5px", color: "#3538CD", marginTop: "5px" }}>{SOURCE_LABEL[m.source]}</div>}
                <div style={{ fontSize: "10px", color: m.error ? "#B42318" : "#98A2B3", marginTop: compact ? "5px" : "6px" }}>
                  {m.who ? `${m.who} ` : ""}
                  {clock(m.at)}
                  {status ? ` · ${status}` : ""}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </>
  );
}

/** The composer's text for one conversation, kept in the store so every composer shares it. */
export function useComposer(conversationId: string | null) {
  const composer = useInboxStore((s) => s.composerText);
  const setComposer = useInboxStore((s) => s.stageComposer);
  const mine = composer && composer.conversationId === conversationId ? composer : null;
  return {
    text: mine?.text ?? "",
    savedReplyId: mine?.savedReplyId,
    draftId: mine?.draftId,
    setText: (text: string) => {
      if (!conversationId) return;
      // Clearing the box also forgets which saved reply or draft it came from.
      setComposer(text ? { conversationId, text, savedReplyId: mine?.savedReplyId, draftId: mine?.draftId } : null);
    },
    set: (v: { text: string; savedReplyId?: string; draftId?: string }) => {
      if (conversationId) setComposer({ conversationId, ...v });
    },
    clear: () => setComposer(null),
  };
}

/** Mutations shared by both composers. */
export function useConversationActions(id: string | null) {
  const invalidate = useInboxInvalidate();
  const flash = useInboxStore((s) => s.flash);
  const done = (msg: string) => () => {
    flash(msg);
    void invalidate();
  };
  const fail = (e: unknown) => {
    flash(errorText(e));
    void invalidate();
  };
  const reply = useMutation({ mutationFn: (v: { text: string; savedReplyId?: string }) => replyToConversation(id!, v.text, v.savedReplyId), onSuccess: done("Reply sent"), onError: fail });
  const note = useMutation({ mutationFn: (text: string) => addInternalNote(id!, text), onSuccess: done("Note added — only your team can see it"), onError: fail });
  const draft = useMutation({ mutationFn: () => requestDraft(id!), onSuccess: done("Draft ready — read it before sending"), onError: fail });
  const send = useMutation({ mutationFn: (v: { draftId: string; text?: string }) => sendDraft(v.draftId, v.text), onSuccess: done("Draft sent"), onError: fail });
  const discard = useMutation({ mutationFn: (draftId: string) => discardDraft(draftId), onSuccess: done("Draft discarded"), onError: fail });
  const translate = useMutation({ mutationFn: (text: string) => translateReply(id!, text), onError: fail });
  return { reply, note, draft, send, discard, translate };
}

export const COMPOSER_TOOLS = ["Attach", "Saved reply", "AI assist", "Translate"] as const;

/** Runs one composer tool; returns replacement text when the tool produces some. */
export function useComposerTool(detail: ConversationDetail | undefined, text: string, setText: (t: string) => void) {
  const openModal = useInboxStore((s) => s.openModal);
  const flash = useInboxStore((s) => s.flash);
  const actions = useConversationActions(detail?.id ?? null);
  return {
    busy: actions.draft.isPending || actions.translate.isPending,
    run: (tool: (typeof COMPOSER_TOOLS)[number]) => {
      if (!detail) return;
      if (tool === "Attach") {
        flash("Sending files is not supported — Noxtill sends text only on these channels.");
      } else if (tool === "Saved reply") {
        openModal({ type: "saved-reply-picker", conversationId: detail.id });
      } else if (tool === "AI assist") {
        if (detail.draft) {
          setText(detail.draft.text);
          flash("Draft copied into the reply box — edit it, then send.");
        } else actions.draft.mutate();
      } else if (tool === "Translate") {
        if (!text.trim()) {
          flash("Type the reply first, then translate it.");
          return;
        }
        actions.translate.mutate(text, {
          onSuccess: (r) => {
            setText(r.text);
            flash(`Translated into ${r.target}`);
          },
        });
      }
    },
  };
}

/** Where each context action goes: in-inbox drawers/tabs, or a real page elsewhere in Noxtill. */
export function useRunContextAction() {
  const router = useRouter();
  const openModal = useInboxStore((s) => s.openModal);
  return (a: ContextAction, conversationId: string) => {
    if (a.kind === "order" && a.ref) openModal({ type: "order", orderId: a.ref });
    else if (a.kind === "customer360") router.push("/unified-inbox/customer");
    else if (a.kind === "create-customer") openModal({ type: "create-customer", conversationId });
    else if (a.href) router.push(a.href);
  };
}
