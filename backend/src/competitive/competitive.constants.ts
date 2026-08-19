export const VISIBILITY_SCORE_SNAPSHOT_QUEUE = 'visibility-score-snapshot';
export const COMPETITIVE_OPPORTUNITIES_QUEUE = 'competitive-opportunities';

/** UPD-BE-052: how many weekly snapshots the trend history returns by default. */
export const VISIBILITY_SCORE_WINDOW_WEEKS = 12;

/** UPD-BE-055 defaults — mirrored by the `CompetitiveSettings` Prisma model's own column defaults. */
export const DEFAULT_COMPETITIVE_SETTINGS = {
  scanFrequencyDays: 7,
  keywordRankAlertThreshold: 10,
  reviewFreshnessAlertDays: 14,
} as const;
