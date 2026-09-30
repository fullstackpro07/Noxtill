import { apiFetch } from "@/lib/api-client";

export type CommerceRfqStatus =
  "draft" | "open" | "awarded" | "closed" | "cancelled";
export type CommerceRfqSupplierStatus =
  "pending_send" | "sent" | "responded" | "declined" | "withdrawn";
export type CommerceSupplierQuoteStatus =
  | "submitted"
  | "shortlisted"
  | "superseded"
  | "awarded"
  | "rejected"
  | "withdrawn";

export interface CommerceRfqItem {
  id: string;
  productId: string | null;
  description: string;
  qty: number;
  minimumQty: number | null;
  specifications: string | null;
  product: { id: string; name: string; sku: string | null } | null;
}

export interface CommerceRfqInvitation {
  id: string;
  supplierId: string;
  status: CommerceRfqSupplierStatus;
  invitedAt: string | null;
  respondedAt: string | null;
  supplier: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
  };
}

export interface CommerceSupplierQuoteItem {
  id: string;
  rfqItemId: string;
  quotedQty: number;
  minimumQty: number | null;
  unitPrice: number;
  rfqItem: Pick<CommerceRfqItem, "id" | "description" | "qty" | "productId">;
}

export interface CommerceSupplierQuote {
  id: string;
  supplierId: string;
  status: CommerceSupplierQuoteStatus;
  revisionNo: number;
  currency: string;
  validUntil: string | null;
  paymentTerms: string | null;
  freight: number;
  duties: number;
  leadTimeDays: number | null;
  notes: string | null;
  version: number;
  createdAt: string;
  landedTotal: number;
  supplier: { id: string; name: string };
  items: CommerceSupplierQuoteItem[];
}

export interface CommerceRfq {
  id: string;
  requirement: string;
  status: CommerceRfqStatus;
  market: string | null;
  currency: string;
  destination: string | null;
  terms: string | null;
  dueAt: string | null;
  ownerUserId: string | null;
  sourceOpportunityId: string | null;
  version: number;
  items: CommerceRfqItem[];
  suppliers: CommerceRfqInvitation[];
  quotes: CommerceSupplierQuote[];
  purchaseOrder: { id: string; status: string; createdAt: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommerceRfqAudit {
  id: string;
  action: string;
  reason: string | null;
  before: unknown;
  after: unknown;
  actorUserId: string | null;
  createdAt: string;
}

export interface CreateCommerceRfqInput {
  requirement: string;
  market?: string;
  currency: string;
  destination?: string;
  terms?: string;
  dueAt?: string | null;
  sourceOpportunityId?: string;
  items: Array<{
    description: string;
    qty: number;
    minimumQty?: number;
    specifications?: string;
  }>;
  supplierIds?: string[];
}

export interface RecordCommerceSupplierQuoteInput {
  invitationId: string;
  currency: string;
  validUntil?: string;
  paymentTerms?: string;
  freight: number;
  duties: number;
  leadTimeDays?: number;
  notes?: string;
  items: Array<{
    rfqItemId: string;
    quotedQty: number;
    minimumQty?: number;
    unitPrice: number;
  }>;
}

export function fetchCommerceRfqs(
  filters: { status?: CommerceRfqStatus; search?: string } = {},
): Promise<CommerceRfq[]> {
  const query = new URLSearchParams();
  if (filters.status) query.set("status", filters.status);
  if (filters.search?.trim()) query.set("search", filters.search.trim());
  return apiFetch<CommerceRfq[]>(
    `/commerce/rfqs${query.size ? `?${query}` : ""}`,
  );
}

export function fetchCommerceRfq(id: string): Promise<CommerceRfq> {
  return apiFetch<CommerceRfq>(`/commerce/rfqs/${id}`);
}

export function fetchCommerceRfqAudit(id: string): Promise<CommerceRfqAudit[]> {
  return apiFetch<CommerceRfqAudit[]>(`/commerce/rfqs/${id}/audit`);
}

export function createCommerceRfq(
  input: CreateCommerceRfqInput,
): Promise<CommerceRfq> {
  return apiFetch<CommerceRfq>("/commerce/rfqs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateCommerceRfq(
  id: string,
  input: CreateCommerceRfqInput & { expectedVersion: number },
): Promise<CommerceRfq> {
  return apiFetch<CommerceRfq>(`/commerce/rfqs/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function openCommerceRfq(
  id: string,
  expectedVersion: number,
): Promise<CommerceRfq> {
  return apiFetch<CommerceRfq>(`/commerce/rfqs/${id}/actions/open`, {
    method: "POST",
    body: JSON.stringify({ expectedVersion }),
  });
}

export function confirmManualSupplierSend(
  id: string,
  expectedVersion: number,
  supplierIds: string[],
): Promise<CommerceRfq> {
  return apiFetch<CommerceRfq>(
    `/commerce/rfqs/${id}/actions/confirm-manual-supplier-send`,
    { method: "POST", body: JSON.stringify({ expectedVersion, supplierIds }) },
  );
}

export function recordCommerceSupplierQuote(
  id: string,
  input: RecordCommerceSupplierQuoteInput & {
    expectedVersion: number;
  },
): Promise<CommerceRfq> {
  return apiFetch<CommerceRfq>(`/commerce/rfqs/${id}/quotes`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateCommerceQuoteStatus(
  id: string,
  quoteId: string,
  action: "shortlist" | "reject",
  expectedVersion: number,
): Promise<CommerceRfq> {
  return apiFetch<CommerceRfq>(
    `/commerce/rfqs/${id}/quotes/${quoteId}/${action}`,
    { method: "POST", body: JSON.stringify({ expectedVersion }) },
  );
}

export function awardCommerceQuote(
  id: string,
  input: { quoteId: string; expectedVersion: number; reason: string },
): Promise<CommerceRfq> {
  return apiFetch<CommerceRfq>(`/commerce/rfqs/${id}/actions/award`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function closeCommerceRfq(
  id: string,
  expectedVersion: number,
  reason: string,
): Promise<CommerceRfq> {
  return apiFetch<CommerceRfq>(`/commerce/rfqs/${id}/actions/close`, {
    method: "POST",
    body: JSON.stringify({ expectedVersion, reason }),
  });
}

export function cancelCommerceRfq(
  id: string,
  expectedVersion: number,
  reason: string,
): Promise<CommerceRfq> {
  return apiFetch<CommerceRfq>(`/commerce/rfqs/${id}/actions/cancel`, {
    method: "POST",
    body: JSON.stringify({ expectedVersion, reason }),
  });
}
