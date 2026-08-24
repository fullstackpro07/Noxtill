/** How long a minted `/r/:token` link stays live before it silently 404s (BE-046). Shared by
 * `PublicReviewService` (enforces it) and `ReviewsService` (uses it to derive "no response"). */
export const REVIEW_TOKEN_EXPIRY_DAYS = 30;

/** Trailing window for `/reviews/qr-stats` and channel-conversion aggregates. */
export const REVIEW_CONVERSION_WINDOW_DAYS = 30;

/** UPD-BE-103: default equal weighting, each component maxing out at 25 of the 0-100 total —
 * mirrors `DEFAULT_HEALTH_SCORE_WEIGHTS`'s convention, kept fixed (no weight-editing UI for this one). */
export const REPUTATION_SCORE_WEIGHTS = {
  rating: 25,
  volume: 25,
  recency: 25,
  responseRate: 25,
} as const;

/** A business tracking this many-or-more reviews scores full marks on the "volume" component. */
export const REPUTATION_VOLUME_TARGET = 50;

/** Days since the most recent review at which the "recency" component bottoms out at 0. */
export const REPUTATION_RECENCY_HORIZON_DAYS = 90;

/** How many trailing weeks the reputation-score trend chart covers — same width as the health score's. */
export const REPUTATION_TREND_WEEKS = 8;
