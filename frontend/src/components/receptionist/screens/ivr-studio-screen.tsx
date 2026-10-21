"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import {
  createVoiceIvrFlow,
  fetchVoiceIvrFlow,
  fetchVoiceIvrFlows,
  publishVoiceIvrFlow,
  rollbackVoiceIvrFlow,
  saveVoiceIvrDraft,
  simulateVoiceIvrFlow,
  validateVoiceIvrFlow,
  type VoiceIvrEdge,
  type VoiceIvrGraph,
  type VoiceIvrNode,
  type VoiceIvrNodeType,
  type VoiceIvrSimulation,
  type VoiceIvrValidation,
} from "@/lib/voice-ivr-api";
import {
  Card,
  CardHead,
  Chip,
  EmptyState,
  Notice,
  PrimaryBtn,
  SmallBtn,
} from "../rx-ui";

const inputClass =
  "h-[36px] w-full rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 text-[12px] outline-none focus:border-[#16A34A]";
const NODE_TYPES: Array<{
  value: Exclude<VoiceIvrNodeType, "start">;
  label: string;
}> = [
  { value: "greeting", label: "Greeting" },
  { value: "disclosure", label: "Disclosure" },
  { value: "get_dtmf", label: "Get keypad input" },
  { value: "speech_intent", label: "Speech intent" },
  { value: "business_hours", label: "Business hours" },
  { value: "branch", label: "Branch" },
  { value: "condition", label: "Condition" },
  { value: "lookup", label: "Lookup" },
  { value: "queue", label: "Queue" },
  { value: "ai_agent", label: "AI agent" },
  { value: "human_agent", label: "Human agent" },
  { value: "voicemail", label: "Voicemail" },
  { value: "callback", label: "Callback" },
  { value: "transfer", label: "Transfer" },
  { value: "end", label: "End" },
];
const labelFor = (type: VoiceIvrNodeType) =>
  NODE_TYPES.find((item) => item.value === type)?.label ?? "Start";
const errorText = (error: unknown) =>
  error instanceof ApiError
    ? error.message
    : error instanceof Error
      ? error.message
      : "The request could not be completed.";
const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

export function VoiceIvrStudioScreen() {
  const client = useQueryClient();
  const flows = useQuery({
    queryKey: ["voice-ivr-flows"],
    queryFn: fetchVoiceIvrFlows,
  });
  const [selectedId, setSelectedId] = useState("");
  const activeId = selectedId || flows.data?.[0]?.id || "";
  const detail = useQuery({
    queryKey: ["voice-ivr-flow", activeId],
    queryFn: () => fetchVoiceIvrFlow(activeId),
    enabled: Boolean(activeId),
  });
  const [draftState, setDraftState] = useState<{
    flowId: string;
    revision: number;
    graph: VoiceIvrGraph;
  } | null>(null);
  const graph = detail.data
    ? draftState?.flowId === detail.data.id &&
      draftState.revision === detail.data.revision
      ? draftState.graph
      : detail.data.draftGraph
    : null;
  const [name, setName] = useState("");
  const [nodeType, setNodeType] =
    useState<Exclude<VoiceIvrNodeType, "start">>("greeting");
  const [edgeFrom, setEdgeFrom] = useState("");
  const [edgeTo, setEdgeTo] = useState("");
  const [edgeCondition, setEdgeCondition] = useState("default");
  const [summary, setSummary] = useState("");
  const [rollbackVersion, setRollbackVersion] = useState("");
  const [rollbackReason, setRollbackReason] = useState("");
  const [validation, setValidation] = useState<VoiceIvrValidation | null>(null);
  const [simulation, setSimulation] = useState<VoiceIvrSimulation | null>(null);
  const [testInput, setTestInput] = useState({
    dtmf: "",
    intent: "",
    businessHours: "open" as "open" | "closed",
  });
  const [notice, setNotice] = useState("");

  const setGraph = (nextGraph: VoiceIvrGraph) => {
    if (!detail.data) return;
    setDraftState({
      flowId: detail.data.id,
      revision: detail.data.revision,
      graph: nextGraph,
    });
    setValidation(null);
    setSimulation(null);
  };

  const refresh = async (flowId?: string) => {
    await client.invalidateQueries({ queryKey: ["voice-ivr-flows"] });
    if (flowId || activeId)
      await client.invalidateQueries({
        queryKey: ["voice-ivr-flow", flowId ?? activeId],
      });
  };
  const create = useMutation({
    mutationFn: () => createVoiceIvrFlow(name.trim()),
    onSuccess: async (flow) => {
      setName("");
      setSelectedId(flow.id);
      setNotice(
        "Draft created. It will route new inbound calls after you publish it.",
      );
      await refresh(flow.id);
    },
    onError: (error) => setNotice(errorText(error)),
  });
  const save = useMutation({
    mutationFn: () => {
      if (!detail.data || !graph) throw new Error("Choose a flow first.");
      return saveVoiceIvrDraft(detail.data.id, detail.data.revision, graph);
    },
    onSuccess: async (flow) => {
      setValidation(null);
      setSimulation(null);
      setNotice("Draft saved as revision " + flow.revision + ".");
      await refresh(flow.id);
    },
    onError: (error) => setNotice(errorText(error)),
  });
  const validate = useMutation({
    mutationFn: () => {
      if (!activeId) throw new Error("Choose a flow first.");
      return validateVoiceIvrFlow(activeId);
    },
    onSuccess: (result) => {
      setValidation(result);
      setNotice(
        result.valid
          ? "Graph validation passed."
          : "Graph has validation issues; see below.",
      );
    },
    onError: (error) => setNotice(errorText(error)),
  });
  const simulate = useMutation({
    mutationFn: () => {
      if (!activeId) throw new Error("Choose a flow first.");
      return simulateVoiceIvrFlow(activeId, {
        dtmf: testInput.dtmf || undefined,
        intent: testInput.intent || undefined,
        businessHours: testInput.businessHours,
      });
    },
    onSuccess: (result) => {
      setSimulation(result);
      setNotice(
        result.outcome === "reached_end"
          ? "Simulation reached End."
          : result.valid
            ? "Simulation finished without a matching route."
            : "Fix validation issues before simulating.",
      );
    },
    onError: (error) => setNotice(errorText(error)),
  });
  const publish = useMutation({
    mutationFn: () => {
      if (!detail.data || !summary.trim())
        throw new Error("Enter a change summary before publishing a version.");
      return publishVoiceIvrFlow(
        detail.data.id,
        detail.data.revision,
        summary.trim(),
      );
    },
    onSuccess: async (flow) => {
      setSummary("");
      setValidation(null);
      setNotice(
        `Version ${flow.publishedVersion} is live for new inbound calls. Calls already in progress keep their pinned version.`,
      );
      await refresh(flow.id);
    },
    onError: (error) => setNotice(errorText(error)),
  });
  const rollback = useMutation({
    mutationFn: () => {
      if (!detail.data || !rollbackVersion || rollbackReason.trim().length < 8)
        throw new Error(
          "Choose an earlier version and enter a reason of at least 8 characters.",
        );
      return rollbackVoiceIvrFlow(
        detail.data.id,
        Number(rollbackVersion),
        detail.data.revision,
        rollbackReason.trim(),
      );
    },
    onSuccess: async (flow) => {
      setRollbackReason("");
      setNotice(
        `Rollback version ${flow.publishedVersion} is live for new inbound calls. Existing calls keep their pinned version.`,
      );
      await refresh(flow.id);
    },
    onError: (error) => setNotice(errorText(error)),
  });

  const nodes = graph?.nodes ?? [];
  const edges = graph?.edges ?? [];
  const versions = detail.data?.versions ?? [];
  const connectionTargets = nodes.filter((node) => node.type !== "start");
  const pageError = flows.error ?? detail.error;
  const hasPublishedFlow = (flows.data ?? []).some(
    (flow) => flow.publishedVersion !== null,
  );
  const busy =
    create.isPending ||
    save.isPending ||
    validate.isPending ||
    simulate.isPending ||
    publish.isPending ||
    rollback.isPending;

  const editNode = (
    nodeId: string,
    updater: (node: VoiceIvrNode) => VoiceIvrNode,
  ) => {
    if (!graph) return;
    setGraph({
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === nodeId ? updater(node) : node,
      ),
    });
  };
  const addNode = () => {
    if (!graph) return;
    const id = newId("node");
    const label =
      NODE_TYPES.find((item) => item.value === nodeType)?.label ?? nodeType;
    setGraph({
      ...graph,
      nodes: [...graph.nodes, { id, type: nodeType, label, config: {} }],
    });
    setEdgeFrom(graph.nodes[0]?.id ?? "");
    setEdgeTo(id);
  };
  const removeNode = (nodeId: string) => {
    if (
      !graph ||
      graph.nodes.find((node) => node.id === nodeId)?.type === "start"
    )
      return;
    setGraph({
      nodes: graph.nodes.filter((node) => node.id !== nodeId),
      edges: graph.edges.filter(
        (edge) => edge.from !== nodeId && edge.to !== nodeId,
      ),
    });
  };
  const addRoute = () => {
    if (!graph || !edgeFrom || !edgeTo || edgeFrom === edgeTo) return;
    const route: VoiceIvrEdge = {
      id: newId("route"),
      from: edgeFrom,
      to: edgeTo,
      condition: edgeCondition.trim() || "default",
    };
    setGraph({ ...graph, edges: [...graph.edges, route] });
  };
  const removeRoute = (routeId: string) => {
    if (!graph) return;
    setGraph({
      ...graph,
      edges: graph.edges.filter((edge) => edge.id !== routeId),
    });
  };

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[21px] font-extrabold tracking-[-.02em]">
            IVR &amp; Routing Studio
          </h1>
          <p className="mt-1 max-w-[780px] text-[12px] leading-[1.6] text-[#697586]">
            Build and test your call flow, then publish it for new inbound
            calls. Each live call stays pinned to the version it started with.
          </p>
        </div>
        <Chip tone={hasPublishedFlow ? "green" : "amber"} h={24} fontSize={11}>
          {hasPublishedFlow ? "Live runtime connected" : "No published flow"}
        </Chip>
      </div>

      <Notice
        tone={hasPublishedFlow ? "green" : "amber"}
        icon={hasPublishedFlow ? "phone" : "triangle-alert"}
      >
        {hasPublishedFlow
          ? "New inbound calls use the most recently published IVR flow. Calls already in progress remain on their pinned version. Without a published flow, the existing receptionist routing is used."
          : "No IVR flow is published yet. New inbound calls continue through the existing receptionist routing until you publish a flow."}
      </Notice>
      {notice ? (
        <div
          role="status"
          className="rounded-[9px] border border-[#D5DAE2] bg-white px-3 py-2 text-[12px] text-[#45505F]"
        >
          {notice}
        </div>
      ) : null}
      {pageError ? (
        <div
          role="alert"
          className="rounded-[9px] border border-[#FBD5D2] bg-[#FEF3F2] px-3 py-2 text-[12px] text-[#B42318]"
        >
          {errorText(pageError)}
        </div>
      ) : null}

      <div className="grid gap-[18px] xl:grid-cols-[280px_minmax(0,1fr)]">
        <Card overflow>
          <CardHead
            title="Flow drafts"
            sub={`${flows.data?.length ?? 0} saved`}
          />
          <div className="flex flex-col gap-2 p-3">
            {flows.isPending ? (
              <p className="p-2 text-[12px] text-[#697586]">Loading flows…</p>
            ) : null}
            {!flows.isPending && !flows.error && !flows.data?.length ? (
              <EmptyState
                icon="git-branch"
                title="No IVR flows"
                body="Create and publish a flow to route new inbound calls through it."
              />
            ) : null}
            {(flows.data ?? []).map((flow) => (
              <button
                key={flow.id}
                type="button"
                onClick={() => {
                  setSelectedId(flow.id);
                  setValidation(null);
                  setSimulation(null);
                }}
                className={`rounded-[9px] border px-3 py-2.5 text-left ${activeId === flow.id ? "border-[#16A34A] bg-[#F0FDF4]" : "border-[#E6E8EC] bg-white hover:bg-[#F8FAFC]"}`}
              >
                <span className="block truncate text-[12px] font-bold">
                  {flow.name}
                </span>
                <span className="mt-1 block text-[10.5px] text-[#697586]">
                  {flow.status} ·{" "}
                  {flow.publishedVersion
                    ? `version ${flow.publishedVersion}`
                    : "no published snapshot"}
                </span>
              </button>
            ))}
            <form
              className="mt-2 flex gap-2 border-t border-[#EEF0F3] pt-3"
              onSubmit={(event) => {
                event.preventDefault();
                create.mutate();
              }}
            >
              <input
                className={inputClass}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="New flow name"
                minLength={2}
                maxLength={191}
                required
                aria-label="New flow name"
              />
              <PrimaryBtn
                disabled={create.isPending || name.trim().length < 2}
                onClick={() => create.mutate()}
              >
                {create.isPending ? "Creating…" : "Create"}
              </PrimaryBtn>
            </form>
          </div>
        </Card>

        <div className="flex min-w-0 flex-col gap-[18px]">
          {!activeId && !flows.isPending ? (
            <Card>
              <EmptyState
                icon="git-branch"
                title="Choose a flow"
                body="Select a saved draft or create one to edit the call-flow outline."
              />
            </Card>
          ) : null}
          {detail.isPending && activeId ? (
            <Card>
              <p className="p-5 text-[12px] text-[#697586]">Loading draft…</p>
            </Card>
          ) : null}
          {detail.data && graph ? (
            <>
              <Card overflow>
                <CardHead
                  title={detail.data.name}
                  sub={`Revision ${detail.data.revision}`}
                  right={
                    <Chip
                      tone={detail.data.publishedVersion ? "green" : "neutral"}
                    >
                      {detail.data.publishedVersion
                        ? `Snapshot v${detail.data.publishedVersion}`
                        : "Draft only"}
                    </Chip>
                  }
                />
                <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(260px,.7fr)]">
                  <section aria-label="Accessible flow outline">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-[12px] font-extrabold">
                        Ordered node outline
                      </h2>
                      <div className="flex gap-2">
                        <select
                          className={`${inputClass} max-w-[180px]`}
                          value={nodeType}
                          onChange={(event) =>
                            setNodeType(event.target.value as typeof nodeType)
                          }
                          aria-label="New node type"
                        >
                          {NODE_TYPES.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                        <SmallBtn onClick={addNode}>Add node</SmallBtn>
                      </div>
                    </div>
                    <ol className="flex flex-col gap-2">
                      {nodes.map((node, index) => (
                        <li
                          key={node.id}
                          className="rounded-[10px] border border-[#E6E8EC] bg-white p-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#F1F3F6] text-[10px] font-extrabold">
                              {index + 1}
                            </span>
                            <Chip
                              tone={
                                node.type === "start"
                                  ? "green"
                                  : node.type === "disclosure"
                                    ? "amber"
                                    : "neutral"
                              }
                            >
                              {labelFor(node.type)}
                            </Chip>
                            <input
                              className={`${inputClass} min-w-[140px] flex-1`}
                              value={node.label}
                              maxLength={120}
                              onChange={(event) =>
                                editNode(node.id, (current) => ({
                                  ...current,
                                  label: event.target.value,
                                }))
                              }
                              aria-label={`${labelFor(node.type)} label`}
                            />
                            {node.type !== "start" ? (
                              <SmallBtn onClick={() => removeNode(node.id)}>
                                Remove
                              </SmallBtn>
                            ) : null}
                          </div>
                          {node.type === "disclosure" ? (
                            <label className="mt-2 flex items-center gap-2 text-[11px] text-[#5B6675]">
                              <input
                                type="checkbox"
                                checked={node.config?.required === true}
                                onChange={(event) =>
                                  editNode(node.id, (current) => ({
                                    ...current,
                                    config: {
                                      ...current.config,
                                      required: event.target.checked,
                                    },
                                  }))
                                }
                              />
                              Required disclosure for this flow
                            </label>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                    <div className="mt-4 rounded-[10px] border border-[#E6E8EC] bg-[#FCFCFD] p-3">
                      <h3 className="text-[11px] font-extrabold">
                        Connect route
                      </h3>
                      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                        <select
                          className={inputClass}
                          value={edgeFrom}
                          onChange={(event) => setEdgeFrom(event.target.value)}
                          aria-label="Route from"
                        >
                          <option value="">From node</option>
                          {nodes.map((node) => (
                            <option key={node.id} value={node.id}>
                              {node.label}
                            </option>
                          ))}
                        </select>
                        <input
                          className={inputClass}
                          value={edgeCondition}
                          onChange={(event) =>
                            setEdgeCondition(event.target.value)
                          }
                          aria-label="Route condition"
                          placeholder="default or dtmf:1"
                          maxLength={80}
                        />
                        <select
                          className={inputClass}
                          value={edgeTo}
                          onChange={(event) => setEdgeTo(event.target.value)}
                          aria-label="Route to"
                        >
                          <option value="">To node</option>
                          {connectionTargets.map((node) => (
                            <option key={node.id} value={node.id}>
                              {node.label}
                            </option>
                          ))}
                        </select>
                        <SmallBtn
                          onClick={addRoute}
                          disabled={!edgeFrom || !edgeTo || edgeFrom === edgeTo}
                        >
                          Connect
                        </SmallBtn>
                      </div>
                      <p className="mt-2 text-[10.5px] text-[color:var(--app-text-faintest,#667085)]">
                        Branch nodes need a route condition and a{" "}
                        <code>default</code> fallback. Supported simulation
                        conditions include <code>dtmf:1</code>,{" "}
                        <code>intent:support</code> and{" "}
                        <code>business_hours:closed</code>.
                      </p>
                      <ul className="mt-3 flex flex-col gap-1.5">
                        {edges.length ? (
                          edges.map((edge) => {
                            const from =
                              nodes.find((node) => node.id === edge.from)
                                ?.label ?? edge.from;
                            const to =
                              nodes.find((node) => node.id === edge.to)
                                ?.label ?? edge.to;
                            return (
                              <li
                                key={edge.id}
                                className="flex items-center gap-2 rounded-[7px] bg-white px-2.5 py-2 text-[11px]"
                              >
                                <span className="min-w-0 flex-1 truncate">
                                  {from} <b>→</b> {to}{" "}
                                  <span className="text-[#697586]">
                                    when {edge.condition}
                                  </span>
                                </span>
                                <SmallBtn onClick={() => removeRoute(edge.id)}>
                                  Remove
                                </SmallBtn>
                              </li>
                            );
                          })
                        ) : (
                          <li className="text-[11px] text-[color:var(--app-text-faintest,#667085)]">
                            No routes connected
                          </li>
                        )}
                      </ul>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-[#EEF0F3] pt-3">
                      <PrimaryBtn disabled={busy} onClick={() => save.mutate()}>
                        {save.isPending ? "Saving…" : "Save draft"}
                      </PrimaryBtn>
                      <SmallBtn
                        disabled={busy}
                        onClick={() => validate.mutate()}
                      >
                        {validate.isPending ? "Checking…" : "Validate"}
                      </SmallBtn>
                      <SmallBtn
                        disabled={busy}
                        onClick={() => simulate.mutate()}
                      >
                        {simulate.isPending ? "Simulating…" : "Simulate input"}
                      </SmallBtn>
                    </div>
                  </section>

                  <aside className="flex flex-col gap-3">
                    <Card overflow>
                      <CardHead title="Validation" />
                      <div className="p-3">
                        {validation ? (
                          <>
                            <Chip tone={validation.valid ? "green" : "red"}>
                              {validation.valid
                                ? "Pass"
                                : `${validation.errors.length} issue${validation.errors.length === 1 ? "" : "s"}`}
                            </Chip>
                            {validation.errors.length ? (
                              <ul className="mt-3 flex flex-col gap-2">
                                {validation.errors.map((issue, index) => (
                                  <li
                                    key={`${issue.code}-${index}`}
                                    className="text-[11px] text-[#B42318]"
                                  >
                                    {issue.message}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="mt-3 text-[11px] text-[#697586]">
                                The graph is valid. Its supported nodes run for
                                new inbound calls after publication.
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="text-[11px] text-[#697586]">
                            Run validation to check start node, reachable nodes,
                            fallback routes, and unbounded cycles.
                          </p>
                        )}
                      </div>
                    </Card>
                    <Card overflow>
                      <CardHead
                        title="Simulation input"
                        sub="Local graph only"
                      />
                      <div className="grid gap-2 p-3">
                        <label className="grid gap-1 text-[10.5px] font-bold text-[#5B6675]">
                          Keypad input
                          <input
                            className={inputClass}
                            value={testInput.dtmf}
                            onChange={(event) =>
                              setTestInput((value) => ({
                                ...value,
                                dtmf: event.target.value,
                              }))
                            }
                            placeholder="1"
                          />
                        </label>
                        <label className="grid gap-1 text-[10.5px] font-bold text-[#5B6675]">
                          Speech intent
                          <input
                            className={inputClass}
                            value={testInput.intent}
                            onChange={(event) =>
                              setTestInput((value) => ({
                                ...value,
                                intent: event.target.value,
                              }))
                            }
                            placeholder="support"
                          />
                        </label>
                        <label className="grid gap-1 text-[10.5px] font-bold text-[#5B6675]">
                          Business hours
                          <select
                            className={inputClass}
                            value={testInput.businessHours}
                            onChange={(event) =>
                              setTestInput((value) => ({
                                ...value,
                                businessHours: event.target.value as
                                  "open" | "closed",
                              }))
                            }
                          >
                            <option value="open">Open</option>
                            <option value="closed">Closed</option>
                          </select>
                        </label>
                        {simulation ? (
                          <div className="rounded-[8px] bg-[#F8FAFC] p-2.5 text-[10.5px]">
                            <b>Outcome:</b> {simulation.outcome}
                            <ol className="mt-2 list-decimal pl-4">
                              {simulation.trace.map((step) => (
                                <li key={step.nodeId}>
                                  {step.label} · {labelFor(step.type)}
                                </li>
                              ))}
                            </ol>
                          </div>
                        ) : null}
                      </div>
                    </Card>
                    <Card overflow>
                      <CardHead
                        title="Publish and rollback"
                        sub={`${versions.length} saved versions`}
                      />
                      <div className="grid gap-2 p-3">
                        <input
                          className={inputClass}
                          value={summary}
                          onChange={(event) => setSummary(event.target.value)}
                          placeholder="Version change summary"
                          maxLength={500}
                          aria-label="Version change summary"
                        />
                        <PrimaryBtn
                          disabled={busy || summary.trim().length < 4}
                          onClick={() => publish.mutate()}
                        >
                          Publish version
                        </PrimaryBtn>
                        <p className="text-[10.5px] leading-[1.45] text-[color:var(--app-text-faintest,#667085)]">
                          Validation runs again on the server. Publishing routes
                          new inbound calls through this version; calls already
                          in progress keep their pinned version.
                        </p>
                        {versions.length ? (
                          <>
                            <select
                              className={inputClass}
                              value={rollbackVersion}
                              onChange={(event) =>
                                setRollbackVersion(event.target.value)
                              }
                              aria-label="Rollback source version"
                            >
                              <option value="">Choose a prior version</option>
                              {versions
                                .filter(
                                  (version) =>
                                    version.version !==
                                    detail.data.publishedVersion,
                                )
                                .map((version) => (
                                  <option
                                    key={version.id}
                                    value={version.version}
                                  >
                                    Version {version.version} · {version.status}{" "}
                                    · {version.changeSummary}
                                  </option>
                                ))}
                            </select>
                            <input
                              className={inputClass}
                              value={rollbackReason}
                              onChange={(event) =>
                                setRollbackReason(event.target.value)
                              }
                              placeholder="Rollback reason (8+ characters)"
                              maxLength={500}
                              aria-label="Rollback reason"
                            />
                            <SmallBtn
                              disabled={
                                busy ||
                                !rollbackVersion ||
                                rollbackReason.trim().length < 8
                              }
                              onClick={() => rollback.mutate()}
                            >
                              Restore as a new version
                            </SmallBtn>
                          </>
                        ) : (
                          <p className="text-[10.5px] text-[color:var(--app-text-faintest,#667085)]">
                            No published snapshots to compare or restore yet.
                          </p>
                        )}
                      </div>
                    </Card>
                  </aside>
                </div>
              </Card>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[#E6E8EC] bg-white px-3.5 py-3 text-[11px] text-[#697586]">
                <span>
                  Per-version route outcomes, queue wait and misroutes are not
                  tracked by this studio yet.
                </span>
                <a
                  className="font-bold text-[#15803D] underline"
                  href="/receptionist/queue"
                >
                  Open existing queue &amp; rules
                </a>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
