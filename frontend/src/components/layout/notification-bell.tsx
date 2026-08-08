"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { DropdownMenu, DropdownTrigger, DropdownContent } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { fetchNotifications, markNotificationRead, type LiveNotification } from "@/lib/notifications-api";

const POLL_INTERVAL_MS = 30_000;

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function NotificationBell() {
  const queryClient = useQueryClient();
  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: fetchNotifications,
    refetchInterval: POLL_INTERVAL_MS,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  function handleClick(n: LiveNotification) {
    if (!n.read) markReadMutation.mutate(n.id);
    if (n.link) window.open(n.link, "_blank", "noopener,noreferrer");
  }

  return (
    <DropdownMenu>
      <DropdownTrigger>
        <span className="relative flex h-9 w-9 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2">
          <Bell className="h-[18px] w-[18px]" aria-hidden />
          {unreadCount > 0 && (
            <span className="absolute end-1.5 top-1.5 flex h-2 w-2 rounded-full bg-destructive ring-2 ring-surface" />
          )}
          <span className="sr-only">
            {unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
          </span>
        </span>
      </DropdownTrigger>
      <DropdownContent className="w-80 p-0" align="end">
        <div className="border-b border-border px-4 py-3">
          <p className="font-display text-sm font-semibold text-fg">Notifications</p>
        </div>
        {notifications.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-fg-faint">You&apos;re all caught up.</p>
        ) : (
          <ul className="max-h-80 overflow-y-auto py-1">
            {notifications.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => handleClick(n)}
                  className={cn(
                    "flex w-full gap-2.5 px-4 py-2.5 text-start text-sm hover:bg-surface-2",
                    !n.read && "bg-primary/[0.04]",
                  )}
                >
                  <span
                    className={cn(
                      "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                      n.read ? "bg-transparent" : "bg-accent",
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-fg">{n.title}</p>
                    <p className="truncate text-xs text-fg-muted">{n.body}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-fg-faint">{timeAgo(n.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DropdownContent>
    </DropdownMenu>
  );
}
