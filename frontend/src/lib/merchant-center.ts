export type FeedStatus = "synced" | "syncing" | "error";

export interface FeedIssue {
  id: string;
  productId: string;
  issue: string;
  severity: "warning" | "error";
}

/** productId values match real PRODUCTS entries so the Fix button opens the actual product drawer. */
export const FEED_ISSUES: FeedIssue[] = [
  { id: "fi1", productId: "p7", issue: "Missing GTIN/barcode", severity: "warning" },
  { id: "fi2", productId: "p10", issue: "Price mismatch with last sync", severity: "error" },
];

export const FEED_STATUS: FeedStatus = "synced";
export const FEED_ITEM_COUNT = 9;
export const LAST_SYNCED_AT = "2026-07-29T02:00:00.000Z";
