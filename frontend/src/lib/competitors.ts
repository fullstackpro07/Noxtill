export interface Competitor {
  id: string;
  name: string;
  rating: number;
  reviewCount: number;
  /** 12-week rating trend, oldest first. */
  weeklyRatings: number[];
}

export const MAX_COMPETITORS = 5;

/** Mock rival set — real Google place lookup + weekly snapshot job is BE-063, live wiring is INT-010. */
export const COMPETITORS: Competitor[] = [
  { id: "cp1", name: "Bloom Hair Lounge", rating: 4.5, reviewCount: 212, weeklyRatings: [4.3, 4.3, 4.4, 4.4, 4.4, 4.5, 4.5, 4.4, 4.5, 4.5, 4.5, 4.5] },
  { id: "cp2", name: "The Clipper House", rating: 4.2, reviewCount: 158, weeklyRatings: [4.1, 4.1, 4.2, 4.2, 4.1, 4.2, 4.3, 4.2, 4.2, 4.2, 4.2, 4.2] },
  { id: "cp3", name: "Radiance Studio", rating: 4.7, reviewCount: 340, weeklyRatings: [4.6, 4.6, 4.6, 4.7, 4.7, 4.6, 4.7, 4.7, 4.8, 4.7, 4.7, 4.7] },
  { id: "cp4", name: "Urban Edge Barbers", rating: 4.0, reviewCount: 96, weeklyRatings: [3.9, 3.9, 4.0, 4.0, 3.9, 4.0, 4.0, 4.1, 4.0, 4.0, 4.0, 4.0] },
];

export const TRACKED_KEYWORDS = ["hair salon downtown", "best haircut near me", "balayage specialist"];
