"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ShoppingCart,
  Calendar,
  Star,
  Wallet,
  AlertTriangle,
  Package,
  PackageX,
  UserMinus,
  AlertOctagon,
  Cake,
  Pause,
  Play,
  ArrowDown,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { PermissionLockCard } from "@/components/shared/permission-lock-card";
import { useSession } from "@/lib/session";
import { useActivityStream } from "@/hooks/use-activity-stream";
import { useNow } from "@/hooks/use-now";
import { fetchStaffList } from "@/lib/staff-api";
import { formatCurrency, formatRelativeTime, formatDate, formatTime } from "@/lib/format";
import { ACTIVITY_EVENT_TYPE_LABEL, fetchOpenTablesCount, type ActivityEventType, type LiveActivityEvent } from "@/lib/activity-api";

export const TYPE_ICON: Record<ActivityEventType, LucideIcon> = {
  sale: ShoppingCart,
  booking: Calendar,
  review: Star,
  payment: Wallet,
  complaint: AlertTriangle,
  stock: Package,
  low_stock: PackageX,
  customer_lapsed: UserMinus,
  credit_overdue: AlertOctagon,
  birthday: Cake,
};

export const TYPE_TINT: Record<ActivityEventType, string> = {
  sale: "bg-whatsapp/12 text-whatsapp",
  booking: "bg-primary/10 text-primary",
  review: "bg-accent/20 text-accent-foreground",
  payment: "bg-whatsapp/12 text-whatsapp",
  complaint: "bg-destructive/12 text-destructive",
  stock: "bg-surface-2 text-fg-muted",
  low_stock: "bg-destructive/12 text-destructive",
  customer_lapsed: "bg-surface-2 text-fg-muted",
  credit_overdue: "bg-destructive/12 text-destructive",
  birthday: "bg-accent/20 text-accent-foreground",
};

const HOUR_MS = 60 * 60 * 1000;

export function LiveActivityFeed() {
  const session = useSession();
  const { events, status } = useActivityStream();
  const [typeFilter, setTypeFilter] = useState<ActivityEventType | "all">("all");
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [paused, setPaused] = useState(false);
  const [pausedAt, setPausedAt] = useState<string | null>(null);
  const [detailEvent, setDetailEvent] = useState<LiveActivityEvent | null>(null);
  const now = useNow();

  const { data: staff } = useQuery({ queryKey: ["staff-roster"], queryFn: () => fetchStaffList(), staleTime: 5 * 60 * 1000 });
  const { data: openTables } = useQuery({ queryKey: ["open-tables-count"], queryFn: fetchOpenTablesCount, refetchInterval: 30_000 });
  const staffNameByUserId = useMemo(() => new Map((staff ?? []).map((s) => [s.userId, s.name])), [staff]);

  // While paused, the visible list freezes at the event id captured at pause time — new events still
  // arrive into `events` (the stream never stops), just aren't shown until "Jump to now".
  const pausedIndex = paused && pausedAt ? events.findIndex((e) => e.id === pausedAt) : -1;
  const visibleEvents = paused && pausedIndex >= 0 ? events.slice(pausedIndex) : events;
  const pendingCount = paused && pausedIndex > 0 ? pausedIndex : 0;

  const filtered = visibleEvents.filter((event) => {
    if (typeFilter !== "all" && event.type !== typeFilter) return false;
    if (staffFilter !== "all" && event.actorUserId !== staffFilter) return false;
    return true;
  });

  const eventsLastHour = events.filter((e) => now - new Date(e.createdAt).getTime() < HOUR_MS).length;
  const activeStaffLastHour = new Set(
    events
      .filter((e) => now - new Date(e.createdAt).getTime() < HOUR_MS && e.actorUserId)
      .map((e) => e.actorUserId),
  ).size;

  function togglePause() {
    if (paused) {
      setPaused(false);
      setPausedAt(null);
    } else {
      setPausedAt(events[0]?.id ?? null);
      setPaused(true);
    }
  }

  if (session.user.role === "staff") {
    return (
      <div className="rounded-[14px] p-5" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <PermissionLockCard description="Live activity is limited to owners and managers." />
      </div>
    );
  }

  const selectStyle: React.CSSProperties = {
    border: "1px solid var(--app-border)",
    borderRadius: 9,
    padding: "7px 10px",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--app-text-muted)",
    background: "var(--app-surface)",
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-[19px] font-extrabold tracking-tight" style={{ color: "var(--app-text)" }}>Live Activity</h2>
          <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--app-text-faintest)" }}>Real-time event stream from every module.</p>
        </div>
        <ConnectionPill status={status} />
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={togglePause}
            className="flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[12.5px] font-semibold"
            style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)", background: "var(--app-surface)" }}
          >
            {paused ? <Play className="h-3.5 w-3.5" aria-hidden /> : <Pause className="h-3.5 w-3.5" aria-hidden />}
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            onClick={() => {
              setPaused(false);
              setPausedAt(null);
            }}
            className="rounded-[10px] px-4 py-2 text-[12.5px] font-bold text-white"
            style={{ background: "var(--app-primary)" }}
          >
            Jump to now
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3.5">
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <p className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Events last hour</p>
          <p className="mt-1.5 text-[23px] font-extrabold tabular-nums" style={{ color: "var(--app-text)" }}>{eventsLastHour}</p>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <p className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Active staff</p>
          <p className="mt-1.5 text-[23px] font-extrabold tabular-nums" style={{ color: "var(--app-text)" }}>{activeStaffLastHour}</p>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <p className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Open tables</p>
          <p className="mt-1.5 text-[23px] font-extrabold tabular-nums" style={{ color: "var(--app-text)" }}>{openTables?.count ?? "—"}</p>
        </div>
      </div>

      <div className="rounded-[14px] overflow-hidden" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap items-center gap-2.5 p-[14px_18px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="text-[15px] font-bold" style={{ color: "var(--app-text)" }}>Event stream</h3>
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as ActivityEventType | "all")} style={selectStyle} aria-label="Filter by event type">
              <option value="all">All types</option>
              {(Object.keys(ACTIVITY_EVENT_TYPE_LABEL) as ActivityEventType[]).map((type) => (
                <option key={type} value={type}>{ACTIVITY_EVENT_TYPE_LABEL[type]}</option>
              ))}
            </select>
            {staff && staff.length > 0 && (
              <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} style={selectStyle} aria-label="Filter by staff">
                <option value="all">All staff</option>
                {staff.map((s) => (
                  <option key={s.userId} value={s.userId}>{s.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>
        {paused && pendingCount > 0 && (
          <button
            onClick={togglePause}
            className="flex w-full items-center justify-center gap-1.5 py-2 text-[12px] font-semibold"
            style={{ borderBottom: "1px solid var(--app-border)", background: "var(--app-success-bg)", color: "var(--app-primary)" }}
          >
            <ArrowDown className="h-3.5 w-3.5" aria-hidden />
            {pendingCount} new event{pendingCount === 1 ? "" : "s"} — Jump to now
          </button>
        )}

        {filtered.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title={events.length === 0 ? "No activity yet" : "No activity matches these filters"}
            description={events.length === 0 ? "Real sales, bookings, reviews and more will stream in here as they happen." : undefined}
          />
        ) : (
          <ul className="max-h-[520px] overflow-y-auto">
            {filtered.map((event) => (
              <ActivityRow
                key={event.id}
                event={event}
                currency={session.business.currency}
                actorName={event.actorUserId ? staffNameByUserId.get(event.actorUserId) : undefined}
                now={now}
                onOpenDetail={() => setDetailEvent(event)}
              />
            ))}
          </ul>
        )}
      </div>

      <EventDetailDialog
        event={detailEvent}
        currency={session.business.currency}
        actorName={detailEvent?.actorUserId ? staffNameByUserId.get(detailEvent.actorUserId) : undefined}
        onClose={() => setDetailEvent(null)}
      />
    </div>
  );
}

function ConnectionPill({ status }: { status: "connecting" | "open" | "closed" }) {
  const label = status === "open" ? "Live" : status === "connecting" ? "Connecting…" : "Reconnecting…";
  const color = status === "open" ? "var(--app-primary)" : "var(--app-warning-text)";
  return (
    <span
      className="flex items-center gap-2 rounded-full px-[13px] py-[7px] text-[11.5px] font-bold"
      style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color }}
    >
      <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: color }} aria-hidden />
      {label}
    </span>
  );
}

function ActivityRow({
  event,
  currency,
  actorName,
  now,
  onOpenDetail,
}: {
  event: LiveActivityEvent;
  currency: string;
  actorName?: string;
  now: number;
  onOpenDetail: () => void;
}) {
  const Icon = TYPE_ICON[event.type];
  return (
    <li style={{ borderTop: "1px solid var(--app-surface-2)" }} className="first:border-t-0">
      <button onClick={onOpenDetail} className="flex w-full items-center gap-3 px-[18px] py-3 text-start">
        <span className="w-[68px] shrink-0 text-[11.5px] font-bold" style={{ color: "var(--app-text-disabled)" }}>
          {formatRelativeTime(now - new Date(event.createdAt).getTime())}
        </span>
        <span className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] ${TYPE_TINT[event.type]}`}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold ${TYPE_TINT[event.type]}`}>
          {ACTIVITY_EVENT_TYPE_LABEL[event.type]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{event.description}</p>
          {actorName && <p className="truncate text-[11.5px]" style={{ color: "var(--app-text-faintest)" }}>{actorName}</p>}
        </div>
        {event.amount != null && <span className="shrink-0 text-[12px] font-bold tabular-nums" style={{ color: "var(--app-text)" }}>{formatCurrency(event.amount, currency)}</span>}
        <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--app-text-disabled)" }} aria-hidden />
      </button>
    </li>
  );
}

function EventDetailDialog({
  event,
  currency,
  actorName,
  onClose,
}: {
  event: LiveActivityEvent | null;
  currency: string;
  actorName?: string;
  onClose: () => void;
}) {
  if (!event) return null;
  const Icon = TYPE_ICON[event.type];
  return (
    <Dialog open={!!event} onClose={onClose} title="Event detail">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${TYPE_TINT[event.type]}`}>
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-medium text-fg">{ACTIVITY_EVENT_TYPE_LABEL[event.type]}</p>
            <p className="text-xs text-fg-faint">
              {formatDate(event.createdAt)} · {formatTime(event.createdAt)}
            </p>
          </div>
        </div>
        <p className="text-sm text-fg">{event.description}</p>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          {event.amount != null && (
            <>
              <dt className="text-fg-faint">Amount</dt>
              <dd className="text-fg">{formatCurrency(event.amount, currency)}</dd>
            </>
          )}
          {actorName && (
            <>
              <dt className="text-fg-faint">Staff</dt>
              <dd className="text-fg">{actorName}</dd>
            </>
          )}
          {event.entityType && (
            <>
              <dt className="text-fg-faint">Related record</dt>
              <dd className="text-fg">{event.entityType}</dd>
            </>
          )}
        </dl>
      </div>
    </Dialog>
  );
}
