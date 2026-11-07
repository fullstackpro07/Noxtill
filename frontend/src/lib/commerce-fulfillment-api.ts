import { apiFetch } from "@/lib/api-client";

export type FulfillmentNodeType =
  | "own_location"
  | "third_party_warehouse"
  | "dropship_supplier"
  | "print_on_demand"
  | "manufacturer"
  | "marketplace_fulfillment"
  | "other";
export type FulfillmentNodeStatus = "active" | "disabled";
export type FulfillmentMappingRole = "primary" | "backup";
export type FulfillmentCoverage = "covered" | "no_backup" | "primary_unavailable" | "gap";

export interface FulfillmentNode {
  id: string;
  name: string;
  type: FulfillmentNodeType;
  status: FulfillmentNodeStatus;
  disabledReason: string | null;
  branch: { id: string; name: string | null; active: boolean } | null;
  supplier: { id: string; name: string } | null;
  country: string | null;
  serviceMarkets: string[];
  processingDays: number | null;
  cutoffTime: string | null;
  costPerOrder: number | null;
  dailyCapacity: number | null;
  notes: string | null;
  mappedProducts: number;
  primaryFor: number;
  backupFor: number;
  /** Real branch stock for own locations only; external nodes have no stock connector. */
  stock: { tracked: boolean; units: number | null; skusMatched: number; skusMissing: number };
  createdAt: string;
  updatedAt: string;
}

export interface FulfillmentBranch {
  id: string;
  name: string;
  active: boolean;
}

export interface FulfillmentCoverageRow {
  productId: string;
  name: string;
  sku: string | null;
  stockQty: number;
  coverage: FulfillmentCoverage;
  mappings: Array<{
    id: string;
    role: FulfillmentMappingRole;
    priority: number;
    node: { id: string; name: string; type: FulfillmentNodeType; status: FulfillmentNodeStatus };
  }>;
}

export interface FulfillmentCoverageResult {
  summary: {
    activeProducts: number;
    covered: number;
    noBackup: number;
    primaryUnavailable: number;
    gaps: number;
  };
  products: FulfillmentCoverageRow[];
}

export interface FulfillmentNodeInput {
  name?: string;
  type?: FulfillmentNodeType;
  branchBusinessId?: string | null;
  supplierId?: string | null;
  country?: string | null;
  serviceMarkets?: string[];
  processingDays?: number | null;
  cutoffTime?: string | null;
  costPerOrder?: number | null;
  dailyCapacity?: number | null;
  notes?: string | null;
}

const BASE = "/commerce/fulfillment-network";

export function fetchFulfillmentNodes(): Promise<FulfillmentNode[]> {
  return apiFetch<FulfillmentNode[]>(`${BASE}/nodes`);
}

export function fetchFulfillmentBranches(): Promise<FulfillmentBranch[]> {
  return apiFetch<FulfillmentBranch[]>(`${BASE}/branches`);
}

export function fetchFulfillmentCoverage(): Promise<FulfillmentCoverageResult> {
  return apiFetch<FulfillmentCoverageResult>(`${BASE}/coverage`);
}

export function createFulfillmentNode(input: FulfillmentNodeInput & { name: string; type: FulfillmentNodeType }) {
  return apiFetch<FulfillmentNode>(`${BASE}/nodes`, { method: "POST", body: JSON.stringify(input) });
}

export function updateFulfillmentNode(id: string, input: FulfillmentNodeInput) {
  return apiFetch<FulfillmentNode>(`${BASE}/nodes/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function disableFulfillmentNode(id: string, reason: string) {
  return apiFetch<FulfillmentNode>(`${BASE}/nodes/${id}/disable`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function enableFulfillmentNode(id: string) {
  return apiFetch<FulfillmentNode>(`${BASE}/nodes/${id}/enable`, { method: "POST" });
}

export function setFulfillmentMapping(input: {
  nodeId: string;
  productId: string;
  role: FulfillmentMappingRole;
  priority?: number;
}) {
  return apiFetch<{ id: string }>(`${BASE}/mappings`, { method: "POST", body: JSON.stringify(input) });
}

export function removeFulfillmentMapping(id: string) {
  return apiFetch<{ removed: true }>(`${BASE}/mappings/${id}`, { method: "DELETE" });
}
