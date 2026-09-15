import { apiFetch } from "@/lib/api-client";

export interface BusinessGoal {
  dailyRevenueTarget: number;
  dailyOrdersTarget: number | null;
  isSet: boolean;
}

export interface UpdateBusinessGoalInput {
  dailyRevenueTarget: number;
  dailyOrdersTarget?: number | null;
}

/** GET /dashboard/goals — Today's Goals fix-it: a real, persisted standing daily target. */
export function fetchBusinessGoal(): Promise<BusinessGoal> {
  return apiFetch<BusinessGoal>("/dashboard/goals");
}

/** PATCH /dashboard/goals */
export function updateBusinessGoal(input: UpdateBusinessGoalInput): Promise<BusinessGoal> {
  return apiFetch<BusinessGoal>("/dashboard/goals", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
