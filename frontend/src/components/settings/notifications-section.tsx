"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SettingsSectionHeader } from "./settings-section-header";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import {
  fetchNotificationPreferences,
  updateNotificationPreferences,
  NOTIFICATION_EVENT_LABELS,
  type NotificationPreferenceRow,
  type NotificationEvent,
} from "@/lib/notification-preferences-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

/**
 * Only "my own preferences" is built here — the backend's `GET /notification-preferences`
 * always resolves to a specific user's effective view (self by default), with no deliberate,
 * documented way to fetch the pure business-wide default independent of any user overlay. A
 * business-default editing screen is left for a future ticket rather than built against that
 * undocumented edge case.
 */
export function NotificationsSection() {
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => fetchNotificationPreferences(),
  });

  const mutation = useMutation({
    mutationFn: (row: NotificationPreferenceRow) =>
      updateNotificationPreferences([{ event: row.event, channel: row.channel, enabled: !row.enabled }]),
    onSuccess: (updated) => {
      queryClient.setQueryData(["notification-preferences"], updated);
      toast.success("Notification preference updated.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this — please try again."),
  });

  return (
    <div>
      <SettingsSectionHeader title="Notifications" description="Which alerts you receive in your in-app notification bell." />
      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        {isError ? (
          <ErrorBanner title="Couldn't load notification preferences" onRetry={() => refetch()} />
        ) : isPending || !data ? (
          <div className="flex flex-col gap-1">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.map((row) => (
              <li key={`${row.event}-${row.channel}`} className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-border bg-surface-2/40 px-3.5 py-2.5">
                <div>
                  <p className="text-sm text-fg">{NOTIFICATION_EVENT_LABELS[row.event as NotificationEvent]}</p>
                  {row.overridden && <p className="text-xs text-fg-faint">Custom — different from the business default</p>}
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={row.enabled}
                  onClick={() => mutation.mutate(row)}
                  disabled={mutation.isPending}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${row.enabled ? "bg-whatsapp" : "bg-surface-2"}`}
                >
                  <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${row.enabled ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-fg-faint">Delivered in-app only today — WhatsApp/email delivery isn&apos;t wired up yet.</p>
      </div>
    </div>
  );
}
