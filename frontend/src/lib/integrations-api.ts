import { apiFetch } from "@/lib/api-client";
import type { ConnectorKey, ConnectorStatus } from "@/lib/integrations";

/** Frontend keys vs the backend's `IntegrationProvider` enum only differ for one value: merchant_center -> merchant. */
const TO_BACKEND_PROVIDER: Record<ConnectorKey, string> = {
  email: "email",
  gmb: "gmb",
  google_ads: "google_ads",
  merchant_center: "merchant",
  meta_ads: "meta_ads",
  tiktok_ads: "tiktok_ads",
};

const FROM_BACKEND_PROVIDER: Record<string, ConnectorKey> = Object.fromEntries(
  Object.entries(TO_BACKEND_PROVIDER).map(([fe, be]) => [be, fe as ConnectorKey]),
);

interface RawIntegrationStatus {
  provider: string;
  status: ConnectorStatus;
  updatedAt: string | null;
}

/** GET /integrations (BE-082) — returns real status for all 6 providers, keyed by frontend ConnectorKey. */
export async function fetchIntegrations(): Promise<Record<ConnectorKey, ConnectorStatus>> {
  const rows = await apiFetch<RawIntegrationStatus[]>("/integrations");
  const result = {} as Record<ConnectorKey, ConnectorStatus>;
  for (const row of rows) {
    const key = FROM_BACKEND_PROVIDER[row.provider];
    if (key) result[key] = row.status;
  }
  return result;
}

export interface ConnectResult {
  authUrl?: string;
  connected?: true;
}

export function connectIntegration(key: ConnectorKey): Promise<ConnectResult> {
  return apiFetch<ConnectResult>(`/integrations/${TO_BACKEND_PROVIDER[key]}/connect`, { method: "POST" });
}

export async function disconnectIntegration(key: ConnectorKey): Promise<void> {
  await apiFetch(`/integrations/${TO_BACKEND_PROVIDER[key]}/disconnect`, { method: "POST" });
}
