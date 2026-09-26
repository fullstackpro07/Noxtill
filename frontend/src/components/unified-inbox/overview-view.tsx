"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { fetchInboxOverview, markAllRead, starConversation, type ConversationSort, type ConversationView } from "@/lib/inbox-api";
import { useInboxStore } from "./inbox-store";
import { COMPOSER_TOOLS, Thread, useComposer, useComposerTool, useConversationActions, useRunContextAction, useSelectedConversation } from "./conversation-parts";
import { Avatar, ChannelChip, EmptyBlock, Icon, InfoBanner, Loading, TONE, card, errorText, eyebrow, relTime, useInboxInvalidate } from "./inbox-ui";

const CONV_TABS: { k: string; view: ConversationView }[] = [
  { k: "Open", view: "open" },
  { k: "Unassigned", view: "unassigned" },
  { k: "Assigned", view: "assigned" },
  { k: "Waiting", view: "waiting" },
  { k: "Unread", view: "unread" },
  { k: "Closed", view: "closed" },
];

const STATUS_ROWS: { k: string; view: ConversationView; dot: string }[] = [
  { k: "Open", view: "open", dot: "#12A150" },
  { k: "Unassigned", view: "unassigned", dot: "#F04438" },
  { k: "Waiting", view: "waiting", dot: "#F79009" },
  { k: "Snoozed", view: "snoozed", dot: "#3538CD" },
  { k: "Closed", view: "closed", dot: "#98A2B3" },
];

const PRIO: Record<string, { bg: string; fg: string }> = { "Needs you": { bg: "#FEF3F2", fg: "#B42318" }, Money: { bg: "#FEF6E7", fg: "#B54708" } };

export function OverviewView() {
  const store = useInboxStore();
  const searchRef = useRef<HTMLInputElement>(null);
  const [chOpen, setChOpen] = useState(false);
  const { data: overview } = useQuery({ queryKey: ["inbox-overview"], queryFn: fetchInboxOverview, refetchInterval: 30000 });
  const { id, list } = useSelectedConversation();
  const invalidate = useInboxInvalidate();
  const readAll = useMutation({
    mutationFn: markAllRead,
    onSuccess: (r) => {
      store.flash(r.updated ? `${r.updated} conversation${r.updated === 1 ? "" : "s"} marked as read` : "Nothing was unread");
      void invalidate();
    },
  });

  const selectedChannel = overview?.channels.find((c) => c.key === store.channel);
  const connected = overview?.channels.filter((c) => !c.warn).length ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "11px", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: "200px", position: "relative", display: "flex", alignItems: "center" }}>
          <span style={{ position: "absolute", left: "13px", display: "flex" }}>
            <Icon d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3" stroke="#98A2B3" />
          </span>
          <input
            ref={searchRef}
            value={store.search}
            onChange={(e) => store.setSearch(e.target.value)}
            placeholder="Search messages…"
            aria-label="Search messages"
            style={{ width: "100%", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "11px", padding: "11px 13px 11px 36px", fontSize: "12.5px", minHeight: "44px" }}
          />
        </div>
        <button
          type="button"
          onClick={() => store.openModal({ type: "filters" })}
          className="nx-hover-soft"
          style={{ display: "flex", alignItems: "center", gap: "8px", border: `1px solid ${store.tag || store.assignee ? "#12A150" : "#E6EAF0"}`, background: "#fff", borderRadius: "11px", padding: "11px 15px", fontSize: "12.5px", fontWeight: 700, color: store.tag || store.assignee ? "#0E8442" : "#344054", cursor: "pointer", minHeight: "44px" }}
        >
          <Icon d="M3 5h18M6 12h12M10 19h4" />
          Filter{store.tag || store.assignee ? " · on" : ""}
        </button>
        <select
          aria-label="Sort"
          value={store.sort}
          onChange={(e) => store.setSort(e.target.value as ConversationSort)}
          style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "11px", padding: "11px 13px", fontSize: "12.5px", fontWeight: 700, color: "#344054", minHeight: "44px" }}
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="waiting">Longest waiting</option>
          <option value="money">Money at stake</option>
        </select>
        <button
          type="button"
          onClick={() => store.openModal({ type: "compose" })}
          className="nx-primary"
          style={{ display: "flex", alignItems: "center", gap: "8px", border: 0, background: "#12A150", borderRadius: "11px", padding: "11px 18px", fontSize: "12.5px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "44px" }}
        >
          <Icon d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          Compose
        </button>
      </div>

      <div data-3pane="1" style={{ display: "grid", gridTemplateColumns: "185px 285px minmax(0,1fr) 255px", gap: "14px", alignItems: "stretch" }}>
        {/* Channels + status rail */}
        <div style={{ ...card, overflow: "hidden" }}>
          <button
            type="button"
            onClick={() => setChOpen((o) => !o)}
            className="nx-muted-row"
            style={{ display: "flex", alignItems: "center", gap: "9px", width: "100%", textAlign: "left", border: 0, borderBottom: "1px solid #F0F2F5", background: "#fff", padding: "12px 15px", cursor: "pointer", minHeight: "44px" }}
          >
            <h3 style={{ margin: 0, flex: 1, fontSize: "12.5px", fontWeight: 800, color: "#101828" }}>Channels</h3>
            <span style={{ fontSize: "10.5px", fontWeight: 700, color: "#98A2B3" }}>{store.channel === "all" ? `${connected} live` : (selectedChannel?.n ?? store.channel)}</span>
            <span style={{ display: "flex", transform: `rotate(${chOpen ? 180 : 0}deg)`, transition: "transform .18s ease" }}>
              <Icon d="m6 9 6 6 6-6" size={14} stroke="#98A2B3" width={2.2} />
            </span>
          </button>
          {chOpen && (
            <div>
              <ChannelRow label="All channels" init="A" dark on={store.channel === "all"} unread={overview?.totalUnread ?? 0} warn="" onClick={() => store.setChannel("all")} />
              {(overview?.channels ?? []).map((c) => (
                <ChannelRow key={c.key} label={c.n} icon={c.icon} init={c.init} on={store.channel === c.key} unread={c.unread} warn={c.warn} onClick={() => store.setChannel(c.key)} />
              ))}
            </div>
          )}
          <div style={{ padding: "13px 15px 6px", borderTop: "1px solid #F0F2F5" }}>
            <h3 style={{ margin: 0, fontSize: "12.5px", fontWeight: 800, color: "#101828" }}>Status</h3>
          </div>
          <div style={{ padding: "0 0 8px" }}>
            {STATUS_ROWS.map((s) => {
              const on = store.view === s.view;
              return (
                <button
                  key={s.k}
                  type="button"
                  onClick={() => store.setView(s.view)}
                  className="nx-row"
                  style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", textAlign: "left", border: 0, background: on ? "#F7FCF9" : "#fff", padding: "9px 15px", cursor: "pointer", minHeight: "40px" }}
                >
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: s.dot, flex: "0 0 auto" }} />
                  <span style={{ flex: 1, fontSize: "12px", fontWeight: on ? 800 : 600, color: "#101828" }}>{s.k}</span>
                  <span style={{ fontSize: "10.5px", fontWeight: 700, color: "#98A2B3" }}>{list.data?.counts[s.view] ?? "—"}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Conversation list */}
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ padding: "13px 15px 10px", display: "flex", alignItems: "center", gap: "9px" }}>
            <h3 style={{ margin: 0, flex: 1, fontSize: "13px", fontWeight: 800, color: "#101828" }}>Conversations</h3>
            <SquareButton label="Search conversations" d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3" onClick={() => searchRef.current?.focus()} />
            <SquareButton label="Mark all as read" d="M4 6h16M7 12h10M10 18h4" onClick={() => readAll.mutate()} title="Mark every conversation you can see as read" />
          </div>
          <div style={{ padding: "0 15px 11px", borderBottom: "1px solid #F0F2F5", display: "flex", gap: "6px", overflowX: "auto" }}>
            {CONV_TABS.map((t) => {
              const on = store.view === t.view;
              return (
                <button
                  key={t.k}
                  type="button"
                  onClick={() => store.setView(t.view)}
                  style={{ display: "flex", alignItems: "center", gap: "6px", border: `1px solid ${on ? "#12A150" : "#E6EAF0"}`, background: on ? "#F7FCF9" : "#fff", color: on ? "#0E8442" : "#475467", borderRadius: "20px", padding: "7px 12px", fontSize: "11.5px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", minHeight: "38px" }}
                >
                  {t.k}
                  <span style={{ fontSize: "10px", opacity: 0.7 }}>{list.data?.counts[t.view] ?? ""}</span>
                </button>
              );
            })}
          </div>
          <div style={{ maxHeight: "520px", overflowY: "auto" }}>
            {list.isLoading && <Loading />}
            {list.data && list.data.items.length === 0 && (
              <EmptyBlock
                title={store.search ? "Nothing matches that search" : "You're all caught up"}
                sub={store.search ? "Try a name, a phone number or a word from the message." : "Nothing in this view needs a reply."}
              />
            )}
            {list.data?.items.map((c) => {
              const sel = c.id === id;
              const accent = c.prio === "Needs you" ? "#F04438" : c.prio === "Money" ? "#F79009" : sel ? "#12A150" : "transparent";
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => store.select(c.id)}
                  className="nx-row"
                  style={{ display: "block", width: "100%", textAlign: "left", border: 0, borderTop: "1px solid #F2F4F7", background: sel ? "#F7FCF9" : "#fff", padding: "13px 15px", cursor: "pointer", borderLeft: `3px solid ${accent}` }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                    <Avatar init={c.init} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "7px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#101828" }}>{c.name}</span>
                        <ChannelChip channel={c.channel} />
                        {c.prio && <span style={{ fontSize: "9.5px", fontWeight: 800, color: PRIO[c.prio].fg, background: PRIO[c.prio].bg, borderRadius: "5px", padding: "2px 6px" }}>{c.prio}</span>}
                        {c.starred && <Icon d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.8l6.5-.9Z" size={11} stroke="#F79009" />}
                      </span>
                      <span style={{ display: "block", fontSize: "11.5px", color: "#667085", marginTop: "4px", lineHeight: 1.45, overflowWrap: "anywhere" }}>{c.msg}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: "9px", marginTop: "5px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "10.5px", color: "#98A2B3" }}>{relTime(c.lastMessageAt)}</span>
                        <span style={{ fontSize: "10.5px", color: "#98A2B3" }}>{c.owner}</span>
                      </span>
                    </span>
                    {c.unread > 0 && <span style={{ fontSize: "10px", fontWeight: 800, color: "#fff", background: "#12A150", borderRadius: "20px", padding: "2px 7px", flex: "0 0 auto" }}>{c.unread}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Thread */}
        <ConversationPane />

        {/* Context */}
        <ContextPane />
      </div>
    </div>
  );
}

function SquareButton({ label, d, onClick, title }: { label: string; d: string; onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title ?? label}
      className="nx-hover-soft"
      style={{ width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", cursor: "pointer", color: "#667085" }}
    >
      <Icon d={d} size={14} />
    </button>
  );
}

function ChannelRow({ label, icon, init, dark, on, unread, warn, onClick }: { label: string; icon?: string; init: string; dark?: boolean; on: boolean; unread: number; warn: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="nx-row"
      style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", textAlign: "left", border: 0, borderTop: "1px solid #F2F4F7", background: on ? "#F7FCF9" : "#fff", padding: "11px 15px", cursor: "pointer", minHeight: "46px" }}
    >
      {icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/inbox-icons/${icon}.png`} alt="" style={{ width: "26px", height: "26px", borderRadius: "8px", objectFit: "contain", flex: "0 0 26px" }} />
      ) : (
        <span style={{ width: "26px", height: "26px", borderRadius: "8px", background: dark ? "#0A1B2A" : "#F2F4F7", color: dark ? "#fff" : "#475467", fontSize: "10px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 26px" }}>{init}</span>
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: "12px", fontWeight: on ? 800 : 600, color: "#101828" }}>{label}</span>
        {warn && <span style={{ display: "block", fontSize: "9.5px", fontWeight: 700, color: "#B54708", marginTop: "2px" }}>{warn}</span>}
      </span>
      {unread > 0 && <span style={{ fontSize: "10px", fontWeight: 800, color: "#fff", background: "#12A150", borderRadius: "20px", padding: "2px 7px" }}>{unread}</span>}
    </button>
  );
}

function SendBlockers({ cannotSend, windowOpen }: { cannotSend: string | null; windowOpen: boolean | null }) {
  if (cannotSend) return <InfoBanner tone="amber" icon="warn">{cannotSend}</InfoBanner>;
  if (windowOpen === false)
    return (
      <InfoBanner tone="amber" icon="warn">
        WhatsApp’s 24-hour reply window is not open for this customer (no message from them recorded in the last 24 hours). WhatsApp only delivers a free-form reply inside that window, so this reply may not arrive.
      </InfoBanner>
    );
  return null;
}

export { SendBlockers };

function ConversationPane() {
  const { detail } = useSelectedConversation();
  const d = detail.data;
  const openModal = useInboxStore((s) => s.openModal);
  const flash = useInboxStore((s) => s.flash);
  const composer = useComposer(d?.id ?? null);
  const { text, setText, savedReplyId } = composer;
  const actions = useConversationActions(d?.id ?? null);
  const tool = useComposerTool(d, text, setText);
  const invalidate = useInboxInvalidate();
  const star = useMutation({ mutationFn: (v: boolean) => starConversation(d!.id, v), onSuccess: (r) => { flash(r.starred ? "Conversation starred" : "Star removed"); void invalidate(); }, onError: (e) => flash(errorText(e)) });

  if (!d) {
    return (
      <div style={{ ...card, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: "560px", justifyContent: "center" }}>
        {detail.isLoading ? <Loading /> : <EmptyBlock title="No conversation selected" sub="When a customer messages you on a connected channel, it appears here." icon="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />}
      </div>
    );
  }

  const submit = () => {
    const body = text.trim();
    if (!body || actions.reply.isPending) return;
    actions.reply.mutate({ text: body, savedReplyId }, { onSuccess: () => composer.clear() });
  };

  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: "560px" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #F0F2F5", display: "flex", alignItems: "center", gap: "11px" }}>
        <Avatar init={d.init} size={38} font={13} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: "7px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "14px", fontWeight: 800, color: "#0F172A" }}>{d.name}</span>
            <ChannelChip channel={d.channel} big />
          </span>
          <span style={{ display: "block", fontSize: "11px", color: "#98A2B3", marginTop: "2px" }}>
            {d.status} · owned by {d.owner}
            {d.conversationStatus !== "open" ? ` · ${d.conversationStatus}` : ""}
          </span>
        </span>
        <button
          type="button"
          aria-label={d.starred ? "Remove star" : "Star"}
          title={d.starred ? "Remove star" : "Star this conversation"}
          onClick={() => star.mutate(!d.starred)}
          className="nx-hover-soft"
          style={{ width: "34px", height: "34px", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #E6EAF0", background: d.starred ? "#FEF6E7" : "#fff", borderRadius: "9px", cursor: "pointer", color: d.starred ? "#F79009" : "#667085" }}
        >
          <Icon d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.8l6.5-.9Z" />
        </button>
        <Link
          href="/unified-inbox/customer"
          aria-label="Open Customer 360"
          title="Open Customer 360"
          className="nx-hover-soft"
          style={{ width: "34px", height: "34px", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", color: "#667085" }}
        >
          <Icon d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8" />
        </Link>
        <Link
          href="/unified-inbox/conversation"
          className="nx-hover-soft"
          style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "8px 12px", fontSize: "11.5px", fontWeight: 700, color: "#344054", minHeight: "34px", display: "flex", alignItems: "center", textDecoration: "none", whiteSpace: "nowrap" }}
        >
          Open full view
        </Link>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px", background: "#FAFBFC", display: "flex", flexDirection: "column", gap: "11px", maxHeight: "460px" }}>
        <Thread detail={d} compact />
      </div>
      {d.draft && (
        <div style={{ borderTop: "1px solid #F0F2F5", padding: "10px 16px", background: "#F7FCF9", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <Icon d="m11 3 1.7 5L17.7 9.7 12.7 11.4 11 16.4 9.3 11.4 4.3 9.7 9.3 8Z" size={14} stroke="#0E8442" />
          <span style={{ flex: 1, minWidth: "160px", fontSize: "11.5px", color: "#0E8442", fontWeight: 700 }}>A drafted reply is waiting — built from {d.draft.sources.join(", ") || "this conversation"}.</span>
          <button type="button" onClick={() => setText(d.draft!.text)} style={{ border: 0, background: "none", fontSize: "11.5px", fontWeight: 800, color: "#0E8442", cursor: "pointer" }}>
            Put it in the reply box
          </button>
        </div>
      )}
      <div style={{ borderTop: "1px solid #F0F2F5", padding: "12px 16px", display: "flex", flexDirection: "column", gap: "9px" }}>
        <SendBlockers cannotSend={d.cannotSend} windowOpen={d.whatsappWindowOpen} />
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            disabled={!!d.cannotSend}
            placeholder={d.cannotSend ? "Replies cannot be sent on this channel" : "Type a message…"}
            aria-label="Message"
            style={{ flex: "1 1 220px", minWidth: 0, border: "1px solid #E6EAF0", borderRadius: "12px", padding: "12px 13px", fontSize: "12.5px", minHeight: "46px" }}
          />
          {COMPOSER_TOOLS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => tool.run(t)}
              disabled={tool.busy || (!!d.cannotSend && t !== "Saved reply")}
              title={t === "Attach" ? "Sending files is not supported" : undefined}
              className="nx-hover-soft"
              style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "8px 11px", fontSize: "11px", fontWeight: 700, color: t === "Attach" ? "#98A2B3" : "#475467", cursor: "pointer", minHeight: "40px", whiteSpace: "nowrap" }}
            >
              {t === "AI assist" && tool.busy ? "Working…" : t}
            </button>
          ))}
          <button
            type="button"
            onClick={submit}
            aria-label="Send"
            disabled={!text.trim() || actions.reply.isPending || !!d.cannotSend}
            className="nx-primary"
            style={{ width: "44px", height: "44px", display: "flex", alignItems: "center", justifyContent: "center", border: 0, background: "#12A150", borderRadius: "12px", cursor: "pointer", color: "#fff", flex: "0 0 auto", opacity: !text.trim() || !!d.cannotSend ? 0.55 : 1 }}
          >
            <Icon d="M22 2 11 13M22 2l-7 20-4-9-9-4Z" size={17} />
          </button>
        </div>
        <button type="button" onClick={() => openModal({ type: "add-note", conversationId: d.id, kind: "internal" })} style={{ alignSelf: "flex-start", border: 0, background: "none", padding: 0, fontSize: "11px", fontWeight: 700, color: "#B54708", cursor: "pointer" }}>
          + Internal note (only your team sees it)
        </button>
      </div>
    </div>
  );
}

function ContextPane() {
  const { detail } = useSelectedConversation();
  const d = detail.data;
  const openModal = useInboxStore((s) => s.openModal);
  const runAction = useRunContextAction();
  if (!d) return <div data-ctx="1" style={{ ...card, overflow: "hidden" }} />;
  const hasTags = d.tags.length > 0;
  return (
    <div data-ctx="1" style={{ ...card, overflow: "hidden" }}>
      <div style={{ padding: "15px", borderBottom: "1px solid #F0F2F5" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Avatar init={d.init} size={38} font={13} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: "13.5px", fontWeight: 800, color: "#0F172A" }}>{d.name}</span>
            <span style={{ display: "block", fontSize: "11px", color: "#98A2B3", marginTop: "2px" }}>
              {d.status} · {d.since}
            </span>
          </span>
        </div>
      </div>
      <div style={{ padding: "15px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "9px" }}>
          <Stat l="Orders" v={d.stats.orders} />
          <Stat l="Spent" v={d.stats.spent} />
          <Stat l="Owes" v={d.stats.owes} red={d.stats.owesPositive} />
          <Stat l="Bookings" v={d.stats.bookings} />
        </div>
        <div>
          <div style={{ ...eyebrow, marginBottom: "8px" }}>What this is about</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
            {d.context.map((x, i) => (
              <div key={i} style={{ border: `1px solid ${TONE[x.tone].bd}`, background: TONE[x.tone].bg, borderRadius: "11px", padding: "11px" }}>
                <div style={{ fontSize: "11.5px", fontWeight: 800, color: TONE[x.tone].fg }}>{x.t}</div>
                <div style={{ fontSize: "11px", color: "#475467", marginTop: "4px", lineHeight: 1.5 }}>{x.d}</div>
              </div>
            ))}
          </div>
        </div>
        {d.actions.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
            {d.actions.map((a) => (
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
        <div style={{ borderTop: "1px solid #F0F2F5", paddingTop: "12px" }}>
          <div style={{ ...eyebrow, marginBottom: "8px" }}>Contact details</div>
          <Rows rows={d.contactRows} />
          <Link href="/unified-inbox/customer" style={{ display: "inline-block", marginTop: "10px", fontSize: "11.5px", fontWeight: 800, color: "#0E8442", textDecoration: "none" }}>
            View full profile
          </Link>
        </div>
        <div style={{ borderTop: "1px solid #F0F2F5", paddingTop: "12px" }}>
          <div style={{ ...eyebrow, marginBottom: "8px" }}>Conversation info</div>
          <Rows rows={d.convInfo} />
        </div>
        <div style={{ borderTop: "1px solid #F0F2F5", paddingTop: "12px" }}>
          <div style={{ ...eyebrow, marginBottom: "8px" }}>Tags</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
            {d.tags.map((t) => (
              <span key={t} style={{ fontSize: "10.5px", fontWeight: 700, color: t.toLowerCase() === "money" ? "#B54708" : "#0E8442", background: t.toLowerCase() === "money" ? "#FEF6E7" : "#E8F7EE", borderRadius: "20px", padding: "5px 11px" }}>
                {t}
              </span>
            ))}
            {!hasTags && <span style={{ fontSize: "11px", color: "#98A2B3" }}>No tags</span>}
            <button
              type="button"
              onClick={() => openModal({ type: "add-tag", conversationId: d.id, tags: d.tags })}
              aria-label="Add tag"
              className="nx-accent"
              style={{ width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", border: "1px dashed #D0D5DD", background: "#fff", borderRadius: "50%", cursor: "pointer", color: "#667085" }}
            >
              <Icon d="M12 5v14M5 12h14" size={13} width={2.2} />
            </button>
          </div>
        </div>
        <div style={{ borderTop: "1px solid #F0F2F5", paddingTop: "12px" }}>
          <div style={{ ...eyebrow, marginBottom: "8px" }}>Notes</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
            {d.notes.map((n) => (
              <div key={n.id} style={{ background: "#FAFBFC", border: "1px solid #F0F2F5", borderRadius: "11px", padding: "11px" }}>
                <div style={{ fontSize: "11.5px", color: "#344054", lineHeight: 1.55 }}>{n.t}</div>
                <div style={{ fontSize: "10px", color: "#98A2B3", marginTop: "6px" }}>
                  {n.who} · {new Date(n.when).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                </div>
              </div>
            ))}
            {d.notes.length === 0 && (
              <div style={{ fontSize: "11px", color: "#98A2B3", lineHeight: 1.5 }}>
                {d.notesTarget === "customer" ? "No notes about this customer yet." : "Notes are kept on the customer record. Without one, a note here is added to the conversation instead."}
              </div>
            )}
          </div>
          <button type="button" onClick={() => openModal({ type: "add-note", conversationId: d.id, kind: "customer" })} style={{ marginTop: "9px", border: 0, background: "transparent", padding: 0, fontSize: "11.5px", fontWeight: 800, color: "#0E8442", cursor: "pointer" }}>
            Add note
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ l, v, red }: { l: string; v: string; red?: boolean }) {
  return (
    <div style={{ border: `1px solid ${red ? "#FDD9D6" : "#E6EAF0"}`, borderRadius: "11px", padding: "11px" }}>
      <div style={{ fontSize: "10.5px", fontWeight: 700, color: "#667085" }}>{l}</div>
      <div style={{ fontSize: "16px", fontWeight: 800, color: red ? "#B42318" : "#0F172A", marginTop: "3px", wordBreak: "break-word" }}>{v}</div>
    </div>
  );
}

function Rows({ rows }: { rows: { l: string; v: string }[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {rows.map((r) => (
        <div key={r.l} style={{ display: "flex", justifyContent: "space-between", gap: "10px", fontSize: "11.5px" }}>
          <span style={{ color: "#98A2B3" }}>{r.l}</span>
          <span style={{ color: "#344054", fontWeight: 600, textAlign: "right", wordBreak: "break-word" }}>{r.v}</span>
        </div>
      ))}
    </div>
  );
}
