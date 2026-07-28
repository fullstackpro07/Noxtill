export interface PublicRatingBusiness {
  name: string;
  /** null = "private mode" — the business hasn't set a public review destination, so even high ratings get a thank-you instead of a redirect. */
  publicReviewUrl: string | null;
}

/**
 * Mock public-token lookup for the customer-facing rating page (GET /r/:token, BE-046).
 * Deterministic on the token so both branches (public URL set vs. private mode) are reachable by trying different tokens.
 */
export function getBusinessByToken(token: string): PublicRatingBusiness | null {
  if (!token) return null;
  const hash = Array.from(token).reduce((sum, c) => sum + c.charCodeAt(0), 0);
  const publicMode = hash % 2 === 0;
  return {
    name: "Sunset Hair Studio",
    publicReviewUrl: publicMode ? "https://g.page/r/sunset-hair-studio/review" : null,
  };
}
