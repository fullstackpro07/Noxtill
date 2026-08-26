import { apiFetch } from "@/lib/api-client";

/** GET /capabilities — the fixed capability vocabulary, real keys from `CAPABILITIES` (e.g. "profit.view"). */
export function fetchCapabilities(): Promise<string[]> {
  return apiFetch<string[]>("/capabilities");
}

export interface CustomRole {
  id: string;
  name: string;
  capabilities: string[];
  createdAt: string;
}

export function fetchCustomRoles(): Promise<CustomRole[]> {
  return apiFetch<CustomRole[]>("/roles");
}

export interface CustomRoleDraft {
  name: string;
  capabilities: string[];
}

export function createCustomRole(draft: CustomRoleDraft): Promise<CustomRole> {
  return apiFetch<CustomRole>("/roles", { method: "POST", body: JSON.stringify(draft) });
}

export function updateCustomRole(id: string, draft: Partial<CustomRoleDraft>): Promise<CustomRole> {
  return apiFetch<CustomRole>(`/roles/${id}`, { method: "PATCH", body: JSON.stringify(draft) });
}

export function deleteCustomRole(id: string): Promise<void> {
  return apiFetch<void>(`/roles/${id}`, { method: "DELETE" });
}
