"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { TOPIC_LABELS } from "@/lib/voice-calls-api";
import { needsFollowUp, pct, sliceDay, type Tone } from "@/lib/receptionist-derive";
import { Card, Chip, EmptyState, Footnote, KpiCard, SmallBtn, TableWrap, Th, kpiGrid } from "../rx-ui";
import { useRx } from "../rx-data";
import { useRxStore } from "../rx-store";
import { RxGate } from "../rx-gate";

export function QualityScreen() {
  return (
    <RxGate>
      <Quality />
    </RxGate>
  );
}

interface Signal {
  severity: "High" | "Medium" | "Low";
  tone: Tone;
  signal: string;
  evidence: string;
  count: number;
  period: string;
  action: string;
  go: () => void;
}

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

function Quality() {
  const rx = useRx();
  const router = useRouter();
  const openCall = useRxStore((s) => s.openCall);
  const notify = useRxStore((s) => s.notify);
  const maxTurns = rx.insights?.limits.maxCallTurns ?? 8;

  const t = useMemo(() => sliceDay(rx.calls, rx.today), [rx.calls, rx.today]);
  const all = rx.calls;
  const followUps = all.filter(needsFollowUp);
  const aiHandled = all.filter((c) => (c.handledBy === "ai" && c.status !== "in_progress") || c.handledBy === "ai_to_human");
  const resolvedByAi = all.filter((c) => c.handledBy === "ai" && c.status === "completed" && !needsFollowUp(c));
  const transfers = all.filter((c) => c.handledBy === "ai_to_human");
  const missed = all.filter((c) => c.status === "missed");
  const capped = all.filter((c) => c.transcript.length >= maxTurns);
  const noRecording = all.filter((c) => c.status === "completed" && !c.hasRecording && !c.recordingDeletedAt);
  const lowConf = all.filter((c) => (c.analysis?.lowConfidenceTurns ?? 0) > 0);
  const upset = all.filter((c) => c.analysis?.sentiment === "frustrated" || c.analysis?.sentiment === "negative");
  const complaints = all.filter((c) => c.analysis?.topic === "complaint");
  const declinedTotal = all.reduce((n, c) => n + (c.analysis?.declinedCount ?? 0), 0);

  // Callers who rang more than once today.
  const perNumber = new Map<string, number>();
  for (const c of t.calls) perNumber.set(c.fromNumber, (perNumber.get(c.fromNumber) ?? 0) + 1);
  const repeatToday = [...perNumber.values()].filter((n) => n >= 2).length;

  const day = 86_400_000;
  const stale = followUps.filter((c) => rx.now.getTime() - new Date(c.startedAt).getTime() > day);
  const uncalled = missed.filter((c) => !c.resolvedAt && !c.callbackRequestedAt);
  const topGap = [...rx.clusters].filter((c) => c.declined > 0).sort((a, b) => b.declined - a.declined)[0];

  const signals: Signal[] = [
    uncalled.length
      ? { severity: "High", tone: "red", signal: `${uncalled.length} missed ${plural(uncalled.length, "call has", "calls have")} had no callback`, evidence: "Never answered, no callback offered and not marked handled", count: uncalled.length, period: "30 days", action: "Call back", go: () => openCall(uncalled[0].id) }
      : null,
    topGap && topGap.declined >= 2
      ? { severity: topGap.declined >= 5 ? "High" : "Medium", tone: topGap.declined >= 5 ? "red" : "amber", signal: `“${TOPIC_LABELS[topGap.topic]}” was asked ${topGap.asked} times and the AI had no record ${topGap.declined} times`, evidence: topGap.sampleQuestion ? `Most recently: “${topGap.sampleQuestion}”` : "The AI declined rather than guess", count: topGap.declined, period: "30 days", action: "Fix knowledge", go: () => router.push("/receptionist/knowledge") }
      : null,
    stale.length
      ? { severity: "Medium", tone: "amber", signal: `${stale.length} ${plural(stale.length, "follow-up has", "follow-ups have")} waited more than a day`, evidence: "A caller was told someone would be in touch", count: stale.length, period: "open now", action: "Open queue", go: () => router.push("/receptionist/queue") }
      : null,
    repeatToday
      ? { severity: "Medium", tone: "amber", signal: `${repeatToday} ${plural(repeatToday, "caller")} rang more than once today`, evidence: "The same number called again — the first call may not have solved it", count: repeatToday, period: "today", action: "See calls", go: () => router.push("/receptionist/history") }
      : null,
    lowConf.length
      ? { severity: "Medium", tone: "amber", signal: `${lowConf.length} ${plural(lowConf.length, "call")} had a turn where the AI reported low confidence`, evidence: "The AI's own reading of how sure it was — worth a look at what it was asked", count: lowConf.length, period: "30 days", action: "Review call", go: () => openCall(lowConf[0].id, "Intent") }
      : null,
    upset.length
      ? { severity: "Low", tone: "neutral", signal: `${upset.length} ${plural(upset.length, "caller")} sounded upset`, evidence: "The AI's estimate of how the caller sounded — an estimate, not a fact", count: upset.length, period: "30 days", action: "Review call", go: () => openCall(upset[0].id, "Intent") }
      : null,
    capped.length
      ? { severity: "Medium", tone: "amber", signal: `${capped.length} ${plural(capped.length, "call")} reached the ${maxTurns}-line length cap`, evidence: "The AI couldn't conclude the call and arranged a callback instead", count: capped.length, period: "30 days", action: "Review call", go: () => openCall(capped[0].id) }
      : null,
    noRecording.length
      ? { severity: "Low", tone: "neutral", signal: `${noRecording.length} answered ${plural(noRecording.length, "call has", "calls have")} no recording`, evidence: "Audio is only stored when the provider returns a recording for a caller turn", count: noRecording.length, period: "30 days", action: "See call", go: () => openCall(noRecording[0].id) }
      : null,
  ].filter((s): s is Signal => s !== null);

  const kpis: { label: string; value: string; meta: string; tone: "neutral" | "green" | "amber" | "red" }[] = [
    { label: "AI resolution", value: pct(resolvedByAi.length, aiHandled.length), meta: "of AI-handled, 30 days", tone: "green" },
    { label: "Unresolved", value: String(followUps.length), meta: "still need a person", tone: followUps.length ? "amber" : "neutral" },
    { label: "Escalated", value: String(transfers.length), meta: "AI handed to a person", tone: "neutral" },
    { label: "Low confidence", value: String(lowConf.length), meta: declinedTotal ? `${declinedTotal} answer${declinedTotal === 1 ? "" : "s"} declined` : "none declined", tone: lowConf.length ? "amber" : "neutral" },
    { label: "Repeat callers today", value: String(repeatToday), meta: "same number, 2+ calls", tone: repeatToday ? "amber" : "neutral" },
    { label: "Complaints", value: String(complaints.length), meta: complaints.length ? `${complaints.filter((c) => c.handledBy === "ai_to_human").length} transferred` : "none in 30 days", tone: complaints.length ? "amber" : "neutral" },
  ];

  const clusterRows = rx.clusters.map((c) => ({
    ...c,
    transferred: all.filter((x) => x.analysis?.topic === c.topic && x.handledBy === "ai_to_human").length,
  }));

  return (
    <div className="flex flex-col gap-[18px]">
      <div style={kpiGrid(155)}>
        {kpis.map((k) => (
          <KpiCard key={k.label} label={k.label} value={k.value} sub={k.meta} tone={k.tone} onClick={() => notify(`${k.label} · ${k.value}`, k.meta)} />
        ))}
      </div>

      <Card overflow>
        <div className="flex flex-wrap items-center gap-2.5 border-b border-[#EEF0F3] px-[18px] py-3.5">
          <div className="text-[13.5px] font-extrabold">Quality signals</div>
          <div className="text-[11px] text-[#94A3B8]">Detected from call events and the AI&apos;s own per-turn readings</div>
        </div>
        {signals.length === 0 ? (
          <EmptyState icon="badge-check" title="No quality signals right now" body="Nothing in your call log currently points at a problem: no unreturned missed calls, stale follow-ups, repeated declined questions, low-confidence or upset calls, or calls that hit the length cap." />
        ) : (
          signals.map((s, i) => (
            <div
              key={s.signal}
              onClick={s.go}
              className="flex cursor-pointer flex-wrap items-center gap-3 px-[18px] py-3.5 hover:bg-[#FAFBFC]"
              style={{ borderTop: i === 0 ? "none" : "1px solid #F3F4F7", background: s.tone === "red" ? "#FEFBFB" : s.tone === "amber" ? "#FFFDF5" : "#fff" }}
            >
              <Chip tone={s.tone} h={22} style={{ flexShrink: 0 }}>
                {s.severity}
              </Chip>
              <div className="min-w-[220px] flex-[1_1_260px]">
                <div className="text-[12.5px] font-bold" style={{ textWrap: "pretty" }}>
                  {s.signal}
                </div>
                <div className="mt-[3px] text-[10.5px] text-[#94A3B8]">{s.evidence}</div>
              </div>
              <div className="flex-none text-right">
                <div className="text-[14px] font-extrabold tabular-nums">{s.count}</div>
                <div className="text-[9.5px] text-[#94A3B8]">{s.period}</div>
              </div>
              <SmallBtn onClick={s.go}>{s.action}</SmallBtn>
            </div>
          ))
        )}
        <Footnote>Confidence, sentiment and “declined” are the AI&apos;s own reports for each turn — estimates, never presented as a certain reading of how a caller felt. A turn where it reported nothing produces no signal.</Footnote>
      </Card>

      <Card overflow>
        <div className="flex flex-wrap items-center gap-2.5 border-b border-[#EEF0F3] px-[18px] py-3.5">
          <div className="text-[13.5px] font-extrabold">Top question clusters</div>
          <div className="text-[11px] text-[#94A3B8]">Factual questions grouped by the topic the AI filed them under · last 30 days</div>
        </div>
        {clusterRows.length === 0 ? (
          <EmptyState icon="lightbulb" title="No questions recorded yet" body="When a caller asks something factual — hours, a price, an order — the AI files it under a topic and notes whether it could answer. They appear here, most asked first." />
        ) : (
          <TableWrap
            minWidth={820}
            head={
              <>
                <Th>Question cluster</Th>
                <Th align="center">Asked</Th>
                <Th align="center">AI answered</Th>
                <Th align="center">Declined</Th>
                <Th align="center">Transferred</Th>
                <Th>Gap</Th>
              </>
            }
          >
            {clusterRows.map((c) => (
              <tr key={c.topic} onClick={() => (c.declined ? router.push("/receptionist/knowledge") : notify(c.label, `${c.asked} asked · ${c.answered} answered from a record`))} className="cursor-pointer border-b border-[#F3F4F7] hover:bg-[#FAFBFC]!" style={{ background: c.declined ? "#FFFDF5" : "#fff" }}>
                <td className="py-[11px] pl-[18px] pr-3 text-[12px] font-bold">{c.label}</td>
                <td className="px-3 py-[11px] text-center text-[11.5px] tabular-nums">{c.asked}</td>
                <td className="px-3 py-[11px] text-center text-[11.5px] font-semibold tabular-nums text-[#15803D]">{c.answered}</td>
                <td className="px-3 py-[11px] text-center text-[11.5px] tabular-nums">
                  {c.declined ? <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-[6px] bg-[#FEF3C7] px-1.5 text-[11px] font-extrabold text-[#B45309]">{c.declined}</span> : 0}
                </td>
                <td className="px-3 py-[11px] text-center text-[11.5px] tabular-nums">{c.transferred}</td>
                <td className="py-[11px] pl-3 pr-[18px] text-[11.5px] text-[#7A8798]">{c.declined ? `No record for ${c.declined}` : "None"}</td>
              </tr>
            ))}
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
