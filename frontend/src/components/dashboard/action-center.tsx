"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, X, ListChecks, CheckCheck, Check } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownTrigger, DropdownContent, DropdownItem } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
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
const PRIORITY_STYLE: Record<ActionItemPriority, { bg: string; fg: string }> = {
  urgent: { bg: "#FDEAEA", fg: "var(--app-danger-strong)" },
  normal: { bg: "var(--app-warning-bg)", fg: "var(--app-warning-text)" },
  low: { bg: "var(--app-surface-2)", fg: "var(--app-text-faint)" },
};
const SNOOZE_LABEL: Record<SnoozeDuration, string> = { "1h": "1 hour", tomorrow: "Tomorrow", next_week: "Next week" };
const DAY_MS = 24 * 60 * 60 * 1000;

const selectStyle: React.CSSProperties = {
  border: "1px solid var(--app-border)",
  borderRadius: 9,
  padding: "7px 10px",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--app-text-muted)",
  background: "var(--app-surface)",
};

export function ActionCenter() {
  const [priority, setPriority] = useState<ActionItemPriority | "all">("all");
  const [type, setType] = useState<ActionItemType | "all">("all");
  const [confirmMarkAllRead, setConfirmMarkAllRead] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
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
  const bulkCompleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((id) => completeAction(id)));
    },
    onSuccess: () => {
      onMutationSuccess();
      toast.success("Selected items marked complete.");
      setSelected([]);
    },
    onError: onMutationError,
  });

  const pending = completeMutation.isPending || dismissMutation.isPending || snoozeMutation.isPending;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-[19px] font-extrabold tracking-tight" style={{ color: "var(--app-text)" }}>Action Center</h2>
          {data && (
            <span className="rounded-full px-2.5 py-1 text-[11.5px] font-bold" style={{ background: "#FEE4E2", color: "var(--app-danger-strong)" }}>
              {data.counts.open} open
            </span>
          )}
        </div>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <select value={priority} onChange={(e) => setPriority(e.target.value as ActionItemPriority | "all")} style={selectStyle} aria-label="Filter by priority">
            <option value="all">All priorities</option>
            <option value="urgent">Urgent</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
          <select value={type} onChange={(e) => setType(e.target.value as ActionItemType | "all")} style={selectStyle} aria-label="Filter by type">
            <option value="all">All types</option>
            {(Object.keys(ACTION_ITEM_TYPE_LABEL) as ActionItemType[]).map((t) => (
              <option key={t} value={t}>{ACTION_ITEM_TYPE_LABEL[t]}</option>
            ))}
          </select>
          {data && data.items.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmMarkAllRead(true)}
              className="flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[12.5px] font-semibold"
              style={{ background: "var(--app-sidebar-bg)", color: "#fff" }}
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden />
              Mark all read
            </button>
          )}
        </div>
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
          <StatCard label="Urgent" value={data.counts.urgent} tone="var(--app-danger-strong)" border="#FDD9D6" />
          <StatCard label="Today" value={todayCount} tone="var(--app-text)" />
          <StatCard label="This week" value={data.counts.open} tone="var(--app-text)" />
          <StatCard label="Completed this week" value={data.counts.completedThisWeek} tone="var(--app-primary)" />
        </div>
      )}

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-[12px] px-3.5 py-2.5" style={{ background: "var(--app-sidebar-bg)" }}>
          <span className="text-[12.5px] font-bold text-white">{selected.length} selected</span>
          <button type="button" onClick={() => setSelected([])} className="text-[12px] font-semibold" style={{ color: "#8FF0BB" }}>
            Clear selection
          </button>
          <button
            type="button"
            onClick={() => bulkCompleteMutation.mutate(selected)}
            disabled={bulkCompleteMutation.isPending}
            className="ms-auto rounded-[9px] px-3.5 py-1.5 text-[12px] font-bold text-white disabled:opacity-60"
            style={{ background: "var(--app-primary)" }}
          >
            Mark complete
          </button>
        </div>
      )}

      {isPending && (
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-[14px]" style={{ background: "var(--app-surface-2)" }} />)}
        </div>
      )}

      {isError && (
        <div className="rounded-[14px] p-4" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <ErrorBanner title="Couldn't load the action center" onRetry={() => refetch()} />
        </div>
      )}

      {!isPending && !isError && data && data.items.length === 0 && (
        <div className="rounded-[14px] p-4" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <EmptyState icon={ListChecks} title="Nothing needs your attention" description="Open complaints, low stock, overdue credit, and unreplied reviews will show up here." />
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {data.items.map((item) => (
            <ActionRow
              key={item.id}
              item={item}
              disabled={pending}
              selected={selected.includes(item.id)}
              onToggleSelect={() => setSelected((s) => (s.includes(item.id) ? s.filter((id) => id !== item.id) : [...s, item.id]))}
              onComplete={() => completeMutation.mutate(item.id)}
              onDismiss={() => dismissMutation.mutate(item.id)}
              onSnooze={(duration) => snoozeMutation.mutate({ id: item.id, duration })}
            />
          ))}
        </div>
      )}

      <Dialog
        open={confirmMarkAllRead}
        onClose={() => setConfirmMarkAllRead(false)}
        title="Mark all read?"
        description={`This snoozes all ${data?.items.length ?? 0} visible item(s) until tomorrow — anything still open will resurface then. Nothing is dismissed permanently.`}
        footer={
          <>
            <button type="button" onClick={() => setConfirmMarkAllRead(false)} className="rounded-[9px] px-3.5 py-2 text-[12.5px] font-semibold" style={{ color: "var(--app-text-faint)" }}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              className="rounded-[9px] px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-60"
              style={{ background: "var(--app-primary)" }}
            >
              {markAllReadMutation.isPending ? "Marking…" : "Mark all read"}
            </button>
          </>
        }
      />
    </div>
  );
}

function StatCard({ label, value, tone, border }: { label: string; value: number; tone: string; border?: string }) {
  return (
    <div className="rounded-[14px] px-3.5 py-2.5" style={{ background: "var(--app-surface)", border: `1px solid ${border ?? "var(--app-border)"}` }}>
      <p className="text-[20px] font-extrabold tabular-nums" style={{ color: tone }}>{value}</p>
      <p className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>{label}</p>
    </div>
  );
}

function ActionRow({
  item,
  disabled,
  selected,
  onToggleSelect,
  onComplete,
  onDismiss,
  onSnooze,
}: {
  item: LiveActionItem;
  disabled: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onComplete: () => void;
  onDismiss: () => void;
  onSnooze: (duration: SnoozeDuration) => void;
}) {
  const tone = PRIORITY_STYLE[item.priority];
  return (
    <div
      className="flex flex-wrap items-center gap-3.5 rounded-[14px] p-[14px_16px]"
      style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        aria-label="Select item"
        className="h-4 w-4 shrink-0"
        style={{ accentColor: "var(--app-primary)" }}
      />
      <span className="shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-extrabold" style={{ background: tone.bg, color: tone.fg }}>
        {PRIORITY_LABEL[item.priority]}
      </span>
      <div className="min-w-[200px] flex-1">
        <Link href={item.deepLink} className="text-[13px] font-bold hover:underline" style={{ color: "var(--app-text)" }}>
          {item.title}
        </Link>
        <p className="truncate text-[12px]" style={{ color: "var(--app-text-faint)" }}>{ACTION_ITEM_TYPE_LABEL[item.type]} · {item.reason}</p>
      </div>
      <span className="shrink-0 text-[11.5px] font-semibold" style={{ color: "var(--app-text-disabled)" }}>Age {formatRelativeTime(item.ageMs)}</span>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button
          onClick={onDismiss}
          disabled={disabled}
          className="rounded-[9px] px-3 py-1.5 text-[12px] font-semibold disabled:opacity-60"
          style={{ border: "1px solid var(--app-border)", color: "var(--app-text-faint)" }}
        >
          Dismiss
        </button>
        <DropdownMenu>
          <DropdownTrigger>
            <span
              className="flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-[12px] font-semibold"
              style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}
            >
              <Clock className="h-3.5 w-3.5" aria-hidden />
              Snooze
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
        <Link
          href={item.deepLink}
          className="flex items-center gap-1.5 rounded-[9px] px-3.5 py-1.5 text-[12px] font-bold text-white"
          style={{ background: "var(--app-primary)" }}
        >
          <Check className="h-3.5 w-3.5" aria-hidden />
          Take action
        </Link>
      </div>
    </div>
  );
}
