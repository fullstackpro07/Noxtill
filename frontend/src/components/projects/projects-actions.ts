"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  createTask,
  reschedule,
  reschedulePreview,
  setTaskStatus,
  startTimer,
  stopTimer,
  type TaskRow,
  type Workspace,
} from "@/lib/projects-api";
import { useProjectsInvalidate, useProjectsStore } from "./projects-store";
import { errorText, fmt } from "./projects-ui";

/** Actions shared by several screens (Kanban, Tasks, Calendar, Timeline, drawers, header). */
export function useProjectActions(ws: Workspace | undefined) {
  const invalidate = useProjectsInvalidate();
  const flash = useProjectsStore((s) => s.flash);
  const ask = useProjectsStore((s) => s.ask);
  const open = useProjectsStore((s) => s.open);
  const router = useRouter();

  const changeStatus = useCallback(
    async (t: TaskRow, status: string) => {
      if (!ws || t.status === status) return;
      if (status === "Done") {
        const miss = t.checklist.filter((c) => c.req && !c.done).map((c) => c.t);
        if (miss.length) {
          ask({ title: `${miss.length} required checklist item${miss.length > 1 ? "s are" : " is"} incomplete`, body: `${t.number} can’t move to Done until these are finished. Nothing was changed.`, items: miss, cancel: "Got it" });
          return;
        }
        const open = t.deps.map((d) => ws.tasks.find((x) => x.id === d)).filter((x): x is TaskRow => !!x && x.status !== "Done" && x.status !== "Cancelled");
        if (open.length) {
          ask({ title: "Blocked by unfinished work", body: `${t.number} depends on tasks that are not done yet.`, items: open.map((d) => `${d.number} · ${d.title}`), cancel: "Got it" });
          return;
        }
      }
      try {
        const r = await setTaskStatus(t.id, status);
        flash(r.warning ?? `${t.number} moved to ${status}`);
        await invalidate();
      } catch (e) {
        flash(errorText(e));
      }
    },
    [ws, ask, flash, invalidate],
  );

  const rescheduleTask = useCallback(
    async (t: TaskRow, newDue: string) => {
      if (!t.dueDate || newDue === t.dueDate) return;
      try {
        const plan = await reschedulePreview(t.id, newDue);
        const apply = async (all: boolean) => {
          try {
            const r = await reschedule(t.id, newDue, all);
            flash(`${t.number} moved to ${fmt(newDue)}${all && r.moved > 1 ? ` · ${r.moved - 1} dependent moved` : ""}`);
            await invalidate();
          } catch (e) {
            flash(errorText(e));
          }
        };
        if (!plan.dependents && !plan.milestones) return apply(false);
        ask({
          title: "Reschedule impact",
          body: `Moving ${t.number} affects ${plan.dependents} downstream task${plan.dependents === 1 ? "" : "s"}${plan.milestones ? ` and ${plan.milestones} milestone${plan.milestones > 1 ? "s" : ""}` : ""}.${plan.onlyAllowed ? "" : " Moving later without its dependents would break Finish-to-Start links, so that option is unavailable."}`,
          items: plan.items,
          ok: plan.dependents ? "Move dependent tasks too" : "Move task",
          run: () => apply(true),
          alt: "Move this task only",
          altRun: plan.onlyAllowed && plan.dependents ? () => apply(false) : undefined,
          cancel: "Cancel",
        });
      } catch (e) {
        flash(errorText(e));
      }
    },
    [ask, flash, invalidate],
  );

  const startTimerFor = useCallback(
    async (projectId: string, taskId?: string | null, label?: string) => {
      try {
        const r = await startTimer(projectId, taskId);
        flash(`Timer started on ${label ?? "the project"}${r.previousSaved ? ` · previous timer saved (${r.previousSaved.minutes} min)` : ""}`);
        await invalidate();
      } catch (e) {
        flash(errorText(e));
      }
    },
    [flash, invalidate],
  );

  const stop = useCallback(async () => {
    try {
      const r = await stopTimer();
      flash(`Timer stopped · ${r.minutes} min saved as a Draft entry — submit it from Time Tracking`);
      await invalidate();
    } catch (e) {
      flash(errorText(e));
    }
  }, [flash, invalidate]);

  const newTask = useCallback(
    async (projectId?: string) => {
      if (!ws) return;
      if (!ws.me.can["Create tasks"]) return flash("Your project role can’t create tasks.");
      const pid = projectId ?? ws.projects.find((p) => p.statusCat !== "Done" && p.statusCat !== "Closed")?.id;
      if (!pid) {
        flash("Create a project first — tasks belong to a project.");
        return;
      }
      try {
        const r = await createTask({ projectId: pid, title: "New task" });
        await invalidate();
        open({ kind: "task", id: r.id });
        flash(`${r.number} created in ${ws.projects.find((p) => p.id === pid)?.name ?? "the project"}`);
      } catch (e) {
        flash(errorText(e));
      }
    },
    [ws, flash, invalidate, open],
  );

  const goProject = useCallback((id: string) => router.push(`/projects/${id}`), [router]);

  return { changeStatus, rescheduleTask, startTimerFor, stop, newTask, goProject, invalidate, flash, ask, open };
}
