"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { askText } from "@/lib/ask-dialog";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import {
  fetchWorkflowVariables,
  fetchWorkflowVersions,
  fetchWorkflows,
  restoreWorkflowVersion,
  testWorkflow,
  type WorkflowTestResult,
  type WorkflowVersion,
} from "@/lib/workflows-api";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

interface DiffRow {
  field: string;
  before: string;
  after: string;
}

const scheduleOf = (version: WorkflowVersion) =>
  version.scheduleCronExpression
    ? `cron ${version.scheduleCronExpression} (${version.scheduleTimezone})`
    : version.scheduleEveryMinutes
      ? `every ${version.scheduleEveryMinutes} min (${version.scheduleTimezone})`
      : "none";

/** Field-by-field differences between two stored versions (steps compared by position). */
function diffVersions(before: WorkflowVersion, after: WorkflowVersion): DiffRow[] {
  const rows: DiffRow[] = [];
  const add = (field: string, a: unknown, b: unknown) => {
    const left = typeof a === "string" ? a : JSON.stringify(a);
    const right = typeof b === "string" ? b : JSON.stringify(b);
    if (left !== right) rows.push({ field, before: left, after: right });
  };
  add("Name", before.name, after.name);
  add("Trigger", before.triggerKey, after.triggerKey);
  add("Schedule", scheduleOf(before), scheduleOf(after));
  add("Condition mode", before.conditionMode, after.conditionMode);
  add("Conditions", before.conditions, after.conditions);
  const steps = Math.max(before.actions.length, after.actions.length);
  for (let index = 0; index < steps; index += 1) {
    add(`Step ${index + 1}`, before.actions[index] ?? "(none)", after.actions[index] ?? "(none)");
  }
  add("Graph nodes", String(before.graph?.nodes.length ?? 0), String(after.graph?.nodes.length ?? 0));
  return rows;
}

function TestPanel({ result }: { result: WorkflowTestResult }) {
  return (
    <div className="rounded-xl border p-3 text-xs" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)" }}>
      {!result.foundRecentEvent ? (
        <p className="m-0">No recent matching activity to test against — nothing ran.</p>
      ) : (
        <>
          <p className="m-0 font-semibold">{result.matched ? "Conditions matched the latest real event." : "Conditions did not match the latest real event."}</p>
          <p className="m-0 mt-1">Would run {result.wouldExecuteActions.length} step(s). Nothing was sent.</p>
          {result.actionPreviews.map((preview) => (
            <p key={preview.actionIndex} className="m-0 mt-1" style={{ color: preview.error ? "var(--app-danger-strong)" : "var(--app-text-muted)" }}>
              Step {preview.actionIndex + 1}: {preview.error ?? preview.body ?? "ok"}
            </p>
          ))}
        </>
      )}
    </div>
  );
}

export function AutomationVersionsView() {
  const client = useQueryClient();
  const workflowsQuery = useQuery({ queryKey: ["workflows", "versions-screen"], queryFn: () => fetchWorkflows(false) });
  const workflows = workflowsQuery.data ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const workflow = workflows.find((row) => row.id === selectedId) ?? workflows[0] ?? null;
  const versionsQuery = useQuery({
    queryKey: ["workflow-versions", workflow?.id],
    queryFn: () => fetchWorkflowVersions(workflow!.id),
    enabled: Boolean(workflow),
  });
  const versions = useMemo(() => [...(versionsQuery.data ?? [])].sort((a, b) => b.version - a.version), [versionsQuery.data]);
  const [leftVersion, setLeftVersion] = useState<number | null>(null);
  const [rightVersion, setRightVersion] = useState<number | null>(null);
  const right = versions.find((row) => row.version === rightVersion) ?? versions[0];
  const left = versions.find((row) => row.version === leftVersion) ?? versions[1];
  const diff = left && right ? diffVersions(left, right) : [];
  const variablesQuery = useQuery({ queryKey: ["workflow-variables", "env-counts"], queryFn: () => fetchWorkflowVariables({}) });
  const envCounts = (variablesQuery.data?.items ?? []).reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.environment]: (acc[row.environment] ?? 0) + 1 }), {});
  const [testResult, setTestResult] = useState<WorkflowTestResult | null>(null);

  const test = useMutation({
    mutationFn: () => testWorkflow(workflow!.id),
    onSuccess: setTestResult,
    onError: (error) => toast.error(errorMessage(error, "The test run failed.")),
  });
  const restore = useMutation({
    mutationFn: async (version: number) => {
      const reason = await askText({ title: `Why restore version ${version}?`, minLength: 3, confirmLabel: "Restore" });
      if (!reason || !workflow) return null;
      return restoreWorkflowVersion(workflow.id, version, { expectedVersion: workflow.version, expectedUpdatedAt: workflow.updatedAt, reason });
    },
    onSuccess: async (result) => {
      if (!result) return;
      await Promise.all([client.invalidateQueries({ queryKey: ["workflows"] }), client.invalidateQueries({ queryKey: ["workflow-versions"] })]);
      toast.success(`Restored as version ${result.version}. In-flight runs keep the version they started on.`);
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't restore that version.")),
  });

  return (
    <main className="flex flex-col gap-4 p-5 md:p-7" style={{ color: "var(--app-text)" }}>
      <p className="m-0 max-w-4xl text-xs" style={{ color: "var(--app-text-muted)" }}>
        Every save creates an immutable version. Compare any two, dry-run the current version against the latest real matching event (nothing is sent), or restore an earlier version as a new one.
        Workflows run in <strong>one environment (production)</strong>: variables can be stored for draft and staging, but no runs use them, so staging runs and promotion between environments aren&rsquo;t available yet.
      </p>

      <section className="rounded-2xl border p-4 text-xs" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
        <p className="m-0 text-sm font-bold">Environments</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(["production", "staging", "draft"] as const).map((env) => (
            <div key={env} className="rounded-lg p-2" style={{ background: "var(--app-surface-2)" }}>
              <p className="m-0 font-bold capitalize">{env}</p>
              <p className="m-0" style={{ color: "var(--app-text-faint)" }}>
                {env === "production" ? "All runs use this" : "Stored only — not used by runs"} · {envCounts[env] ?? 0} variable(s)
              </p>
            </div>
          ))}
        </div>
        <Link href="/marketing/automations/variables" className="mt-2 inline-block font-bold underline">Manage variables</Link>
      </section>

      {workflowsQuery.isLoading ? (
        <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading…</p>
      ) : !workflow ? (
        <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>No workflows yet.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-bold">
              Workflow
              <select value={workflow.id} onChange={(event) => { setSelectedId(event.target.value); setLeftVersion(null); setRightVersion(null); setTestResult(null); }} className="rounded-lg border px-2 py-1 text-sm" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
                {workflows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
            </label>
            <span className="text-xs" style={{ color: "var(--app-text-faint)" }}>Current version v{workflow.version}</span>
            <button type="button" disabled={test.isPending} onClick={() => test.mutate()} className="rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-50" style={{ borderColor: "var(--app-border)" }}>
              {test.isPending ? "Testing…" : "Dry-run current version"}
            </button>
          </div>
          {testResult && <TestPanel result={testResult} />}

          <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
            <section className="rounded-2xl border p-3 text-xs" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
              <p className="m-0 mb-2 text-sm font-bold">Versions</p>
              {versions.length === 0 ? (
                <p className="m-0" style={{ color: "var(--app-text-faint)" }}>No saved versions yet.</p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {versions.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-2">
                      <span>
                        <span className="font-semibold">v{row.version}</span> · {formatDate(row.createdAt)}
                        {row.version === workflow.version && <span className="ms-1 font-semibold" style={{ color: "var(--app-success-text)" }}>current</span>}
                      </span>
                      {row.version !== workflow.version && (
                        <button type="button" disabled={restore.isPending} onClick={() => restore.mutate(row.version)} className="font-bold underline">Restore</button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="rounded-2xl border p-3 text-xs" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="m-0 text-sm font-bold">Compare</p>
                {(["left", "right"] as const).map((side) => (
                  <select
                    key={side}
                    value={(side === "left" ? left : right)?.version ?? ""}
                    onChange={(event) => (side === "left" ? setLeftVersion : setRightVersion)(Number(event.target.value))}
                    aria-label={side === "left" ? "Older version" : "Newer version"}
                    className="rounded border px-2 py-1"
                    style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}
                  >
                    {versions.map((row) => <option key={row.id} value={row.version}>v{row.version}</option>)}
                  </select>
                ))}
              </div>
              {!left || !right ? (
                <p className="m-0 mt-2" style={{ color: "var(--app-text-faint)" }}>Save a second version to compare.</p>
              ) : diff.length === 0 ? (
                <p className="m-0 mt-2" style={{ color: "var(--app-text-faint)" }}>v{left.version} and v{right.version} are identical.</p>
              ) : (
                <table className="mt-2 w-full text-left">
                  <thead style={{ color: "var(--app-text-faint)" }}>
                    <tr><th className="py-1 pe-2">Field</th><th className="py-1 pe-2">v{left.version}</th><th className="py-1">v{right.version}</th></tr>
                  </thead>
                  <tbody>
                    {diff.map((row) => (
                      <tr key={row.field} className="border-t align-top" style={{ borderColor: "var(--app-border)" }}>
                        <td className="py-1 pe-2 font-semibold">{row.field}</td>
                        <td className="break-all py-1 pe-2 font-mono" style={{ color: "var(--app-danger-strong)" }}>{row.before}</td>
                        <td className="break-all py-1 font-mono" style={{ color: "var(--app-success-text)" }}>{row.after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
