"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { CalendarClock, MessageSquareWarning, PackageSearch, Check } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonCard } from "@/components/shared/skeleton";
import { fetchTeamInbox, fetchStaffList, type TeamInboxTask } from "@/lib/staff-api";
import { useSession } from "@/lib/session";
import { formatDate, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/nav-items";

const KIND_ICON: Record<TeamInboxTask["type"], typeof CalendarClock> = {
  appointment: CalendarClock,
  complaint: MessageSquareWarning,
  restock: PackageSearch,
};

const KIND_LINK: Record<TeamInboxTask["type"], string> = {
  appointment: "/bookings",
  complaint: "/reviews",
  restock: "/inventory",
};

type InboxFilter = "mine" | "team";

export function TeamInbox({ role }: { role: Role }) {
  const { user } = useSession();
  const [filter, setFilter] = useState<InboxFilter>(role === "staff" ? "mine" : "team");

  const { data: tasks = [], isPending, isError, refetch } = useQuery({ queryKey: ["team-inbox"], queryFn: fetchTeamInbox });
  const { data: staff = [] } = useQuery({ queryKey: ["staff-list"], queryFn: fetchStaffList });
  const staffNameById = new Map(staff.map((s) => [s.id, s.name]));

  const visible = tasks.filter((t) => (filter === "mine" ? t.assigneeStaffId === user.businessUserId : true));

  if (isError) {
    return <ErrorBanner title="Couldn't load the inbox" description="Check your connection and try again." onRetry={() => refetch()} />;
  }

  return (
    <div>
      <div className="mb-4">
        <Tabs
          items={[
            { key: "mine", label: "My tasks" },
            { key: "team", label: "Team" },
          ]}
          value={filter}
          onChange={(k) => setFilter(k as InboxFilter)}
          className="w-56"
        />
      </div>

      {isPending ? (
        <div className="flex flex-col gap-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState icon={Check} title="Nothing here" description="You're all caught up." />
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((task) => {
            const Icon = KIND_ICON[task.type];
            const assigneeName = task.assigneeStaffId ? staffNameById.get(task.assigneeStaffId) : undefined;
            return (
              <Link
                key={task.id}
                href={KIND_LINK[task.type]}
                className={cn(
                  "flex items-center gap-3 rounded-[var(--radius-noxtill)] border border-border bg-surface p-3.5 transition-colors hover:bg-surface-2/50",
                )}
              >
                <Icon className="h-4 w-4 shrink-0 text-fg-faint" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{task.title}</p>
                  <p className="truncate text-xs text-fg-faint">{task.detail}</p>
                </div>
                <div className="shrink-0 text-end">
                  <p className="text-xs font-medium text-fg-muted">{assigneeName ?? "Unassigned"}</p>
                  {task.dueAt && (
                    <p className="text-xs text-fg-faint">
                      {formatDate(task.dueAt)} · {formatTime(task.dueAt)}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
