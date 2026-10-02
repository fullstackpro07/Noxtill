"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { fetchWorkflows, type Workflow, type WorkflowAction, type WorkflowGraph, type WorkflowGraphNode } from "@/lib/workflows-api";

const NODE_W = 190;
const NODE_H = 58;
const COL_GAP = 70;
const ROW_GAP = 34;

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

/** The stored graph, or the equivalent linear graph for workflows saved before graphs existed. */
function graphOf(workflow: Workflow): { graph: WorkflowGraph; derived: boolean } {
  if (workflow.graph && workflow.graph.nodes.length > 0) return { graph: workflow.graph, derived: false };
  const nodes: WorkflowGraphNode[] = [{ id: "trigger", type: "trigger" }];
  const edges: WorkflowGraph["edges"] = [];
  let previous = "trigger";
  if (workflow.conditions.length > 0) {
    nodes.push({ id: "condition", type: "condition", conditions: workflow.conditions, conditionMode: workflow.conditionMode });
    edges.push({ source: "trigger", target: "condition", port: "next" });
    previous = "condition";
  }
  workflow.actions.forEach((action, index) => {
    const id = `step_${index}`;
    nodes.push({ id, type: "action", action });
    edges.push({ source: previous, target: id, port: previous === "condition" ? "true" : "next" });
    previous = id;
  });
  nodes.push({ id: "end", type: "end" });
  edges.push({ source: previous, target: "end", port: previous === "condition" ? "true" : "next" });
  return { graph: { schemaVersion: 1, nodes, edges }, derived: true };
}

function actionTitle(action: WorkflowAction): string {
  switch (action.type) {
    case "send_customer_message":
      return "Message customer";
    case "notify_owner":
      return "Notify owner";
    case "add_customer_tag":
      return `Tag: ${action.tagName}`;
    case "set_customer_custom_field":
      return `Set ${action.fieldName}`;
    case "wait":
      return `Wait ${action.durationMinutes} min`;
    case "request_approval":
      return "Request approval";
    case "generate_ai_draft":
      return "AI draft";
    case "map_data":
      return `Map ${action.mappings.length} field(s)`;
    case "get_variable":
      return `Read variable ${action.name}`;
  }
}

function nodeTitle(node: WorkflowGraphNode, workflow: Workflow): string {
  if (node.type === "trigger") return `When: ${workflow.triggerKey.replaceAll("_", " ")}`;
  if (node.type === "condition") return `If ${node.conditionMode === "all" ? "all" : "any"} of ${node.conditions.length}`;
  if (node.type === "end") return "End";
  return actionTitle(node.action);
}

const NODE_COLOR: Record<WorkflowGraphNode["type"], string> = {
  trigger: "var(--app-primary)",
  condition: "var(--app-warning-text)",
  action: "var(--app-text-muted)",
  end: "var(--app-text-faintest)",
};

/** Columns by longest path from the trigger; rows in order of first visit (true before false). */
function layout(graph: WorkflowGraph) {
  const depth = new Map<string, number>();
  const trigger = graph.nodes.find((node) => node.type === "trigger");
  if (trigger) depth.set(trigger.id, 0);
  for (let pass = 0; pass < graph.nodes.length; pass += 1) {
    for (const edge of graph.edges) {
      const from = depth.get(edge.source);
      if (from === undefined) continue;
      if ((depth.get(edge.target) ?? -1) < from + 1) depth.set(edge.target, from + 1);
    }
  }
  const order = [...graph.edges].sort((a, b) => (a.port === "false" ? 1 : 0) - (b.port === "false" ? 1 : 0));
  const rowOf = new Map<string, number>();
  const nextRow = new Map<number, number>();
  const place = (id: string, minRow: number) => {
    if (rowOf.has(id)) return;
    const column = depth.get(id) ?? 0;
    const row = Math.max(minRow, nextRow.get(column) ?? 0);
    rowOf.set(id, row);
    nextRow.set(column, row + 1);
    order.filter((edge) => edge.source === id).forEach((edge) => place(edge.target, row));
  };
  if (trigger) place(trigger.id, 0);
  graph.nodes.forEach((node) => place(node.id, 0));
  const position = new Map(
    graph.nodes.map((node) => [
      node.id,
      { x: 20 + (depth.get(node.id) ?? 0) * (NODE_W + COL_GAP), y: 20 + (rowOf.get(node.id) ?? 0) * (NODE_H + ROW_GAP) },
    ]),
  );
  const width = Math.max(...[...position.values()].map((p) => p.x)) + NODE_W + 40;
  const height = Math.max(...[...position.values()].map((p) => p.y)) + NODE_H + 40;
  return { position, width, height };
}

function Inspector({ node, workflow }: { node: WorkflowGraphNode; workflow: Workflow }) {
  return (
    <aside className="rounded-2xl border p-4 text-xs" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
      <p className="m-0 text-sm font-bold">{nodeTitle(node, workflow)}</p>
      <p className="m-0 mt-0.5" style={{ color: "var(--app-text-faint)" }}>Node {node.id} · {node.type}</p>
      {node.type === "trigger" && (
        <div className="mt-2 flex flex-col gap-1">
          <p className="m-0">Event: <span className="font-mono">{workflow.triggerKey}</span></p>
          {(workflow.scheduleEveryMinutes || workflow.scheduleCronExpression) && (
            <p className="m-0">Schedule: {workflow.scheduleCronExpression ? `cron ${workflow.scheduleCronExpression}` : `every ${workflow.scheduleEveryMinutes} min`} ({workflow.scheduleTimezone})</p>
          )}
        </div>
      )}
      {node.type === "condition" && (
        <ul className="m-0 mt-2 list-disc ps-5">
          {node.conditions.map((condition, index) => (
            <li key={index}><span className="font-mono">{condition.field}</span> {condition.operator.replaceAll("_", " ")} <strong>{String(condition.value)}</strong></li>
          ))}
        </ul>
      )}
      {node.type === "action" && (
        <pre className="m-0 mt-2 max-h-72 overflow-auto rounded p-2 text-[11px]" style={{ background: "var(--app-surface-2)" }}>{JSON.stringify(node.action, null, 2)}</pre>
      )}
      {node.type === "end" && <p className="m-0 mt-2">The run finishes here.</p>}
    </aside>
  );
}

export function AutomationBuilderView() {
  const query = useQuery({ queryKey: ["workflows", "builder"], queryFn: () => fetchWorkflows(false) });
  const workflows = query.data ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nodeId, setNodeId] = useState<string | null>(null);
  const workflow = workflows.find((row) => row.id === selectedId) ?? workflows[0] ?? null;
  const view = useMemo(() => {
    if (!workflow) return null;
    const { graph, derived } = graphOf(workflow);
    return { graph, derived, ...layout(graph) };
  }, [workflow]);
  const node = view?.graph.nodes.find((row) => row.id === nodeId) ?? null;

  return (
    <main className="flex flex-col gap-4 p-5 md:p-7" style={{ color: "var(--app-text)" }}>
      <p className="m-0 max-w-4xl text-xs" style={{ color: "var(--app-text-muted)" }}>
        The canvas shows each workflow exactly as it runs: trigger, conditions with their true / false paths, actions and ends. Click a node to inspect it.
        Editing happens in the workflow editor, which builds one condition branch; the engine runs any acyclic graph. Drag-and-drop editing, loops, parallel branches and sub-workflows aren&rsquo;t available yet.
      </p>
      {query.isLoading ? (
        <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading…</p>
      ) : query.isError ? (
        <div className="flex items-center gap-3 text-sm" style={{ color: "var(--app-danger-strong)" }}>
          {errorMessage(query.error, "Couldn't load workflows.")}
          <button type="button" onClick={() => query.refetch()} className="font-bold underline">Retry</button>
        </div>
      ) : !workflow || !view ? (
        <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>
          No workflows yet. <Link href="/marketing/automations" className="font-bold underline">Create one</Link>.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-bold">
              Workflow
              <select value={workflow.id} onChange={(event) => { setSelectedId(event.target.value); setNodeId(null); }} className="rounded-lg border px-2 py-1 text-sm" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
                {workflows.map((row) => <option key={row.id} value={row.id}>{row.name}{row.active ? "" : " (paused)"}</option>)}
              </select>
            </label>
            <span className="text-xs" style={{ color: "var(--app-text-faint)" }}>
              v{workflow.version} · {view.graph.nodes.length} nodes · {view.graph.edges.length} connections{view.derived ? " · shown from its step list (saved before graphs)" : ""}
            </span>
            <Link href="/marketing/automations" className="text-xs font-bold underline">Edit in workflow editor</Link>
          </div>
          <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
            <div className="overflow-auto rounded-2xl border" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)" }}>
              <svg width={view.width} height={view.height} role="img" aria-label={`Workflow graph for ${workflow.name}`}>
                {view.graph.edges.map((edge, index) => {
                  const from = view.position.get(edge.source);
                  const to = view.position.get(edge.target);
                  if (!from || !to) return null;
                  const x1 = from.x + NODE_W;
                  const y1 = from.y + NODE_H / 2;
                  const x2 = to.x;
                  const y2 = to.y + NODE_H / 2;
                  const mid = (x1 + x2) / 2;
                  return (
                    <g key={index}>
                      <path d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`} fill="none" stroke="var(--app-border)" strokeWidth={2} />
                      {edge.port !== "next" && (
                        <text x={mid} y={(y1 + y2) / 2 - 6} textAnchor="middle" fontSize={11} fontWeight={700} fill={edge.port === "true" ? "var(--app-success-text)" : "var(--app-danger-strong)"}>
                          {edge.port === "true" ? "yes" : "no"}
                        </text>
                      )}
                    </g>
                  );
                })}
                {view.graph.nodes.map((graphNode) => {
                  const p = view.position.get(graphNode.id)!;
                  const selected = graphNode.id === nodeId;
                  return (
                    <g key={graphNode.id} transform={`translate(${p.x},${p.y})`} onClick={() => setNodeId(graphNode.id)} style={{ cursor: "pointer" }} role="button" aria-label={nodeTitle(graphNode, workflow)} tabIndex={0} onKeyDown={(event) => event.key === "Enter" && setNodeId(graphNode.id)}>
                      <rect width={NODE_W} height={NODE_H} rx={12} fill="var(--app-surface)" stroke={selected ? "var(--app-primary)" : NODE_COLOR[graphNode.type]} strokeWidth={selected ? 3 : 1.5} />
                      <text x={12} y={22} fontSize={10} fontWeight={700} fill={NODE_COLOR[graphNode.type]}>{graphNode.type.toUpperCase()}</text>
                      <text x={12} y={42} fontSize={12} fontWeight={600} fill="var(--app-text)">
                        {nodeTitle(graphNode, workflow).slice(0, 26)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
            {node ? (
              <Inspector node={node} workflow={workflow} />
            ) : (
              <aside className="rounded-2xl border p-4 text-xs" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-faint)" }}>Select a node to inspect it.</aside>
            )}
          </div>
        </>
      )}
    </main>
  );
}
