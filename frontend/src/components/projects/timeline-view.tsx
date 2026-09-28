"use client";

import { useEffect, useRef, useState } from "react";
import type { Workspace } from "@/lib/projects-api";
import { useProjectsStore, useWorkspace } from "./projects-store";
import { useProjectActions } from "./projects-actions";
import { ErrorBox, Loading, addD, days, fmt, ini, pill, seg } from "./projects-ui";

const MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PPD: Record<string, number> = { day: 26, week: 7, month: 2.4, quarter: 1.1 };

export function TimelineView() {
  const { data: ws, error, isLoading } = useWorkspace();
  if (isLoading) return <Loading />;
  if (error || !ws) return <ErrorBox error={error} />;
  return <Gantt ws={ws} />;
}

interface GRow {
  isP: boolean;
  pid: string;
  tid: string;
  name: string;
  owner: string;
  a: string;
  b: string;
  prog: number;
  bg: string;
  pbg: string;
  top: number;
  h: number;
  rowBg: string;
  tip: string;
  crit: boolean;
  base: [string, string] | null;
  drag: boolean;
  ms: Array<{ id: string; date: string; c: string; tip: string }>;
}

function Gantt({ ws }: { ws: Workspace }) {
  const act = useProjectActions(ws);
  const open = useProjectsStore((s) => s.open);
  const today = ws.today;
  const [zoom, setZoom] = useState("week");
  const [crit, setCrit] = useState(true);
  const [base, setBase] = useState(false);
  const [deps, setDeps] = useState(true);
  const [full, setFull] = useState(false);
  const [exp, setExp] = useState<Record<string, boolean>>({});
  const [drag, setDrag] = useState<{ id: string; dx: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const ppd = PPD[zoom];

  const live = ws.projects.filter((p) => !p.archivedAt && p.status !== "Archived");
  const people = new Map(ws.people.map((p) => [p.id, p.name]));
  const tStart = (t: { startDate: string | null; dueDate: string | null; estimateMins: number }) => t.startDate ?? (t.dueDate ? addD(t.dueDate, -Math.max(1, Math.ceil(t.estimateMins / 480))) : today);

  const allDates = [today, ...live.flatMap((p) => [p.startDate, p.dueDate]), ...ws.tasks.flatMap((t) => [t.startDate, t.dueDate])].filter(Boolean) as string[];
  const minD = allDates.reduce((a, b) => (b < a ? b : a), addD(today, -30));
  const maxD = allDates.reduce((a, b) => (b > a ? b : a), addD(today, 60));
  const T0 = minD.slice(0, 8) + "01";
  const T1 = addD(maxD, 45);
  const X = (iso: string) => days(iso, T0) * ppd;
  const W = X(T1);

  const isExp = (id: string) => exp[id] ?? live.length <= 6;
  const rows: GRow[] = [];
  live.forEach((p) => {
    const a = p.startDate ?? tStart({ startDate: null, dueDate: p.dueDate, estimateMins: 0 });
    const b = p.dueDate ?? a;
    rows.push({
      isP: true,
      pid: p.id,
      tid: "",
      name: p.name,
      owner: people.get(p.managerId ?? "") ?? "",
      a,
      b,
      prog: p.progress,
      bg: "#DDE7F0",
      pbg: "#0A1B2A",
      top: 11,
      h: 12,
      rowBg: "#FAFBFC",
      tip: `${p.name} · ${fmt(a)} → ${fmt(b)}`,
      crit: false,
      base: base && p.baselineDueDate && p.baselineDueDate !== p.dueDate ? [a, p.baselineDueDate] : null,
      drag: false,
      ms: ws.milestones.filter((m) => m.projectId === p.id).map((m) => ({ id: m.id, date: m.plannedDate, c: m.status === "Completed" ? "#12A150" : m.status === "At Risk" || m.status === "Overdue" ? "#D92D20" : "#F79009", tip: `${m.name} · ${fmt(m.plannedDate)} · ${m.status}` })),
    });
    if (isExp(p.id))
      ws.tasks
        .filter((t) => t.projectId === p.id && t.status !== "Cancelled")
        .sort((x, y) => tStart(x).localeCompare(tStart(y)))
        .forEach((t) => {
          const s = tStart(t);
          const done = t.status === "Done";
          const isC = crit && t.critical;
          rows.push({
            isP: false,
            pid: p.id,
            tid: t.id,
            name: t.title,
            owner: people.get(t.assigneeId ?? "") ?? "",
            a: s,
            b: t.dueDate ?? s,
            prog: done ? 100 : t.estimateMins ? Math.min(95, Math.round((t.loggedMins / t.estimateMins) * 100)) : 0,
            bg: t.blocked ? "#FECDCA" : done ? "#D1F2DE" : "#B7E4C7",
            pbg: t.blocked ? "#F04438" : "#12A150",
            top: 8,
            h: 18,
            rowBg: "#fff",
            tip: `${t.number} · ${t.title} · ${fmt(s)} → ${fmt(t.dueDate)}${isC ? " · on critical path" : ""}`,
            crit: isC,
            base: base && t.baselineDue && (t.baselineDue !== t.dueDate || t.baselineStart !== t.startDate) ? [t.baselineStart ?? t.baselineDue, t.baselineDue] : null,
            drag: !done && !!t.dueDate,
            ms: [],
          });
        });
  });
  const idx = new Map(rows.map((r, i) => [r.tid, i]));

  const ticks: Array<{ x: number; label: string; major: boolean }> = [];
  for (let cur = T0; cur <= T1; ) {
    const d = new Date(cur + "T12:00:00Z");
    if (zoom !== "quarter" || d.getUTCMonth() % 3 === 0) ticks.push({ x: X(cur), label: MN[d.getUTCMonth()] + (d.getUTCMonth() === 0 || cur === T0 ? " " + d.getUTCFullYear() : ""), major: true });
    cur = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 12)).toISOString().slice(0, 10);
  }
  if (zoom === "day" || zoom === "week") {
    for (let w = addD(T0, (8 - new Date(T0 + "T12:00:00Z").getUTCDay()) % 7); w <= T1; w = addD(w, 7)) ticks.push({ x: X(w), label: String(+w.slice(8)), major: false });
  }

  const links: Array<{ d: string; red: boolean }> = [];
  if (deps)
    ws.tasks.forEach((t) =>
      t.deps.forEach((d) => {
        const i2 = idx.get(t.id);
        const i1 = idx.get(d);
        const pr = ws.tasks.find((x) => x.id === d);
        if (i1 == null || i2 == null || !pr) return;
        const x1 = X(pr.dueDate ?? tStart(pr)) + ppd;
        const y1 = i1 * 34 + 17;
        const x2 = X(tStart(t));
        const y2 = i2 * 34 + 17;
        const mid = x1 + 8;
        links.push({ d: `M${x1} ${y1} H${mid} V${y2} H${x2 - 1}`, red: crit && t.critical && pr.critical });
      }),
    );

  const todayX = X(today);
  const scrolled = useRef(false);
  useEffect(() => {
    if (ref.current && !scrolled.current) {
      ref.current.scrollLeft = Math.max(todayX - 220, 0);
      scrolled.current = true;
    }
  }, [todayX]);
  useEffect(() => {
    scrolled.current = false;
  }, [zoom]);

  const down = (r: GRow, e: React.PointerEvent) => {
    if (!r.tid) return;
    const t = ws.tasks.find((x) => x.id === r.tid);
    if (!t) return;
    if (!r.drag) {
      open({ kind: "task", id: t.id });
      return;
    }
    e.preventDefault();
    const x0 = e.clientX;
    let moved = false;
    const mv = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - x0) > 3) moved = true;
      setDrag({ id: r.tid, dx: ev.clientX - x0 });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      const n = Math.round((ev.clientX - x0) / ppd);
      setDrag(null);
      if (!moved || !n) {
        if (!moved) open({ kind: "task", id: t.id });
        return;
      }
      void act.rescheduleTask(t, addD(t.dueDate!, n));
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };

  const cols = "minmax(0,1fr) 34px 52px 52px 36px 38px";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", position: full ? "fixed" : "relative", inset: full ? 0 : "auto", zIndex: full ? 85 : "auto", background: full ? "#F4F6F8" : "transparent", padding: full ? "16px" : 0, overflow: full ? "auto" : "visible" }}>
      <div style={{ display: "flex", gap: "9px", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: "4px", border: "1px solid #E6EAF0", borderRadius: "10px", padding: "3px", background: "#fff" }}>
          {Object.keys(PPD).map((k) => (
            <button key={k} type="button" onClick={() => setZoom(k)} style={{ border: 0, borderRadius: "7px", padding: "7px 11px", fontSize: "12px", fontWeight: 700, cursor: "pointer", ...seg(zoom === k) }}>
              {k[0].toUpperCase() + k.slice(1)}
            </button>
          ))}
        </div>
        {(
          [
            ["Critical path", crit, setCrit],
            ["Baseline", base, setBase],
            ["Dependencies", deps, setDeps],
          ] as const
        ).map(([label, on, set]) => (
          <button key={label} type="button" aria-pressed={on} onClick={() => set(!on)} style={{ ...pill(on), borderRadius: "20px", padding: "7px 12px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
            {label}
          </button>
        ))}
        <button type="button" onClick={() => ref.current && (ref.current.scrollLeft = Math.max(todayX - 220, 0))} style={{ height: "34px", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "0 11px", fontSize: "12px", fontWeight: 700, cursor: "pointer", color: "#344054" }}>
          Today
        </button>
        <button type="button" onClick={() => setFull(!full)} style={{ marginLeft: "auto", height: "34px", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "0 12px", fontSize: "12px", fontWeight: 700, cursor: "pointer", color: "#344054" }}>
          {full ? "Exit full screen" : "Full screen"}
        </button>
      </div>
      <div style={{ display: "flex", background: "#fff", border: "1px solid #E6EAF0", borderRadius: "14px", overflow: "hidden", minHeight: 0 }}>
        <div data-hidesm="1" style={{ flex: "0 0 400px", borderRight: "1px solid #E6EAF0", minWidth: 0 }}>
          <div style={{ height: "42px", display: "grid", gridTemplateColumns: cols, gap: "6px", alignItems: "center", padding: "0 10px", background: "#FAFBFC", borderBottom: "1px solid #F0F2F5", fontSize: "10.5px", fontWeight: 800, color: "#667085", textTransform: "uppercase", letterSpacing: ".3px" }}>
            <span>Project / task</span>
            <span>Own</span>
            <span>Start</span>
            <span>End</span>
            <span>Days</span>
            <span>%</span>
          </div>
          {rows.map((r) => (
            <div key={r.pid + r.tid} style={{ height: "34px", display: "grid", gridTemplateColumns: cols, gap: "6px", alignItems: "center", padding: "0 10px", borderBottom: "1px solid #F4F5F7", fontSize: "12px", background: r.rowBg }}>
              <span style={{ display: "flex", alignItems: "center", gap: "5px", minWidth: 0, paddingLeft: r.isP ? 0 : "20px" }}>
                {r.isP && (
                  <button type="button" onClick={() => setExp((x) => ({ ...x, [r.pid]: !isExp(r.pid) }))} aria-label="Expand or collapse" style={{ border: 0, background: "none", padding: 0, width: "16px", cursor: "pointer", color: "#667085", fontSize: "11px" }}>
                    {isExp(r.pid) ? "▾" : "▸"}
                  </button>
                )}
                <button type="button" onClick={() => (r.tid ? open({ kind: "task", id: r.tid }) : open({ kind: "qp", id: r.pid }))} style={{ border: 0, background: "none", padding: 0, cursor: "pointer", textAlign: "left", fontSize: "12px", fontWeight: r.isP ? 800 : 600, color: "#101828", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
                  {r.name}
                </button>
              </span>
              <span style={{ fontSize: "10px", fontWeight: 800, color: "#0E8442" }}>{r.owner ? ini(r.owner) : "—"}</span>
              <span style={{ color: "#475467" }}>{fmt(r.a).slice(0, 5)}</span>
              <span style={{ color: "#475467" }}>{fmt(r.b).slice(0, 5)}</span>
              <span style={{ color: "#475467" }}>{days(r.b, r.a) + (r.isP ? 0 : 1)}</span>
              <span style={{ fontWeight: 700, color: "#344054" }}>{r.prog}%</span>
            </div>
          ))}
        </div>
        <div ref={ref} style={{ flex: 1, overflowX: "auto", minWidth: 0, position: "relative" }}>
          <div style={{ position: "relative", width: W + "px" }}>
            <div style={{ height: "42px", position: "relative", background: "#FAFBFC", borderBottom: "1px solid #F0F2F5" }}>
              {ticks.map((k, i) => (
                <div key={i} style={{ position: "absolute", top: 0, bottom: 0, left: k.x + "px", borderLeft: `1px solid ${k.major ? "#E6EAF0" : "transparent"}`, padding: k.major ? "6px 6px" : "24px 4px 0", fontSize: k.major ? "11px" : "10px", fontWeight: k.major ? 800 : 600, color: "#667085", whiteSpace: "nowrap" }}>
                  {k.label}
                </div>
              ))}
            </div>
            <div style={{ position: "relative", height: rows.length * 34 + "px" }}>
              {ticks.map((k, i) => (
                <div key={i} style={{ position: "absolute", top: 0, bottom: 0, left: k.x + "px", borderLeft: `1px solid ${k.major ? "#F0F2F5" : "#F7F8FA"}` }} />
              ))}
              {rows.map((r) => {
                const dx = drag && drag.id === r.tid ? drag.dx : 0;
                const l = X(r.a) + dx;
                const w = Math.max((days(r.b, r.a) + 1) * ppd, 6);
                const varD = r.base ? days(r.b, r.base[1]) : 0;
                return (
                  <div key={r.pid + r.tid} style={{ height: "34px", position: "relative", borderBottom: "1px solid #F4F5F7", background: r.rowBg }}>
                    {r.base && <div title="Baseline" style={{ position: "absolute", top: "24px", height: "5px", borderRadius: "3px", background: "#D0D5DD", left: X(r.base[0]) + "px", width: Math.max((days(r.base[1], r.base[0]) + 1) * ppd, 4) + "px" }} />}
                    <div onPointerDown={(e) => down(r, e)} title={r.tip} style={{ position: "absolute", top: r.top + "px", height: r.h + "px", left: l + "px", width: w + "px", borderRadius: "6px", background: r.bg, outline: r.crit ? "2px solid #D92D20" : "none", cursor: r.drag ? "grab" : "default", overflow: "hidden", touchAction: "none", boxShadow: dx ? "0 6px 16px rgba(16,24,40,.2)" : "none" }}>
                      <div style={{ height: "100%", width: r.prog + "%", background: r.pbg }} />
                    </div>
                    {r.base && varD > 0 && <div style={{ position: "absolute", top: "9px", left: l + w + 6 + "px", fontSize: "10.5px", fontWeight: 800, color: "#B42318", whiteSpace: "nowrap" }}>+{varD}d vs baseline</div>}
                    {r.ms.map((m) => (
                      <button key={m.id} type="button" onClick={() => open({ kind: "ms", id: m.id })} title={m.tip} aria-label={m.tip} style={{ position: "absolute", top: "10px", left: X(m.date) - 6 + "px", width: "13px", height: "13px", transform: "rotate(45deg)", background: m.c, border: "2px solid #fff", padding: 0, cursor: "pointer", boxShadow: `0 0 0 1px ${m.c}` }} />
                    ))}
                  </div>
                );
              })}
              {deps && (
                <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}>
                  <defs>
                    <marker id="nxarrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                      <path d="M0 0 8 4 0 8Z" fill="#667085" />
                    </marker>
                    <marker id="nxarrowr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                      <path d="M0 0 8 4 0 8Z" fill="#D92D20" />
                    </marker>
                  </defs>
                  {links.map((k, i) => (
                    <path key={i} d={k.d} fill="none" stroke={k.red ? "#D92D20" : "#667085"} strokeWidth="1.5" markerEnd={k.red ? "url(#nxarrowr)" : "url(#nxarrow)"} />
                  ))}
                </svg>
              )}
              <div style={{ position: "absolute", top: "-42px", bottom: 0, left: todayX + "px", width: "2px", background: "#12A150", pointerEvents: "none" }}>
                <span style={{ position: "absolute", top: "2px", left: "4px", fontSize: "10px", fontWeight: 800, color: "#fff", background: "#12A150", borderRadius: "4px", padding: "1px 5px", whiteSpace: "nowrap" }}>Today</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      {!rows.length && <div style={{ fontSize: "12.5px", color: "#667085" }}>No projects to plot yet.</div>}
      <div style={{ fontSize: "11.5px", color: "#667085" }}>
        Drag a task bar to move it — downstream impact is previewed before anything changes. Diamonds are milestones. {crit ? "Red outline = critical path (longest chain of open tasks linked by dependencies)." : ""} {base ? "Grey bar = baseline dates captured when the task was first scheduled." : ""}
      </div>
    </div>
  );
}
