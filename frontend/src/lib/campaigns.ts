import { CUSTOMERS, CUSTOMER_TAGS, type CustomerTag } from "@/lib/customers";

export type AudienceKey = "all" | CustomerTag;

export interface AudienceOption {
  key: AudienceKey;
  label: string;
  count: number;
}

/** "All customers" represents the full base — larger than our 8 detailed mock records, same as a real business would have. */
export const AUDIENCE_OPTIONS: AudienceOption[] = [
  { key: "all", label: "All customers", count: 412 },
  ...CUSTOMER_TAGS.map((tag) => ({ key: tag, label: tag, count: CUSTOMERS.filter((c) => c.tags.includes(tag)).length })),
];

export const VARIABLE_CHIPS = ["{{customerName}}", "{{businessName}}", "{{couponCode}}"];

export interface Campaign {
  id: string;
  name: string;
  audience: string;
  recipientCount: number;
  sentCount: number;
  deliveredCount: number;
  repliedCount: number;
  createdAt: string;
}

/** Mock funnel report — real campaign send/report is BE-061, live wiring is INT-010. */
export const CAMPAIGNS: Campaign[] = [
  { id: "cm1", name: "Weekend color special", audience: "VIP", recipientCount: 3, sentCount: 3, deliveredCount: 3, repliedCount: 1, createdAt: "2026-07-20" },
  { id: "cm2", name: "We miss you — 15% off", audience: "Lapsed", recipientCount: 2, sentCount: 2, deliveredCount: 2, repliedCount: 0, createdAt: "2026-07-10" },
  { id: "cm3", name: "New client welcome", audience: "New", recipientCount: 1, sentCount: 1, deliveredCount: 1, repliedCount: 1, createdAt: "2026-06-28" },
];
