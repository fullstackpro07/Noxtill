import { apiFetch } from "@/lib/api-client";

// ── Directory / connections ─────────────────────────────────────────────────

export type HubStatus = "connected" | "needs_attention" | "paused" | "not_connected";
export type HubDirection = "Inbound" | "Outbound" | "Two-way";
export type HubConnectKind = "oauth" | "credentials" | "social" | "social-token" | "automation" | "developer" | "channel";
export type Severity = "critical" | "high" | "medium";

export interface CredentialField {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
}

export interface AttentionReason {
  code: "auth_failed" | "auth_expired" | "token_expiring" | "sync_failing" | "conflicts_pending" | "records_failed";
  text: string;
  severity: Severity;
}

export interface HubToken {
  state: "valid" | "expiring" | "expired" | "not_applicable";
  label: string;
  expiresAt: string | null;
}

export interface HubProvider {
  key: string;
  name: string;
  initials: string;
  category: string;
  benefit: string;
  direction: HubDirection;
  modules: string[];
  permissions: string;
  connectKind: HubConnectKind;
  credentialFields: CredentialField[];
  workspaceHref: string | null;
  setupRequired: boolean;
  status: HubStatus;
  connectedAt: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  records: number | null;
  recordsUnit: string;
  syncMode: "manual" | "scheduled" | "event";
  syncNote: string;
  errorsToday: number;
  token: HubToken;
  attention: AttentionReason[];
  externalAccountName: string | null;
  canPause: boolean;
  canSync: boolean;
}

export interface AdvisorFinding {
  key: string;
  severity: Severity;
  icon: string;
  providerKey: string | null;
  finding: string;
  why: string;
  affectedModules: string[];
  recordsAffected: string;
  primaryAction: { label: string; kind: "reconnect" | "resolve" | "fix-mapping" | "open" | "retry" | "revoke"; target: string };
}

export interface HubHealth {
  headline: string;
  allHealthy: boolean;
  needsAttention: number;
  connected: number;
  healthy: number;
  paused: number;
  available: number;
  syncErrorsToday: number;
  syncErrorsAcrossConnections: number;
}

export interface HubOverview {
  providers: HubProvider[];
  categories: Array<{ label: string; icon: string; meta: string }>;
  health: HubHealth;
  findings: AdvisorFinding[];
  tabCounts: { connections: number; accounting: number; ecommerce: number };
}

export const fetchHubOverview = () => apiFetch<HubOverview>("/integrations/hub/overview");

// ── Connection drawer ───────────────────────────────────────────────────────

export interface HubRow {
  label: string;
  value: string;
  tone?: "pos" | "neg" | "muted";
}
export interface HubSyncLogEntry {
  at: string;
  success: boolean;
  records: number;
  failed: number;
  durationMs: number | null;
  message: string | null;
}
export interface HubMappingRow {
  noxtill: string;
  external: string;
  direction: "Inbound" | "Outbound" | "Two-way" | "—";
  status: "Mapped" | "Conflict" | "Unmapped" | "Needs review" | "Not synced";
}
export interface HubAuditEntry {
  at: string;
  action: string;
  actor: string;
  detail: string | null;
}
export interface HubConnectionDetail {
  card: HubProvider;
  overview: HubRow[];
  health: HubRow[];
  activity: HubRow[];
  syncLog: HubSyncLogEntry[];
  fieldMapping: { rows: HubMappingRow[]; editor: "accounting" | "ecommerce" | null; note: string };
  permissions: HubRow[];
  modules: HubRow[];
  errors: { rows: HubRow[]; log: HubSyncLogEntry[] };
  audit: HubAuditEntry[];
}

export const fetchConnectionDetail = (key: string) => apiFetch<HubConnectionDetail>(`/integrations/hub/connections/${key}`);
export const pauseConnection = (key: string) => apiFetch<{ paused: true }>(`/integrations/hub/connections/${key}/pause`, { method: "POST" });
export const resumeConnection = (key: string) => apiFetch<{ paused: false }>(`/integrations/hub/connections/${key}/resume`, { method: "POST" });
export const syncConnection = (key: string) => apiFetch<Record<string, unknown>>(`/integrations/hub/connections/${key}/sync`, { method: "POST" });
export const dismissFinding = (findingKey: string) =>
  apiFetch<{ dismissedUntil: string }>("/integrations/hub/advisor/dismiss", { method: "POST", body: JSON.stringify({ findingKey }) });

export interface ConnectResult {
  authUrl?: string;
  connected?: true;
  requiresToken?: true;
}

/** Connects through whichever real endpoint the provider uses (OAuth, credentials, social, social token). */
export async function connectProvider(p: HubProvider, fields: Record<string, string>): Promise<ConnectResult> {
  if (p.connectKind === "social") return apiFetch<ConnectResult>(`/social/${p.key}/connect`, { method: "POST" });
  if (p.connectKind === "social-token")
    return apiFetch<ConnectResult>(`/social/${p.key}/connect-with-token`, { method: "POST", body: JSON.stringify({ token: fields.token ?? "" }) });
  return apiFetch<ConnectResult>(`/integrations/${p.key}/connect`, { method: "POST", body: JSON.stringify(fields) });
}

export async function disconnectProvider(p: HubProvider): Promise<void> {
  if (p.connectKind === "social" || p.connectKind === "social-token") {
    await apiFetch(`/social/${p.key}/disconnect`, { method: "POST" });
    return;
  }
  await apiFetch(`/integrations/${p.key}/disconnect`, { method: "POST" });
}

export const requestIntegration = (body: { providerName: string; useCase: string; direction: HubDirection; contactEmail?: string }) =>
  apiFetch<{ providerKey: string; businessesRequesting: number }>("/integrations/hub/requests", { method: "POST", body: JSON.stringify(body) });

// ── Accounting ──────────────────────────────────────────────────────────────

export interface AccountingOverview {
  currency: string;
  provider: "quickbooks" | "xero" | null;
  providerPaused: boolean;
  connected: boolean;
  kpis: {
    postedThisMonth: number;
    postedTotal: number;
    pending: number;
    failed: number;
    lastSyncAt: string | null;
    lastAttemptAt: string | null;
    lastAttemptOk: boolean | null;
    connectedSince: string | null;
  };
  bars: Array<{ day: string; label: string; posted: number; failed: number }>;
  mapping: {
    hasDefault: boolean;
    rows: Array<{ id: string; category: string | null; accountCode: string; taxCode: string | null }>;
    blocked: Array<{ category: string; orders: number }>;
  };
  settings: Array<{ label: string; detail: string; value: string }>;
  batchSize: number;
}
export type AccountingTxStatus = "posted" | "failed" | "pending";
export interface AccountingTransaction {
  id: string;
  date: string;
  orderNo: number;
  amount: number;
  externalId: string | null;
  status: AccountingTxStatus;
  error: string | null;
  attemptedAt: string | null;
  ledgerAccounts: string[];
  lines: Array<{ name: string; qty: number; amount: number; category: string | null; account: string | null }>;
}
export const fetchAccountingOverview = () => apiFetch<AccountingOverview>("/integrations/hub/accounting/overview");
export const fetchAccountingTransactions = () => apiFetch<AccountingTransaction[]>("/integrations/hub/accounting/transactions");
export const syncAccounting = (orderIds?: string[]) =>
  apiFetch<{ provider: string; pushed: number; failed: number; results: Array<{ orderId: string; orderNo: number; status: "success" | "failed"; message?: string }> }>(
    "/integrations/accounting/sync",
    { method: "POST", body: JSON.stringify(orderIds ? { orderIds } : {}) },
  );

// ── E-commerce ──────────────────────────────────────────────────────────────

export type SourceOfTruth = "noxtill" | "store" | "manual";
export interface EcommerceOverview {
  connected: boolean;
  connections: Array<{
    provider: "shopify" | "woocommerce";
    status: string;
    paused: boolean;
    sourceOfTruth: SourceOfTruth;
    lastSyncAt: string | null;
    lastAttemptOk: boolean | null;
    productsReconciled: number | null;
    pendingConflicts: number;
  }>;
  kpis: { productsReconciled: number; productsKnown: boolean; ordersImportedMonth: number; ordersImportedTotal: number; pendingConflicts: number; lastSyncAt: string | null };
  channelBars: Array<{ label: string; weekStart: string; inStore: number; online: number }>;
}
export interface EcommerceConflict {
  id: string;
  provider: "shopify" | "woocommerce";
  sku: string;
  productName: string | null;
  localQty: number;
  remoteQty: number;
  localUpdatedAt: string | null;
  remoteUpdatedAt: string | null;
  status: "pending" | "resolved" | "auto";
  resolution: string | null;
  resolvedQty: number | null;
  resolvedAt: string | null;
  detectedAt: string;
}
export interface EcommerceItems {
  orders: Array<{ id: string; orderNo: number; storeRef: string | null; provider: string | null; total: number; at: string }>;
  conflicts: EcommerceConflict[];
}
export const fetchEcommerceOverview = () => apiFetch<EcommerceOverview>("/integrations/hub/ecommerce/overview");
export const fetchEcommerceItems = () => apiFetch<EcommerceItems>("/integrations/hub/ecommerce/items");
export const syncEcommerce = () =>
  apiFetch<Array<{ provider: string; productsReconciled: number; conflicts: Array<{ sku: string; winner: string }>; ordersImported: number }>>("/integrations/ecommerce/sync", { method: "POST" });
export const setSourceOfTruth = (provider: "shopify" | "woocommerce", value: SourceOfTruth) =>
  apiFetch<{ sourceOfTruth: SourceOfTruth }>("/integrations/ecommerce/source-of-truth", { method: "PUT", body: JSON.stringify({ provider, value }) });
export const resolveConflict = (id: string, choice: "noxtill" | "store" | "custom", qty?: number) =>
  apiFetch<EcommerceConflict>(`/integrations/ecommerce/conflicts/${id}/resolve`, { method: "POST", body: JSON.stringify({ choice, ...(qty !== undefined ? { qty } : {}) }) });

// ── Automation ──────────────────────────────────────────────────────────────

export interface AutomationOverview {
  kpis: { activeAutomations: number; platformsConnected: number; triggersFiredMonth: number; failedDeliveriesMonth: number; actionsPerformed: number | null };
  platforms: Array<{
    key: "zapier" | "make" | "n8n";
    name: string;
    initials: string;
    benefit: string;
    connected: boolean;
    automations: number;
    lastFiredAt: string | null;
    subscriptions: Array<{ id: string; triggerKey: string; targetUrl: string; active: boolean; createdAt: string; lastFiredAt: string | null }>;
  }>;
  triggers: Array<{ key: string; label: string; description: string; samplePayload: Record<string, unknown>; automations: number }>;
}
export const fetchAutomationOverview = () => apiFetch<AutomationOverview>("/integrations/hub/automation/overview");

// ── Developer ───────────────────────────────────────────────────────────────

export interface DeveloperOverview {
  hourlyLimit: number;
  kpis: {
    activeKeys: number;
    totalKeys: number;
    requestsMonth: number;
    busiestKeyThisHour: number;
    headroomPct: number;
    deliveriesMonth: number;
    failedDeliveriesMonth: number;
    failedPct: number;
    deliveredPct14d: number | null;
  };
  days: Array<{ day: string; label: string; requests: number; ok: number; failed: number }>;
  keys: Array<{ id: string; name: string; prefix: string; scopes: string[]; createdAt: string; lastUsedAt: string | null; revokedAt: string | null; requestsMonth: number }>;
  webhooks: Array<{
    id: string;
    triggerKey: string;
    event: string;
    targetUrl: string;
    active: boolean;
    createdAt: string;
    latest: {
      id: string;
      status: string;
      attempts: number;
      responseStatus: number | null;
      lastAttemptAt: string | null;
      error: string | null;
      payload: unknown;
    } | null;
  }>;
  events: Array<{ key: string; label: string }>;
}
export interface ApiScope {
  key: string;
  group: string;
  label: string;
}
export const fetchDeveloperOverview = () => apiFetch<DeveloperOverview>("/developer/overview");
export const fetchApiScopes = () => apiFetch<ApiScope[]>("/developer/scopes");
export const createApiKey = (name: string, scopes: string[]) =>
  apiFetch<{ id: string; name: string; keyPrefix: string; key: string }>("/api-keys", { method: "POST", body: JSON.stringify({ name, scopes }) });
export const revokeApiKey = (id: string) => apiFetch<unknown>(`/api-keys/${id}`, { method: "DELETE" });
export const createDeveloperWebhook = (triggerKey: string, targetUrl: string) =>
  apiFetch<{ id: string; secret: string }>("/outbound-webhooks", { method: "POST", body: JSON.stringify({ triggerKey, targetUrl }) });
export const deleteDeveloperWebhook = (id: string) => apiFetch<unknown>(`/outbound-webhooks/${id}`, { method: "DELETE" });
export const testDeveloperWebhook = (id: string) => apiFetch<unknown>(`/outbound-webhooks/${id}/test`, { method: "POST" });
export const retryDelivery = (deliveryId: string) => apiFetch<unknown>(`/outbound-webhooks/deliveries/${deliveryId}/retry`, { method: "POST" });

// ── Business map ────────────────────────────────────────────────────────────

export interface LineageChain {
  key: string;
  providers: string[];
  title: string;
  icon: string;
  trigger: string;
  nodes: Array<{ label: string; icon: string; href: string | null }>;
  note: string;
  health: { state: "healthy" | "attention" | "not_connected"; label: string };
}
export const fetchLineage = () => apiFetch<{ chains: LineageChain[] }>("/integrations/hub/lineage");

export const HUB_KEYS = {
  overview: ["integrations-hub", "overview"] as const,
  connection: (key: string) => ["integrations-hub", "connection", key] as const,
  accounting: ["integrations-hub", "accounting"] as const,
  accountingTx: ["integrations-hub", "accounting-tx"] as const,
  ecommerce: ["integrations-hub", "ecommerce"] as const,
  ecommerceItems: ["integrations-hub", "ecommerce-items"] as const,
  automation: ["integrations-hub", "automation"] as const,
  developer: ["integrations-hub", "developer"] as const,
  lineage: ["integrations-hub", "lineage"] as const,
  scopes: ["integrations-hub", "scopes"] as const,
};
