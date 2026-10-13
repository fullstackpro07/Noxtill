"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import {
  approveVoiceAiAgent,
  createVoiceAiAgent,
  fetchVoiceAiAgents,
  pauseVoiceAiAgent,
  publishVoiceAiAgent,
  rollbackVoiceAiAgent,
  saveVoiceAiAgentDraft,
  testVoiceAiAgent,
  type VoiceAiAgent,
  type VoiceAiAgentDraftInput,
  type VoiceAiTemplate,
} from "@/lib/voice-ai-agents-api";
import { Card, CardHead, Chip, PrimaryBtn } from "../rx-ui";
import { Ico } from "../rx-icon";

const blankDraft: VoiceAiAgentDraftInput = {
  name: "",
  template: "receptionist",
  purpose: "Answer caller questions and route requests to the right next step",
  voiceStyle: "Warm, concise and clear",
  instructions: "",
  escalationGuidance:
    "Offer to transfer or take a message when the request needs a person",
  languages: [],
  toolPermissions: ["book", "message", "transfer", "end"],
  knowledgeSourceIds: [],
  maxTokensPerResponse: 320,
};

const templateName = (value: VoiceAiTemplate) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const inputClass =
  "mt-1 h-[36px] w-full rounded-[9px] border border-[#D5DAE2] bg-white px-2.5 text-[12px] text-[#0F172A] outline-none focus:border-[#16A34A]";

export function AiAgentsPanel() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["voice-ai-agents"],
    queryFn: fetchVoiceAiAgents,
  });
  const agents = useMemo(() => query.data?.agents ?? [], [query.data?.agents]);
  const [selectedId, setSelectedId] = useState("");
  const [draftOverride, setDraftOverride] =
    useState<VoiceAiAgentDraftInput | null>(null);
  const [scenario, setScenario] = useState(
    "A caller asks whether the business can help with a booking change",
  );
  const [rollbackVersionId, setRollbackVersionId] = useState("");
  const [rollbackReason, setRollbackReason] = useState("");
  const [notice, setNotice] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const selected = showCreate
    ? null
    : (agents.find((agent) => agent.id === selectedId) ?? agents[0] ?? null);
  const draftVersion =
    selected?.versions.find(
      (version) => version.id === selected.currentDraftVersionId,
    ) ?? null;
  const publishedVersion =
    selected?.versions.find(
      (version) => version.id === selected.publishedVersionId,
    ) ?? null;
  const earlierPublished =
    selected?.versions.filter(
      (version) =>
        version.publishedAt && version.id !== selected.publishedVersionId,
    ) ?? [];
  const rollbackTargetId = earlierPublished.some(
    (version) => version.id === rollbackVersionId,
  )
    ? rollbackVersionId
    : (earlierPublished[0]?.id ?? "");
  const sourceVersion = draftVersion ?? publishedVersion;
  const draft =
    draftOverride ??
    (selected && sourceVersion
      ? {
          name: selected.name,
          template: selected.template,
          purpose: sourceVersion.config.purpose,
          voiceStyle: sourceVersion.config.voiceStyle,
          instructions: sourceVersion.config.instructions,
          escalationGuidance: sourceVersion.config.escalationGuidance,
          languages: sourceVersion.config.languages,
          toolPermissions: sourceVersion.config.toolPermissions ?? [
            "book",
            "message",
            "transfer",
            "end",
          ],
          knowledgeSourceIds: sourceVersion.config.knowledgeSourceIds ?? [],
          maxTokensPerResponse:
            sourceVersion.config.maxTokensPerResponse ?? 320,
        }
      : blankDraft);
  const unsavedChanges = Boolean(
    draftOverride &&
    draftVersion &&
    (draft.name !== selected?.name ||
      draft.template !== selected?.template ||
      draft.purpose !== draftVersion.config.purpose ||
      draft.voiceStyle !== draftVersion.config.voiceStyle ||
      draft.instructions !== draftVersion.config.instructions ||
      draft.escalationGuidance !== draftVersion.config.escalationGuidance ||
      JSON.stringify(draft.languages) !==
        JSON.stringify(draftVersion.config.languages) ||
      JSON.stringify(draft.toolPermissions) !==
        JSON.stringify(
          draftVersion.config.toolPermissions ?? [
            "book",
            "message",
            "transfer",
            "end",
          ],
        ) ||
      JSON.stringify(draft.knowledgeSourceIds) !==
        JSON.stringify(draftVersion.config.knowledgeSourceIds ?? []) ||
      draft.maxTokensPerResponse !==
        (draftVersion.config.maxTokensPerResponse ?? 320)),
  );

  const refresh = async () =>
    queryClient.invalidateQueries({ queryKey: ["voice-ai-agents"] });
  const create = useMutation({
    mutationFn: () => createVoiceAiAgent(draft),
    onSuccess: async (result) => {
      setSelectedId(result.id);
      setShowCreate(false);
      setDraftOverride(null);
      setNotice(`Draft version ${result.version} created`);
      await refresh();
    },
    onError: (error) =>
      setNotice(
        error instanceof ApiError
          ? error.message
          : "Could not create the AI agent draft",
      ),
  });
  const save = useMutation({
    mutationFn: () =>
      selected
        ? saveVoiceAiAgentDraft(selected.id, draft)
        : Promise.reject(new Error("Choose an agent first")),
    onSuccess: async (result) => {
      setDraftOverride(null);
      setNotice(`Saved immutable draft version ${result.version}`);
      await refresh();
    },
    onError: (error) =>
      setNotice(
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Could not save this draft",
      ),
  });
  const test = useMutation({
    mutationFn: () =>
      selected
        ? testVoiceAiAgent(selected.id, scenario)
        : Promise.reject(new Error("Choose an agent first")),
    onSuccess: async (result) => {
      setNotice(
        result.passed
          ? `Sandbox test passed for v${result.version}`
          : (result.errorMessage ?? "Sandbox test did not pass"),
      );
      await refresh();
    },
    onError: (error) =>
      setNotice(
        error instanceof ApiError
          ? error.message
          : "Sandbox test could not run",
      ),
  });
  const publish = useMutation({
    mutationFn: () =>
      selected
        ? publishVoiceAiAgent(selected.id)
        : Promise.reject(new Error("Choose an agent first")),
    onSuccess: async (result) => {
      setNotice(`Version ${result.version} is published for new inbound calls`);
      await refresh();
    },
    onError: (error) =>
      setNotice(
        error instanceof ApiError
          ? error.message
          : "Could not publish this version",
      ),
  });
  const approve = useMutation({
    mutationFn: () =>
      selected
        ? approveVoiceAiAgent(selected.id)
        : Promise.reject(new Error("Choose an agent first")),
    onSuccess: async (result) => {
      setNotice(`Tested version ${result.version} approved for publishing`);
      await refresh();
    },
    onError: (error) =>
      setNotice(
        error instanceof ApiError
          ? error.message
          : "Could not approve this version",
      ),
  });
  const rollback = useMutation({
    mutationFn: () =>
      selected
        ? rollbackVoiceAiAgent(selected.id, rollbackTargetId, rollbackReason)
        : Promise.reject(new Error("Choose an agent first")),
    onSuccess: async (result) => {
      setNotice(`Rolled back to published version ${result.version}`);
      setRollbackReason("");
      await refresh();
    },
    onError: (error) =>
      setNotice(
        error instanceof ApiError
          ? error.message
          : "Could not roll back this agent",
      ),
  });
  const pause = useMutation({
    mutationFn: () =>
      selected
        ? pauseVoiceAiAgent(selected.id)
        : Promise.reject(new Error("Choose an agent first")),
    onSuccess: async () => {
      setNotice(
        "Agent paused; calls already in progress keep their pinned version",
      );
      await refresh();
    },
    onError: (error) =>
      setNotice(
        error instanceof ApiError
          ? error.message
          : "Could not pause this agent",
      ),
  });

  const pending =
    create.isPending ||
    save.isPending ||
    test.isPending ||
    approve.isPending ||
    publish.isPending ||
    rollback.isPending ||
    pause.isPending;
  const latestTestPassed = Boolean(draftVersion?.latestTest?.passed);
  const qualityAnalyst = draft.template === "quality_analyst";
  const editing = showCreate || Boolean(selected);
  const updateDraft = <K extends keyof VoiceAiAgentDraftInput>(
    key: K,
    value: VoiceAiAgentDraftInput[K],
  ) => setDraftOverride((current) => ({ ...(current ?? draft), [key]: value }));

  return (
    <Card overflow>
      <CardHead
        icon="bot"
        iconColor="#16A34A"
        title="AI voice agents"
        sub="Immutable versions · sandbox tests · owner-published live configuration"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EEF0F3] px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {agents.map((agent: VoiceAiAgent) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => {
                setSelectedId(agent.id);
                setDraftOverride(null);
                setRollbackVersionId("");
                setShowCreate(false);
                setNotice("");
              }}
              className={`rounded-[8px] border px-3 py-2 text-left text-[11px] ${selected?.id === agent.id ? "border-[#16A34A] bg-[#ECFDF3] text-[#14532D]" : "border-[#E2E6EA] bg-white text-[#475467]"}`}
            >
              <span className="font-bold">{agent.name}</span>
              <span className="ml-2">{agent.status}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setShowCreate(true);
            setSelectedId("");
            setDraftOverride(blankDraft);
            setNotice("");
          }}
          className="rounded-[8px] border border-[#D5DAE2] bg-white px-3 py-2 text-[11px] font-bold text-[#334155] hover:bg-[#F8FAFC]"
        >
          New AI agent
        </button>
      </div>

      {query.isPending ? (
        <div className="p-4 text-[12px] text-[#7A8798]">
          Loading AI agent versions…
        </div>
      ) : query.error ? (
        <div
          role="alert"
          className="m-4 rounded-[9px] border border-[#FBD5D2] bg-[#FEF3F2] p-3 text-[12px] text-[#B42318]"
        >
          {query.error instanceof ApiError
            ? query.error.message
            : "AI agent versions could not be loaded"}
        </div>
      ) : null}
      {notice ? (
        <div
          role="status"
          className="mx-4 mt-3 rounded-[9px] border border-[#D5EAD9] bg-[#F0FDF4] p-2.5 text-[11px] text-[#166534]"
        >
          {notice}
        </div>
      ) : null}
      {!agents.length && !showCreate && !query.isPending && !query.error ? (
        <div className="px-4 py-5 text-[12px] text-[#64748B]">
          No AI agent versions exist for this business yet. Create a draft to
          start; creating it does not activate it.
        </div>
      ) : null}

      {editing ? (
        <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(260px,.72fr)]">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-[11px] font-bold text-[#5B6675]">
              Agent name
              <input
                className={inputClass}
                maxLength={120}
                value={draft.name}
                onChange={(event) => updateDraft("name", event.target.value)}
              />
            </label>
            <label className="text-[11px] font-bold text-[#5B6675]">
              Template
              <select
                className={inputClass}
                value={draft.template}
                onChange={(event) =>
                  updateDraft("template", event.target.value as VoiceAiTemplate)
                }
              >
                {(query.data?.templates ?? []).map((template) => (
                  <option key={template} value={template}>
                    {templateName(template)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] font-bold text-[#5B6675] sm:col-span-2">
              Purpose
              <textarea
                className="mt-1 min-h-[68px] w-full rounded-[9px] border border-[#D5DAE2] p-2.5 text-[12px] outline-none focus:border-[#16A34A]"
                maxLength={240}
                value={draft.purpose}
                onChange={(event) => updateDraft("purpose", event.target.value)}
              />
            </label>
            <label className="text-[11px] font-bold text-[#5B6675]">
              Voice style
              <input
                className={inputClass}
                maxLength={160}
                value={draft.voiceStyle}
                onChange={(event) =>
                  updateDraft("voiceStyle", event.target.value)
                }
              />
            </label>
            <label className="text-[11px] font-bold text-[#5B6675]">
              Languages
              <input
                className={inputClass}
                value={draft.languages.join(", ")}
                onChange={(event) =>
                  updateDraft(
                    "languages",
                    event.target.value
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean),
                  )
                }
                placeholder="English, Urdu"
              />
            </label>
            <label className="text-[11px] font-bold text-[#5B6675] sm:col-span-2">
              Owner instructions
              <textarea
                className="mt-1 min-h-[90px] w-full rounded-[9px] border border-[#D5DAE2] p-2.5 text-[12px] outline-none focus:border-[#16A34A]"
                maxLength={2000}
                value={draft.instructions}
                onChange={(event) =>
                  updateDraft("instructions", event.target.value)
                }
                placeholder="Keep answers brief and never guess business facts"
              />
            </label>
            <label className="text-[11px] font-bold text-[#5B6675] sm:col-span-2">
              Escalation guidance
              <textarea
                className="mt-1 min-h-[65px] w-full rounded-[9px] border border-[#D5DAE2] p-2.5 text-[12px] outline-none focus:border-[#16A34A]"
                maxLength={500}
                value={draft.escalationGuidance}
                onChange={(event) =>
                  updateDraft("escalationGuidance", event.target.value)
                }
              />
            </label>
            <fieldset className="sm:col-span-2">
              <legend className="text-[11px] font-bold text-[#5B6675]">
                Allowed live actions
              </legend>
              <div className="mt-2 flex flex-wrap gap-3">
                {(query.data?.tools ?? []).map((tool) => (
                  <label
                    key={tool}
                    className="flex items-center gap-1.5 text-[11px] text-[#475467]"
                  >
                    <input
                      type="checkbox"
                      checked={draft.toolPermissions.includes(tool)}
                      onChange={(event) =>
                        updateDraft(
                          "toolPermissions",
                          event.target.checked
                            ? [...draft.toolPermissions, tool]
                            : draft.toolPermissions.filter(
                                (value) => value !== tool,
                              ),
                        )
                      }
                    />
                    {tool === "end" ? "End call" : tool}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-[#7A8798]">
                The server blocks disabled actions even if the AI requests them.
              </p>
            </fieldset>
            <fieldset className="sm:col-span-2">
              <legend className="text-[11px] font-bold text-[#5B6675]">
                Knowledge sources this agent may use
              </legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(query.data?.knowledgeSources ?? []).map((source) => (
                  <label
                    key={source.id}
                    className="flex items-start gap-2 text-[11px] text-[#475467]"
                  >
                    <input
                      type="checkbox"
                      checked={draft.knowledgeSourceIds.includes(source.id)}
                      onChange={(event) =>
                        updateDraft(
                          "knowledgeSourceIds",
                          event.target.checked
                            ? [...draft.knowledgeSourceIds, source.id]
                            : draft.knowledgeSourceIds.filter(
                                (id) => id !== source.id,
                              ),
                        )
                      }
                    />
                    <span>
                      {source.title}{" "}
                      <span className="text-[#7A8798]">· {source.kind}</span>
                    </span>
                  </label>
                ))}
                {!query.data?.knowledgeSources?.length ? (
                  <p className="text-[10px] text-[#7A8798]">
                    No active business knowledge sources are available.
                  </p>
                ) : null}
              </div>
            </fieldset>
            <label className="text-[11px] font-bold text-[#5B6675] sm:col-span-2">
              Maximum output tokens per AI response
              <input
                className={inputClass}
                type="number"
                min={32}
                max={1000}
                step={1}
                value={draft.maxTokensPerResponse}
                onChange={(event) =>
                  updateDraft(
                    "maxTokensPerResponse",
                    Number(event.target.value),
                  )
                }
              />
            </label>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <PrimaryBtn
                disabled={
                  pending ||
                  !draft.name.trim() ||
                  draft.purpose.trim().length < 8
                }
                onClick={() => (showCreate ? create.mutate() : save.mutate())}
              >
                {pending
                  ? "Working…"
                  : showCreate
                    ? "Create draft v1"
                    : "Save as new draft version"}
              </PrimaryBtn>
              {!showCreate ? (
                <button
                  type="button"
                  disabled={
                    pending || !draftVersion || qualityAnalyst || unsavedChanges
                  }
                  onClick={() => test.mutate()}
                  className="rounded-[8px] border border-[#D5DAE2] px-3 py-2 text-[11px] font-bold text-[#334155] disabled:opacity-50"
                >
                  Test draft with AI
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Card pad={14} border="#D7E8DC">
              <div className="flex items-center gap-2 text-[12px] font-extrabold text-[#14532D]">
                <Ico name="flask-conical" size={14} />
                Sandbox test
              </div>
              <p className="mt-1.5 text-[10px] leading-4 text-[#64748B]">
                Uses the business AI budget. Scenario text is simulated and does
                not place a call or write business data.
              </p>
              {!showCreate && draftVersion ? (
                <>
                  <div className="mt-2 text-[10px] font-bold text-[#475467]">
                    Draft v{draftVersion.version} ·{" "}
                    {draftVersion.checksum.slice(0, 12)}…
                  </div>
                  <textarea
                    className="mt-2 min-h-[60px] w-full rounded-[8px] border border-[#D5DAE2] p-2 text-[11px]"
                    value={scenario}
                    onChange={(event) => setScenario(event.target.value)}
                  />
                  {draftVersion.latestTest ? (
                    <div className="mt-2 rounded-[8px] bg-[#F8FAFC] p-2 text-[10px]">
                      <div className="font-bold">
                        Latest test{" "}
                        {draftVersion.latestTest.passed
                          ? "passed"
                          : "did not pass"}{" "}
                        ·{" "}
                        {draftVersion.latestTest.inputTokens +
                          draftVersion.latestTest.outputTokens}{" "}
                        tokens
                      </div>
                      {draftVersion.latestTest.response ? (
                        <p className="mt-1 whitespace-pre-wrap text-[#475467]">
                          {draftVersion.latestTest.response}
                        </p>
                      ) : (
                        <p className="mt-1 text-[#B42318]">
                          {draftVersion.latestTest.errorMessage ??
                            draftVersion.latestTest.errorCode ??
                            "No successful response was recorded"}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 text-[10px] text-[#7A8798]">
                      No test has been recorded for this version.
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-2 text-[10px] text-[#7A8798]">
                  Save the draft first to run a sandbox test.
                </p>
              )}
            </Card>
            {!showCreate ? (
              <Card pad={14}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[12px] font-extrabold">Publishing</div>
                    <div className="mt-1 text-[10px] text-[#64748B]">
                      Only the owner can publish. New inbound calls pin this
                      exact version.
                    </div>
                  </div>
                  <Chip
                    tone={selected?.status === "active" ? "green" : "neutral"}
                  >
                    {selected?.status ?? "draft"}
                  </Chip>
                </div>
                <div className="mt-2 text-[10px] text-[#475467]">
                  Current live version:{" "}
                  {publishedVersion ? `v${publishedVersion.version}` : "None"}
                </div>
                <div className="mt-1 text-[10px] text-[#475467]">
                  Draft approval:{" "}
                  {draftVersion?.approvedAt
                    ? `approved ${new Date(draftVersion.approvedAt).toLocaleString()}`
                    : "not approved"}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={
                      pending ||
                      !draftVersion ||
                      !latestTestPassed ||
                      Boolean(draftVersion.approvedAt) ||
                      unsavedChanges ||
                      qualityAnalyst
                    }
                    onClick={() => approve.mutate()}
                    className="rounded-[8px] border border-[#D5DAE2] px-3 py-2 text-[11px] font-bold text-[#334155] disabled:opacity-50"
                  >
                    Approve tested draft
                  </button>
                  <button
                    type="button"
                    disabled={
                      pending ||
                      !draftVersion ||
                      !latestTestPassed ||
                      !draftVersion.approvedAt ||
                      unsavedChanges ||
                      qualityAnalyst
                    }
                    onClick={() => publish.mutate()}
                    className="rounded-[8px] bg-[#15803D] px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50"
                  >
                    Publish approved draft
                  </button>
                  {selected?.status === "active" ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => pause.mutate()}
                      className="rounded-[8px] border border-[#D5DAE2] px-3 py-2 text-[11px] font-bold text-[#334155] disabled:opacity-50"
                    >
                      Pause
                    </button>
                  ) : null}
                </div>
                {earlierPublished.length ? (
                  <div className="mt-3 border-t border-[#EEF0F3] pt-3">
                    <div className="text-[11px] font-bold text-[#475467]">
                      Rollback to published version
                    </div>
                    <select
                      className={`${inputClass} mb-2`}
                      value={rollbackTargetId}
                      onChange={(event) =>
                        setRollbackVersionId(event.target.value)
                      }
                    >
                      {earlierPublished.map((version) => (
                        <option key={version.id} value={version.id}>
                          Version {version.version} ·{" "}
                          {new Date(version.publishedAt!).toLocaleDateString()}
                        </option>
                      ))}
                    </select>
                    <input
                      className={inputClass}
                      value={rollbackReason}
                      onChange={(event) =>
                        setRollbackReason(event.target.value)
                      }
                      placeholder="Required reason for rollback"
                      maxLength={500}
                    />
                    <button
                      type="button"
                      disabled={
                        pending ||
                        rollbackReason.trim().length < 8 ||
                        !rollbackTargetId
                      }
                      onClick={() => rollback.mutate()}
                      className="mt-2 rounded-[8px] border border-[#D5DAE2] px-3 py-2 text-[11px] font-bold text-[#334155] disabled:opacity-50"
                    >
                      Rollback with reason
                    </button>
                  </div>
                ) : null}
              </Card>
            ) : null}
            <div className="rounded-[9px] border border-[#FDE49B] bg-[#FFFBEB] p-3 text-[10px] leading-4 text-[#7A5B2C]">
              Live actions are restricted by the allowlist above, and knowledge
              retrieval uses only selected sources. Each response has the
              configured output-token ceiling. A passing sandbox test and
              explicit owner approval are required before publishing. Quality
              Analyst is a template only; offline quality analysis is not
              implemented in this slice.
              {qualityAnalyst
                ? " This template cannot be AI-tested or published as a live receptionist."
                : ""}
            </div>
          </div>
        </div>
      ) : selected ? (
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 text-[11px] text-[#64748B]">
          <Chip tone={selected.status === "active" ? "green" : "neutral"}>
            {selected.status}
          </Chip>
          <span>{selected.versions.length} stored version(s)</span>
          <span>Draft {draftVersion ? `v${draftVersion.version}` : "—"}</span>
          <span>
            Published {publishedVersion ? `v${publishedVersion.version}` : "—"}
          </span>
        </div>
      ) : null}
      <div className="border-t border-[#EEF0F3] px-4 py-2 text-[10px] text-[#7A8798]">
        {query.data?.limitations.tools ??
          "Published agent versions enforce their saved action allowlist, selected knowledge sources and response-token ceiling."}{" "}
        {query.data?.limitations.liveRouting ??
          "Fresh available human profiles with capacity can receive AI-to-human handoffs; a classified caller topic now prefers an exact matching skill tag. Browser softphone is not configured."}
      </div>
    </Card>
  );
}
