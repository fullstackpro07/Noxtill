import { apiFetch } from "@/lib/api-client";

export type ProcurementMetric = {
  value: number | null;
  availability: "tracked" | "partial" | "not_tracked" | "not_available";
  detail: string;
};

export interface ProcurementOverview {
  currency: string | null;
  metrics: {
    openRequests: ProcurementMetric;
    pendingApprovalValue: ProcurementMetric;
    openRfqs: ProcurementMetric;
    committedPoValue: ProcurementMetric;
    receiptsPending: ProcurementMetric;
    matchExceptions: ProcurementMetric;
    spendVsBudget: ProcurementMetric;
    supplierConcentration: ProcurementMetric;
  };
  openPurchaseOrderCount: number;
  supplierCommitments: Array<{
    supplierId: string;
    supplierName: string;
    committedValue: number;
  }>;
  topCategories: Array<{ category: string; committedValue: number }>;
  recentPurchaseOrders: Array<{
    id: string;
    reference: string;
    supplier: string;
    status: string;
    createdAt: string;
  }>;
  dataCompleteness: Record<string, "tracked" | "not_tracked" | "not_available">;
}

export type ProcurementRequestStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "sourcing"
  | "rejected"
  | "converted"
  | "cancelled";

export interface ProcurementRequestItemInput {
  lineType: "stock" | "service" | "asset" | "expense";
  productId?: string;
  description: string;
  category?: string;
  quantity: number;
  estimatedUnitCost: number;
}

export interface ProcurementRequestInput {
  branchBusinessId?: string;
  department?: string;
  costCenter?: string;
  neededBy?: string;
  reason: string;
  urgency: "low" | "normal" | "high" | "urgent";
  budgetCode?: string;
  currency: string;
  supplierId?: string;
  attachmentUrls?: string[];
  items: ProcurementRequestItemInput[];
}

export interface ProcurementRequest {
  id: string;
  requester: { id: string; name: string; email: string | null };
  branch: { id: string; name: string } | null;
  department: string | null;
  costCenter: string | null;
  neededBy: string | null;
  reason: string;
  urgency: "low" | "normal" | "high" | "urgent";
  budgetCode: string | null;
  currency: string;
  status: ProcurementRequestStatus;
  version: number;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewer: { id: string; name: string; email: string | null } | null;
  decisionReason: string | null;
  supplier: { id: string; name: string } | null;
  attachmentUrls: string[];
  convertedPurchaseOrder: { id: string; status: string } | null;
  sourceRfqs: Array<{
    id: string;
    status: "draft" | "open" | "awarded" | "closed" | "cancelled";
    updatedAt: string;
  }>;
  totalEstimate: number;
  items: Array<{
    id: string;
    lineType: ProcurementRequestItemInput["lineType"];
    productId: string | null;
    productName: string | null;
    description: string;
    category: string | null;
    quantity: number;
    estimatedUnitCost: number;
    estimatedLineTotal: number;
  }>;
  events: Array<{
    id: string;
    type: string;
    fromStatus: ProcurementRequestStatus | null;
    toStatus: ProcurementRequestStatus | null;
    version: number;
    reason: string | null;
    actor: { id: string; name: string } | null;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface ProcurementRequestPage {
  items: ProcurementRequest[];
  nextCursor: string | null;
  hasMore: boolean;
}

export function fetchProcurementOverview(): Promise<ProcurementOverview> {
  return apiFetch<ProcurementOverview>("/procurement/overview");
}

export function fetchProcurementRequests(
  cursor?: string,
): Promise<ProcurementRequestPage> {
  const query = new URLSearchParams({ limit: "20" });
  if (cursor) query.set("cursor", cursor);
  return apiFetch<ProcurementRequestPage>(`/procurement/requests?${query}`);
}

export function createProcurementRequest(input: ProcurementRequestInput) {
  return apiFetch<ProcurementRequest>("/procurement/requests", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateProcurementRequest(
  id: string,
  expectedVersion: number,
  input: ProcurementRequestInput,
) {
  return apiFetch<ProcurementRequest>(
    `/procurement/requests/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ ...input, expectedVersion }),
    },
  );
}

export function submitProcurementRequest(id: string) {
  return apiFetch<ProcurementRequest>(
    `/procurement/requests/${encodeURIComponent(id)}/submit`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export function withdrawProcurementRequest(id: string) {
  return apiFetch<ProcurementRequest>(
    `/procurement/requests/${encodeURIComponent(id)}/withdraw`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export function convertProcurementRequest(id: string) {
  return apiFetch<{
    request: ProcurementRequest;
    purchaseOrder: { id: string; status: string; href: string };
  }>(`/procurement/requests/${encodeURIComponent(id)}/convert`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function sourceProcurementRequest(id: string) {
  return apiFetch<{
    id: string;
    status: "draft" | "open" | "awarded" | "closed" | "cancelled";
    sourceProcurementRequestId: string | null;
  }>(`/procurement/requests/${id}/source`, { method: "POST" });
}
