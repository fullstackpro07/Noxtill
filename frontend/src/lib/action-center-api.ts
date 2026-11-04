import { apiFetch } from "@/lib/api-client";
import type { CustomerFollowUpOutcome } from "@/lib/customer-intelligence-api";

export type ActionItemType = "complaint" | "low_stock" | "overdue_credit" | "unreplied_review" | "commerce" | "procurement_request" | "customer_segment" | "customer_follow_up" | "inventory_transfer_approval" | "finance_journal" | "seo_content_brief";
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
  dueAt: string | null;
  deepLink: string;
  /** Set only when the canonical source record has a real team assignment. */
  assigneeStaffId: string | null;
  /** Decision items must go through their owning module's canonical approval service. */
  approvalAction?: "commerce_rfq_award" | "commerce_supplier_claim" | "inventory_branch_transfer" | "finance_journal" | "seo_content_brief";
  /** False when this viewer submitted the request and cannot approve their own request. */
  canDecide?: boolean;
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
  commerce: "Commerce",
  procurement_request: "Purchase approval",
  customer_segment: "Segment approval",
  customer_follow_up: "Customer follow-up",
  inventory_transfer_approval: "Branch transfer approval",
  finance_journal: "Finance journal approval",
  seo_content_brief: "SEO Agent content approval",
};

/** GET /actions — staff see only complaints assigned to them (server-enforced); owners/managers see everything. */
export function fetchActions(filters?: { priority?: ActionItemPriority; type?: ActionItemType }): Promise<LiveActionCenter> {
  const params = new URLSearchParams();
  if (filters?.priority) params.set("priority", filters.priority);
  if (filters?.type) params.set("type", filters.type);
  const query = params.size ? `?${params.toString()}` : "";
  return apiFetch<LiveActionCenter>(`/actions${query}`);
}

export function completeAction(id: string, outcome?: CustomerFollowUpOutcome): Promise<unknown> {
  const prefix = "customer_follow_up:";
  if (id.startsWith(prefix)) {
    const taskId = id.slice(prefix.length);
    return apiFetch(`/customers/follow-up-tasks/${encodeURIComponent(taskId)}/complete`, {
      method: "POST",
      body: outcome ? JSON.stringify({ outcome }) : undefined,
    });
  }
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

export function approveProcurementAction(id: string): Promise<unknown> {
  return apiFetch(`/actions/${encodeURIComponent(id)}/approve`, { method: "POST" });
}

export function rejectProcurementAction(id: string, reason: string): Promise<unknown> {
  return apiFetch(`/actions/${encodeURIComponent(id)}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function approveInventoryTransferAction(id: string): Promise<unknown> {
  return apiFetch(`/actions/${encodeURIComponent(id)}/approve-inventory-transfer`, { method: "POST" });
}

export function rejectInventoryTransferAction(id: string, reason: string): Promise<unknown> {
  return apiFetch(`/actions/${encodeURIComponent(id)}/reject-inventory-transfer`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function decideFinanceJournalAction(id: string, decision: "approve" | "reject", reason: string): Promise<unknown> {
  const action = decision === "approve" ? "approve-finance-journal" : "reject-finance-journal";
  return apiFetch(`/actions/${encodeURIComponent(id)}/${action}`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function decideSeoContentBriefAction(id: string, decision: "approve" | "send_back", reason: string): Promise<unknown> {
  const action = decision === "approve" ? "approve-seo-content" : "send-back-seo-content";
  return apiFetch(`/actions/${encodeURIComponent(id)}/${action}`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
