/** Redis pub/sub channel a business's live activity events broadcast on. */
export function activityChannel(businessId: string): string {
  return `activity:${businessId}`;
}

/** How many past events an SSE client gets immediately on connect, before live-tailing. */
export const ACTIVITY_HISTORY_BACKFILL = 50;
