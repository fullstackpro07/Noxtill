"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchApprovals, type ApprovalRow } from "@/lib/projects-api";
import { useProjectsStore, useWorkspace } from "./projects-store";
import { ErrorBox, Loading, ago, aps, card, fmt, left, btnPrimary, theadRow, th } from "./projects-ui";

const OPEN = ["Sent", "Viewed"];
export const AP_VIEWS: Record<string, (a: ApprovalRow, today: string) => boolean> = {
  All: () => true,
  "Awaiting Client": (a) => a.kind === "client" && OPEN.includes(a.status),
  "Awaiting Internal": (a) => a.kind === "internal" && OPEN.includes(a.status),
  Approved: (a) => a.status === "Approved",
  Rejected: (a) => a.status === "Rejected",
  "Changes Requested": (a) => a.status === "Changes Requested",
  Overdue: (a, today) => OPEN.includes(a.status) && !!a.dueDate && a.dueDate < today,
};
const FG: Record<string, string> = { Approved: "#067647", Rejected: "#B42318", Overdue: "#B42318", "Changes Requested": "#B54708" };

export function ApprovalsView() {
  const { data: ws, error, isLoading } = useWorkspace();
  const q = useQuery({ queryKey: ["projects-approvals"], queryFn: fetchApprovals });
  const open = useProjectsStore((s) => s.open);
  const [view, setView] = useState("All");
  if (isLoading || q.isLoading) return <Loading />;
  if (error || !ws) return <ErrorBox error={error} />;
  if (q.error) return <ErrorBox error={q.error} />;
  const A = q.data ?? [];
  const pname = new Map(ws.projects.map((p) => [p.id, p.name]));
  const rows = A.filter((a) => (AP_VIEWS[view] ?? AP_VIEWS.All)(a, ws.today));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div data-kpi="1" style={{ display: "grid", gridTemplateColumns: "repeat(6,minmax(0,1fr))", gap: "12px" }}>
        {Object.keys(AP_VIEWS)
          .filter((k) => k !== "All")
          .map((l) => (
            <button key={l} type="button" className="pt-hov" onClick={() => setView(view === l ? "All" : l)} style={{ textAlign: "left", background: "#fff", border: `1px solid ${view === l ? "#12A150" : "#E6EAF0"}`, borderRadius: "13px", padding: "12px 14px", cursor: "pointer" }}>
              <div style={{ fontSize: "11.5px", fontWeight: 700, color: "#667085" }}>{l}</div>
              <div style={{ fontSize: "21px", fontWeight: 800, color: FG[l] ?? "#0F172A", marginTop: "3px" }}>{A.filter((a) => AP_VIEWS[l](a, ws.today)).length}</div>
            </button>
          ))}
      </div>
      <div style={{ display: "flex", gap: "9px", alignItems: "center" }}>
        {view !== "All" && (
          <button type="button" onClick={() => setView("All")} style={{ border: 0, background: "none", color: "#0E8442", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>
            Show all
          </button>
        )}
        {ws.me.can["Request approvals"] && (
          <button type="button" className="pt-primary" onClick={() => open({ kind: "apnew" })} style={{ ...btnPrimary, marginLeft: "auto" }}>
            + New request
          </button>
        )}
      </div>
      <div style={{ ...card, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px", minWidth: "1000px" }}>
          <thead>
            <tr style={theadRow}>
              <th style={{ padding: "10px 12px" }}>Request</th>
              {["Project", "Type", "Requested from", "Requested", "Due", "Status", "Last activity"].map((h) => (
                <th key={h} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const isOpen = OPEN.includes(a.status);
              const [, lfg] = left(a.dueDate, ws.today, !isOpen);
              const s = aps(a.status);
              return (
                <tr key={a.id} className="pt-row" onClick={() => open({ kind: "ap", id: a.id })} style={{ borderTop: "1px solid #F0F2F5", cursor: "pointer" }}>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ fontWeight: 700, color: "#101828" }}>{a.item}</div>
                    <div style={{ fontSize: "11px", color: "#98A2B3" }}>{a.number}</div>
                  </td>
                  <td style={{ padding: "10px 8px", color: "#344054" }}>{pname.get(a.projectId)}</td>
                  <td style={{ padding: "10px 8px", color: "#475467" }}>{a.type}</td>
                  <td style={{ padding: "10px 8px", color: "#344054" }}>{a.from}</td>
                  <td style={{ padding: "10px 8px", color: "#475467", whiteSpace: "nowrap" }}>{a.requestedAt ? fmt(a.requestedAt.slice(0, 10)) : "Not sent"}</td>
                  <td style={{ padding: "10px 8px", whiteSpace: "nowrap", color: isOpen ? lfg : "#667085", fontWeight: 600 }}>{fmt(a.dueDate)}</td>
                  <td style={{ padding: "10px 8px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: s.fg, background: s.bg, borderRadius: "6px", padding: "3px 7px", whiteSpace: "nowrap" }}>{a.status}</span>
                  </td>
                  <td style={{ padding: "10px 8px", color: "#667085" }}>{ago(a.lastActivityAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <div style={{ padding: "36px", textAlign: "center", fontSize: "12.5px", color: "#667085" }}>No approvals are waiting.</div>}
      </div>
    </div>
  );
}
