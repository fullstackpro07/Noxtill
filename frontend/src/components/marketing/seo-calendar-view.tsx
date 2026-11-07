"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import {
  assignCalendarItem,
  fetchSeoCalendar,
  rescheduleCalendarItem,
  SEO_CALENDAR_KEY,
  type CalendarItem,
  type CalendarUrgency,
} from "@/lib/seo-calendar-api";
import type { BriefStatus } from "@/lib/seo-content-api";

const STATUS_LABEL: Record<BriefStatus, string> = {
  brief: "Brief ready",
  drafting: "Drafting",
  approval_required: "Awaiting approval",
  approved: "Approved",
  published: "Published",
  dismissed: "Dismissed",
};
const PIPELINE: BriefStatus[] = ["brief", "drafting", "approval_required", "approved", "published"];
const URGENCY_LABEL: Record<CalendarUrgency, string> = {
  overdue: "Overdue",
  due_this_week: "Due within 7 days",
  later: "Later",
  no_date: "No date",
  done: "Done",
};
const URGENCY_COLOR: Record<CalendarUrgency, string> = {
  overdue: "var(--app-danger-strong)",
  due_this_week: "var(--app-warning-text)",
  later: "var(--app-text-muted)",
  no_date: "var(--app-text-faintest)",
  done: "var(--app-success-text)",
};
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const fieldClass = "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--app-primary)]";
const fieldStyle = { borderColor: "var(--app-border)", background: "var(--app-surface)" };

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint: string; tone?: "warning" | "danger" }) {
  const color = tone === "danger" ? "var(--app-danger-strong)" : tone === "warning" ? "var(--app-warning-text)" : "var(--app-text)";
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
      <p className="m-0 text-xs font-semibold" style={{ color: "var(--app-text-faint)" }}>{label}</p>
      <p className="m-0 mt-1 text-2xl font-bold" style={{ color }}>{value}</p>
      <p className="m-0 mt-1 text-xs" style={{ color: "var(--app-text-faintest)" }}>{hint}</p>
    </div>
  );
}

/** The date an item sits on in the calendar: published date once live, otherwise its due date. */
function calendarDate(item: CalendarItem): Date | null {
  const value = item.status === "published" ? item.publishedAt : item.dueAt;
  return value ? new Date(value) : null;
}

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
const toInputDate = (value: string | null) => (value ? new Date(value).toISOString().slice(0, 10) : "");

function ItemDrawer({ item, members, onClose }: { item: CalendarItem; members: { userId: string; name: string }[]; onClose: () => void }) {
  const client = useQueryClient();
  const open = item.status !== "published" && item.status !== "dismissed";
  const [due, setDue] = useState(toInputDate(item.dueAt));
  const [assignee, setAssignee] = useState(item.assigneeUserId ?? "");
  const refresh = () => Promise.all([client.invalidateQueries({ queryKey: SEO_CALENDAR_KEY }), client.invalidateQueries({ queryKey: ["seo-content-briefs"] })]);
  const save = useMutation({
    mutationFn: async () => {
      if (due !== toInputDate(item.dueAt)) await rescheduleCalendarItem(item.id, due ? new Date(`${due}T12:00:00`).toISOString() : null);
      if (assignee !== (item.assigneeUserId ?? "")) await assignCalendarItem(item.id, assignee || null);
    },
    onSuccess: async () => {
      await refresh();
      toast.success("Calendar updated.");
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't update the item.")),
  });
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside role="dialog" aria-modal="true" aria-label={item.title} className="flex h-full w-full max-w-md flex-col gap-3 overflow-y-auto border-l p-5" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)", color: "var(--app-text)" }}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="m-0 text-base font-bold">{item.title}</h2>
          <button type="button" onClick={onClose} className="text-sm font-semibold" style={{ color: "var(--app-text-faint)" }}>Close</button>
        </div>
        <p className="m-0 text-xs" style={{ color: "var(--app-text-muted)" }}>
          {STATUS_LABEL[item.status]}
          {item.keyword ? ` · keyword “${item.keyword}”` : " · no linked keyword"} · {item.format.replace("_", " ")}
        </p>
        {item.refreshReason && <p className="m-0 text-xs font-semibold" style={{ color: "var(--app-warning-text)" }}>Refresh due: {item.refreshReason}</p>}
        {item.status === "published" && (
          <p className="m-0 text-xs">
            Published {item.publishedAt ? formatDate(item.publishedAt) : ""} at{" "}
            <a href={item.publishedUrl ?? "#"} target="_blank" rel="noreferrer" className="underline">{item.publishedUrl}</a>
            {item.liveConfirmedAt ? ` · confirmed live ${formatDate(item.liveConfirmedAt)}` : " · not yet confirmed by a site audit"}
          </p>
        )}
        {open ? (
          <>
            <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--app-text-muted)" }}>
              Due date
              <input type="date" value={due} onChange={(event) => setDue(event.target.value)} className={fieldClass} style={fieldStyle} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--app-text-muted)" }}>
              Owner
              <select value={assignee} onChange={(event) => setAssignee(event.target.value)} className={fieldClass} style={fieldStyle}>
                <option value="">Unassigned</option>
                {members.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}
              </select>
            </label>
            <button type="button" disabled={save.isPending} onClick={() => save.mutate()} className="rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>
              {save.isPending ? "Saving…" : "Save"}
            </button>
          </>
        ) : null}
        <Link href={`/marketing/seo-autopilot/content?brief=${item.id}`} className="text-sm font-bold underline">
          {item.status === "brief" ? "Open brief" : "Open brief & draft"} in Content SEO
        </Link>
        <p className="m-0 text-xs" style={{ color: "var(--app-text-faintest)" }}>
          Status changes (drafting, approval, publishing) happen in Content SEO. Linking to a project task isn&rsquo;t available — Noxtill has no Projects &amp; Tasks module.
        </p>
      </aside>
    </div>
  );
}

function MonthGrid({ items, month, onOpen }: { items: CalendarItem[]; month: Date; onOpen: (id: string) => void }) {
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const date = calendarDate(item);
      if (!date) continue;
      map.set(dayKey(date), [...(map.get(dayKey(date)) ?? []), item]);
    }
    return map;
  }, [items]);
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, index) => {
    const day = index - offset + 1;
    return day >= 1 && day <= days ? new Date(month.getFullYear(), month.getMonth(), day) : null;
  });
  const today = dayKey(new Date());
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[760px] grid-cols-7 gap-px" style={{ background: "var(--app-border)" }}>
        {WEEKDAYS.map((day) => (
          <div key={day} className="px-2 py-1.5 text-[11px] font-bold" style={{ background: "var(--app-surface-2)", color: "var(--app-text-faint)" }}>{day}</div>
        ))}
        {cells.map((date, index) => (
          <div key={index} className="min-h-[96px] p-1.5" style={{ background: date ? "var(--app-surface)" : "var(--app-surface-2)" }}>
            {date && (
              <>
                <span className="text-[11px] font-bold" style={{ color: dayKey(date) === today ? "var(--app-primary)" : "var(--app-text-faint)" }}>{date.getDate()}</span>
                <div className="mt-1 flex flex-col gap-1">
                  {(byDay.get(dayKey(date)) ?? []).map((item) => (
                    <button key={item.id} type="button" onClick={() => onOpen(item.id)} className="truncate rounded px-1.5 py-0.5 text-left text-[11px] font-semibold" style={{ background: "var(--app-surface-2)", borderLeft: `3px solid ${URGENCY_COLOR[item.urgency]}` }} title={`${item.title} · ${STATUS_LABEL[item.status]}`}>
                      {item.title}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

type View = "calendar" | "list" | "pipeline";

export function SeoCalendarView() {
  const query = useQuery({ queryKey: SEO_CALENDAR_KEY, queryFn: fetchSeoCalendar });
  const [view, setView] = useState<View>("calendar");
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [openId, setOpenId] = useState<string | null>(null);
  const data = query.data;
  const kpis = data?.kpis;
  const loading = query.isLoading;
  const items = data?.items ?? [];
  const openItem = items.find((item) => item.id === openId) ?? null;
  const undated = items.filter((item) => !calendarDate(item));

  return (
    <main className="flex flex-col gap-5 p-5 md:p-7" style={{ color: "var(--app-text)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="m-0 max-w-3xl text-xs" style={{ color: "var(--app-text-muted)" }}>
          Every item is a Content SEO brief — this calendar plans dates and owners for them; it isn&rsquo;t a second to-do list. Publish dates come from the URL you record when publishing, confirmed by a later site audit.
          Refresh due uses the Content SEO rank-drop rule.
        </p>
        <Link href="/marketing/seo-autopilot/content" className="rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: "var(--app-primary)" }}>
          Plan content
        </Link>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Due this week" value={loading ? "…" : kpis?.dueThisWeek ?? "—"} hint={kpis?.overdue ? `${kpis.overdue} overdue` : "Next 7 days, incl. overdue"} tone={kpis?.overdue ? "danger" : undefined} />
        <Kpi label="Briefs ready" value={loading ? "…" : kpis?.briefsReady ?? "—"} hint="Waiting for a draft" />
        <Kpi label="Drafting" value={loading ? "…" : kpis?.drafting ?? "—"} hint="Draft in progress" />
        <Kpi label="Awaiting approval" value={loading ? "…" : kpis?.awaitingApproval ?? "—"} hint="Submitted for review" tone={kpis?.awaitingApproval ? "warning" : undefined} />
        <Kpi label="Scheduled" value={loading ? "…" : kpis?.scheduled ?? "—"} hint="Approved, with a publish date" />
        <Kpi label="Refresh due" value={loading ? "…" : kpis?.refreshDue ?? "—"} hint="Published, rank fell since" tone={kpis?.refreshDue ? "warning" : undefined} />
      </section>

      <section className="rounded-2xl border" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 pt-3" style={{ borderColor: "var(--app-border)" }}>
          <div role="tablist" className="flex gap-4">
            {([["calendar", "Calendar"], ["list", "List"], ["pipeline", "Pipeline"]] as const).map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={view === key} onClick={() => setView(key)} className="border-b-2 pb-2.5 text-sm font-bold" style={{ borderColor: view === key ? "var(--app-primary)" : "transparent", color: view === key ? "var(--app-text)" : "var(--app-text-faint)" }}>
                {label}
              </button>
            ))}
          </div>
          {view === "calendar" && (
            <div className="mb-2 flex items-center gap-2 text-sm">
              <button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded border px-2" style={{ borderColor: "var(--app-border)" }}>‹</button>
              <span className="min-w-[130px] text-center font-bold">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
              <button type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded border px-2" style={{ borderColor: "var(--app-border)" }}>›</button>
            </div>
          )}
        </div>

        <div className="p-4">
          {query.isLoading ? (
            <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading…</p>
          ) : query.isError ? (
            <div className="flex items-center gap-3 text-sm" style={{ color: "var(--app-danger-strong)" }}>
              {errorMessage(query.error, "Couldn't load the calendar.")}
              <button type="button" onClick={() => query.refetch()} className="font-bold underline">Retry</button>
            </div>
          ) : items.length === 0 ? (
            <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>
              Nothing planned yet. <Link href="/marketing/seo-autopilot/content" className="font-bold underline">Create a brief from a content opportunity</Link> and give it a due date.
            </p>
          ) : view === "calendar" ? (
            <div className="flex flex-col gap-3">
              <MonthGrid items={items} month={month} onOpen={setOpenId} />
              {undated.length > 0 && (
                <p className="m-0 text-xs" style={{ color: "var(--app-text-faint)" }}>
                  {undated.length} item(s) have no date and aren&rsquo;t on the calendar:{" "}
                  {undated.map((item, index) => (
                    <span key={item.id}>
                      {index > 0 && ", "}
                      <button type="button" onClick={() => setOpenId(item.id)} className="font-semibold underline">{item.title}</button>
                    </span>
                  ))}
                </p>
              )}
            </div>
          ) : view === "list" ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead style={{ color: "var(--app-text-faint)" }}>
                  <tr>{["Title", "Target keyword", "Page type", "Owner", "Due", "Publish date", "Status", "Urgency"].map((heading) => <th key={heading} className="px-3 py-2 font-semibold">{heading}</th>)}</tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} onClick={() => setOpenId(item.id)} className="cursor-pointer border-t" style={{ borderColor: "var(--app-border)" }}>
                      <td className="px-3 py-2 font-semibold">{item.title}</td>
                      <td className="px-3 py-2">{item.keyword ?? "—"}</td>
                      <td className="px-3 py-2">{item.format.replace("_", " ")}</td>
                      <td className="px-3 py-2">{item.assigneeName ?? "Unassigned"}</td>
                      <td className="px-3 py-2">{item.dueAt ? formatDate(item.dueAt) : "—"}</td>
                      <td className="px-3 py-2">{item.publishedAt ? formatDate(item.publishedAt) : "—"}</td>
                      <td className="px-3 py-2">{STATUS_LABEL[item.status]}{item.refreshReason ? " · refresh due" : ""}</td>
                      <td className="px-3 py-2 font-semibold" style={{ color: URGENCY_COLOR[item.urgency] }}>{URGENCY_LABEL[item.urgency]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-5">
              {PIPELINE.map((status) => {
                const column = items.filter((item) => item.status === status);
                return (
                  <div key={status} className="flex flex-col gap-2 rounded-xl p-2" style={{ background: "var(--app-surface-2)" }}>
                    <p className="m-0 text-xs font-bold">{STATUS_LABEL[status]} ({column.length})</p>
                    {column.map((item) => (
                      <button key={item.id} type="button" onClick={() => setOpenId(item.id)} className="rounded-lg border p-2 text-left text-xs" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
                        <span className="block font-semibold">{item.title}</span>
                        <span style={{ color: URGENCY_COLOR[item.urgency] }}>{item.dueAt ? formatDate(item.dueAt) : URGENCY_LABEL[item.urgency]}</span>
                        {item.assigneeName && <span style={{ color: "var(--app-text-faint)" }}> · {item.assigneeName}</span>}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {openItem && data && <ItemDrawer key={openItem.id + (openItem.dueAt ?? "") + (openItem.assigneeUserId ?? "")} item={openItem} members={data.members} onClose={() => setOpenId(null)} />}
    </main>
  );
}
