import { apiFetch } from "@/lib/api-client";

export interface AuditLogRow {
  id: string;
  businessId: string;
  actorUserId: string | null;
  actorName: string | null;
  action: string;
  entity: string;
  entityId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}

export interface AuditLogPage {
  total: number;
  page: number;
  pageSize: number;
  rows: AuditLogRow[];
}

export interface QueryAuditLogInput {
  entity?: string;
  actorUserId?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

/** GET /audit-log — the real, append-only audit trail (owner/manager only), filterable by entity/actor/action/date. */
export function fetchAuditLog(query: QueryAuditLogInput = {}): Promise<AuditLogPage> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return apiFetch<AuditLogPage>(`/audit-log${qs ? `?${qs}` : ""}`);
}
