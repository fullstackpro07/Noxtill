import { apiFetch } from "@/lib/api-client";

export const VOICE_AI_TEMPLATES = [
  "receptionist",
  "sales",
  "booking",
  "support",
  "follow_up",
  "lead_qualification",
  "routing",
  "quality_analyst",
] as const;

export type VoiceAiTemplate = (typeof VOICE_AI_TEMPLATES)[number];
export const VOICE_REALTIME_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
] as const;
export type VoiceRealtimeVoice = (typeof VOICE_REALTIME_VOICES)[number];
export const VOICE_AI_TOOLS = [
  "book",
  "message",
  "transfer",
  "end",
  "catalog",
  "slots",
  "customer_lookup",
  "reschedule",
  "support_ticket",
  "inbox_draft",
] as const;
export type VoiceAiTool = (typeof VOICE_AI_TOOLS)[number];
export interface VoiceAiAgentControls {
  runtimeMode?: "recorded_turns" | "realtime";
  realtimeVoice?: VoiceRealtimeVoice;
  inboundEnabled?: boolean;
  outboundEnabled?: boolean;
  timeZone?: string;
  weeklyHours?: { day: number; opens: string; closes: string }[];
  holidays?: string[];
  rolloutPercent?: number;
  maxConcurrentCalls?: number;
  maxCallSeconds?: number;
  maxToolCalls?: number;
  assignedOwnerBusinessUserId?: string | null;
}

export const voiceAiControls = (config: VoiceAiAgentControls = {}) => ({
  runtimeMode: config.runtimeMode ?? "recorded_turns",
  realtimeVoice: config.realtimeVoice ?? "marin",
  inboundEnabled: config.inboundEnabled ?? true,
  outboundEnabled: config.outboundEnabled ?? true,
  timeZone: config.timeZone ?? "UTC",
  weeklyHours: config.weeklyHours ?? [],
  holidays: config.holidays ?? [],
  rolloutPercent: config.rolloutPercent ?? 100,
  maxConcurrentCalls: config.maxConcurrentCalls ?? 10,
  maxCallSeconds: config.maxCallSeconds ?? 600,
  maxToolCalls: config.maxToolCalls ?? 10,
  assignedOwnerBusinessUserId: config.assignedOwnerBusinessUserId ?? null,
});

export interface VoiceAiAgentDraftInput extends VoiceAiAgentControls {
  name: string;
  template: VoiceAiTemplate;
  purpose: string;
  voiceStyle: string;
  instructions: string;
  exclusions: string[];
  dialogue: {
    greeting: string;
    disclosures: string[];
    requiredQuestions: string[];
    clarificationPrompt: string;
    edgeCases: string[];
  };
  escalationGuidance: string;
  languages: string[];
  toolPermissions: VoiceAiTool[];
  knowledgeSourceIds: string[];
  maxTokensPerResponse: number;
  monthlyBudgetUsd: number | null;
}

export interface VoiceAiAgentVersion {
  id: string;
  version: number;
  config: Omit<
    VoiceAiAgentDraftInput,
    | "name"
    | "template"
    | "toolPermissions"
    | "knowledgeSourceIds"
    | "maxTokensPerResponse"
    | "monthlyBudgetUsd"
  > & {
    agentName?: string;
    template?: VoiceAiTemplate;
    toolPermissions?: VoiceAiTool[];
    knowledgeSourceIds?: string[];
    maxTokensPerResponse?: number;
    monthlyBudgetUsd?: number | null;
  };
  checksum: string;
  publishedAt: string | null;
  approvedAt: string | null;
  approvedByUserId: string | null;
  createdAt: string;
  latestTest: {
    id: string;
    passed: boolean;
    response: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    inputTokens: number;
    outputTokens: number;
    expectedIntent: "continue" | "book" | "message" | "transfer" | "end" | null;
    actualIntent: "continue" | "book" | "message" | "transfer" | "end" | null;
    createdAt: string;
  } | null;
  monthlySpendUsd: number;
}

export interface VoiceAiAgent {
  id: string;
  name: string;
  template: VoiceAiTemplate;
  status: "draft" | "active" | "paused" | "archived";
  currentDraftVersionId: string | null;
  publishedVersionId: string | null;
  versions: VoiceAiAgentVersion[];
}

export interface VoiceAiAgentList {
  templates: VoiceAiTemplate[];
  tools: VoiceAiTool[];
  realtimeVoices: VoiceRealtimeVoice[];
  businessScope: { id: string; name: string; isBranch: boolean } | null;
  internalOwners: {
    id: string;
    name: string;
    role: string;
    hasActiveVoiceProfile: boolean;
  }[];
  knowledgeSources: { id: string; title: string; kind: "faq" | "document" }[];
  agents: VoiceAiAgent[];
  limitations: { tools: string; liveRouting: string };
}

export function fetchVoiceAiAgents(): Promise<VoiceAiAgentList> {
  return apiFetch("/voice/agents/ai");
}

export function createVoiceAiAgent(input: VoiceAiAgentDraftInput) {
  return apiFetch<{
    id: string;
    name: string;
    status: string;
    version: number;
  }>("/voice/agents/ai", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function saveVoiceAiAgentDraft(
  agentId: string,
  input: VoiceAiAgentDraftInput,
) {
  return apiFetch<{ id: string; version: number; checksum: string }>(
    `/voice/agents/ai/${agentId}/draft`,
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
  );
}

export function testVoiceAiAgent(agentId: string, scenario: string) {
  return apiFetch<{
    id: string;
    version: number;
    passed: boolean;
    evaluationStatus: "not_evaluated" | "passed" | "failed";
    assertionFailures: string[];
    response: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    inputTokens: number;
    outputTokens: number;
    createdAt: string;
  }>(`/voice/agents/ai/${agentId}/test`, {
    method: "POST",
    body: JSON.stringify({ scenario }),
  });
}

export function previewVoiceAiAgent(agentId: string, voice: VoiceRealtimeVoice) {
  return apiFetch<{
    audioBase64: string;
    voice: VoiceRealtimeVoice;
    sampleRate: 24000;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  }>(`/voice/agents/ai/${agentId}/voice-preview`, {
    method: "POST",
    body: JSON.stringify({ voice }),
  });
}

export type VoiceAiAgentScenarioChecks = {
  mustInclude?: string[];
  mustNotInclude?: string[];
  expectedIntent?: "continue" | "book" | "message" | "transfer" | "end";
};

export function testVoiceAiAgentScenarios(
  agentId: string,
  scenarios: string[],
  checks?: VoiceAiAgentScenarioChecks[],
) {
  return apiFetch<{
    version: number | null;
    requestedScenarioCount: number;
    scenarioCount: number;
    stoppedEarly: boolean;
    nonEmptyResponses: number;
    evaluatedScenarioCount: number;
    assertionPassedCount: number;
    assertionFailedCount: number;
    results: {
      id: string;
      version: number;
      passed: boolean;
      evaluationStatus: "not_evaluated" | "passed" | "failed";
      assertionFailures: string[];
      expectedIntent: VoiceAiAgentScenarioChecks["expectedIntent"] | null;
      actualIntent: VoiceAiAgentScenarioChecks["expectedIntent"] | null;
      response: string | null;
      errorCode: string | null;
      errorMessage: string | null;
      inputTokens: number;
      outputTokens: number;
      createdAt: string;
    }[];
  }>(`/voice/agents/ai/${agentId}/test-suite`, {
    method: "POST",
    body: JSON.stringify({ scenarios, ...(checks ? { checks } : {}) }),
  });
}

export function publishVoiceAiAgent(agentId: string) {
  return apiFetch<{
    id: string;
    status: string;
    publishedVersionId: string;
    version: number;
  }>(`/voice/agents/ai/${agentId}/publish`, {
    method: "POST",
  });
}

export function approveVoiceAiAgent(agentId: string) {
  return apiFetch<{
    id: string;
    version: number;
    approvedAt: string;
    approvedByUserId: string;
  }>(`/voice/agents/ai/${agentId}/approve`, { method: "POST" });
}

export function rollbackVoiceAiAgent(
  agentId: string,
  versionId: string,
  reason: string,
) {
  return apiFetch<{
    id: string;
    status: string;
    publishedVersionId: string;
    version: number;
  }>(`/voice/agents/ai/${agentId}/rollback`, {
    method: "POST",
    body: JSON.stringify({ versionId, reason }),
  });
}

export function pauseVoiceAiAgent(agentId: string) {
  return apiFetch<{ id: string; status: string }>(
    `/voice/agents/ai/${agentId}/pause`,
    {
      method: "POST",
    },
  );
}
