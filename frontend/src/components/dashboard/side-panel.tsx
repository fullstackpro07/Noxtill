"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useActivityStream } from "@/hooks/use-activity-stream";
import { TYPE_ICON, TYPE_TINT } from "./live-activity-feed";
import { fetchAiInsights, AI_INSIGHT_CATEGORY_LABEL } from "@/lib/ai-insights-api";
import { fetchAppointments } from "@/lib/bookings-api";
import { formatRelativeTime, formatCurrency } from "@/lib/format";
import { useNow } from "@/hooks/use-now";

function todayIsoDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function SidePanelCard({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <div
      className="flex flex-col gap-3 rounded-[14px] p-4"
      style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-[13.5px] font-bold" style={{ color: "var(--app-text)" }}>
          {title}
        </h2>
        <Link href={href} className="text-[11px] font-semibold" style={{ color: "var(--app-primary)" }}>
          View All
        </Link>
      </div>
      {children}
    </div>
  );
}

function LiveActivityCard({ currency }: { currency: string }) {
  const { events } = useActivityStream();
  const now = useNow();
  const top = events.slice(0, 6);

  return (
    <SidePanelCard title="Live Activity" href="/dashboard/activity">
      {top.length === 0 ? (
        <p className="text-[12px]" style={{ color: "var(--app-text-faintest)" }}>
          Real events will appear here as they happen.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {top.map((e) => {
            const Icon = TYPE_ICON[e.type];
            return (
              <div key={e.id} className="flex items-center gap-2.5">
                <span className={`flex h-7 w-7 flex-none items-center justify-center rounded-full ${TYPE_TINT[e.type]}`}>
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px]" style={{ color: "var(--app-text-muted)" }}>
                    {e.description}
                  </p>
                  <p className="text-[10.5px]" style={{ color: "var(--app-text-faintest)" }}>
                    {formatRelativeTime(now - new Date(e.createdAt).getTime())}
                  </p>
                </div>
                {e.amount !== null && (
                  <span className="flex-none text-[12px] font-semibold" style={{ color: "var(--app-text)" }}>
                    {formatCurrency(e.amount, currency)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SidePanelCard>
  );
}

function AiInsightCard() {
  const { data } = useQuery({
    queryKey: ["ai-insights", "sidebar-top"],
    queryFn: () => fetchAiInsights({ status: "new" }),
  });
  const top = data?.[0];

  return (
    <SidePanelCard title="AI Insight" href="/dashboard/insights">
      {!top ? (
        <p className="text-[12px]" style={{ color: "var(--app-text-faintest)" }}>
          No open insights right now.
        </p>
      ) : (
        <>
          <div className="flex items-start gap-2 rounded-[10px] p-3" style={{ background: "#F0FAF4", border: "1px solid #D5EFE0" }}>
            <Sparkles className="mt-0.5 h-3.5 w-3.5 flex-none" style={{ color: "var(--app-primary)" }} aria-hidden />
            <div className="min-w-0">
              <p className="text-[9.5px] font-bold uppercase tracking-wide" style={{ color: "var(--app-primary)" }}>
                {AI_INSIGHT_CATEGORY_LABEL[top.category]}
              </p>
              <p className="text-[12px] leading-snug" style={{ color: "var(--app-text)" }}>
                {top.observation}
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/insights"
            className="block w-full rounded-[9px] py-2 text-center text-[11.5px] font-bold transition-colors"
            style={{ border: "1px solid var(--app-border-strong)", color: "var(--app-text-muted)" }}
          >
            See All Insights
          </Link>
        </>
      )}
    </SidePanelCard>
  );
}

function UpcomingBookingsCard() {
  const { data, isPending } = useQuery({
    queryKey: ["appointments", "today"],
    queryFn: () => fetchAppointments({ from: todayIsoDate(), to: todayIsoDate() }),
  });
  const now = new Date();
  const upcoming = (data ?? [])
    .filter((a) => new Date(a.startsAt).getTime() >= now.getTime() && a.status !== "cancelled")
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const top = upcoming.slice(0, 4);

  return (
    <SidePanelCard title="Upcoming Bookings" href="/bookings">
      {isPending ? (
        <p className="text-[12px]" style={{ color: "var(--app-text-faintest)" }}>Loading…</p>
      ) : top.length === 0 ? (
        <p className="text-[12px]" style={{ color: "var(--app-text-faintest)" }}>No more bookings today.</p>
      ) : (
        <div className="flex flex-col">
          {top.map((b) => (
            <div key={b.id} className="flex items-center gap-2.5 border-t py-2 first:border-t-0 first:pt-0" style={{ borderColor: "var(--app-border)" }}>
              <span className="w-14.5 shrink-0 text-[11.5px] font-bold" style={{ color: "var(--app-text)" }}>
                {new Date(b.startsAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: "var(--app-text-faint)" }}>{b.serviceName}</span>
              <span className="shrink-0 truncate text-[11.5px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>{b.customerName}</span>
            </div>
          ))}
          {upcoming.length > top.length && (
            <p className="mt-2 text-[11.5px]" style={{ color: "var(--app-text-faintest)" }}>+ {upcoming.length - top.length} more bookings today</p>
          )}
        </div>
      )}
    </SidePanelCard>
  );
}

export function DashboardSidePanel({ currency }: { currency: string }) {
  return (
    <div className="flex flex-col gap-4">
      <LiveActivityCard currency={currency} />
      <AiInsightCard />
      <UpcomingBookingsCard />
    </div>
  );
}
