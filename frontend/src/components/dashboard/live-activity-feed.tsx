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
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { useSession } from "@/lib/session";
import { useActivityStream } from "@/hooks/use-activity-stream";
import { useNow } from "@/hooks/use-now";
import { fetchStaffList } from "@/lib/staff-api";
import { formatCurrency, formatRelativeTime } from "@/lib/format";
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

export function LiveActivityFeed() {
  const session = useSession();
  const { events, status } = useActivityStream();
  const [typeFilter, setTypeFilter] = useState<ActivityEventType | "all">("all");
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const now = useNow();

  const { data: staff } = useQuery({ queryKey: ["staff-roster"], queryFn: fetchStaffList, staleTime: 5 * 60 * 1000 });
  const staffNameByUserId = useMemo(() => new Map((staff ?? []).map((s) => [s.userId, s.name])), [staff]);

  const filtered = events.filter((event) => {
    if (typeFilter !== "all" && event.type !== typeFilter) return false;
    if (staffFilter !== "all" && event.actorUserId !== staffFilter) return false;
    return true;
  });

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
        </div>
      </CardHeader>
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
              />
            ))}
          </ul>
        )}
      </CardContent>
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
}: {
  event: LiveActivityEvent;
  currency: string;
  actorName?: string;
  now: number;
}) {
  const Icon = TYPE_ICON[event.type];
  return (
    <li className="flex items-start gap-3 px-5 py-3">
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
    </li>
  );
}
