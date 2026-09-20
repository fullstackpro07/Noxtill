"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { fetchMarketingTasks, type MarketingTask } from "@/lib/marketing-tasks-api";
import { formatDate } from "@/lib/format";

const PRIORITY_TONE: Record<MarketingTask["priority"], { bg: string; fg: string }> = {
  Urgent: { bg: "#FEF3F2", fg: "#B42318" },
  High: { bg: "#FFF1E8", fg: "#C4320A" },
  Normal: { bg: "var(--app-warning-bg)", fg: "var(--app-warning-text)" },
};

const ROUTE_BY_SOURCE: Record<string, string> = {
  Automations: "/marketing/automations",
  "Offers & Promotions": "/marketing/offers",
  Settings: "/marketing/settings",
};

export function MarketingTasksView() {
  const router = useRouter();
  const [priorityFilter, setPriorityFilter] = useState("All priorities");
  const { data: tasks = [] } = useQuery({ queryKey: ["marketing-tasks"], queryFn: fetchMarketingTasks });

  const filtered = priorityFilter === "All priorities" ? tasks : tasks.filter((t) => t.priority === priorityFilter);
  const dueTodayCount = tasks.filter((t) => t.dueDate && new Date(t.dueDate).toDateString() === new Date().toDateString()).length;
  const overdueCount = tasks.filter((t) => t.dueDate && new Date(t.dueDate) < new Date()).length;

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[9px]">
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} aria-label="Priority" className="rounded-[11px] text-[12.5px] font-semibold" style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", padding: "10px 12px", minHeight: 44 }}>
          <option>All priorities</option>
          <option>Urgent</option>
          <option>High</option>
          <option>Normal</option>
        </select>
      </div>

      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        <div className="rounded-[14px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 15 }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Open</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{tasks.length}</div>
        </div>
        <div className="rounded-[14px]" style={{ background: "var(--app-surface)", border: "1.5px solid var(--app-warning-border)", padding: 15 }}>
          <div className="text-[12px] font-bold" style={{ color: "var(--app-warning-text)" }}>Due Today</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{dueTodayCount}</div>
        </div>
        <div className="rounded-[14px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 15 }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Overdue</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{overdueCount}</div>
        </div>
        <div className="rounded-[14px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: 15 }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Completed</div>
          <div className="mt-1.5 text-[22px] font-extrabold" style={{ color: "var(--app-primary)" }}>—</div>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="text-center" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 16, padding: "52px 18px" }}>
          <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Nothing needs you right now</div>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {filtered.map((t) => {
          const tone = PRIORITY_TONE[t.priority];
          const href = ROUTE_BY_SOURCE[t.source];
          return (
            <div
              key={t.key}
              onClick={() => href && router.push(href)}
              className="flex flex-wrap items-center gap-[13px] rounded-[14px]"
              style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", padding: "14px 16px", cursor: href ? "pointer" : "default" }}
            >
              <span className="shrink-0 rounded-full text-[10.5px] font-extrabold" style={{ padding: "4px 10px", background: tone.bg, color: tone.fg }}>{t.priority}</span>
              <span className="min-w-[200px] flex-1">
                <span className="block text-[13px] font-bold" style={{ color: "var(--app-text)" }}>{t.title}</span>
                <span className="mt-0.5 block text-[11.5px]" style={{ color: "var(--app-text-faintest)" }}>{t.why}</span>
              </span>
              <span className="whitespace-nowrap text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>{t.source}</span>
              <span className="whitespace-nowrap text-[11.5px] font-bold" style={{ color: "var(--app-text-faint)" }}>{t.dueDate ? formatDate(t.dueDate) : "Ongoing"}</span>
              {href && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); router.push(href); }}
                  className="rounded-[9px] text-[11.5px] font-extrabold text-white"
                  style={{ border: 0, background: "var(--app-primary)", padding: "9px 14px", minHeight: 42 }}
                >
                  Go fix it
                </button>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
