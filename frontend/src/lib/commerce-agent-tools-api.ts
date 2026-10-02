import { apiFetch } from "@/lib/api-client";

export type AgentRiskClass = "READ_ONLY" | "LOW_RISK_WRITE" | "MEDIUM_RISK_WRITE" | "HIGH_RISK_WRITE" | "FINANCIAL" | "IRREVERSIBLE";

export interface AgentTool {
  key: string;
  label: string;
  riskClass: AgentRiskClass;
  description: string;
  screen: string;
  inputs: string[];
  executable: boolean;
  minLevel: number;
  approvalRequired: boolean;
  blockedReason: string | null;
}

export interface AgentToolRegistry {
  autonomyLevel: number;
  levels: { level: number; label: string; detail: string }[];
  paused: boolean;
  tools: AgentTool[];
}

export interface AgentToolRun {
  id: string;
  toolKey: string;
  riskClass: AgentRiskClass;
  actorType: string;
  autonomyLevel: number;
  input: Record<string, string>;
  outcome: "succeeded" | "refused" | "failed";
  refusalReason: string | null;
  resultSummary: string | null;
  correlationId: string;
  durationMs: number;
  createdAt: string;
}

export const fetchAgentTools = () => apiFetch<AgentToolRegistry>("/commerce/agent-tools");
export const fetchAgentToolRuns = () => apiFetch<AgentToolRun[]>("/commerce/agent-tools/runs");
export const runAgentTool = (key: string, input: Record<string, string>) =>
  apiFetch<{ run: AgentToolRun; result: unknown }>(`/commerce/agent-tools/${key}/run`, { method: "POST", body: JSON.stringify({ input }) });
