"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { exportReport, fetchReport, fetchSavedReports, saveReport, unsaveReport } from "@/lib/projects-api";
import { useProjectsInvalidate, useProjectsStore, useWorkspace } from "./projects-store";
import { ErrorBox, Loading, card, downloadCsv, errorText, seg } from "./projects-ui";

const REPORTS = ["Portfolio Health", "Project Progress", "Task Completion", "Overdue Tasks", "Milestone Performance", "Time Utilization", "Billable vs Non-Billable", "Budget vs Actual", "Project Profitability", "Team Workload", "Client Approval Time"];

export function ReportsView() {
  const { data: ws } = useWorkspace();
  const scope = useProjectsStore((s) => s.scope);
  const flash = useProjectsStore((s) => s.flash);
  const invalidate = useProjectsInvalidate();
  const [rep, setRep] = useState("Portfolio Health");
  const [type, setType] = useState<"Bar" | "Table">("Bar");
  const q = useQuery({ queryKey: ["projects-report", rep, scope], queryFn: () => fetchReport(rep, scope), enabled: !ws || ws.me.can["View reports"] });
  const saved = useQuery({ queryKey: ["projects-reports-saved"], queryFn: fetchSavedReports });
  if (ws && !ws.me.can["View reports"]) return <div style={{ ...card, padding: "30px", textAlign: "center", fontSize: "12.5px", color: "#667085" }}>Your project role ({ws.me.role}) doesn’t include “View reports”.</div>;
  const r = q.data;
  return (
    <div data-2col="1" style={{ display: "grid", gridTemplateColumns: "230px minmax(0,1fr)", gap: "14px" }}>
      <aside style={{ ...card, padding: "10px", display: "flex", flexDirection: "column", gap: "2px", alignSelf: "start" }}>
        {REPORTS.map((k) => (
          <button key={k} type="button" onClick={() => setRep(k)} style={{ border: 0, textAlign: "left", background: rep === k ? "#E7F6EE" : "transparent", color: rep === k ? "#0E8442" : "#475467", borderRadius: "8px", padding: "8px 10px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>
            {k}
          </button>
        ))}
        {!!saved.data?.length && (
          <>
            <div style={{ padding: "10px 10px 4px", fontSize: "10.5px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3" }}>My reports</div>
            {saved.data.map((s) => (
              <span key={s.id} style={{ display: "flex", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => {
                    setRep(s.key);
                    setType(s.chartType === "Table" ? "Table" : "Bar");
                  }}
                  style={{ flex: 1, border: 0, textAlign: "left", background: "transparent", color: "#475467", borderRadius: "8px", padding: "7px 10px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}
                >
                  ★ {s.key} · {s.chartType}
                </button>
                <button
                  type="button"
                  aria-label="Remove saved report"
                  onClick={async () => {
                    await unsaveReport(s.id).catch((e) => flash(errorText(e)));
                    await invalidate();
                  }}
                  style={{ border: 0, background: "none", color: "#98A2B3", cursor: "pointer", fontSize: "13px", padding: "0 8px" }}
                >
                  ×
                </button>
              </span>
            ))}
          </>
        )}
      </aside>
      <section style={{ ...card, padding: "16px 18px", display: "flex", flexDirection: "column", gap: "14px", minWidth: 0 }}>
        <div style={{ display: "flex", gap: "9px", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: "200px" }}>
            <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 800, color: "#101828" }}>{rep}</h2>
            <div style={{ fontSize: "11.5px", color: "#667085", marginTop: "2px" }}>{r?.note ?? ""}</div>
          </div>
          <div style={{ display: "flex", gap: "4px", border: "1px solid #E6EAF0", borderRadius: "10px", padding: "3px" }}>
            {(["Bar", "Table"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setType(k)} style={{ border: 0, borderRadius: "7px", padding: "6px 10px", fontSize: "11.5px", fontWeight: 700, cursor: "pointer", ...seg(type === k) }}>
                {k}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                const x = await exportReport(rep, scope);
                downloadCsv(x.filename, x.csv);
                flash("Exported " + rep);
              } catch (e) {
                flash(errorText(e));
              }
            }}
            style={{ height: "36px", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "0 12px", fontSize: "12px", fontWeight: 700, color: "#344054", cursor: "pointer" }}
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                await saveReport(rep, type);
                flash(`“${rep}” saved to My reports`);
                await invalidate();
              } catch (e) {
                flash(errorText(e));
              }
            }}
            style={{ height: "36px", border: 0, background: "#12A150", color: "#fff", borderRadius: "9px", padding: "0 12px", fontSize: "12px", fontWeight: 800, cursor: "pointer" }}
          >
            Save report
          </button>
        </div>
        {q.isLoading && <Loading />}
        {q.error && <ErrorBox error={q.error} />}
        {r && type === "Bar" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "11px" }}>
            {r.rows.map((x, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(0,190px) minmax(0,1fr) 110px", gap: "12px", alignItems: "center" }}>
                <span style={{ fontSize: "12.5px", fontWeight: 600, color: "#101828", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.label}</span>
                <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                  <div style={{ height: "10px", background: "#F2F4F7", borderRadius: "6px", overflow: "hidden", display: "flex" }}>
                    <div style={{ height: "100%", width: x.w1 + "%", background: x.c1 }} />
                    <div style={{ height: "100%", width: x.w2 + "%", background: x.c2 }} />
                  </div>
                  {x.hasB && (
                    <div style={{ height: "6px", background: "#F2F4F7", borderRadius: "6px", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: x.wb + "%", background: "#98A2B3" }} />
                    </div>
                  )}
                </div>
                <span style={{ fontSize: "12px", fontWeight: 800, color: "#344054", textAlign: "right" }}>{x.v}</span>
              </div>
            ))}
            {!r.rows.length && <div style={{ fontSize: "12.5px", color: "#667085" }}>{r.table[0]?.[0] ?? "No data yet."}</div>}
            <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", fontSize: "11.5px", color: "#475467", marginTop: "4px" }}>
              {r.legend.map((l) => (
                <span key={l.t} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: l.c }} />
                  {l.t}
                </span>
              ))}
            </div>
          </div>
        )}
        {r && type === "Table" && (
          <div style={{ overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#667085", fontSize: "11px", textTransform: "uppercase" }}>
                  {r.cols.map((c) => (
                    <th key={c} style={{ padding: "8px" }}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.table.map((row, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #F0F2F5" }}>
                    {row.map((c, j) => (
                      <td key={j} style={{ padding: "9px 8px", color: "#344054" }}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ fontSize: "11px", color: "#98A2B3", borderTop: "1px solid #F0F2F5", paddingTop: "10px" }}>{r?.src ?? ""}</div>
      </section>
    </div>
  );
}
