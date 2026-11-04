import { ApiError, apiFetch } from "@/lib/api-client";

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
  allowedByBusinessAllowlist: boolean;
  blockedReason: string | null;
}

export interface AgentToolRegistry {
  autonomyLevel: number;
  levels: { level: number; label: string; detail: string }[];
  paused: boolean;
  allowedWriteToolKeys: string[];
  writeToolAllowlistValid: boolean;
  invalidWriteToolEntries: string[];
  tools: AgentTool[];
}

export interface AgentToolRun {
  id: string;
  toolKey: string;
  riskClass: AgentRiskClass;
  actorType: string;
  autonomyLevel: number;
  input: Record<string, string>;
  outcome: "running" | "pending_approval" | "rejected" | "succeeded" | "refused" | "failed";
  canApprove: boolean;
  refusalReason: string | null;
  resultSummary: string | null;
  correlationId: string;
  durationMs: number;
  createdAt: string;
}

export const fetchAgentTools = () => apiFetch<AgentToolRegistry>("/commerce/agent-tools");
export const fetchAgentToolRuns = () => apiFetch<AgentToolRun[]>("/commerce/agent-tools/runs");
type AgentToolRunResponse = {
  run: AgentToolRun;
  result: unknown;
  replayed?: boolean;
  pending?: boolean;
  resourceMissing?: boolean;
  pendingApproval?: boolean;
};

const IDEMPOTENCY_PREFIX = "noxtill:commerce-agent-tool:";
const IDEMPOTENCY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

async function requestScopeHash(key: string, input: Record<string, string>) {
  const canonical = JSON.stringify({
    key,
    input: Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b))),
  });
  const bytes = new TextEncoder().encode(canonical);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function idempotencyKeyFor(key: string, input: Record<string, string>) {
  const scopeHash = await requestScopeHash(key, input);
  const storageKey = `${IDEMPOTENCY_PREFIX}${scopeHash}`;
  const saved = sessionStorage.getItem(storageKey);
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as { key: string; createdAt: number };
      if (Date.now() - parsed.createdAt < IDEMPOTENCY_MAX_AGE_MS) {
        return { key: parsed.key, storageKey };
      }
    } catch {
      // Replace malformed local retry state with a fresh key.
    }
  }
  const idempotencyKey = globalThis.crypto.randomUUID();
  sessionStorage.setItem(storageKey, JSON.stringify({ key: idempotencyKey, createdAt: Date.now() }));
  return { key: idempotencyKey, storageKey };
}

export const runAgentTool = async (key: string, input: Record<string, string>, isWrite: boolean) => {
  if (!isWrite) {
    return apiFetch<AgentToolRunResponse>(`/commerce/agent-tools/${key}/run`, { method: "POST", body: JSON.stringify({ input }) });
  }

  const { key: idempotencyKey, storageKey } = await idempotencyKeyFor(key, input);
  try {
    const response = await apiFetch<AgentToolRunResponse>(`/commerce/agent-tools/${key}/run`, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ input }),
    });
    if (response.run.outcome !== "running" && response.run.outcome !== "pending_approval") {
      sessionStorage.removeItem(storageKey);
    }
    return response;
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) sessionStorage.removeItem(storageKey);
    throw error;
  }
};

export const decideAgentToolRun = (
  runId: string,
  decision: "approve" | "reject",
  reason: string,
) => apiFetch<AgentToolRunResponse>(`/commerce/agent-tools/runs/${runId}/${decision}`, {
  method: "POST",
  body: JSON.stringify({ reason }),
});
