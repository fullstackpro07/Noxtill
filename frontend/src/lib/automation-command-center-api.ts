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
