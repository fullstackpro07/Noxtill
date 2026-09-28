"use client";

import { useState } from "react";
import { exportMilestones, type MilestoneRow, type Workspace } from "@/lib/projects-api";
import { useProjectsStore, useWorkspace } from "./projects-store";
import { Badge, ErrorBox, Loading, card, downloadCsv, errorText, fmt, left, selectSt, st, btnGhost, btnPrimary, theadRow, th } from "./projects-ui";

const DONE = ["Completed", "Cancelled"];
export const MS_VIEWS: Record<string, (m: MilestoneRow, ws: Workspace) => boolean> = {
  All: () => true,
  Upcoming: (m, ws) => m.plannedDate >= ws.today && !DONE.includes(m.status),
  Completed: (m) => m.status === "Completed",
  Overdue: (m) => m.status === "Overdue",
  "At Risk": (m) => m.status === "At Risk",
  "Awaiting Approval": (m) => m.status === "Ready for Approval",
};
const KC: Record<string, string> = { Upcoming: "#0F172A", Completed: "#067647", Overdue: "#B42318", "At Risk": "#B54708", "Awaiting Approval": "#5925DC" };

export function MilestonesView() {
  const { data: ws, error, isLoading } = useWorkspace();
  const msView = useProjectsStore((s) => s.msView);
  const setMsView = useProjectsStore((s) => s.setMsView);
  const open = useProjectsStore((s) => s.open);
  const flash = useProjectsStore((s) => s.flash);
  const [proj, setProj] = useState("all");
  if (isLoading) return <Loading />;
  if (error || !ws) return <ErrorBox error={error} />;
  const people = new Map(ws.people.map((p) => [p.id, p.name]));
  const pname = new Map(ws.projects.map((p) => [p.id, p.name]));
  const all = ws.milestones.filter((m) => proj === "all" || m.projectId === proj);
  const rows = all.filter((m) => (MS_VIEWS[msView] ?? MS_VIEWS.All)(m, ws)).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
  const live = ws.projects.filter((p) => !p.archivedAt && p.status !== "Archived");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div data-kpi="1" style={{ display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: "12px" }}>
        {Object.keys(KC).map((l) => (
          <button key={l} type="button" className="pt-hov" onClick={() => setMsView(msView === l ? "All" : l)} style={{ textAlign: "left", background: "#fff", border: `1px solid ${msView === l ? "#12A150" : "#E6EAF0"}`, borderRadius: "13px", padding: "12px 14px", cursor: "pointer" }}>
            <div style={{ fontSize: "11.5px", fontWeight: 700, color: "#667085" }}>{l}</div>
            <div style={{ fontSize: "21px", fontWeight: 800, color: KC[l], marginTop: "3px" }}>{all.filter((m) => MS_VIEWS[l](m, ws)).length}</div>
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: "9px", flexWrap: "wrap", alignItems: "center" }}>
        <select value={proj} onChange={(e) => setProj(e.target.value)} aria-label="Project" style={selectSt}>
          <option value="all">All projects</option>
          {live.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {(msView !== "All" || proj !== "all") && (
          <button
            type="button"
            onClick={() => {
              setMsView("All");
              setProj("all");
            }}
            style={{ height: "40px", border: 0, background: "none", color: "#0E8442", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}
          >
            Show all
          </button>
        )}
        <button
          type="button"
          onClick={async () => {
            try {
              const r = await exportMilestones(rows.map((m) => m.id));
              downloadCsv(r.filename, r.csv);
              flash(`Exported ${r.count} milestones`);
            } catch (e) {
              flash(errorText(e));
            }
          }}
          style={{ ...btnGhost, marginLeft: "auto" }}
        >
          Export CSV
        </button>
        {ws.me.can["Edit projects"] && (
          <button type="button" className="pt-primary" onClick={() => open({ kind: "msnew", projectId: proj !== "all" ? proj : undefined })} style={btnPrimary}>
            + New milestone
          </button>
        )}
      </div>
      <div style={{ ...card, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px", minWidth: "1000px" }}>
          <thead>
            <tr style={theadRow}>
              <th style={{ padding: "10px 12px" }}>Milestone</th>
              {["Project", "Owner", "Planned", "Actual", "Status", "Completion", "Linked tasks", "Approval"].map((h) => (
                <th key={h} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const [lt, lfg] = left(m.plannedDate, ws.today, m.status === "Completed");
              const linked = m.taskIds.map((id) => ws.tasks.find((t) => t.id === id)).filter(Boolean);
              return (
                <tr key={m.id} className="pt-row" onClick={() => open({ kind: "ms", id: m.id })} style={{ borderTop: "1px solid #F0F2F5", cursor: "pointer" }}>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", gap: "9px", alignItems: "center" }}>
                      <span style={{ width: "9px", height: "9px", transform: "rotate(45deg)", background: st(m.status).fg, flex: "0 0 9px" }} />
                      <div>
                        <div style={{ fontWeight: 700, color: "#101828" }}>{m.name}</div>
                        <div style={{ fontSize: "11px", color: "#98A2B3" }}>{m.number}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "10px 8px", color: "#344054" }}>{pname.get(m.projectId)}</td>
                  <td style={{ padding: "10px 8px", color: "#344054" }}>{people.get(m.ownerId ?? "") ?? "Unassigned"}</td>
                  <td style={{ padding: "10px 8px", whiteSpace: "nowrap" }}>
                    <div style={{ color: "#344054" }}>{fmt(m.plannedDate)}</div>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: lfg }}>{lt}</div>
                  </td>
                  <td style={{ padding: "10px 8px", color: "#667085", whiteSpace: "nowrap" }}>{fmt(m.actualDate)}</td>
                  <td style={{ padding: "10px 8px" }}>
                    <Badge s={m.status} />
                  </td>
                  <td style={{ padding: "10px 8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                      <span style={{ width: "60px", height: "6px", background: "#F2F4F7", borderRadius: "6px", overflow: "hidden" }}>
                        <span style={{ display: "block", height: "100%", width: m.pct + "%", background: "#12A150" }} />
                      </span>
                      <b style={{ color: "#344054" }}>{m.pct}%</b>
                    </div>
                  </td>
                  <td style={{ padding: "10px 8px", color: "#344054" }}>
                    {linked.filter((t) => t!.status === "Done").length} / {linked.length} done
                  </td>
                  <td style={{ padding: "10px 8px", color: "#475467" }}>{m.approval}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && (
          <div style={{ padding: "36px", textAlign: "center", display: "flex", flexDirection: "column", gap: "8px", alignItems: "center" }}>
            <div style={{ fontSize: "13.5px", fontWeight: 800, color: "#101828" }}>No milestones here</div>
            <div style={{ fontSize: "12.5px", color: "#667085" }}>Add milestones to track major project outcomes.</div>
          </div>
        )}
      </div>
    </div>
  );
}
