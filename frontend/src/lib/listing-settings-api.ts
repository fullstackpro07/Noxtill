import { apiFetch } from "@/lib/api-client";

export type ConflictResolution = "master_wins" | "directory_wins";

export interface ListingSettings {
  id: string | null;
  businessId: string;
  autoSyncEnabled: boolean;
  autoSyncFrequencyHours: number;
  fieldMapping: Record<string, string[]>;
  conflictResolution: ConflictResolution;
  lastAutoSyncAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface UpdateListingSettings {
  autoSyncEnabled?: boolean;
  autoSyncFrequencyHours?: number;
  fieldMapping?: Record<string, string[]>;
  conflictResolution?: ConflictResolution;
}

/** GET /listings/settings — never 404s. */
export function fetchListingSettings(): Promise<ListingSettings> {
  return apiFetch<ListingSettings>("/listings/settings");
}

/** PATCH /listings/settings */
export function updateListingSettings(dto: UpdateListingSettings): Promise<ListingSettings> {
  return apiFetch<ListingSettings>("/listings/settings", {
    method: "PATCH",
    body: JSON.stringify(dto),
  });
}
