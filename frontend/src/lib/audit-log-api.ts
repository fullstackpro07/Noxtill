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

/** GET /audit-log */
export function fetchAuditLog(filters: { action?: string; entity?: string; page?: number; pageSize?: number } = {}): Promise<AuditLogPage> {
  const params = new URLSearchParams();
  if (filters.action) params.set("action", filters.action);
  if (filters.entity) params.set("entity", filters.entity);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
  const query = params.toString();
  return apiFetch<AuditLogPage>(`/audit-log${query ? `?${query}` : ""}`);
}
