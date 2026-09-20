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

// --- System role overrides (UPD-BE-STAFF-01) — real per-business overrides of the Manager/Staff
// capability sets. Owner is never a row here — it always keeps every capability. ---

export type OverridableRole = "manager" | "staff";

export interface SystemRoleCapabilities {
  role: OverridableRole;
  capabilities: string[];
  /** false means this row reflects the hardcoded default, not a saved override. */
  isOverridden: boolean;
}

export function fetchSystemRoles(): Promise<SystemRoleCapabilities[]> {
  return apiFetch<SystemRoleCapabilities[]>("/roles/system");
}

export function updateSystemRoleCapabilities(role: OverridableRole, capabilities: string[]): Promise<SystemRoleCapabilities> {
  return apiFetch<SystemRoleCapabilities>(`/roles/system/${role}`, {
    method: "PATCH",
    body: JSON.stringify({ capabilities }),
  });
}

export function resetSystemRoleCapabilities(role: OverridableRole): Promise<SystemRoleCapabilities> {
  return apiFetch<SystemRoleCapabilities>(`/roles/system/${role}`, { method: "DELETE" });
}
