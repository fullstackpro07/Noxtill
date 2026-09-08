import { apiFetch } from "@/lib/api-client";

export interface MasterListing {
  id: string | null;
  businessId: string;
  name: string;
  phone: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  categories: string[];
  description: string | null;
  hours: Record<string, [string, string][]>;
  logoUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export type UpdateMasterListing = Partial<
  Omit<MasterListing, "id" | "businessId" | "createdAt" | "updatedAt" | "name">
> & {
  /** Required on every PATCH by the backend DTO, even when only touching another field. */
  name: string;
};

/** GET /listings/master — never 404s, always a real shape to render. */
export function fetchMasterListing(): Promise<MasterListing> {
  return apiFetch<MasterListing>("/listings/master");
}

/** PATCH /listings/master */
export function updateMasterListing(dto: UpdateMasterListing): Promise<MasterListing> {
  return apiFetch<MasterListing>("/listings/master", {
    method: "PATCH",
    body: JSON.stringify(dto),
  });
}

export interface SyncResult {
  provider: string;
  status: "success" | "failed";
  message?: string;
}

/** POST /listings/sync */
export function syncListings(): Promise<SyncResult[]> {
  return apiFetch<SyncResult[]>("/listings/sync", { method: "POST" });
}

export interface ListingSyncLogRow {
  id: string;
  businessId: string;
  provider: string;
  status: string;
  message: string | null;
  createdAt: string;
}

/** GET /listings/sync-log */
export function fetchSyncLog(): Promise<ListingSyncLogRow[]> {
  return apiFetch<ListingSyncLogRow[]>("/listings/sync-log");
}

export interface ListingHealth {
  score: number;
  totalProviders: number;
  connectedProviders: string[];
  hasRecentSync: boolean;
  mismatchCount: number;
}

/** GET /listings/health */
export function fetchListingHealth(): Promise<ListingHealth> {
  return apiFetch<ListingHealth>("/listings/health");
}

export interface CitationAuditRow {
  provider: string;
  syncedAt: string;
  matches: boolean;
  mismatchedFields: string[];
}

/** GET /seo/citations */
export function fetchCitationAudit(): Promise<CitationAuditRow[]> {
  return apiFetch<CitationAuditRow[]>("/seo/citations");
}
