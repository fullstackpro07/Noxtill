"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, X, ListChecks } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownTrigger, DropdownContent, DropdownItem } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { formatRelativeTime } from "@/lib/format";
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

export function ActionCenter() {
  const [priority, setPriority] = useState<ActionItemPriority | "all">("all");
  const [type, setType] = useState<ActionItemType | "all">("all");
  const queryClient = useQueryClient();

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["action-center", priority, type],
    queryFn: () => fetchActions({ priority: priority === "all" ? undefined : priority, type: type === "all" ? undefined : type }),
  });

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
        </div>
      </CardHeader>

      <CardContent>
        {data && (
          <div className="mb-4 flex gap-4 text-sm text-fg-muted">
            <span>
              <span className="font-semibold tabular-nums text-destructive">{data.counts.urgent}</span> urgent
            </span>
            <span>
              <span className="font-semibold tabular-nums text-fg">{data.counts.open}</span> open
            </span>
            <span>
              <span className="font-semibold tabular-nums text-whatsapp">{data.counts.completedThisWeek}</span> completed this week
            </span>
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
    </Card>
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
