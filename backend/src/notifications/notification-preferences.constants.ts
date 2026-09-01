/**
 * Notifications, preference matrix (UPD-BE-122) — the real catalog of internal alerts this app
 * actually fires today (confirmed by grepping every `NotificationsService.create()` call site
 * before writing this: `account-zip.processor.ts`, `scheduled-exports.service.ts`,
 * `staff/shifts.service.ts`). Adding a new internal alert elsewhere means adding its key here and
 * threading it through that call site's `create()` call — never invent an event nothing fires.
 */
export const NOTIFICATION_EVENTS = [
  'export_ready',
  'scheduled_delivery_ready',
  'schedule_updated',
] as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export const NOTIFICATION_EVENT_LABELS: Record<NotificationEvent, string> = {
  export_ready: 'Data export ready',
  scheduled_delivery_ready: 'Scheduled report/export ready',
  schedule_updated: 'Your shift schedule changed',
};

export function isNotificationEvent(value: string): value is NotificationEvent {
  return (NOTIFICATION_EVENTS as readonly string[]).includes(value);
}

/**
 * Only the in-app inbox is a real delivery transport for internal alerts today — `SendGateService`
 * is built for customer-facing template messages (approved WhatsApp templates, etc.), not ad-hoc
 * staff-facing alerts, so WhatsApp/email delivery of these events isn't wired in this ticket. The
 * channel dimension is still modeled for real (so the matrix genuinely has more than one column
 * and future channels are additive), just only `in_app` is functionally enforced right now.
 */
export const NOTIFICATION_CHANNELS = ['in_app'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export function isNotificationChannel(
  value: string,
): value is NotificationChannel {
  return (NOTIFICATION_CHANNELS as readonly string[]).includes(value);
}
