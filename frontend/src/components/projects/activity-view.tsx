"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchFeed, fetchSettings, postProjectComment, saveNotify, type FeedItem } from "@/lib/projects-api";
import { useProjectsInvalidate, useProjectsStore, useWorkspace } from "./projects-store";
import { Avatar, ErrorBox, Loading, ago, card, errorText, pillBtn } from "./projects-ui";

const TABS: Record<string, (a: FeedItem) => boolean> = {
  All: () => true,
  Comments: (a) => a.kind === "comment",
  Mentions: (a) => a.mentionsMe,
  "System Activity": (a) => a.kind === "event" && !a.ev.startsWith("approval"),
  Approvals: (a) => a.ev.startsWith("approval"),
};

export function NotifyPrefs({ compact }: { compact?: boolean }) {
  const { data, isLoading } = useQuery({ queryKey: ["projects-settings"], queryFn: fetchSettings });
  const flash = useProjectsStore((s) => s.flash);
  const invalidate = useProjectsInvalidate();
  if (isLoading || !data) return <div style={{ fontSize: "12px", color: "#98A2B3" }}>Loading…</div>;
  return (
    <>
      {Object.entries(data.notify).map(([k, on]) => (
        <label key={k} style={{ display: "flex", gap: "9px", alignItems: "center", fontSize: "12.5px", color: "#344054", cursor: "pointer", minHeight: compact ? "28px" : "30px" }}>
          <input
            type="checkbox"
            checked={on}
            onChange={async () => {
              try {
                await saveNotify({ ...data.notify, [k]: !on });
                await invalidate();
              } catch (e) {
                flash(errorText(e));
              }
            }}
          />
          {k}
        </label>
      ))}
    </>
  );
}

export function ActivityView() {
  const { data: ws, error, isLoading } = useWorkspace();
  const feed = useQuery({ queryKey: ["projects-feed"], queryFn: fetchFeed });
  const flash = useProjectsStore((s) => s.flash);
  const invalidate = useProjectsInvalidate();
  const [tab, setTab] = useState("All");
  const [proj, setProj] = useState("all");
  const [draft, setDraft] = useState("");
  const [postTo, setPostTo] = useState("");
  if (isLoading || feed.isLoading) return <Loading />;
  if (error || !ws) return <ErrorBox error={error} />;
  if (feed.error) return <ErrorBox error={feed.error} />;
  const live = ws.projects.filter((p) => !p.archivedAt && p.status !== "Archived");
  const target = postTo || live[0]?.id || "";
  const items = (feed.data?.items ?? []).filter(TABS[tab]).filter((a) => proj === "all" || a.projectId === proj);
  const mention = (feed.data?.people ?? []).slice(0, 3);

  return (
    <div data-2col="1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: "14px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", minWidth: 0 }}>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {Object.keys(TABS).map((l) => (
            <button key={l} type="button" onClick={() => setTab(l)} style={pillBtn(tab === l)}>
              {l}
            </button>
          ))}
          <select value={proj} onChange={(e) => setProj(e.target.value)} aria-label="Project" style={{ marginLeft: "auto", height: "36px", border: "1px solid #E6EAF0", borderRadius: "10px", padding: "0 10px", fontSize: "12.5px", background: "#fff" }}>
            <option value="all">All projects</option>
            {live.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ ...card, padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder="Post an update — type @ to mention someone" aria-label="New comment" style={{ border: "1px solid #E6EAF0", borderRadius: "10px", padding: "10px 12px", fontSize: "12.5px", resize: "vertical" }} />
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <select value={target} onChange={(e) => setPostTo(e.target.value)} aria-label="Post to project" style={{ height: "34px", border: "1px solid #E6EAF0", borderRadius: "9px", padding: "0 8px", fontSize: "12px" }}>
              {live.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {mention.map((m) => (
              <button key={m} type="button" onClick={() => setDraft((d) => (d ? d + " " : "") + "@" + m + " ")} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "20px", padding: "4px 9px", fontSize: "11px", fontWeight: 700, color: "#475467", cursor: "pointer" }}>
                @{m}
              </button>
            ))}
            <button
              type="button"
              disabled={!draft.trim() || !target}
              onClick={async () => {
                try {
                  const r = await postProjectComment(target, draft.trim());
                  setDraft("");
                  flash(r.notified ? `Posted · ${r.notified} ${r.notified > 1 ? "people" : "person"} notified` : "Posted");
                  await invalidate();
                } catch (e) {
                  flash(errorText(e));
                }
              }}
              style={{ marginLeft: "auto", border: 0, background: "#12A150", color: "#fff", borderRadius: "9px", padding: "8px 14px", fontSize: "12px", fontWeight: 800, cursor: "pointer", opacity: draft.trim() && target ? 1 : 0.6 }}
            >
              Post
            </button>
          </div>
        </div>
        <div style={{ ...card, padding: "6px 16px" }}>
          {items.map((a) => (
            <div key={a.id} style={{ display: "flex", gap: "11px", padding: "11px 0", borderBottom: "1px solid #F4F5F7" }}>
              <Avatar name={a.who} size={30} fs="10.5px" bg={a.kind === "comment" ? "#E7F6EE" : "#F2F4F7"} fg={a.kind === "comment" ? "#0E8442" : "#344054"} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "12.5px", color: "#344054", lineHeight: 1.5 }}>
                  <b style={{ color: "#101828" }}>{a.who}</b> {a.what}
                </div>
                {a.body && <div style={{ fontSize: "12.5px", color: "#101828", background: "#FAFBFC", borderRadius: "9px", padding: "8px 10px", marginTop: "5px", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{a.body}</div>}
                <div style={{ fontSize: "10.5px", color: "#98A2B3", marginTop: "3px" }}>
                  <span style={{ fontFamily: "ui-monospace,monospace" }}>{a.ev}</span> · {ago(a.when)}
                  {a.edited ? " · Edited" : ""}
                </div>
              </div>
            </div>
          ))}
          {!items.length && <div style={{ padding: "30px", textAlign: "center", fontSize: "12.5px", color: "#667085" }}>Nothing in this feed yet.</div>}
        </div>
      </div>
      <aside style={{ ...card, padding: "14px 16px", display: "flex", flexDirection: "column", gap: "9px", alignSelf: "start" }}>
        <div style={{ fontSize: "13.5px", fontWeight: 800, color: "#101828" }}>Notify me about</div>
        <NotifyPrefs compact />
        <div style={{ fontSize: "11px", color: "#98A2B3" }}>Delivered in-app, and only while “Projects &amp; Tasks” notifications are on in your global notification settings.</div>
      </aside>
    </div>
  );
}
