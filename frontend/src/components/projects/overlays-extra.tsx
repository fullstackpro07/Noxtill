"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { aiAccept, aiPlan, aiStatus, createTask, createTemplate, fetchOverview, fetchTemplates, type Plan, type Workspace } from "@/lib/projects-api";
import { useProjectsInvalidate, useProjectsStore } from "./projects-store";
import { useProjectActions } from "./projects-actions";
import { tplMeta, tplType, useTemplateActions } from "./templates-view";
import { CloseBtn, Drawer, addD, days, errLine, errorText, fieldInput, fieldLabel, fieldSelect, fmt, footBtnGhost, footBtnPrimary, seg } from "./projects-ui";

/* ── Template preview ──────────────────────────────────────────────── */

export function TemplatePreviewDrawer({ ws, id }: { ws: Workspace; id: string }) {
  const close = useProjectsStore((s) => s.close);
  const open = useProjectsStore((s) => s.open);
  const a = useTemplateActions();
  const q = useQuery({ queryKey: ["projects-templates"], queryFn: fetchTemplates });
  const t = q.data?.find((x) => x.id === id);
  if (!t) return null;
  return (
    <Drawer
      label="Template preview"
      width={460}
      kicker={`${t.category} · ${t.businessType}`}
      title={<span style={{ fontSize: "15px" }}>{t.name}</span>}
      onClose={close}
      footer={
        t.status === "Published" && ws.me.can["Create projects"] ? (
          <button type="button" onClick={() => open({ kind: "np", templateId: t.id, type: tplType(t.category) })} style={footBtnPrimary}>
            Create project from template
          </button>
        ) : t.status === "Draft" && ws.me.can["Manage settings"] ? (
          <button type="button" onClick={() => a.publish(t.id)} style={{ ...footBtnPrimary, background: "#0A1B2A" }}>
            Publish template
          </button>
        ) : undefined
      }
    >
      <div style={{ fontSize: "12px", color: "#475467" }}>{tplMeta(t)}</div>
      {t.phases.map((ph, i) => (
        <div key={i} style={{ border: "1px solid #F0F2F5", borderRadius: "11px", padding: "10px 12px" }}>
          <div style={{ fontSize: "12.5px", fontWeight: 800, color: "#101828" }}>
            {ph.name} <span style={{ fontWeight: 500, color: "#98A2B3" }}>· {ph.days} days</span>
          </div>
          {ph.tasks.map((x, j) => (
            <div key={j} style={{ fontSize: "12px", color: "#344054", padding: "3px 0 0 10px" }}>
              • {x}
            </div>
          ))}
        </div>
      ))}
      <div style={{ fontSize: "12px", fontWeight: 800, color: "#101828" }}>Milestones</div>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {t.milestones.map((m) => (
          <span key={m} style={{ fontSize: "11.5px", color: "#067647", background: "#ECFDF3", borderRadius: "6px", padding: "3px 8px" }}>
            ◆ {m}
          </span>
        ))}
        {!t.milestones.length && <span style={{ fontSize: "12px", color: "#98A2B3" }}>None</span>}
      </div>
      <div style={{ fontSize: "12px", fontWeight: 800, color: "#101828" }}>Default roles</div>
      <div style={{ fontSize: "12px", color: "#475467" }}>{t.roles.join(", ") || "—"}</div>
      <div style={{ fontSize: "12px", fontWeight: 800, color: "#101828" }}>Dependencies</div>
      <div style={{ fontSize: "12px", color: "#475467" }}>{t.chain ? "Each phase starts after the previous one finishes" : "Phases are independent"}{t.taskChain ? " · tasks inside a phase run in order" : ""}</div>
      {t.docs && (
        <>
          <div style={{ fontSize: "12px", fontWeight: 800, color: "#101828" }}>Document references</div>
          <div style={{ fontSize: "12px", color: "#475467" }}>{t.docs}</div>
        </>
      )}
    </Drawer>
  );
}

/* ── 10-step template builder ─────────────────────────────────────── */

const TSTEPS = ["Identity", "Defaults", "Phases", "Tasks", "Milestones", "Dependencies", "Roles", "Files", "Automations", "Preview"];
const ROLES = ["Project Manager", "Designer", "Developer", "QA", "Operations", "Data", "Marketing", "Client contact"];

export function TemplateBuilderDrawer({ ws }: { ws: Workspace }) {
  const close = useProjectsStore((s) => s.close);
  const flash = useProjectsStore((s) => s.flash);
  const invalidate = useProjectsInvalidate();
  const [step, setStep] = useState(0);
  const [tried, setTried] = useState(false);
  const [tf, setTf] = useState({
    name: "",
    cat: "Client delivery",
    biz: "",
    billing: "Fixed",
    pri: "Medium",
    phases: [
      { name: "Discovery", days: 5, tasksTxt: "Kickoff, Requirements" },
      { name: "Delivery", days: 15, tasksTxt: "Build, Review" },
      { name: "Close", days: 3, tasksTxt: "Handover" },
    ],
    ms: "Sign-off",
    chain: true,
    taskChain: false,
    roles: ["Project Manager"],
    docs: "",
    hooks: [] as string[],
  });
  const err = tried && !tf.name.trim();
  const canPublish = ws.me.can["Manage settings"];
  const set = (p: Partial<typeof tf>) => setTf({ ...tf, ...p });
  const create = async (publish: boolean) => {
    if (!tf.name.trim()) {
      setTried(true);
      setStep(0);
      return;
    }
    try {
      await createTemplate({
        name: tf.name,
        category: tf.cat,
        businessType: tf.biz || "Any",
        billing: tf.billing,
        priority: tf.pri,
        phases: tf.phases.map((p) => ({ name: p.name, days: +p.days || 5, tasks: p.tasksTxt.split(",").map((x) => x.trim()).filter(Boolean) })),
        milestones: tf.ms.split(",").map((x) => x.trim()).filter(Boolean),
        roles: tf.roles,
        docs: tf.docs,
        hooks: tf.hooks,
        chain: tf.chain,
        taskChain: tf.taskChain,
        publish,
      });
      flash(publish ? "Template published" : "Template saved as draft — publish when ready");
      await invalidate();
      close();
    } catch (e) {
      flash(errorText(e));
    }
  };
  const chip = (on: boolean) => ({ border: `1px solid ${on ? "#12A150" : "#E6EAF0"}`, background: on ? "#E7F6EE" : "#fff", color: on ? "#0E8442" : "#475467", borderRadius: "20px", padding: "7px 12px", fontSize: "12px", fontWeight: 700, cursor: "pointer" });
  const review = [
    { l: "Name", v: tf.name || "— required" },
    { l: "Category", v: tf.cat },
    { l: "Phases", v: tf.phases.map((p) => p.name).join(" → ") || "—" },
    { l: "Tasks", v: tf.phases.reduce((a, p) => a + p.tasksTxt.split(",").filter((x) => x.trim()).length, 0) + " tasks" },
    { l: "Duration", v: tf.phases.reduce((a, p) => a + (+p.days || 0), 0) + " days" },
    { l: "Milestones", v: tf.ms || "—" },
    { l: "Dependencies", v: tf.chain ? "Phases Finish-to-Start" : "None" },
    { l: "Roles", v: tf.roles.join(", ") || "—" },
    { l: "Documents", v: tf.docs || "None" },
    { l: "Automations", v: tf.hooks.join(", ") || "None" },
  ];
  return (
    <Drawer
      label="New template"
      width={440}
      title="New template"
      onClose={close}
      footer={
        <>
          {step > 0 && (
            <button type="button" onClick={() => setStep(step - 1)} style={footBtnGhost}>
              Back
            </button>
          )}
          <button type="button" onClick={() => void create(false)} style={footBtnGhost}>
            Save draft
          </button>
          {step < 9 ? (
            <button
              type="button"
              onClick={() => {
                if (step === 0 && !tf.name.trim()) return setTried(true);
                setStep(step + 1);
              }}
              style={footBtnPrimary}
            >
              Continue
            </button>
          ) : (
            <button type="button" disabled={!canPublish} title={canPublish ? undefined : "Publishing needs “Manage settings”"} onClick={() => void create(true)} style={{ ...footBtnPrimary, opacity: canPublish ? 1 : 0.6 }}>
              Publish template
            </button>
          )}
        </>
      }
    >
      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
        {TSTEPS.map((l, i) => (
          <button key={l} type="button" onClick={() => setStep(i)} style={{ border: `1px solid ${step === i ? "#12A150" : "#E6EAF0"}`, background: step === i ? "#E7F6EE" : "#fff", color: step === i ? "#0E8442" : "#667085", borderRadius: "20px", padding: "4px 9px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>
            {i + 1}. {l}
          </button>
        ))}
      </div>
      {step === 0 && (
        <>
          <label style={fieldLabel}>
            Template name *
            <input value={tf.name} onChange={(e) => set({ name: e.target.value })} style={{ ...fieldInput, border: `1px solid ${err ? "#F04438" : "#E6EAF0"}` }} autoFocus />
          </label>
          {err && (
            <div role="alert" style={errLine}>
              Name the template.
            </div>
          )}
          <label style={fieldLabel}>
            Category
            <select value={tf.cat} onChange={(e) => set({ cat: e.target.value })} style={fieldSelect}>
              {["Client delivery", "Internal", "Marketing", "Operations", "Development"].map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <label style={fieldLabel}>
            Business type
            <input value={tf.biz} onChange={(e) => set({ biz: e.target.value })} placeholder="e.g. Salons, Retail" style={fieldInput} />
          </label>
        </>
      )}
      {step === 1 && (
        <>
          <label style={fieldLabel}>
            Default billing type
            <select value={tf.billing} onChange={(e) => set({ billing: e.target.value })} style={fieldSelect}>
              {ws.config.billing.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <label style={fieldLabel}>
            Default priority
            <select value={tf.pri} onChange={(e) => set({ pri: e.target.value })} style={fieldSelect}>
              {ws.config.priorities.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
        </>
      )}
      {step === 2 && (
        <>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#344054" }}>Phases</div>
          {tf.phases.map((p, i) => (
            <div key={i} style={{ display: "flex", gap: "6px" }}>
              <input value={p.name} onChange={(e) => set({ phases: tf.phases.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} aria-label="Phase name" style={{ flex: 1, height: "38px", border: "1px solid #E6EAF0", borderRadius: "9px", padding: "0 10px", fontSize: "12.5px" }} />
              <input type="number" min={1} value={p.days} onChange={(e) => set({ phases: tf.phases.map((x, j) => (j === i ? { ...x, days: +e.target.value } : x)) })} aria-label="Days" style={{ width: "70px", height: "38px", border: "1px solid #E6EAF0", borderRadius: "9px", padding: "0 8px", fontSize: "12.5px" }} />
              <button type="button" aria-label="Remove phase" onClick={() => set({ phases: tf.phases.filter((_, j) => j !== i) })} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "9px", width: "38px", cursor: "pointer", color: "#667085" }}>
                ×
              </button>
            </div>
          ))}
          <button type="button" onClick={() => set({ phases: [...tf.phases, { name: "New phase", days: 5, tasksTxt: "" }] })} style={{ alignSelf: "flex-start", border: "1px dashed #12A150", background: "#fff", borderRadius: "9px", padding: "7px 12px", fontSize: "12px", fontWeight: 700, color: "#0E8442", cursor: "pointer" }}>
            + Add phase
          </button>
        </>
      )}
      {step === 3 &&
        tf.phases.map((p, i) => (
          <label key={i} style={fieldLabel}>
            {p.name} — tasks (comma-separated, use “&gt;” for subtasks)
            <input value={p.tasksTxt} onChange={(e) => set({ phases: tf.phases.map((x, j) => (j === i ? { ...x, tasksTxt: e.target.value } : x)) })} style={{ height: "38px", border: "1px solid #E6EAF0", borderRadius: "9px", padding: "0 10px", fontSize: "12.5px" }} />
          </label>
        ))}
      {step === 4 && (
        <label style={fieldLabel}>
          Milestones (comma-separated)
          <input value={tf.ms} onChange={(e) => set({ ms: e.target.value })} style={fieldInput} />
        </label>
      )}
      {step === 5 && (
        <>
          <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "12.5px", color: "#344054" }}>
            <input type="checkbox" checked={tf.chain} onChange={() => set({ chain: !tf.chain })} />
            Each phase starts after the previous one finishes (Finish-to-Start)
          </label>
          <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "12.5px", color: "#344054" }}>
            <input type="checkbox" checked={tf.taskChain} onChange={() => set({ taskChain: !tf.taskChain })} />
            Tasks inside a phase run in order
          </label>
        </>
      )}
      {step === 6 && (
        <>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#344054" }}>Default roles</div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {ROLES.map((r) => (
              <button key={r} type="button" onClick={() => set({ roles: tf.roles.includes(r) ? tf.roles.filter((x) => x !== r) : [...tf.roles, r] })} style={chip(tf.roles.includes(r))}>
                {r}
              </button>
            ))}
          </div>
        </>
      )}
      {step === 7 && (
        <>
          <label style={fieldLabel}>
            Default document references
            <input value={tf.docs} onChange={(e) => set({ docs: e.target.value })} placeholder="e.g. Standard SOW, Kickoff deck" style={fieldInput} />
          </label>
          <div style={{ fontSize: "11.5px", color: "#667085" }}>Saved as text references. There is no Documents module to link them to yet.</div>
        </>
      )}
      {step === 8 && (
        <>
          {ws.config.hooks.map((h) => (
            <label key={h.k} style={{ display: "flex", gap: "9px", alignItems: "center", fontSize: "12.5px", color: "#344054", border: "1px solid #F0F2F5", borderRadius: "10px", padding: "10px 12px" }}>
              <input type="checkbox" checked={tf.hooks.includes(h.k)} onChange={() => set({ hooks: tf.hooks.includes(h.k) ? tf.hooks.filter((x) => x !== h.k) : [...tf.hooks, h.k] })} />
              <span>
                <b>{h.k}</b> → {h.wf}
              </span>
            </label>
          ))}
          <div style={{ fontSize: "11.5px", color: "#667085" }}>Projects created from this template switch these automations on. Each runs inside Noxtill and is logged in the project’s activity.</div>
        </>
      )}
      {step === 9 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "9px" }}>
          {review.map((r) => (
            <div key={r.l} style={{ border: "1px solid #F0F2F5", borderRadius: "10px", padding: "9px 11px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#98A2B3" }}>{r.l}</div>
              <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#101828" }}>{r.v}</div>
            </div>
          ))}
        </div>
      )}
    </Drawer>
  );
}

/* ── AI assistant ──────────────────────────────────────────────────── */

const SEV: Record<string, { bg: string; fg: string; label: string }> = { HIGH: { bg: "#FEF3F2", fg: "#B42318", label: "HIGH" }, MED: { bg: "#FEF6E7", fg: "#B54708", label: "MEDIUM" }, LOW: { bg: "#F2F4F7", fg: "#475467", label: "LOW" } };

export function AiDrawer({ ws, tab: initTab, projectId }: { ws: Workspace; tab: "plan" | "risk" | "status"; projectId?: string }) {
  const router = useRouter();
  const close = useProjectsStore((s) => s.close);
  const ask = useProjectsStore((s) => s.ask);
  const flash = useProjectsStore((s) => s.flash);
  const open = useProjectsStore((s) => s.open);
  const setTaskFilters = useProjectsStore((s) => s.setTaskFilters);
  const scope = useProjectsStore((s) => s.scope);
  const invalidate = useProjectsInvalidate();
  const live = ws.projects.filter((p) => !p.archivedAt && p.status !== "Archived" && p.statusCat !== "Done");
  const [tab, setTab] = useState(initTab);
  const [pid, setPid] = useState(projectId && live.some((p) => p.id === projectId) ? projectId : live[0]?.id ?? "");
  const [goal, setGoal] = useState("");
  const [due, setDue] = useState(live.find((p) => p.id === pid)?.dueDate ?? addD(ws.today, 60));
  const [cons, setCons] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [src, setSrc] = useState("");
  const [aud, setAud] = useState<"Internal" | "Client">("Internal");
  const [edited, setEdited] = useState<{ key: string; text: string } | null>(null);
  const risks = useQuery({ queryKey: ["projects-overview", "This Month", scope], queryFn: () => fetchOverview("This Month", scope), enabled: tab === "risk" });
  const status = useQuery({ queryKey: ["projects-ai-status", pid, aud], queryFn: () => aiStatus(pid, aud), enabled: tab === "status" && !!pid });

  const start = addD(ws.today, 1);
  const spread = useMemo(() => {
    if (!plan) return [];
    const tot = plan.phases.reduce((a, p) => a + p.days, 0) || 1;
    const span = Math.max(days(due || addD(start, tot), start), tot);
    let cur = 0;
    return plan.phases.map((p, pi) => {
      const a = cur;
      cur += (p.days / tot) * span;
      return { ...p, pi, s: addD(start, Math.round(a)), e: addD(start, Math.max(Math.round(cur) - 1, Math.round(a))) };
    });
  }, [plan, due, start]);
  const taskN = plan ? plan.phases.reduce((a, p) => a + p.tasks.length, 0) : 0;
  const project = ws.projects.find((p) => p.id === pid);

  const generate = async () => {
    if (!goal.trim()) return setErr("Describe the goal and scope first.");
    setBusy(true);
    setErr("");
    try {
      const r = await aiPlan({ projectId: pid, goal, due, constraints: cons });
      setPlan(r.plan);
      setSrc(r.source);
    } catch (e) {
      setErr(errorText(e));
    }
    setBusy(false);
  };
  const accept = () =>
    plan &&
    ask({
      title: `Add ${taskN} tasks to ${project?.name ?? "the project"}?`,
      body: `Creates ${taskN} tasks and ${plan.ms.length} milestone${plan.ms.length === 1 ? "" : "s"} as To Do. Owners are suggestions — reassign any time. Nothing is marked complete.`,
      ok: "Create tasks",
      cancel: "Keep reviewing",
      run: async () => {
        try {
          const r = await aiAccept({ projectId: pid, plan, due });
          flash(`${r.tasks} tasks and ${r.milestones} milestones added to ${project?.name}`);
          await invalidate();
          useProjectsStore.getState().setDtab("tasks");
          close();
          router.push(`/projects/${pid}`);
        } catch (e) {
          flash(errorText(e));
        }
      },
    });
  const draftKey = `${pid}|${aud}`;
  const txt = edited && edited.key === draftKey ? edited.text : status.data?.text ?? "";
  const projSel = (
    <label style={fieldLabel}>
      {tab === "plan" ? "Add the plan to" : "Project"}
      <select
        value={pid}
        onChange={(e) => {
          setPid(e.target.value);
          const d = live.find((p) => p.id === e.target.value)?.dueDate;
          if (d) setDue(d);
        }}
        style={fieldSelect}
      >
        {live.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <aside data-drawer="1" role="dialog" aria-label="AI project assistant" style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "520px", background: "#fff", zIndex: 95, boxShadow: "-12px 0 40px rgba(16,24,40,.14)", display: "flex", flexDirection: "column", animation: "nxdr .28s ease" }}>
      <div style={{ padding: "16px 18px", borderBottom: "1px solid #F0F2F5", display: "flex", gap: "10px", alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "#101828" }}>AI project assistant</div>
          <div style={{ fontSize: "11.5px", color: "#667085" }}>Suggests only. Nothing is created, changed or sent until you confirm.</div>
        </div>
        <CloseBtn onClick={close} />
      </div>
      <div style={{ display: "flex", gap: "2px", padding: "0 14px", borderBottom: "1px solid #F0F2F5" }}>
        {(
          [
            ["plan", "Generate plan"],
            ["risk", "Risks"],
            ["status", "Status update"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} style={{ border: 0, background: "none", padding: "10px 11px", fontSize: "12.5px", fontWeight: tab === k ? 800 : 600, color: tab === k ? "#0E8442" : "#475467", borderBottom: `2.5px solid ${tab === k ? "#12A150" : "transparent"}`, cursor: "pointer" }}>
            {l}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {!live.length && tab !== "risk" && <div style={{ fontSize: "12.5px", color: "#667085" }}>Create a project first — plans and status updates are built for a project.</div>}
        {tab === "plan" && live.length > 0 && (
          <>
            {projSel}
            <label style={fieldLabel}>
              Project goal and scope
              <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={4} placeholder="e.g. Launch a loyalty program for repeat customers with a points app and in-store signage" style={{ border: "1px solid #E6EAF0", borderRadius: "9px", padding: "9px 11px", fontSize: "13px", resize: "vertical" }} />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "10px" }}>
              <label style={fieldLabel}>
                Deadline
                <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={fieldSelect} />
              </label>
              <label style={fieldLabel}>
                Constraints
                <input value={cons} onChange={(e) => setCons(e.target.value)} placeholder="e.g. 3 people, no weekend work" style={fieldInput} />
              </label>
            </div>
            <button type="button" disabled={busy} onClick={() => void generate()} style={{ border: 0, background: "#12A150", color: "#fff", borderRadius: "10px", padding: "11px", fontSize: "12.5px", fontWeight: 800, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
              {busy ? "Drafting plan…" : plan ? "Regenerate plan" : "Generate plan"}
            </button>
            {err && (
              <div role="alert" style={errLine}>
                {err}
              </div>
            )}
            {plan && (
              <>
                <div style={{ background: "#F3FBF6", border: "1px solid #D1F2DE", borderRadius: "11px", padding: "10px 12px", fontSize: "11.5px", color: "#344054", lineHeight: 1.5 }}>
                  <b>
                    Proposed plan · {plan.phases.length} phases · {taskN} tasks · {plan.ms.length} milestones
                  </b>
                  <br />
                  Source: {src}. Assumptions: owners are suggested by role and dates are spread evenly to the deadline. Review before accepting.
                </div>
                {spread.map((ph) => (
                  <div key={ph.pi} style={{ border: "1px solid #F0F2F5", borderRadius: "11px", padding: "10px 12px", display: "flex", flexDirection: "column", gap: "5px" }}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <b style={{ flex: 1, fontSize: "12.5px", color: "#101828" }}>{ph.name}</b>
                      <span style={{ fontSize: "11px", color: "#667085" }}>
                        {fmt(ph.s).slice(0, 5)} → {fmt(ph.e).slice(0, 5)}
                      </span>
                    </div>
                    {ph.tasks.map((t, i) => (
                      <div key={i} style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "12px", color: "#344054", paddingLeft: "6px" }}>
                        <span style={{ flex: 1 }}>• {t.title}</span>
                        <span style={{ fontSize: "11px", color: "#98A2B3" }}>
                          {t.role} · {t.est}h
                        </span>
                        <button
                          type="button"
                          aria-label="Remove task"
                          onClick={() => setPlan({ ...plan, phases: plan.phases.map((p, j) => (j === ph.pi ? { ...p, tasks: p.tasks.filter((_, k) => k !== i) } : p)).filter((p) => p.tasks.length) })}
                          style={{ border: 0, background: "none", color: "#98A2B3", cursor: "pointer", fontSize: "13px" }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {plan.ms.map((m) => (
                    <span key={m} style={{ fontSize: "11.5px", color: "#067647", background: "#ECFDF3", borderRadius: "6px", padding: "3px 8px" }}>
                      ◆ {m}
                    </span>
                  ))}
                </div>
              </>
            )}
          </>
        )}
        {tab === "risk" && (
          <>
            {risks.isLoading && <div style={{ fontSize: "12.5px", color: "#667085" }}>Checking tasks, milestones, budgets and workload…</div>}
            {(risks.data?.risks ?? []).map((r, i) => (
              <div key={i} style={{ border: "1px solid #F0F2F5", borderRadius: "11px", padding: "11px 12px", display: "flex", flexDirection: "column", gap: "7px" }}>
                <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                  <span style={{ fontSize: "10px", fontWeight: 800, color: SEV[r.sev].fg, background: SEV[r.sev].bg, borderRadius: "5px", padding: "2px 6px", flex: "0 0 auto" }}>{SEV[r.sev].label}</span>
                  <span style={{ fontSize: "12.5px", fontWeight: 700, color: "#101828", lineHeight: 1.45 }}>
                    {r.t} — {r.d}
                  </span>
                </div>
                <div style={{ fontSize: "11.5px", color: "#475467", lineHeight: 1.5 }}>
                  Evidence: {r.ev} · Confidence: {r.conf}
                </div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  <button type="button" onClick={() => r.pid && open({ kind: "qp", id: r.pid })} style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "8px", padding: "6px 10px", fontSize: "11.5px", fontWeight: 700, color: "#344054", cursor: "pointer" }}>
                    View evidence
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTaskFilters({ tview: r.view, tq: "" });
                      close();
                      router.push("/projects/tasks");
                    }}
                    style={{ border: "1px solid #E6EAF0", background: "#fff", borderRadius: "8px", padding: "6px 10px", fontSize: "11.5px", fontWeight: 700, color: "#344054", cursor: "pointer" }}
                  >
                    Review tasks
                  </button>
                  {ws.me.can["Create tasks"] && r.pid && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const p = ws.projects.find((x) => x.id === r.pid);
                          const t = await createTask({ projectId: r.pid, title: ("Resolve: " + r.t).slice(0, 200), priority: r.sev === "HIGH" ? "High" : "Medium", assigneeId: p?.managerId ?? undefined, dueDate: addD(ws.today, 3), estimateMins: 120, description: "Action from AI risk review. Evidence: " + r.ev });
                          flash(`${t.number} created from risk`);
                          await invalidate();
                        } catch (e) {
                          flash(errorText(e));
                        }
                      }}
                      style={{ border: 0, background: "#12A150", color: "#fff", borderRadius: "8px", padding: "6px 10px", fontSize: "11.5px", fontWeight: 800, cursor: "pointer" }}
                    >
                      Create action
                    </button>
                  )}
                </div>
              </div>
            ))}
            {risks.data && !risks.data.risks.length && <div style={{ fontSize: "12.5px", color: "#667085" }}>No risks found in project, task, time and budget records.</div>}
            <div style={{ fontSize: "11px", color: "#98A2B3" }}>Risks are computed from records (blockers, dependencies, budgets, estimates vs scheduled shifts) — not guessed.</div>
          </>
        )}
        {tab === "status" && live.length > 0 && (
          <>
            {projSel}
            <div style={{ display: "flex", gap: "4px", border: "1px solid #E6EAF0", borderRadius: "10px", padding: "3px", alignSelf: "flex-start" }}>
              {(["Internal", "Client"] as const).map((k) => (
                <button key={k} type="button" onClick={() => setAud(k)} style={{ border: 0, borderRadius: "7px", padding: "6px 10px", fontSize: "11.5px", fontWeight: 700, cursor: "pointer", ...seg(aud === k) }}>
                  {k}
                </button>
              ))}
            </div>
            <textarea value={status.isLoading ? "Building the draft…" : txt} onChange={(e) => setEdited({ key: draftKey, text: e.target.value })} rows={12} aria-label="Status update draft" style={{ border: "1px solid #E6EAF0", borderRadius: "10px", padding: "11px 12px", fontSize: "12.5px", lineHeight: 1.6, resize: "vertical" }} />
            <div style={{ fontSize: "11.5px", color: "#667085" }}>Built only from recorded tasks, milestones and blockers. Client drafts leave out budget, overdue counts and internal tasks. Sending happens from Unified Inbox after you review.</div>
          </>
        )}
      </div>
      <div style={{ padding: "12px 18px", borderTop: "1px solid #F0F2F5", display: "flex", gap: "8px" }}>
        {tab === "plan" && plan && taskN > 0 && (
          <>
            <button type="button" onClick={accept} style={footBtnPrimary}>
              Accept plan · create {taskN} tasks
            </button>
            <button type="button" onClick={() => void generate()} style={footBtnGhost}>
              Regenerate
            </button>
          </>
        )}
        {tab === "status" && txt && (
          <>
            <button
              type="button"
              onClick={() =>
                void navigator.clipboard?.writeText(txt).then(
                  () => flash("Draft copied"),
                  () => flash("Copy not available — select the text manually"),
                )
              }
              style={footBtnPrimary}
            >
              Copy draft
            </button>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(txt).catch(() => undefined);
                close();
                router.push("/unified-inbox");
                flash("Draft copied — paste it into the conversation. Nothing is sent automatically.");
              }}
              style={footBtnGhost}
            >
              Open in Unified Inbox
            </button>
          </>
        )}
      </div>
    </aside>
  );
}

/* ── Command palette ───────────────────────────────────────────────── */

export function CommandPalette({ ws }: { ws: Workspace }) {
  const router = useRouter();
  const setPalette = useProjectsStore((s) => s.setPalette);
  const open = useProjectsStore((s) => s.open);
  const setTaskFilters = useProjectsStore((s) => s.setTaskFilters);
  const act = useProjectActions(ws);
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const go = (href: string) => () => router.push(href);
  const pq = q.trim().toLowerCase();
  const m = (x: string) => !pq || x.toLowerCase().includes(pq);
  const cmds: Array<[string, string, () => void]> = [
    ["New Project", "P", () => open({ kind: "np" })],
    ["New Task", "C", () => void act.newTask()],
    ["Open My Tasks", "", () => { setTaskFilters({ tview: "My Tasks", tq: "" }); router.push("/projects/tasks"); }],
    ["Open Overdue Tasks", "", () => { setTaskFilters({ tview: "Overdue", tq: "" }); router.push("/projects/tasks"); }],
    ["Open Task Board", "", go("/projects/board")],
    ["Open Projects", "", go("/projects/all")],
    ["Open Calendar", "", go("/projects/calendar")],
    ["Open Timeline", "", go("/projects/timeline")],
    ["Open Milestones", "", go("/projects/milestones")],
    ["Add Milestone", "", () => open({ kind: "msnew" })],
    ["Open Time Tracking", "", go("/projects/time")],
    ["Open Reports", "", go("/projects/reports")],
  ];
  const items: Array<{ head: string; label: string; sub: string; run: () => void }> = [];
  cmds.filter((c) => m(c[0])).forEach((c, k) => items.push({ head: k === 0 ? "Commands" : "", label: c[0], sub: c[1], run: c[2] }));
  ws.projects
    .filter((p) => m(p.name + p.number + (p.customerName ?? "")))
    .slice(0, 5)
    .forEach((p, k) => items.push({ head: k === 0 ? "Projects" : "", label: p.name, sub: p.number, run: go(`/projects/${p.id}`) }));
  if (pq) {
    ws.tasks
      .filter((t) => m(t.title + t.number))
      .slice(0, 5)
      .forEach((t, k) => items.push({ head: k === 0 ? "Tasks" : "", label: t.title, sub: t.number, run: () => open({ kind: "task", id: t.id }) }));
    ws.people
      .filter((p) => m(p.name))
      .forEach((p, k) => items.push({ head: k === 0 ? "People" : "", label: p.name, sub: "Show tasks", run: () => { setTaskFilters({ tview: "All Tasks", tq: p.name }); router.push("/projects/tasks"); } }));
  }
  const pi = Math.min(i, Math.max(items.length - 1, 0));
  const runAt = (k: number) => {
    const it = items[k];
    setPalette(false);
    if (it) it.run();
  };
  return (
    <div role="dialog" aria-label="Command palette" style={{ position: "fixed", inset: 0, zIndex: 97, display: "flex", justifyContent: "center", padding: "80px 16px", pointerEvents: "none" }}>
      <div style={{ pointerEvents: "auto", width: "100%", maxWidth: "600px", maxHeight: "70vh", background: "#fff", borderRadius: "14px", boxShadow: "0 30px 80px rgba(16,24,40,.28)", display: "flex", flexDirection: "column", overflow: "hidden", animation: "nxin .2s ease", alignSelf: "flex-start" }}>
        <input
          ref={ref}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setI(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setI(Math.min(pi + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setI(Math.max(pi - 1, 0));
            } else if (e.key === "Enter") runAt(pi);
          }}
          placeholder="Type a command or search projects, tasks, people…"
          aria-label="Command"
          style={{ border: 0, borderBottom: "1px solid #F0F2F5", padding: "16px 18px", fontSize: "14px", outline: "none" }}
        />
        <div style={{ overflow: "auto", padding: "6px" }}>
          {items.map((p, k) => (
            <div key={k}>
              {p.head && <div style={{ padding: "9px 12px 4px", fontSize: "10.5px", fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase", color: "#98A2B3" }}>{p.head}</div>}
              <button type="button" onClick={() => runAt(k)} onMouseEnter={() => setI(k)} style={{ width: "100%", border: 0, textAlign: "left", background: k === pi ? "#F3FBF6" : "transparent", borderRadius: "9px", padding: "9px 12px", fontSize: "13px", color: "#101828", cursor: "pointer", display: "flex", gap: "10px", alignItems: "center" }}>
                <span style={{ flex: 1, fontWeight: 600 }}>{p.label}</span>
                <span style={{ fontSize: "11px", color: "#98A2B3" }}>{p.sub}</span>
              </button>
            </div>
          ))}
          {!items.length && <div style={{ padding: "22px", textAlign: "center", fontSize: "12.5px", color: "#667085" }}>No matches.</div>}
        </div>
        <div style={{ borderTop: "1px solid #F0F2F5", padding: "8px 14px", fontSize: "11px", color: "#98A2B3", display: "flex", gap: "14px" }}>
          <span>↑↓ navigate</span>
          <span>Enter open</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  );
}
