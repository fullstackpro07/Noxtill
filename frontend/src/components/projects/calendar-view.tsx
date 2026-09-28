"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchAppointments } from "@/lib/bookings-api";
import type { Workspace } from "@/lib/projects-api";
import { useProjectsStore, useWorkspace } from "./projects-store";
import { useProjectActions } from "./projects-actions";
import { ErrorBox, Loading, addD, card, errorText, fmt, seg } from "./projects-ui";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface Item {
  key: string;
  label: string;
  sub: string;
  tip: string;
  tid?: string;
  mid?: string;
  pid?: string;
  bk?: boolean;
  drag: boolean;
  bg: string;
  fg: string;
  bd: string;
  bs: "solid" | "dashed";
}

export function CalendarView() {
  const { data: ws, error, isLoading } = useWorkspace();
  if (isLoading) return <Loading />;
  if (error || !ws) return <ErrorBox error={error} />;
  return <Calendar ws={ws} />;
}

function Calendar({ ws }: { ws: Workspace }) {
  const router = useRouter();
  const act = useProjectActions(ws);
  const open = useProjectsStore((s) => s.open);
  const today = ws.today;
  const [view, setView] = useState<"month" | "week" | "agenda">("month");
  const [month, setMonth] = useState(today.slice(0, 8) + "01");
  const [week, setWeek] = useState(today);
  const [agStart, setAgStart] = useState(today);
  const [proj, setProj] = useState("all");
  const [bk, setBk] = useState(false);

  const m0 = new Date(month + "T12:00:00Z");
  const off = m0.getUTCDay();
  const gridStart = addD(month, -off);
  const lastDay = new Date(Date.UTC(m0.getUTCFullYear(), m0.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = Math.ceil((off + lastDay) / 7) * 7;
  const wkStart = addD(week, -new Date(week + "T12:00:00Z").getUTCDay());
  const range = view === "month" ? [gridStart, addD(gridStart, cells - 1)] : view === "week" ? [wkStart, addD(wkStart, 6)] : [agStart, addD(agStart, 29)];

  const project = ws.projects.find((p) => p.id === proj);
  const bookings = useQuery({
    queryKey: ["projects-cal-bookings", range[0], range[1]],
    queryFn: () => fetchAppointments({ from: range[0] + "T00:00:00.000Z", to: range[1] + "T23:59:59.999Z" }),
    enabled: bk,
    retry: false,
  });

  const live = ws.projects.filter((p) => !p.archivedAt && p.status !== "Archived");
  const itemsOn = (iso: string): Item[] => {
    const out: Item[] = [];
    ws.tasks
      .filter((t) => t.dueDate === iso && (proj === "all" || t.projectId === proj) && t.status !== "Cancelled")
      .forEach((t) => {
        const done = t.status === "Done";
        const who = ws.people.find((p) => p.id === t.assigneeId)?.name ?? "Unassigned";
        out.push({ key: "t" + t.id, label: (done ? "✓ " : "") + t.title, sub: `${t.number} · ${who}`, tip: `${t.number} · ${ws.projects.find((p) => p.id === t.projectId)?.name ?? ""}`, tid: t.id, drag: !done, bg: t.blocked ? "#FEF3F2" : done ? "#F2F4F7" : "#EFF4FF", fg: t.blocked ? "#B42318" : done ? "#667085" : "#2F4FB3", bd: t.blocked ? "#FECDCA" : done ? "#E6EAF0" : "#B2CCFF", bs: "solid" });
      });
    ws.milestones
      .filter((m) => m.plannedDate === iso && (proj === "all" || m.projectId === proj))
      .forEach((m) => out.push({ key: "m" + m.id, label: "◆ " + m.name, sub: ws.projects.find((p) => p.id === m.projectId)?.name ?? "", tip: m.number, mid: m.id, drag: false, bg: "#ECFDF3", fg: "#067647", bd: "#ABEFC6", bs: "solid" }));
    live.filter((p) => p.dueDate === iso && (proj === "all" || p.id === proj)).forEach((p) => out.push({ key: "d" + p.id, label: "⚑ " + p.name + " due", sub: p.number, tip: p.number, pid: p.id, drag: false, bg: "#0A1B2A", fg: "#fff", bd: "#0A1B2A", bs: "solid" }));
    live.filter((p) => p.startDate === iso && (proj === "all" || p.id === proj)).forEach((p) => out.push({ key: "s" + p.id, label: "▸ " + p.name + " starts", sub: p.number, tip: p.number, pid: p.id, drag: false, bg: "#fff", fg: "#344054", bd: "#D0D5DD", bs: "solid" }));
    if (bk && bookings.data) {
      bookings.data
        .filter((a) => a.date === iso && a.status !== "cancelled" && (!project || (project.customerId && a.customerId === project.customerId)))
        .forEach((a) => out.push({ key: "b" + a.id, label: `${a.serviceName} · ${a.customerName}`, sub: "Bookings · read-only", tip: "Owned by Bookings", bk: true, drag: false, bg: "#fff", fg: "#475467", bd: "#98A2B3", bs: "dashed" }));
    }
    return out;
  };

  const onOpen = (it: Item) => {
    if (it.tid) open({ kind: "task", id: it.tid });
    else if (it.mid) open({ kind: "ms", id: it.mid });
    else if (it.pid) open({ kind: "qp", id: it.pid });
    else if (it.bk) router.push("/bookings");
  };
  const onDrop = (iso: string, e: React.DragEvent) => {
    e.preventDefault();
    const t = ws.tasks.find((x) => x.id === e.dataTransfer.getData("text/plain"));
    if (t && t.status !== "Done") void act.rescheduleTask(t, iso);
  };
  const chip = (it: Item, big = false) => (
    <div
      key={it.key}
      draggable={it.drag}
      onDragStart={(e) => it.tid && e.dataTransfer.setData("text/plain", it.tid)}
      onClick={() => onOpen(it)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(it)}
      role="button"
      tabIndex={0}
      title={it.tip}
      style={{ fontSize: big ? "11.5px" : "11px", fontWeight: 600, lineHeight: big ? 1.35 : 1.3, borderRadius: big ? "8px" : "6px", padding: big ? "6px 8px" : "3px 6px", cursor: "pointer", whiteSpace: big ? undefined : "nowrap", overflow: "hidden", textOverflow: "ellipsis", background: it.bg, color: it.fg, border: `1px ${it.bs} ${it.bd}` }}
    >
      {it.label}
      {big && <div style={{ fontSize: "10.5px", fontWeight: 500, opacity: 0.8 }}>{it.sub}</div>}
    </div>
  );

  const title = view === "month" ? `${MN[m0.getUTCMonth()]} ${m0.getUTCFullYear()}` : view === "week" ? `Week of ${fmt(wkStart)}` : `Next 30 days from ${fmt(agStart)}`;
  const nav = (d: number) => {
    if (view === "month") {
      const n = new Date(Date.UTC(m0.getUTCFullYear(), m0.getUTCMonth() + d, 1, 12));
      setMonth(n.toISOString().slice(0, 10));
    } else if (view === "week") setWeek(addD(wkStart, d * 7));
    else setAgStart(addD(agStart, d * 30));
  };
  const agenda = Array.from({ length: 30 }, (_, i) => addD(agStart, i))
    .map((iso) => ({ iso, items: itemsOn(iso) }))
    .filter((g) => g.items.length);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", gap: "9px", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: "4px", border: "1px solid #E6EAF0", borderRadius: "10px", padding: "3px", background: "#fff" }}>
          {(["month", "week", "agenda"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setView(k)} style={{ border: 0, borderRadius: "7px", padding: "7px 11px", fontSize: "12px", fontWeight: 700, cursor: "pointer", ...seg(view === k) }}>
              {k[0].toUpperCase() + k.slice(1)}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <button type="button" onClick={() => nav(-1)} aria-label="Previous" style={{ width: "36px", height: "36px", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", cursor: "pointer", fontSize: "15px", color: "#344054" }}>
            ‹
          </button>
          <button
            type="button"
            onClick={() => {
              setMonth(today.slice(0, 8) + "01");
              setWeek(today);
              setAgStart(today);
            }}
            style={{ height: "36px", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "0 11px", fontSize: "12px", fontWeight: 700, cursor: "pointer", color: "#344054" }}
          >
            Today
          </button>
          <button type="button" onClick={() => nav(1)} aria-label="Next" style={{ width: "36px", height: "36px", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", cursor: "pointer", fontSize: "15px", color: "#344054" }}>
            ›
          </button>
        </div>
        <div style={{ fontSize: "15px", fontWeight: 800, color: "#101828" }}>{title}</div>
        <select value={proj} onChange={(e) => setProj(e.target.value)} aria-label="Project" style={{ marginLeft: "auto", height: "38px", border: "1px solid #E6EAF0", borderRadius: "10px", padding: "0 10px", fontSize: "12.5px", background: "#fff" }}>
          <option value="all">All projects</option>
          {live.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <label style={{ display: "flex", gap: "7px", alignItems: "center", fontSize: "12px", fontWeight: 600, color: "#475467", cursor: "pointer" }}>
          <input type="checkbox" checked={bk} onChange={() => setBk(!bk)} />
          Bookings overlay (read-only)
        </label>
      </div>
      <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", fontSize: "11.5px", color: "#475467" }}>
        <span style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: "#EFF4FF", border: "1px solid #B2CCFF" }} />
          Task
        </span>
        <span style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <span style={{ width: "9px", height: "9px", transform: "rotate(45deg)", background: "#12A150" }} />
          Milestone
        </span>
        <span style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: "#0A1B2A" }} />
          Project deadline
        </span>
        <span style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <span style={{ width: "10px", height: "10px", borderRadius: "3px", border: "1px dashed #98A2B3" }} />
          Booking (owned by Bookings)
        </span>
        {bk && bookings.error && <span style={{ color: "#B42318", fontWeight: 700 }}>Bookings unavailable: {errorText(bookings.error)}</span>}
        {bk && project && !project.customerId && <span style={{ color: "#98A2B3" }}>This project has no customer, so no bookings match it.</span>}
        <span style={{ marginLeft: "auto", color: "#98A2B3" }}>Drag a task to another day to reschedule</span>
      </div>

      {view === "month" && (
        <div style={{ ...card, overflow: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(118px,1fr))", minWidth: "830px" }}>
            {WD.map((w) => (
              <div key={w} style={{ padding: "9px 10px", fontSize: "11px", fontWeight: 800, color: "#667085", textTransform: "uppercase", letterSpacing: ".3px", background: "#FAFBFC", borderBottom: "1px solid #F0F2F5" }}>
                {w}
              </div>
            ))}
            {Array.from({ length: cells }, (_, i) => addD(gridStart, i)).map((iso) => {
              const inM = iso.slice(0, 7) === month.slice(0, 7);
              const it = itemsOn(iso);
              const isT = iso === today;
              return (
                <div key={iso} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(iso, e)} style={{ minHeight: "112px", borderRight: "1px solid #F0F2F5", borderBottom: "1px solid #F0F2F5", padding: "6px", display: "flex", flexDirection: "column", gap: "3px", background: inM ? "#fff" : "#FAFBFC", minWidth: 0 }}>
                  <div style={{ display: "flex" }}>
                    <span style={{ fontSize: "11.5px", fontWeight: 700, color: isT ? "#fff" : inM ? "#101828" : "#98A2B3", background: isT ? "#12A150" : "transparent", borderRadius: "20px", minWidth: "22px", height: "22px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 6px" }}>{+iso.slice(8)}</span>
                  </div>
                  {it.slice(0, 3).map((x) => chip(x))}
                  {it.length > 3 && (
                    <button
                      type="button"
                      onClick={() => {
                        setView("agenda");
                        setAgStart(iso);
                      }}
                      style={{ border: 0, background: "none", padding: "0 4px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#0E8442", cursor: "pointer" }}
                    >
                      +{it.length - 3} more
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === "week" && (
        <div style={{ ...card, overflow: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(130px,1fr))", minWidth: "910px" }}>
            {Array.from({ length: 7 }, (_, i) => addD(wkStart, i)).map((iso, i) => (
              <div key={iso} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(iso, e)} style={{ minHeight: "380px", borderRight: "1px solid #F0F2F5", display: "flex", flexDirection: "column", background: iso === today ? "#F3FBF6" : "#fff", minWidth: 0 }}>
                <div style={{ padding: "10px", borderBottom: "1px solid #F0F2F5", background: "#FAFBFC" }}>
                  <div style={{ fontSize: "11px", fontWeight: 800, color: "#667085", textTransform: "uppercase" }}>{WD[i]}</div>
                  <div style={{ fontSize: "17px", fontWeight: 800, color: iso === today ? "#0E8442" : "#101828" }}>{fmt(iso).slice(0, 5)}</div>
                </div>
                <div style={{ padding: "7px", display: "flex", flexDirection: "column", gap: "5px" }}>{itemsOn(iso).map((x) => chip(x, true))}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === "agenda" && (
        <div style={{ ...card, padding: "6px 16px" }}>
          {agenda.map((g) => (
            <div key={g.iso} style={{ display: "flex", gap: "14px", padding: "12px 0", borderBottom: "1px solid #F4F5F7" }}>
              <div style={{ width: "74px", flex: "0 0 74px" }}>
                <div style={{ fontSize: "11px", fontWeight: 800, color: "#667085", textTransform: "uppercase" }}>{WD[new Date(g.iso + "T12:00:00Z").getUTCDay()]}</div>
                <div style={{ fontSize: "15px", fontWeight: 800, color: g.iso === today ? "#0E8442" : "#101828" }}>{fmt(g.iso).slice(0, 5)}</div>
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px", minWidth: 0 }}>
                {g.items.map((it) => (
                  <button key={it.key} type="button" onClick={() => onOpen(it)} style={{ textAlign: "left", borderRadius: "9px", padding: "8px 11px", cursor: "pointer", background: it.bg, color: it.fg, border: `1px ${it.bs} ${it.bd}`, fontSize: "12.5px", fontWeight: 700, display: "flex", gap: "10px", alignItems: "center" }}>
                    <span style={{ flex: 1, minWidth: 0 }}>{it.label}</span>
                    <span style={{ fontSize: "11px", fontWeight: 500, opacity: 0.85 }}>{it.sub}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {!agenda.length && <div style={{ padding: "30px", textAlign: "center", fontSize: "12.5px", color: "#667085" }}>Nothing scheduled in the next 30 days.</div>}
        </div>
      )}
    </div>
  );
}
