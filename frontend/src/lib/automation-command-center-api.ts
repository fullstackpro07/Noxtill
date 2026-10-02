import { apiFetch } from "@/lib/api-client";

export interface AutomationCommandCenter {
  capturedAt: string;
  workflows: { active: number; paused: number };
  runs24h: { total: number; success: number; failed: number; skipped: number; cancelled: number; running: number; failureRatePct: number | null };
  waiting: number;
  overdueWaits: number;
  pendingApprovals: number;
  oldestApprovals: { id: string; workflow: string; title: string; requestedAt: string }[];
  openDeadLetters: number;
  upcoming: { id: string; name: string; nextScheduleAt: string }[];
  recentFailures: { id: string; workflowId: string; workflow: string; error: string | null; createdAt: string }[];
  queue: { reachable: boolean; counts: Record<"waiting" | "active" | "delayed" | "failed" | "completed", number> | null };
  attention: { key: string; tone: "red" | "amber"; text: string; href: string }[];
  notTracked: string[];
}

export const fetchAutomationCommandCenter = () => apiFetch<AutomationCommandCenter>("/workflows/command-center");

export interface AutomationSchedules {
  capturedAt: string;
  queue: AutomationCommandCenter["queue"];
  scheduled: {
    id: string;
    name: string;
    active: boolean;
    rule: string;
    timezone: string;
    nextScheduleAt: string | null;
    lastScheduledAt: string | null;
    lastRun: { status: string; createdAt: string } | null;
    overdue: boolean;
  }[];
  waits: { id: string; workflowId: string; workflow: string; waitingUntil: string | null; startedAt: string; overdue: boolean }[];
  fixed: string[];
}

export const fetchAutomationSchedules = () => apiFetch<AutomationSchedules>("/workflows/schedules-overview");
