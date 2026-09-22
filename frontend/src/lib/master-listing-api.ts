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

/** POST /listings/sync — optionally targets a specific branch (a real cross-branch write, via the same X-Branch override the branch switcher uses), rather than always acting on whichever branch is globally active. */
export function syncListings(branchId?: string): Promise<SyncResult[]> {
  return apiFetch<SyncResult[]>("/listings/sync", { method: "POST" }, { branchId });
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

export interface ListingRollupItem {
  branchId: string;
  branchName: string;
  businessName: string | null;
  phone: string | null;
  address: string | null;
  category: string | null;
  provider: string;
  providerLabel: string;
  hasMasterListing: boolean;
  status: "Connected" | "Needs attention" | "Disconnected" | "Not connected";
  verification: "Not tracked";
  lastSyncedAt: string | null;
  lastSyncStatus: "success" | "failed" | null;
  lastSyncMessage: string | null;
  completenessPercent: number | null;
  photoCount: number;
  mismatchedFields: string[];
  nextAction: string;
  nextWhy: string;
}

export interface ListingsRollupSummary {
  totalListings: number;
  totalBranches: number;
  totalProviders: number;
  connected: number;
  needsAttention: number;
  disconnected: number;
  notConnected: number;
  mismatchCount: number;
  averageCompleteness: number | null;
  branchesWithoutMasterListing: number;
}

/** GET /listings/rollup — one real row per branch x connected directory provider, across the whole branch group. */
export function fetchListingsRollup(): Promise<ListingRollupItem[]> {
  return apiFetch<ListingRollupItem[]>("/listings/rollup");
}

/** GET /listings/rollup/summary — real aggregate counts derived from the same rollup. */
export function fetchListingsRollupSummary(): Promise<ListingsRollupSummary> {
  return apiFetch<ListingsRollupSummary>("/listings/rollup/summary");
}
