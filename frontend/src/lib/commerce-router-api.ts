import { apiFetch } from "@/lib/api-client";
import type { FulfillmentMappingRole, FulfillmentNodeType } from "@/lib/commerce-fulfillment-api";

export type RoutingMode = "single" | "split";
export type StockCheck = "available" | "insufficient" | "not_in_branch" | "not_tracked";
export type MarketCheck = "served" | "not_served" | "not_configured" | "unknown";

export interface RoutableLine {
  orderItemId: string;
  productId: string;
  name: string;
  sku: string | null;
  qty: number;
}

export interface RouteAllocation {
  orderItemId: string;
  qty: number;
  node: { id: string; name: string };
}

export interface RouterQueueRow {
  orderId: string;
  orderNo: number;
  orderType: "online" | "delivery";
  status: string;
  externalProvider: string | null;
  customer: { id: string; name: string } | null;
  deliveryAddress: string | null;
  createdAt: string;
  lines: RoutableLine[];
  route: {
    decisionId: string;
    mode: RoutingMode;
    destinationCountry: string | null;
    overrodeRecommendation: boolean;
    decidedAt: string;
    allocations: RouteAllocation[];
  } | null;
  recommendation: Recommendation | null;
  unroutable: boolean;
}

export interface Recommendation {
  mode: RoutingMode;
  allocations: Array<{ orderItemId: string; nodeId: string }>;
  why: string[];
}

export interface NodeEvaluation {
  nodeId: string;
  name: string;
  type: FulfillmentNodeType;
  market: MarketCheck;
  processingDays: number | null;
  costPerOrder: number | null;
  eligibleForAll: boolean;
  lines: Array<{
    orderItemId: string;
    role: FulfillmentMappingRole | null;
    stock: StockCheck;
    eligible: boolean;
    reasons: string[];
  }>;
}

export interface RouterCandidates {
  orderId: string;
  orderNo: number;
  policyVersion: string;
  destinationCountry: string | null;
  lines: RoutableLine[];
  nodes: NodeEvaluation[];
  recommendation: Recommendation | null;
  unroutableLineIds: string[];
}

export interface RouteHistoryEntry {
  id: string;
  status: "active" | "superseded" | "cancelled";
  mode: RoutingMode;
  destinationCountry: string | null;
  overrodeRecommendation: boolean;
  reason: string | null;
  endedReason: string | null;
  createdAt: string;
  allocations: RouteAllocation[];
}

const BASE = "/commerce/fulfillment-router";

export function fetchRouterQueue(): Promise<RouterQueueRow[]> {
  return apiFetch<RouterQueueRow[]>(`${BASE}/queue`);
}

export function fetchRouterCandidates(orderId: string, destinationCountry?: string): Promise<RouterCandidates> {
  const query = destinationCountry ? `?destinationCountry=${encodeURIComponent(destinationCountry)}` : "";
  return apiFetch<RouterCandidates>(`${BASE}/orders/${orderId}/candidates${query}`);
}

export function fetchRouteHistory(orderId: string): Promise<RouteHistoryEntry[]> {
  return apiFetch<RouteHistoryEntry[]>(`${BASE}/orders/${orderId}/history`);
}

export function assignRoute(
  orderId: string,
  input: { destinationCountry?: string; allocations: Array<{ orderItemId: string; nodeId: string }>; reason?: string },
) {
  return apiFetch<{ id: string }>(`${BASE}/orders/${orderId}/assign`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function cancelRoute(decisionId: string, reason: string) {
  return apiFetch<{ id: string }>(`${BASE}/decisions/${decisionId}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
