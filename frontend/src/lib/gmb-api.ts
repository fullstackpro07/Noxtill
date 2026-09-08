import { apiFetch } from "@/lib/api-client";

export interface GmbAccount {
  name: string;
  accountName?: string;
}

export interface GmbLocation {
  name: string;
  title?: string;
  storefrontAddress?: { addressLines?: string[]; locality?: string };
}

/** GET listings/gmb/accounts — real Google accounts the connected identity manages. */
export function fetchGmbAccounts(): Promise<{ accounts?: GmbAccount[] }> {
  return apiFetch("/listings/gmb/accounts");
}

/** GET listings/gmb/locations?accountName= */
export function fetchGmbLocations(accountName: string): Promise<{ locations?: GmbLocation[] }> {
  return apiFetch(`/listings/gmb/locations?accountName=${encodeURIComponent(accountName)}`);
}

/** POST listings/gmb/location — persists the chosen location for every locationId-gated action. */
export function selectGmbLocation(locationId: string): Promise<{ locationId: string }> {
  return apiFetch("/listings/gmb/location", {
    method: "POST",
    body: JSON.stringify({ locationId }),
  });
}

/** GET listings/gmb/location — real current selection; `locationId: null` before one is ever chosen. */
export function fetchSelectedGmbLocation(): Promise<{ locationId: string | null }> {
  return apiFetch("/listings/gmb/location");
}

export type GmbPostStatus = "draft" | "published" | "failed";

export interface GmbPost {
  id: string;
  text: string;
  photoUrl: string | null;
  buttonType: string | null;
  scheduledFor: string | null;
  externalId: string | null;
  status: GmbPostStatus;
  createdAt: string;
}

export function fetchGmbPosts(): Promise<GmbPost[]> {
  return apiFetch<GmbPost[]>("/listings/gmb/posts");
}

export function createGmbPost(dto: { text: string; photoUrl?: string; buttonType?: string; scheduledFor?: string }): Promise<GmbPost> {
  return apiFetch<GmbPost>("/listings/gmb/posts", { method: "POST", body: JSON.stringify(dto) });
}

export function publishGmbPost(id: string): Promise<GmbPost> {
  return apiFetch<GmbPost>(`/listings/gmb/posts/${id}/publish`, { method: "POST" });
}

export function deleteGmbPost(id: string): Promise<void> {
  return apiFetch<void>(`/listings/gmb/posts/${id}`, { method: "DELETE" });
}

export interface GmbPhoto {
  id: string;
  url: string;
  category: string | null;
  createdAt: string;
}

export function fetchGmbPhotos(): Promise<GmbPhoto[]> {
  return apiFetch<GmbPhoto[]>("/listings/gmb/photos");
}

export function addGmbPhoto(dto: { url: string; category?: string }): Promise<GmbPhoto> {
  return apiFetch<GmbPhoto>("/listings/gmb/photos", { method: "POST", body: JSON.stringify(dto) });
}

export function removeGmbPhoto(id: string): Promise<void> {
  return apiFetch<void>(`/listings/gmb/photos/${id}`, { method: "DELETE" });
}

export interface GmbQna {
  id: string;
  question: string;
  answer: string | null;
  externalId: string | null;
  answeredAt: string | null;
}

export function fetchGmbQna(): Promise<GmbQna[]> {
  return apiFetch<GmbQna[]>("/listings/gmb/qna");
}

/** POST listings/gmb/qna/sync — pulls real questions from Google; returns how many were seen. */
export function syncGmbQna(): Promise<number> {
  return apiFetch<number>("/listings/gmb/qna/sync", { method: "POST" });
}

export function answerGmbQna(id: string, answer: string): Promise<GmbQna> {
  return apiFetch<GmbQna>(`/listings/gmb/qna/${id}/answer`, {
    method: "PATCH",
    body: JSON.stringify({ answer }),
  });
}

export interface GmbInsightsSnapshot {
  id: string;
  date: string;
  views: number;
  searches: number;
  calls: number;
  directionRequests: number;
}

export function fetchGmbInsights(): Promise<GmbInsightsSnapshot[]> {
  return apiFetch<GmbInsightsSnapshot[]>("/listings/gmb/insights");
}

export function pullGmbInsights(): Promise<GmbInsightsSnapshot> {
  return apiFetch<GmbInsightsSnapshot>("/listings/gmb/insights/pull", { method: "POST" });
}
