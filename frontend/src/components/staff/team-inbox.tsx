"use client";

import { useState } from "react";
import { CalendarClock, MessageSquareWarning, PackageSearch, Check } from "lucide-react";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { TEAM_TASKS, type TaskKind } from "@/lib/team-tasks";
import { CURRENT_STAFF_ID, staffById } from "@/lib/staff";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/nav-items";

const KIND_ICON: Record<TaskKind, typeof CalendarClock> = {
  appointment: CalendarClock,
  complaint: MessageSquareWarning,
  restock: PackageSearch,
};

type InboxFilter = "mine" | "team";

export function TeamInbox({ role }: { role: Role }) {
  const [filter, setFilter] = useState<InboxFilter>(role === "staff" ? "mine" : "team");
  const [tasks, setTasks] = useState(TEAM_TASKS);

  const visible = tasks.filter((t) => (filter === "mine" ? t.assigneeStaffId === CURRENT_STAFF_ID : true));

  function toggleDone(id: string) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
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

      {visible.length === 0 ? (
        <EmptyState icon={Check} title="Nothing here" description="You're all caught up." />
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((task) => {
            const Icon = KIND_ICON[task.kind];
            const assignee = staffById(task.assigneeStaffId);
            return (
              <div
                key={task.id}
                className={cn(
                  "flex items-center gap-3 rounded-[var(--radius-noxtill)] border border-border bg-surface p-3.5",
                  task.done && "opacity-50",
                )}
              >
                <button
                  onClick={() => toggleDone(task.id)}
                  aria-label={task.done ? "Mark not done" : "Mark done"}
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                    task.done ? "border-whatsapp bg-whatsapp text-white" : "border-border-strong",
                  )}
                >
                  {task.done && <Check className="h-3.5 w-3.5" aria-hidden />}
                </button>
                <Icon className="h-4 w-4 shrink-0 text-fg-faint" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-sm font-medium text-fg", task.done && "line-through")}>{task.title}</p>
                  <p className="truncate text-xs text-fg-faint">{task.detail}</p>
                </div>
                <div className="shrink-0 text-end">
                  <p className="text-xs font-medium text-fg-muted">{assignee?.name}</p>
                  <p className="text-xs text-fg-faint">{task.due}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
