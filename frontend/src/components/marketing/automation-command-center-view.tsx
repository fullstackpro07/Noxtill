"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { fetchAutomationCommandCenter } from "@/lib/automation-command-center-api";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function Kpi({ label, value, hint, tone, href }: { label: string; value: ReactNode; hint: string; tone?: "warning" | "danger" | "good"; href?: string }) {
  const color = tone === "danger" ? "var(--app-danger-strong)" : tone === "warning" ? "var(--app-warning-text)" : tone === "good" ? "var(--app-success-text)" : "var(--app-text)";
  const body = (
    <>
      <p className="m-0 text-xs font-semibold" style={{ color: "var(--app-text-faint)" }}>{label}</p>
      <p className="m-0 mt-1 text-2xl font-bold" style={{ color }}>{value}</p>
      <p className="m-0 mt-1 text-xs" style={{ color: "var(--app-text-faintest)" }}>{hint}</p>
    </>
  );
  const style = { borderColor: "var(--app-border)", background: "var(--app-surface)" };
  return href ? (
    <Link href={href} className="rounded-xl border p-4" style={style}>{body}</Link>
  ) : (
    <div className="rounded-xl border p-4" style={style}>{body}</div>
  );
}

function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-2xl border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="m-0 text-sm font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function AutomationCommandCenterView() {
  const query = useQuery({ queryKey: ["automation-command-center"], queryFn: fetchAutomationCommandCenter, refetchInterval: 60_000 });
  const data = query.data;

  if (query.isLoading) return <main className="p-5 text-sm md:p-7" style={{ color: "var(--app-text-faint)" }}>Loading…</main>;
  if (query.isError || !data) {
    return (
      <main className="flex items-center gap-3 p-5 text-sm md:p-7" style={{ color: "var(--app-danger-strong)" }}>
        {errorMessage(query.error, "Couldn't load the command center.")}
        <button type="button" onClick={() => query.refetch()} className="font-bold underline">Retry</button>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-5 p-5 md:p-7" style={{ color: "var(--app-text)" }}>
      {data.attention.length > 0 ? (
        <section className="flex flex-col gap-1.5 rounded-2xl border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
          <p className="m-0 text-sm font-bold">Needs attention</p>
          {data.attention.map((item) => (
            <Link key={item.key} href={item.href} className="text-xs font-semibold underline" style={{ color: item.tone === "red" ? "var(--app-danger-strong)" : "var(--app-warning-text)" }}>
              {item.text}
            </Link>
          ))}
        </section>
      ) : (
        <p className="m-0 rounded-xl border px-4 py-3 text-xs font-semibold" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)", color: "var(--app-success-text)" }}>
          Nothing needs attention right now.
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
        <Kpi label="Active workflows" value={data.workflows.active} hint={`${data.workflows.paused} paused`} href="/marketing/automations" />
        <Kpi label="Runs · 24 h" value={data.runs24h.total} hint={`${data.runs24h.success} succeeded · ${data.runs24h.skipped} skipped`} href="/marketing/automations/executions" />
        <Kpi label="Runs this month" value={`${data.runsThisMonth.count} / ${data.runsThisMonth.limit ?? "No limit"}`} hint="Runs that weren't skipped, this calendar month (UTC)" href="/marketing/automations/executions" />
        <Kpi label="Failure rate · 24 h" value={data.runs24h.failureRatePct === null ? "—" : `${data.runs24h.failureRatePct}%`} hint={`${data.runs24h.failed} failed`} tone={data.runs24h.failed > 0 ? "danger" : "good"} href="/marketing/automations/executions" />
        <Kpi label="Waiting runs" value={data.waiting} hint={data.overdueWaits ? `${data.overdueWaits} past resume time` : "Durable waits in progress"} tone={data.overdueWaits ? "warning" : undefined} />
        <Kpi label="Approvals waiting" value={data.pendingApprovals} hint="Human decisions needed" tone={data.pendingApprovals ? "warning" : undefined} href="/marketing/automations/approvals" />
        <Kpi label="Recovery items" value={data.openDeadLetters} hint="Exhausted runs to resolve" tone={data.openDeadLetters ? "danger" : undefined} href="/marketing/automations/recovery" />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Recent failures (24 h)" action={<Link href="/marketing/automations/executions" className="text-xs font-bold underline">All runs</Link>}>
          {data.recentFailures.length === 0 ? (
            <p className="m-0 text-xs" style={{ color: "var(--app-text-faint)" }}>No failed runs in the last 24 hours.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-xs">
              {data.recentFailures.map((row) => (
                <li key={row.id}>
                  <span className="font-semibold">{row.workflow}</span> · {formatDate(row.createdAt)}
                  <span className="block" style={{ color: "var(--app-danger-strong)" }}>{row.error ?? "No error recorded"}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Oldest approvals" action={<Link href="/marketing/automations/approvals" className="text-xs font-bold underline">Approvals</Link>}>
          {data.oldestApprovals.length === 0 ? (
            <p className="m-0 text-xs" style={{ color: "var(--app-text-faint)" }}>No approvals waiting.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-xs">
              {data.oldestApprovals.map((row) => (
                <li key={row.id}>
                  <span className="font-semibold">{row.title}</span> · {row.workflow}
                  <span className="block" style={{ color: "var(--app-text-faint)" }}>Waiting since {formatDate(row.requestedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Next scheduled runs" action={<Link href="/marketing/automations/schedules" className="text-xs font-bold underline">Schedules</Link>}>
          {data.upcoming.length === 0 ? (
            <p className="m-0 text-xs" style={{ color: "var(--app-text-faint)" }}>No active scheduled workflows.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs">
              {data.upcoming.map((row) => (
                <li key={row.id}><span className="font-semibold">{row.name}</span> · {new Date(row.nextScheduleAt).toLocaleString()}</li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Automation queue (shared)">
          {!data.queue.reachable || !data.queue.counts ? (
            <p className="m-0 text-xs font-semibold" style={{ color: "var(--app-danger-strong)" }}>Unreachable — scheduled workflows and waits can&rsquo;t resume until Redis is back.</p>
          ) : (
            <>
              <div className="grid grid-cols-5 gap-2 text-center text-xs">
                {(["waiting", "active", "delayed", "failed", "completed"] as const).map((key) => (
                  <div key={key} className="rounded-lg p-2" style={{ background: "var(--app-surface-2)" }}>
                    <p className="m-0 text-lg font-bold">{data.queue.counts![key]}</p>
                    <p className="m-0" style={{ color: "var(--app-text-faint)" }}>{key}</p>
                  </div>
                ))}
              </div>
              <p className="m-0 mt-2 text-[11px]" style={{ color: "var(--app-text-faintest)" }}>Platform-wide schedule queue counts, not just this business.</p>
            </>
          )}
        </Panel>
      </div>

      <p className="m-0 text-xs" style={{ color: "var(--app-text-faint)" }}>
        Not tracked: {data.notTracked.join(" · ")}. Updated {new Date(data.capturedAt).toLocaleTimeString()}.
      </p>
    </main>
  );
}
