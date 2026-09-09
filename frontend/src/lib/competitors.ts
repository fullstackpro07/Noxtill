export interface Competitor {
  id: string;
  name: string;
  rating: number;
  reviewCount: number;
  /** 12-week rating trend, oldest first. */
  weeklyRatings: number[];
}

export const MAX_COMPETITORS = 5;
