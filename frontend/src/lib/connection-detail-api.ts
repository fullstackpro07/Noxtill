import { apiFetch } from "@/lib/api-client";

export type ConnectionCategory = "ads" | "directory" | "accounting" | "ecommerce" | "automation" | "other";

export interface SyncLogEntry {
  occurredAt: string;
  success: boolean;
  message: string | null;
}

export interface AccountingMappingRow {
  id: string;
  provider: string;
  productCategory: string | null;
  externalAccountCode: string;
  externalTaxCode: string | null;
}

/** E-commerce conflict history depth fix — a real, persisted row per real stock conflict. */
export interface EcommerceConflictRow {
  id: string;
  provider: string;
  sku: string;
  winner: "local" | "remote";
  localQty: number;
  remoteQty: number;
  createdAt: string;
}

/** The real OAuth/direct-connect shape — every category except automation. */
export interface OAuthConnectionDetail {
  provider: string;
  category: Exclude<ConnectionCategory, "automation">;
  status: "not_connected" | "connected" | "needs_attention";
  connectedAt: string | null;
  lastSyncAt: string | null;
  tokenExpiresAt: string | null;
  syncLog: SyncLogEntry[];
  fieldMapping: AccountingMappingRow[] | null;
  conflicts: EcommerceConflictRow[] | null;
}

export interface AutomationSubscriptionDetail {
  id: string;
  triggerKey: string;
  targetUrl: string;
  active: boolean;
  createdAt: string;
  recentDeliveries: { id: string; status: string; attempts: number; responseStatus: number | null; error: string | null; createdAt: string }[];
}

/** The real subscription-based shape for zapier/make/n8n/developer — no OAuth connection exists for these. */
export interface AutomationConnectionDetail {
  provider: string;
  category: "automation";
  subscriptions: AutomationSubscriptionDetail[];
}

export type ConnectionDetail = OAuthConnectionDetail | AutomationConnectionDetail;

export function isAutomationDetail(detail: ConnectionDetail): detail is AutomationConnectionDetail {
  return detail.category === "automation";
}

/** GET /integrations/:provider (UPD-BE-132) — one real, generic detail view across every connector category. */
export function fetchConnectionDetail(provider: string): Promise<ConnectionDetail> {
  return apiFetch<ConnectionDetail>(`/integrations/${provider}`);
}

/**
 * POST /integrations/:provider/sync — dispatches to whichever real action applies for that
 * category: Accounting/E-commerce/Directory run their own real sync; Ads runs a real on-demand
 * stats refresh for this business's campaigns on that provider (rather than waiting up to an
 * hour); Automation platforms re-attempt every real delivery that previously failed.
 */
export function triggerConnectionSync(provider: string): Promise<unknown> {
  return apiFetch(`/integrations/${provider}/sync`, { method: "POST" });
}
