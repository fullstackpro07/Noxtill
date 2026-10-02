"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Database, Pencil, Plus, Trash2 } from "lucide-react";
import { ApiError } from "@/lib/api-client";
import { fetchBranches } from "@/lib/branches-api";
import { toast } from "@/lib/toast";
import { askConfirm } from "@/lib/ask-dialog";
import {
  createWorkflowVariable,
  deleteWorkflowVariable,
  fetchWorkflowVariables,
  fetchWorkflows,
  updateWorkflowVariable,
  type SaveWorkflowVariableInput,
  type WorkflowVariable,
  type WorkflowVariableEnvironment,
  type WorkflowVariableScope,
  type WorkflowVariableType,
} from "@/lib/workflows-api";

type VariableForm = {
  scope: WorkflowVariableScope;
  scopeId: string;
  environment: WorkflowVariableEnvironment;
  name: string;
  valueType: WorkflowVariableType;
  valueText: string;
  secretReference: string;
  description: string;
};

const NEW_VARIABLE: VariableForm = {
  scope: "business",
  scopeId: "",
  environment: "production",
  name: "",
  valueType: "string",
  valueText: "",
  secretReference: "",
  description: "",
};

const ENVIRONMENTS: WorkflowVariableEnvironment[] = ["draft", "staging", "production"];
const VALUE_TYPES: WorkflowVariableType[] = ["string", "number", "boolean", "json", "secret_reference"];

const panelStyle = {
  background: "var(--app-surface)",
  border: "1px solid var(--app-border)",
};

const fieldStyle = {
  background: "var(--app-surface-2)",
  border: "1px solid var(--app-border)",
  color: "var(--app-text)",
};

function readValue(form: VariableForm): SaveWorkflowVariableInput["value"] {
  if (form.valueType === "secret_reference") return undefined;
  if (form.valueType === "number") {
    const value = Number(form.valueText);
    if (form.valueText.trim() === "" || !Number.isFinite(value)) {
      throw new Error("Enter a valid number for this variable.");
    }
    return value;
  }
  if (form.valueType === "boolean") return form.valueText === "true";
  if (form.valueType === "json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(form.valueText);
    } catch {
      throw new Error("Enter valid JSON for this variable.");
    }
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("JSON variables must be an object or array.");
    }
    return parsed;
  }
  return form.valueText;
}

function valueText(variable: WorkflowVariable): string {
  if (variable.valueType === "secret_reference") return "";
  return typeof variable.value === "string"
    ? variable.value
    : JSON.stringify(variable.value, null, 2) ?? "";
}

function displayValue(variable: WorkflowVariable): string {
  if (variable.valueType === "secret_reference") {
    return variable.secretReferenceConfigured ? "Reference configured (hidden)" : "Not configured";
  }
  if (typeof variable.value === "string") return variable.value;
  return JSON.stringify(variable.value);
}

function prettyLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function WorkflowVariablesView() {
  const queryClient = useQueryClient();
  const [environment, setEnvironment] = useState<WorkflowVariableEnvironment>("production");
  const [scopeFilter, setScopeFilter] = useState<"all" | WorkflowVariableScope>("all");
  const [form, setForm] = useState<VariableForm>(NEW_VARIABLE);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const variablesQuery = useQuery({
    queryKey: ["workflow-variables", environment, scopeFilter],
    queryFn: () => fetchWorkflowVariables({
      environment,
      ...(scopeFilter === "all" ? {} : { scope: scopeFilter }),
    }),
  });
  const workflowsQuery = useQuery({ queryKey: ["workflows"], queryFn: () => fetchWorkflows() });
  const branchesQuery = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });
  const branches = useMemo(
    () => (branchesQuery.data ?? []).filter((branch) => branch.parentId !== null && branch.active),
    [branchesQuery.data],
  );

  const invalidateVariables = async () => {
    await queryClient.invalidateQueries({ queryKey: ["workflow-variables"] });
  };
  const saveMutation = useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: SaveWorkflowVariableInput }) =>
      id ? updateWorkflowVariable(id, input) : createWorkflowVariable(input),
    onSuccess: async (variable) => {
      await invalidateVariables();
      setForm(NEW_VARIABLE);
      setEditingId(null);
      setFormError(null);
      toast.success(editingId ? "Variable updated" : "Variable created");
      if (variable.environment !== environment) setEnvironment(variable.environment);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Variable could not be saved."),
  });
  const deleteMutation = useMutation({
    mutationFn: deleteWorkflowVariable,
    onSuccess: async () => {
      await invalidateVariables();
      toast.success("Variable deleted");
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Variable could not be deleted."),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    try {
      const input: SaveWorkflowVariableInput = {
        scope: form.scope,
        ...(form.scope === "business" ? {} : { scopeId: form.scopeId }),
        environment: form.environment,
        name: form.name.trim(),
        valueType: form.valueType,
        ...(form.valueType === "secret_reference"
          ? (form.secretReference.trim() ? { secretReference: form.secretReference.trim() } : {})
          : { value: readValue(form) }),
        description: form.description.trim() || null,
      };
      saveMutation.mutate({ id: editingId, input });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Check the variable details and try again.");
    }
  }

  function startEditing(variable: WorkflowVariable) {
    setEditingId(variable.id);
    setForm({
      scope: variable.scope,
      scopeId: variable.scopeId ?? "",
      environment: variable.environment,
      name: variable.name,
      valueType: variable.valueType,
      valueText: valueText(variable),
      secretReference: "",
      description: variable.description ?? "",
    });
    setFormError(null);
  }

  function cancelEditing() {
    setEditingId(null);
    setForm(NEW_VARIABLE);
    setFormError(null);
    saveMutation.reset();
  }

  const variables = variablesQuery.data?.items ?? [];
  const saveError = saveMutation.error instanceof ApiError ? saveMutation.error.message : null;
  const isLoading = saveMutation.isPending || deleteMutation.isPending;

  return (
    <main className="flex flex-col gap-4 px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)" }}>Variables &amp; State</h1>
          <p className="m-0 mt-1 max-w-3xl text-[12px]" style={{ color: "var(--app-text-muted)" }}>
            Store typed values for a business, workflow or branch. Secret entries accept a server-side reference only.
          </p>
        </div>
        <Link href="/marketing/automations" className="inline-flex min-h-10 items-center gap-2 rounded-[10px] px-3 text-[11.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />Back to workflows
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-[12px] p-3" style={panelStyle}>
        <div className="mr-auto flex min-h-9 items-center gap-2 text-[11px] font-semibold" style={{ color: "var(--app-text-muted)" }}>
          <Database className="h-4 w-4" aria-hidden />
          <span>{variablesQuery.data?.total ?? "—"} variables in this view</span>
          {variablesQuery.data?.hasMore && <span>Showing first 500</span>}
        </div>
        <label className="flex min-h-9 items-center gap-2 rounded-[9px] px-3 text-[10.5px] font-semibold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
          <span>Environment</span>
          <select aria-label="Filter by environment" value={environment} onChange={(event) => setEnvironment(event.target.value as WorkflowVariableEnvironment)} className="bg-transparent text-[11px] outline-none" style={{ color: "var(--app-text)" }}>
            {ENVIRONMENTS.map((item) => <option key={item} value={item}>{prettyLabel(item)}</option>)}
          </select>
        </label>
        <label className="flex min-h-9 items-center gap-2 rounded-[9px] px-3 text-[10.5px] font-semibold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>
          <span>Scope</span>
          <select aria-label="Filter by scope" value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value as "all" | WorkflowVariableScope)} className="bg-transparent text-[11px] outline-none" style={{ color: "var(--app-text)" }}>
            <option value="all">All scopes</option>
            <option value="business">Business</option>
            <option value="workflow">Workflow</option>
            <option value="branch">Branch</option>
          </select>
        </label>
      </div>

      <section className="rounded-[14px] p-4" style={panelStyle}>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="m-0 flex-1 text-[13px] font-extrabold" style={{ color: "var(--app-text)" }}>{editingId ? "Edit variable" : "Create variable"}</h2>
          {editingId && <button type="button" onClick={cancelEditing} className="rounded-[8px] px-3 py-2 text-[10.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Cancel</button>}
        </div>
        <form onSubmit={handleSubmit} className="grid gap-3 lg:grid-cols-3">
          <label className="flex flex-col gap-1 text-[10px] font-bold" style={{ color: "var(--app-text-muted)" }}>
            Name
            <input required pattern="[A-Za-z_][A-Za-z0-9_]{0,99}" maxLength={100} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="supportMessage" className="h-9 rounded-[8px] px-2 text-[11px] outline-none" style={fieldStyle} />
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-bold" style={{ color: "var(--app-text-muted)" }}>
            Scope
            <select value={form.scope} onChange={(event) => setForm((current) => ({ ...current, scope: event.target.value as WorkflowVariableScope, scopeId: "" }))} className="h-9 rounded-[8px] px-2 text-[11px] outline-none" style={fieldStyle}>
              <option value="business">Business</option><option value="workflow">Workflow</option><option value="branch">Branch</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] font-bold" style={{ color: "var(--app-text-muted)" }}>
            Environment
            <select value={form.environment} onChange={(event) => setForm((current) => ({ ...current, environment: event.target.value as WorkflowVariableEnvironment }))} className="h-9 rounded-[8px] px-2 text-[11px] outline-none" style={fieldStyle}>
              {ENVIRONMENTS.map((item) => <option key={item} value={item}>{prettyLabel(item)}</option>)}
            </select>
          </label>

          {form.scope === "workflow" && (
            <label className="flex flex-col gap-1 text-[10px] font-bold" style={{ color: "var(--app-text-muted)" }}>
              Workflow
              <select required value={form.scopeId} onChange={(event) => setForm((current) => ({ ...current, scopeId: event.target.value }))} className="h-9 rounded-[8px] px-2 text-[11px] outline-none" style={fieldStyle}>
                <option value="">Select workflow</option>
                {(workflowsQuery.data ?? []).filter((workflow) => !workflow.archivedAt).map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}
              </select>
            </label>
          )}
          {form.scope === "branch" && (
            <label className="flex flex-col gap-1 text-[10px] font-bold" style={{ color: "var(--app-text-muted)" }}>
              Branch
              <select required value={form.scopeId} onChange={(event) => setForm((current) => ({ ...current, scopeId: event.target.value }))} className="h-9 rounded-[8px] px-2 text-[11px] outline-none" style={fieldStyle}>
                <option value="">Select branch</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-[10px] font-bold" style={{ color: "var(--app-text-muted)" }}>
            Value type
            <select value={form.valueType} onChange={(event) => setForm((current) => ({ ...current, valueType: event.target.value as WorkflowVariableType }))} className="h-9 rounded-[8px] px-2 text-[11px] outline-none" style={fieldStyle}>
              {VALUE_TYPES.map((item) => <option key={item} value={item}>{prettyLabel(item)}</option>)}
            </select>
          </label>

          {form.valueType === "secret_reference" ? (
            <label className="flex flex-col gap-1 text-[10px] font-bold lg:col-span-2" style={{ color: "var(--app-text-muted)" }}>
              Server secret reference
              <input value={form.secretReference} onChange={(event) => setForm((current) => ({ ...current, secretReference: event.target.value }))} placeholder="env:TWILIO_AUTH_TOKEN" pattern="env:[A-Z][A-Z0-9_]{0,127}" className="h-9 rounded-[8px] px-2 font-mono text-[11px] outline-none" style={fieldStyle} />
              <span className="font-normal">Enter the server environment-variable name only. The API never returns it or accepts the secret itself.</span>
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-[10px] font-bold lg:col-span-2" style={{ color: "var(--app-text-muted)" }}>
              Value
              {form.valueType === "boolean" ? (
                <select value={form.valueText || "false"} onChange={(event) => setForm((current) => ({ ...current, valueText: event.target.value }))} className="h-9 rounded-[8px] px-2 text-[11px] outline-none" style={fieldStyle}>
                  <option value="true">True</option><option value="false">False</option>
                </select>
              ) : form.valueType === "json" ? (
                <textarea required value={form.valueText} onChange={(event) => setForm((current) => ({ ...current, valueText: event.target.value }))} placeholder='{"key":"value"}' className="min-h-[76px] rounded-[8px] p-2 font-mono text-[10.5px] outline-none" style={fieldStyle} />
              ) : (
                <input required type={form.valueType === "number" ? "number" : "text"} step={form.valueType === "number" ? "any" : undefined} value={form.valueText} onChange={(event) => setForm((current) => ({ ...current, valueText: event.target.value }))} className="h-9 rounded-[8px] px-2 text-[11px] outline-none" style={fieldStyle} />
              )}
            </label>
          )}
          <label className="flex flex-col gap-1 text-[10px] font-bold lg:col-span-2" style={{ color: "var(--app-text-muted)" }}>
            Description
            <input maxLength={500} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="What uses this value?" className="h-9 rounded-[8px] px-2 text-[11px] outline-none" style={fieldStyle} />
          </label>
          {formError && <p role="alert" className="m-0 text-[11px] font-semibold lg:col-span-3" style={{ color: "var(--app-danger-strong)" }}>{formError}</p>}
          {saveError && <p role="alert" className="m-0 text-[11px] font-semibold lg:col-span-3" style={{ color: "var(--app-danger-strong)" }}>{saveError}</p>}
          <div className="flex items-end justify-end lg:col-span-3">
            <button type="submit" disabled={isLoading} className="inline-flex min-h-9 items-center gap-2 rounded-[9px] px-3 text-[10.5px] font-bold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>
              <Plus className="h-3.5 w-3.5" aria-hidden />{saveMutation.isPending ? "Saving…" : editingId ? "Save changes" : "Create variable"}
            </button>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-[14px]" style={panelStyle}>
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--app-border)" }}>
          <h2 className="m-0 text-[13px] font-extrabold" style={{ color: "var(--app-text)" }}>Saved variables</h2>
          <span className="text-[10px]" style={{ color: "var(--app-text-muted)" }}>Execution-only values stay in each workflow run and are not listed here.</span>
        </div>
        {variablesQuery.isPending ? (
          <p className="m-0 p-4 text-[11px]" style={{ color: "var(--app-text-muted)" }}>Loading saved variables…</p>
        ) : variablesQuery.isError ? (
          <div role="alert" className="p-4 text-[11px]" style={{ color: "var(--app-danger-strong)" }}>Variables could not be loaded. Refresh and try again.</div>
        ) : variables.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center">
            <Database className="h-6 w-6" style={{ color: "var(--app-text-disabled)" }} aria-hidden />
            <p className="m-0 text-[12px] font-bold" style={{ color: "var(--app-text)" }}>No variables in this environment yet</p>
            <p className="m-0 max-w-xl text-[10.5px]" style={{ color: "var(--app-text-muted)" }}>Create a business, workflow or branch variable above. This page currently manages variables; typed data stores and record browsing are not available yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-left">
              <thead><tr className="text-[9.5px] uppercase tracking-wide" style={{ color: "var(--app-text-muted)", background: "var(--app-surface-2)" }}>
                <th className="px-4 py-2.5 font-bold">Name</th><th className="px-4 py-2.5 font-bold">Scope</th><th className="px-4 py-2.5 font-bold">Type</th><th className="px-4 py-2.5 font-bold">Value</th><th className="px-4 py-2.5 font-bold">Description</th><th className="px-4 py-2.5 font-bold">Updated</th><th className="px-4 py-2.5 font-bold"><span className="sr-only">Actions</span></th>
              </tr></thead>
              <tbody>{variables.map((variable) => {
                const scopeName = variable.scope === "workflow"
                  ? workflowsQuery.data?.find((workflow) => workflow.id === variable.scopeId)?.name ?? "Workflow"
                  : variable.scope === "branch"
                    ? branches.find((branch) => branch.id === variable.scopeId)?.name ?? "Branch"
                    : "Business";
                return <tr key={variable.id} className="border-t text-[10.5px]" style={{ borderColor: "var(--app-border)", color: "var(--app-text)" }}>
                  <td className="px-4 py-3 font-bold">{variable.name}</td>
                  <td className="px-4 py-3">{scopeName}<span className="ml-1.5 rounded px-1.5 py-0.5 text-[8.5px]" style={{ background: "var(--app-surface-2)", color: "var(--app-text-muted)" }}>{prettyLabel(variable.environment)}</span></td>
                  <td className="px-4 py-3">{prettyLabel(variable.valueType)}</td>
                  <td className="max-w-[280px] truncate px-4 py-3 font-mono text-[9.5px]" title={variable.valueType === "secret_reference" ? undefined : displayValue(variable)}>{displayValue(variable)}</td>
                  <td className="max-w-[220px] truncate px-4 py-3" title={variable.description ?? undefined}>{variable.description || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3">{new Date(variable.updatedAt).toLocaleString()}</td>
                  <td className="px-4 py-3"><div className="flex items-center gap-1">
                    <button type="button" aria-label={`Edit ${variable.name}`} onClick={() => startEditing(variable)} className="inline-flex h-8 w-8 items-center justify-center rounded-[7px]" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}><Pencil className="h-3.5 w-3.5" aria-hidden /></button>
                    <button type="button" aria-label={`Delete ${variable.name}`} disabled={isLoading} onClick={async () => { if (await askConfirm({ title: `Delete variable ${variable.name}?`, confirmLabel: "Delete", tone: "danger" })) deleteMutation.mutate(variable.id); }} className="inline-flex h-8 w-8 items-center justify-center rounded-[7px] disabled:opacity-50" style={{ border: "1px solid var(--app-border)", color: "var(--app-danger-strong)" }}><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
                  </div></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
