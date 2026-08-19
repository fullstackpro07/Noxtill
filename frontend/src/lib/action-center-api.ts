import { apiFetch } from "@/lib/api-client";

export type ActionItemType = "complaint" | "low_stock" | "overdue_credit" | "unreplied_review";
export type ActionItemPriority = "urgent" | "normal" | "low";
export type SnoozeDuration = "1h" | "tomorrow" | "next_week";

export interface LiveActionItem {
  /** Composite `type:entityId` — stable across calls until acted on, but not a real DB id. */
  id: string;
  type: ActionItemType;
  priority: ActionItemPriority;
  title: string;
  reason: string;
  ageMs: number;
  occurredAt: string;
  deepLink: string;
}

export interface LiveActionCenter {
  items: LiveActionItem[];
  counts: { urgent: number; open: number; completedThisWeek: number };
}

export const ACTION_ITEM_TYPE_LABEL: Record<ActionItemType, string> = {
  complaint: "Complaint",
  low_stock: "Low stock",
  overdue_credit: "Overdue credit",
  unreplied_review: "Unreplied review",
};

/** GET /actions — staff see only complaints assigned to them (server-enforced); owners/managers see everything. */
export function fetchActions(filters?: { priority?: ActionItemPriority; type?: ActionItemType }): Promise<LiveActionCenter> {
  const params = new URLSearchParams();
  if (filters?.priority) params.set("priority", filters.priority);
  if (filters?.type) params.set("type", filters.type);
  const query = params.size ? `?${params.toString()}` : "";
  return apiFetch<LiveActionCenter>(`/actions${query}`);
}

export function completeAction(id: string): Promise<unknown> {
  return apiFetch(`/actions/${encodeURIComponent(id)}/complete`, { method: "POST" });
}

export function dismissAction(id: string): Promise<unknown> {
  return apiFetch(`/actions/${encodeURIComponent(id)}/dismiss`, { method: "POST" });
}

export function snoozeAction(id: string, duration: SnoozeDuration): Promise<unknown> {
  return apiFetch(`/actions/${encodeURIComponent(id)}/snooze`, {
    method: "POST",
    body: JSON.stringify({ duration }),
  });
}
