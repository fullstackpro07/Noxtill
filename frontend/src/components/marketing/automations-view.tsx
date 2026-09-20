"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import {
  fetchWorkflows,
  createWorkflow,
  updateWorkflow,
  testWorkflow,
  WORKFLOW_TRIGGER_KEYS,
  WORKFLOW_TRIGGER_LABELS,
  WORKFLOW_TRIGGER_FIELDS,
  WORKFLOW_CONDITION_OPERATORS,
  WORKFLOW_CONDITION_OPERATOR_LABELS,
  type Workflow,
  type WorkflowCondition,
  type WorkflowAction,
  type WorkflowTriggerKey,
  type WorkflowActionType,
  type WorkflowTestResult,
} from "@/lib/workflows-api";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";

const CONDITION_OP_SYMBOL: Record<string, string> = {
  eq: "is",
  neq: "is not",
  gt: "is greater than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
  contains: "contains",
};

function describeConditions(w: Workflow): string {
  if (w.conditions.length === 0) return "Always";
  return w.conditions.map((c) => `${c.field} ${CONDITION_OP_SYMBOL[c.operator] ?? c.operator} ${c.value}`).join(" AND ");
}
function describeActions(w: Workflow): string {
  return w.actions.map((a) => (a.type === "notify_owner" ? "Notify Owner" : "Send Message")).join(" + ");
}

export function AutomationsView() {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Workflow | null>(null);
  const [testing, setTesting] = useState<Workflow | null>(null);
  const [triggerFilter, setTriggerFilter] = useState("All triggers");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const queryClient = useQueryClient();

  const { data: workflows = [] } = useQuery({ queryKey: ["workflows"], queryFn: fetchWorkflows });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => updateWorkflow(id, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflows"] }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this automation."),
  });
  const pauseAllMutation = useMutation({
    mutationFn: () => Promise.all(workflows.filter((w) => w.active).map((w) => updateWorkflow(w.id, { active: false }))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      toast.success("All automations paused.");
    },
  });

  const activeCount = workflows.filter((w) => w.active).length;
  const totalSent = workflows.reduce((a, w) => a + w.sentCount, 0);
  const minutesSavedPerSend = 2;
  const hoursSaved = Math.round((totalSent * minutesSavedPerSend) / 60);

  const filtered = workflows.filter((w) => {
    if (triggerFilter !== "All triggers" && WORKFLOW_TRIGGER_LABELS[w.triggerKey] !== triggerFilter) return false;
    if (statusFilter === "Active" && !w.active) return false;
    if (statusFilter === "Paused" && w.active) return false;
    return true;
  });

  const topBySent = [...workflows].sort((a, b) => b.sentCount - a.sentCount).slice(0, 5);
  const maxSent = Math.max(1, ...topBySent.map((w) => w.sentCount));

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[10px]">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Automations</h2>
        <span className="rounded-full text-[12px] font-extrabold" style={{ color: "var(--app-success-text)", background: "var(--app-success-bg)", padding: "3px 10px" }}>{activeCount} active</span>
        <div className="ml-auto flex flex-wrap gap-[9px]">
          <button type="button" onClick={() => pauseAllMutation.mutate()} disabled={activeCount === 0} className="rounded-[11px] text-[12.5px] font-bold disabled:opacity-40" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", padding: "11px 15px", minHeight: 44 }}>
            Pause All
          </button>
          <button type="button" onClick={() => setTesting(workflows[0] ?? null)} disabled={workflows.length === 0} className="rounded-[11px] text-[12.5px] font-bold disabled:opacity-40" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", padding: "11px 15px", minHeight: 44 }}>
            Test
          </button>
          <button type="button" onClick={() => setCreating(true)} className="rounded-[11px] text-[12.5px] font-extrabold text-white" style={{ background: "var(--app-primary)", padding: "11px 18px", minHeight: 44 }}>
            New Automation
          </button>
        </div>
      </div>

      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        <div className="rounded-[14px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 15 }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Active Automations</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{activeCount}</div>
        </div>
        <div className="rounded-[14px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 15 }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Messages Sent</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{totalSent}</div>
        </div>
        <div className="rounded-[14px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 15 }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Revenue Attributed</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text-disabled)" }}>—</div>
        </div>
        <div className="rounded-[14px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 15 }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Time Saved — estimate</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>~{hoursSaved} hours</div>
          <div className="mt-1 text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>Rough estimate, not measured</div>
        </div>
      </div>

      <div className="rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 17 }}>
        <h3 className="m-0 mb-1.5 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Automation performance</h3>
        {topBySent.length === 0 ? (
          <div className="flex h-[134px] items-center justify-center text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>No automations yet.</div>
        ) : (
          <svg viewBox="0 0 620 134" style={{ width: "100%", height: 134, display: "block" }}>
            {topBySent.map((w, i) => {
              const slot = (620 - 44) / topBySent.length;
              const h = (w.sentCount / maxSent) * 96;
              const x = 34 + i * slot + slot * 0.18;
              const width = slot * 0.6;
              return (
                <g key={w.id}>
                  <rect x={x} y={112 - h} width={width} height={h} rx={5} fill="#C7D7FE" />
                  <text x={x + width / 2} y={128} textAnchor="middle" fontSize={10.5} fill="#667085" fontWeight={600}>{w.name.length > 12 ? `${w.name.slice(0, 12)}…` : w.name}</text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap gap-2" style={{ padding: "13px 17px", borderBottom: "1px solid var(--app-surface-2)" }}>
          <select value={triggerFilter} onChange={(e) => setTriggerFilter(e.target.value)} aria-label="Trigger type" className="rounded-[10px] text-[12.5px] font-semibold" style={{ border: "1px solid var(--app-border)", padding: "9px 11px", color: "var(--app-text-muted)", minHeight: 42 }}>
            <option>All triggers</option>
            {WORKFLOW_TRIGGER_KEYS.map((k) => (
              <option key={k}>{WORKFLOW_TRIGGER_LABELS[k]}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status" className="rounded-[10px] text-[12.5px] font-semibold" style={{ border: "1px solid var(--app-border)", padding: "9px 11px", color: "var(--app-text-muted)", minHeight: 42 }}>
            <option>All statuses</option>
            <option>Active</option>
            <option>Paused</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center" style={{ padding: "52px 18px" }}>
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Set up aftercare, rebooking nudges and birthday greetings — they run without you</div>
            <button type="button" onClick={() => setCreating(true)} className="mt-[15px] rounded-[12px] text-[13px] font-extrabold text-white" style={{ background: "var(--app-primary)", padding: "12px 22px", minHeight: 46 }}>
              New Automation
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 1040 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Name</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Trigger</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Condition</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Action</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Sent</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Active</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Last Fired</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((w) => (
                  <tr key={w.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                    <td style={{ padding: "12px 17px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text)" }}>{w.name}</td>
                    <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-faint)" }}>{WORKFLOW_TRIGGER_LABELS[w.triggerKey]}</td>
                    <td style={{ padding: 12, fontSize: 12, color: "var(--app-text-faintest)" }}>{describeConditions(w)}</td>
                    <td style={{ padding: 12, fontSize: 12, color: "var(--app-text-faintest)" }}>{describeActions(w)}</td>
                    <td style={{ padding: 12, fontSize: 12.5, fontWeight: 700, color: "var(--app-text)", textAlign: "right" }}>{w.sentCount}</td>
                    <td style={{ padding: 12 }}>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={w.active}
                        aria-label={`Toggle ${w.name}`}
                        onClick={() => toggleMutation.mutate({ id: w.id, active: !w.active })}
                        style={{ width: 38, height: 21, border: 0, borderRadius: 20, background: w.active ? "var(--app-primary)" : "#D5DCE4", position: "relative", cursor: "pointer" }}
                      >
                        <span style={{ position: "absolute", top: 2, left: w.active ? 19 : 2, width: 17, height: 17, borderRadius: "50%", background: "#fff", transition: "left .15s ease" }} />
                      </button>
                    </td>
                    <td style={{ padding: 12, fontSize: 12, color: "var(--app-text-disabled)", whiteSpace: "nowrap" }}>{w.lastFiredAt ? formatDate(w.lastFiredAt) : "Never"}</td>
                    <td style={{ padding: "12px 17px", textAlign: "right" }}>
                      <span className="inline-flex gap-[7px]">
                        <button type="button" onClick={() => setTesting(w)} className="rounded-[9px] text-[11.5px] font-bold" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", padding: "8px 11px", minHeight: 40 }}>
                          Test
                        </button>
                        <button type="button" onClick={() => setEditing(w)} className="rounded-[9px] text-[11.5px] font-bold" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", padding: "8px 11px", minHeight: 40 }}>
                          Edit
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(creating || editing) && <WorkflowFormDialog workflow={editing ?? undefined} onClose={() => (editing ? setEditing(null) : setCreating(false))} />}
      {testing && <TestDialog workflow={testing} onClose={() => setTesting(null)} />}
    </main>
  );
}

function ConditionsEditor({ triggerKey, conditions, onChange }: { triggerKey: WorkflowTriggerKey; conditions: WorkflowCondition[]; onChange: (c: WorkflowCondition[]) => void }) {
  const fields = WORKFLOW_TRIGGER_FIELDS[triggerKey];
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-[12px] font-bold" style={{ color: "var(--app-text)" }}>Conditions (all must match — optional)</p>
      {conditions.map((c, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1.5">
          <select value={c.field} onChange={(e) => onChange(conditions.map((x, idx) => (idx === i ? { ...x, field: e.target.value } : x)))} className="rounded-[9px] p-2 text-[12px]" style={{ border: "1px solid var(--app-border)" }}>
            {fields.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <select value={c.operator} onChange={(e) => onChange(conditions.map((x, idx) => (idx === i ? { ...x, operator: e.target.value as WorkflowCondition["operator"] } : x)))} className="rounded-[9px] p-2 text-[12px]" style={{ border: "1px solid var(--app-border)" }}>
            {WORKFLOW_CONDITION_OPERATORS.map((op) => (
              <option key={op} value={op}>{WORKFLOW_CONDITION_OPERATOR_LABELS[op]}</option>
            ))}
          </select>
          <input value={String(c.value)} onChange={(e) => onChange(conditions.map((x, idx) => (idx === i ? { ...x, value: e.target.value } : x)))} className="w-28 rounded-[9px] p-2 text-[12px]" style={{ border: "1px solid var(--app-border)" }} />
          <button type="button" onClick={() => onChange(conditions.filter((_, idx) => idx !== i))} aria-label="Remove condition" style={{ color: "#B42318" }}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...conditions, { field: fields[0], operator: "eq", value: "" }])} className="self-start rounded-[9px] px-3 py-1.5 text-[11.5px] font-bold" style={{ border: "1px dashed var(--app-border-strong)", color: "var(--app-primary)" }}>
        + Add condition
      </button>
    </div>
  );
}

function ActionsEditor({ actions, onChange }: { actions: WorkflowAction[]; onChange: (a: WorkflowAction[]) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-[12px] font-bold" style={{ color: "var(--app-text)" }}>Actions</p>
      {actions.map((a, i) => (
        <div key={i} className="flex flex-col gap-1.5 rounded-[10px] p-2.5" style={{ border: "1px solid var(--app-border)" }}>
          <div className="flex items-center gap-1.5">
            <select value={a.type} onChange={(e) => onChange(actions.map((x, idx) => (idx === i ? { ...x, type: e.target.value as WorkflowActionType } : x)))} className="rounded-[9px] p-2 text-[12px]" style={{ border: "1px solid var(--app-border)" }}>
              <option value="send_customer_message">Message the customer</option>
              <option value="notify_owner">Notify the owner</option>
            </select>
            <button type="button" onClick={() => onChange(actions.filter((_, idx) => idx !== i))} aria-label="Remove action" style={{ color: "#B42318" }}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          <textarea value={a.messageBody} onChange={(e) => onChange(actions.map((x, idx) => (idx === i ? { ...x, messageBody: e.target.value } : x)))} rows={2} placeholder="Hi {{customerName}}, ..." className="w-full rounded-[9px] p-2 text-[12.5px]" style={{ border: "1px solid var(--app-border)" }} />
        </div>
      ))}
      <button type="button" onClick={() => onChange([...actions, { type: "send_customer_message", messageBody: "" }])} className="self-start rounded-[9px] px-3 py-1.5 text-[11.5px] font-bold" style={{ border: "1px dashed var(--app-border-strong)", color: "var(--app-primary)" }}>
        + Add action
      </button>
    </div>
  );
}

function WorkflowFormDialog({ workflow, onClose }: { workflow?: Workflow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(workflow?.name ?? "");
  const [triggerKey, setTriggerKey] = useState<WorkflowTriggerKey>(workflow?.triggerKey ?? "sale");
  const [conditions, setConditions] = useState<WorkflowCondition[]>(workflow?.conditions ?? []);
  const [actions, setActions] = useState<WorkflowAction[]>(workflow?.actions ?? [{ type: "send_customer_message", messageBody: "" }]);

  const mutation = useMutation({
    mutationFn: () => (workflow ? updateWorkflow(workflow.id, { name, conditions, actions }) : createWorkflow({ name, triggerKey, conditions, actions })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      toast.success(workflow ? "Automation updated." : "Automation created.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this automation."),
  });
  const validActions = actions.every((a) => a.messageBody.trim().length > 0);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-5" style={{ background: "rgba(10,27,42,.36)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[85vh] w-full max-w-[500px] flex-col rounded-[16px]" style={{ background: "var(--app-surface)" }}>
        <div className="p-[17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>{workflow ? "Edit automation" : "New automation"}</h3>
        </div>
        <div className="flex flex-col gap-3.5 overflow-y-auto p-[17px]">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Thank loyal customers" className="rounded-[10px] p-2.5 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
          <select value={triggerKey} onChange={(e) => setTriggerKey(e.target.value as WorkflowTriggerKey)} disabled={!!workflow} className="rounded-[10px] p-2.5 text-[12.5px] disabled:opacity-60" style={{ border: "1px solid var(--app-border)" }}>
            {WORKFLOW_TRIGGER_KEYS.map((key) => (
              <option key={key} value={key}>{WORKFLOW_TRIGGER_LABELS[key]}</option>
            ))}
          </select>
          <ConditionsEditor triggerKey={triggerKey} conditions={conditions} onChange={setConditions} />
          <ActionsEditor actions={actions} onChange={setActions} />
        </div>
        <div className="grid grid-cols-2 gap-2 p-[14px_17px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
          <button type="button" onClick={onClose} className="rounded-[10px] px-4 py-2.5 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
            Cancel
          </button>
          <button type="button" onClick={() => mutation.mutate()} disabled={!name.trim() || !validActions || mutation.isPending} className="rounded-[10px] px-4 py-2.5 text-[12.5px] font-extrabold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>
            {mutation.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TestDialog({ workflow, onClose }: { workflow: Workflow; onClose: () => void }) {
  const [result, setResult] = useState<WorkflowTestResult | null>(null);
  const mutation = useMutation({
    mutationFn: () => testWorkflow(workflow.id),
    onSuccess: setResult,
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't run the test."),
  });

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-5" style={{ background: "rgba(10,27,42,.36)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[440px] rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)" }}>
        <h3 className="m-0 mb-1 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Test &quot;{workflow.name}&quot;</h3>
        <p className="m-0 mb-3 text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>Runs against your most recent real matching activity — never sends anything or logs a run.</p>
        {result ? (
          <div className="flex flex-col gap-2.5 text-[12.5px]">
            {!result.foundRecentEvent ? (
              <p className="m-0" style={{ color: "var(--app-text-disabled)" }}>No recent activity matches this trigger yet — nothing to test against.</p>
            ) : (
              <>
                <span className="w-fit rounded-full px-2.5 py-[3px] text-[10.5px] font-extrabold" style={{ background: result.matched ? "#E8F7EE" : "#FEF3F2", color: result.matched ? "#0E8442" : "#B42318" }}>
                  {result.matched ? "Would run" : "Conditions didn't match"}
                </span>
                <pre className="overflow-x-auto rounded-[9px] p-2.5 text-[11px]" style={{ background: "var(--app-surface-2)", color: "var(--app-text-muted)" }}>{JSON.stringify(result.context, null, 2)}</pre>
                {result.matched && result.wouldExecuteActions.length > 0 && (
                  <ul className="m-0 list-disc ps-5" style={{ color: "var(--app-text-muted)" }}>
                    {result.wouldExecuteActions.map((a, i) => (
                      <li key={i}>{a.type === "notify_owner" ? "Notify owner" : "Message customer"}: &ldquo;{a.messageBody}&rdquo;</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        ) : (
          <p className="m-0 text-[12px]" style={{ color: "var(--app-text-disabled)" }}>Click &ldquo;Run test&rdquo; to see what would happen with real recent data.</p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} className="rounded-[10px] px-4 py-2.5 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
            Close
          </button>
          <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="rounded-[10px] px-4 py-2.5 text-[12.5px] font-extrabold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>
            {mutation.isPending ? "Running…" : "Run test"}
          </button>
        </div>
      </div>
    </div>
  );
}

