"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { completeProject, fetchApprovals, fetchFeed, fetchFiles, fetchTime, projectReadiness, setMembers, type ProjectRow, type Workspace } from "@/lib/projects-api";
import { useProjectsInvalidate, useProjectsStore, useWorkspace } from "./projects-store";
import { useProjectActions } from "./projects-actions";
import { ACCESS, Avatar, Badge, Empty, ErrorBox, HealthBadge, Loading, TIME_ST, ago, card, days, errorText, fmt, fmtShort, hm, money, pr, st } from "./projects-ui";

const DTABS: Array<[string, string]> = [
  ["overview", "Overview"],
  ["tasks", "Tasks"],
  ["ms", "Milestones"],
  ["files", "Files"],
  ["time", "Time"],
  ["appr", "Approvals"],
  ["team", "Team"],
  ["fin", "Financials"],
  ["act", "Activity"],
];

export function ProjectDetailView({ id }: { id: string }) {
  const { data: ws, error, isLoading } = useWorkspace();
  if (isLoading) return <Loading />;
  if (error || !ws) return <ErrorBox error={error} />;
  const p = ws.projects.find((x) => x.id === id);
  if (!p) return <Empty title="Project not found" body="It may have been deleted, or it isn’t visible to your project role." />;
  return <Detail ws={ws} p={p} />;
}

function Detail({ ws, p }: { ws: Workspace; p: ProjectRow }) {
  const router = useRouter();
  const act = useProjectActions(ws);
  const invalidate = useProjectsInvalidate();
  const dtab = useProjectsStore((s) => s.dtab);
  const setDtab = useProjectsStore((s) => s.setDtab);
  const open = useProjectsStore((s) => s.open);
  const people = useMemo(() => new Map(ws.people.map((x) => [x.id, x.name])), [ws.people]);
  const defView = ws.config.defView;
  useEffect(() => {
    setDtab(defView === "Tasks" ? "tasks" : "overview");
  }, [p.id, defView, setDtab]);
  const tasks = ws.tasks.filter((t) => t.projectId === p.id);
  const top = tasks.filter((t) => !t.parentTaskId);
  const blockers = tasks.filter((t) => (t.blocked || t.status === "Blocked") && t.status !== "Done" && t.status !== "Cancelled").length;
  const canFin = ws.me.can["View financials"];

  const completeFlow = async () => {
    try {
      const r = await projectReadiness(p.id);
      if (!r.ready) return act.ask({ title: "This project isn’t ready to complete", body: "Resolve these first. Nothing was changed.", items: r.items, cancel: "Back to project" });
      act.ask({
        title: `Complete “${p.name}”?`,
        body: "Status becomes Completed, a completion timestamp and audit entry are recorded.",
        ok: "Complete project",
        cancel: "Cancel",
        run: async () => {
          try {
            await completeProject(p.id);
            act.flash("Project completed");
            await invalidate();
          } catch (e) {
            act.flash(errorText(e));
          }
        },
      });
    } catch (e) {
      act.flash(errorText(e));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <section style={{ ...card, padding: "16px 18px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", gap: "14px", alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: "240px" }}>
            <div style={{ fontSize: "11.5px", color: "#98A2B3", fontWeight: 600 }}>
              {p.number} · {p.type}
            </div>
            <div style={{ fontSize: "20px", fontWeight: 800, color: "#0F172A", letterSpacing: "-.5px", marginTop: "2px" }}>{p.name}</div>
            <div style={{ display: "flex", gap: "7px", flexWrap: "wrap", marginTop: "8px", alignItems: "center" }}>
              <span style={{ fontSize: "11.5px", color: "#475467" }}>{p.customerName ?? "Internal project"}</span>
              <Badge s={p.status} />
              <span style={{ fontSize: "11px", fontWeight: 700, color: pr(p.priority).fg, background: "#F9FAFB", borderRadius: "6px", padding: "3px 7px" }}>{p.priority} priority</span>
              <HealthBadge h={p.health} />
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {ws.me.can["Edit projects"] && (
              <button type="button" onClick={() => open({ kind: "np", editId: p.id })} style={{ height: "38px", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "0 12px", fontSize: "12.5px", fontWeight: 700, color: "#344054", cursor: "pointer" }}>
                Edit
              </button>
            )}
            <button type="button" onClick={() => void act.newTask(p.id)} style={{ height: "38px", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "0 12px", fontSize: "12.5px", fontWeight: 700, color: "#344054", cursor: "pointer" }}>
              + Task
            </button>
            <button type="button" onClick={() => void act.startTimerFor(p.id, null, p.name)} style={{ height: "38px", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "0 12px", fontSize: "12.5px", fontWeight: 700, color: "#344054", cursor: "pointer" }}>
              Start timer
            </button>
            {p.statusCat !== "Done" && ws.me.can["Edit projects"] && (
              <button type="button" className="pt-primary" onClick={() => void completeFlow()} style={{ height: "38px", border: 0, background: "#12A150", borderRadius: "10px", padding: "0 13px", fontSize: "12.5px", fontWeight: 800, color: "#fff", cursor: "pointer" }}>
                Complete project
              </button>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ flex: 1, height: "8px", background: "#F2F4F7", borderRadius: "6px", overflow: "hidden" }}>
            <div style={{ height: "100%", width: p.progress + "%", background: "#12A150" }} />
          </div>
          <b style={{ fontSize: "12.5px", color: "#344054" }}>{p.progress}%</b>
        </div>
        <div style={{ display: "flex", gap: "2px", borderBottom: "1px solid #F0F2F5", overflowX: "auto" }}>
          {DTABS.map(([k, label]) => {
            const on = dtab === k;
            return (
              <button key={k} type="button" onClick={() => setDtab(k)} style={{ border: 0, background: "none", padding: "9px 11px", fontSize: "12.5px", fontWeight: on ? 800 : 600, color: on ? "#0E8442" : "#475467", cursor: "pointer", borderBottom: `2.5px solid ${on ? "#12A150" : "transparent"}`, whiteSpace: "nowrap" }}>
                {label}
              </button>
            );
          })}
        </div>
      </section>

      {dtab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div data-kpi="1" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: "12px" }}>
            {[
              { l: "Overall progress", v: p.progress + "%", s: "Task-count method" },
              { l: "Tasks completed", v: `${top.filter((t) => t.status === "Done").length} / ${top.length}`, s: `${tasks.length} total incl. subtasks` },
              { l: "Days remaining", v: p.dueDate ? String(Math.max(days(p.dueDate, ws.today), 0)) : "—", s: p.dueDate ? "Due " + fmt(p.dueDate) : "No due date set" },
              { l: "Open blockers", v: String(blockers), s: "From task blocker state" },
            ].map((c) => (
              <div key={c.l} style={{ ...card, borderRadius: "13px", padding: "12px 14px" }}>
                <div style={{ fontSize: "11.5px", fontWeight: 700, color: "#667085" }}>{c.l}</div>
                <div style={{ fontSize: "19px", fontWeight: 800, color: "#0F172A", marginTop: "4px" }}>{c.v}</div>
                <div style={{ fontSize: "11px", color: "#98A2B3", marginTop: "2px" }}>{c.s}</div>
              </div>
            ))}
          </div>
          <div data-2col="1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr)", gap: "14px" }}>
            <section style={{ ...card, padding: "16px 18px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 800, color: "#101828" }}>Project summary</h2>
              <div style={{ fontSize: "12.5px", color: "#344054", lineHeight: 1.6 }}>{p.objective || p.description || "No objective written yet."}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "9px", fontSize: "12px" }}>
                {[
                  ["Start", fmt(p.startDate)],
                  ["Due", fmt(p.dueDate)],
                  ["Manager", people.get(p.managerId ?? "") ?? "Unassigned"],
                  ["Billing", p.billingType],
                  ...ws.config.fields.filter((f) => f.applies === "Project").map((f) => [f.name, String(p.customFields[f.name] ?? "—")]),
                ].map(([l, v]) => (
                  <div key={l}>
                    <div style={{ color: "#98A2B3", fontWeight: 600 }}>{l}</div>
                    <div style={{ color: "#101828", fontWeight: 700 }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ borderTop: "1px solid #F0F2F5", paddingTop: "10px", fontSize: "12px", fontWeight: 800, color: "#344054" }}>Recent tasks</div>
              {tasks.slice(0, 5).map((t) => (
                <button key={t.id} type="button" onClick={() => open({ kind: "task", id: t.id })} style={{ border: 0, background: "none", padding: "6px 0", cursor: "pointer", display: "flex", gap: "9px", alignItems: "center", textAlign: "left", borderBottom: "1px solid #F4F5F7" }}>
                  <span style={{ fontSize: "11px", color: "#98A2B3", width: "74px" }}>{t.number}</span>
                  <span style={{ flex: 1, fontSize: "12.5px", fontWeight: 600, color: "#101828" }}>{t.title}</span>
                  <Badge s={t.status} pad="2px 7px" />
                  <span style={{ fontSize: "11.5px", color: "#667085", width: "70px", textAlign: "right" }}>{fmtShort(t.dueDate)}</span>
                </button>
              ))}
              {!tasks.length && <div style={{ fontSize: "12.5px", color: "#667085" }}>No tasks yet.</div>}
            </section>
            <section style={{ ...card, padding: "16px 18px", display: "flex", flexDirection: "column", gap: "9px" }}>
              <h2 style={{ margin: 0, fontSize: "14px", fontWeight: 800, color: "#101828" }}>Health breakdown</h2>
              {p.dims.map((h) => (
                <div key={h.dim} style={{ display: "flex", alignItems: "center", gap: "9px", padding: "6px 0", borderBottom: "1px solid #F4F5F7" }}>
                  <span style={{ flex: 1, fontSize: "12.5px", fontWeight: 600, color: "#344054" }}>{h.dim}</span>
                  <HealthBadge h={h.v} />
                </div>
              ))}
              <div style={{ fontSize: "11.5px", color: "#475467", lineHeight: 1.5, background: "#FAFBFC", borderRadius: "10px", padding: "9px 11px" }}>{p.healthWhy}</div>
              <div style={{ fontSize: "12px", fontWeight: 800, color: "#344054", marginTop: "4px" }}>Linked business records</div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {[
                  p.customerId ? { label: "Customer", href: `/customers/${p.customerId}` } : { label: "Customer · not linked", href: "" },
                  { label: "Quotations", href: "/orders/quotations" },
                  { label: "Invoices", href: "/orders/invoices" },
                  { label: "Signed SOW · Contracts not available", href: "" },
                  { label: "Conversation", href: "/unified-inbox" },
                ].map((l) => (
                  <button
                    key={l.label}
                    type="button"
                    disabled={!l.href}
                    className={l.href ? "pt-ghost" : undefined}
                    onClick={() => l.href && router.push(l.href)}
                    title={l.href ? undefined : l.label.includes("Contracts") ? "There is no Documents, Contracts & eSign module yet, so no signed document can be linked." : "Link a customer by editing the project."}
                    style={{ border: "1px solid #E6EAF0", background: l.href ? "#fff" : "#F9FAFB", borderRadius: "8px", padding: "6px 9px", fontSize: "11.5px", fontWeight: 600, color: l.href ? "#344054" : "#98A2B3", cursor: l.href ? "pointer" : "default" }}
                  >
                    {l.label}
                    {l.href ? " ↗" : ""}
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}

      {dtab === "tasks" && (
        <section style={{ ...card, padding: "6px 16px" }}>
          {tasks.map((t) => (
            <button key={t.id} type="button" onClick={() => open({ kind: "task", id: t.id })} style={{ width: "100%", border: 0, background: "none", padding: "10px 0", cursor: "pointer", display: "flex", gap: "10px", alignItems: "center", textAlign: "left", borderBottom: "1px solid #F4F5F7" }}>
              <span style={{ fontSize: "11px", color: "#98A2B3", width: "74px" }}>{t.number}</span>
              <span style={{ flex: 1, fontSize: "12.5px", fontWeight: 600, color: "#101828", paddingLeft: t.parentTaskId ? "14px" : 0 }}>{t.title}</span>
              <span style={{ fontSize: "11.5px", color: "#475467" }}>{people.get(t.assigneeId ?? "") ?? "Unassigned"}</span>
              <Badge s={t.status} pad="2px 7px" />
              <span style={{ fontSize: "11.5px", color: "#667085", width: "70px", textAlign: "right" }}>{fmtShort(t.dueDate)}</span>
            </button>
          ))}
          {!tasks.length && (
            <div style={{ padding: "30px", textAlign: "center", display: "flex", flexDirection: "column", gap: "10px", alignItems: "center" }}>
              <div style={{ fontSize: "12.5px", color: "#667085" }}>This project has no tasks yet.</div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button type="button" onClick={() => void act.newTask(p.id)} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "8px 13px", fontSize: "12px", fontWeight: 700, color: "#344054", cursor: "pointer" }}>
                  Add task
                </button>
                <button type="button" onClick={() => open({ kind: "ai", tab: "plan", projectId: p.id })} style={{ border: 0, background: "#12A150", color: "#fff", borderRadius: "9px", padding: "8px 13px", fontSize: "12px", fontWeight: 800, cursor: "pointer" }}>
                  Generate plan with AI
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {["ms", "files", "time", "appr"].includes(dtab) && <DetailList ws={ws} p={p} tab={dtab} />}
      {dtab === "team" && <TeamTab ws={ws} p={p} />}

      {dtab === "fin" && (
        <section style={{ ...card, padding: "16px 18px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ fontSize: "12px", color: "#475467" }}>Context only. Budget is a reference and “consumed” is approved project time at each person’s snapshot rate. Invoices and postings stay in Orders and Profit &amp; Analytics — nothing is posted from Projects.</div>
          {canFin ? (
            <div data-kpi="1" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: "10px" }}>
              {(p.budget != null
                ? [
                    { l: "Budget", v: money(p.budget, ws.currency) },
                    { l: "Consumed", v: money(p.consumed ?? 0, ws.currency), fg: (p.consumed ?? 0) / p.budget > 0.9 ? "#B42318" : undefined },
                    { l: "Remaining", v: money(p.budget - (p.consumed ?? 0), ws.currency) },
                    { l: "Invoiced / paid", v: "In Orders & Payments" },
                  ]
                : [
                    { l: "Budget", v: "Not set" },
                    { l: "Consumed", v: p.consumed ? money(p.consumed, ws.currency) : "Insufficient data" },
                    { l: "Remaining", v: "—" },
                    { l: "Invoiced / paid", v: "In Orders & Payments" },
                  ]
              ).map((c) => (
                <div key={c.l} style={{ border: "1px solid #F0F2F5", borderRadius: "11px", padding: "11px 12px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#667085" }}>{c.l}</div>
                  <div style={{ fontSize: "17px", fontWeight: 800, color: c.fg ?? "#0F172A", marginTop: "3px" }}>{c.v}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: "12.5px", color: "#667085" }}>Your project role doesn’t include “View financials”.</div>
          )}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button type="button" onClick={() => router.push("/profit")} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "8px 12px", fontSize: "12px", fontWeight: 700, color: "#344054", cursor: "pointer" }}>
              Open Profit &amp; Analytics ↗
            </button>
            <button type="button" onClick={() => router.push("/orders/invoices")} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "8px 12px", fontSize: "12px", fontWeight: 700, color: "#344054", cursor: "pointer" }}>
              Open Invoices ↗
            </button>
          </div>
        </section>
      )}

      {dtab === "act" && <ActTab p={p} />}
    </div>
  );
}

function DetailList({ ws, p, tab }: { ws: Workspace; p: ProjectRow; tab: string }) {
  const router = useRouter();
  const open = useProjectsStore((s) => s.open);
  const files = useQuery({ queryKey: ["projects-files"], queryFn: fetchFiles, enabled: tab === "files" });
  const time = useQuery({ queryKey: ["projects-time"], queryFn: fetchTime, enabled: tab === "time" });
  const appr = useQuery({ queryKey: ["projects-approvals"], queryFn: fetchApprovals, enabled: tab === "appr" });
  type Row = { key: string; a: string; b: string; c: string; d: string; tone: { bg: string; fg: string }; onClick: () => void };
  let rows: Row[] = [];
  let empty = "";
  let go = "/projects/milestones";
  let label = "Milestones";
  if (tab === "ms") {
    rows = ws.milestones.filter((m) => m.projectId === p.id).map((m) => ({ key: m.id, a: m.number, b: m.name, c: fmt(m.plannedDate), d: m.status, tone: st(m.status), onClick: () => open({ kind: "ms", id: m.id }) }));
    empty = "Add milestones to track major project outcomes.";
  } else if (tab === "files") {
    rows = (files.data ?? []).filter((f) => f.projectId === p.id).map((f) => ({ key: f.id, a: f.ext, b: f.name, c: f.by, d: ACCESS[f.access].label, tone: ACCESS[f.access], onClick: () => open({ kind: "file", id: f.id }) }));
    empty = files.isLoading ? "Loading…" : "No files linked to this project yet.";
    go = "/projects/files";
    label = "Files";
  } else if (tab === "time") {
    rows = (time.data?.entries ?? [])
      .filter((e) => e.projectId === p.id)
      .map((e) => ({ key: e.id, a: fmtShort(e.date), b: `${e.who} · ${e.note ?? ""}`, c: hm(e.minutes), d: TIME_ST[e.status].label, tone: st(TIME_ST[e.status].tone), onClick: () => router.push("/projects/time") }));
    empty = time.isLoading ? "Loading…" : "No project time has been logged.";
    go = "/projects/time";
    label = "Time Tracking";
  } else {
    const map: Record<string, string> = { Approved: "Done", Rejected: "Blocked", "Changes Requested": "At Risk", Sent: "To Do", Viewed: "In Review" };
    rows = (appr.data ?? []).filter((a) => a.projectId === p.id).map((a) => ({ key: a.id, a: a.number, b: a.item, c: a.from, d: a.status, tone: st(map[a.status] ?? "Draft"), onClick: () => open({ kind: "ap", id: a.id }) }));
    empty = appr.isLoading ? "Loading…" : "No approvals are waiting.";
    go = "/projects/approvals";
    label = "Client Approvals";
  }
  return (
    <section style={{ ...card, padding: "6px 16px" }}>
      {rows.map((r) => (
        <button key={r.key} type="button" onClick={r.onClick} style={{ width: "100%", border: 0, background: "none", padding: "10px 0", cursor: "pointer", display: "flex", gap: "10px", alignItems: "center", textAlign: "left", borderBottom: "1px solid #F4F5F7" }}>
          <span style={{ fontSize: "11px", color: "#98A2B3", width: "80px", flex: "0 0 80px" }}>{r.a}</span>
          <span style={{ flex: 1, fontSize: "12.5px", fontWeight: 600, color: "#101828", minWidth: 0 }}>{r.b}</span>
          <span style={{ fontSize: "11.5px", color: "#475467" }}>{r.c}</span>
          <span style={{ fontSize: "11px", fontWeight: 700, color: r.tone.fg, background: r.tone.bg, borderRadius: "6px", padding: "2px 7px", whiteSpace: "nowrap" }}>{r.d}</span>
        </button>
      ))}
      {!rows.length && <div style={{ padding: "30px", textAlign: "center", fontSize: "12.5px", color: "#667085" }}>{empty}</div>}
      <div style={{ padding: "10px 0", display: "flex", gap: "8px" }}>
        <button type="button" onClick={() => router.push(go)} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "7px 12px", fontSize: "12px", fontWeight: 700, color: "#344054", cursor: "pointer" }}>
          Open full {label} view
        </button>
      </div>
    </section>
  );
}

function TeamTab({ ws, p }: { ws: Workspace; p: ProjectRow }) {
  const invalidate = useProjectsInvalidate();
  const flash = useProjectsStore((s) => s.flash);
  const [edit, setEdit] = useState<Record<string, { on: boolean; pct: number; role: string }> | null>(null);
  const people = new Map(ws.people.map((x) => [x.id, x]));
  const assignees = [...new Set(ws.tasks.filter((t) => t.projectId === p.id && t.assigneeId).map((t) => t.assigneeId as string))];
  const ids = [...new Set([p.managerId, ...p.members.map((m) => m.personId), ...assignees].filter(Boolean) as string[])];
  const member = (id: string) => p.members.find((m) => m.personId === id);
  return (
    <section style={{ ...card, padding: "6px 16px" }}>
      {!edit &&
        ids.map((id) => {
          const m = member(id);
          const name = people.get(id)?.name ?? "Former staff";
          return (
            <div key={id} style={{ display: "flex", gap: "10px", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #F4F5F7" }}>
              <Avatar name={name} size={30} fs="11px" />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>{name}</div>
                <div style={{ fontSize: "11px", color: "#667085" }}>{id === p.managerId ? "Project Manager" : m?.roleLabel ?? "Assigned on tasks"}</div>
              </div>
              <span style={{ fontSize: "11.5px", color: "#475467" }}>{m?.allocationPct ? `${m.allocationPct}% allocated` : "Allocation not set"}</span>
            </div>
          );
        })}
      {edit &&
        ws.people.map((x) => {
          const e = edit[x.id] ?? { on: false, pct: 0, role: "Team member" };
          return (
            <div key={x.id} style={{ display: "flex", gap: "10px", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #F4F5F7", fontSize: "12.5px" }}>
              <input type="checkbox" checked={e.on} onChange={() => setEdit({ ...edit, [x.id]: { ...e, on: !e.on } })} aria-label={`Include ${x.name}`} />
              <span style={{ flex: 1, fontWeight: 700, color: "#101828" }}>{x.name}</span>
              <input value={e.role} onChange={(ev) => setEdit({ ...edit, [x.id]: { ...e, role: ev.target.value } })} aria-label="Role on project" style={{ height: "32px", border: "1px solid #E6EAF0", borderRadius: "8px", padding: "0 8px", fontSize: "12px", width: "150px" }} />
              <input type="number" min={0} max={100} value={e.pct} onChange={(ev) => setEdit({ ...edit, [x.id]: { ...e, pct: +ev.target.value } })} aria-label="Allocation percent" style={{ height: "32px", border: "1px solid #E6EAF0", borderRadius: "8px", padding: "0 8px", fontSize: "12px", width: "70px" }} />
              <span style={{ color: "#667085" }}>%</span>
            </div>
          );
        })}
      <div style={{ padding: "10px 0", display: "flex", gap: "10px", alignItems: "center" }}>
        <span style={{ flex: 1, fontSize: "11.5px", color: "#98A2B3" }}>Team members are linked to Staff records — no duplicate users are created.</span>
        {ws.me.can["Edit projects"] &&
          (edit ? (
            <>
              <button type="button" onClick={() => setEdit(null)} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "7px 12px", fontSize: "12px", fontWeight: 700, color: "#344054", cursor: "pointer" }}>
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await setMembers(
                      p.id,
                      Object.entries(edit)
                        .filter(([, v]) => v.on)
                        .map(([personId, v]) => ({ personId, roleLabel: v.role, allocationPct: v.pct })),
                    );
                    setEdit(null);
                    flash("Team updated");
                    await invalidate();
                  } catch (e) {
                    flash(errorText(e));
                  }
                }}
                style={{ border: 0, background: "#12A150", color: "#fff", borderRadius: "9px", padding: "7px 12px", fontSize: "12px", fontWeight: 800, cursor: "pointer" }}
              >
                Save team
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEdit(Object.fromEntries(ws.people.map((x) => [x.id, { on: !!member(x.id) || x.id === p.managerId, pct: member(x.id)?.allocationPct ?? 0, role: member(x.id)?.roleLabel ?? (x.id === p.managerId ? "Project Manager" : "Team member") }])))}
              style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "7px 12px", fontSize: "12px", fontWeight: 700, color: "#344054", cursor: "pointer" }}
            >
              Edit team
            </button>
          ))}
      </div>
    </section>
  );
}

function ActTab({ p }: { p: ProjectRow }) {
  const { data, isLoading } = useQuery({ queryKey: ["projects-feed"], queryFn: fetchFeed });
  const items = (data?.items ?? []).filter((a) => a.projectId === p.id);
  return (
    <section style={{ ...card, padding: "8px 16px" }}>
      {items.map((a) => (
        <div key={a.id} style={{ display: "flex", gap: "10px", padding: "10px 0", borderBottom: "1px solid #F4F5F7" }}>
          <Avatar name={a.who} size={26} bg="#F2F4F7" fg="#344054" />
          <div>
            <div style={{ fontSize: "12.5px", color: "#344054" }}>
              <b style={{ color: "#101828" }}>{a.who}</b> {a.what}
              {a.body ? ` — “${a.body.slice(0, 160)}”` : ""}
            </div>
            <div style={{ fontSize: "10.5px", color: "#98A2B3", fontFamily: "ui-monospace,monospace" }}>
              {a.ev} · {ago(a.when)}
            </div>
          </div>
        </div>
      ))}
      {!items.length && <div style={{ padding: "30px", textAlign: "center", fontSize: "12.5px", color: "#667085" }}>{isLoading ? "Loading…" : "Nothing has happened on this project yet."}</div>}
    </section>
  );
}

