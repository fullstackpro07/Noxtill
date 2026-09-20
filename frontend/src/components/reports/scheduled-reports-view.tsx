"use client";

import { useMemo, useState, type MouseEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { fetchReportsLibrary } from "@/lib/reports-api";
import { REPORT_KIND_LABELS } from "@/lib/reports";
import { fetchScheduledExports, runScheduleNow, updateScheduledExport, type LiveScheduledExport } from "@/lib/scheduled-exports-api";
import {
  BannerCard,
  ErrorCard,
  Kpi,
  KpiGrid,
  KpiSkeletons,
  R,
  RIcon,
  WEEKDAYS,
  cardShellStyle,
  chipStyle,
  filterBtnStyle,
  hourLabel,
  ordinal,
  primaryBtnStyle,
  relativeDateTime,
  smallBtnStyle,
  thStyle,
} from "./reports-ui";
import { useActiveBusinessName, useReports } from "./reports-context";

function scheduleName(s: LiveScheduledExport): string {
  return s.reportKind ? REPORT_KIND_LABELS[s.reportKind] : `${s.kind ?? "Data"} export`;
}

function frequencyText(s: LiveScheduledExport): string {
  const day = s.frequency === "weekly" ? (s.dayOfWeek !== null ? WEEKDAYS[s.dayOfWeek] : null) : s.dayOfMonth !== null ? ordinal(s.dayOfMonth) : null;
  return `${s.frequency === "weekly" ? "Weekly" : "Monthly"}${day ? ` · ${day}` : ""} ${hourLabel(s.runHour)}`;
}

function recipientsText(s: LiveScheduledExport): string {
  if (s.recipients.length === 0) return "You (in Noxtill)";
  return s.recipients.map((r) => r.label ?? r.email ?? r.phone).join(" · ");
}

function channelOf(s: LiveScheduledExport): { label: string; icon: string } {
  const hasEmail = s.recipients.some((r) => r.email);
  const hasPhone = s.recipients.some((r) => r.phone);
  if (hasEmail && hasPhone) return { label: "Email + phone", icon: "mail" };
  if (hasEmail) return { label: "Email", icon: "mail" };
  if (hasPhone) return { label: "Phone", icon: "message-circle" };
  return { label: "In-app", icon: "circle-check" };
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const active = value !== "all";
  return (
    <label style={{ ...filterBtnStyle, position: "relative", borderColor: active ? R.green : R.btnBorder, background: active ? R.greenSoft : "#fff" }}>
      <span>{label}</span>
      <RIcon name="chevron-down" size={13} style={{ color: R.label }} />
      <select aria-label={`Filter by ${label.toLowerCase()}`} value={value} onChange={(e) => onChange(e.target.value)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ScheduledReportsView() {
  const { openPanel, openConfirm, notify, period } = useReports();
  const branch = useActiveBusinessName();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["reports", "schedules"], queryFn: fetchScheduledExports });
  const lib = useQuery({ queryKey: ["reports", "library", period], queryFn: () => fetchReportsLibrary(period) });
  const [report, setReport] = useState("all");
  const [frequency, setFrequency] = useState("all");
  const [channel, setChannel] = useState("all");
  const [status, setStatus] = useState("all");

  const all = useMemo(() => (q.data ?? []).filter((s) => s.reportKind), [q.data]);
  const rows = useMemo(
    () =>
      all.filter((s) => {
        if (report !== "all" && s.reportKind !== report) return false;
        if (frequency !== "all" && s.frequency !== frequency) return false;
        if (channel !== "all" && channelOf(s).label !== channel) return false;
        if (status === "active" && !s.active) return false;
        if (status === "paused" && s.active) return false;
        if (status === "failed" && s.lastResult !== "failed") return false;
        return true;
      }),
    [all, report, frequency, channel, status],
  );

  const refresh = () => qc.invalidateQueries({ queryKey: ["reports"] });
  const toggle = useMutation({
    mutationFn: (s: LiveScheduledExport) => updateScheduledExport(s.id, { active: !s.active }),
    onSuccess: (_r, s) => {
      void refresh();
      notify(`${s.active ? "Paused" : "Resumed"} · ${scheduleName(s)}`, s.active ? "Future runs stop. History and the schedule are kept." : "It will run on its next scheduled day.");
    },
    onError: (e) => notify("Couldn't update the schedule", e instanceof ApiError ? e.message : "Please try again."),
  });

  const runNow = (s: LiveScheduledExport) =>
    openConfirm({
      title: `Run ${scheduleName(s)} now?`,
      tone: "green",
      icon: "history",
      body: "This generates one report immediately and delivers it to the configured recipients. Future scheduled days still run as planned.",
      rows: [
        { label: "Report", value: scheduleName(s) },
        { label: "Period covered", value: s.periodLabel ?? "—" },
        { label: "Recipients", value: recipientsText(s) },
        { label: "Channel", value: channelOf(s).label },
        { label: "Next scheduled run", value: s.nextRunAt ? relativeDateTime(s.nextRunAt) : "Paused" },
      ],
      primary: "Generate once",
      cancel: "Cancel",
      onConfirm: async () => {
        try {
          const r = await runScheduleNow(s.id);
          void refresh();
          if (r.ok) notify(`${scheduleName(s)} generated`, "Recorded as a new version and delivered.");
          else notify(`${scheduleName(s)} failed`, r.lastError ?? "The run failed.");
        } catch (e) {
          notify("Couldn't run the schedule", e instanceof ApiError ? e.message : "Please try again.");
        }
      },
    });

  if (q.isError) return <ErrorCard message={q.error instanceof ApiError ? q.error.message : "Schedules could not be loaded."} onRetry={() => void q.refetch()} />;

  const active = all.filter((s) => s.active);
  const paused = all.filter((s) => !s.active);
  const failed = all.filter((s) => s.lastResult === "failed");
  const next = active
    .filter((s) => s.nextRunAt)
    .sort((a, b) => (a.nextRunAt as string).localeCompare(b.nextRunAt as string))[0];
  const stop = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  const firstFailed = failed[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {!q.data ? (
        <KpiSkeletons count={5} min={165} />
      ) : (
        <KpiGrid min={165}>
          <Kpi label="Active schedules" value={String(active.length)} meta={`${paused.length} paused`} />
          <Kpi label="Paused" value={String(paused.length)} meta={paused.length ? paused.map(scheduleName).join(", ") : "none paused"} tone={paused.length ? "amber" : "neutral"} compact={paused.length > 0 && String(paused.length).length > 10} />
          <Kpi label="Runs this month" value={String(lib.data?.kpis.automatedThisMonth ?? 0)} meta="generated by schedule" />
          <Kpi label="Next delivery" value={next?.nextRunAt ? relativeDateTime(next.nextRunAt) : "—"} meta={next ? `${scheduleName(next)} · ${channelOf(next).label}` : "nothing scheduled"} compact />
          <Kpi label="Failed runs" value={String(failed.length)} meta={failed.length ? failed.map(scheduleName).join(", ") : "last run of every schedule succeeded"} tone={failed.length ? "red" : "neutral"} />
        </KpiGrid>
      )}

      {firstFailed ? (
        <BannerCard
          tone="red"
          icon="circle-alert"
          title={`${scheduleName(firstFailed)} failed to generate`}
          text={`${firstFailed.lastError ?? "The last run failed."} The report was not sent, and nothing was estimated in its place.`}
        >
          <button type="button" onClick={() => openPanel({ type: "schedule", id: firstFailed.id })} style={smallBtnStyle}>
            View failure
          </button>
          <button type="button" onClick={() => runNow(firstFailed)} style={{ ...primaryBtnStyle }}>
            Retry
          </button>
        </BannerCard>
      ) : null}

      <div style={{ ...cardShellStyle, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Schedules</div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 7, flexWrap: "wrap" }}>
            <FilterSelect label="Report" value={report} onChange={setReport} options={[{ value: "all", label: "All reports" }, ...[...new Set(all.map((s) => s.reportKind as string))].map((k) => ({ value: k, label: REPORT_KIND_LABELS[k as keyof typeof REPORT_KIND_LABELS] ?? k }))]} />
            <FilterSelect label="Frequency" value={frequency} onChange={setFrequency} options={[{ value: "all", label: "Any frequency" }, { value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }]} />
            <FilterSelect label="Channel" value={channel} onChange={setChannel} options={[{ value: "all", label: "Any channel" }, ...[...new Set(all.map((s) => channelOf(s).label))].map((c) => ({ value: c, label: c }))]} />
            <FilterSelect label="Status" value={status} onChange={setStatus} options={[{ value: "all", label: "Any status" }, { value: "active", label: "Active" }, { value: "paused", label: "Paused" }, { value: "failed", label: "Last run failed" }]} />
            <button type="button" onClick={() => openPanel({ type: "schedule-new" })} style={primaryBtnStyle}>
              <RIcon name="plus" size={14} strokeWidth={2.25} />
              New schedule
            </button>
          </div>
        </div>
        <div className="nx-scroll" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 1240, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#FAFBFC", borderTop: `1px solid ${R.divider}`, borderBottom: `1px solid ${R.border}` }}>
                {["Report", "Frequency", "Branch", "Recipients", "Channel", "Format", "Next run", "Last run", "Last result"].map((h, i) => (
                  <th key={h} style={{ ...thStyle("left"), paddingLeft: i === 0 ? 18 : 12 }}>
                    {h}
                  </th>
                ))}
                <th style={{ ...thStyle("right"), paddingRight: 18 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!q.data ? (
                <tr>
                  <td colSpan={10} style={{ padding: 28, textAlign: "center", fontSize: 12.5, color: R.faint }}>
                    Loading schedules…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: "34px 18px", textAlign: "center", fontSize: 12.5, color: R.muted }}>
                    {all.length === 0 ? "No report is scheduled yet. Use “New schedule” to have a report generated and delivered automatically." : "No schedule matches these filters."}
                  </td>
                </tr>
              ) : (
                rows.map((s) => {
                  const ch = channelOf(s);
                  const bad = s.lastResult === "failed";
                  return (
                    <tr key={s.id} onClick={() => openPanel({ type: "schedule", id: s.id })} style={{ borderBottom: `1px solid ${R.rowLine}`, cursor: "pointer", background: bad ? "#FEFBFB" : "#fff" }}>
                      <td style={{ padding: "11px 12px 11px 18px" }}>
                        <div style={{ fontSize: 12.5, fontWeight: 700 }}>{scheduleName(s)}</div>
                        <div style={{ fontSize: 10, color: R.faint, marginTop: 2 }}>{s.periodLabel ?? "—"}</div>
                      </td>
                      <td style={{ padding: "11px 12px", fontSize: 12, color: R.text }}>{frequencyText(s)}</td>
                      <td style={{ padding: "11px 12px", fontSize: 12, color: R.text }}>{branch}</td>
                      <td style={{ padding: "11px 12px", fontSize: 11.5, color: R.text }}>{recipientsText(s)}</td>
                      <td style={{ padding: "11px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <RIcon name={ch.icon} size={13} style={{ color: R.text }} />
                          <span style={{ fontSize: 12, color: R.text }}>{ch.label}</span>
                        </div>
                      </td>
                      <td style={{ padding: "11px 12px", fontSize: 11.5, color: R.text }}>{s.format.toUpperCase()}</td>
                      <td style={{ padding: "11px 12px", fontSize: 11.5, fontWeight: 700 }}>{s.active ? (s.nextRunAt ? relativeDateTime(s.nextRunAt) : "—") : "Paused"}</td>
                      <td style={{ padding: "11px 12px", fontSize: 11.5, color: R.faint }}>{s.lastRunAt ? relativeDateTime(s.lastRunAt) : "Never"}</td>
                      <td style={{ padding: "11px 12px" }}>
                        <span style={chipStyle(bad ? "red" : s.lastResult === "sent" ? "green" : "neutral", { height: 21, fontSize: 10 })}>
                          <RIcon name={bad ? "circle-alert" : s.lastResult === "sent" ? "circle-check" : "clock-3"} size={11} />
                          {bad ? "Failed" : s.lastResult === "sent" ? "Sent" : "Not run yet"}
                        </span>
                      </td>
                      <td style={{ padding: "11px 18px 11px 12px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 6 }}>
                          <button type="button" onClick={stop(() => runNow(s))} style={smallBtnStyle}>
                            Run now
                          </button>
                          <button type="button" disabled={toggle.isPending} onClick={stop(() => toggle.mutate(s))} style={{ ...smallBtnStyle, display: "inline-flex" }}>
                            {s.active ? "Pause" : "Resume"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "12px 18px", borderTop: `1px solid ${R.divider}`, background: "#FCFCFD", fontSize: 11, color: R.faint }}>
          Every schedule runs at {hourLabel(6)} server time. Run now generates and delivers one report immediately; future scheduled days still run. A failed run keeps its reason and is retried by the next daily check.
        </div>
      </div>
    </div>
  );
}
