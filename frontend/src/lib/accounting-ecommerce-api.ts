import { apiFetch } from "@/lib/api-client";

export const ACCOUNTING_PROVIDERS = ["quickbooks", "xero"] as const;
export const ECOMMERCE_PROVIDERS = ["shopify", "woocommerce"] as const;
export type AccountingProvider = (typeof ACCOUNTING_PROVIDERS)[number];
export type EcommerceProvider = (typeof ECOMMERCE_PROVIDERS)[number];

export const PROVIDER_LABELS: Record<AccountingProvider | EcommerceProvider, string> = {
  quickbooks: "QuickBooks",
  xero: "Xero",
  shopify: "Shopify",
  woocommerce: "WooCommerce",
};

export interface AccountingMapping {
  id: string;
  businessId: string;
  provider: AccountingProvider;
  productCategory: string | null;
  externalAccountCode: string;
  externalTaxCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export function fetchAccountingMappings(provider?: AccountingProvider): Promise<AccountingMapping[]> {
  const qs = provider ? `?provider=${provider}` : "";
  return apiFetch<AccountingMapping[]>(`/integrations/accounting/mappings${qs}`);
}

export interface UpsertAccountingMappingInput {
  provider: AccountingProvider;
  productCategory?: string;
  externalAccountCode: string;
  externalTaxCode?: string;
}

export function upsertAccountingMapping(input: UpsertAccountingMappingInput): Promise<AccountingMapping> {
  return apiFetch<AccountingMapping>("/integrations/accounting/mappings", { method: "POST", body: JSON.stringify(input) });
}

export function removeAccountingMapping(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/integrations/accounting/mappings/${id}`, { method: "DELETE" });
}

export interface AccountingSyncResultRow {
  orderId: string;
  orderNo: number;
  status: "success" | "failed";
  message?: string;
}

export interface AccountingSyncResult {
  provider: AccountingProvider;
  pushed: number;
  failed: number;
  results: AccountingSyncResultRow[];
}

/** POST /integrations/accounting/sync — pushes real not-yet-synced completed orders as real invoices. */
export function runAccountingSync(): Promise<AccountingSyncResult> {
  return apiFetch<AccountingSyncResult>("/integrations/accounting/sync", { method: "POST" });
}

export interface ProductConflictResult {
  sku: string;
  winner: "local" | "remote";
  localQty: number;
  remoteQty: number;
}

export interface EcommerceSyncResult {
  provider: EcommerceProvider;
  productsReconciled: number;
  conflicts: ProductConflictResult[];
  ordersImported: number;
}

/**
 * POST /integrations/ecommerce/sync — real two-way stock reconciliation (most-recently-updated
 * side wins automatically, server-side) + real one-directional order import.
 */
export function runEcommerceSync(): Promise<EcommerceSyncResult[]> {
  return apiFetch<EcommerceSyncResult[]>("/integrations/ecommerce/sync", { method: "POST" });
}

export interface EcommerceConflictRow {
  id: string;
  provider: EcommerceProvider;
  sku: string;
  winner: "local" | "remote";
  localQty: number;
  remoteQty: number;
  createdAt: string;
}

/** GET /integrations/ecommerce/conflicts — the real, persisted conflict history across every run, not just the latest. */
export function fetchEcommerceConflicts(provider?: EcommerceProvider): Promise<EcommerceConflictRow[]> {
  const qs = provider ? `?provider=${provider}` : "";
  return apiFetch<EcommerceConflictRow[]>(`/integrations/ecommerce/conflicts${qs}`);
}
