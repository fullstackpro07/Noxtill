import { apiFetch } from "@/lib/api-client";
import type { BriefStatus, ContentFormat } from "@/lib/seo-content-api";

export type CalendarUrgency = "overdue" | "due_this_week" | "later" | "no_date" | "done";

export interface CalendarItem {
  id: string;
  title: string;
  topic: string;
  keyword: string | null;
  keywordId: string | null;
  format: ContentFormat;
  status: BriefStatus;
  assigneeUserId: string | null;
  assigneeName: string | null;
  dueAt: string | null;
  publishedAt: string | null;
  publishedUrl: string | null;
  liveConfirmedAt: string | null;
  urgency: CalendarUrgency;
  refreshReason: string | null;
}

export interface SeoCalendar {
  kpis: {
    dueThisWeek: number;
    overdue: number;
    briefsReady: number;
    drafting: number;
    awaitingApproval: number;
    scheduled: number;
    refreshDue: number;
    noDate: number;
  };
  members: { userId: string; name: string }[];
  items: CalendarItem[];
}

const BASE = "/seo-autopilot/calendar";

export const SEO_CALENDAR_KEY = ["seo-calendar"] as const;
export const fetchSeoCalendar = () => apiFetch<SeoCalendar>(BASE);
export const rescheduleCalendarItem = (id: string, dueAt: string | null) =>
  apiFetch(`${BASE}/${id}/reschedule`, { method: "POST", body: JSON.stringify({ dueAt }) });
export const assignCalendarItem = (id: string, assigneeUserId: string | null) =>
  apiFetch(`${BASE}/${id}/assign`, { method: "POST", body: JSON.stringify({ assigneeUserId }) });
