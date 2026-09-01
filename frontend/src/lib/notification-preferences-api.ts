import { apiFetch } from "@/lib/api-client";

export type NotificationEvent = "export_ready" | "scheduled_delivery_ready" | "schedule_updated";
export type NotificationChannel = "in_app";

export const NOTIFICATION_EVENT_LABELS: Record<NotificationEvent, string> = {
  export_ready: "Data export ready",
  scheduled_delivery_ready: "Scheduled report/export ready",
  schedule_updated: "Your shift schedule changed",
};

export interface NotificationPreferenceRow {
  event: NotificationEvent;
  channel: NotificationChannel;
  enabledByDefault: boolean;
  overridden: boolean;
  enabled: boolean;
}

/** GET /notification-preferences — omit userId for your own effective preferences. */
export function fetchNotificationPreferences(userId?: string): Promise<NotificationPreferenceRow[]> {
  const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  return apiFetch<NotificationPreferenceRow[]>(`/notification-preferences${query}`);
}

/** PATCH /notification-preferences — omit userId to write the business-wide default (needs manage capability). */
export function updateNotificationPreferences(
  preferences: { event: NotificationEvent; channel: NotificationChannel; enabled: boolean }[],
  userId?: string,
): Promise<NotificationPreferenceRow[]> {
  return apiFetch<NotificationPreferenceRow[]>("/notification-preferences", {
    method: "PATCH",
    body: JSON.stringify({ userId, preferences }),
  });
}
