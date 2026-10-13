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
export const VOICE_AI_TOOLS = ["book", "message", "transfer", "end"] as const;
export type VoiceAiTool = (typeof VOICE_AI_TOOLS)[number];
export interface VoiceAiAgentDraftInput {
  name: string;
  template: VoiceAiTemplate;
  purpose: string;
  voiceStyle: string;
  instructions: string;
  escalationGuidance: string;
  languages: string[];
  toolPermissions: VoiceAiTool[];
  knowledgeSourceIds: string[];
  maxTokensPerResponse: number;
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
  > & {
    agentName?: string;
    template?: VoiceAiTemplate;
    toolPermissions?: VoiceAiTool[];
    knowledgeSourceIds?: string[];
    maxTokensPerResponse?: number;
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
    createdAt: string;
  } | null;
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
