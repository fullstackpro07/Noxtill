"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { addDependency, addTaskComment, createProject, fetchTaskComments, removeDependency, setMembers, updateProject, updateTask, type Workspace } from "@/lib/projects-api";
import { useProjectsInvalidate, useProjectsStore } from "./projects-store";
import { useProjectActions } from "./projects-actions";
import { budgetText } from "./projects-list-view";
import { Drawer, HealthBadge, Badge, CloseBtn, ago, errLine, errorText, fieldInput, fieldLabel, fieldSelect, fmt, footBtnGhost, footBtnPrimary, hrs, left, money } from "./projects-ui";

/* ── Project quick view ─────────────────────────────────────────────── */

export function QuickView({ ws, id }: { ws: Workspace; id: string }) {
  const router = useRouter();
  const close = useProjectsStore((s) => s.close);
  const act = useProjectActions(ws);
  const p = ws.projects.find((x) => x.id === id);
  if (!p) return null;
  const [lt, lfg] = left(p.dueDate, ws.today, p.statusCat === "Done");
  const b = budgetText(p, ws.currency);
  const mgr = ws.people.find((x) => x.id === p.managerId)?.name ?? "Unassigned";
  return (
    <Drawer
      label="Project quick view"
      kicker={p.number}
      title={
        <>
          {p.name}
          <div style={{ fontSize: "12px", color: "#667085", marginTop: "2px", fontWeight: 400 }}>
            {p.customerName ?? "Internal"} · {mgr}
          </div>
        </>
      }
      onClose={close}
      footer={
        <>
          <button
            type="button"
            className="pt-primary"
            onClick={() => {
              close();
              router.push(`/projects/${p.id}`);
            }}
            style={footBtnPrimary}
          >
            Open full project
          </button>
          <button type="button" onClick={() => void act.newTask(p.id)} style={footBtnGhost}>
            Add task
          </button>
        </>
      }
    >
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        <Badge s={p.status} />
        <HealthBadge h={p.health} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ flex: 1, height: "8px", background: "#F2F4F7", borderRadius: "6px", overflow: "hidden" }}>
          <div style={{ height: "100%", width: p.progress + "%", background: "#12A150" }} />
        </div>
        <b style={{ fontSize: "12.5px" }}>{p.progress}%</b>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "10px", fontSize: "12px" }}>
        {[
          { l: "Deadline", v: fmt(p.dueDate), s: lt, sfg: lfg },
          { l: "Budget", v: ws.me.can["View financials"] ? b.txt : "Hidden", fg: ws.me.can["View financials"] ? b.fg : "#98A2B3" },
          { l: "Open tasks", v: String(p.openCount) },
          { l: "Overdue", v: String(p.overdueCount), fg: "#B42318" },
        ].map((c) => (
          <div key={c.l} style={{ border: "1px solid #F0F2F5", borderRadius: "10px", padding: "9px 11px" }}>
            <div style={{ color: "#98A2B3", fontWeight: 600 }}>{c.l}</div>
            <div style={{ fontWeight: 800, color: c.fg ?? "#101828" }}>{c.v}</div>
            {c.s && <div style={{ fontSize: "11px", color: c.sfg, fontWeight: 700 }}>{c.s}</div>}
          </div>
        ))}
      </div>
      <div style={{ fontSize: "12px" }}>
        <span style={{ color: "#98A2B3", fontWeight: 600 }}>Next milestone · </span>
        <b style={{ color: "#101828" }}>{p.nextMilestone ? `${p.nextMilestone.name} · ${fmt(p.nextMilestone.date)}` : "None scheduled"}</b>
      </div>
      <div style={{ fontSize: "11.5px", color: "#475467", lineHeight: 1.5, background: "#FAFBFC", borderRadius: "10px", padding: "9px 11px" }}>{p.healthWhy}</div>
    </Drawer>
  );
}

/* ── Task drawer ────────────────────────────────────────────────────── */

export function TaskDrawer({ ws, id }: { ws: Workspace; id: string }) {
  const close = useProjectsStore((s) => s.close);
  const act = useProjectActions(ws);
  const invalidate = useProjectsInvalidate();
  const t = ws.tasks.find((x) => x.id === id);
  const [title, setTitle] = useState(t?.title ?? "");
  const [desc, setDesc] = useState(t?.description ?? "");
  const [cmt, setCmt] = useState("");
  const [depPick, setDepPick] = useState("");
  const [depErr, setDepErr] = useState("");
  const [newItem, setNewItem] = useState("");
  const [newReq, setNewReq] = useState(false);
  const [blk, setBlk] = useState<{ type: string; note: string } | null>(null);
  const comments = useQuery({ queryKey: ["projects-comments", id], queryFn: () => fetchTaskComments(id), enabled: !!t });
  if (!t) return null;
  const p = ws.projects.find((x) => x.id === t.projectId);
  const save = async (body: Record<string, unknown>, msg = "Task updated") => {
    try {
      const r = await updateTask(t.id, body);
      act.flash(r.warning ?? msg);
      await invalidate();
    } catch (e) {
      act.flash(errorText(e));
    }
  };
  const depOpts = ws.tasks.filter((x) => x.id !== t.id && !t.deps.includes(x.id) && x.projectId === t.projectId);
  const doneN = t.checklist.filter((c) => c.done).length;
  const lbl = { display: "flex", flexDirection: "column", gap: "4px", fontSize: "11px", fontWeight: 700, color: "#667085" } as const;
  const sel = { height: "38px", border: "1px solid #E6EAF0", borderRadius: "9px", padding: "0 9px", fontSize: "12.5px", color: "#101828" } as const;

  return (
    <aside data-drawer="1" role="dialog" aria-label="Task detail" style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "480px", background: "#fff", zIndex: 95, boxShadow: "-12px 0 40px rgba(16,24,40,.14)", display: "flex", flexDirection: "column", animation: "nxdr .28s ease" }}>
      <div style={{ padding: "16px 18px", borderBottom: "1px solid #F0F2F5", display: "flex", gap: "10px", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "11px", color: "#98A2B3", fontWeight: 600 }}>
            {t.number} · {p?.name}
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== t.title && void save({ title: title.trim() })}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            aria-label="Task title"
            style={{ width: "100%", fontSize: "16px", fontWeight: 800, color: "#101828", lineHeight: 1.3, border: "1px solid transparent", borderRadius: "7px", padding: "2px 4px", margin: "0 -4px", background: "transparent" }}
          />
        </div>
        <CloseBtn onClick={close} />
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: "14px" }}>
        {t.blocked ? (
          <div style={{ background: "#FEF3F2", border: "1px solid #FECDCA", borderRadius: "10px", padding: "10px 12px", fontSize: "12px", color: "#B42318", lineHeight: 1.5, display: "flex", gap: "10px", alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <b>Blocked · {t.blockType || "Blocked"}</b>
              <br />
              {t.blockerNote || "No details written."}
            </div>
            <button type="button" onClick={() => void save({ blocked: false }, "Blocker cleared")} style={{ border: "1px solid #FECDCA", background: "#fff", color: "#B42318", borderRadius: "7px", padding: "4px 9px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>
              Clear
            </button>
          </div>
        ) : blk ? (
          <div style={{ border: "1px solid #FECDCA", borderRadius: "10px", padding: "10px 12px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", gap: "8px" }}>
              <select value={blk.type} onChange={(e) => setBlk({ ...blk, type: e.target.value })} aria-label="Blocker type" style={{ ...sel, height: "34px" }}>
                {["Vendor", "Client", "Internal", "Dependency", "Resource"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              <input value={blk.note} onChange={(e) => setBlk({ ...blk, note: e.target.value })} placeholder="What is blocking it?" aria-label="Blocker note" style={{ ...sel, height: "34px", flex: 1 }} />
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                type="button"
                onClick={async () => {
                  await save({ blocked: true, blockType: blk.type, blockerNote: blk.note }, "Blocker flagged");
                  setBlk(null);
                }}
                style={{ border: 0, background: "#D92D20", color: "#fff", borderRadius: "8px", padding: "6px 11px", fontSize: "12px", fontWeight: 800, cursor: "pointer" }}
              >
                Flag blocker
              </button>
              <button type="button" onClick={() => setBlk(null)} style={{ border: 0, background: "none", color: "#667085", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "10px" }}>
          <label style={lbl}>
            Status
            <select value={t.status} onChange={(e) => void act.changeStatus(t, e.target.value)} style={sel}>
              {["Backlog", "To Do", "In Progress", "In Review", "Blocked", "Done", "Cancelled"].map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <label style={lbl}>
            Assignee
            <select value={t.assigneeId ?? ""} onChange={(e) => void save({ assigneeId: e.target.value || null })} style={sel}>
              <option value="">Unassigned</option>
              {ws.people.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label style={lbl}>
            Priority
            <select value={t.priority} onChange={(e) => void save({ priority: e.target.value })} style={sel}>
              {ws.config.priorities.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <label style={lbl}>
            Due date
            <input type="date" value={t.dueDate ?? ""} onChange={(e) => (t.dueDate && e.target.value ? void act.rescheduleTask(t, e.target.value) : void save({ dueDate: e.target.value || null }))} style={sel} />
          </label>
        </div>
        <div style={{ display: "flex", gap: "16px", fontSize: "12px", color: "#475467", background: "#FAFBFC", borderRadius: "10px", padding: "9px 12px", alignItems: "center", flexWrap: "wrap" }}>
          <span>
            Estimate{" "}
            <input
              type="number"
              min={0}
              step={0.5}
              defaultValue={t.estimateMins / 60}
              key={t.estimateMins}
              onBlur={(e) => {
                const m = Math.round(parseFloat(e.target.value || "0") * 60);
                if (m !== t.estimateMins) void save({ estimateMins: m });
              }}
              aria-label="Estimate in hours"
              style={{ width: "54px", border: "1px solid #E6EAF0", borderRadius: "6px", padding: "2px 5px", fontSize: "12px", fontWeight: 700, color: "#101828" }}
            />{" "}
            h
          </span>
          <span>
            Logged <b style={{ color: "#101828" }}>{hrs(t.loggedMins)}</b>
          </span>
          <span>
            Remaining <b style={{ color: "#101828" }}>{hrs(Math.max(t.estimateMins - t.loggedMins, 0))}</b>
          </span>
          <label style={{ marginLeft: "auto", display: "flex", gap: "6px", alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={t.clientVisible} onChange={() => void save({ clientVisible: !t.clientVisible }, t.clientVisible ? "Hidden from the client portal" : "Shared in the client portal")} />
            Share with client
          </label>
        </div>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== (t.description ?? "") && void save({ description: desc })} rows={3} placeholder="Add a description." aria-label="Description" style={{ fontSize: "12.5px", color: "#344054", lineHeight: 1.6, border: "1px solid #F0F2F5", borderRadius: "9px", padding: "8px 10px", resize: "vertical" }} />
        {ws.config.fields.filter((f) => f.applies === "Task").length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "10px" }}>
            {ws.config.fields
              .filter((f) => f.applies === "Task")
              .map((f) => (
                <label key={f.name} style={lbl}>
                  {f.name}
                  <input
                    type={f.type === "Number" || f.type === "Currency" || f.type === "Percentage" ? "number" : f.type === "Date" ? "date" : f.type === "URL" ? "url" : "text"}
                    defaultValue={String(t.customFields?.[f.name] ?? "")}
                    key={`${t.id}-${f.name}-${String(t.customFields?.[f.name] ?? "")}`}
                    onBlur={(e) => e.target.value !== String(t.customFields?.[f.name] ?? "") && void save({ customFields: { [f.name]: e.target.value } }, `${f.name} saved`)}
                    style={sel}
                  />
                </label>
              ))}
          </div>
        )}
        {!t.blocked && !blk && t.status !== "Done" && (
          <button type="button" onClick={() => setBlk({ type: "Internal", note: "" })} style={{ alignSelf: "flex-start", border: 0, background: "none", padding: 0, color: "#B42318", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
            ⚠ Flag a blocker
          </button>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ fontSize: "12px", fontWeight: 800, color: "#101828" }}>
            Checklist · {doneN}/{t.checklist.length}
          </div>
          {t.checklist.map((c, i) => (
            <label key={i} style={{ display: "flex", gap: "9px", alignItems: "center", fontSize: "12.5px", color: "#344054", cursor: "pointer", minHeight: "30px" }}>
              <input type="checkbox" checked={c.done} onChange={() => void save({ checklist: t.checklist.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) }, "Checklist updated")} />
              <span style={{ flex: 1 }}>{c.t}</span>
              {c.req && <span style={{ fontSize: "10px", fontWeight: 800, color: "#B54708", background: "#FEF6E7", borderRadius: "5px", padding: "1px 6px" }}>Required</span>}
              <button type="button" aria-label="Remove item" onClick={(e) => { e.preventDefault(); void save({ checklist: t.checklist.filter((_, j) => j !== i) }, "Checklist updated"); }} style={{ border: 0, background: "none", color: "#98A2B3", cursor: "pointer" }}>
                ×
              </button>
            </label>
          ))}
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add checklist item" aria-label="New checklist item" style={{ flex: 1, height: "34px", border: "1px solid #E6EAF0", borderRadius: "9px", padding: "0 10px", fontSize: "12px" }} />
            <label style={{ fontSize: "11.5px", color: "#475467", display: "flex", gap: "4px", alignItems: "center" }}>
              <input type="checkbox" checked={newReq} onChange={() => setNewReq(!newReq)} />
              Required
            </label>
            <button
              type="button"
              onClick={async () => {
                if (!newItem.trim()) return;
                await save({ checklist: [...t.checklist, { t: newItem.trim(), done: false, req: newReq }] }, "Checklist updated");
                setNewItem("");
                setNewReq(false);
              }}
              style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "0 12px", height: "34px", fontSize: "12px", fontWeight: 700, color: "#344054", cursor: "pointer" }}
            >
              Add
            </button>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ fontSize: "12px", fontWeight: 800, color: "#101828" }}>Dependencies</div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {t.deps.map((d) => {
              const x = ws.tasks.find((y) => y.id === d);
              return (
                <span key={d} style={{ fontSize: "11.5px", fontWeight: 600, color: "#344054", border: "1px solid #E6EAF0", borderRadius: "7px", padding: "4px 4px 4px 8px", display: "inline-flex", gap: "5px", alignItems: "center" }}>
                  {x ? `${x.number} · ${x.title}` : "Removed task"}
                  <button
                    type="button"
                    aria-label="Remove dependency"
                    onClick={async () => {
                      await removeDependency(t.id, d).catch((e) => act.flash(errorText(e)));
                      await invalidate();
                    }}
                    style={{ border: 0, background: "none", color: "#98A2B3", cursor: "pointer" }}
                  >
                    ×
                  </button>
                </span>
              );
            })}
            {!t.deps.length && <span style={{ fontSize: "12px", color: "#98A2B3" }}>No dependencies.</span>}
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <select value={depPick} onChange={(e) => { setDepPick(e.target.value); setDepErr(""); }} aria-label="Add blocked-by dependency" style={{ flex: 1, height: "36px", border: "1px solid #E6EAF0", borderRadius: "9px", padding: "0 8px", fontSize: "12px" }}>
              <option value="">Add “blocked by” task…</option>
              {depOpts.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.number} · {o.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={async () => {
                if (!depPick) return;
                try {
                  await addDependency(t.id, depPick);
                  setDepPick("");
                  act.flash("Dependency added · Finish-to-Start");
                  await invalidate();
                } catch (e) {
                  setDepErr(errorText(e));
                }
              }}
              style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", padding: "0 12px", fontSize: "12px", fontWeight: 700, color: "#344054", cursor: "pointer" }}
            >
              Add
            </button>
          </div>
          {depErr && (
            <div role="alert" style={errLine}>
              {depErr}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ fontSize: "12px", fontWeight: 800, color: "#101828" }}>Comments</div>
          {(comments.data ?? []).map((c) => (
            <div key={c.id} style={{ background: "#FAFBFC", borderRadius: "10px", padding: "9px 11px" }}>
              <div style={{ fontSize: "11.5px", fontWeight: 700, color: "#101828" }}>
                {c.who} <span style={{ fontWeight: 500, color: "#98A2B3" }}>· {ago(c.when)}</span>
              </div>
              <div style={{ fontSize: "12.5px", color: "#344054", marginTop: "2px", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{c.body}</div>
            </div>
          ))}
          <div style={{ display: "flex", gap: "6px" }}>
            <input value={cmt} onChange={(e) => setCmt(e.target.value)} placeholder="Write a comment — use @ to mention" aria-label="Comment" style={{ flex: 1, height: "38px", border: "1px solid #E6EAF0", borderRadius: "9px", padding: "0 10px", fontSize: "12.5px" }} />
            <button
              type="button"
              onClick={async () => {
                if (!cmt.trim()) return;
                try {
                  const r = await addTaskComment(t.id, cmt.trim());
                  setCmt("");
                  if (r.notified) act.flash(`Posted · ${r.notified} notified`);
                  await invalidate();
                } catch (e) {
                  act.flash(errorText(e));
                }
              }}
              style={{ border: 0, background: "#12A150", color: "#fff", borderRadius: "9px", padding: "0 13px", fontSize: "12px", fontWeight: 800, cursor: "pointer" }}
            >
              Post
            </button>
          </div>
        </div>
      </div>
      <div style={{ padding: "12px 18px", borderTop: "1px solid #F0F2F5", display: "flex", gap: "8px" }}>
        <button type="button" className="pt-primary" disabled={t.status === "Done"} onClick={() => void act.changeStatus(t, "Done")} style={{ ...footBtnPrimary, opacity: t.status === "Done" ? 0.6 : 1 }}>
          {t.status === "Done" ? "Completed" : "Mark complete"}
        </button>
        <button type="button" onClick={() => void act.startTimerFor(t.projectId, t.id, t.number)} style={footBtnGhost}>
          Start timer
        </button>
      </div>
    </aside>
  );
}

/* ── New project wizard (also the project editor) ───────────────────── */

const STEPS = ["Basic information", "Ownership", "Dates", "Scope", "Financial context", "Workflow", "Automations", "Review"];

export function NewProjectWizard({ ws, templateId, type, editId }: { ws: Workspace; templateId?: string; type?: string; editId?: string }) {
  const router = useRouter();
  const close = useProjectsStore((s) => s.close);
  const setDirty = useProjectsStore((s) => s.setNpDirty);
  const flash = useProjectsStore((s) => s.flash);
  const invalidate = useProjectsInvalidate();
  const editing = editId ? ws.projects.find((p) => p.id === editId) : undefined;
  const init = useMemo(() => {
    const me = ws.me.personId;
    if (editing)
      return {
        name: editing.name,
        customerId: editing.customerId ?? "",
        type: editing.type,
        description: editing.description ?? "",
        managerId: editing.managerId ?? "",
        team: [...new Set([editing.managerId, ...editing.members.map((m) => m.personId)].filter(Boolean) as string[])],
        startDate: editing.startDate ?? "",
        dueDate: editing.dueDate ?? "",
        dueLocked: editing.dueLocked,
        objective: editing.objective ?? "",
        deliverables: editing.deliverables ?? "",
        exclusions: editing.exclusions ?? "",
        budget: editing.budget != null ? String(editing.budget) : "",
        billingType: editing.billingType,
        status: editing.status,
        priority: editing.priority,
        templateId: "",
        requireClientApproval: editing.requireClientApproval,
        automationRefs: editing.automationRefs,
        customFields: editing.customFields as Record<string, string>,
      };
    const mgr = ws.config.defMgr ?? me ?? "";
    return {
      name: "",
      customerId: "",
      type: type ?? "Client",
      description: "",
      managerId: mgr,
      team: mgr ? [mgr] : [],
      startDate: ws.today,
      dueDate: "",
      dueLocked: false,
      objective: "",
      deliverables: "",
      exclusions: "",
      budget: "",
      billingType: "Fixed",
      status: ws.config.defStatus,
      priority: ws.config.defPri,
      templateId: templateId ?? "",
      requireClientApproval: false,
      automationRefs: [] as string[],
      customFields: {} as Record<string, string>,
    };
  }, [ws, editing, templateId, type]);
  const [np, setNp] = useState(init);
  const [step, setStep] = useState(0);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const upd = (patch: Partial<typeof np>) => {
    setNp({ ...np, ...patch });
    setDirty(true);
  };
  const nameErr = tried && !np.name.trim();
  const dateErr = !!np.startDate && !!np.dueDate && np.dueDate < np.startDate;
  const canBudget = ws.me.can["Manage budgets"];
  const statusOpts = ws.config.statuses.filter((s) => (editing ? s.name !== "Archived" : s.cat === "Not started" || s.name === "Active")).map((s) => s.name);
  const people = ws.people;

  const submit = async (asDraft: boolean) => {
    if (!np.name.trim()) {
      setTried(true);
      setStep(0);
      return;
    }
    if (dateErr) return setStep(2);
    setBusy(true);
    setErr("");
    try {
      if (editing) {
        const body: Record<string, unknown> = {
          name: np.name,
          customerId: np.customerId || null,
          type: np.type,
          description: np.description,
          managerId: np.managerId || null,
          startDate: np.startDate || null,
          dueDate: np.dueDate || null,
          dueLocked: np.dueLocked,
          objective: np.objective,
          deliverables: np.deliverables,
          exclusions: np.exclusions,
          billingType: np.billingType,
          status: np.status,
          priority: np.priority,
          requireClientApproval: np.requireClientApproval,
          customFields: np.customFields,
          confirmDueChange: true,
        };
        if (canBudget) body.budget = np.budget === "" ? null : +np.budget;
        await updateProject(editing.id, body);
        await setMembers(
          editing.id,
          np.team.map((pid) => ({ personId: pid, roleLabel: editing.members.find((m) => m.personId === pid)?.roleLabel, allocationPct: editing.members.find((m) => m.personId === pid)?.allocationPct })),
        );
        flash("Project updated");
        await invalidate();
        close();
        return;
      }
      const r = await createProject({
        name: np.name,
        customerId: np.customerId || null,
        type: np.type,
        description: np.description,
        managerId: np.managerId || null,
        team: np.team,
        startDate: np.startDate || null,
        dueDate: np.dueDate || null,
        dueLocked: np.dueLocked,
        objective: np.objective,
        deliverables: np.deliverables,
        exclusions: np.exclusions,
        budget: canBudget && np.budget !== "" ? +np.budget : undefined,
        billingType: np.billingType,
        status: asDraft ? "Draft" : np.status,
        priority: np.priority,
        templateId: np.templateId || null,
        requireClientApproval: np.requireClientApproval,
        automationRefs: np.automationRefs,
      });
      flash(`${r.number} created as ${r.status}`);
      await invalidate();
      close();
      router.push(`/projects/${r.id}`);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const ta = { border: "1px solid #E6EAF0", borderRadius: "9px", padding: "9px 11px", fontSize: "13px", resize: "vertical" } as const;
  const tpl = ws.templates.find((t) => t.id === np.templateId);
  const review = [
    { l: "Name", v: np.name || "— required" },
    { l: "Customer", v: ws.customers.find((c) => c.id === np.customerId)?.name ?? "Internal project" },
    { l: "Type", v: np.type },
    { l: "Manager", v: people.find((p) => p.id === np.managerId)?.name ?? "—" },
    { l: "Team", v: np.team.map((id) => people.find((p) => p.id === id)?.name).filter(Boolean).join(", ") || "—" },
    { l: "Dates", v: `${fmt(np.startDate)} → ${fmt(np.dueDate)}` },
    { l: "Budget", v: np.budget ? money(+np.budget, ws.currency) + " · " + np.billingType : "Not set" },
    { l: "Status / priority", v: np.status + " · " + np.priority },
    { l: "Template", v: editing ? "—" : tpl?.name ?? "No template" },
    { l: "Automations", v: np.automationRefs.length + " referenced" },
  ];

  return (
    <div role="dialog" aria-label={editing ? "Edit project" : "New project"} style={{ position: "fixed", inset: 0, zIndex: 96, display: "flex", alignItems: "center", justifyContent: "center", padding: "18px", pointerEvents: "none" }}>
      <div style={{ pointerEvents: "auto", width: "100%", maxWidth: "860px", maxHeight: "92vh", background: "#fff", borderRadius: "16px", boxShadow: "0 30px 80px rgba(16,24,40,.25)", display: "flex", flexDirection: "column", overflow: "hidden", animation: "nxin .25s ease" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #F0F2F5", display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "16px", fontWeight: 800, color: "#101828" }}>{editing ? `Edit ${editing.number}` : "New project"}</div>
            <div style={{ fontSize: "11.5px", color: "#667085" }}>
              {editing ? "Changes are written to the audit log" : "A project ID will be assigned on create"} · step {step + 1} of 8
            </div>
          </div>
          <CloseBtn onClick={() => closeWithGuard()} />
        </div>
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <div data-hidesm="1" style={{ width: "200px", borderRight: "1px solid #F0F2F5", padding: "12px", display: "flex", flexDirection: "column", gap: "2px", background: "#FAFBFC" }}>
            {STEPS.map((s, i) => (
              <button key={s} type="button" onClick={() => setStep(i)} style={{ border: 0, textAlign: "left", background: step === i ? "#E7F6EE" : "transparent", color: step === i ? "#0E8442" : "#475467", borderRadius: "8px", padding: "8px 10px", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>
                {i + 1}. {s}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
            {step === 0 && (
              <>
                <label style={fieldLabel}>
                  Project name *
                  <input value={np.name} onChange={(e) => upd({ name: e.target.value })} placeholder="e.g. Holiday Pop-up Store" style={{ ...fieldInput, border: `1px solid ${nameErr ? "#F04438" : "#E6EAF0"}` }} autoFocus />
                </label>
                {nameErr && (
                  <div role="alert" style={errLine}>
                    Project name is required.
                  </div>
                )}
                <label style={fieldLabel}>
                  Customer (from Customers CRM)
                  <select value={np.customerId} onChange={(e) => upd({ customerId: e.target.value })} style={fieldSelect}>
                    <option value="">Internal project</option>
                    {ws.customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={fieldLabel}>
                  Project type
                  <select value={np.type} onChange={(e) => upd({ type: e.target.value })} style={fieldSelect}>
                    {ws.config.types.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </label>
                <label style={fieldLabel}>
                  Description
                  <textarea value={np.description} onChange={(e) => upd({ description: e.target.value })} rows={3} style={ta} />
                </label>
              </>
            )}
            {step === 1 && (
              <>
                <label style={fieldLabel}>
                  Project manager
                  <select value={np.managerId} onChange={(e) => upd({ managerId: e.target.value, team: e.target.value && !np.team.includes(e.target.value) ? [...np.team, e.target.value] : np.team })} style={fieldSelect}>
                    <option value="">Unassigned</option>
                    {people.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#344054" }}>Team members (from Staff)</div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {people.map((m) => {
                    const on = np.team.includes(m.id);
                    return (
                      <button key={m.id} type="button" onClick={() => upd({ team: on ? np.team.filter((x) => x !== m.id) : [...np.team, m.id] })} style={{ border: `1px solid ${on ? "#12A150" : "#E6EAF0"}`, background: on ? "#E7F6EE" : "#fff", color: on ? "#0E8442" : "#475467", borderRadius: "20px", padding: "7px 12px", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                        {m.name}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "10px" }}>
                  <label style={fieldLabel}>
                    Start date
                    <input type="date" value={np.startDate} onChange={(e) => upd({ startDate: e.target.value })} style={fieldSelect} />
                  </label>
                  <label style={fieldLabel}>
                    Target end date
                    <input type="date" value={np.dueDate} onChange={(e) => upd({ dueDate: e.target.value })} style={{ ...fieldSelect, border: `1px solid ${dateErr ? "#F04438" : "#E6EAF0"}` }} />
                  </label>
                </div>
                {dateErr && (
                  <div role="alert" style={errLine}>
                    End date must be after the start date.
                  </div>
                )}
                <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "12.5px", color: "#344054" }}>
                  <input type="checkbox" checked={np.dueLocked} onChange={() => upd({ dueLocked: !np.dueLocked })} />
                  Lock deadline — changes need confirmation
                </label>
              </>
            )}
            {step === 3 && (
              <>
                {(
                  [
                    ["objective", "Objective"],
                    ["deliverables", "Deliverables"],
                    ["exclusions", "Exclusions"],
                  ] as const
                ).map(([k, l]) => (
                  <label key={k} style={fieldLabel}>
                    {l}
                    <textarea value={np[k]} onChange={(e) => upd({ [k]: e.target.value })} rows={2} style={ta} />
                  </label>
                ))}
                {ws.config.fields
                  .filter((f) => f.applies === "Project")
                  .map((f) => (
                    <label key={f.name} style={fieldLabel}>
                      {f.name}
                      <input
                        type={f.type === "Number" || f.type === "Currency" || f.type === "Percentage" ? "number" : f.type === "Date" ? "date" : f.type === "URL" ? "url" : "text"}
                        value={String(np.customFields[f.name] ?? "")}
                        onChange={(e) => upd({ customFields: { ...np.customFields, [f.name]: e.target.value } })}
                        style={fieldInput}
                      />
                    </label>
                  ))}
              </>
            )}
            {step === 4 && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "10px" }}>
                  <label style={fieldLabel}>
                    Budget ({ws.currency})
                    <input type="number" min={0} disabled={!canBudget} value={np.budget} onChange={(e) => upd({ budget: e.target.value })} style={fieldInput} />
                  </label>
                  <label style={fieldLabel}>
                    Billing type
                    <select value={np.billingType} onChange={(e) => upd({ billingType: e.target.value })} style={fieldSelect}>
                      {ws.config.billing.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div style={{ fontSize: "11.5px", color: "#667085" }}>{canBudget ? "Budget is a reference. Invoices and postings stay in Orders and Profit & Analytics." : "Your project role can’t set budgets (needs “Manage budgets”)."}</div>
              </>
            )}
            {step === 5 && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "10px" }}>
                  <label style={fieldLabel}>
                    Status
                    <select value={np.status} onChange={(e) => upd({ status: e.target.value })} style={fieldSelect}>
                      {statusOpts.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </label>
                  <label style={fieldLabel}>
                    Priority
                    <select value={np.priority} onChange={(e) => upd({ priority: e.target.value })} style={fieldSelect}>
                      {ws.config.priorities.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {!editing && (
                  <label style={fieldLabel}>
                    Template
                    <select value={np.templateId} onChange={(e) => upd({ templateId: e.target.value })} style={fieldSelect}>
                      <option value="">No template</option>
                      {ws.templates.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "12.5px", color: "#344054" }}>
                  <input type="checkbox" checked={np.requireClientApproval} onChange={() => upd({ requireClientApproval: !np.requireClientApproval })} />
                  Require client approval before completion
                </label>
              </>
            )}
            {step === 6 && (
              <>
                <div style={{ fontSize: "12px", color: "#475467" }}>Choose what should happen automatically on this project. Each one runs inside Noxtill and is recorded in the project activity feed.</div>
                {ws.config.hooks.map((a) => (
                  <label key={a.k} style={{ display: "flex", gap: "9px", alignItems: "center", fontSize: "12.5px", color: "#344054", border: "1px solid #F0F2F5", borderRadius: "10px", padding: "10px 12px" }}>
                    <input type="checkbox" checked={np.automationRefs.includes(a.k)} onChange={() => upd({ automationRefs: np.automationRefs.includes(a.k) ? np.automationRefs.filter((x) => x !== a.k) : [...np.automationRefs, a.k] })} />
                    <span style={{ flex: 1 }}>
                      <b>{a.k}</b> → {a.wf}
                    </span>
                    <span style={{ fontSize: "10.5px", fontWeight: 800, color: np.automationRefs.includes(a.k) ? "#067647" : "#667085", background: np.automationRefs.includes(a.k) ? "#ECFDF3" : "#F2F4F7", borderRadius: "5px", padding: "2px 6px" }}>{np.automationRefs.includes(a.k) ? "On" : "Off"}</span>
                  </label>
                ))}
              </>
            )}
            {step === 7 && (
              <>
                <div style={{ fontSize: "13px", fontWeight: 800, color: "#101828" }}>Review</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "9px" }}>
                  {review.map((r) => (
                    <div key={r.l} style={{ border: "1px solid #F0F2F5", borderRadius: "10px", padding: "9px 11px" }}>
                      <div style={{ fontSize: "11px", fontWeight: 700, color: "#98A2B3" }}>{r.l}</div>
                      <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>{r.v}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {err && (
              <div role="alert" style={errLine}>
                {err}
              </div>
            )}
          </div>
        </div>
        <div style={{ padding: "12px 20px", borderTop: "1px solid #F0F2F5", display: "flex", gap: "8px", alignItems: "center" }}>
          <button type="button" onClick={() => closeWithGuard()} style={{ border: 0, background: "none", color: "#475467", fontSize: "12.5px", fontWeight: 700, cursor: "pointer", padding: "10px" }}>
            Cancel
          </button>
          {!editing && (
            <button type="button" disabled={busy} onClick={() => void submit(true)} style={{ marginLeft: "auto", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "10px 14px", fontSize: "12.5px", fontWeight: 700, color: "#344054", cursor: "pointer" }}>
              Save draft
            </button>
          )}
          {step > 0 && (
            <button type="button" onClick={() => setStep(step - 1)} style={{ marginLeft: editing ? "auto" : undefined, border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "10px 14px", fontSize: "12.5px", fontWeight: 700, color: "#344054", cursor: "pointer" }}>
              Back
            </button>
          )}
          <button
            type="button"
            className="pt-primary"
            disabled={busy}
            onClick={() => {
              if (step === 0 && !np.name.trim()) return setTried(true);
              if (step === 2 && dateErr) return;
              if (step < 7) return setStep(step + 1);
              void submit(false);
            }}
            style={{ marginLeft: !editing && step === 0 ? undefined : editing && step === 0 ? "auto" : undefined, border: 0, background: "#12A150", color: "#fff", borderRadius: "10px", padding: "10px 16px", fontSize: "12.5px", fontWeight: 800, cursor: "pointer" }}
          >
            {busy ? "Saving…" : step === 7 ? (editing ? "Save changes" : "Create project") : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );

  function closeWithGuard() {
    const s = useProjectsStore.getState();
    if (s.npDirty) s.ask({ title: "You have unsaved changes", body: editing ? "Leaving now discards these edits." : "Leaving now discards this new project.", ok: "Discard", cancel: "Continue editing", danger: true, run: () => close() });
    else close();
  }
}
