import { apiFetch } from "@/lib/api-client";

export type DsrKind = "export" | "erasure";
export type DsrStatus = "pending" | "in_progress" | "fulfilled" | "rejected";

export interface DsrRequest {
  id: string;
  businessId: string;
  customerId: string;
  customer: { id: string; name: string; phone: string };
  kind: DsrKind;
  status: DsrStatus;
  requestedByUserId: string | null;
  fulfilledAt: string | null;
  resultUrl: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  daysRemaining: number;
  urgent: boolean;
}

/** GET /gdpr/requests */
export function fetchDsrRequests(status?: DsrStatus): Promise<DsrRequest[]> {
  const query = status ? `?status=${status}` : "";
  return apiFetch<DsrRequest[]>(`/gdpr/requests${query}`);
}

/** POST /gdpr/requests */
export function createDsrRequest(dto: { customerId: string; kind: DsrKind; note?: string }): Promise<DsrRequest> {
  return apiFetch<DsrRequest>("/gdpr/requests", {
    method: "POST",
    body: JSON.stringify(dto),
  });
}

/** PATCH /gdpr/requests/:id/in-progress */
export function markDsrInProgress(id: string): Promise<DsrRequest> {
  return apiFetch<DsrRequest>(`/gdpr/requests/${id}/in-progress`, { method: "PATCH" });
}

/** POST /gdpr/requests/:id/fulfill */
export function fulfillDsrRequest(id: string, confirmPhone?: string): Promise<DsrRequest> {
  return apiFetch<DsrRequest>(`/gdpr/requests/${id}/fulfill`, {
    method: "POST",
    body: JSON.stringify({ confirmPhone }),
  });
}

/** POST /gdpr/requests/:id/reject */
export function rejectDsrRequest(id: string, note?: string): Promise<DsrRequest> {
  return apiFetch<DsrRequest>(`/gdpr/requests/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}
