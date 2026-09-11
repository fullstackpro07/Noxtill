import { apiFetch } from "@/lib/api-client";

export type AiInsightCategory = "sales" | "stock" | "customers" | "marketing" | "credit";
export type AiInsightStatus = "new" | "actioned" | "dismissed";

export interface LiveAiInsight {
  id: string;
  category: AiInsightCategory;
  observation: string;
  sourceFigure: string;
  /** A real dollar figure already present in the underlying fact (revenue delta / overdue balance); null when no such figure naturally exists (stock/customers/marketing). */
  estimatedImpact: string | null;
  status: AiInsightStatus;
  createdAt: string;
  updatedAt: string;
}

export const AI_INSIGHT_CATEGORY_LABEL: Record<AiInsightCategory, string> = {
  sales: "Sales",
  stock: "Stock",
  customers: "Customers",
  marketing: "Marketing",
  credit: "Credit",
};

/** GET /ai/insights — filters are optional; omitted entirely means "every category/status." */
export function fetchAiInsights(filters?: { category?: AiInsightCategory; status?: AiInsightStatus }): Promise<LiveAiInsight[]> {
  const params = new URLSearchParams();
  if (filters?.category) params.set("category", filters.category);
  if (filters?.status) params.set("status", filters.status);
  const query = params.size ? `?${params.toString()}` : "";
  return apiFetch<LiveAiInsight[]>(`/ai/insights${query}`);
}

/** POST /ai/insights/:id/action — "actioned" (owner did something about it) or "dismissed" (not relevant); both are terminal, real states. */
export function setInsightStatus(id: string, status: "actioned" | "dismissed"): Promise<LiveAiInsight> {
  return apiFetch<LiveAiInsight>(`/ai/insights/${id}/action`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}
