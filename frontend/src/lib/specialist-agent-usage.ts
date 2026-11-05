export interface SpecialistAgentAiUsageCall {
  id: string;
  kind: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: string | number;
  createdAt: string;
}
