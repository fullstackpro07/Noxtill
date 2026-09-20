import { apiFetch } from "@/lib/api-client";

export type MarketingTaskKind = "automation_failing" | "offer_expiring" | "quota_low";

export interface MarketingTask {
  kind: MarketingTaskKind;
  key: string;
  title: string;
  why: string;
  priority: "Urgent" | "High" | "Normal";
  source: string;
  entityId: string;
  /** Real deadline (an offer's expiry) — null for ongoing issues with no real due date. */
  dueDate: string | null;
}

/** Every task is derived live from a real record — there's nothing to "mark complete" beyond
 * acting on the real thing it points at (it disappears on its own once that's resolved). */
export function fetchMarketingTasks(): Promise<MarketingTask[]> {
  return apiFetch<MarketingTask[]>("/marketing/tasks");
}
