"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { hdApi, type Detail, type Msg } from "@/lib/helpdesk-api";
import { useInboxStore } from "@/components/unified-inbox/inbox-store";
import { useHd, useWorkspace } from "./hd-store";
import { useHdActions } from "./hd-actions";
import { Gate, LOCK, Skeleton, WARN } from "./hd-render";
import { FILE_OK, O, PRI, PRIORITIES, btn, dt, errText, fileSize, fmtM, initials, priB, seg, stB, ago, type Btn } from "./hd-core";

const card = { background: "#fff", border: "1px solid #E6EAF0", borderRadius: "16px" } as const;
const KINDS: Record<string, [string, string, string, string, string, string, string, string]> = {
  cust: ["Customer", "#EFF8FF", "#175CD3", "#fff", "#E6EAF0", "solid", "#EFF8FF", "#175CD3"],
  reply: ["Public reply", "#ECFDF3", "#0E8442", "#F7FCF9", "#D1F2DF", "solid", "#0A1B2A", "#39E28B"],
  note: ["🔒 Internal note", "#FEF6E7", "#B54708", "#FFFCF5", "#FDE3B3", "dashed", "#FEF6E7", "#B54708"],
};
const tlK: Record<string, (m: Msg) => boolean> = { all: () => true, public: (m) => m.kind === "cust" || m.kind === "reply", notes: (m) => m.kind === "note", events: (m) => m.kind === "sys" };

export function DetailScreen({ number }: { number: string }) {
  const router = useRouter();
  const { data: ws } = useWorkspace();
  const act = useHdActions(ws);
  const set = useHd((s) => s.set);
  const tl = useHd((s) => s.tl);
  const dMore = useHd((s) => s.dMore);
  const comp = useHd((s) => s.comp);
  const split = useHd((s) => s.split);
  const busy = useHd((s) => s.busy);
  const q = useQuery({ queryKey: ["hd", "detail", number], queryFn: () => hdApi.detail(number), refetchInterval: 30_000 });
  // The page keys this component by ticket number, so a new ticket starts with fresh state.
  const [openedAt] = useState(() => new Date().toISOString());
  const since = useRef(openedAt);
  const [force, setForce] = useState(false);

  if (!ws || q.isLoading) return <Skeleton />;
  if (q.error || !q.data) {
    const e = q.error;
    const st = e instanceof ApiError ? e.status : 0;
    return (
      <Gate
        t={st === 404 ? "Ticket not found" : st === 403 ? "You don’t have access to this ticket" : "Couldn’t load this ticket"}
        d={errText(e)}
        icon={st === 403 ? LOCK : WARN}
        bg={st === 403 ? "#F2F4F7" : "#FEF3F2"}
        fg={st === 403 ? "#475467" : "#B42318"}
        meta={st ? `GET /helpdesk/tickets/${number} → ${st}` : null}
        acts={[{ ...btn("tolist", "Back to All Tickets", "primary"), on: () => act.go("tickets") }]}
      />
    );
  }
  const d: Detail = q.data;
  const t = d.ticket;
  const cfg = ws.settings.config;
  const open = t.open;
  const closed = t.status === "Closed";
  const can = act.can;
  const canAssign = t.agentUserId ? can("Reassign") : can("Assign");
  const s = t.sla;
  const P = priB(t.priority);
  const St = stB(t.status);

  const acts: Btn[] = open
    ? [btn("assign", t.agentUserId ? "Reassign" : "Assign", "ghost", !canAssign), btn("status", "Change Status"), btn("pri", "Change Priority", "ghost", !can("Change priority")), btn("escalate", t.escalated ? "Escalate again" : "Escalate"), btn("resolve", "Resolve", "primary", !can("Resolve")), btn("close", "Close", "danger", !can("Close"))]
    : [btn("reopen", "Reopen", "primary", !!t.mergedInto || !d.reopenAllowed, t.mergedInto ? `Merged tickets can’t be reopened — open ${t.mergedInto}` : `Reopen policy: ${cfg.general.reopen}`)];
  const more = [
    { k: "merge", t: "Merge into another ticket…", dis: !cfg.advanced.ticketMerge || !can("Merge") || !open, why: !cfg.advanced.ticketMerge ? "Merging is turned off in Settings › Advanced" : !open ? "Only open tickets can be merged" : "Requires Merge permission" },
    { k: "split", t: "Split into new ticket…", dis: !cfg.advanced.split || closed, why: !cfg.advanced.split ? "Splitting is turned off in Settings › Advanced" : "Closed tickets can’t be split" },
    { k: "queue", t: "Move to queue…", dis: !can("Reassign") || !open, why: "Requires Reassign permission" },
    { k: "follower", t: "Add followers…", dis: false, why: "" },
    { k: "link", t: "Link related record…", dis: closed, why: "Ticket is closed" },
    { k: "audit", t: "View full audit history", dis: false, why: "" },
    ...(can("Delete where allowed") ? [{ k: "delete", t: "Delete ticket…", dis: false, why: "" }] : []),
  ];
  const dAct = (k: string) => {
    set({ dMore: false });
    const rows = [t];
    if (["assign", "status", "pri", "escalate", "resolve", "close", "merge", "queue", "follower", "link"].includes(k)) return act.openModal(k, { rows });
    if (k === "delete") return act.openModal("delTicket", { rows });
    if (k === "reopen") return void act.call("Reopen", () => hdApi.reopen(t.number), () => `${t.number} reopened.`);
    if (k === "split") {
      set({ split: [], tl: "all" });
      return act.flash("Tick the messages or notes to move into a new ticket.");
    }
    if (k === "audit") return set({ drawer: { kind: "audit", detail: d } });
  };

  const msgs = d.messages.filter(tlK[tl] ?? tlK.all);
  const note = comp.mode === "note";
  const canReply = note ? can("Add internal notes") : can("Reply");
  const badFile = (f: File) => (!FILE_OK.includes((f.name.split(".").pop() ?? "").toLowerCase()) ? `.${f.name.split(".").pop()} not allowed` : f.size > 10485760 ? "over 10 MB" : null);
  const okFiles = comp.files.filter((f) => !badFile(f));
  const noText = !comp.text.trim() && !okFiles.length;
  const custFirst = d.customer?.name.split(" ")[0] ?? "the customer";
  const macroOpts = [
    { v: "", t: "Insert saved reply / macro…" },
    ...ws.composer.replies.map((r) => ({ v: "r:" + r.id, t: `Reply · ${r.name} ${r.shortcut}` })),
    ...ws.composer.macros.map((m) => ({ v: "m:" + m.id, t: "Macro · " + m.name })),
    ...ws.composer.articles.filter((a) => note || a.visibility !== "Internal Only").map((a) => ({ v: "k:" + a.id, t: "Article · " + a.title })),
  ];
  const afterOpts = [{ v: "", t: "Keep status: " + t.status }, ...["Waiting on Customer", "In Progress", "Resolved"].filter((x) => x !== t.status && (x !== "Resolved" || can("Resolve"))).map((x) => ({ v: x, t: "Then set: " + x }))];
  const sendDis = closed || !canReply || noText || busy;
  const why = closed ? "Ticket is closed — reopen it to reply" : !canReply ? "Not permitted for your role" : noText ? "Write something first" : "";

  const send = async () => {
    if (sendDis) return;
    const fd = new FormData();
    fd.append("mode", comp.mode);
    fd.append("text", comp.text);
    if (!note && comp.after) fd.append("after", comp.after);
    fd.append("since", since.current);
    if (force) fd.append("force", "true");
    if (comp.articles.length) fd.append("articles", comp.articles.join(","));
    for (const f of okFiles) fd.append("files", f);
    set({ busy: true });
    try {
      const r = await hdApi.reply(t.number, fd);
      set({ busy: false, comp: { ...comp, text: "", files: [], articles: [] } });
      since.current = new Date().toISOString();
      setForce(false);
      act.flash(note ? "Internal note added — not sent to the customer." : r.ok ? (r.delivery === "portal" ? `Reply posted to ${custFirst}’s customer portal.` : `Reply sent to ${custFirst}.`) : `Reply saved but not delivered — ${r.note?.replace(/^✕ [^—]*— /, "")} Retry once the channel is back.`);
      await act.invalidate();
    } catch (e) {
      set({ busy: false });
      if (e instanceof ApiError && e.code === "HELPDESK_COLLISION") {
        setForce(true);
        act.flash(e.message);
        await act.invalidate();
      } else act.flash((note ? "Add internal note" : "Send reply") + " failed — " + errText(e) + " Nothing was sent.");
    }
  };

  const applyMacro = async (v: string) => {
    if (!v) return;
    try {
      const r = await hdApi.apply(t.number, v, comp.mode);
      const s2 = useHd.getState().comp;
      set({ comp: { ...s2, mode: v.startsWith("k:") ? s2.mode : r.text ? "public" : s2.mode, text: r.text ? (s2.text ? s2.text + (v.startsWith("k:") ? "\n" : "\n\n") : "") + r.text : s2.text, articles: r.articleId ? [...s2.articles, r.articleId] : s2.articles } });
      if (v.startsWith("m:")) act.flash(`Macro applied: ${r.done.join(", ") || "nothing"}${r.skipped.length ? " · Skipped: " + r.skipped.join(", ") : ""}`);
      await act.invalidate();
    } catch (e) {
      act.flash(errText(e));
    }
  };

  const fmtIns = (k: string) => {
    const el = document.getElementById("hd-composer") as HTMLTextAreaElement | null;
    const txt = comp.text;
    const a = el ? el.selectionStart : txt.length;
    const b = el ? el.selectionEnd : txt.length;
    const s2 = txt.slice(a, b) || (k === "l" ? "item" : "text");
    const w = k === "b" ? `**${s2}**` : k === "i" ? `_${s2}_` : `\n• ${s2}`;
    set({ comp: { ...comp, text: txt.slice(0, a) + w + txt.slice(b) } });
    if (el) setTimeout(() => el.focus(), 0);
  };

  const dField = (k: string, v: string) => {
    if (k === "status") {
      if (v === "Resolved" && !can("Resolve")) return act.flash("Resolving needs the Resolve permission.");
      if (v === "Closed") return can("Close") ? act.openModal("close", { rows: [t] }) : act.flash("Closing needs the Close permission.");
    }
    const label = { status: "Status", priority: "Priority", agent: "Assign", queue: "Move queue", category: "Update ticket", branch: "Move branch" }[k] ?? "Update";
    void act.call(label, () => hdApi.setField(t.number, k, v), () => (k === "agent" ? (v ? "Assigned to " + (ws.agents.find((a) => a.id === v)?.name ?? "") : "Unassigned") : k === "queue" ? "Moved to " + (ws.queues.find((x) => x.id === v)?.name ?? "") : `${label === "Update ticket" ? "Category" : label} → ${k === "branch" ? ws.branches.find((b) => b.id === v)?.name : v}`));
  };

  const sf = (l: string, k: string, v: string, opts: Array<{ v: string; t: string }>, dis = false, whyT = "") => ({ l, k, v, opts, sel: true as const, dis: dis || closed, why: closed ? "Ticket is closed" : whyT });
  const ro = (l: string, v: string, fg = "#101828") => ({ l, v, fg, sel: false as const });
  const fields = [
    sf("Status", "status", t.status, O([...cfg.statuses, ...cfg.customStatuses])),
    sf("Priority", "priority", t.priority, PRIORITIES.map((p) => ({ v: p, t: `${PRI[p][2]} ${p}` })), !can("Change priority")),
    sf("Category", "category", t.category, O(cfg.categories.includes(t.category) ? cfg.categories : [t.category, ...cfg.categories])),
    ro("Subcategory", t.subcategory || "—"),
    sf("Assigned agent", "agent", t.agentUserId ?? "", O(ws.agents.map((a) => ({ v: a.id, t: `${a.name} · ${a.open}/${a.cap}` })), "Unassigned"), !canAssign),
    sf("Team / queue", "queue", t.queueId ?? "", ws.queues.filter((x) => x.active || x.id === t.queueId).map((x) => ({ v: x.id, t: x.name })), !can("Reassign"), "Requires Reassign permission"),
    sf("Branch", "branch", t.branchId, ws.branches.map((b) => ({ v: b.id, t: b.name })), !act.manager, "Agents can’t move tickets between branches"),
    ro("Source channel", t.channel + (t.conversationLabel ? " · " + t.conversationLabel : "")),
    ro("Created", dt(t.createdAt)),
    ro("First response due", t.firstResponseAt ? "Responded after " + fmtM(t.frMins) : s.firstResponseDueAt ? dt(s.firstResponseDueAt) : "—", !t.firstResponseAt && s.k === "Breached" ? "#B42318" : "#101828"),
    ro("Resolution due", s.resolutionDueAt ? dt(s.resolutionDueAt) : "—"),
    ro("SLA", `${s.t} · ${s.sub}${s.policyName ? " · " + s.policyName : ""}`, s.fg),
  ];
  const cust = d.customer;
  const segBg = /vip/i.test(cust?.segment ?? "") ? "#FDF2FA" : /b2b/i.test(cust?.segment ?? "") ? "#EFF8FF" : "#F2F4F7";
  const segFg = /vip/i.test(cust?.segment ?? "") ? "#C11574" : /b2b/i.test(cust?.segment ?? "") ? "#175CD3" : "#475467";
  const agName = (id: string) => ws.agents.find((a) => a.id === id)?.name ?? "Former agent";
  const sysAudit = d.messages.filter((m) => m.kind === "sys").slice(-4).reverse().map((m) => ({ t: m.body, s: `${m.by} · ${ago(m.at)}` }));
  const auditRows = [...d.audit.slice(0, 2).map((a) => ({ t: `${a.what} · ${a.by}`, s: `${dt(a.at)} · ${a.detail}` })), ...sysAudit].slice(0, 5);
  const merged = t.mergedInto ? "Merged into " + t.mergedInto : t.mergedFrom.length ? "Includes merged " + t.mergedFrom.join(", ") : null;
  const selSt = { border: "1px solid #E6EAF0", borderRadius: "8px", padding: "5px 7px", fontSize: "12px", fontWeight: 600, minHeight: "34px", background: "#fff", width: "100%", color: "#101828" };
  const openAtt = async (m: Msg, i: number) => {
    try {
      const r = await hdApi.attachment(t.number, m.id, i);
      window.open(r.url, "_blank", "noopener");
    } catch (e) {
      act.flash(errText(e));
    }
  };
  const retry = (m: Msg) => void act.call("Retry delivery", () => hdApi.retry(t.number, m.id), (r) => (r.ok ? "Reply delivered on retry." : "Still not delivered — " + r.note.replace(/^✕ [^—]*— /, "")));
  const ctxBtn = { display: "none", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "8px 12px", fontSize: "12px", fontWeight: 800, color: "#344054", cursor: "pointer", minHeight: "38px" } as const;

  return (
    <div data-screen-label="03 Ticket Detail" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <section aria-label="Ticket header" style={card}>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-start", padding: "14px 16px" }}>
          <div style={{ flex: "1 1 320px", minWidth: 0 }}>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <button type="button" onClick={() => act.go("tickets")} style={{ border: 0, background: "transparent", padding: 0, fontSize: "12px", fontWeight: 700, color: "#0E8442", cursor: "pointer", minHeight: "28px" }}>
                ← All tickets
              </button>
              <span style={{ fontSize: "12px", fontWeight: 800, color: "#475467", fontFamily: "ui-monospace,SFMono-Regular,monospace" }}>Ticket #{t.number}</span>
              {merged ? <span style={{ fontSize: "11px", fontWeight: 800, color: "#475467", background: "#F2F4F7", borderRadius: "6px", padding: "3px 7px" }}>{merged}</span> : null}
            </div>
            <h2 style={{ margin: "6px 0 0", fontSize: "19px", fontWeight: 800, color: "#0F172A", letterSpacing: "-.4px", lineHeight: 1.3, textWrap: "pretty" }}>{t.subject}</h2>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "9px" }}>
              {[
                { t: St.bt, bg: St.bbg, fg: St.bfg },
                { t: P.bt, bg: P.bbg, fg: P.bfg },
                { t: `SLA ${s.t} · ${s.sub}`, bg: s.bg, fg: s.fg },
                ...(t.escalated ? [{ t: "⚑ Escalated", bg: "#FDF2FA", fg: "#C11574" }] : []),
                ...(t.reopenCount ? [{ t: "↺ Reopened ×" + t.reopenCount, bg: "#F2F4F7", fg: "#344054" }] : []),
                { t: t.channel, bg: "#F2F4F7", fg: "#344054" },
              ].map((x, i) => (
                <span key={i} style={{ fontSize: "11px", fontWeight: 800, borderRadius: "6px", padding: "4px 8px", background: x.bg, color: x.fg }}>
                  {x.t}
                </span>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
            {acts.map((a) => (
              <button key={a.k} type="button" onClick={() => dAct(a.k)} disabled={a.dis} title={a.why} style={{ border: `1px solid ${a.bd}`, background: a.bg, color: a.fg, borderRadius: "9px", padding: "8px 12px", fontSize: "12px", fontWeight: 800, cursor: "pointer", minHeight: "38px", whiteSpace: "nowrap" }}>
                {a.t}
              </button>
            ))}
            <div style={{ position: "relative" }}>
              <button type="button" onClick={() => set({ dMore: !dMore })} aria-haspopup="menu" aria-expanded={dMore} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "8px 12px", fontSize: "12px", fontWeight: 800, color: "#344054", cursor: "pointer", minHeight: "38px" }}>
                More ▾
              </button>
              {dMore ? (
                <div role="menu" style={{ position: "absolute", right: 0, top: "44px", background: "#fff", border: "1px solid #E6EAF0", borderRadius: "12px", boxShadow: "0 14px 40px rgba(10,27,42,.14)", padding: "6px", minWidth: "210px", zIndex: 60, display: "flex", flexDirection: "column" }}>
                  {more.map((m) => (
                    <button key={m.k} type="button" role="menuitem" className="hd-menu" onClick={() => dAct(m.k)} disabled={m.dis} title={m.dis ? m.why : ""} style={{ border: 0, background: "transparent", textAlign: "left", padding: "10px 11px", borderRadius: "8px", fontSize: "12.5px", fontWeight: 600, color: m.k === "delete" ? "#B42318" : "#344054", cursor: "pointer" }}>
                      {m.t}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button type="button" data-ctxbtn="1" onClick={() => set({ drawer: { kind: "ctx", id: "details", detail: d } })} style={ctxBtn}>
              Details
            </button>
            <button type="button" data-ctxbtn="1" onClick={() => set({ drawer: { kind: "ctx", id: "customer", detail: d } })} style={ctxBtn}>
              Customer
            </button>
          </div>
        </div>
        {split ? (
          <div role="region" aria-label="Split ticket" style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", padding: "10px 16px", background: "#EFF8FF", borderTop: "1px solid #D1E9FF", borderRadius: "0 0 16px 16px" }}>
            <span style={{ flex: 1, minWidth: "200px", fontSize: "12px", fontWeight: 700, color: "#175CD3" }}>Split: tick the messages or notes to copy into a new ticket. {split.length} selected.</span>
            <button type="button" onClick={() => set({ split: null })} style={{ border: "1px solid #D1E9FF", background: "#fff", borderRadius: "8px", padding: "7px 12px", fontSize: "12px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "36px" }}>
              Cancel
            </button>
            <button type="button" onClick={() => act.openModal("split", { rows: [t] })} disabled={!split.length} style={{ border: 0, background: "#175CD3", borderRadius: "8px", padding: "7px 12px", fontSize: "12px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "36px" }}>
              Create new ticket
            </button>
          </div>
        ) : null}
      </section>

      <div data-3col="1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: "14px", alignItems: "start" }}>
        <section aria-label="Conversation" style={{ ...card, overflow: "hidden", minWidth: 0 }}>
          <div style={{ padding: "12px 16px", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid #F2F4F7" }}>
            <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 800, color: "#0F172A", flex: 1, minWidth: "120px" }}>Conversation</h3>
            <div role="tablist" aria-label="Timeline filter" style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
              {seg(
                [
                  ["all", "All", d.messages.length],
                  ["public", "Public", d.messages.filter(tlK.public).length],
                  ["notes", "Notes", d.messages.filter(tlK.notes).length],
                  ["events", "Events", d.messages.filter(tlK.events).length],
                ],
                tl,
              ).map((x) => (
                <button key={x.k} type="button" role="tab" aria-selected={x.on} onClick={() => set({ tl: x.k })} style={{ border: `1px solid ${x.bd}`, background: x.bg, color: x.fg, borderRadius: "20px", padding: "5px 11px", fontSize: "11.5px", fontWeight: 700, cursor: "pointer", minHeight: "32px" }}>
                  {x.t} {x.n}
                </button>
              ))}
            </div>
          </div>
          <ol aria-label="Ticket timeline" style={{ listStyle: "none", margin: 0, padding: "14px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>
            {msgs.map((m) => {
              const isSys = m.kind === "sys";
              const K = KINDS[m.kind] ?? KINDS.cust;
              return (
                <li key={m.id} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                  {split && !isSys ? <input type="checkbox" aria-label="Include in new ticket" checked={split.includes(m.id)} onChange={() => set({ split: split.includes(m.id) ? split.filter((x) => x !== m.id) : [...split, m.id] })} style={{ marginTop: "10px", width: "18px", height: "18px", accentColor: "#175CD3" }} /> : null}
                  {isSys ? (
                    <div style={{ flex: 1, display: "flex", gap: "8px", alignItems: "center", fontSize: "11.5px", color: "#667085", padding: "2px 0 2px 10px", minWidth: 0 }}>
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: /breach|fail|not sent —|not delivered/i.test(m.body) ? "#F04438" : /risk|escalat/i.test(m.body) ? "#F79009" : "#D0D5DD", flex: "0 0 6px" }} />
                      <span style={{ flex: 1, minWidth: 0, lineHeight: 1.45 }}>
                        <b style={{ color: "#475467", fontWeight: 700 }}>{m.by}</b> · {m.body}
                      </span>
                      <span style={{ whiteSpace: "nowrap" }}>{dt(m.at)}</span>
                    </div>
                  ) : (
                    <>
                      <div aria-hidden="true" style={{ width: "32px", height: "32px", borderRadius: "50%", background: K[6], color: K[7], fontSize: "11px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 32px" }}>
                        {initials(m.by)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, border: `1px ${K[5]} ${K[4]}`, background: K[3], borderRadius: "12px", padding: "10px 12px" }}>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", marginBottom: "5px" }}>
                          <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#101828" }}>{m.by}</span>
                          <span style={{ fontSize: "10.5px", fontWeight: 800, borderRadius: "6px", padding: "2px 7px", background: K[1], color: K[2] }}>{K[0]}</span>
                          {m.from ? <span style={{ fontSize: "10.5px", fontWeight: 700, color: "#475467", background: "#F2F4F7", borderRadius: "6px", padding: "2px 7px" }}>{m.from}</span> : null}
                          <span style={{ fontSize: "11px", color: "#667085", marginLeft: "auto" }}>{dt(m.at)}</span>
                        </div>
                        <div style={{ fontSize: "13px", color: "#1D2939", lineHeight: 1.55, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.body}</div>
                        {m.attachments.length ? (
                          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
                            {m.attachments.map((a) => (
                              <button key={a.i} type="button" onClick={() => void openAtt(m, a.i)} aria-label={"Open attachment " + a.name} style={{ display: "flex", gap: "6px", alignItems: "center", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "8px", padding: "6px 9px", fontSize: "11.5px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "34px" }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="m21 12-8.5 8.5a5 5 0 0 1-7-7L14 5a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 8" />
                                </svg>
                                {a.name}
                                <span style={{ color: "#98A2B3", fontWeight: 600 }}>
                                  {a.type} · {fileSize(a.size)}
                                  {m.kind === "note" ? " · internal" : ""}
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                        {m.meta ? <div style={{ fontSize: "11px", color: m.failed ? "#B42318" : "#0E8442", marginTop: "7px", fontWeight: 700 }}>{m.meta}</div> : null}
                        {m.failed && m.kind === "reply" ? (
                          <button type="button" onClick={() => retry(m)} style={{ marginTop: "6px", border: "1px solid #FDD9D6", background: "#fff", borderRadius: "8px", padding: "6px 10px", fontSize: "11.5px", fontWeight: 800, color: "#B42318", cursor: "pointer", minHeight: "32px" }}>
                            Retry delivery
                          </button>
                        ) : null}
                      </div>
                    </>
                  )}
                </li>
              );
            })}
            {!msgs.length ? <li style={{ fontSize: "12px", color: "#667085", padding: "12px 0", textAlign: "center" }}>Nothing in this view.</li> : null}
          </ol>

          <div style={{ borderTop: "1px solid #EEF1F4", padding: "12px 16px 14px", background: note ? "#FFFCF5" : "#fff" }}>
            <div role="tablist" aria-label="Composer mode" style={{ display: "flex", gap: "4px", marginBottom: "8px" }}>
              {(
                [
                  ["public", "Public reply"],
                  ["note", "🔒 Internal note"],
                ] as const
              ).map(([k, tt]) => {
                const on = comp.mode === k;
                return (
                  <button key={k} type="button" role="tab" aria-selected={on} onClick={() => set({ comp: { ...comp, mode: k } })} style={{ border: `1px solid ${on ? (k === "note" ? "#FDE3B3" : "#0A1B2A") : "#E6EAF0"}`, background: on ? (k === "note" ? "#FEF6E7" : "#0A1B2A") : "#fff", color: on ? (k === "note" ? "#B54708" : "#fff") : "#344054", borderRadius: "8px", padding: "6px 12px", fontSize: "12px", fontWeight: 800, cursor: "pointer", minHeight: "34px" }}>
                    {tt}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: "11.5px", color: note ? "#B54708" : d.route.ok ? "#0E8442" : "#B42318", marginBottom: "8px", fontWeight: 700, lineHeight: 1.45 }}>
              {note
                ? "Internal note — visible to your team only. Never sent to the customer or shown in the customer portal."
                : d.route.ok
                  ? `Visible to ${cust?.name ?? "the customer"} · sends via ${d.route.via}${t.conversationLabel ? " (Unified Inbox " + t.conversationLabel + ")" : ""} and appears in the customer portal`
                  : `Can’t deliver via ${d.route.via} right now — ${d.route.why} The reply will still be saved and shown in the customer portal.`}
            </div>
            <textarea
              id="hd-composer"
              aria-label={note ? "Internal note" : "Reply to customer"}
              value={comp.text}
              onChange={(e) => set({ comp: { ...comp, text: e.target.value } })}
              rows={4}
              placeholder={note ? "Write a note for your team…" : `Write your reply to ${custFirst}…`}
              disabled={closed || !canReply}
              style={{ width: "100%", border: `1px solid ${note ? "#FDE3B3" : "#E6EAF0"}`, borderRadius: "10px", padding: "10px 12px", fontSize: "13px", lineHeight: 1.5, resize: "vertical", background: "#fff", color: "#101828", boxSizing: "border-box" }}
            />
            {comp.files.length ? (
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
                {comp.files.map((f, i) => {
                  const bad = badFile(f);
                  return (
                    <span key={i} style={{ display: "flex", gap: "6px", alignItems: "center", border: `1px solid ${bad ? "#FDD9D6" : "#E6EAF0"}`, background: "#fff", borderRadius: "8px", padding: "5px 6px 5px 9px", fontSize: "11.5px", fontWeight: 700, color: bad ? "#B42318" : "#0E8442" }}>
                      {f.name} · {bad ? "✕ " + bad : "✓ Ready · checked on upload"}
                      <button type="button" onClick={() => set({ comp: { ...comp, files: comp.files.filter((_, j) => j !== i) } })} aria-label={"Remove " + f.name} style={{ border: 0, background: "transparent", cursor: "pointer", color: "#667085", fontSize: "14px", lineHeight: 1, width: "24px", height: "24px" }}>
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            ) : null}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center", marginTop: "8px" }}>
              {(
                [
                  ["b", "B", { fontWeight: 800 }],
                  ["i", "I", { fontStyle: "italic", fontWeight: 700 }],
                  ["l", "•", { fontWeight: 800 }],
                ] as const
              ).map(([k, tt, st]) => (
                <button key={k} type="button" onClick={() => fmtIns(k)} aria-label={{ b: "Bold", i: "Italic", l: "Bulleted list" }[k]} style={{ width: "36px", height: "36px", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "8px", cursor: "pointer", color: "#344054", ...st }}>
                  {tt}
                </button>
              ))}
              <label style={{ position: "relative", display: "flex", alignItems: "center", gap: "6px", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "8px", padding: "0 11px", height: "36px", fontSize: "12px", fontWeight: 700, color: "#344054", cursor: "pointer" }}>
                Attach
                <input
                  type="file"
                  multiple
                  onChange={(e) => {
                    const fl = Array.from(e.target.files ?? []);
                    e.target.value = "";
                    set({ comp: { ...useHd.getState().comp, files: [...useHd.getState().comp.files, ...fl] } });
                  }}
                  aria-label="Attach files"
                  style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%" }}
                />
              </label>
              <select aria-label="Insert saved reply or macro" value="" onChange={(e) => void applyMacro(e.target.value)} disabled={closed} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "8px", padding: "6px 8px", fontSize: "12px", fontWeight: 700, color: "#344054", minHeight: "36px", maxWidth: "220px" }}>
                {macroOpts.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.t}
                  </option>
                ))}
              </select>
              <span style={{ flex: 1 }} />
              {!note && open ? (
                <select aria-label="Status after sending" value={comp.after} onChange={(e) => set({ comp: { ...comp, after: e.target.value } })} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "8px", padding: "6px 8px", fontSize: "12px", fontWeight: 700, color: "#344054", minHeight: "36px" }}>
                  {afterOpts.map((o) => (
                    <option key={o.v} value={o.v}>
                      {o.t}
                    </option>
                  ))}
                </select>
              ) : null}
              <button type="button" onClick={() => void send()} disabled={sendDis} title={why} style={{ border: 0, background: note ? "#B54708" : "#12A150", borderRadius: "9px", padding: "9px 16px", fontSize: "12.5px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "38px" }}>
                {busy ? "Saving…" : note ? "Add Internal Note" : force ? "Send Anyway" : "Send Reply"}
              </button>
            </div>
          </div>
        </section>

        <aside data-ctx="1" aria-label="Ticket context" style={{ display: "flex", flexDirection: "column", gap: "12px", minWidth: 0 }}>
          <section style={card}>
            <h3 style={{ margin: 0, padding: "12px 14px 6px", fontSize: "13px", fontWeight: 800, color: "#0F172A" }}>Ticket details</h3>
            <div style={{ padding: "0 14px 10px" }}>
              {fields.map((f) => (
                <div key={f.l} style={{ display: "grid", gridTemplateColumns: "104px minmax(0,1fr)", gap: "8px", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #F8F9FB" }}>
                  <span style={{ fontSize: "11.5px", color: "#667085", fontWeight: 600 }}>{f.l}</span>
                  {f.sel ? (
                    <select aria-label={f.l} value={f.v} onChange={(e) => dField(f.k, e.target.value)} disabled={f.dis} title={f.why} style={selSt}>
                      {f.opts.map((o) => (
                        <option key={o.v} value={o.v}>
                          {o.t}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span style={{ fontSize: "12px", fontWeight: 700, color: f.fg, lineHeight: 1.4 }}>{f.v}</span>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section style={{ ...card, padding: "12px 14px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <h3 style={{ margin: 0, fontSize: "13px", fontWeight: 800, color: "#0F172A" }}>Tags &amp; followers</h3>
            <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
              {t.tags.map((g) => (
                <span key={g} style={{ display: "flex", alignItems: "center", gap: "2px", fontSize: "11.5px", fontWeight: 700, color: "#344054", background: "#F2F4F7", borderRadius: "6px", padding: "3px 3px 3px 8px" }}>
                  #{g}
                  <button type="button" onClick={() => void act.call("Remove tag", () => hdApi.removeTag(t.number, g))} aria-label={"Remove tag " + g} disabled={closed} style={{ border: 0, background: "transparent", cursor: "pointer", color: "#667085", width: "22px", height: "22px" }}>
                    ×
                  </button>
                </span>
              ))}
              <input
                aria-label="Add tag"
                placeholder="Add tag, press Enter"
                disabled={closed}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const v = e.currentTarget.value.trim();
                  if (!v) return;
                  e.currentTarget.value = "";
                  void act.call("Add tag", () => hdApi.addTag(t.number, v));
                }}
                style={{ flex: 1, minWidth: "120px", border: "1px dashed #D0D5DD", borderRadius: "6px", padding: "5px 8px", fontSize: "12px", minHeight: "30px" }}
              />
            </div>
            <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", alignItems: "center" }}>
              {t.followers.map((id) => (
                <span key={id} style={{ display: "flex", alignItems: "center", gap: "2px", fontSize: "11.5px", fontWeight: 700, color: "#175CD3", background: "#EFF8FF", borderRadius: "20px", padding: "3px 3px 3px 9px" }}>
                  {agName(id)}
                  <button type="button" onClick={() => void act.call("Remove follower", () => hdApi.followers(t.number, t.followers.filter((f) => f !== id)))} aria-label={"Remove follower " + agName(id)} disabled={closed} style={{ border: 0, background: "transparent", cursor: "pointer", color: "#175CD3", width: "22px", height: "22px" }}>
                    ×
                  </button>
                </span>
              ))}
              <select aria-label="Add follower" value="" disabled={closed} onChange={(e) => e.target.value && void act.call("Add follower", () => hdApi.followers(t.number, [...t.followers, e.target.value]))} style={{ border: "1px dashed #D0D5DD", background: "#fff", borderRadius: "20px", padding: "4px 8px", fontSize: "11.5px", fontWeight: 700, color: "#475467", minHeight: "30px" }}>
                <option value="">+ Follower</option>
                {ws.agents
                  .filter((a) => !t.followers.includes(a.id))
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </div>
          </section>

          {cust ? (
            <section style={{ ...card, padding: "12px 14px", display: "flex", flexDirection: "column", gap: "9px" }}>
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <div aria-hidden="true" style={{ width: "38px", height: "38px", borderRadius: "50%", background: "#0A1B2A", color: "#39E28B", fontSize: "12px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 38px" }}>
                  {initials(cust.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "13.5px", fontWeight: 800, color: "#101828" }}>{cust.name}</div>
                  <div style={{ fontSize: "11px", color: "#667085" }}>Customers (CRM) · {t.branchName}</div>
                </div>
                <span style={{ fontSize: "10.5px", fontWeight: 800, borderRadius: "6px", padding: "3px 7px", background: segBg, color: segFg }}>{cust.segment}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {[
                  ["Email", cust.email ?? "—"],
                  ["Phone", cust.phone],
                  ["Customer since", cust.since],
                  ["Open tickets", String(cust.openTickets)],
                  ["Previous tickets", String(cust.previousTickets)],
                  ["Credit", cust.credit],
                ].map(([l, v]) => (
                  <div key={l} style={{ display: "grid", gridTemplateColumns: "96px minmax(0,1fr)", gap: "6px", fontSize: "12px" }}>
                    <span style={{ color: "#667085" }}>{l}</span>
                    <span style={{ color: "#101828", fontWeight: 600, overflowWrap: "anywhere" }}>{v}</span>
                  </div>
                ))}
              </div>
              {cust.prev.length ? (
                <>
                  <div style={{ fontSize: "10.5px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#667085", marginTop: "4px" }}>Other tickets</div>
                  {cust.prev.map((p) => (
                    <button key={p.number} type="button" onClick={() => act.openTicket(p.number)} style={{ display: "flex", gap: "8px", alignItems: "center", textAlign: "left", border: "1px solid #F2F4F7", background: "#FAFBFC", borderRadius: "8px", padding: "7px 9px", cursor: "pointer", font: "inherit", minHeight: "36px" }}>
                      <span style={{ fontSize: "11px", fontWeight: 800, color: "#475467", fontFamily: "ui-monospace,monospace" }}>{p.number}</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: "12px", color: "#101828", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.subject}</span>
                      <span style={{ fontSize: "10.5px", fontWeight: 800, color: stB(p.status).bfg }}>{p.status}</span>
                    </button>
                  ))}
                </>
              ) : null}
              {cust.orders.length ? (
                <>
                  <div style={{ fontSize: "10.5px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#667085", marginTop: "4px" }}>Recent orders · Orders</div>
                  {cust.orders.map((o) => (
                    <div key={o.a} style={{ display: "flex", gap: "8px", fontSize: "12px" }}>
                      <span style={{ fontWeight: 800, color: "#344054", fontFamily: "ui-monospace,monospace", fontSize: "11px" }}>{o.a}</span>
                      <span style={{ color: "#667085", flex: 1 }}>{o.b}</span>
                      <span style={{ fontWeight: 700, color: "#101828" }}>{o.c}</span>
                    </div>
                  ))}
                </>
              ) : null}
              {cust.bookings.length ? (
                <>
                  <div style={{ fontSize: "10.5px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#667085", marginTop: "4px" }}>Recent bookings · Bookings</div>
                  {cust.bookings.map((o, i) => (
                    <div key={i} style={{ display: "flex", gap: "8px", fontSize: "12px", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 800, color: "#344054", fontFamily: "ui-monospace,monospace", fontSize: "11px" }}>{o.a}</span>
                      <span style={{ color: "#667085", flex: 1 }}>{o.b}</span>
                      <span style={{ fontWeight: 700, color: "#101828" }}>{o.c}</span>
                    </div>
                  ))}
                </>
              ) : null}
              <button type="button" onClick={() => router.push(`/customers/${cust.id}`)} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "8px 12px", fontSize: "12px", fontWeight: 800, color: "#0E8442", cursor: "pointer", minHeight: "38px", marginTop: "2px" }}>
                Open CRM profile
              </button>
            </section>
          ) : null}

          <section style={{ ...card, padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <h3 style={{ margin: 0, fontSize: "13px", fontWeight: 800, color: "#0F172A", flex: 1 }}>Related records</h3>
              <button type="button" onClick={() => dAct("link")} disabled={closed} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "8px", padding: "5px 10px", fontSize: "11.5px", fontWeight: 800, color: "#344054", cursor: "pointer", minHeight: "32px" }}>
                Link record
              </button>
            </div>
            {d.links.map((r) => (
              <div key={r.id} style={{ display: "flex", gap: "8px", alignItems: "center", border: "1px solid #F2F4F7", borderRadius: "8px", padding: "6px 6px 6px 9px" }}>
                <span style={{ fontSize: "11px", color: "#667085", minWidth: "78px" }}>{r.type}</span>
                <span style={{ flex: 1, fontSize: "12px", fontWeight: 800, color: "#101828", fontFamily: "ui-monospace,monospace" }}>{r.label}</span>
                <button type="button" onClick={() => void act.call("Unlink record", () => hdApi.unlink(t.number, r.id), () => `Unlinked ${r.label}.`)} aria-label={"Unlink " + r.label} disabled={closed} style={{ border: 0, background: "transparent", cursor: "pointer", color: "#667085", width: "26px", height: "26px" }}>
                  ×
                </button>
              </div>
            ))}
            {!d.links.length ? <div style={{ fontSize: "12px", color: "#667085" }}>No linked records. Existing Orders, Bookings and Projects can be linked; Invoices, Payments, Contracts, Assets and Field Service jobs have no module in Noxtill yet.</div> : null}
            {t.conversationId ? (
              <button
                type="button"
                onClick={() => {
                  useInboxStore.getState().select(t.conversationId);
                  router.push("/unified-inbox/conversation");
                }}
                style={{ textAlign: "left", border: 0, background: "#F7FCF9", borderRadius: "8px", padding: "8px 10px", fontSize: "12px", fontWeight: 700, color: "#0E8442", cursor: "pointer", minHeight: "36px" }}
              >
                Unified Inbox conversation{t.conversationLabel ? " · " + t.conversationLabel : ""} ↗
              </button>
            ) : null}
            <div style={{ fontSize: "11.5px", color: "#475467", background: "#FAFBFC", borderRadius: "8px", padding: "8px 10px", lineHeight: 1.45 }}>
              Customer Portal shows this same ticket ({t.number}) to {custFirst}: public replies and status only — internal notes and events are never exposed.{" "}
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(t.portalUrl).then(
                    () => act.flash("Portal link copied."),
                    () => act.flash(t.portalUrl),
                  );
                }}
                style={{ border: 0, background: "transparent", padding: 0, color: "#0E8442", fontWeight: 800, cursor: "pointer", fontSize: "11.5px" }}
              >
                Copy portal link
              </button>
            </div>
          </section>

          <section style={{ ...card, padding: "12px 14px", display: "flex", flexDirection: "column", gap: "7px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <h3 style={{ margin: 0, fontSize: "13px", fontWeight: 800, color: "#0F172A", flex: 1 }}>Audit trail</h3>
              <button type="button" onClick={() => set({ drawer: { kind: "audit", detail: d } })} style={{ border: 0, background: "transparent", fontSize: "11.5px", fontWeight: 800, color: "#0E8442", cursor: "pointer", minHeight: "30px" }}>
                View all ({d.audit.length + d.messages.filter((m) => m.kind === "sys").length})
              </button>
            </div>
            {auditRows.map((a, i) => (
              <div key={i} style={{ fontSize: "11.5px", lineHeight: 1.45, borderLeft: "2px solid #E6EAF0", paddingLeft: "8px" }}>
                <div style={{ color: "#101828", fontWeight: 700 }}>{a.t}</div>
                <div style={{ color: "#667085" }}>{a.s}</div>
              </div>
            ))}
          </section>
        </aside>
      </div>

      <div data-sticky-reply="1" style={{ display: "none", position: "sticky", bottom: "10px", zIndex: 20, gap: "8px", background: "#0A1B2A", borderRadius: "14px", padding: "8px", boxShadow: "0 14px 40px rgba(10,27,42,.3)" }}>
        <button type="button" onClick={() => document.getElementById("hd-composer")?.focus()} style={{ flex: 1, border: 0, background: "#12A150", borderRadius: "10px", padding: "10px", fontSize: "13px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "44px" }}>
          Reply
        </button>
        <button type="button" onClick={() => set({ drawer: { kind: "ctx", id: "details", detail: d } })} style={{ border: "1px solid #1D3547", background: "transparent", borderRadius: "10px", padding: "10px 14px", fontSize: "13px", fontWeight: 700, color: "#E7EEF4", cursor: "pointer", minHeight: "44px" }}>
          Details
        </button>
        <button type="button" onClick={() => set({ drawer: { kind: "ctx", id: "customer", detail: d } })} style={{ border: "1px solid #1D3547", background: "transparent", borderRadius: "10px", padding: "10px 14px", fontSize: "13px", fontWeight: 700, color: "#E7EEF4", cursor: "pointer", minHeight: "44px" }}>
          Customer
        </button>
      </div>
    </div>
  );
}
