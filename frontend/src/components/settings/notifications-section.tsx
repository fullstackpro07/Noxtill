"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SettingsSectionHeader } from "./settings-section-header";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import {
  fetchNotificationPreferences,
  fetchDefaultNotificationPreferences,
  updateNotificationPreferences,
  NOTIFICATION_EVENT_LABELS,
  type NotificationPreferenceRow,
  type NotificationEvent,
} from "@/lib/notification-preferences-api";
import { useSession } from "@/lib/session";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export function NotificationsSection() {
  const session = useSession();
  const canManage = session.user.role === "owner" || session.user.role === "manager";

  return (
    <div>
      <SettingsSectionHeader title="Notifications" description="Which alerts go to your in-app notification bell." />
      <div className="flex flex-col gap-6">
        <PreferenceList
          title="My notifications"
          description="Your own overrides — anything left as-is follows the business default below."
          queryKey={["notification-preferences", "self"]}
          queryFn={() => fetchNotificationPreferences()}
          mutationFn={(row) =>
            // Writing "self" always needs your own userId explicit — omitting it targets the
            // business-wide default instead, there's no self-shortcut on the write side (only
            // the read side defaults an omitted userId to you).
            updateNotificationPreferences(
              [{ event: row.event, channel: row.channel, enabled: !row.enabled }],
              session.user.id,
            )
          }
          showOverriddenBadge
        />
        {canManage && (
          <PreferenceList
            title="Business default"
            description="Applies to every staff member who hasn't set their own override."
            queryKey={["notification-preferences", "default"]}
            queryFn={fetchDefaultNotificationPreferences}
            mutationFn={(row) =>
              updateNotificationPreferences([{ event: row.event, channel: row.channel, enabled: !row.enabled }])
            }
          />
        )}
      </div>
    </div>
  );
}

function PreferenceList({
  title,
  description,
  queryKey,
  queryFn,
  mutationFn,
  showOverriddenBadge,
}: {
  title: string;
  description: string;
  queryKey: readonly unknown[];
  queryFn: () => Promise<NotificationPreferenceRow[]>;
  mutationFn: (row: NotificationPreferenceRow) => Promise<NotificationPreferenceRow[]>;
  showOverriddenBadge?: boolean;
}) {
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery({ queryKey, queryFn });

  const mutation = useMutation({
    mutationFn,
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKey, updated);
      toast.success("Notification preference updated.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this — please try again."),
  });

  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
      <p className="mb-1 text-sm font-medium text-fg">{title}</p>
      <p className="mb-3 text-sm text-fg-muted">{description}</p>
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
                {showOverriddenBadge && row.overridden && <p className="text-xs text-fg-faint">Custom — different from the business default</p>}
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
  );
}
