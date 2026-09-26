"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { closeConversation, fetchSummary, reopenConversation } from "@/lib/inbox-api";
import { useInboxStore } from "./inbox-store";
import { COMPOSER_TOOLS, Thread, useComposer, useComposerTool, useConversationActions, useRunContextAction, useSelectedConversation } from "./conversation-parts";
import { SendBlockers } from "./overview-view";
import { Avatar, ChannelChip, EmptyBlock, Icon, Loading, TONE, card, channelMeta, errorText, eyebrow, relTime, useInboxInvalidate } from "./inbox-ui";

const MODES = ["Reply", "Internal note"] as const;

export function WorkspaceView() {
  const { id, detail, list } = useSelectedConversation();
  const select = useInboxStore((s) => s.select);
  const d = detail.data;

  return (
    <div data-3pane="1" style={{ display: "grid", gridTemplateColumns: "260px minmax(0,1fr) 300px", gap: "15px", alignItems: "start" }}>
      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ padding: "12px 15px", borderBottom: "1px solid #F0F2F5" }}>
          <h3 style={{ margin: 0, fontSize: "12.5px", fontWeight: 800, color: "#101828" }}>Queue</h3>
        </div>
        <div style={{ maxHeight: "560px", overflowY: "auto" }}>
          {list.isLoading && <Loading />}
          {list.data?.items.length === 0 && <EmptyBlock title="You're all caught up" sub="Nothing in this view needs a reply." />}
          {list.data?.items.map((c) => {
            const sel = c.id === id;
            const accent = c.prio === "Needs you" ? "#F04438" : c.prio === "Money" ? "#F79009" : sel ? "#12A150" : "transparent";
            const m = channelMeta(c.channel);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => select(c.id)}
                className="nx-row"
                style={{ display: "block", width: "100%", textAlign: "left", border: 0, borderTop: "1px solid #F2F4F7", background: sel ? "#F7FCF9" : "#fff", padding: "12px 15px", cursor: "pointer", borderLeft: `3px solid ${accent}` }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "12px", fontWeight: 800, color: "#101828" }}>{c.name}</span>
                  <span style={{ fontSize: "9.5px", fontWeight: 700, color: m.fg, background: m.bg, borderRadius: "5px", padding: "2px 6px" }}>{m.label}</span>
                </span>
                <span style={{ display: "block", fontSize: "11px", color: "#667085", marginTop: "4px", lineHeight: 1.45 }}>{c.msg}</span>
                <span style={{ display: "block", fontSize: "10px", color: "#98A2B3", marginTop: "4px" }}>
                  {relTime(c.lastMessageAt)} · {c.owner}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {d ? <Workspace key={d.id} /> : <div style={{ ...card, minHeight: "600px", display: "flex", alignItems: "center", justifyContent: "center" }}>{detail.isLoading ? <Loading /> : <EmptyBlock title="No conversation selected" sub="Pick one from the queue." />}</div>}

      <WorkspaceContext />
    </div>
  );
}

function Workspace() {
  const { detail } = useSelectedConversation();
  const d = detail.data!;
  const openModal = useInboxStore((s) => s.openModal);
  const flash = useInboxStore((s) => s.flash);
  const invalidate = useInboxInvalidate();
  const [mode, setMode] = useState<(typeof MODES)[number]>("Reply");
  const composer = useComposer(d.id);
  const { text, setText, savedReplyId } = composer;
  const editingDraftId = composer.draftId;
  const [showSummary, setShowSummary] = useState(false);
  const actions = useConversationActions(d.id);
  const tool = useComposerTool(d, text, setText);
  const summary = useQuery({ queryKey: ["inbox-summary", d.id], queryFn: () => fetchSummary(d.id), enabled: showSummary && d.summaryAvailable });
  const close = useMutation({
    mutationFn: () => (d.conversationStatus === "closed" ? reopenConversation(d.id) : closeConversation(d.id)),
    onSuccess: () => {
      flash(d.conversationStatus === "closed" ? "Conversation reopened" : "Conversation closed");
      void invalidate();
    },
    onError: (e) => flash(errorText(e)),
  });

  const isNote = mode === "Internal note";
  const pending = actions.reply.isPending || actions.note.isPending || actions.send.isPending;
  const submit = () => {
    const body = text.trim();
    if (!body || pending) return;
    const reset = { onSuccess: () => composer.clear() };
    if (isNote) actions.note.mutate(body, reset);
    else if (editingDraftId && d.draft?.id === editingDraftId) actions.send.mutate({ draftId: editingDraftId, text: body }, reset);
    else actions.reply.mutate({ text: body, savedReplyId }, reset);
  };
  const blockedDecision = !!d.draft?.needsDecision && !d.canDecide;

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", minHeight: "600px" }}>
      <div style={{ padding: "14px 17px", borderBottom: "1px solid #F0F2F5", display: "flex", alignItems: "center", gap: "11px", flexWrap: "wrap" }}>
        <Avatar init={d.init} size={36} font={12} />
        <span style={{ flex: 1, minWidth: "120px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "7px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "14px", fontWeight: 800, color: "#0F172A" }}>{d.name}</span>
          </span>
          <span style={{ display: "block", fontSize: "11px", color: "#98A2B3", marginTop: "2px" }}>
            {channelMeta(d.channel).label} · {d.owner}
            {d.conversationStatus === "snoozed" && d.snoozedUntil ? ` · snoozed until ${new Date(d.snoozedUntil).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}` : ""}
            {d.conversationStatus === "closed" ? " · closed" : ""}
          </span>
        </span>
        <span style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <HeadButton onClick={() => openModal({ type: "assign", conversationId: d.id })}>Assign</HeadButton>
          <HeadButton onClick={() => openModal({ type: "snooze", conversationId: d.id })}>Snooze</HeadButton>
          <button
            type="button"
            onClick={() => close.mutate()}
            disabled={close.isPending}
            className="nx-primary"
            style={{ border: 0, background: "#12A150", borderRadius: "10px", padding: "9px 14px", fontSize: "11.5px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "42px" }}
          >
            {d.conversationStatus === "closed" ? "Reopen" : "Close"}
          </button>
        </span>
      </div>

      {d.summaryAvailable && (
        <div style={{ padding: "10px 17px", borderBottom: "1px solid #F0F2F5", background: "#FAFBFC" }}>
          {!showSummary ? (
            <button type="button" onClick={() => setShowSummary(true)} style={{ border: 0, background: "none", padding: 0, fontSize: "11.5px", fontWeight: 800, color: "#0E8442", cursor: "pointer" }}>
              Long conversation — show a three-line summary
            </button>
          ) : (
            <div style={{ fontSize: "12px", color: "#344054", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{summary.isLoading ? "Summarising…" : summary.error ? errorText(summary.error) : (summary.data?.summary ?? "No summary available.")}</div>
          )}
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", padding: "17px", display: "flex", flexDirection: "column", gap: "12px", maxHeight: "400px" }}>
        <Thread detail={d} />
      </div>

      <div style={{ borderTop: "1px solid #F0F2F5", padding: "14px 17px" }}>
        {d.draft ? (
          <div style={{ background: "#F7FCF9", border: "1px solid #D5EFE0", borderRadius: "12px", padding: "12px", marginBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "7px" }}>
              <Icon d="m11 3 1.7 5L17.7 9.7 12.7 11.4 11 16.4 9.3 11.4 4.3 9.7 9.3 8Z" size={14} stroke="#0E8442" />
              <span style={{ fontSize: "11px", fontWeight: 800, color: "#0E8442" }}>Suggested reply</span>
              <span style={{ fontSize: "10px", fontWeight: 700, color: d.draft.needsDecision ? "#B54708" : "#98A2B3", marginLeft: "auto" }}>{d.draft.needsDecision ? "Needs a decision" : "Facts checked"}</span>
            </div>
            <div style={{ fontSize: "12.5px", color: "#344054", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{d.draft.text}</div>
            <div style={{ fontSize: "10.5px", color: "#0E8442", marginTop: "7px" }}>
              Built from {d.draft.sources.join(", ") || "this conversation"}. Nothing here is invented — if a fact was unknown, the draft says a person will check.
            </div>
            {d.draft.warning && <div style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", borderRadius: "10px", padding: "9px 12px", marginTop: "9px", fontSize: "11px", fontWeight: 700, color: "#93370D" }}>{d.draft.warning}</div>}
            <div style={{ display: "flex", gap: "8px", marginTop: "11px", flexWrap: "wrap" }}>
              <button
                type="button"
                disabled={blockedDecision || actions.send.isPending || !!d.cannotSend}
                title={blockedDecision ? "Only someone who can manage credit can send this" : undefined}
                onClick={() => actions.send.mutate({ draftId: d.draft!.id })}
                className="nx-primary"
                style={{ border: 0, background: "#12A150", borderRadius: "9px", padding: "9px 13px", fontSize: "11.5px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "40px", opacity: blockedDecision || !!d.cannotSend ? 0.55 : 1 }}
              >
                Use it
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("Reply");
                  composer.set({ text: d.draft!.text, draftId: d.draft!.id });
                }}
                style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "9px 13px", fontSize: "11.5px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "40px" }}
              >
                Edit first
              </button>
              <button type="button" onClick={() => actions.discard.mutate(d.draft!.id)} style={{ border: 0, background: "none", fontSize: "11.5px", fontWeight: 700, color: "#667085", cursor: "pointer", padding: "9px 4px" }}>
                Dismiss
              </button>
            </div>
          </div>
        ) : d.awaitingReplySince ? (
          <div style={{ background: "#FAFBFC", border: "1px solid #F0F2F5", borderRadius: "12px", padding: "12px", marginBottom: "12px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <Icon d="m11 3 1.7 5L17.7 9.7 12.7 11.4 11 16.4 9.3 11.4 4.3 9.7 9.3 8Z" size={14} stroke="#98A2B3" />
            <span style={{ flex: 1, minWidth: "180px", fontSize: "11.5px", color: "#667085", lineHeight: 1.5 }}>{d.draftSkipped ?? "No suggested reply yet."}</span>
            <button
              type="button"
              onClick={() => actions.draft.mutate()}
              disabled={actions.draft.isPending}
              style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "8px 12px", fontSize: "11.5px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "38px" }}
            >
              {actions.draft.isPending ? "Drafting…" : "Draft a reply"}
            </button>
          </div>
        ) : null}

        <div style={{ display: "flex", gap: "7px", marginBottom: "10px" }}>
          {MODES.map((m) => {
            const on = mode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                style={{ border: `1px solid ${on ? "#12A150" : "#E6EAF0"}`, background: on ? "#F7FCF9" : "#fff", color: on ? "#0E8442" : "#475467", borderRadius: "20px", padding: "7px 13px", fontSize: "11.5px", fontWeight: 700, cursor: "pointer", minHeight: "38px" }}
              >
                {m}
              </button>
            );
          })}
        </div>
        {isNote ? (
          <div style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", borderRadius: "10px", padding: "9px 12px", marginBottom: "9px", fontSize: "11px", fontWeight: 700, color: "#93370D" }}>This will only be visible to your team.</div>
        ) : (
          <div style={{ marginBottom: d.cannotSend || d.whatsappWindowOpen === false ? "9px" : 0 }}>
            <SendBlockers cannotSend={d.cannotSend} windowOpen={d.whatsappWindowOpen} />
          </div>
        )}
        {editingDraftId && !isNote && <div style={{ fontSize: "10.5px", color: "#3538CD", marginBottom: "6px" }}>Editing the suggested reply — sending records it as edited.</div>}
        <textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={isNote ? "Write a note for your team — the customer will not see it…" : "Type your reply…"}
          aria-label="Message"
          style={{ width: "100%", border: "1px solid #E6EAF0", borderRadius: "11px", padding: "12px", fontSize: "13px", fontFamily: "inherit", resize: "vertical" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
          {COMPOSER_TOOLS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => tool.run(t)}
              disabled={tool.busy || (isNote && t !== "Saved reply")}
              title={t === "Attach" ? "Sending files is not supported" : undefined}
              className="nx-accent"
              style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "9px 12px", fontSize: "11.5px", fontWeight: 700, color: t === "Attach" ? "#98A2B3" : "#475467", cursor: "pointer", minHeight: "42px", opacity: isNote && t !== "Saved reply" ? 0.5 : 1 }}
            >
              {(t === "AI assist" || t === "Translate") && tool.busy ? "Working…" : t}
            </button>
          ))}
          <span style={{ fontSize: "10.5px", color: "#98A2B3", marginLeft: "auto" }}>Ctrl + Enter to send</span>
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim() || pending || (!isNote && !!d.cannotSend)}
            className="nx-primary"
            style={{ border: 0, background: "#12A150", borderRadius: "10px", padding: "11px 20px", fontSize: "12.5px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "44px", opacity: !text.trim() || (!isNote && !!d.cannotSend) ? 0.55 : 1 }}
          >
            {pending ? "Sending…" : isNote ? "Add note" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function HeadButton({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="nx-accent" style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "9px 13px", fontSize: "11.5px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "42px" }}>
      {children}
    </button>
  );
}

function WorkspaceContext() {
  const { detail } = useSelectedConversation();
  const d = detail.data;
  const runAction = useRunContextAction();
  return (
    <div data-ctx="1" style={{ ...card, padding: "15px", display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={eyebrow}>What this is about</div>
      {!d && <div style={{ fontSize: "11.5px", color: "#98A2B3" }}>Nothing selected.</div>}
      {d?.context.map((x, i) => (
        <div key={i} style={{ border: `1px solid ${TONE[x.tone].bd}`, background: TONE[x.tone].bg, borderRadius: "11px", padding: "12px" }}>
          <div style={{ fontSize: "11.5px", fontWeight: 800, color: TONE[x.tone].fg }}>{x.t}</div>
          <div style={{ fontSize: "11px", color: "#475467", marginTop: "5px", lineHeight: 1.55 }}>{x.d}</div>
        </div>
      ))}
      {d && d.actions.filter((a) => a.kind !== "customer360").length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "7px", borderTop: "1px solid #F0F2F5", paddingTop: "12px" }}>
          {d.actions
            .filter((a) => a.kind !== "customer360")
            .map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={() => runAction(a, d.id)}
                className="nx-accent"
                style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "10px 13px", fontSize: "12px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "44px", textAlign: "left" }}
              >
                {a.label}
              </button>
            ))}
        </div>
      )}
      {d && (
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <ChannelChip channel={d.channel} big />
          <span style={{ fontSize: "11px", color: "#98A2B3" }}>{d.handle}</span>
        </div>
      )}
      <Link
        href="/unified-inbox/customer"
        style={{ border: 0, background: "#0A1B2A", borderRadius: "10px", padding: "11px", fontSize: "12px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "44px", textAlign: "center", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        Open Customer 360
      </Link>
    </div>
  );
}
