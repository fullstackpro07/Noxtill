"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  deleteSavedReply,
  duplicateSavedReply,
  fetchAutomations,
  fetchInboxOverview,
  fetchInboxSettings,
  fetchSavedReplies,
  setAwayMessage,
  toggleRule,
  updateInboxSettings,
  type Tone,
} from "@/lib/inbox-api";
import { useInboxStore } from "./inbox-store";
import { EmptyBlock, Loading, ToggleRow, card, errorText, useInboxInvalidate } from "./inbox-ui";

const ALL = "All replies";

export function SavedRepliesView() {
  const openModal = useInboxStore((s) => s.openModal);
  const flash = useInboxStore((s) => s.flash);
  const invalidate = useInboxInvalidate();
  const [folder, setFolder] = useState(ALL);
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["inbox-replies", folder, q], queryFn: () => fetchSavedReplies(folder, q) });
  const { data: overview } = useQuery({ queryKey: ["inbox-overview"], queryFn: fetchInboxOverview });
  const canManage = overview?.canManage ?? false;
  const dup = useMutation({ mutationFn: duplicateSavedReply, onSuccess: () => { flash("Duplicated"); void invalidate(); }, onError: (e) => flash(errorText(e)) });
  const del = useMutation({ mutationFn: deleteSavedReply, onSuccess: () => { flash("Saved reply deleted"); void invalidate(); }, onError: (e) => flash(errorText(e)) });
  const manageTitle = canManage ? undefined : "Only an Owner or Manager can change saved replies";

  return (
    <div data-3pane="1" style={{ display: "grid", gridTemplateColumns: "200px minmax(0,1fr)", gap: "15px", alignItems: "start" }}>
      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ padding: "13px 15px", fontSize: "11px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3" }}>Folders</div>
        {(data?.folders ?? [{ k: ALL, n: 0 }]).map((c) => {
          const on = folder === c.k;
          return (
            <button
              key={c.k}
              type="button"
              onClick={() => setFolder(c.k)}
              className="nx-muted-row"
              style={{ display: "flex", alignItems: "center", gap: "9px", width: "100%", textAlign: "left", border: 0, borderTop: "1px solid #F2F4F7", background: on ? "#F7FCF9" : "#fff", padding: "11px 15px", cursor: "pointer", minHeight: "44px" }}
            >
              <span style={{ flex: 1, fontSize: "12px", fontWeight: on ? 800 : 600, color: "#101828" }}>{c.k}</span>
              <span style={{ fontSize: "10.5px", color: "#98A2B3" }}>{c.n}</span>
            </button>
          );
        })}
        <div style={{ padding: "13px 15px", borderTop: "1px solid #F2F4F7" }}>
          <button
            type="button"
            disabled={!canManage}
            title={manageTitle}
            onClick={() => openModal({ type: "new-folder" })}
            className="nx-hover-soft"
            style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "9px 12px", fontSize: "11.5px", fontWeight: 700, color: "#344054", cursor: "pointer", width: "100%", minHeight: "42px", opacity: canManage ? 1 : 0.55 }}
          >
            New folder
          </button>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
        <div style={{ ...card, padding: "15px 17px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search saved replies…" aria-label="Search saved replies" style={{ flex: 1, minWidth: "200px", border: "1px solid #E6EAF0", borderRadius: "11px", padding: "11px 13px", fontSize: "12.5px", minHeight: "44px" }} />
          <button
            type="button"
            disabled={!canManage}
            title={manageTitle}
            onClick={() => openModal({ type: "reply-editor", folder: folder === ALL ? undefined : folder })}
            className="nx-primary"
            style={{ border: 0, background: "#12A150", borderRadius: "11px", padding: "11px 18px", fontSize: "12.5px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "44px", opacity: canManage ? 1 : 0.55 }}
          >
            New saved reply
          </button>
        </div>
        <div style={{ ...card, overflow: "hidden" }}>
          {isLoading && <Loading />}
          {data && data.replies.length === 0 && <EmptyBlock title={q ? "No saved reply matches" : "No saved replies yet"} sub={q ? "Try another word." : "Write the answers you give every day once, with [brackets] for the parts Noxtill fills from the real order or booking."} />}
          {data?.replies.map((r) => (
            <div key={r.id} style={{ padding: "15px 17px", borderBottom: "1px solid #F2F4F7", display: "flex", flexDirection: "column", gap: "9px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#101828" }}>{r.t}</span>
                <span style={{ fontSize: "9.5px", fontWeight: 700, color: "#475467", background: "#F2F4F7", borderRadius: "5px", padding: "2px 6px" }}>{r.cat}</span>
                <span style={{ fontSize: "9.5px", fontWeight: 700, color: "#3538CD", background: "#EEF4FF", borderRadius: "5px", padding: "2px 6px" }}>/{r.slug}</span>
                <span style={{ marginLeft: "auto", fontSize: "10.5px", color: "#98A2B3" }}>
                  Used {r.used} time{r.used === 1 ? "" : "s"} · {r.last}
                </span>
              </div>
              <div style={{ fontSize: "12px", color: "#475467", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{r.text}</div>
              {r.fillsIn && <div style={{ fontSize: "11px", color: "#0E8442", background: "#F7FCF9", border: "1px solid #D5EFE0", borderRadius: "9px", padding: "8px 11px" }}>Fills in automatically: {r.fillsIn}</div>}
              <div style={{ display: "flex", gap: "8px" }}>
                <SmallButton disabled={!canManage} title={manageTitle} onClick={() => openModal({ type: "reply-editor", replyId: r.id, initial: { title: r.t, folder: r.cat, slug: r.slug, body: r.text } })}>
                  Edit
                </SmallButton>
                <SmallButton disabled={!canManage} title={manageTitle} onClick={() => dup.mutate(r.id)}>
                  Duplicate
                </SmallButton>
                <SmallButton
                  disabled={!canManage}
                  title={manageTitle}
                  danger
                  onClick={() => {
                    if (window.confirm(`Delete "${r.t}"?`)) del.mutate(r.id);
                  }}
                >
                  Delete
                </SmallButton>
              </div>
            </div>
          ))}
          <div style={{ padding: "14px 17px", fontSize: "11.5px", color: "#98A2B3" }}>Pick “Saved reply” in any composer to pull one of these in. The bracketed parts are filled from the real order or booking — never guessed; anything without a value stays bracketed for you to fill.</div>
        </div>
      </div>
    </div>
  );
}

function SmallButton({ children, onClick, disabled, title, danger }: { children: string; onClick: () => void; disabled?: boolean; title?: string; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="nx-hover-soft"
      style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "8px 12px", fontSize: "11.5px", fontWeight: 700, color: danger ? "#B42318" : "#344054", cursor: "pointer", minHeight: "40px", opacity: disabled ? 0.55 : 1 }}
    >
      {children}
    </button>
  );
}

const STAT: Record<Tone, string> = { neutral: "#0F172A", amber: "#B54708", red: "#B42318", green: "#0E8442", blue: "#3538CD" };

export function AutomationsView() {
  const openModal = useInboxStore((s) => s.openModal);
  const flash = useInboxStore((s) => s.flash);
  const invalidate = useInboxInvalidate();
  const { data, isLoading } = useQuery({ queryKey: ["inbox-rules"], queryFn: fetchAutomations, refetchInterval: 60000 });
  const { data: overview } = useQuery({ queryKey: ["inbox-overview"], queryFn: fetchInboxOverview });
  const canManage = overview?.canManage ?? false;
  const toggle = useMutation({ mutationFn: toggleRule, onSuccess: () => { flash("Rule updated"); void invalidate(); }, onError: (e) => flash(errorText(e)) });
  if (isLoading || !data) return <Loading />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "15px", fontWeight: 800, color: "#101828" }}>Rules that run on their own</div>
          <div style={{ fontSize: "12px", color: "#98A2B3", marginTop: "3px" }}>Sorting, tagging and routing run unattended. The only thing that reaches a customer on its own is the fixed away message.</div>
        </div>
        <button
          type="button"
          disabled={!canManage}
          title={canManage ? undefined : "Only an Owner or Manager can add rules"}
          onClick={() => openModal({ type: "rule-editor" })}
          className="nx-primary"
          style={{ border: 0, background: "#12A150", borderRadius: "11px", padding: "11px 18px", fontSize: "12.5px", fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: "44px", opacity: canManage ? 1 : 0.55 }}
        >
          New rule
        </button>
      </div>
      {data.rules.length === 0 && (
        <div style={card}>
          <EmptyBlock title="No rules yet" sub="Start with “money questions go to the top” or “flag anything unanswered after 15 minutes”. Rules only ever tag, sort, assign or flag — they never write to a customer, except the away message." icon="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: "14px" }}>
        {data.rules.map((r) => {
          const paused = r.st === "Paused";
          return (
            <div key={r.id} style={{ background: "#fff", border: `1px solid ${paused ? "#E6EAF0" : "#D5EFE0"}`, borderRadius: "16px", padding: "16px", display: "flex", flexDirection: "column", gap: "11px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: "13px", fontWeight: 800, color: "#101828", lineHeight: 1.4 }}>{r.t}</span>
                <span style={{ fontSize: "10px", fontWeight: 800, color: paused ? "#475467" : "#0E8442", background: paused ? "#F2F4F7" : "#E8F7EE", borderRadius: "20px", padding: "4px 10px", flex: "0 0 auto" }}>{r.st}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                <div style={{ display: "flex", gap: "8px" }}>
                  <span style={{ fontSize: "10px", fontWeight: 800, color: "#98A2B3", width: "40px", flex: "0 0 auto", paddingTop: "2px" }}>WHEN</span>
                  <span style={{ fontSize: "11.5px", color: "#344054", lineHeight: 1.5 }}>{r.when}</span>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <span style={{ fontSize: "10px", fontWeight: 800, color: "#98A2B3", width: "40px", flex: "0 0 auto", paddingTop: "2px" }}>THEN</span>
                  <span style={{ fontSize: "11.5px", color: "#344054", lineHeight: 1.5 }}>{r.then}</span>
                </div>
              </div>
              {r.approval && <div style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", borderRadius: "9px", padding: "8px 11px", fontSize: "10.5px", fontWeight: 700, color: "#93370D" }}>{r.approval}</div>}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", borderTop: "1px solid #F2F4F7", paddingTop: "10px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "10.5px", color: "#98A2B3" }}>{r.runs}</span>
                <span style={{ display: "flex", gap: "7px" }}>
                  <RuleBtn onClick={() => openModal({ type: "rule-history", ruleId: r.id })}>History</RuleBtn>
                  {canManage && <RuleBtn onClick={() => openModal({ type: "rule-editor", rule: r })}>Edit</RuleBtn>}
                  {canManage && <RuleBtn onClick={() => toggle.mutate(r.id)}>{paused ? "Turn on" : "Pause"}</RuleBtn>}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ ...card, padding: "17px" }}>
        <div style={{ fontSize: "13.5px", fontWeight: 800, color: "#101828" }}>Caught by rules today</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "13px", marginTop: "13px" }}>
          {data.stats.map((s) => (
            <div key={s.l} style={{ border: "1px solid #E6EAF0", borderRadius: "13px", padding: "13px" }}>
              <div style={{ fontSize: "21px", fontWeight: 800, color: STAT[s.tone] }}>{s.v}</div>
              <div style={{ fontSize: "11.5px", color: "#475467", marginTop: "3px" }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RuleBtn({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="nx-hover-soft" style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "7px 11px", fontSize: "11px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "38px" }}>
      {children}
    </button>
  );
}

export function InboxSettingsView() {
  const openModal = useInboxStore((s) => s.openModal);
  const flash = useInboxStore((s) => s.flash);
  const invalidate = useInboxInvalidate();
  const { data, isLoading } = useQuery({ queryKey: ["inbox-settings"], queryFn: fetchInboxSettings });
  const save = useMutation({ mutationFn: updateInboxSettings, onSuccess: () => { flash("Saved"); void invalidate(); }, onError: (e) => flash(errorText(e)) });
  const away = useMutation({ mutationFn: (on: boolean) => setAwayMessage(on), onSuccess: (r) => { flash(r.toggles.find((t) => t.key === "away")?.on ? "Away message on" : "Away message off"); void invalidate(); }, onError: (e) => flash(errorText(e)) });
  if (isLoading || !data) return <Loading />;
  const cm = data.canManage;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))", gap: "14px", alignItems: "start" }}>
      <div style={{ ...card, padding: "17px" }}>
        <div style={{ fontSize: "13.5px", fontWeight: 800, color: "#101828" }}>Working hours</div>
        <div style={{ fontSize: "11.5px", color: "#98A2B3", marginTop: "3px" }}>
          Used for promise times and the away message.{" "}
          {data.hoursSource === "business" ? "Following your business hours." : data.hoursSource === "inbox" ? "Inbox-only hours." : "None set yet."} Times are in {data.timezone}.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "9px", marginTop: "13px" }}>
          {data.hours.map((h) => (
            <div key={h.d} style={{ display: "flex", alignItems: "center", gap: "10px", border: "1px solid #E6EAF0", borderRadius: "11px", padding: "10px 12px" }}>
              <span style={{ flex: 1, fontSize: "12px", fontWeight: 700, color: "#101828" }}>{h.d}</span>
              <span style={{ fontSize: "12px", color: h.closed ? "#98A2B3" : "#344054" }}>{h.t}</span>
            </div>
          ))}
        </div>
        <button
          type="button"
          disabled={!cm}
          onClick={() => openModal({ type: "hours-editor" })}
          className="nx-hover-soft"
          style={{ marginTop: "12px", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "10px 14px", fontSize: "12px", fontWeight: 700, color: "#344054", cursor: "pointer", minHeight: "42px", width: "100%", opacity: cm ? 1 : 0.55 }}
        >
          Edit hours
        </button>
      </div>

      <div style={{ ...card, padding: "17px" }}>
        <div style={{ fontSize: "13.5px", fontWeight: 800, color: "#101828" }}>How new conversations are handed out</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "13px" }}>
          {data.assignModes.map((m) => {
            const on = data.assignMode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                disabled={!cm}
                onClick={() => !on && save.mutate({ assignMode: m.key })}
                className="nx-muted-row"
                style={{ display: "flex", alignItems: "flex-start", gap: "11px", width: "100%", textAlign: "left", border: `1px solid ${on ? "#12A150" : "#E6EAF0"}`, background: on ? "#F7FCF9" : "#fff", borderRadius: "12px", padding: "12px", cursor: cm ? "pointer" : "default", minHeight: "48px" }}
              >
                <span style={{ width: "17px", height: "17px", borderRadius: "50%", border: `2px solid ${on ? "#12A150" : "#D0D5DD"}`, flex: "0 0 auto", marginTop: "1px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: on ? "#12A150" : "transparent" }} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: "12.5px", fontWeight: 800, color: "#101828" }}>{m.t}</span>
                  <span style={{ display: "block", fontSize: "11px", color: "#667085", marginTop: "3px", lineHeight: 1.45 }}>{m.d}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ ...card, padding: "17px" }}>
        <div style={{ fontSize: "13.5px", fontWeight: 800, color: "#101828" }}>Who can do what</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "9px", marginTop: "13px" }}>
          {data.perms.map((p) => (
            <div key={p.t} style={{ border: "1px solid #E6EAF0", borderRadius: "12px", padding: "11px 12px" }}>
              <div style={{ fontSize: "12px", fontWeight: 800, color: "#101828" }}>{p.t}</div>
              <div style={{ fontSize: "11px", color: "#667085", marginTop: "4px", lineHeight: 1.45 }}>{p.who}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...card, padding: "17px" }}>
        <div style={{ fontSize: "13.5px", fontWeight: 800, color: "#101828" }}>Notifications and keeping records</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "13px" }}>
          {data.toggles.map((t) => (
            <ToggleRow
              key={t.key}
              l={t.l}
              d={t.d}
              on={t.on}
              locked={t.locked || !cm}
              onToggle={() => (t.key === "away" ? away.mutate(!t.on) : save.mutate({ [t.key]: !t.on }))}
            />
          ))}
        </div>
        {data.toggles.find((t) => t.key === "away")?.on && cm && (
          <button type="button" onClick={() => openModal({ type: "away-editor" })} style={{ marginTop: "10px", border: 0, background: "none", padding: 0, fontSize: "11.5px", fontWeight: 800, color: "#0E8442", cursor: "pointer" }}>
            Edit the away message
          </button>
        )}
        <div style={{ fontSize: "11px", color: "#98A2B3", marginTop: "13px", lineHeight: 1.5 }}>{data.retention}</div>
      </div>
    </div>
  );
}
