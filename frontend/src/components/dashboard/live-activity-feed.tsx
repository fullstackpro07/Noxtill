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
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { PermissionLockCard } from "@/components/shared/permission-lock-card";
import { useSession } from "@/lib/session";
import { useActivityStream } from "@/hooks/use-activity-stream";
import { useNow } from "@/hooks/use-now";
import { fetchStaffList } from "@/lib/staff-api";
import { formatCurrency, formatRelativeTime, formatDate, formatTime } from "@/lib/format";
import { ACTIVITY_EVENT_TYPE_LABEL, type ActivityEventType, type LiveActivityEvent } from "@/lib/activity-api";

const TYPE_ICON: Record<ActivityEventType, LucideIcon> = {
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

const TYPE_TINT: Record<ActivityEventType, string> = {
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

  const { data: staff } = useQuery({ queryKey: ["staff-roster"], queryFn: fetchStaffList, staleTime: 5 * 60 * 1000 });
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
      <Card>
        <CardContent>
          <PermissionLockCard description="Live activity is limited to owners and managers." />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Live activity</CardTitle>
          <ConnectionDot status={status} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as ActivityEventType | "all")}
            className="w-40"
            aria-label="Filter by event type"
          >
            <option value="all">All types</option>
            {(Object.keys(ACTIVITY_EVENT_TYPE_LABEL) as ActivityEventType[]).map((type) => (
              <option key={type} value={type}>
                {ACTIVITY_EVENT_TYPE_LABEL[type]}
              </option>
            ))}
          </Select>
          {staff && staff.length > 0 && (
            <Select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} className="w-36" aria-label="Filter by staff">
              <option value="all">All staff</option>
              {staff.map((s) => (
                <option key={s.userId} value={s.userId}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={togglePause}>
            {paused ? <Play className="h-3.5 w-3.5" aria-hidden /> : <Pause className="h-3.5 w-3.5" aria-hidden />}
            {paused ? "Resume" : "Pause"}
          </Button>
        </div>
      </CardHeader>

      <div className="flex gap-4 border-b border-border px-5 pb-4 text-sm text-fg-muted">
        <span>
          <span className="font-semibold tabular-nums text-fg">{eventsLastHour}</span> events last hour
        </span>
        <span>
          <span className="font-semibold tabular-nums text-fg">{activeStaffLastHour}</span> active staff
        </span>
      </div>

      {paused && pendingCount > 0 && (
        <button
          onClick={togglePause}
          className="flex w-full items-center justify-center gap-1.5 border-b border-border bg-primary/6 py-2 text-xs font-medium text-primary hover:bg-primary/10"
        >
          <ArrowDown className="h-3.5 w-3.5" aria-hidden />
          {pendingCount} new event{pendingCount === 1 ? "" : "s"} — Jump to now
        </button>
      )}

      <CardContent className="p-0">
        {filtered.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title={events.length === 0 ? "No activity yet" : "No activity matches these filters"}
            description={events.length === 0 ? "Real sales, bookings, reviews and more will stream in here as they happen." : undefined}
          />
        ) : (
          <ul className="max-h-105 divide-y divide-border overflow-y-auto">
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
      </CardContent>

      <EventDetailDialog
        event={detailEvent}
        currency={session.business.currency}
        actorName={detailEvent?.actorUserId ? staffNameByUserId.get(detailEvent.actorUserId) : undefined}
        onClose={() => setDetailEvent(null)}
      />
    </Card>
  );
}

function ConnectionDot({ status }: { status: "connecting" | "open" | "closed" }) {
  const label = status === "open" ? "Live" : status === "connecting" ? "Connecting…" : "Reconnecting…";
  const dotColor = status === "open" ? "bg-whatsapp" : "bg-accent";
  return (
    <span className="flex items-center gap-1.5 text-xs text-fg-faint">
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor} ${status === "open" ? "animate-pulse" : ""}`} aria-hidden />
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
    <li>
      <button onClick={onOpenDetail} className="flex w-full items-start gap-3 px-5 py-3 text-start hover:bg-surface-2">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${TYPE_TINT[event.type]}`}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-fg">{event.description}</p>
          <p className="text-xs text-fg-faint">
            {formatRelativeTime(now - new Date(event.createdAt).getTime())}
            {actorName && ` · ${actorName}`}
          </p>
        </div>
        {event.amount != null && <span className="shrink-0 text-sm font-medium tabular-nums text-fg">{formatCurrency(event.amount, currency)}</span>}
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
