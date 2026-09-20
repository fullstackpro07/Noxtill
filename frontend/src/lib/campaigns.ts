import { CUSTOMER_TAGS, type CustomerTag } from "@/lib/customers";

export type AudienceKey = "all" | CustomerTag;

export interface AudienceOption {
  key: AudienceKey;
  label: string;
}

/** Real live counts are fetched per-key via `fetchAudienceCount` (segments-api) — this list is
 * only the fixed key/label vocabulary, not a source of truth for counts. */
export const AUDIENCE_OPTIONS: AudienceOption[] = [
  { key: "all", label: "All customers" },
  ...CUSTOMER_TAGS.map((tag) => ({ key: tag, label: tag })),
];

export const VARIABLE_CHIPS = ["{{customerName}}", "{{businessName}}", "{{couponCode}}"];
