export const SENTIMENT_ANALYSIS_QUEUE = 'sentiment-analysis';

/** Real reviews looked at per run — recent enough to reflect current sentiment, bounded for cost. */
export const SENTIMENT_REVIEW_LOOKBACK = 150;

/** Below this many reviews-with-text, there's not enough real signal to cluster themes honestly. */
export const SENTIMENT_MIN_REVIEWS = 3;

export const SENTIMENT_MAX_THEMES = 5;

export type ReviewSentimentLabel = 'positive' | 'negative' | 'mixed';
