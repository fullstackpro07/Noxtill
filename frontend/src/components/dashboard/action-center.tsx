"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, X, ListChecks, CheckCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownTrigger, DropdownContent, DropdownItem } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { formatRelativeTime } from "@/lib/format";
import { useNow } from "@/hooks/use-now";
import {
  ACTION_ITEM_TYPE_LABEL,
  completeAction,
  dismissAction,
  fetchActions,
  snoozeAction,
  type ActionItemPriority,
  type ActionItemType,
  type LiveActionItem,
  type SnoozeDuration,
} from "@/lib/action-center-api";

const PRIORITY_LABEL: Record<ActionItemPriority, string> = { urgent: "Urgent", normal: "Normal", low: "Low" };
const PRIORITY_DOT: Record<ActionItemPriority, string> = {
  urgent: "bg-destructive",
  normal: "bg-accent",
  low: "bg-fg-faint",
};
const SNOOZE_LABEL: Record<SnoozeDuration, string> = { "1h": "1 hour", tomorrow: "Tomorrow", next_week: "Next week" };
const DAY_MS = 24 * 60 * 60 * 1000;

export function ActionCenter() {
  const [priority, setPriority] = useState<ActionItemPriority | "all">("all");
  const [type, setType] = useState<ActionItemType | "all">("all");
  const [confirmMarkAllRead, setConfirmMarkAllRead] = useState(false);
  const queryClient = useQueryClient();

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["action-center", priority, type],
    queryFn: () => fetchActions({ priority: priority === "all" ? undefined : priority, type: type === "all" ? undefined : type }),
  });

  const now = useNow();
  const todayCount = useMemo(() => {
    if (!data) return 0;
    return data.items.filter((item) => now - new Date(item.occurredAt).getTime() < DAY_MS).length;
  }, [data, now]);

  function onMutationError(err: unknown) {
    toast.error(err instanceof ApiError ? err.message : "Couldn't update this — please try again.");
  }
  function onMutationSuccess() {
    queryClient.invalidateQueries({ queryKey: ["action-center"] });
  }

  const completeMutation = useMutation({ mutationFn: completeAction, onSuccess: onMutationSuccess, onError: onMutationError });
  const dismissMutation = useMutation({ mutationFn: dismissAction, onSuccess: onMutationSuccess, onError: onMutationError });
  const snoozeMutation = useMutation({
    mutationFn: ({ id, duration }: { id: string; duration: SnoozeDuration }) => snoozeAction(id, duration),
    onSuccess: onMutationSuccess,
    onError: onMutationError,
  });
  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const items = data?.items ?? [];
      await Promise.all(items.map((item) => snoozeAction(item.id, "tomorrow")));
    },
    onSuccess: () => {
      onMutationSuccess();
      toast.success("Marked all read — they'll resurface tomorrow if still open.");
      setConfirmMarkAllRead(false);
    },
    onError: onMutationError,
  });

  const pending = completeMutation.isPending || dismissMutation.isPending || snoozeMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Action center</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={priority} onChange={(e) => setPriority(e.target.value as ActionItemPriority | "all")} className="w-32" aria-label="Filter by priority">
            <option value="all">All priorities</option>
            <option value="urgent">Urgent</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </Select>
          <Select value={type} onChange={(e) => setType(e.target.value as ActionItemType | "all")} className="w-40" aria-label="Filter by type">
            <option value="all">All types</option>
            {(Object.keys(ACTION_ITEM_TYPE_LABEL) as ActionItemType[]).map((t) => (
              <option key={t} value={t}>
                {ACTION_ITEM_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
          {data && data.items.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setConfirmMarkAllRead(true)}>
              <CheckCheck className="h-3.5 w-3.5" aria-hidden />
              Mark all read
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {data && (
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard label="Urgent" value={data.counts.urgent} tone="text-destructive" />
            <StatCard label="Today" value={todayCount} tone="text-fg" />
            <StatCard label="Open" value={data.counts.open} tone="text-fg" />
            <StatCard label="Completed this week" value={data.counts.completedThisWeek} tone="text-whatsapp" />
          </div>
        )}

        {isPending && (
          <div className="flex flex-col gap-1">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        )}

        {isError && <ErrorBanner title="Couldn't load the action center" onRetry={() => refetch()} />}

        {!isPending && !isError && data && data.items.length === 0 && (
          <EmptyState icon={ListChecks} title="Nothing needs your attention" description="Open complaints, low stock, overdue credit, and unreplied reviews will show up here." />
        )}

        {data && data.items.length > 0 && (
          <ul className="flex flex-col divide-y divide-border">
            {data.items.map((item) => (
              <ActionRow
                key={item.id}
                item={item}
                disabled={pending}
                onComplete={() => completeMutation.mutate(item.id)}
                onDismiss={() => dismissMutation.mutate(item.id)}
                onSnooze={(duration) => snoozeMutation.mutate({ id: item.id, duration })}
              />
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog
        open={confirmMarkAllRead}
        onClose={() => setConfirmMarkAllRead(false)}
        title="Mark all read?"
        description={`This snoozes all ${data?.items.length ?? 0} visible item(s) until tomorrow — anything still open will resurface then. Nothing is dismissed permanently.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmMarkAllRead(false)}>
              Cancel
            </Button>
            <Button onClick={() => markAllReadMutation.mutate()} disabled={markAllReadMutation.isPending}>
              {markAllReadMutation.isPending ? "Marking…" : "Mark all read"}
            </Button>
          </>
        }
      />
    </Card>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface-2/40 px-3.5 py-2.5">
      <p className={`font-display text-xl font-bold tabular-nums ${tone}`}>{value}</p>
      <p className="text-xs text-fg-muted">{label}</p>
    </div>
  );
}

function ActionRow({
  item,
  disabled,
  onComplete,
  onDismiss,
  onSnooze,
}: {
  item: LiveActionItem;
  disabled: boolean;
  onComplete: () => void;
  onDismiss: () => void;
  onSnooze: (duration: SnoozeDuration) => void;
}) {
  return (
    <li className="flex items-start gap-3 py-3">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[item.priority]}`} aria-label={PRIORITY_LABEL[item.priority]} />
      <div className="min-w-0 flex-1">
        <Link href={item.deepLink} className="text-sm font-medium text-fg hover:text-primary hover:underline">
          {item.title}
        </Link>
        <p className="truncate text-xs text-fg-muted">{item.reason}</p>
        <p className="text-xs text-fg-faint">{formatRelativeTime(item.ageMs)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onComplete} disabled={disabled} aria-label="Mark complete">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
        </Button>
        <DropdownMenu>
          <DropdownTrigger>
            <span className="flex h-8 w-8 items-center justify-center rounded-full text-fg-faint hover:bg-surface-2">
              <Clock className="h-4 w-4" aria-hidden />
            </span>
          </DropdownTrigger>
          <DropdownContent>
            {(Object.keys(SNOOZE_LABEL) as SnoozeDuration[]).map((duration) => (
              <DropdownItem key={duration} onSelect={() => onSnooze(duration)}>
                Snooze {SNOOZE_LABEL[duration]}
              </DropdownItem>
            ))}
          </DropdownContent>
        </DropdownMenu>
        <Button variant="ghost" size="sm" onClick={onDismiss} disabled={disabled} aria-label="Dismiss">
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </li>
  );
}
