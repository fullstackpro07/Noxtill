"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { fetchAutomationSchedules } from "@/lib/automation-command-center-api";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

const when = (value: string | null) => (value ? new Date(value).toLocaleString() : "—");

export function AutomationSchedulesView() {
  const query = useQuery({ queryKey: ["automation-schedules"], queryFn: fetchAutomationSchedules, refetchInterval: 60_000 });
  const data = query.data;

  if (query.isLoading) return <main className="p-5 text-sm md:p-7" style={{ color: "var(--app-text-faint)" }}>Loading…</main>;
  if (query.isError || !data) {
    return (
      <main className="flex items-center gap-3 p-5 text-sm md:p-7" style={{ color: "var(--app-danger-strong)" }}>
        {errorMessage(query.error, "Couldn't load schedules.")}
        <button type="button" onClick={() => query.refetch()} className="font-bold underline">Retry</button>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-5 p-5 md:p-7" style={{ color: "var(--app-text)" }}>
      <section className="rounded-2xl border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-sm font-bold">Automation queue</h2>
          <span className="text-xs" style={{ color: "var(--app-text-faint)" }}>Shared by all businesses · updated {new Date(data.capturedAt).toLocaleTimeString()}</span>
        </div>
        {!data.queue.reachable || !data.queue.counts ? (
          <p className="m-0 mt-2 text-xs font-semibold" style={{ color: "var(--app-danger-strong)" }}>Redis is unreachable — scheduled workflows and waits can&rsquo;t resume until it&rsquo;s back.</p>
        ) : (
          <div className="mt-2 grid grid-cols-5 gap-2 text-center text-xs">
            {(["waiting", "active", "delayed", "failed", "completed"] as const).map((key) => (
              <div key={key} className="rounded-lg p-2" style={{ background: "var(--app-surface-2)" }}>
                <p className="m-0 text-lg font-bold">{data.queue.counts![key]}</p>
                <p className="m-0" style={{ color: "var(--app-text-faint)" }}>{key}</p>
              </div>
            ))}
          </div>
        )}
        <ul className="m-0 mt-3 list-disc ps-5 text-xs" style={{ color: "var(--app-text-muted)" }}>
          {data.fixed.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </section>

      <section className="rounded-2xl border" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
        <p className="m-0 px-4 pt-3 text-sm font-bold">Scheduled workflows ({data.scheduled.length})</p>
        {data.scheduled.length === 0 ? (
          <p className="m-0 p-4 text-sm" style={{ color: "var(--app-text-faint)" }}>
            No scheduled workflows. <Link href="/marketing/automations" className="font-bold underline">Create one</Link> with a schedule trigger.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead style={{ color: "var(--app-text-faint)" }}>
                <tr>{["Workflow", "Rule", "Timezone", "Next run", "Last scheduled", "Last run"].map((heading) => <th key={heading} className="px-4 py-2 font-semibold">{heading}</th>)}</tr>
              </thead>
              <tbody>
                {data.scheduled.map((row) => (
                  <tr key={row.id} className="border-t" style={{ borderColor: "var(--app-border)" }}>
                    <td className="px-4 py-2 font-semibold">{row.name}{!row.active && <span className="ms-2 font-normal" style={{ color: "var(--app-text-faint)" }}>paused</span>}</td>
                    <td className="px-4 py-2 font-mono">{row.rule}</td>
                    <td className="px-4 py-2">{row.timezone}</td>
                    <td className="px-4 py-2" style={{ color: row.overdue ? "var(--app-danger-strong)" : undefined }}>{row.active ? when(row.nextScheduleAt) : "—"}{row.overdue ? " · overdue" : ""}</td>
                    <td className="px-4 py-2">{when(row.lastScheduledAt)}</td>
                    <td className="px-4 py-2">{row.lastRun ? `${row.lastRun.status} · ${formatDate(row.lastRun.createdAt)}` : "Never run"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
        <p className="m-0 px-4 pt-3 text-sm font-bold">Durable waits in progress ({data.waits.length})</p>
        {data.waits.length === 0 ? (
          <p className="m-0 p-4 text-sm" style={{ color: "var(--app-text-faint)" }}>No run is waiting.</p>
        ) : (
          <ul className="m-0 mt-2 flex list-none flex-col p-0 text-xs">
            {data.waits.map((row) => (
              <li key={row.id} className="flex flex-wrap justify-between gap-2 border-t px-4 py-2" style={{ borderColor: "var(--app-border)" }}>
                <span><span className="font-semibold">{row.workflow}</span> · started {formatDate(row.startedAt)}</span>
                <span style={{ color: row.overdue ? "var(--app-danger-strong)" : "var(--app-text-muted)" }}>
                  {row.waitingUntil ? `Resumes ${when(row.waitingUntil)}` : "Waiting for approval"}{row.overdue ? " · past resume time" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
