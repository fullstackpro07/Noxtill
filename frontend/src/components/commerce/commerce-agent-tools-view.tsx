"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { saveHubChanges } from "@/lib/settings-hub-api";
import { fetchAgentToolRuns, fetchAgentTools, runAgentTool, type AgentRiskClass, type AgentTool } from "@/lib/commerce-agent-tools-api";

const RISK_COLOR: Record<AgentRiskClass, string> = {
  READ_ONLY: "var(--app-success-text)",
  LOW_RISK_WRITE: "var(--app-text-muted)",
  MEDIUM_RISK_WRITE: "var(--app-warning-text)",
  HIGH_RISK_WRITE: "var(--app-danger-strong)",
  FINANCIAL: "var(--app-danger-strong)",
  IRREVERSIBLE: "var(--app-danger-strong)",
};
const KEYS = { registry: ["commerce-agent-tools"], runs: ["commerce-agent-tool-runs"] };

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function ToolRow({ tool }: { tool: AgentTool }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string | null>(null);
  const run = useMutation({
    mutationFn: () => runAgentTool(tool.key, input),
    onSuccess: async (response) => {
      setResult(response.run.outcome === "refused" ? `Refused: ${response.run.refusalReason}` : JSON.stringify(response.result, null, 2));
      await client.invalidateQueries({ queryKey: KEYS.runs });
    },
    onError: async (error) => {
      toast.error(errorMessage(error, "The tool failed."));
      await client.invalidateQueries({ queryKey: KEYS.runs });
    },
  });
  return (
    <tr className="border-t align-top" style={{ borderColor: "var(--app-border)" }}>
      <td className="px-3 py-2">
        <span className="font-semibold">{tool.label}</span>
        <span className="block font-mono text-[11px]" style={{ color: "var(--app-text-faint)" }}>{tool.key}</span>
        <span className="block" style={{ color: "var(--app-text-muted)" }}>{tool.description}</span>
      </td>
      <td className="px-3 py-2 font-semibold" style={{ color: RISK_COLOR[tool.riskClass] }}>{tool.riskClass.replaceAll("_", " ").toLowerCase()}</td>
      <td className="px-3 py-2">Level {tool.minLevel}+</td>
      <td className="px-3 py-2">{tool.approvalRequired ? "Always" : "No"}</td>
      <td className="max-w-[280px] px-3 py-2">
        {tool.blockedReason ? <span style={{ color: "var(--app-text-faint)" }}>{tool.blockedReason}</span> : <span className="font-semibold" style={{ color: "var(--app-success-text)" }}>Allowed</span>}
        {!tool.executable && (
          <Link href={tool.screen} className="block font-bold underline">Do it on its screen</Link>
        )}
      </td>
      <td className="min-w-[220px] px-3 py-2">
        {tool.executable && (
          <>
            <button type="button" onClick={() => setOpen((value) => !value)} className="font-bold underline">{open ? "Close" : "Test run"}</button>
            {open && (
              <form
                className="mt-2 flex flex-col gap-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  run.mutate();
                }}
              >
                {tool.inputs.map((name) => (
                  <input key={name} value={input[name] ?? ""} onChange={(event) => setInput({ ...input, [name]: event.target.value })} placeholder={name} aria-label={name} className="rounded border px-2 py-1 text-xs" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }} />
                ))}
                <button type="submit" disabled={run.isPending} className="self-start rounded px-2 py-1 text-xs font-bold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>
                  {run.isPending ? "Running…" : "Run"}
                </button>
                {result && <pre className="max-h-48 overflow-auto rounded p-2 text-[10.5px]" style={{ background: "var(--app-surface-2)" }}>{result}</pre>}
              </form>
            )}
          </>
        )}
      </td>
    </tr>
  );
}

export function CommerceAgentToolsView() {
  useModuleHeader({ title: "Agents & Tools", subtitle: "The permissioned tools commerce agents may use, and an audit of every use." });
  const client = useQueryClient();
  const registry = useQuery({ queryKey: KEYS.registry, queryFn: fetchAgentTools });
  const runs = useQuery({ queryKey: KEYS.runs, queryFn: fetchAgentToolRuns });
  const setLevel = useMutation({
    mutationFn: (level: number) => saveHubChanges([{ category: "automations", rowKey: "commerce-autonomy", value: level }]),
    onSuccess: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: KEYS.registry }), client.invalidateQueries({ queryKey: ["settings-hub"] })]);
      toast.success("Autonomy level saved.");
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't change the autonomy level.")),
  });
  const data = registry.data;

  return (
    <main className="flex flex-col gap-5 p-5 md:p-7" style={{ color: "var(--app-text)" }}>
      <p className="m-0 max-w-4xl rounded-xl border px-4 py-3 text-xs" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)", color: "var(--app-text-muted)" }}>
        <strong>No commerce agent runs on its own yet.</strong> This registry is the permissioned interface agents will use: each tool has a risk class, the autonomy level it needs, and whether a person must approve it. Today
        you can test-run the read-only tools here; write tools stay on their own screens. Every attempt — allowed, refused or failed — is recorded below.
      </p>

      {data && (
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
          <label className="flex items-center gap-2 text-sm font-bold">
            Autonomy level
            <select value={data.autonomyLevel} disabled={setLevel.isPending} onChange={(event) => setLevel.mutate(Number(event.target.value))} className="rounded-lg border px-2 py-1 text-sm" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
              {data.levels.map((level) => (
                <option key={level.level} value={level.level}>{level.level} · {level.label}</option>
              ))}
            </select>
          </label>
          <span className="text-xs" style={{ color: "var(--app-text-faint)" }}>{data.levels.find((level) => level.level === data.autonomyLevel)?.detail}</span>
          {data.paused && <span className="rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ background: "var(--app-danger-strong)" }}>Commerce actions paused — only read tools allowed</span>}
        </section>
      )}

      <section className="rounded-2xl border" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
        {registry.isLoading ? (
          <p className="m-0 p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading…</p>
        ) : registry.isError || !data ? (
          <div className="flex items-center gap-3 p-6 text-sm" style={{ color: "var(--app-danger-strong)" }}>
            {errorMessage(registry.error, "Couldn't load the registry.")}
            <button type="button" onClick={() => registry.refetch()} className="font-bold underline">Retry</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-xs">
              <thead style={{ color: "var(--app-text-faint)" }}>
                <tr>{["Tool", "Risk class", "Needs level", "Approval", "Now", ""].map((heading) => <th key={heading} className="px-3 py-2 font-semibold">{heading}</th>)}</tr>
              </thead>
              <tbody>{data.tools.map((tool) => <ToolRow key={tool.key} tool={tool} />)}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
        <p className="m-0 px-4 pt-3 text-sm font-bold">Tool run audit</p>
        {(runs.data ?? []).length === 0 ? (
          <p className="m-0 p-4 text-sm" style={{ color: "var(--app-text-faint)" }}>No tool has been used yet.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0 text-xs">
            {(runs.data ?? []).map((run) => (
              <li key={run.id} className="border-t px-4 py-2" style={{ borderColor: "var(--app-border)" }}>
                <span className="font-semibold">{run.toolKey}</span> ·{" "}
                <span style={{ color: run.outcome === "succeeded" ? "var(--app-success-text)" : run.outcome === "refused" ? "var(--app-warning-text)" : "var(--app-danger-strong)" }}>{run.outcome}</span> · level {run.autonomyLevel} · {run.actorType} · {formatDate(run.createdAt)} · {run.durationMs} ms
                <span className="block" style={{ color: "var(--app-text-faint)" }}>{run.refusalReason ?? run.resultSummary}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
