import { apiFetch } from "@/lib/api-client";

export const AUTOMATION_PROVIDERS = ["zapier", "make", "n8n"] as const;
export type AutomationProvider = (typeof AUTOMATION_PROVIDERS)[number];

export const AUTOMATION_PROVIDER_LABELS: Record<AutomationProvider, string> = {
  zapier: "Zapier",
  make: "Make",
  n8n: "n8n",
};

export interface AutomationTrigger {
  key: string;
  label: string;
  samplePayload: Record<string, unknown>;
}

/** GET /integrations/automation/triggers — every real, subscribable trigger with a real sample payload. */
export function fetchAutomationTriggers(): Promise<AutomationTrigger[]> {
  return apiFetch<AutomationTrigger[]>("/integrations/automation/triggers");
}

export interface OutboundWebhook {
  id: string;
  businessId: string;
  provider: AutomationProvider | "developer";
  triggerKey: string;
  targetUrl: string;
  secret: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export function fetchOutboundWebhooks(): Promise<OutboundWebhook[]> {
  return apiFetch<OutboundWebhook[]>("/integrations/automation/webhooks");
}

export interface SubscribeWebhookInput {
  provider: AutomationProvider;
  triggerKey: string;
  targetUrl: string;
}

export function subscribeWebhook(input: SubscribeWebhookInput): Promise<OutboundWebhook> {
  return apiFetch<OutboundWebhook>("/integrations/automation/webhooks", { method: "POST", body: JSON.stringify(input) });
}

export function unsubscribeWebhook(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/integrations/automation/webhooks/${id}`, { method: "DELETE" });
}

export interface OutboundWebhookDelivery {
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

export function fetchWebhookDeliveries(id: string): Promise<OutboundWebhookDelivery[]> {
  return apiFetch<OutboundWebhookDelivery[]>(`/integrations/automation/webhooks/${id}/deliveries`);
}

/** A genuinely real test delivery — the same HMAC-signed HTTP POST a live trigger would send, payload honestly labelled `test: true`. */
export function testWebhook(id: string): Promise<OutboundWebhookDelivery> {
  return apiFetch<OutboundWebhookDelivery>(`/integrations/automation/webhooks/${id}/test`, { method: "POST" });
}
