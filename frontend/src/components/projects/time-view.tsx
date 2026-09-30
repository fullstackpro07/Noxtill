"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addTime, decideTime, fetchTime, submitTime, type TimeEntry } from "@/lib/projects-api";
import { useProjectsInvalidate, useProjectsStore, useWorkspace } from "./projects-store";
import { useProjectActions } from "./projects-actions";
import { ErrorBox, Loading, TIME_ST, card, errorText, fmt, hm, money, pillBtn, st, theadRow, th } from "./projects-ui";

const VIEWS: Record<string, (e: TimeEntry) => boolean> = {
  "My Time": (e) => e.mine,
  "Team Time": () => true,
  "Needs approval": (e) => e.canApprove,
  Rejected: (e) => e.status === "rejected",
};
const h1 = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1)) + " h";

export function TimeView() {
  const { data: ws, error, isLoading } = useWorkspace();
  const time = useQuery({ queryKey: ["projects-time"], queryFn: fetchTime });
  const act = useProjectActions(ws);
  const invalidate = useProjectsInvalidate();
  const flash = useProjectsStore((s) => s.flash);
  const ask = useProjectsStore((s) => s.ask);
  const setRejectIds = useProjectsStore((s) => s.setRejectIds);
  const [view, setView] = useState("Team Time");
  const [te, setTe] = useState({ pid: "", tid: "", date: "", hrs: "", note: "", bill: true });
  const [err, setErr] = useState("");
  if (isLoading || time.isLoading) return <Loading />;
  if (error || !ws) return <ErrorBox error={error} />;
  if (time.error || !time.data) return <ErrorBox error={time.error} />;
  const T = time.data;
  const live = ws.projects.filter((p) => !p.archivedAt && p.status !== "Archived" && p.statusCat !== "Done");
  const pid = te.pid || live[0]?.id || "";
  const date = te.date || T.today;
  const tasks = ws.tasks.filter((t) => t.projectId === pid && t.status !== "Done" && t.status !== "Cancelled");
  const pname = new Map(ws.projects.map((p) => [p.id, p.name]));
  const rows = T.entries.filter(VIEWS[view]);
  const subm = T.entries.filter((e) => e.canApprove);
  const kpis = [
    { l: "Hours today", v: h1(T.kpis.today), fg: "#0F172A" },
    { l: "Team this week", v: h1(T.kpis.teamWeek), fg: "#0F172A" },
    { l: "Billable", v: h1(T.kpis.billable), fg: "#067647" },
    { l: "Non-billable", v: h1(T.kpis.nonBillable), fg: "#475467" },
    { l: "Pending approval", v: h1(T.kpis.pending), fg: "#B54708" },
    { l: "Billable value", v: T.kpis.billableValue == null ? "Hidden" : money(T.kpis.billableValue, ws.currency), fg: "#0F172A" },
  ];
  const canLog = !!ws.me.personId;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div data-kpi="1" style={{ display: "grid", gridTemplateColumns: "repeat(6,minmax(0,1fr))", gap: "12px" }}>
        {kpis.map((k) => (
          <div key={k.l} style={{ ...card, borderRadius: "13px", padding: "12px 14px" }}>
            <div style={{ fontSize: "11.5px", fontWeight: 700, color: "#667085" }}>{k.l}</div>
            <div style={{ fontSize: "19px", fontWeight: 800, color: k.fg, marginTop: "3px" }}>{k.v}</div>
          </div>
        ))}
      </div>
      <section style={{ ...card, padding: "14px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontSize: "13.5px", fontWeight: 800, color: "#101828", marginRight: "6px" }}>Log time</div>
          <select value={pid} onChange={(e) => setTe({ ...te, pid: e.target.value, tid: "" })} aria-label="Project" style={{ height: "38px", border: "1px solid #E6EAF0", borderRadius: "9px", padding: "0 8px", fontSize: "12.5px" }}>
            {live.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select value={te.tid} onChange={(e) => setTe({ ...te, tid: e.target.value })} aria-label="Task" style={{ height: "38px", border: "1px solid #E6EAF0", borderRadius: "9px", padding: "0 8px", fontSize: "12.5px", maxWidth: "230px" }}>
            <option value="">No specific task</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.number} · {t.title}
              </option>
            ))}
          </select>
          {ws.timer ? (
            <>
              <span style={{ fontSize: "12.5px", fontWeight: 800, color: "#067647", background: "#ECFDF3", borderRadius: "9px", padding: "9px 12px" }}>Timer running · {pname.get(ws.timer.projectId)}</span>
              <button type="button" onClick={() => void act.stop()} style={{ height: "38px", border: 0, background: "#0A1B2A", color: "#fff", borderRadius: "9px", padding: "0 14px", fontSize: "12.5px", fontWeight: 800, cursor: "pointer" }}>
                ■ Stop
              </button>
            </>
          ) : (
            <button type="button" disabled={!canLog || !pid} onClick={() => void act.startTimerFor(pid, te.tid || null, te.tid ? tasks.find((t) => t.id === te.tid)?.number : pname.get(pid))} style={{ height: "38px", border: 0, background: "#12A150", color: "#fff", borderRadius: "9px", padding: "0 14px", fontSize: "12.5px", fontWeight: 800, cursor: "pointer", opacity: canLog && pid ? 1 : 0.6 }}>
              ▶ Start timer
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", borderTop: "1px solid #F0F2F5", paddingTop: "10px" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#475467" }}>Or add manually:</span>
          <input type="date" value={date} max={T.today} onChange={(e) => setTe({ ...te, date: e.target.value })} aria-label="Date" style={{ height: "36px", border: "1px solid #E6EAF0", borderRadius: "9px", padding: "0 8px", fontSize: "12.5px" }} />
          <input type="number" min={0.25} step={0.25} value={te.hrs} onChange={(e) => setTe({ ...te, hrs: e.target.value })} aria-label="Hours" placeholder="Hours" style={{ width: "90px", height: "36px", border: "1px solid #E6EAF0", borderRadius: "9px", padding: "0 8px", fontSize: "12.5px" }} />
          <input value={te.note} onChange={(e) => setTe({ ...te, note: e.target.value })} placeholder="What did you work on?" aria-label="Description" style={{ flex: 1, minWidth: "180px", height: "36px", border: "1px solid #E6EAF0", borderRadius: "9px", padding: "0 10px", fontSize: "12.5px" }} />
          <label style={{ display: "flex", gap: "6px", alignItems: "center", fontSize: "12.5px", color: "#344054" }}>
            <input type="checkbox" checked={te.bill} onChange={() => setTe({ ...te, bill: !te.bill })} />
            Billable
          </label>
          <button
            type="button"
            disabled={!canLog || !pid}
            onClick={async () => {
              const h = parseFloat(te.hrs);
              if (!(h >= 0.25) || h > 24) return setErr("Enter a duration between 0.25 and 24 hours.");
              if (date > T.today) return setErr("Time can’t be logged for a future date.");
              try {
                await addTime({ projectId: pid, taskId: te.tid || null, date, hours: h, note: te.note, billable: te.bill });
                setTe({ ...te, hrs: "", note: "" });
                setErr("");
                flash("Draft entry added — submit it for approval");
                await invalidate();
              } catch (e) {
                setErr(errorText(e));
              }
            }}
            style={{ height: "36px", border: "1px solid #12A150", background: "#fff", color: "#0E8442", borderRadius: "9px", padding: "0 13px", fontSize: "12.5px", fontWeight: 800, cursor: "pointer" }}
          >
            Add entry
          </button>
        </div>
        {!canLog && <div style={{ fontSize: "11.5px", color: "#B54708", fontWeight: 700 }}>You don’t have a staff record in this branch, so you can’t log project time here.</div>}
        {err && (
          <div role="alert" style={{ fontSize: "11.5px", color: "#B42318", fontWeight: 700 }}>
            {err}
          </div>
        )}
      </section>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
        {Object.keys(VIEWS).map((l) => (
          <button key={l} type="button" onClick={() => setView(l)} style={pillBtn(view === l)}>
            {l}
          </button>
        ))}
        {subm.length > 1 && (
          <button
            type="button"
            onClick={() =>
              ask({
                title: `Approve ${subm.length} time entries?`,
                body: `${hm(subm.reduce((a, e) => a + e.minutes, 0))} across ${new Set(subm.map((e) => e.personId)).size} people. Rates stay as snapshotted.`,
                ok: "Approve all",
                cancel: "Cancel",
                run: async () => {
                  try {
                    const r = await decideTime(
                      subm.map((e) => e.id),
                      "approved",
                    );
                    flash(`${r.updated} entries approved`);
                    await invalidate();
                  } catch (e) {
                    flash(errorText(e));
                  }
                },
              })
            }
            style={{ marginLeft: "auto", height: "36px", border: 0, background: "#12A150", color: "#fff", borderRadius: "9px", padding: "0 13px", fontSize: "12px", fontWeight: 800, cursor: "pointer" }}
          >
            Approve all submitted ({subm.length})
          </button>
        )}
      </div>
      <div style={{ ...card, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px", minWidth: "980px" }}>
          <thead>
            <tr style={theadRow}>
              <th style={{ padding: "10px 12px" }}>Person</th>
              {["Project / task", "Date", "Duration", "Billable", "Rate (snapshot)", "Value", "Approval", "Notes", "Actions"].map((h) => (
                <th key={h} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const s = st(TIME_ST[e.status].tone);
              return (
                <tr key={e.id} style={{ borderTop: "1px solid #F0F2F5" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 700, color: "#101828" }}>{e.who}</td>
                  <td style={{ padding: "10px 8px" }}>
                    <div style={{ color: "#344054" }}>{pname.get(e.projectId)}</div>
                    <div style={{ fontSize: "11px", color: "#98A2B3" }}>{e.taskNumber ?? "No task"}</div>
                  </td>
                  <td style={{ padding: "10px 8px", color: "#475467", whiteSpace: "nowrap" }}>{fmt(e.date)}</td>
                  <td style={{ padding: "10px 8px", fontWeight: 700, color: "#101828" }}>{hm(e.minutes)}</td>
                  <td style={{ padding: "10px 8px", color: "#475467" }}>{e.billable ? "Billable" : "Non-billable"}</td>
                  <td style={{ padding: "10px 8px", color: "#475467" }}>{!e.billable ? "—" : !T.canSeeRates ? "Hidden" : e.rate == null ? "No bill rate set" : `${money(e.rate, ws.currency)}/h`}</td>
                  <td style={{ padding: "10px 8px", color: "#101828", fontWeight: 600 }}>{e.value == null ? "—" : money(e.value, ws.currency)}</td>
                  <td style={{ padding: "10px 8px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: s.fg, background: s.bg, borderRadius: "6px", padding: "3px 7px" }}>{TIME_ST[e.status].label}</span>
                  </td>
                  <td style={{ padding: "10px 8px", color: "#475467", maxWidth: "220px" }}>{e.status === "rejected" && e.rejectReason ? `${e.note ?? ""} — Rejected: ${e.rejectReason}` : e.note}</td>
                  <td style={{ padding: "10px 8px", whiteSpace: "nowrap" }}>
                    {e.canSubmit && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await submitTime(e.id);
                            flash("Submitted for approval");
                            await invalidate();
                          } catch (er) {
                            flash(errorText(er));
                          }
                        }}
                        style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "8px", padding: "5px 10px", fontSize: "11.5px", fontWeight: 700, color: "#344054", cursor: "pointer" }}
                      >
                        Submit
                      </button>
                    )}
                    {e.canApprove && (
                      <span style={{ display: "inline-flex", gap: "5px" }}>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await decideTime([e.id], "approved");
                              flash("Time entry approved");
                              await invalidate();
                            } catch (er) {
                              flash(errorText(er));
                            }
                          }}
                          style={{ border: 0, background: "#12A150", color: "#fff", borderRadius: "8px", padding: "5px 10px", fontSize: "11.5px", fontWeight: 800, cursor: "pointer" }}
                        >
                          Approve
                        </button>
                        <button type="button" onClick={() => setRejectIds([e.id])} style={{ border: "1px solid #FECDCA", background: "#fff", color: "#B42318", borderRadius: "8px", padding: "5px 10px", fontSize: "11.5px", fontWeight: 700, cursor: "pointer" }}>
                          Reject
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <div style={{ padding: "36px", textAlign: "center", fontSize: "12.5px", color: "#667085" }}>No project time has been logged for this view.</div>}
      </div>
      <div style={{ fontSize: "11.5px", color: "#667085" }}>
        Project delivery time only. Attendance, shifts and payroll timesheets stay in Staff and are never changed from here. Billable value uses each person’s project bill rate (Settings → Permissions), snapshotted when the entry is created; labour cost uses their Staff hourly wage.
        {T.kpis.ratesMissing > 0 ? ` ${T.kpis.ratesMissing} billable entr${T.kpis.ratesMissing > 1 ? "ies have" : "y has"} no value because no bill rate is set for that person.` : ""}
      </div>
    </div>
  );
}
