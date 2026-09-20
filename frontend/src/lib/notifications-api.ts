import { apiFetch } from "@/lib/api-client";

export interface LiveNotification {
  id: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  /** Fixed by the kind of alert: low, normal or high. */
  priority: "low" | "normal" | "high";
  createdAt: string;
}

/** GET /notifications (INT-012) — last 50, newest first, scoped to the calling user. */
export function fetchNotifications(): Promise<LiveNotification[]> {
  return apiFetch<LiveNotification[]>("/notifications");
}

export function markNotificationRead(id: string): Promise<LiveNotification> {
  return apiFetch<LiveNotification>(`/notifications/${id}/read`, { method: "PATCH" });
}
