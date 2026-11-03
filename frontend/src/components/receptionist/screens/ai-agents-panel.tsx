"use client";

import { safetyAttackPackFields } from "@/lib/voice-safety-attack-pack";
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { useBranchContextStore } from "@/store/branch-context-store";
import {
  approveVoiceAiAgent,
  createVoiceAiAgent,
  fetchVoiceAiAgents,
  pauseVoiceAiAgent,
  previewVoiceAiAgent,
  publishVoiceAiAgent,
  rollbackVoiceAiAgent,
  saveVoiceAiAgentDraft,
  testVoiceAiAgent,
  testVoiceAiAgentScenarios,
  type VoiceAiSafetyReview,
  voiceAiControls,
  type VoiceAiAgent,
  type VoiceAiAgentDraftInput,
  type VoiceAiAgentScenarioChecks,
  type VoiceAiTemplate,
} from "@/lib/voice-ai-agents-api";
import { Card, CardHead, Chip, PrimaryBtn } from "../rx-ui";
import { Ico } from "../rx-icon";
import { AiAgentControlsFields } from "./ai-agent-controls-fields";

const blankDraft: VoiceAiAgentDraftInput = {
  ...voiceAiControls(),
  name: "",
  template: "receptionist",
  purpose: "Answer caller questions and route requests to the right next step",
  voiceStyle: "Warm, concise and clear",
  instructions: "",
  exclusions: [],
  dialogue: {
    greeting: "",
    disclosures: [],
    requiredQuestions: [],
    clarificationPrompt: "",
    edgeCases: [],
  },
  realtimeVoice: "marin",
  escalationGuidance:
    "Offer to transfer or take a message when the request needs a person",
  languages: [],
  toolPermissions: ["book", "message", "transfer", "end"],
  knowledgeSourceIds: [],
  maxTokensPerResponse: 320,
  monthlyBudgetUsd: null,
  assignedOwnerBusinessUserId: null,
};

const lines = (value: string) =>
  value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

const checksByScenario = (value: string, count: number) => {
  const rows = value.split("\n");
  if (rows.slice(count).some((row) => row.trim()))
    throw new Error("Enter no more check rows than scenarios.");
  return Array.from({ length: count }, (_, index) =>
    (rows[index] ?? "")
      .split(";")
      .map((phrase) => phrase.trim())
      .filter(Boolean),
  );
};

const pcm16WavDataUrl = (base64: string, sampleRate: number) => {
  const pcm = atob(base64);
  const bytes = new Uint8Array(44 + pcm.length);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1)
      bytes[offset + index] = value.charCodeAt(index);
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, pcm.length, true);
  for (let index = 0; index < pcm.length; index += 1)
    bytes[44 + index] = pcm.charCodeAt(index);
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  return `data:audio/wav;base64,${btoa(binary)}`;
};

const templateName = (value: VoiceAiTemplate) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const inputClass =
  "mt-1 h-[36px] w-full rounded-[9px] border border-[#D5DAE2] bg-white px-2.5 text-[12px] text-[#0F172A] outline-none focus:border-[#16A34A]";
const toolLabels: Record<string, string> = {
  end: "End call",
  catalog: "Read service catalog",
  slots: "Check booking slots",
  customer_lookup: "Match caller number (minimal data)",
  reschedule: "Reschedule verified booking",
  support_ticket: "Create verified support ticket",
  inbox_draft: "Save message draft (never sends)",
};
const wizardSteps = [
  "Create",
  "Goal & scope",
  "Persona",
  "Language & audio",
  "Knowledge",
  "Tool permissions",
  "Dialogue",
  "Transfers",
  "Availability",
  "Guardrails & budget",
  "Test lab",
  "Approve & publish",
];
function WizardSection({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return (
    <div style={{ display: active ? "contents" : "none" }}>{children}</div>
  );
}

export function AiAgentsPanel() {
  const queryClient = useQueryClient();
  const selectedBranchId = useBranchContextStore((state) => state.selectedBranchId);
  const query = useQuery({
    queryKey: ["voice-ai-agents", selectedBranchId],
    queryFn: fetchVoiceAiAgents,
  });
  const agents = useMemo(() => query.data?.agents ?? [], [query.data?.agents]);
  const [selectedId, setSelectedId] = useState("");
  const [draftOverride, setDraftOverride] =
    useState<VoiceAiAgentDraftInput | null>(null);
  const [scenario, setScenario] = useState(
    "A caller asks whether the business can help with a booking change",
  );
  const [scenarioSuiteText, setScenarioSuiteText] = useState(
    "A caller asks for a service price\nA caller asks to change an existing booking\nA caller asks for something outside the agent's permitted scope",
  );
  const [scenarioMustIncludeText, setScenarioMustIncludeText] = useState("");
  const [scenarioMustNotIncludeText, setScenarioMustNotIncludeText] =
    useState("");
  const [scenarioExpectedIntentText, setScenarioExpectedIntentText] =
    useState("");
  const [scenarioSuiteResult, setScenarioSuiteResult] = useState<{
    nonEmptyResponses: number;
    scenarioCount: number;
    requestedScenarioCount: number;
    stoppedEarly: boolean;
    evaluatedScenarioCount: number;
    assertionPassedCount: number;
    assertionFailedCount: number;
    results: {
      id: string;
      passed: boolean;
      evaluationStatus: "not_evaluated" | "passed" | "failed";
      assertionFailures: string[];
        expectedIntent: VoiceAiAgentScenarioChecks["expectedIntent"] | null;
        actualIntent: VoiceAiAgentScenarioChecks["expectedIntent"] | null;
      errorCode: string | null;
      response: string | null;
      errorMessage: string | null;
      inputTokens: number;
      outputTokens: number;
      safetyReview?: VoiceAiSafetyReview | null;
    }[];
  } | null>(null);
  const [scenarioSafetyReview, setScenarioSafetyReview] = useState(false);
  const [rollbackVersionId, setRollbackVersionId] = useState("");
  const [rollbackReason, setRollbackReason] = useState("");
  const [notice, setNotice] = useState("");
  const [voicePreviewUrl, setVoicePreviewUrl] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
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
          ...voiceAiControls(sourceVersion.config),
          name: selected.name,
          template: selected.template,
          purpose: sourceVersion.config.purpose,
          voiceStyle: sourceVersion.config.voiceStyle,
          instructions: sourceVersion.config.instructions,
          exclusions: sourceVersion.config.exclusions ?? [],
          dialogue: {
            greeting: sourceVersion.config.dialogue?.greeting ?? "",
            disclosures: sourceVersion.config.dialogue?.disclosures ?? [],
            requiredQuestions:
              sourceVersion.config.dialogue?.requiredQuestions ?? [],
            clarificationPrompt:
              sourceVersion.config.dialogue?.clarificationPrompt ?? "",
            edgeCases: sourceVersion.config.dialogue?.edgeCases ?? [],
          },
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
          monthlyBudgetUsd: sourceVersion.config.monthlyBudgetUsd ?? null,
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
      JSON.stringify(draft.exclusions) !==
        JSON.stringify(draftVersion.config.exclusions ?? []) ||
      JSON.stringify(draft.dialogue) !==
        JSON.stringify(draftVersion.config.dialogue ?? {}) ||
      draft.realtimeVoice !== (draftVersion.config.realtimeVoice ?? "marin") ||
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
        (draftVersion.config.maxTokensPerResponse ?? 320) ||
      draft.monthlyBudgetUsd !==
        (draftVersion.config.monthlyBudgetUsd ?? null) ||
      draft.assignedOwnerBusinessUserId !==
        (draftVersion.config.assignedOwnerBusinessUserId ?? null) ||
      JSON.stringify(voiceAiControls(draft)) !==
        JSON.stringify(voiceAiControls(draftVersion.config))),
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
        result.evaluationStatus === "not_evaluated" && result.response
          ? `Response received for v${result.version}; answer correctness was not evaluated.`
          : result.evaluationStatus === "passed"
            ? `Literal checks passed for v${result.version}`
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
  const voicePreview = useMutation({
    mutationFn: () =>
      selected
        ? previewVoiceAiAgent(selected.id, draft.realtimeVoice ?? "marin")
        : Promise.reject(new Error("Choose and save an agent first")),
    onSuccess: async (result) => {
      setVoicePreviewUrl(pcm16WavDataUrl(result.audioBase64, result.sampleRate));
      setNotice(
        `${result.voice} audio sample generated. Estimated OpenAI cost: $${result.estimatedCostUsd.toFixed(6)}; this is not an invoice amount.`,
      );
      await refresh();
    },
    onError: (error) =>
      setNotice(
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "OpenAI voice preview could not run",
      ),
  });
  const testSuite = useMutation({
    mutationFn: () => {
      const scenarios = lines(scenarioSuiteText);
      if (scenarios.length < 2 || scenarios.length > 8)
        return Promise.reject(
          new Error("Enter between 2 and 8 scenarios, one per line."),
        );
      const includes = checksByScenario(
        scenarioMustIncludeText,
        scenarios.length,
      );
      const excludes = checksByScenario(
        scenarioMustNotIncludeText,
        scenarios.length,
      );
      const expectedRows = scenarioExpectedIntentText.split("\n");
      if (expectedRows.slice(scenarios.length).some((row) => row.trim()))
        throw new Error("Enter no more expected-outcome rows than scenarios.");
      const allowedIntents = new Set([
        "continue",
        "book",
        "message",
        "transfer",
        "end",
      ]);
      const checks: VoiceAiAgentScenarioChecks[] = scenarios.map((_, index) => {
        const mustInclude = includes[index];
        const mustNotInclude = excludes[index];
        const expectedIntent = (expectedRows[index] ?? "")
          .trim()
          .toLowerCase();
        if (expectedIntent && !allowedIntents.has(expectedIntent))
          throw new Error(
            "Expected outcomes must be continue, book, message, transfer or end.",
          );
        if (mustInclude.length > 8 || mustNotInclude.length > 8)
          throw new Error(
            "Use no more than 8 phrases of each check type per scenario.",
          );
        if (
          [...mustInclude, ...mustNotInclude].some(
            (phrase) => phrase.length > 120,
          )
        )
          throw new Error(
            "Each literal check phrase must be 120 characters or fewer.",
          );
        return {
          mustInclude,
          mustNotInclude,
          ...(expectedIntent
            ? {
                expectedIntent: expectedIntent as NonNullable<
                  VoiceAiAgentScenarioChecks["expectedIntent"]
                >,
              }
            : {}),
        };
      });
      const hasChecks = checks.some(
        (check) =>
          check.mustInclude?.length ||
          check.mustNotInclude?.length ||
          check.expectedIntent,
      );
      return selected
        ? testVoiceAiAgentScenarios(
            selected.id,
            scenarios,
            hasChecks ? checks : undefined,
            scenarioSafetyReview,
          )
        : Promise.reject(new Error("Choose an agent first"));
    },
    onSuccess: async (result) => {
      setScenarioSuiteResult(result);
      const responseOnly = result.results.filter(
        (item) => item.response && item.evaluationStatus === "not_evaluated",
      ).length;
      setNotice(
        `${result.nonEmptyResponses} of ${result.scenarioCount} executed scenarios received a response. Checks: ${result.assertionPassedCount} passed, ${result.assertionFailedCount} failed, ${responseOnly} responses not evaluated${result.stoppedEarly ? `; stopped early after a provider or budget error (${result.requestedScenarioCount} requested)` : ""}. Expected outcomes are model self-reports, not proof of real call behavior.`,
      );
      await refresh();
    },
    onError: (error) =>
      setNotice(
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Scenario suite could not run",
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
    voicePreview.isPending ||
    testSuite.isPending ||
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
                setVoicePreviewUrl(null);
                setRollbackVersionId("");
                setShowCreate(false);
                setNotice("");
                setWizardStep(0);
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
            setVoicePreviewUrl(null);
            setNotice("");
            setWizardStep(0);
          }}
          className="rounded-[8px] border border-[#D5DAE2] bg-white px-3 py-2 text-[11px] font-bold text-[#334155] hover:bg-[#F8FAFC]"
        >
          New AI agent
        </button>
      </div>

      {query.isPending ? (
        <div className="p-4 text-[12px] text-[color:var(--app-text-faintest,#667085)]">
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
        <div className="p-4">
          <nav
            aria-label="Agent creation steps"
            className="mb-4 flex flex-wrap gap-2"
          >
            {wizardSteps.map((title, index) => (
              <button
                key={title}
                type="button"
                aria-current={wizardStep === index ? "step" : undefined}
                onClick={() => setWizardStep(index)}
                className={`rounded-[8px] border px-3 py-2 text-[11px] ${wizardStep === index ? "border-[#16A34A] bg-[#ECFDF3] text-[#14532D]" : "border-[#E2E6EA] text-[#475467]"}`}
              >
                {index + 1} · {title}
              </button>
            ))}
          </nav>
          <h3 className="mb-3 text-sm font-bold">
            Step {wizardStep + 1} of 12 · {wizardSteps[wizardStep]}
          </h3>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(260px,.72fr)]">
            <div className="grid gap-3 sm:grid-cols-2">
              <WizardSection active={wizardStep === 0}>
                <label className="text-[11px] font-bold text-[#5B6675]">
                  Agent name
                  <input
                    className={inputClass}
                    maxLength={120}
                    value={draft.name}
                    onChange={(event) =>
                      updateDraft("name", event.target.value)
                    }
                  />
                </label>
                <label className="text-[11px] font-bold text-[#5B6675]">
                  Template
                  <select
                    className={inputClass}
                    value={draft.template}
                    onChange={(event) =>
                      updateDraft(
                        "template",
                        event.target.value as VoiceAiTemplate,
                      )
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
                  Internal owner
                  <select
                    className={inputClass}
                    value={draft.assignedOwnerBusinessUserId ?? ""}
                    onChange={(event) =>
                      updateDraft(
                        "assignedOwnerBusinessUserId",
                        event.target.value || null,
                      )
                    }
                  >
                    <option value="">No assigned owner</option>
                    {(query.data?.internalOwners ?? []).map((owner) => (
                      <option key={owner.id} value={owner.id}>
                        {owner.name} · {owner.role.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-[10px] font-normal text-[#64748B]">
                    Only active members of this business are selectable. If the
                    owner has an available voice profile, they are preferred
                    for AI handoffs; normal availability and capacity rules
                    still apply.
                  </span>
                </label>
                <div className="rounded-[9px] border border-[#D5DAE2] bg-[#F8FAFC] p-3 text-[11px] text-[#475467] sm:col-span-2">
                  <span className="font-bold text-[#334155]">Branch scope:</span>{" "}
                  {query.data?.businessScope
                    ? `${query.data.businessScope.name}${query.data.businessScope.isBranch ? " · branch" : " · main business"}`
                    : "Current selected business"}. This agent is stored only
                  for the current branch. Use the app branch selector before
                  creating an agent for another branch.
                </div>
              </WizardSection>
              <WizardSection active={wizardStep === 1}>
                <label className="text-[11px] font-bold text-[#5B6675] sm:col-span-2">
                  Purpose
                  <textarea
                    className="mt-1 min-h-[68px] w-full rounded-[9px] border border-[#D5DAE2] p-2.5 text-[12px] outline-none focus:border-[#16A34A]"
                    maxLength={240}
                    value={draft.purpose}
                    onChange={(event) =>
                      updateDraft("purpose", event.target.value)
                    }
                  />
                </label>
                <label className="text-[11px] font-bold text-[#5B6675] sm:col-span-2">
                  Explicit exclusions — actions the agent must never perform
                  <textarea
                    className="mt-1 min-h-[86px] w-full rounded-[9px] border border-[#D5DAE2] p-2.5 text-[12px] outline-none focus:border-[#16A34A]"
                    maxLength={4800}
                    value={draft.exclusions.join("\n")}
                    onChange={(event) =>
                      updateDraft("exclusions", lines(event.target.value))
                    }
                    placeholder={
                      "Never promise an unconfirmed booking\nNever quote prices outside approved business records"
                    }
                  />
                  <span className="mt-1 block text-[10px] font-normal text-[#64748B]">
                    One rule per line. These rules are saved in the immutable
                    version and included in the runtime instructions; system
                    safety rules cannot be disabled here.
                  </span>
                </label>
              </WizardSection>
              <WizardSection active={wizardStep === 2}>
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
              </WizardSection>
              <WizardSection active={wizardStep === 3}>
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
                <label className="text-[11px] font-bold text-[#5B6675]">
                  Realtime voice
                  <select
                    className={inputClass}
                    value={draft.realtimeVoice ?? "marin"}
                    onChange={(event) =>
                      {
                        setVoicePreviewUrl(null);
                        updateDraft(
                          "realtimeVoice",
                          event.target
                            .value as VoiceAiAgentDraftInput["realtimeVoice"],
                        );
                      }
                    }
                  >
                    {(query.data?.realtimeVoices ?? ["marin"]).map((voice) => (
                      <option key={voice} value={voice}>
                        {voice}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-[10px] font-normal text-[#64748B]">
                    Applied only to realtime phone sessions. A sample uses the
                    selected OpenAI Realtime voice; it does not place a call.
                  </span>
                  {!showCreate ? (
                    <div className="mt-2 rounded-[8px] border border-[#D7E8DC] bg-[#F7FCF8] p-2.5 sm:col-span-2">
                      <button
                        type="button"
                        disabled={pending || !draftVersion && !publishedVersion}
                        onClick={() => voicePreview.mutate()}
                        className="rounded-[8px] border border-[#B7D8C0] px-3 py-2 text-[10px] font-bold text-[#14532D] disabled:opacity-50"
                      >
                        {voicePreview.isPending
                          ? "Generating audio…"
                          : "Generate selected voice sample"}
                      </button>
                      <p className="mt-1.5 text-[10px] leading-4 text-[#64748B]">
                        This sends one short request to OpenAI Realtime and may
                        use paid credits. Usage is recorded against the saved
                        version and its budget. The sample is not stored by the
                        server.
                      </p>
                      {voicePreviewUrl ? (
                        <audio
                          className="mt-2 h-9 w-full"
                          controls
                          src={voicePreviewUrl}
                          aria-label={`${draft.realtimeVoice ?? "marin"} voice sample`}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </label>
                <p className="text-xs text-[#64748B] sm:col-span-2">
                  {draft.runtimeMode === "realtime"
                    ? `Live audio: OpenAI gpt-realtime with ${draft.realtimeVoice ?? "marin"} voice, server voice activity detection and interruption handling.`
                    : "Recorded turns: transcribe, generate a reply, then play it. This mode does not support speaking over the assistant."}{" "}
                  Change the conversation mode in Availability. A text sandbox
                  does not verify the microphone, carrier or voice quality.
                </p>
              </WizardSection>
              <WizardSection active={wizardStep === 6}>
                <label className="text-[11px] font-bold text-[#5B6675] sm:col-span-2">
                  Opening greeting
                  <textarea
                    className="mt-1 min-h-[52px] w-full rounded-[9px] border border-[#D5DAE2] p-2.5 text-[12px]"
                    maxLength={400}
                    value={draft.dialogue.greeting}
                    onChange={(event) =>
                      updateDraft("dialogue", {
                        ...draft.dialogue,
                        greeting: event.target.value,
                      })
                    }
                  />
                </label>
                {(
                  [
                    ["disclosures", "Additional required disclosures"],
                    ["requiredQuestions", "Questions to ask when relevant"],
                    ["edgeCases", "Edge cases and approved handling"],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="text-[11px] font-bold text-[#5B6675] sm:col-span-2"
                  >
                    {label} · one per line
                    <textarea
                      className="mt-1 min-h-[68px] w-full rounded-[9px] border border-[#D5DAE2] p-2.5 text-[12px]"
                      value={draft.dialogue[key].join("\n")}
                      onChange={(event) =>
                        updateDraft("dialogue", {
                          ...draft.dialogue,
                          [key]: lines(event.target.value),
                        })
                      }
                    />
                  </label>
                ))}
                <label className="text-[11px] font-bold text-[#5B6675] sm:col-span-2">
                  Clarification prompt
                  <textarea
                    className="mt-1 min-h-[52px] w-full rounded-[9px] border border-[#D5DAE2] p-2.5 text-[12px]"
                    maxLength={400}
                    value={draft.dialogue.clarificationPrompt}
                    onChange={(event) =>
                      updateDraft("dialogue", {
                        ...draft.dialogue,
                        clarificationPrompt: event.target.value,
                      })
                    }
                    placeholder="Ask a brief follow-up instead of guessing"
                  />
                </label>
                <p className="text-[10px] text-[#64748B] sm:col-span-2">
                  Required identity, recording and consent disclosures remain
                  controlled by the published compliance policy.
                </p>
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
              </WizardSection>
              <WizardSection active={wizardStep === 7}>
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
                <p className="text-xs text-[#64748B] sm:col-span-2">
                  Live transfers use the published IVR and available human
                  routing profiles. A request stays pending until the provider
                  confirms the destination answered.{" "}
                  <a href="/phone/ivr" className="underline">
                    Review IVR routing
                  </a>
                </p>
              </WizardSection>
              <WizardSection active={wizardStep === 5}>
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
                        {toolLabels[tool] ?? tool}
                      </label>
                    ))}
                  </div>
                  <p className="mt-1 text-[10px] text-[color:var(--app-text-faintest,#667085)]">
                    The server blocks disabled actions even if the AI requests
                    them. Catalog lookup, slot search and verified rescheduling
                    use live audio mode.
                  </p>
                </fieldset>
              </WizardSection>
              <WizardSection active={wizardStep === 4}>
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
                          <span className="text-[color:var(--app-text-faintest,#667085)]">
                            · {source.kind}
                          </span>
                        </span>
                      </label>
                    ))}
                    {!query.data?.knowledgeSources?.length ? (
                      <p className="text-[10px] text-[color:var(--app-text-faintest,#667085)]">
                        No active business knowledge sources are available.
                      </p>
                    ) : null}
                  </div>
                </fieldset>
              </WizardSection>
              <WizardSection active={wizardStep === 9}>
                <label className="text-[11px] font-bold text-[#5B6675] sm:col-span-2">
                  Monthly AI budget for this version (USD)
                  <input
                    className={inputClass}
                    type="number"
                    min={0.01}
                    max={100000}
                    step={0.01}
                    value={draft.monthlyBudgetUsd ?? ""}
                    onChange={(event) =>
                      updateDraft(
                        "monthlyBudgetUsd",
                        event.target.value === ""
                          ? null
                          : Number(event.target.value),
                      )
                    }
                    placeholder="No per-version limit"
                  />
                  <span className="mt-1 block text-[10px] font-normal text-[color:var(--app-text-faintest,#667085)]">
                    {sourceVersion
                      ? `This month: $${(sourceVersion.monthlySpendUsd ?? 0).toFixed(4)} spent on this version. A call is refused once the budget is reached.`
                      : "Leave blank for no per-version limit."}
                  </span>
                </label>
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
                <p className="text-xs text-[#64748B] sm:col-span-2">
                  Write tools require the caller’s keypad confirmation.
                  Sensitive customer actions also require a private
                  booking-management reference; caller ID alone is not verified
                  identity. The server never grants a disabled tool.
                </p>
              </WizardSection>
              <WizardSection active={wizardStep === 8}>
                <AiAgentControlsFields draft={draft} update={updateDraft} />
              </WizardSection>
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
                      pending ||
                      !draftVersion ||
                      qualityAnalyst ||
                      unsavedChanges
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
              <WizardSection active={wizardStep === 10}>
                <Card pad={14} border="#D7E8DC">
                  <div className="flex items-center gap-2 text-[12px] font-extrabold text-[#14532D]">
                    <Ico name="flask-conical" size={14} />
                    Sandbox test
                  </div>
                  <p className="mt-1.5 text-[10px] leading-4 text-[#64748B]">
                    Uses the business AI budget and the selected conversation
                    provider. This is a text-only simulated scenario: it does
                    not place a call, execute tools or write business data. Live
                    audio and tool-path tests are separate.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="h-7 rounded-[7px] border border-[#D5DAE2] bg-white px-2.5 text-[11px] font-bold text-[#334155]"
                      onClick={() => {
                        const pack = safetyAttackPackFields();
                        setScenarioSuiteText(pack.scenarios);
                        setScenarioMustIncludeText(pack.mustInclude);
                        setScenarioMustNotIncludeText(pack.mustNotInclude);
                        setScenarioExpectedIntentText(pack.expectedIntents);
                      }}
                    >
                      Load safety attack pack
                    </button>
                    <label className="flex items-center gap-1.5 text-[10px] font-bold text-[#334155]">
                      <input
                        type="checkbox"
                        checked={scenarioSafetyReview}
                        onChange={(event) => setScenarioSafetyReview(event.target.checked)}
                      />
                      Also run AI safety review (one extra metered request per reply)
                    </label>
                    <span className="text-[10px] text-[#667085]">
                      8 prompt-injection, data-leak and false-claim attacks with phrase tripwires. A pass is not a full safety review; running it makes metered AI requests.
                    </span>
                  </div>
                  <label className="mt-2 block text-[10px] font-bold text-[#475467]">
                    Scripted scenarios · one per line (2–8)
                    <textarea
                      className="mt-1 min-h-[100px] w-full rounded-[8px] border border-[#D5DAE2] p-2 text-[11px] font-normal"
                      value={scenarioSuiteText}
                      onChange={(event) =>
                        setScenarioSuiteText(event.target.value)
                      }
                    />
                  </label>
                  <label className="mt-2 block text-[10px] font-bold text-[#475467]">
                    Must include · optional, same line order, separate phrases
                    with semicolons
                    <textarea
                      className="mt-1 min-h-[70px] w-full rounded-[8px] border border-[#D5DAE2] p-2 text-[11px] font-normal"
                      value={scenarioMustIncludeText}
                      onChange={(event) =>
                        setScenarioMustIncludeText(event.target.value)
                      }
                      placeholder={
                        "Leave blank or enter phrases\nfor scenario 2\nfor scenario 3"
                      }
                    />
                  </label>
                  <label className="mt-2 block text-[10px] font-bold text-[#475467]">
                    Expected outcome · optional, one per scenario
                    <textarea
                      className="mt-1 min-h-[70px] w-full rounded-[8px] border border-[#D5DAE2] p-2 text-[11px] font-normal"
                      value={scenarioExpectedIntentText}
                      onChange={(event) =>
                        setScenarioExpectedIntentText(event.target.value)
                      }
                      placeholder={
                        "continue, book, message, transfer or end\nleave blank for a scenario without this check"
                      }
                    />
                  </label>
                  <p className="mt-1 text-[10px] text-[#64748B]">
                    Expected outcomes compare the selected expectation with
                    the model&apos;s self-reported label. They do not verify
                    semantic correctness or execute a tool.
                  </p>
                  <label className="mt-2 block text-[10px] font-bold text-[#475467]">
                    Must not include · optional, same line order,
                    semicolon-separated
                    <textarea
                      className="mt-1 min-h-[70px] w-full rounded-[8px] border border-[#D5DAE2] p-2 text-[11px] font-normal"
                      value={scenarioMustNotIncludeText}
                      onChange={(event) =>
                        setScenarioMustNotIncludeText(event.target.value)
                      }
                      placeholder={
                        "Leave blank or enter phrases\nfor scenario 2\nfor scenario 3"
                      }
                    />
                  </label>
                  <p className="mt-1 text-[10px] text-[#9A6700]">
                    Running the suite makes one AI request per scenario and may
                    use paid credits. It does not place calls or execute tools.
                    Literal checks are case-insensitive phrase matches only;
                    they are not a semantic correctness, safety or adversarial
                    proof.
                  </p>
                  {!showCreate ? (
                    <button
                      type="button"
                      disabled={
                        pending ||
                        !draftVersion ||
                        qualityAnalyst ||
                        unsavedChanges
                      }
                      onClick={() => testSuite.mutate()}
                      className="mt-2 rounded-[8px] border border-[#D5DAE2] px-3 py-2 text-[10px] font-bold text-[#334155] disabled:opacity-50"
                    >
                      {testSuite.isPending
                        ? "Running scenarios…"
                        : "Run scripted suite"}
                    </button>
                  ) : null}
                  {scenarioSuiteResult ? (
                    <div className="mt-3 space-y-2" aria-live="polite">
                      {scenarioSuiteResult.results.map((result, index) => (
                        <div
                          key={result.id}
                          className="rounded-[8px] border border-[#E2E6EA] p-2 text-[10px]"
                        >
                          <div className="font-bold">
                            Scenario {index + 1} ·{" "}
                            {result.errorCode &&
                            result.errorCode !== "AI_SCENARIO_ASSERTION_FAILED"
                              ? "provider error"
                              : result.evaluationStatus === "passed"
                                ? "checks passed"
                                : result.evaluationStatus === "failed"
                                  ? "checks failed"
                                  : result.response
                                    ? "response received · not evaluated"
                                    : "no response"}{" "}
                            · {result.inputTokens + result.outputTokens} tokens
                          </div>
                          {result.assertionFailures.map((failure) => (
                            <p key={failure} className="mt-1 text-[#B42318]">
                              {failure}
                            </p>
                          ))}
                          {result.safetyReview ? (
                            <p
                              className={`mt-1 ${result.safetyReview.verdict === "fail" ? "text-[#B42318]" : result.safetyReview.verdict === "pass" ? "text-[#166534]" : "text-[#475467]"}`}
                            >
                              AI safety review:{" "}
                              {result.safetyReview.verdict === "not_run"
                                ? "not run"
                                : result.safetyReview.verdict}{" "}
                              · {result.safetyReview.reason}
                            </p>
                          ) : null}
                          {result.expectedIntent ? (
                            <p className="mt-1 text-[#475467]">
                              Expected outcome: {result.expectedIntent} ·
                              model reported: {result.actualIntent ?? "not available"}
                            </p>
                          ) : null}
                          <p className="mt-1 whitespace-pre-wrap text-[#475467]">
                            {result.response ??
                              result.errorMessage ??
                              "No response was returned."}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {!showCreate && draftVersion ? (
                    <>
                      <div className="mt-2 text-[10px] font-bold text-[#475467]">
                        Draft v{draftVersion.version} ·{" "}
                        {draftVersion.checksum.slice(0, 12)}…
                      </div>
                      <textarea
                        aria-label="Sandbox scenario"
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
                          {draftVersion.latestTest.expectedIntent ? (
                            <p className="mt-1 text-[#475467]">
                              Expected outcome: {draftVersion.latestTest.expectedIntent} ·
                              model reported: {draftVersion.latestTest.actualIntent ?? "not available"}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <p className="mt-2 text-[10px] text-[color:var(--app-text-faintest,#667085)]">
                          No test has been recorded for this version.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-2 text-[10px] text-[color:var(--app-text-faintest,#667085)]">
                      Save the draft first to run a sandbox test.
                    </p>
                  )}
                  {!showCreate && (
                    <button
                      type="button"
                      disabled={
                        pending ||
                        !draftVersion ||
                        qualityAnalyst ||
                        unsavedChanges
                      }
                      onClick={() => test.mutate()}
                      className="mt-3 rounded border px-3 py-2 text-xs disabled:opacity-50"
                    >
                      Run text sandbox
                    </button>
                  )}
                </Card>
              </WizardSection>
              <WizardSection active={wizardStep === 11}>
                {!showCreate ? (
                  <Card pad={14}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[12px] font-extrabold">
                          Publishing
                        </div>
                        <div className="mt-1 text-[10px] text-[#64748B]">
                          Only the owner can publish. New inbound calls pin this
                          exact version.
                        </div>
                      </div>
                      <Chip
                        tone={
                          selected?.status === "active" ? "green" : "neutral"
                        }
                      >
                        {selected?.status ?? "draft"}
                      </Chip>
                    </div>
                    <div className="mt-2 text-[10px] text-[#475467]">
                      Current live version:{" "}
                      {publishedVersion
                        ? `v${publishedVersion.version}`
                        : "None"}
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
                              {new Date(
                                version.publishedAt!,
                              ).toLocaleDateString()}
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
                {showCreate && (
                  <p className="text-xs text-[#64748B]">
                    Create the draft, test it, and obtain explicit owner
                    approval before publishing. Starting with a 1–5% pilot is
                    recommended.
                  </p>
                )}
              </WizardSection>
              <div className="rounded-[9px] border border-[#FDE49B] bg-[#FFFBEB] p-3 text-[10px] leading-4 text-[#7A5B2C]">
                Live actions are restricted by the allowlist above, and
                knowledge retrieval uses only selected sources. Each response
                has the configured output-token ceiling. A passing sandbox test
                and explicit owner approval are required before publishing.
                Quality Analyst does not answer live calls. Evidence-based
                offline review suggestions are available in Call Quality.
                {qualityAnalyst
                  ? " This template cannot be AI-tested or published as a live receptionist."
                  : ""}
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#EEF0F3] pt-3">
            <button
              type="button"
              disabled={wizardStep === 0}
              onClick={() => setWizardStep((value) => value - 1)}
              className="rounded border px-3 py-2 text-xs disabled:opacity-50"
            >
              Previous step
            </button>
            <span className="text-[11px] text-[#64748B]">
              Save creates a version — it never activates the agent.
            </span>
            <button
              type="button"
              disabled={wizardStep === 11}
              onClick={() => setWizardStep((value) => value + 1)}
              className="rounded border px-3 py-2 text-xs disabled:opacity-50"
            >
              Next step
            </button>
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
      <div className="border-t border-[#EEF0F3] px-4 py-2 text-[10px] text-[color:var(--app-text-faintest,#667085)]">
        {query.data?.limitations.tools ??
          "Published agent versions enforce their saved action allowlist, selected knowledge sources and response-token ceiling."}{" "}
        {query.data?.limitations.liveRouting ??
          "Fresh available human profiles with capacity can receive AI-to-human handoffs; a classified caller topic prefers an exact matching skill tag. Check browser-phone readiness in Agent Workspace."}
      </div>
    </Card>
  );
}
