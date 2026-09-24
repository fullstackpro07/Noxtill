import { apiFetch } from "@/lib/api-client";
import type { Competitor } from "@/lib/competitors";

export interface RawCompetitor {
  id: string;
  name: string;
  platformRef: string;
  lastRating: string | null;
  lastReviewsCount: number | null;
  metaPageId: string | null;
  priority: CompetitorPriority;
  /** Public Instagram username (no `@`), used to read their posting via Instagram Business Discovery. */
  instagramHandle: string | null;
  createdAt: string;
}

export type CompetitorPriority = "watch_closely" | "keep_an_eye" | "background";

/** Raw shape (id/platformRef/metaPageId included) — for screens that need more than the card-friendly `Competitor` shape. */
export function fetchCompetitorsRaw(): Promise<RawCompetitor[]> {
  return apiFetch<RawCompetitor[]>("/competitors");
}

function toCompetitor(raw: RawCompetitor, weeklyRatings: number[]): Competitor {
  return {
    id: raw.id,
    name: raw.name,
    rating: raw.lastRating != null ? Number(raw.lastRating) : 0,
    reviewCount: raw.lastReviewsCount ?? 0,
    weeklyRatings,
  };
}

export async function fetchCompetitors(): Promise<Competitor[]> {
  const raw = await apiFetch<RawCompetitor[]>("/competitors");
  const withHistory = await Promise.all(
    raw.map(async (c) => {
      const history = await fetchCompetitorHistory(c.id);
      // Pad with the current rating so a brand-new competitor (no history yet) still renders a flat sparkline instead of an empty one.
      const weeklyRatings =
        history.length > 0 ? history.map((h) => h.rating) : Array(12).fill(c.lastRating != null ? Number(c.lastRating) : 0);
      return toCompetitor(c, weeklyRatings);
    }),
  );
  return withHistory;
}

/** Free-text add (no Places search) — name and platformRef are the same typed value, same as before this field split. */
export function addCompetitor(name: string): Promise<RawCompetitor> {
  return apiFetch<RawCompetitor>("/competitors", {
    method: "POST",
    body: JSON.stringify({ name, platformRef: name }),
  });
}

/** Same free-text add, with an explicit watch priority (kept separate so `addCompetitor` stays safe to pass straight to `mutationFn`). */
export function addCompetitorByName(name: string, priority: CompetitorPriority): Promise<RawCompetitor> {
  return apiFetch<RawCompetitor>("/competitors", {
    method: "POST",
    body: JSON.stringify({ name, platformRef: name, priority }),
  });
}

export interface PlaceSearchResult {
  placeId: string;
  name: string;
  address: string | null;
  rating: number | null;
  userRatingsTotal: number | null;
}

/** Competitor add-flow fix (UPD-BE-128) — real Google Places search; returns [] if no API key is configured server-side. */
export function searchCompetitorPlaces(query: string): Promise<PlaceSearchResult[]> {
  return apiFetch<PlaceSearchResult[]>(`/competitors/search?query=${encodeURIComponent(query)}`);
}

/** Add via a selected search result — platformRef is the real Google Place ID. */
export function addCompetitorFromPlace(place: PlaceSearchResult, priority?: CompetitorPriority): Promise<RawCompetitor> {
  return apiFetch<RawCompetitor>("/competitors", {
    method: "POST",
    body: JSON.stringify({ name: place.name, platformRef: place.placeId, priority }),
  });
}

export function updateCompetitor(
  id: string,
  input: { name?: string; metaPageId?: string; priority?: CompetitorPriority; instagramHandle?: string },
): Promise<RawCompetitor> {
  return apiFetch<RawCompetitor>(`/competitors/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function removeCompetitor(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/competitors/${id}`, { method: "DELETE" });
}

export interface CompetitorHistoryPoint {
  rating: number;
  reviewsCount: number;
  capturedAt: string;
}

export function fetchCompetitorHistory(id: string): Promise<CompetitorHistoryPoint[]> {
  return apiFetch<CompetitorHistoryPoint[]>(`/competitors/${id}/history`);
}

/** "Refresh now" — real Google Places lookup; needs GOOGLE_PLACES_API_KEY configured server-side to return real data. */
export function triggerCompetitorSnapshot(id: string): Promise<RawCompetitor> {
  return apiFetch<RawCompetitor>(`/competitors/${id}/snapshot`, { method: "POST" });
}

export interface CompetitorCategoryAverage {
  trackedCount: number;
  ratedCount: number;
  averageRating: number | null;
}

/** UPD-FE-089: no external category-benchmark dataset exists — this is honestly derived from your own tracked competitor set. */
export function fetchCompetitorCategoryAverage(): Promise<CompetitorCategoryAverage> {
  return apiFetch<CompetitorCategoryAverage>("/competitors/category-average");
}

export interface CompetitorAd {
  adArchiveId: string;
  pageName: string;
  body: string | null;
  snapshotUrl: string | null;
  startedAt: string | null;
  endedAt: string | null;
}

/** Empty (not an error) until the competitor has a metaPageId set and META_AD_LIBRARY_ACCESS_TOKEN is configured server-side. */
export function fetchCompetitorAds(id: string): Promise<CompetitorAd[]> {
  return apiFetch<CompetitorAd[]>(`/competitors/${id}/ads`);
}

export interface CompetitorReview {
  authorName: string;
  rating: number;
  text: string;
  relativeTime: string;
}

/** How many of the same seven public checks a Google listing fills in — the same checklist your own listing is scored on. */
export interface PublicListingCompleteness {
  percent: number;
  checks: { key: string; label: string; present: boolean }[];
}

export interface CompetitorDetails {
  hours: string[] | null;
  reviews: CompetitorReview[];
  photos: string[];
  /** Public listing details from Google — null when there is no Google listing to read. */
  profile: { website: string | null; phone: string | null; address: string | null; categories: string[] } | null;
  completeness: PublicListingCompleteness | null;
}

/**
 * Real hours/reviews/photos via Google Places — degrades to `{hours: null, reviews: [], photos: []}`
 * (not an error) when the competitor was added free-text (no real Place ID to look up) or no
 * GOOGLE_PLACES_API_KEY is configured. Deliberately has no "recent posts": Google's public Places
 * API never exposes a business's own promotional posts — only the profile owner's own OAuth-gated
 * Business Profile API can, and we have no path to a competitor's consent for that.
 */
export function fetchCompetitorDetails(id: string): Promise<CompetitorDetails> {
  return apiFetch<CompetitorDetails>(`/competitors/${id}/details`);
}
