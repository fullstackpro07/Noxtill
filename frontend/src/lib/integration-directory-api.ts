import { apiFetch } from "@/lib/api-client";

export type IntegrationCategory = "ads" | "directories" | "social" | "accounting" | "ecommerce" | "automation" | "other";

export interface IntegrationDirectoryRow {
  provider: string;
  category: IntegrationCategory;
  status: string;
  updatedAt: string | null;
}

/** GET /integrations/directory (UPD-BE-075) — one real listing across every connector category this app actually has a connector or subscription mechanism for. */
export function fetchIntegrationDirectory(): Promise<IntegrationDirectoryRow[]> {
  return apiFetch<IntegrationDirectoryRow[]>("/integrations/directory");
}
