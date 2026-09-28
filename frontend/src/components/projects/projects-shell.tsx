"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { useAuthStore } from "@/store/auth-store";
import { useBranchContextStore } from "@/store/branch-context-store";
import { useProjectsStore, useWorkspace } from "./projects-store";
import { useProjectActions } from "./projects-actions";
import { ProjectsOverlays } from "./projects-overlays";
import { STYLES, Svg } from "./projects-ui";

export const TABS: Array<[string, string, string]> = [
  ["overview", "Overview", "/projects"],
  ["projects", "Projects", "/projects/all"],
  ["board", "Kanban", "/projects/board"],
  ["tasks", "Tasks", "/projects/tasks"],
  ["calendar", "Calendar", "/projects/calendar"],
  ["timeline", "Timeline", "/projects/timeline"],
  ["milestones", "Milestones", "/projects/milestones"],
  ["files", "Files", "/projects/files"],
  ["activity", "Activity", "/projects/activity"],
  ["time", "Time Tracking", "/projects/time"],
  ["approvals", "Client Approvals", "/projects/approvals"],
  ["portal", "Client Portal", "/projects/client-portal"],
  ["reports", "Reports", "/projects/reports"],
  ["templates", "Templates", "/projects/templates"],
  ["settings", "Settings", "/projects/settings"],
];

const TITLES: Record<string, string> = {
  overview: "Projects Overview",
  projects: "Projects",
  board: "Task Board",
  tasks: "Tasks",
  milestones: "Milestones",
  calendar: "Project Calendar",
  timeline: "Timeline",
  files: "Files",
  activity: "Comments & Activity",
  time: "Time Tracking",
  approvals: "Client Approvals",
  portal: "Client Portal",
  reports: "Project Reports",
  templates: "Templates",
  settings: "Project Settings",
};

export function screenOf(pathname: string): { key: string; detailId: string | null } {
  if (pathname === "/projects" || pathname === "/projects/") return { key: "overview", detailId: null };
  const seg = pathname.replace(/^\/projects\/?/, "").split("/")[0];
  const t = TABS.find(([, , href]) => href === `/projects/${seg}`);
  if (t) return { key: t[0], detailId: null };
  return { key: "detail", detailId: seg };
}

function useElapsed(startedAt: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  if (!startedAt) return "";
  const s = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":");
}

export function ProjectsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams();
  const { key, detailId } = screenOf(pathname);
  const { data: ws } = useWorkspace();
  const business = useAuthStore((s) => s.business);
  const branchId = useBranchContextStore((s) => s.selectedBranchId);
  const setBranchId = useBranchContextStore((s) => s.setSelectedBranchId);
  const scope = useProjectsStore((s) => s.scope);
  const setScope = useProjectsStore((s) => s.setScope);
  const open = useProjectsStore((s) => s.open);
  const drawer = useProjectsStore((s) => s.drawer);
  const palette = useProjectsStore((s) => s.palette);
  const setPalette = useProjectsStore((s) => s.setPalette);
  const act = useProjectActions(ws);

  // ?task=<id> deep links (notifications, palette) open the task drawer.
  const taskParam = search.get("task");
  useEffect(() => {
    if (taskParam) open({ kind: "task", id: taskParam });
  }, [taskParam, open]);

  const detail = detailId ? ws?.projects.find((p) => p.id === detailId) : undefined;
  const title = key === "detail" ? detail?.name ?? "Project" : TITLES[key];
  const timer = ws?.timer ?? null;
  const elapsed = useElapsed(timer?.startedAt);
  const timerLabel = timer ? (timer.taskId ? ws?.tasks.find((t) => t.id === timer.taskId)?.number : ws?.projects.find((p) => p.id === timer.projectId)?.name) ?? "Timer" : "";

  // Keyboard: Ctrl/⌘K or / = palette, P = new project, C = new task, Esc handled by overlays.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = ((e.target as HTMLElement)?.tagName || "").toLowerCase();
      const typing = tag === "input" || tag === "textarea" || tag === "select" || (e.target as HTMLElement)?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(true);
        return;
      }
      if (typing || drawer || palette || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        setPalette(true);
      } else if (e.key === "p" || e.key === "P") open({ kind: "np" });
      else if (e.key === "c" || e.key === "C") void act.newTask(detailId ?? undefined);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [drawer, palette, setPalette, open, act, detailId]);

  const branches = useMemo(() => {
    if (!business) return [];
    return [{ id: business.id, name: business.name }, ...(business.branches ?? [])];
  }, [business]);
  const branchValue = scope === "all" ? "all" : branchId ?? business?.id ?? "";

  const titleNode = useMemo(
    () => (
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={{ fontSize: "11.5px", color: "#667085", display: "flex", gap: "6px", whiteSpace: "nowrap", fontWeight: 500, letterSpacing: 0, lineHeight: 1.4 }}>
          <span>Noxtill</span>
          <span>/</span>
          <Link href="/projects" style={{ color: "#667085" }}>
            Projects &amp; Tasks
          </Link>
          <span>/</span>
          <span style={{ color: "#101828", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", maxWidth: "260px" }}>{title}</span>
        </span>
        <span style={{ margin: "2px 0 0", fontSize: "21px", fontWeight: 800, letterSpacing: "-.6px", color: "#0F172A", whiteSpace: "nowrap", lineHeight: 1.2 }}>{title}</span>
      </span>
    ),
    [title],
  );

  const actions = useMemo(
    () => (
      <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" }}>
        <button
          type="button"
          className="pt-hov"
          onClick={() => setPalette(true)}
          style={{ display: "flex", alignItems: "center", gap: "8px", border: "1px solid #E6EAF0", background: "#F9FAFB", borderRadius: "10px", padding: "0 12px", height: "40px", minWidth: "230px", fontSize: "12.5px", color: "#98A2B3", cursor: "pointer", textAlign: "left" }}
        >
          <Svg d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3" />
          <span style={{ flex: 1 }}>Search projects, tasks, people…</span>
          <span style={{ fontSize: "10.5px", fontWeight: 700, color: "#667085", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "5px", padding: "1px 6px" }}>Ctrl K</span>
        </button>
        <select
          data-hidesm="1"
          aria-label="Branch"
          value={branchValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "all") {
              setBranchId(null);
              setScope("all");
            } else {
              setScope("current");
              setBranchId(v === business?.id ? null : v);
            }
            act.flash("Branch scope: " + (v === "all" ? "All branches" : branches.find((b) => b.id === v)?.name ?? ""));
            setTimeout(() => void act.invalidate(), 0);
          }}
          style={{ height: "40px", border: "1px solid #E6EAF0", borderRadius: "10px", padding: "0 10px", fontSize: "12.5px", fontWeight: 600, color: "#344054", background: "#fff" }}
        >
          {branches.length > 1 && <option value="all">All branches</option>}
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        {timer && (
          <button type="button" onClick={() => void act.stop()} style={{ display: "flex", alignItems: "center", gap: "7px", height: "40px", border: "1px solid #ABEFC6", background: "#ECFDF3", borderRadius: "10px", padding: "0 12px", fontSize: "12px", fontWeight: 700, color: "#067647", cursor: "pointer" }}>
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#12A150" }} />
            {timerLabel} {elapsed} · Stop
          </button>
        )}
        <button
          type="button"
          className="pt-hov"
          onClick={() => open({ kind: "ai", tab: "plan", projectId: detailId ?? undefined })}
          style={{ display: "flex", alignItems: "center", gap: "6px", height: "40px", border: "1px solid #D1F2DE", background: "#F3FBF6", borderRadius: "10px", padding: "0 12px", fontSize: "12.5px", fontWeight: 800, color: "#0E8442", cursor: "pointer" }}
        >
          <Svg d="M11 3.5 12.9 9l5.6 1.9-5.6 1.9L11 18.4 9.1 12.8 3.5 10.9 9.1 9ZM18.5 3v3M20 4.5h-3" />
          AI assist
        </button>
        <button type="button" className="pt-primary" onClick={() => open({ kind: "np" })} style={{ display: "flex", alignItems: "center", gap: "7px", background: "#12A150", border: 0, borderRadius: "10px", padding: "0 15px", height: "40px", fontSize: "12.5px", fontWeight: 800, color: "#fff", cursor: "pointer" }}>
          <Svg d="M12 5v14M5 12h14" sw={2.4} />
          New Project
        </button>
        <button type="button" className="pt-ghost" onClick={() => void act.newTask(detailId ?? undefined)} style={{ height: "40px", border: "1px solid #E6EAF0", background: "#fff", borderRadius: "10px", padding: "0 13px", fontSize: "12.5px", fontWeight: 700, color: "#344054", cursor: "pointer" }}>
          + Task
        </button>
      </div>
    ),
    [branchValue, branches, business?.id, timer, timerLabel, elapsed, act, open, setPalette, setBranchId, setScope, detailId],
  );

  useModuleHeader({ title: titleNode, actions });

  return (
    <div className="ui-projects" style={{ display: "flex", flexDirection: "column", minHeight: "100%", background: "#F4F6F8" }}>
      <style>{STYLES}</style>
      <nav aria-label="Projects & Tasks" style={{ background: "#fff", borderBottom: "1px solid #E6EAF0", padding: "0 18px", display: "flex", gap: "1px", overflowX: "auto", position: "sticky", top: 0, zIndex: 25 }}>
        {TABS.map(([k, label, href]) => {
          const on = key === k || (key === "detail" && k === "projects");
          return (
            <Link key={k} href={href} className="pt-tab" onClick={() => router.prefetch(href)} style={{ position: "relative", display: "flex", alignItems: "center", gap: "6px", padding: "12px 11px 13px", fontSize: "12.5px", fontWeight: on ? 800 : 600, color: on ? "#0E8442" : "#475467", whiteSpace: "nowrap" }}>
              {label}
              <span style={{ position: "absolute", left: "8px", right: "8px", bottom: 0, height: "2.5px", borderRadius: "3px", background: on ? "#12A150" : "transparent" }} />
            </Link>
          );
        })}
      </nav>
      <main style={{ flex: 1, padding: "16px 22px 28px", display: "flex", flexDirection: "column", gap: "15px", minWidth: 0 }}>{children}</main>
      <ProjectsOverlays />
    </div>
  );
}
