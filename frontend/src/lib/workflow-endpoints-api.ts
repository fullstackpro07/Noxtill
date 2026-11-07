import { apiFetch, BASE_URL } from "@/lib/api-client";

export interface InboundWorkflow {
  id: string;
  name: string;
  active: boolean;
  endpoint: { id: string; tokenHint: string; enabled: boolean; rotatedAt: string | null; lastReceivedAt: string | null; createdAt: string } | null;
}

export interface EndpointDelivery {
  id: string;
  status: "accepted" | "duplicate" | "workflow_inactive" | "payload_rejected" | "failed";
  dedupeKey: string;
  payload: Record<string, unknown> | null;
  payloadBytes: number;
  runId: string | null;
  error: string | null;
  replayOfId: string | null;
  receivedAt: string;
  endpoint: { workflowId: string };
}

/** Absolute public URL for a token (works when the API is served from the same origin as the app). */
export function webhookUrl(token: string): string {
  const base = BASE_URL.startsWith("http") ? BASE_URL : `${typeof window !== "undefined" ? window.location.origin : ""}${BASE_URL}`;
  return `${base}/public/workflow-hooks/${token}`;
}

export const fetchInboundWorkflows = () => apiFetch<InboundWorkflow[]>("/workflows/endpoints");
export const fetchEndpointDeliveries = (workflowId?: string) =>
  apiFetch<EndpointDelivery[]>(`/workflows/endpoints/deliveries${workflowId ? `?workflowId=${workflowId}` : ""}`);
export const issueEndpointToken = (workflowId: string) =>
  apiFetch<{ endpointId: string; token: string; rotated: boolean }>(`/workflows/endpoints/${workflowId}/token`, { method: "POST" });
export const setEndpointEnabled = (workflowId: string, enabled: boolean) =>
  apiFetch(`/workflows/endpoints/${workflowId}/enabled`, { method: "POST", body: JSON.stringify({ enabled }) });
export const replayEndpointDelivery = (deliveryId: string) =>
  apiFetch<{ deliveryId: string; status: string; runId: string | null }>(`/workflows/endpoints/deliveries/${deliveryId}/replay`, { method: "POST" });
