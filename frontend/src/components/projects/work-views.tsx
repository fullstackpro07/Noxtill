"use client";

import { useMemo, useState } from "react";
import type { TaskRow, Workspace } from "@/lib/projects-api";
import { useProjectsStore, useWorkspace } from "./projects-store";
import { useProjectActions } from "./projects-actions";
import { Avatar, Badge, ErrorBox, Kpi, Loading, card, days, fmtShort, hrs, inputSt, left, pillBtn, pr, seg, st, theadRow, th } from "./projects-ui";

const COLUMNS = ["Backlog", "To Do", "In Progress", "In Review", "Blocked", "Done"];
const isOpen = (t: TaskRow) => t.status !== "Done" && t.status !== "Cancelled";
const isBlk = (t: TaskRow) => isOpen(t) && (t.blocked || t.status === "Blocked");

export const TASK_VIEWS: Record<string, (t: TaskRow, ws: Workspace) => boolean> = {
  "All Tasks": (t) => t.status !== "Cancelled",
  "My Tasks": (t, ws) => !!ws.me.personId && t.assigneeId === ws.me.personId,
  "Due Today": (t, ws) => isOpen(t) && !!t.dueDate && t.dueDate === ws.today,
  Upcoming: (t, ws) => isOpen(t) && !!t.dueDate && t.dueDate > ws.today,
  Overdue: (t, ws) => isOpen(t) && !!t.dueDate && t.dueDate < ws.today,
  Blocked: (t) => isBlk(t),
  Completed: (t) => t.status === "Done",
};

const KF: Record<string, (t: TaskRow, ws: Workspace) => boolean> = {
  All: () => true,
  "My Tasks": (t, ws) => !!ws.me.personId && t.assigneeId === ws.me.personId,
  "Due Today": (t, ws) => t.dueDate === ws.today,
  Overdue: (t, ws) => isOpen(t) && !!t.dueDate && t.dueDate < ws.today,
  Blocked: (t) => t.blocked,
  "High Priority": (t) => t.priority === "Urgent" || t.priority === "High",
};

export function BoardView() {
  const { data: ws, error, isLoading } = useWorkspace();
  const act = useProjectActions(ws);
  const open = useProjectsStore((s) => s.open);
  const [kf, setKf] = useState("All");
  const [zoom, setZoom] = useState<"compact" | "comfortable">("comfortable");
  const [over, setOver] = useState<string | null>(null);
  if (isLoading) return <Loading />;
  if (error || !ws) return <ErrorBox error={error} />;
  const people = new Map(ws.people.map((p) => [p.id, p.name]));
  const pname = new Map(ws.projects.map((p) => [p.id, p.name]));
  const comp = zoom === "compact";
  const wip = ws.config.wipLimit;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
        {Object.keys(KF).map((l) => (
          <button key={l} type="button" onClick={() => setKf(l)} style={pillBtn(kf === l)}>
            {l}
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: "4px", border: "1px solid #E6EAF0", borderRadius: "10px", padding: "3px", background: "#fff" }}>
          {(["compact", "comfortable"] as const).map((z) => (
            <button key={z} type="button" onClick={() => setZoom(z)} style={{ border: 0, borderRadius: "7px", padding: "6px 10px", fontSize: "11.5px", fontWeight: 700, cursor: "pointer", ...seg(zoom === z) }}>
              {z === "compact" ? "Compact" : "Comfortable"}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: "12px", overflowX: "auto", paddingBottom: "6px", alignItems: "flex-start" }}>
        {COLUMNS.map((k) => {
          const all = ws.tasks.filter((t) => t.status === k);
          const cards = all.filter((t) => KF[kf](t, ws));
          const isOver = k === "In Progress" && all.length > wip;
          return (
            <div
              key={k}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(k);
              }}
              onDragLeave={() => setOver((o) => (o === k ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const t = ws.tasks.find((x) => x.id === e.dataTransfer.getData("text/plain"));
                if (t) void act.changeStatus(t, k);
              }}
              style={{ flex: "0 0 272px", background: isOver ? "#FFFBF5" : "#F7F8FA", border: `1px solid ${over === k ? "#12A150" : isOver ? "#FEDF89" : "#EEF0F3"}`, borderRadius: "14px", padding: "10px", display: "flex", flexDirection: "column", gap: "8px", minHeight: "360px" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "7px", padding: "2px 4px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: st(k).fg }} />
                <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#101828" }}>{k}</span>
                <span style={{ fontSize: "11.5px", fontWeight: 700, color: isOver ? "#B42318" : "#98A2B3" }}>{k === "In Progress" ? `${all.length} / ${wip}` : all.length}</span>
              </div>
              {isOver && <div style={{ fontSize: "11px", fontWeight: 700, color: "#B54708", background: "#FEF6E7", borderRadius: "8px", padding: "5px 8px" }}>WIP limit exceeded — finish work before pulling more.</div>}
              {cards.map((t) => {
                const [, dfg] = left(t.dueDate, ws.today, t.status === "Done");
                const depOpen = t.deps.map((d) => ws.tasks.find((x) => x.id === d)).find((x) => x && isOpen(x));
                const who = people.get(t.assigneeId ?? "") ?? "Unassigned";
                return (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", t.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => open({ kind: "task", id: t.id })}
                    onKeyDown={(e) => e.key === "Enter" && open({ kind: "task", id: t.id })}
                    role="button"
                    tabIndex={0}
                    aria-label={`${t.number} ${t.title}, ${k}, ${t.priority} priority`}
                    className="pt-card"
                    style={{ background: "#fff", border: "1px solid #E6EAF0", borderRadius: "11px", padding: comp ? "8px 10px" : "11px 12px", cursor: "grab", display: "flex", flexDirection: "column", gap: "7px", boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}
                  >
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <span style={{ fontSize: "10.5px", color: "#98A2B3", fontWeight: 600 }}>{t.number}</span>
                      <span style={{ marginLeft: "auto", fontSize: "10px", fontWeight: 800, color: pr(t.priority).fg, background: pr(t.priority).bg, borderRadius: "5px", padding: "1px 6px" }}>{t.priority}</span>
                    </div>
                    <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#101828", lineHeight: 1.35 }}>{t.title}</div>
                    {!comp && <div style={{ fontSize: "11px", color: "#667085" }}>{pname.get(t.projectId)}</div>}
                    {t.blocked && <div style={{ fontSize: "10.5px", fontWeight: 800, color: "#B42318", background: "#FEF3F2", borderRadius: "6px", padding: "3px 7px", alignSelf: "flex-start" }}>⚠ Blocked · {t.blockType || "Blocked"}</div>}
                    {depOpen && !t.blocked && <div style={{ fontSize: "10.5px", fontWeight: 700, color: "#B54708" }}>Waiting on {depOpen.number}</div>}
                    <div style={{ display: "flex", alignItems: "center", gap: "9px", fontSize: "11px", color: "#667085" }}>
                      <Avatar name={who} size={22} fs="9.5px" />
                      <span style={{ color: dfg, fontWeight: 600 }}>{fmtShort(t.dueDate)}</span>
                      {!comp && (
                        <>
                          <span>☑ {t.subDone}/{t.subTotal}</span>
                          <span>💬 {t.commentCount}</span>
                        </>
                      )}
                      <span style={{ marginLeft: "auto" }}>{hrs(t.estimateMins)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: "11.5px", color: "#667085" }}>Drag cards between columns, or open a card and change its status (keyboard-friendly). In Progress has a WIP limit of {wip}.</div>
    </div>
  );
}

export function TasksView() {
  const { data: ws, error, isLoading } = useWorkspace();
  const open = useProjectsStore((s) => s.open);
  const tview = useProjectsStore((s) => s.tview);
  const tq = useProjectsStore((s) => s.tq);
  const setF = useProjectsStore((s) => s.setTaskFilters);
  const people = useMemo(() => new Map((ws?.people ?? []).map((p) => [p.id, p.name])), [ws]);
  const pname = useMemo(() => new Map((ws?.projects ?? []).map((p) => [p.id, p.name])), [ws]);
  if (isLoading) return <Loading />;
  if (error || !ws) return <ErrorBox error={error} />;
  const ql = tq.trim().toLowerCase();
  const rows = ws.tasks.filter((t) => (TASK_VIEWS[tview] ?? TASK_VIEWS["All Tasks"])(t, ws)).filter((t) => !ql || (t.title + t.number + (pname.get(t.projectId) ?? "") + (people.get(t.assigneeId ?? "") ?? "")).toLowerCase().includes(ql));
  const openT = ws.tasks.filter(isOpen);
  const kpis = [
    { l: "Open tasks", v: openT.length, view: "All Tasks", fg: "#0F172A" },
    { l: "Due today", v: openT.filter((t) => t.dueDate === ws.today).length, view: "Due Today", fg: "#B54708" },
    { l: "Overdue", v: openT.filter((t) => t.dueDate && days(t.dueDate, ws.today) < 0).length, view: "Overdue", fg: "#B42318" },
    { l: "Blocked", v: openT.filter(isBlk).length, view: "Blocked", fg: "#B42318" },
    { l: "Completed", v: ws.tasks.filter((t) => t.status === "Done").length, view: "Completed", fg: "#067647" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div data-kpi="1" style={{ display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: "12px" }}>
        {kpis.map((k) => (
          <Kpi key={k.l} label={k.l} value={k.v} fg={k.fg} onClick={() => setF({ tview: k.view })} />
        ))}
      </div>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {Object.keys(TASK_VIEWS).map((l) => (
          <button key={l} type="button" onClick={() => setF({ tview: l })} style={pillBtn(tview === l)}>
            {l}
          </button>
        ))}
      </div>
      <input value={tq} onChange={(e) => setF({ tq: e.target.value })} placeholder="Search task, ID, project, assignee" aria-label="Search tasks" style={inputSt} />
      <div style={{ ...card, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px", minWidth: "1000px" }}>
          <thead>
            <tr style={theadRow}>
              <th style={{ padding: "10px 12px" }}>Task</th>
              {["Project", "Assignee", "Priority", "Status", "Due", "Estimate / logged", "Subtasks", "Blocker"].map((h) => (
                <th key={h} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const [, dfg] = left(t.dueDate, ws.today, t.status === "Done");
              return (
                <tr key={t.id} className="pt-row" onClick={() => open({ kind: "task", id: t.id })} style={{ borderTop: "1px solid #F0F2F5", cursor: "pointer" }}>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ fontWeight: 700, color: "#101828" }}>{t.title}</div>
                    <div style={{ fontSize: "11px", color: "#98A2B3" }}>{t.number}</div>
                  </td>
                  <td style={{ padding: "10px 8px", color: "#344054" }}>{pname.get(t.projectId)}</td>
                  <td style={{ padding: "10px 8px", color: "#344054" }}>{people.get(t.assigneeId ?? "") ?? "Unassigned"}</td>
                  <td style={{ padding: "10px 8px", fontWeight: 700, color: pr(t.priority).fg }}>{t.priority}</td>
                  <td style={{ padding: "10px 8px" }}>
                    <Badge s={t.status} />
                  </td>
                  <td style={{ padding: "10px 8px", whiteSpace: "nowrap", color: dfg, fontWeight: 600 }}>{fmtShort(t.dueDate)}</td>
                  <td style={{ padding: "10px 8px", color: "#344054" }}>
                    {hrs(t.estimateMins)} / {hrs(t.loggedMins)}
                  </td>
                  <td style={{ padding: "10px 8px", color: "#344054" }}>
                    {t.subDone}/{t.subTotal}
                  </td>
                  <td style={{ padding: "10px 8px", color: "#B42318", fontWeight: 600 }}>{t.blocked ? t.blockType || "Blocked" : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <div style={{ padding: "36px", textAlign: "center", fontSize: "12.5px", color: "#667085" }}>No tasks in this view.</div>}
      </div>
    </div>
  );
}
