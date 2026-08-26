"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, PlayCircle, Zap, History } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import {
  fetchWorkflows,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  testWorkflow,
  fetchWorkflowRuns,
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

const RUN_STATUS_TONE: Record<string, "success" | "danger" | "neutral"> = {
  success: "success",
  failed: "danger",
  skipped: "neutral",
};

export function AutomationsPanel() {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Workflow | null>(null);
  const [testing, setTesting] = useState<Workflow | null>(null);
  const [viewingRuns, setViewingRuns] = useState<Workflow | null>(null);
  const queryClient = useQueryClient();

  const { data: workflows, isPending, isError, refetch } = useQuery({ queryKey: ["workflows"], queryFn: fetchWorkflows });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => updateWorkflow(id, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflows"] }),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this automation."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteWorkflow(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      toast.success("Automation deleted.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't delete this automation."),
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          New automation
        </Button>
      </div>

      {isError && <ErrorBanner title="Couldn't load automations" onRetry={() => refetch()} />}
      {isPending && (
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <SkeletonRow />
            <SkeletonRow />
          </CardContent>
        </Card>
      )}
      {workflows && workflows.length === 0 && (
        <Card>
          <CardContent>
            <EmptyState icon={Zap} title="No automations yet" description="Build a trigger → condition → action rule that runs on its own." />
          </CardContent>
        </Card>
      )}

      {workflows && workflows.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {workflows.map((w) => (
            <Card key={w.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{w.name}</p>
                  <p className="truncate text-xs text-fg-muted">
                    When {WORKFLOW_TRIGGER_LABELS[w.triggerKey]}
                    {w.conditions.length > 0 ? `, if ${w.conditions.length} condition${w.conditions.length === 1 ? "" : "s"} match` : ""} → {w.actions.length}{" "}
                    action{w.actions.length === 1 ? "" : "s"}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={w.active}
                  onClick={() => toggleMutation.mutate({ id: w.id, active: !w.active })}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${w.active ? "bg-whatsapp" : "bg-surface-2"}`}
                >
                  <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${w.active ? "translate-x-6" : "translate-x-1"}`} />
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setTesting(w)} aria-label="Test">
                    <PlayCircle className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setViewingRuns(w)} aria-label="Run history">
                    <History className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(w)} aria-label="Edit">
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(w.id)} aria-label="Delete">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(creating || editing) && <WorkflowFormDialog workflow={editing ?? undefined} onClose={() => (editing ? setEditing(null) : setCreating(false))} />}
      {testing && <TestWorkflowDialog workflow={testing} onClose={() => setTesting(null)} />}
      {viewingRuns && <WorkflowRunsDialog workflow={viewingRuns} onClose={() => setViewingRuns(null)} />}
    </div>
  );
}

function ConditionsEditor({
  triggerKey,
  conditions,
  onChange,
}: {
  triggerKey: WorkflowTriggerKey;
  conditions: WorkflowCondition[];
  onChange: (conditions: WorkflowCondition[]) => void;
}) {
  const fields = WORKFLOW_TRIGGER_FIELDS[triggerKey];

  function update(i: number, patch: Partial<WorkflowCondition>) {
    onChange(conditions.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-fg">Conditions (all must match — optional)</p>
      {conditions.map((c, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1.5">
          <Select value={c.field} onChange={(e) => update(i, { field: e.target.value })} className="w-36">
            {fields.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
          <Select value={c.operator} onChange={(e) => update(i, { operator: e.target.value as WorkflowCondition["operator"] })} className="w-36">
            {WORKFLOW_CONDITION_OPERATORS.map((op) => (
              <option key={op} value={op}>
                {WORKFLOW_CONDITION_OPERATOR_LABELS[op]}
              </option>
            ))}
          </Select>
          <Input value={String(c.value)} onChange={(e) => update(i, { value: e.target.value })} className="w-28" />
          <Button variant="ghost" size="sm" onClick={() => onChange(conditions.filter((_, idx) => idx !== i))} aria-label="Remove condition">
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => onChange([...conditions, { field: fields[0], operator: "eq", value: "" }])}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        Add condition
      </Button>
    </div>
  );
}

function ActionsEditor({ actions, onChange }: { actions: WorkflowAction[]; onChange: (actions: WorkflowAction[]) => void }) {
  function update(i: number, patch: Partial<WorkflowAction>) {
    onChange(actions.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-fg">Actions</p>
      {actions.map((a, i) => (
        <div key={i} className="flex flex-col gap-1.5 rounded-[var(--radius-sm)] border border-border p-2.5">
          <div className="flex items-center gap-1.5">
            <Select value={a.type} onChange={(e) => update(i, { type: e.target.value as WorkflowActionType })} className="w-52">
              <option value="send_customer_message">Message the customer</option>
              <option value="notify_owner">Notify the owner</option>
            </Select>
            <Button variant="ghost" size="sm" onClick={() => onChange(actions.filter((_, idx) => idx !== i))} aria-label="Remove action">
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
          <textarea
            value={a.messageBody}
            onChange={(e) => update(i, { messageBody: e.target.value })}
            rows={2}
            placeholder="Hi {{customerName}}, ..."
            className="w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3.5 py-2.5 text-sm text-fg focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </div>
      ))}
      <Button variant="ghost" size="sm" className="self-start" onClick={() => onChange([...actions, { type: "send_customer_message", messageBody: "" }])}>
        <Plus className="h-3.5 w-3.5" aria-hidden />
        Add action
      </Button>
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
    mutationFn: () =>
      workflow ? updateWorkflow(workflow.id, { name, conditions, actions }) : createWorkflow({ name, triggerKey, conditions, actions }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      toast.success(workflow ? "Automation updated." : "Automation created.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this automation."),
  });

  const validActions = actions.every((a) => a.messageBody.trim().length > 0);

  return (
    <Dialog
      open
      onClose={onClose}
      title={workflow ? "Edit automation" : "New automation"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!name.trim() || !validActions || mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Thank loyal customers" />
        <Select label="Trigger" value={triggerKey} onChange={(e) => setTriggerKey(e.target.value as WorkflowTriggerKey)} disabled={!!workflow}>
          {WORKFLOW_TRIGGER_KEYS.map((key) => (
            <option key={key} value={key}>
              {WORKFLOW_TRIGGER_LABELS[key]}
            </option>
          ))}
        </Select>
        <ConditionsEditor triggerKey={triggerKey} conditions={conditions} onChange={setConditions} />
        <ActionsEditor actions={actions} onChange={setActions} />
      </div>
    </Dialog>
  );
}

function TestWorkflowDialog({ workflow, onClose }: { workflow: Workflow; onClose: () => void }) {
  const [result, setResult] = useState<WorkflowTestResult | null>(null);
  const mutation = useMutation({
    mutationFn: () => testWorkflow(workflow.id),
    onSuccess: (r) => setResult(r),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't run the test."),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Test "${workflow.name}"`}
      description="Runs against your most recent real matching activity — never sends anything or logs a run."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Running…" : "Run test"}
          </Button>
        </>
      }
    >
      {result ? (
        <div className="flex flex-col gap-3 text-sm">
          {!result.foundRecentEvent ? (
            <p className="text-fg-muted">No recent activity matches this trigger yet — nothing to test against.</p>
          ) : (
            <>
              <p className="flex items-center gap-2">
                <Badge tone={result.matched ? "success" : "danger"}>{result.matched ? "Would run" : "Conditions didn't match"}</Badge>
              </p>
              <div>
                <p className="mb-1 font-medium text-fg">Real context used</p>
                <pre className="overflow-x-auto rounded-[var(--radius-sm)] bg-surface-2 p-3 text-xs text-fg-muted">
                  {JSON.stringify(result.context, null, 2)}
                </pre>
              </div>
              {result.matched && result.wouldExecuteActions.length > 0 && (
                <div>
                  <p className="mb-1 font-medium text-fg">Would execute</p>
                  <ul className="list-disc space-y-1 ps-5 text-fg-muted">
                    {result.wouldExecuteActions.map((a, i) => (
                      <li key={i}>
                        {a.type === "notify_owner" ? "Notify owner" : "Message customer"}: &ldquo;{a.messageBody}&rdquo;
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <p className="text-sm text-fg-faint">Click &ldquo;Run test&rdquo; to see what would happen with real recent data.</p>
      )}
    </Dialog>
  );
}

function WorkflowRunsDialog({ workflow, onClose }: { workflow: Workflow; onClose: () => void }) {
  const { data: runs, isPending } = useQuery({ queryKey: ["workflow-runs", workflow.id], queryFn: () => fetchWorkflowRuns(workflow.id) });

  return (
    <Dialog open onClose={onClose} title={`Run history — "${workflow.name}"`}>
      {isPending ? (
        <SkeletonRow />
      ) : !runs || runs.length === 0 ? (
        <p className="text-sm text-fg-faint">No real runs yet — this fires the next time the trigger happens for real.</p>
      ) : (
        <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
          {runs.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-border p-2.5 text-sm">
              <div>
                <Badge tone={RUN_STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Badge>
                {r.error && <span className="ms-2 text-xs text-destructive">{r.error}</span>}
              </div>
              <span className="text-xs text-fg-faint">{formatDate(r.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
