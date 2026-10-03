"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { fetchAutomationAgents } from "@/lib/automation-command-center-api";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
      <p className="m-0 text-[11px]" style={{ color: "var(--app-text-faint)" }}>{label}</p>
      <p className="m-0 text-lg font-bold">{value}</p>
    </div>
  );
}

export function AutomationAgentsView() {
  const overview = useQuery({ queryKey: ["automation-agents"], queryFn: fetchAutomationAgents });
  const data = overview.data;
  const agents = data?.agents ?? [];

  return (
    <main className="flex flex-col gap-5 p-5 md:p-7" style={{ color: "var(--app-text)" }}>
      <p className="m-0 max-w-4xl text-xs" style={{ color: "var(--app-text-muted)" }}>
        An <strong>AI agent</strong> step works toward a goal you write, using only the read-only tools you tick (customer profile, customer orders, run values) for that run&rsquo;s own customer.
        It makes at most the number of model calls you set (up to 5), never sends or changes anything, and saves its answer as {"{{agentAnswer}}"} for the steps after it. Add it from the{" "}
        <Link href="/marketing/automations" className="underline">workflow editor</Link>.
      </p>

      {overview.isLoading ? (
        <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading…</p>
      ) : overview.isError ? (
        <p className="m-0 text-sm" style={{ color: "var(--app-danger-strong)" }}>{errorMessage(overview.error, "Couldn't load agents.")}</p>
      ) : (
        <>
          {data && !data.enabledInAiSettings && (
            <p className="m-0 rounded-xl border p-3 text-xs" style={{ borderColor: "var(--app-warning-text)", color: "var(--app-warning-text)" }}>
              &ldquo;Workflow AI drafts &amp; agents&rdquo; is switched off in <Link href="/assistant/settings" className="font-bold underline">AI Settings</Link>, so agent and AI-draft steps fail until it&rsquo;s turned back on.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Workflows with an agent step" value={agents.length} />
            <Stat label="Workflow AI calls this month" value={data?.monthWorkflowAiCalls ?? 0} />
            <Stat label="Workflow AI cost this month (est.)" value={`$${(data?.monthWorkflowAiCostUsd ?? 0).toFixed(2)}`} />
          </div>
          <p className="m-0 -mt-3 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
            Monthly calls and cost include AI-draft steps too; they share one AI usage type. Per-run cost isn&rsquo;t tracked.
          </p>

          {agents.length === 0 ? (
            <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>
              No workflow uses an AI agent step yet. Open a workflow, add a step and choose &ldquo;AI agent (read-only)&rdquo;.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {agents.map((agent) => (
                <article key={agent.workflowId} className="rounded-2xl border p-4 text-xs" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="m-0 text-sm font-bold">{agent.name}</p>
                    <span style={{ color: agent.active ? "var(--app-success-text)" : "var(--app-text-faint)" }}>{agent.active ? "On" : "Paused"} · trigger {agent.triggerKey.replaceAll("_", " ")}</span>
                  </div>
                  {agent.steps.map((step, index) => (
                    <div key={index} className="mt-2 rounded-lg border p-2" style={{ borderColor: "var(--app-border)" }}>
                      <p className="m-0 font-semibold">&ldquo;{step.goal}&rdquo;</p>
                      <p className="m-0 mt-1" style={{ color: "var(--app-text-muted)" }}>
                        Tools: {step.tools.length ? step.tools.map((tool) => tool.label).join(", ") : "none"} · up to {step.maxSteps} model call{step.maxSteps === 1 ? "" : "s"}
                      </p>
                    </div>
                  ))}
                  <p className="m-0 mt-2" style={{ color: "var(--app-text-muted)" }}>
                    Last 30 days: {agent.last30Days.agentRuns} agent run{agent.last30Days.agentRuns === 1 ? "" : "s"} · {agent.last30Days.completed} answered · {agent.last30Days.failed} failed ·{" "}
                    {agent.last30Days.toolCalls} tool call{agent.last30Days.toolCalls === 1 ? "" : "s"}
                    {agent.last30Days.blockedToolCalls > 0 ? ` (${agent.last30Days.blockedToolCalls} blocked — tool not allowed)` : ""} ·{" "}
                    {(agent.last30Days.inputTokens + agent.last30Days.outputTokens).toLocaleString()} tokens
                  </p>
                  <Link href="/marketing/automations/executions" className="mt-1 inline-block underline">See runs and each tool call in Executions</Link>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      <section className="rounded-2xl border p-4 text-xs" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
        <p className="m-0 text-sm font-bold">Not available yet</p>
        <p className="m-0 mt-1" style={{ color: "var(--app-text-muted)" }}>
          Agents live inside a workflow step; there are no separate agent profiles to reuse. Agents can&rsquo;t write, send or call outside services, have no memory between runs, and can&rsquo;t hand off to other agents.
          There are no evaluations, test playground or model choice; every call uses the server&rsquo;s default AI model.
        </p>
      </section>
    </main>
  );
}
