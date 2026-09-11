import { apiFetch } from "@/lib/api-client";

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface CreatedApiKey extends ApiKey {
  businessId: string;
  keyHash: string;
  /** The real, one-time-reveal raw secret — never returned again after this response. */
  key: string;
}

/** GET /api-keys — real bearer credentials scoped to a subset of capabilities. */
export function fetchApiKeys(): Promise<ApiKey[]> {
  return apiFetch<ApiKey[]>("/api-keys");
}

export interface CreateApiKeyInput {
  name: string;
  scopes: string[];
}

export function createApiKey(input: CreateApiKeyInput): Promise<CreatedApiKey> {
  return apiFetch<CreatedApiKey>("/api-keys", { method: "POST", body: JSON.stringify(input) });
}

export function revokeApiKey(id: string): Promise<ApiKey> {
  return apiFetch<ApiKey>(`/api-keys/${id}`, { method: "DELETE" });
}

export interface DeveloperWebhook {
  id: string;
  businessId: string;
  provider: "developer";
  triggerKey: string;
  targetUrl: string;
  secret: string;
  active: boolean;
  createdAt: string;
}

/** GET /outbound-webhooks — the Developer & API screen's own subscriptions (`provider: developer`), same real delivery pipeline as the automation-platform ones. */
export function fetchDeveloperWebhooks(): Promise<DeveloperWebhook[]> {
  return apiFetch<DeveloperWebhook[]>("/outbound-webhooks");
}

export interface CreateDeveloperWebhookInput {
  triggerKey: string;
  targetUrl: string;
}

export function createDeveloperWebhook(input: CreateDeveloperWebhookInput): Promise<DeveloperWebhook> {
  return apiFetch<DeveloperWebhook>("/outbound-webhooks", { method: "POST", body: JSON.stringify(input) });
}

export function removeDeveloperWebhook(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/outbound-webhooks/${id}`, { method: "DELETE" });
}

export interface DeveloperWebhookDelivery {
  id: string;
  webhookId: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  lastAttemptAt: string | null;
  responseStatus: number | null;
  error: string | null;
  createdAt: string;
}

export function fetchDeveloperWebhookDeliveries(id: string): Promise<DeveloperWebhookDelivery[]> {
  return apiFetch<DeveloperWebhookDelivery[]>(`/outbound-webhooks/${id}/deliveries`);
}

/** A genuinely real test delivery — the same HMAC-signed HTTP POST a live trigger would send, payload honestly labelled `test: true`. */
export function testDeveloperWebhook(id: string): Promise<DeveloperWebhookDelivery> {
  return apiFetch<DeveloperWebhookDelivery>(`/outbound-webhooks/${id}/test`, { method: "POST" });
}
