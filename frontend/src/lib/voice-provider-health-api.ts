import { apiFetch } from "@/lib/api-client";

export type HealthStatus = "ok" | "warning" | "error" | "not_configured";

export interface VoiceProviderHealth {
  checkedAt: string;
  overall: "ok" | "warning" | "error";
  checks: Array<{ key: string; label: string; status: HealthStatus; detail: string }>;
  activeTrackingNumbers: number;
  lastCallAt: string | null;
}

export interface VoiceUsage {
  periodStart: string;
  inboundCalls: number;
  missedCalls: number;
  callsWithAiAgent: number;
  callsWithHumanConnected: number;
  inboundMinutes: number;
  outboundDials: number;
  callbackDials: number;
  providerCharges: Array<{ unit: string; amount: string }>;
  limits: { usageCaps: "not_configured"; note: string };
}

export function fetchVoiceProviderHealth(): Promise<VoiceProviderHealth> {
  return apiFetch("/voice/settings/provider-health");
}

export function fetchVoiceUsage(): Promise<VoiceUsage> {
  return apiFetch("/voice/settings/usage");
}
