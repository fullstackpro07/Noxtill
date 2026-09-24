"use client";

import { useMemo } from "react";
import {
  aiFinished,
  aiResolved,
  dayMinus,
  fmtDuration,
  hourBars,
  intentBars,
  needsFollowUp,
  sliceDay,
} from "@/lib/receptionist-derive";
import { Card, EmptyState, Footnote, KpiCard, BarRow, TableWrap, Th, kpiGrid } from "../rx-ui";
import { useRx } from "../rx-data";
import { useRxStore } from "../rx-store";
import { RxGate } from "../rx-gate";

export function AnalyticsScreen() {
  return (
    <RxGate>
      <Analytics />
    </RxGate>
  );
}

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");

function Analytics() {
  const rx = useRx();
  const notify = useRxStore((s) => s.notify);
  const t = useMemo(() => sliceDay(rx.calls, rx.today), [rx.calls, rx.today]);
  const y = useMemo(() => sliceDay(rx.calls, dayMinus(rx.today, 1)), [rx.calls, rx.today]);
  const bars = useMemo(() => hourBars(rx.calls, rx.today), [rx.calls, rx.today]);
  const intents = useMemo(() => intentBars(rx.calls), [rx.calls]);
  const maxBar = Math.max(1, ...bars.map((b) => b.answered + b.missed));
  const maxIntent = Math.max(1, ...intents.map((i) => i.count));
  const followUps = rx.calls.filter(needsFollowUp);
  const answeredRate = pct(t.answered.length, t.calls.length);
  const yAnsweredRate = y.calls.length ? Math.round((y.answered.length / y.calls.length) * 100) : null;
  const aiHandled = aiFinished(t).length;

  const delta = (now: number, prev: number) => (now === prev ? "same as yesterday" : `${now > prev ? "+" : "−"}${Math.abs(now - prev)} vs yesterday`);
  const kpis: { label: string; value: string; sub: string; tone: "neutral" | "green" | "red" | "amber"; color?: string }[] = [
    { label: "Calls", value: String(t.calls.length), sub: delta(t.calls.length, y.calls.length), tone: "neutral", color: t.calls.length >= y.calls.length ? "#15803D" : "#B42318" },
    { label: "Answered rate", value: answeredRate, sub: t.calls.length && yAnsweredRate != null ? `${Math.round((t.answered.length / t.calls.length) * 100) - yAnsweredRate >= 0 ? "+" : "−"}${Math.abs(Math.round((t.answered.length / t.calls.length) * 100) - yAnsweredRate)} pts vs yesterday` : "vs yesterday: no data", tone: "green" },
    { label: "Missed rate", value: pct(t.missed.length, t.calls.length), sub: `${t.missed.length} call${t.missed.length === 1 ? "" : "s"}`, tone: t.missed.length ? "red" : "neutral" },
    { label: "AI resolution", value: pct(aiResolved(t).length, aiHandled), sub: "of AI-handled calls", tone: "green" },
    { label: "Transfer rate", value: pct(t.transferred.length, aiHandled), sub: "of AI-handled calls", tone: "neutral" },
    { label: "Average duration", value: t.avgDuration != null ? fmtDuration(t.avgDuration) : "—", sub: y.avgDuration != null && t.avgDuration != null ? `${t.avgDuration - y.avgDuration >= 0 ? "+" : "−"}${Math.abs(t.avgDuration - y.avgDuration)} s vs yesterday` : "no finished calls", tone: "neutral" },
    { label: "Bookings", value: String(t.booked.length), sub: t.calls.length ? `${pct(t.booked.length, t.calls.length)} of calls` : "no calls", tone: "green" },
    { label: "Leads", value: String(t.leads.length), sub: t.newCallers.length ? `${pct(t.leads.length, t.newCallers.length)} of new callers` : "no new callers", tone: "green" },
    { label: "Callbacks", value: String(followUps.length), sub: `${followUps.filter((c) => !c.assignedToUserId).length} unassigned`, tone: followUps.length ? "amber" : "neutral" },
  ];

  // Staff: only people the call log actually names — someone who joined a live call, or owns a follow-up.
  const staffRows = useMemo(() => {
    const m = new Map<string, { name: string; joined: number; assigned: number; handled: number; secs: number; timed: number }>();
    for (const c of rx.calls) {
      if (c.joinedByUserId && c.joinedByName) {
        const r = m.get(c.joinedByUserId) ?? { name: c.joinedByName, joined: 0, assigned: 0, handled: 0, secs: 0, timed: 0 };
        r.joined += 1;
        if (c.durationSeconds != null) {
          r.secs += c.durationSeconds;
          r.timed += 1;
        }
        m.set(c.joinedByUserId, r);
      }
      if (c.assignedToUserId && c.assignedToName) {
        const r = m.get(c.assignedToUserId) ?? { name: c.assignedToName, joined: 0, assigned: 0, handled: 0, secs: 0, timed: 0 };
        r.assigned += 1;
        if (c.resolvedAt) r.handled += 1;
        m.set(c.assignedToUserId, r);
      }
    }
    return [...m.values()].sort((a, b) => b.joined + b.assigned - (a.joined + a.assigned));
  }, [rx.calls]);

  return (
    <div className="flex flex-col gap-[18px]">
      <div style={kpiGrid(150)}>
        {kpis.map((k) => (
          <KpiCard key={k.label} label={k.label} value={k.value} sub={k.sub} tone={k.tone} subColor={k.color} onClick={() => notify(`${k.label} · ${k.value}`, k.sub)} />
        ))}
      </div>

      <div className="grid items-start gap-[18px]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))" }}>
        <Card pad={17}>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="text-[14px] font-extrabold">Calls by hour</div>
            <div className="ml-auto text-[11px] text-[#94A3B8]">Today · {t.calls.length} call{t.calls.length === 1 ? "" : "s"}</div>
          </div>
          <div className="mt-4 flex h-[150px] items-end gap-[5px]">
            {bars.map((b) => {
              const total = b.answered + b.missed;
              const h = (total / maxBar) * 100;
              return (
                <div
                  key={b.hour}
                  onClick={() => notify(`${b.label}${b.hour < 12 ? " AM" : " PM"}`, `${b.answered} answered${b.missed ? ` · ${b.missed} missed` : ""}`)}
                  className="flex h-full flex-1 cursor-pointer flex-col items-center justify-end gap-[5px]"
                >
                  <div className="flex h-full w-full flex-col justify-end gap-0.5">
                    {b.missed ? <div style={{ height: `${(b.missed / Math.max(1, total)) * h}%`, background: "#DC2626", borderRadius: "4px 4px 0 0" }} /> : null}
                    {b.answered ? <div style={{ height: `${(b.answered / Math.max(1, total)) * h}%`, background: "#16A34A", borderRadius: b.missed ? "0 0 4px 4px" : 4 }} /> : null}
                  </div>
                  <div className="text-[9px] text-[#94A3B8]">{b.label}</div>
                </div>
              );
            })}
          </div>
          <div className="mt-[13px] flex flex-wrap gap-3 border-t border-[#EEF0F3] pt-3">
            <span className="inline-flex items-center gap-[5px] text-[11px] font-semibold text-[#5B6675]"><span className="h-2 w-2 rounded-[2px] bg-[#16A34A]" />Answered</span>
            <span className="inline-flex items-center gap-[5px] text-[11px] font-semibold text-[#5B6675]"><span className="h-2 w-2 rounded-[2px] bg-[#DC2626]" />Missed</span>
            <span className="ml-auto text-[10.5px] text-[#94A3B8]">Hours are on your business&apos;s own clock.</span>
          </div>
        </Card>

        <Card pad={17}>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="text-[14px] font-extrabold">Intent breakdown</div>
            <div className="ml-auto text-[11px] text-[#94A3B8]">Last 30 days · {rx.calls.length} call{rx.calls.length === 1 ? "" : "s"}</div>
          </div>
          <div className="mt-[15px] flex flex-col gap-[11px]">
            {intents.length === 0 ? (
              <div className="py-6 text-center text-[12px] text-[#94A3B8]">No calls yet.</div>
            ) : (
              intents.map((i) => <BarRow key={i.label} label={i.label} sub={i.detail} value={String(i.count)} widthPct={(i.count / maxIntent) * 100} color={i.color} onClick={() => notify(`${i.label} · ${i.count} call${i.count === 1 ? "" : "s"}`, i.detail)} />)
            )}
          </div>
        </Card>
      </div>

      <Card overflow>
        <div className="flex flex-wrap items-center gap-2.5 border-b border-[#EEF0F3] px-[18px] py-3.5">
          <div className="text-[13.5px] font-extrabold">Staff call handling</div>
          <div className="text-[11px] text-[#94A3B8]">Only what the call log names — several measures, never a single ranking</div>
        </div>
        {staffRows.length === 0 ? (
          <EmptyState icon="users-round" title="No staff activity on calls yet" body="A team member appears here once they join a live call, or once a follow-up is assigned to them." />
        ) : (
          <TableWrap
            minWidth={940}
            head={
              <>
                <Th>Staff</Th>
                <Th align="center">Live calls joined</Th>
                <Th align="center">Follow-ups assigned</Th>
                <Th align="center">Average duration</Th>
                <Th align="center">Handled</Th>
                <Th>Context</Th>
              </>
            }
          >
            {staffRows.map((r) => (
              <tr key={r.name} onClick={() => notify(r.name, `${r.joined} live call${r.joined === 1 ? "" : "s"} joined · ${r.assigned} follow-up${r.assigned === 1 ? "" : "s"} assigned`)} className="cursor-pointer border-b border-[#F3F4F7] hover:bg-[#FAFBFC]!">
                <td className="py-[11px] pl-[18px] pr-3 text-[12px] font-bold">{r.name}</td>
                <td className="px-3 py-[11px] text-center text-[11.5px] tabular-nums">{r.joined}</td>
                <td className="px-3 py-[11px] text-center text-[11.5px] tabular-nums">{r.assigned}</td>
                <td className="px-3 py-[11px] text-center text-[11.5px] tabular-nums">{r.timed ? fmtDuration(Math.round(r.secs / r.timed)) : "—"}</td>
                <td className="px-3 py-[11px] text-center">
                  {r.assigned ? <span className="inline-flex h-5 items-center rounded-[6px] bg-[#ECFDF3] px-[7px] text-[11px] font-extrabold text-[#15803D]">{r.handled} of {r.assigned}</span> : <span className="text-[11px] text-[#94A3B8]">—</span>}
                </td>
                <td className="max-w-[240px] py-[11px] pl-3 pr-[18px] text-[11px] text-[#7A8798]">
                  {r.joined ? `Joined ${r.joined} live call${r.joined === 1 ? "" : "s"} (listen in or take over).` : ""} {r.assigned ? `Owns ${r.assigned} follow-up${r.assigned === 1 ? "" : "s"}.` : ""}
                </td>
              </tr>
            ))}
          </TableWrap>
        )}
        <Footnote>A long average on calls a person joined is expected — people are brought in for the hard ones. The context is shown so no number is read as performance on its own.</Footnote>
      </Card>
    </div>
  );
}
