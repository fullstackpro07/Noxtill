"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { discardDraft, fetchAiActions, fetchAiAssist, fetchInboxOverview, sendDraft, updateInboxSettings, type Tone } from "@/lib/inbox-api";
import { useInboxStore } from "./inbox-store";
import { ChannelChip, EmptyBlock, InfoBanner, Loading, ToggleRow, card, errorText, relTime, useInboxInvalidate } from "./inbox-ui";

const STAT_COLOR: Record<Tone, string> = { green: "#0E8442", amber: "#B54708", red: "#B42318", neutral: "#0F172A", blue: "#3538CD" };
const selectStyle: React.CSSProperties = { width: "100%", border: "1px solid #E6EAF0", borderRadius: "11px", padding: "11px", fontSize: "12.5px", fontWeight: 700, color: "#344054", background: "#fff", minHeight: "46px" };
const lbl: React.CSSProperties = { display: "block", fontSize: "11px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3", marginBottom: "5px" };

export function AiAssistView() {
  const router = useRouter();
  const flash = useInboxStore((s) => s.flash);
  const select = useInboxStore((s) => s.select);
  const stage = useInboxStore((s) => s.stageComposer);
  const invalidate = useInboxInvalidate();
  const { data, isLoading } = useQuery({ queryKey: ["inbox-ai-assist"], queryFn: fetchAiAssist, refetchInterval: 30000 });
  const { data: overview } = useQuery({ queryKey: ["inbox-overview"], queryFn: fetchInboxOverview });
  const canManage = overview?.canManage ?? false;
  const onErr = (e: unknown) => flash(errorText(e));
  const send = useMutation({ mutationFn: (id: string) => sendDraft(id), onSuccess: () => { flash("Draft sent"); void invalidate(); }, onError: onErr });
  const discard = useMutation({ mutationFn: (id: string) => discardDraft(id), onSuccess: () => { flash("Draft discarded"); void invalidate(); }, onError: onErr });
  const save = useMutation({ mutationFn: (body: Record<string, unknown>) => updateInboxSettings(body), onSuccess: () => { flash("Saved"); void invalidate(); }, onError: onErr });

  if (isLoading || !data) return <Loading />;
  const s = data.settings;
  const toggles = [
    { key: "aiAutoDraft", l: "Draft replies automatically", d: "A draft appears as soon as a message lands. It is never sent on its own.", on: s.aiAutoDraft },
    { key: "aiFactsOnly", l: "Only draft when the facts are certain", d: "If no order, delivery, credit, booking or named product backs the answer, no draft is offered.", on: s.aiFactsOnly },
    { key: "aiNextAction", l: "Suggest the next best action", d: "Shows what a person would usually do next, like opening the order.", on: s.aiNextAction },
    { key: "aiSummarise", l: "Summarise long conversations", d: "A three-line summary above threads over 20 messages.", on: s.aiSummarise },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      <InfoBanner icon="warn">AI drafts. A person sends. Nothing on this screen goes to a customer, changes an order, or moves money until someone here presses the button.</InfoBanner>
      <div data-3pane="1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr)", gap: "15px", alignItems: "start" }}>
        <div style={{ ...card, overflow: "hidden" }}>
          <div style={{ padding: "15px 17px", borderBottom: "1px solid #F2F4F7", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "14px", fontWeight: 800, color: "#101828" }}>Drafts waiting for you</div>
              <div style={{ fontSize: "11.5px", color: "#98A2B3", marginTop: "3px" }}>Each one shows what it was built from. If the facts were missing, no draft was made.</div>
            </div>
            <span style={{ fontSize: "10.5px", fontWeight: 800, color: "#0E8442", background: "#E8F7EE", borderRadius: "20px", padding: "4px 10px" }}>{data.drafts.length} waiting</span>
          </div>
          {data.drafts.length === 0 && <EmptyBlock title="No drafts waiting" sub={s.aiAutoDraft ? "New customer messages get a draft when a real record backs the answer." : "Automatic drafting is off. You can still ask for one from a conversation."} />}
          {data.drafts.map((d) => {
            const blocked = d.needsDecision && !canManage;
            return (
              <div key={d.id} style={{ padding: "16px 17px", borderBottom: "1px solid #F2F4F7", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
                  <span style={{ width: "26px", height: "26px", borderRadius: "9px", background: "#F2F4F7", color: "#475467", fontSize: "10px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{d.init}</span>
                  <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#101828" }}>{d.name}</span>
                  <ChannelChip channel={d.channel} withLogo={false} />
                  <span style={{ fontSize: "9.5px", fontWeight: 800, color: d.needsDecision ? "#B54708" : "#0E8442", background: d.needsDecision ? "#FEF6E7" : "#E8F7EE", borderRadius: "5px", padding: "2px 6px" }}>{d.needsDecision ? "Needs a decision" : "Facts checked"}</span>
                  <span style={{ marginLeft: "auto", fontSize: "10.5px", color: "#98A2B3" }}>{relTime(d.when)}</span>
                </div>
                <div style={{ background: "#F7FCF9", border: "1px solid #D5EFE0", borderRadius: "12px", padding: "12px 14px", fontSize: "12.5px", color: "#101828", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{d.text}</div>
                <div style={{ fontSize: "11px", color: "#667085", lineHeight: 1.5 }}>Built from: {d.src}</div>
                {d.warn && <div style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", borderRadius: "10px", padding: "9px 12px", fontSize: "11px", fontWeight: 700, color: "#93370D" }}>{d.warn}</div>}
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    disabled={blocked || send.isPending}
                    title={blocked ? "Only someone who can manage credit can send this" : undefined}
                    onClick={() => send.mutate(d.id)}
                    className="nx-primary"
                    style={{ border: 0, background: "#12A150", borderRadius: "10px", padding: "9px 15px", fontSize: "11.5px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "40px", opacity: blocked ? 0.55 : 1 }}
                  >
                    Send as written
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      select(d.conversationId);
                      stage({ conversationId: d.conversationId, text: d.text, draftId: d.id });
                      router.push("/unified-inbox/conversation");
                    }}
                    className="nx-hover-soft"
                    style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "9px 15px", fontSize: "11.5px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "40px" }}
                  >
                    Edit first
                  </button>
                  <button
                    type="button"
                    onClick={() => discard.mutate(d.id)}
                    style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "9px 15px", fontSize: "11.5px", fontWeight: 700, color: "#B42318", cursor: "pointer", minHeight: "40px" }}
                  >
                    Discard
                  </button>
                </div>
              </div>
            );
          })}
          <div style={{ padding: "14px 17px", fontSize: "11.5px", color: "#98A2B3" }}>
            {data.skippedCount === 0 && data.unavailableCount === 0 && "Every conversation waiting on a reply either has a draft or has not been looked at by AI yet."}
            {data.skippedCount > 0 && `${data.skippedCount} other conversation${data.skippedCount === 1 ? "" : "s"} had no draft made — the answer depended on something the system does not know. `}
            {data.unavailableCount > 0 && `${data.unavailableCount} could not be drafted because the AI service was unreachable — ask again from the conversation once it is back.`}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
          <div style={{ ...card, padding: "17px" }}>
            <div style={{ fontSize: "13.5px", fontWeight: 800, color: "#101828" }}>How it writes</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "13px", marginTop: "13px" }}>
              <div>
                <label style={lbl}>Tone</label>
                <select aria-label="Tone" value={s.tone} disabled={!canManage} onChange={(e) => save.mutate({ tone: e.target.value })} style={selectStyle}>
                  <option value="warm">Warm and short{s.tone === "warm" ? " (current)" : ""}</option>
                  <option value="formal">Formal{s.tone === "formal" ? " (current)" : ""}</option>
                  <option value="brief">Very brief{s.tone === "brief" ? " (current)" : ""}</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Reply language</label>
                <select aria-label="Language" value={s.language} disabled={!canManage} onChange={(e) => save.mutate({ language: e.target.value })} style={selectStyle}>
                  <option value="match">Match the customer{s.language === "match" ? " (current)" : ""}</option>
                  <option value="en">Always English{s.language === "en" ? " (current)" : ""}</option>
                  <option value="ur">Always Urdu{s.language === "ur" ? " (current)" : ""}</option>
                </select>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "14px" }}>
              {toggles.map((t) => (
                <ToggleRow key={t.key} l={t.l} d={t.d} on={t.on} locked={!canManage} onToggle={() => save.mutate({ [t.key]: !t.on })} />
              ))}
            </div>
            {!canManage && <div style={{ fontSize: "11px", color: "#98A2B3", marginTop: "10px" }}>Only an Owner or Manager can change these.</div>}
          </div>
          <div style={{ ...card, padding: "17px" }}>
            <div style={{ fontSize: "13.5px", fontWeight: 800, color: "#101828" }}>Last 30 days</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "11px", marginTop: "12px" }}>
              {data.stats.map((st) => (
                <div key={st.l} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px" }}>
                  <span style={{ fontSize: "12px", color: "#475467" }}>{st.l}</span>
                  <span style={{ fontSize: "13.5px", fontWeight: 800, color: STAT_COLOR[st.tone] }}>{st.v}</span>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px" }}>
                <span style={{ fontSize: "12px", color: "#475467" }}>Time saved</span>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#98A2B3" }}>Not measured</span>
              </div>
            </div>
            <div style={{ fontSize: "11px", color: "#98A2B3", marginTop: "12px", lineHeight: 1.5 }}>Edited-before-sending is the number worth watching. If it climbs, the drafts are wrong and the tone needs changing. Percentages are of drafts someone decided on.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const ICONS: Record<string, string> = {
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  tag: "M20.6 13.4 12 22l-9-9V4a1 1 0 0 1 1-1h9l7.6 7.6a2 2 0 0 1 0 2.8ZM7.5 7.5h.01",
  pen: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z",
  file: "M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2ZM15 2v5h5M9 14h6",
  money: "M12 2v20M17 6.5c0-2-2.2-3-5-3s-5 1-5 3.2S9.5 10 12 10.5s5 1.4 5 3.6-2.2 3.4-5 3.4-5-1.2-5-3",
  refund: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4Z",
};

function modeColors(mode: string) {
  if (mode === "Automatic") return { bg: "#E8F7EE", fg: "#0E8442" };
  if (mode === "Ask first") return { bg: "#FEF6E7", fg: "#B54708" };
  if (mode === "Off" || mode === "No rules yet") return { bg: "#F2F4F7", fg: "#475467" };
  return { bg: "#FEF3F2", fg: "#B42318" };
}

const LOG_COLOR: Record<string, { bg: string; fg: string }> = {
  Done: { bg: "#E8F7EE", fg: "#0E8442" },
  Approved: { bg: "#E8F7EE", fg: "#0E8442" },
  Waiting: { bg: "#FEF6E7", fg: "#B54708" },
  Declined: { bg: "#FEF3F2", fg: "#B42318" },
  Skipped: { bg: "#F2F4F7", fg: "#475467" },
};

export function AiActionsView() {
  const router = useRouter();
  const flash = useInboxStore((s) => s.flash);
  const select = useInboxStore((s) => s.select);
  const invalidate = useInboxInvalidate();
  const { data, isLoading } = useQuery({ queryKey: ["inbox-ai-actions"], queryFn: fetchAiActions, refetchInterval: 30000 });
  const { data: overview } = useQuery({ queryKey: ["inbox-overview"], queryFn: fetchInboxOverview });
  const save = useMutation({ mutationFn: (body: Record<string, unknown>) => updateInboxSettings(body), onSuccess: () => { flash("Permission changed"); void invalidate(); }, onError: (e) => flash(errorText(e)) });
  if (isLoading || !data) return <Loading />;
  const canManage = overview?.canManage ?? false;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      <InfoBanner tone="amber" icon="warn">
        Anything that costs money, changes an order, or promises a customer something is <strong>not something the inbox AI can do</strong> — it can only draft words, and a person sends them.
      </InfoBanner>
      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ padding: "15px 17px", borderBottom: "1px solid #F2F4F7" }}>
          <div style={{ fontSize: "14px", fontWeight: 800, color: "#101828" }}>What AI is allowed to do</div>
          <div style={{ fontSize: "11.5px", color: "#98A2B3", marginTop: "3px" }}>Reading is safe. Writing is not. The split is deliberate.</div>
        </div>
        {data.actions.map((a) => {
          const mc = modeColors(a.mode);
          const tile = a.locked ? { bg: "#FEF3F2", fg: "#B42318" } : a.key === "draft" ? { bg: "#EEF4FF", fg: "#3538CD" } : { bg: "#E8F7EE", fg: "#0E8442" };
          return (
            <div key={a.key} style={{ padding: "14px 17px", borderBottom: "1px solid #F2F4F7", display: "flex", alignItems: "center", gap: "13px", flexWrap: "wrap" }}>
              <span style={{ width: "32px", height: "32px", borderRadius: "10px", background: tile.bg, color: tile.fg, display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>
                <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d={ICONS[a.icon]} />
                </svg>
              </span>
              <span style={{ flex: 1, minWidth: "200px" }}>
                <span style={{ display: "block", fontSize: "12.5px", fontWeight: 800, color: "#101828" }}>{a.t}</span>
                <span style={{ display: "block", fontSize: "11px", color: "#667085", marginTop: "3px", lineHeight: 1.45 }}>{a.d}</span>
              </span>
              <span style={{ fontSize: "10.5px", fontWeight: 800, color: mc.fg, background: mc.bg, borderRadius: "20px", padding: "5px 11px" }}>{a.mode}</span>
              {a.locked && <span style={{ fontSize: "10.5px", color: "#98A2B3" }}>Locked</span>}
              {!a.locked && (a.setting || a.link) && (
                <button
                  type="button"
                  disabled={!!a.setting && !canManage}
                  title={a.setting && !canManage ? "Only an Owner or Manager can change this" : undefined}
                  onClick={() => (a.setting ? save.mutate({ [a.setting]: !a.on }) : router.push("/unified-inbox/automations"))}
                  className="nx-hover-soft"
                  style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "8px 12px", fontSize: "11.5px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "40px" }}
                >
                  {a.setting ? (a.on ? "Turn off" : "Turn on") : "Change rules"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ padding: "15px 17px", borderBottom: "1px solid #F2F4F7" }}>
          <div style={{ fontSize: "14px", fontWeight: 800, color: "#101828" }}>What it actually did</div>
          <div style={{ fontSize: "11.5px", color: "#98A2B3", marginTop: "3px" }}>Full log, kept with the conversations — nothing is removed automatically. Every approval has a name against it.</div>
        </div>
        {data.log.length === 0 && <EmptyBlock title="Nothing yet" sub="AI has not read, drafted or translated anything in this inbox." />}
        {data.log.map((l) => {
          const c = LOG_COLOR[l.state] ?? LOG_COLOR.Done;
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => {
                if (!l.conversationId) return;
                select(l.conversationId);
                router.push("/unified-inbox/conversation");
              }}
              className="nx-muted-row"
              style={{ width: "100%", textAlign: "left", border: 0, background: "#fff", padding: "13px 17px", borderBottom: "1px solid #F2F4F7", display: "flex", alignItems: "flex-start", gap: "12px", cursor: l.conversationId ? "pointer" : "default" }}
            >
              <span style={{ fontSize: "10.5px", color: "#98A2B3", width: "86px", flex: "0 0 auto", paddingTop: "2px" }}>{l.when}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#101828" }}>{l.t}</span>
                <span style={{ display: "block", fontSize: "11px", color: "#667085", marginTop: "3px" }}>{l.who}</span>
              </span>
              <span style={{ fontSize: "10.5px", fontWeight: 800, color: c.fg, background: c.bg, borderRadius: "20px", padding: "4px 10px", flex: "0 0 auto" }}>{l.state}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
