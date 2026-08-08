import { apiFetch } from "@/lib/api-client";
import type { Competitor } from "@/lib/competitors";

interface RawCompetitor {
  id: string;
  platformRef: string;
  lastRating: string | null;
  lastReviewsCount: number | null;
}

/** Real Competitor has no separate "name" field — platformRef IS the identifying label the owner typed when adding it. */
function toCompetitor(raw: RawCompetitor, weeklyRatings: number[]): Competitor {
  return {
    id: raw.id,
    name: raw.platformRef,
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

export function addCompetitor(platformRef: string): Promise<RawCompetitor> {
  return apiFetch<RawCompetitor>("/competitors", {
    method: "POST",
    body: JSON.stringify({ platformRef }),
  });
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
