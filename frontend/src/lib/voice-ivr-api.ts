import { apiFetch } from "@/lib/api-client";

export type VoiceIvrNodeType =
  | "start"
  | "greeting"
  | "disclosure"
  | "get_dtmf"
  | "speech_intent"
  | "business_hours"
  | "branch"
  | "condition"
  | "lookup"
  | "queue"
  | "ai_agent"
  | "human_agent"
  | "voicemail"
  | "callback"
  | "transfer"
  | "end";

export interface VoiceIvrNode {
  id: string;
  type: VoiceIvrNodeType;
  label: string;
  config?: Record<string, unknown>;
}

export interface VoiceIvrEdge {
  id: string;
  from: string;
  to: string;
  condition: string;
}

export interface VoiceIvrGraph {
  nodes: VoiceIvrNode[];
  edges: VoiceIvrEdge[];
}

export interface VoiceIvrFlowVersion {
  id: string;
  version: number;
  status: "published" | "rollback";
  changeSummary: string;
  rollbackSourceVersion: number | null;
  publishedAt: string;
  createdByUserId: string;
}

export interface VoiceIvrFlow {
  id: string;
  name: string;
  status: "draft" | "published";
  revision: number;
  publishedVersion: number | null;
  draftGraph: VoiceIvrGraph;
  versions?: VoiceIvrFlowVersion[];
}

export interface VoiceIvrValidation {
  valid: boolean;
  errors: Array<{ code: string; message: string; nodeId?: string }>;
  warnings: string[];
}

export interface VoiceIvrSimulation {
  valid: boolean;
  validation: VoiceIvrValidation;
  trace: Array<{ nodeId: string; type: VoiceIvrNodeType; label: string }>;
  outcome:
    | "not_simulated"
    | "reached_end"
    | "no_matching_route"
    | "step_limit_reached";
}

export function fetchVoiceIvrFlows(): Promise<VoiceIvrFlow[]> {
  return apiFetch("/voice/ivr/flows");
}

export function fetchVoiceIvrFlow(id: string): Promise<VoiceIvrFlow> {
  return apiFetch(`/voice/ivr/flows/${id}`);
}

export function createVoiceIvrFlow(name: string): Promise<VoiceIvrFlow> {
  return apiFetch("/voice/ivr/flows", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function saveVoiceIvrDraft(
  id: string,
  expectedRevision: number,
  graph: VoiceIvrGraph,
): Promise<VoiceIvrFlow> {
  return apiFetch(`/voice/ivr/flows/${id}/draft`, {
    method: "PUT",
    body: JSON.stringify({ expectedRevision, graph }),
  });
}

export function validateVoiceIvrFlow(id: string): Promise<VoiceIvrValidation> {
  return apiFetch(`/voice/ivr/flows/${id}/validate`, { method: "POST" });
}

export function simulateVoiceIvrFlow(
  id: string,
  input: {
    dtmf?: string;
    intent?: string;
    businessHours?: "open" | "closed";
    value?: string;
  },
): Promise<VoiceIvrSimulation> {
  return apiFetch(`/voice/ivr/flows/${id}/simulate`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function publishVoiceIvrFlow(
  id: string,
  expectedRevision: number,
  changeSummary: string,
): Promise<VoiceIvrFlow> {
  return apiFetch(`/voice/ivr/flows/${id}/publish`, {
    method: "POST",
    body: JSON.stringify({ expectedRevision, changeSummary }),
  });
}

export function rollbackVoiceIvrFlow(
  id: string,
  version: number,
  expectedRevision: number,
  reason: string,
): Promise<VoiceIvrFlow> {
  return apiFetch(`/voice/ivr/flows/${id}/rollback`, {
    method: "POST",
    body: JSON.stringify({ version, expectedRevision, reason }),
  });
}
