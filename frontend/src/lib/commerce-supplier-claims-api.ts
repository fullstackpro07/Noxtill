import { apiFetch } from "@/lib/api-client";

export type CommerceSupplierClaimStatus =
  | "draft"
  | "submitted"
  | "acknowledged"
  | "partially_settled"
  | "settled"
  | "rejected"
  | "closed";

export type CommerceSupplierClaimEvidenceType =
  | "photo"
  | "invoice"
  | "delivery_record"
  | "inspection_report"
  | "correspondence"
  | "other";

export type CommerceSupplierClaimSettlementType =
  | "credit"
  | "refund"
  | "replacement"
  | "other";

export type CommerceSupplierClaimCommunicationChannel =
  | "email"
  | "phone"
  | "portal"
  | "messaging"
  | "other";

export type CommerceSupplierClaimCommunicationDirection =
  | "inbound"
  | "outbound"
  | "internal";

export interface CommerceSupplierClaim {
  id: string;
  supplierId: string;
  purchaseOrderId: string | null;
  reference: string | null;
  reasonCode: string;
  reason: string;
  currency: string;
  status: CommerceSupplierClaimStatus;
  version: number;
  submittedAt: string | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  supplier: { id: string; name: string; phone: string | null; email: string | null };
  purchaseOrder: { id: string; status: string; createdAt: string } | null;
  items: Array<{
    id: string;
    productId: string | null;
    description: string;
    quantityAffected: number;
    productLossAmount: number;
    freightLossAmount: number;
    otherLossAmount: number;
    lineLossAmount: number;
    product: { id: string; name: string; sku: string | null } | null;
    purchaseOrderItem: {
      id: string;
      qtyOrdered: number;
      qtyReceived: number;
      unitCost: number;
    } | null;
  }>;
  evidence: Array<{
    id: string;
    evidenceType: CommerceSupplierClaimEvidenceType;
    note: string | null;
    sha256: string | null;
    addedByUserId: string | null;
    createdAt: string;
    downloadUrl: string;
  }>;
  communications: Array<{
    id: string;
    channel: CommerceSupplierClaimCommunicationChannel;
    direction: CommerceSupplierClaimCommunicationDirection;
    summary: string;
    occurredAt: string;
    createdAt: string;
  }>;
  settlements: Array<{
    id: string;
    settlementType: CommerceSupplierClaimSettlementType;
    amount: number;
    currency: string;
    financialReference: string | null;
    note: string | null;
    settledAt: string;
    createdAt: string;
  }>;
  requestedAmount: number;
  recoveredAmount: number;
  outstandingAmount: number;
}

export interface CommerceSupplierClaimAudit {
  id: string;
  action: string;
  reason: string | null;
  before: unknown;
  after: unknown;
  actorUserId: string | null;
  createdAt: string;
}

export interface CommerceSupplierLossPattern {
  supplier: { id: string; name: string };
  product: { id: string; name: string; sku: string | null } | null;
  claimCount: number;
  quantityAffected: number;
  claimedLossAmount: number;
}

export interface CreateCommerceSupplierClaimInput {
  supplierId: string;
  purchaseOrderId?: string;
  reference?: string;
  reasonCode: string;
  reason: string;
  currency: string;
  items: Array<{
    productId?: string;
    purchaseOrderItemId?: string;
    description: string;
    quantityAffected: number;
    productLossAmount: number;
    freightLossAmount?: number;
    otherLossAmount?: number;
  }>;
}

const claimPath = (id: string) => `/commerce/supplier-claims/${id}`;

export function fetchCommerceSupplierClaims(filters: {
  status?: CommerceSupplierClaimStatus;
  supplierId?: string;
} = {}): Promise<CommerceSupplierClaim[]> {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.supplierId) params.set("supplierId", filters.supplierId);
  return apiFetch<CommerceSupplierClaim[]>(
    `/commerce/supplier-claims${params.size ? `?${params}` : ""}`,
  );
}

export function fetchCommerceSupplierClaimHistory(
  id: string,
): Promise<CommerceSupplierClaimAudit[]> {
  return apiFetch<CommerceSupplierClaimAudit[]>(`${claimPath(id)}/audit`);
}

export function fetchCommerceSupplierLossPatterns(): Promise<CommerceSupplierLossPattern[]> {
  return apiFetch<CommerceSupplierLossPattern[]>("/commerce/supplier-claims/loss-patterns");
}

export function createCommerceSupplierClaim(
  input: CreateCommerceSupplierClaimInput,
): Promise<CommerceSupplierClaim> {
  return apiFetch<CommerceSupplierClaim>("/commerce/supplier-claims", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function uploadCommerceSupplierClaimEvidence(
  id: string,
  input: { file: File; evidenceType: CommerceSupplierClaimEvidenceType; note?: string },
): Promise<{ id: string; claimVersion: number }> {
  const body = new FormData();
  body.append("file", input.file);
  body.append("evidenceType", input.evidenceType);
  if (input.note?.trim()) body.append("note", input.note.trim());
  return apiFetch<{ id: string; claimVersion: number }>(`${claimPath(id)}/evidence/upload`, {
    method: "POST",
    body,
  });
}

export function submitCommerceSupplierClaim(
  id: string,
  expectedVersion: number,
  reason: string,
): Promise<CommerceSupplierClaim> {
  return apiFetch<CommerceSupplierClaim>(`${claimPath(id)}/actions/submit`, {
    method: "POST",
    body: JSON.stringify({ expectedVersion, reason }),
  });
}

export function acknowledgeCommerceSupplierClaim(
  id: string,
  expectedVersion: number,
  reason: string,
): Promise<CommerceSupplierClaim> {
  return apiFetch<CommerceSupplierClaim>(`${claimPath(id)}/actions/acknowledge`, {
    method: "POST",
    body: JSON.stringify({ expectedVersion, reason }),
  });
}

export function rejectCommerceSupplierClaim(
  id: string,
  expectedVersion: number,
  reason: string,
): Promise<CommerceSupplierClaim> {
  return apiFetch<CommerceSupplierClaim>(`${claimPath(id)}/actions/reject`, {
    method: "POST",
    body: JSON.stringify({ expectedVersion, reason }),
  });
}

export function closeCommerceSupplierClaim(
  id: string,
  expectedVersion: number,
  reason: string,
): Promise<CommerceSupplierClaim> {
  return apiFetch<CommerceSupplierClaim>(`${claimPath(id)}/actions/close`, {
    method: "POST",
    body: JSON.stringify({ expectedVersion, reason }),
  });
}

export function recordCommerceSupplierClaimCommunication(
  id: string,
  input: {
    channel: CommerceSupplierClaimCommunicationChannel;
    direction: CommerceSupplierClaimCommunicationDirection;
    summary: string;
    occurredAt: string;
  },
): Promise<CommerceSupplierClaim["communications"][number]> {
  return apiFetch(`${claimPath(id)}/communications`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function recordCommerceSupplierClaimSettlement(
  id: string,
  input: {
    expectedVersion: number;
    settlementType: CommerceSupplierClaimSettlementType;
    amount: number;
    currency: string;
    financialReference?: string;
    note?: string;
  },
): Promise<CommerceSupplierClaim> {
  return apiFetch<CommerceSupplierClaim>(`${claimPath(id)}/settlements`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
