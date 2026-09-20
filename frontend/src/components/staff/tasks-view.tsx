"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { fetchActions, completeAction, type ActionItemType, type LiveActionItem } from "@/lib/action-center-api";
import { fetchStaffList } from "@/lib/staff-api";
import { formatRelativeTime } from "@/lib/format";
import { SimpleKpiTile, KpiSkeleton, Chip, selectStyle, primaryBtnStyle, outlineBtnStyle, DisclosureNote } from "@/components/staff/staff-ui";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const SOURCE_LABEL: Record<ActionItemType, string> = {
  complaint: "Reviews",
  low_stock: "Inventory",
  overdue_credit: "Credit",
  unreplied_review: "Reviews",
};
const PRIORITY_LABEL: Record<LiveActionItem["priority"], string> = { urgent: "High", normal: "Normal", low: "Low" };

/** Real derivation from the item's own `ageMs` and `priority` — the Action Center has no explicit
 * due-date field, so "Overdue" for an urgent item means it's been open more than a day; for
 * everything else it means more than a week. */
function dueLabel(item: LiveActionItem): "Overdue" | "Today" | "This week" {
  const ageHours = item.ageMs / (60 * 60 * 1000);
  if (item.priority === "urgent") return ageHours > 24 ? "Overdue" : "Today";
  return ageHours > 24 * 7 ? "Overdue" : ageHours > 24 ? "This week" : "Today";
}

export function TasksView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [assignee, setAssignee] = useState("All staff");
  const [source, setSource] = useState("All sources");
  const [priority, setPriority] = useState("All priorities");
  const [status, setStatus] = useState("All statuses");

  const { data: staffList = [] } = useQuery({ queryKey: ["staff-list"], queryFn: () => fetchStaffList() });
  const { data: actions, isPending, isError, refetch } = useQuery({ queryKey: ["actions"], queryFn: () => fetchActions() });

  const completeMutation = useMutation({
    mutationFn: (id: string) => completeAction(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["actions"] });
      toast.success("Task completed.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't complete this task — please try again."),
  });

  const items = actions?.items ?? [];
  const availableSources = Array.from(new Set(items.map((i) => SOURCE_LABEL[i.type])));

  const filtered = items.filter((it) => {
    if (status === "Completed") return false; // completed items are never re-listed — see disclosure
    if (assignee === "Unassigned" && it.assigneeStaffId) return false;
    if (assignee !== "All staff" && assignee !== "Unassigned") {
      const staffId = staffList.find((s) => s.name === assignee)?.id;
      if (it.assigneeStaffId !== staffId) return false;
    }
    if (source !== "All sources" && SOURCE_LABEL[it.type] !== source) return false;
    if (priority !== "All priorities" && PRIORITY_LABEL[it.priority] !== priority) return false;
    return true;
  });

  const dueToday = items.filter((it) => dueLabel(it) === "Today").length;
  const overdue = items.filter((it) => dueLabel(it) === "Overdue").length;
  const highPriority = items.filter((it) => it.priority === "urgent").length;

  if (isError) {
    return (
      <div className="mx-6 mt-6 rounded-[16px] p-6 text-center" style={{ background: "var(--app-surface)", border: "1px solid #FDD9D6" }}>
        <p className="m-0 text-[14.5px] font-extrabold" style={{ color: "#B42318" }}>Unable to load tasks</p>
        <button type="button" onClick={() => refetch()} className="mt-3.5 rounded-[12px] px-5 py-3 text-[13px] font-extrabold text-white" style={primaryBtnStyle()}>Retry</button>
      </div>
    );
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(175px,1fr))" }}>
        {isPending ? (
          <KpiSkeleton count={5} />
        ) : (
          <>
            <SimpleKpiTile label="Open" value={String(actions?.counts.open ?? 0)} valueSize={22} />
            <SimpleKpiTile label="Due Today" labelColor="#B54708" value={String(dueToday)} valueSize={22} border="1.5px solid #FDE3B3" />
            <SimpleKpiTile label="Overdue" labelColor="#B42318" value={String(overdue)} valueSize={22} border="1.5px solid #FDD9D6" />
            <SimpleKpiTile label="High Priority" value={String(highPriority)} valueSize={22} valueColor="#B42318" />
            <SimpleKpiTile label="Completed" value={String(actions?.counts.completedThisWeek ?? 0)} valueSize={22} valueColor="#12A150" />
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-[9px]">
        <select value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Assignee" className="rounded-[11px]" style={selectStyle}>
          <option>All staff</option>
          <option>Unassigned</option>
          {staffList.filter((s) => s.active).map((s) => <option key={s.id}>{s.name}</option>)}
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Source" className="rounded-[11px]" style={selectStyle}>
          <option>All sources</option>
          {availableSources.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority" className="rounded-[11px]" style={selectStyle}>
          <option>All priorities</option>
          <option>High</option>
          <option>Normal</option>
          <option>Low</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" className="rounded-[11px]" style={selectStyle}>
          <option>All statuses</option>
          <option>Open</option>
          <option>Completed</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        {status === "Completed" ? (
          <div className="text-center" style={{ padding: "52px 18px" }}>
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Completed tasks aren&apos;t re-listed here</div>
            <div className="mt-1.5 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>{actions?.counts.completedThisWeek ?? 0} completed this week — see the KPI tile above.</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center" style={{ padding: "52px 18px" }}>
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No open staff tasks</div>
            <div className="mt-1.5 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Nothing matches these filters.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 1000 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Task</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Assigned to</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Source</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Priority</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Due</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Age</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it) => {
                  const who = staffList.find((s) => s.id === it.assigneeStaffId)?.name ?? "Unassigned";
                  return (
                    <tr key={it.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                      <td style={{ padding: "12px 17px" }}>
                        <p className="m-0 text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{it.title}</p>
                        <p className="m-0 text-[11px]" style={{ color: "var(--app-text-faint)" }}>{it.reason}</p>
                      </td>
                      <td style={{ padding: 12, fontSize: 12, color: "var(--app-text-faint)" }}>{who}</td>
                      <td style={{ padding: 12, fontSize: 12, color: "var(--app-text-faint)" }}>{SOURCE_LABEL[it.type]}</td>
                      <td style={{ padding: 12 }}><Chip label={PRIORITY_LABEL[it.priority]} /></td>
                      <td style={{ padding: 12 }}><Chip label={dueLabel(it)} /></td>
                      <td style={{ padding: 12, fontSize: 12, color: "var(--app-text-disabled)" }}>{formatRelativeTime(it.ageMs)}</td>
                      <td style={{ padding: "12px 17px", textAlign: "right" }}>
                        <div className="flex justify-end gap-1.5">
                          <button type="button" onClick={() => router.push(it.deepLink)} className="rounded-[9px] text-[11.5px] font-bold" style={{ ...outlineBtnStyle, minHeight: 34, padding: "6px 10px" }}>Open</button>
                          <button type="button" onClick={() => completeMutation.mutate(it.id)} disabled={completeMutation.isPending} className="rounded-[9px] text-[11.5px] font-extrabold text-white" style={{ ...primaryBtnStyle(), minHeight: 34, padding: "6px 10px" }}>Complete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DisclosureNote>Tasks are the same records as the Dashboard Action Center — completing one here clears it there too.</DisclosureNote>
    </main>
  );
}
