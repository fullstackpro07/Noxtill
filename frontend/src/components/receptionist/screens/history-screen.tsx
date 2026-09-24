"use client";

import { useMemo, useState } from "react";
import type { EnrichedCall } from "@/lib/voice-calls-api";
import {
  callerName,
  directionIcon,
  fmtDuration,
  fmtWhen,
  handlerChip,
  intentLabel,
  matchChip,
  needsFollowUp,
  outcomeChip,
} from "@/lib/receptionist-derive";
import { Ico } from "../rx-icon";
import { Card, ChipFor, EmptyState, Footnote, KpiCard, RowAction, TableWrap, Th, kpiGrid } from "../rx-ui";
import { useRx } from "../rx-data";
import { useRxStore } from "../rx-store";
import { RxGate } from "../rx-gate";
import { useCallActions } from "../rx-call-actions";

type FilterKey = "direction" | "outcome" | "intent" | "handled" | "match" | "recording";

const RANGES = [
  { key: "today", label: "Today" },
  { key: "7", label: "Last 7 days" },
  { key: "30", label: "Last 30 days" },
] as const;

export function HistoryScreen() {
  return (
    <RxGate>
      <History />
    </RxGate>
  );
}

function History() {
  const rx = useRx();
  const openCall = useRxStore((s) => s.openCall);
  const ca = useCallActions();
  const [q, setQ] = useState("");
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("30");
  const [f, setF] = useState<Record<FilterKey, string>>({ direction: "", outcome: "", intent: "", handled: "", match: "", recording: "" });

  const inRange = useMemo(() => {
    if (range === "today") return rx.calls.filter((c) => c.localDay === rx.today);
    const cutoff = rx.now.getTime() - Number(range) * 86_400_000;
    return rx.calls.filter((c) => new Date(c.startedAt).getTime() >= cutoff);
  }, [rx.calls, rx.today, rx.now, range]);

  const opts = useMemo(() => {
    const uniq = (fn: (c: EnrichedCall) => string) => [...new Set(inRange.map(fn))].sort();
    return {
      direction: ["Inbound"],
      outcome: uniq((c) => outcomeChip(c).label),
      intent: uniq(intentLabel),
      handled: uniq((c) => handlerChip(c.handledBy).label),
      match: ["Matched customer", "No match"],
      recording: ["Available", "None", "Deleted"],
    } satisfies Record<FilterKey, string[]>;
  }, [inRange]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return inRange.filter((c) => {
      if (f.outcome && outcomeChip(c).label !== f.outcome) return false;
      if (f.intent && intentLabel(c) !== f.intent) return false;
      if (f.handled && handlerChip(c.handledBy).label !== f.handled) return false;
      if (f.match && matchChip(c).label !== f.match) return false;
      if (f.recording && (c.recordingDeletedAt ? "Deleted" : c.hasRecording ? "Available" : "None") !== f.recording) return false;
      if (!needle) return true;
      const hay = [callerName(c), c.fromNumber, c.callSid, c.appointment?.id ?? "", c.appointment?.serviceName ?? "", ...c.transcript.map((t) => t.text)].join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [inRange, f, q]);

  const rangeLabel = RANGES.find((r) => r.key === range)!.label.toLowerCase();
  const answered = inRange.filter((c) => c.status !== "missed");
  const kpis: { label: string; value: string; meta: string; tone: "neutral" | "green" | "red" | "amber" }[] = [
    { label: "Total", value: String(inRange.length), meta: rangeLabel, tone: "neutral" },
    { label: "Answered", value: String(answered.length), meta: inRange.length ? `${Math.round((answered.length / inRange.length) * 100)}%` : "—", tone: "green" },
    { label: "Missed", value: String(inRange.filter((c) => c.status === "missed").length), meta: "never answered", tone: inRange.some((c) => c.status === "missed") ? "red" : "neutral" },
    { label: "Transferred", value: String(inRange.filter((c) => c.handledBy === "ai_to_human").length), meta: "AI to a person", tone: "neutral" },
    { label: "AI handled", value: String(inRange.filter((c) => c.handledBy === "ai").length), meta: answered.length ? `${Math.round((inRange.filter((c) => c.handledBy === "ai").length / answered.length) * 100)}% of answered` : "—", tone: "neutral" },
    { label: "Human joined", value: String(inRange.filter((c) => c.handledBy === "human_joined").length), meta: "staff live on the call", tone: "neutral" },
    { label: "Callback required", value: String(inRange.filter(needsFollowUp).length), meta: `${inRange.filter((c) => needsFollowUp(c) && !c.assignedToUserId).length} unassigned`, tone: inRange.some(needsFollowUp) ? "amber" : "neutral" },
  ];

  return (
    <div className="flex flex-col gap-[18px]">
      <div style={kpiGrid(150)}>
        {kpis.map((k) => (
          <KpiCard key={k.label} label={k.label} value={k.value} sub={k.meta} tone={k.tone} />
        ))}
      </div>

      <Card overflow>
        <div className="flex flex-wrap items-center gap-2 px-[18px] py-3.5">
          <div className="flex h-[34px] min-w-0 flex-[1_1_200px] items-center gap-2 rounded-[10px] border border-[#D5DAE2] bg-white px-[11px]">
            <Ico name="search" size={14} className="text-[#7A8798]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search caller, number, transcript text, call ID or booking…"
              aria-label="Search calls"
              className="min-w-0 flex-1 border-0 bg-transparent text-[12.5px] outline-none placeholder:text-[#8B97A6]"
            />
          </div>
          <label className="relative flex h-[34px] flex-none cursor-pointer items-center gap-1.5 rounded-[10px] border border-[#D5DAE2] bg-white px-[11px] text-[12.5px] font-bold hover:bg-[#F7F8FA]">
            <Ico name="calendar" size={13} />
            <span>{RANGES.find((r) => r.key === range)!.label}</span>
            <select aria-label="Period" value={range} onChange={(e) => setRange(e.target.value as typeof range)} className="absolute inset-0 cursor-pointer opacity-0">
              {RANGES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          {(
            [
              ["direction", "Direction"],
              ["outcome", "Outcome"],
              ["intent", "Intent"],
              ["handled", "Handled by"],
              ["match", "Match"],
              ["recording", "Recording"],
            ] as [FilterKey, string][]
          ).map(([key, label]) => (
            <label
              key={key}
              className="relative flex h-[34px] flex-none cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[10px] border bg-white px-[11px] text-[12.5px] font-bold hover:bg-[#F7F8FA]"
              style={{ borderColor: f[key] ? "#16A34A" : "#D5DAE2", color: f[key] ? "#15803D" : undefined }}
            >
              <Ico name="filter" size={13} />
              <span>{f[key] ? `${label}: ${f[key]}` : label}</span>
              <select aria-label={label} value={f[key]} onChange={(e) => setF((p) => ({ ...p, [key]: e.target.value }))} className="absolute inset-0 cursor-pointer opacity-0">
                <option value="">Any</option>
                {opts[key].map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        {rows.length === 0 ? (
          <EmptyState icon="history" title={inRange.length === 0 ? "No calls in this period" : "No calls match these filters"} body={inRange.length === 0 ? "Calls to your Noxtill number will be listed here as they happen." : "Clear a filter or change the search to see more."} />
        ) : (
          <TableWrap
            minWidth={1280}
            head={
              <>
                <Th>Time</Th>
                <Th>Caller</Th>
                <Th>Number</Th>
                <Th>Match</Th>
                <Th align="center">Direction</Th>
                <Th align="center">Duration</Th>
                <Th>Handled by</Th>
                <Th>Intent</Th>
                <Th>Outcome</Th>
                <Th>Recording</Th>
                <Th align="right">Actions</Th>
              </>
            }
          >
            {rows.map((c) => {
              const missed = c.status === "missed";
              const oc = outcomeChip(c);
              const review = c.outcome === "transfer";
              return (
                <tr
                  key={c.id}
                  onClick={() => openCall(c.id)}
                  className="cursor-pointer border-b border-[#F3F4F7] hover:bg-[#FAFBFC]!"
                  style={{ background: missed ? "#FEFBFB" : oc.tone === "amber" ? "#FFFDF5" : "#fff" }}
                >
                  <td className="whitespace-nowrap py-[11px] pl-[18px] pr-3 text-[11.5px] text-[#45505F]">{fmtWhen(c.startedAt, rx.timezone, rx.today, c.localDay)}</td>
                  <td className="px-3 py-[11px] text-[12.5px] font-bold">{callerName(c)}</td>
                  <td className="px-3 py-[11px] font-mono text-[11.5px] text-[#45505F]">{c.fromNumber}</td>
                  <td className="px-3 py-[11px]">
                    <ChipFor spec={{ ...matchChip(c), label: c.customer ? "Matched" : "None" }} />
                  </td>
                  <td className="px-3 py-[11px] text-center">
                    <Ico name={directionIcon(c)} size={15} className="mx-auto" style={{ color: missed ? "#B42318" : "#15803D" }} />
                  </td>
                  <td className="px-3 py-[11px] text-center text-[11.5px] tabular-nums">{fmtDuration(c.durationSeconds)}</td>
                  <td className="px-3 py-[11px]">
                    <ChipFor spec={handlerChip(c.handledBy)} />
                  </td>
                  <td className="px-3 py-[11px] text-[11.5px] text-[#45505F]">{intentLabel(c)}</td>
                  <td className="px-3 py-[11px]">
                    <ChipFor spec={oc} />
                  </td>
                  <td className="px-3 py-[11px]">
                    <ChipFor spec={{ label: c.recordingDeletedAt ? "Deleted" : c.hasRecording ? "Available" : "None", tone: c.recordingDeletedAt ? "red" : c.hasRecording ? "green" : "neutral" }} />
                  </td>
                  <td className="py-[11px] pl-3 pr-[18px] text-right">
                    {missed || needsFollowUp(c) ? (
                      <RowAction primary onClick={(e) => { e.stopPropagation(); ca.callBack(c); }}>
                        Call back
                      </RowAction>
                    ) : review ? (
                      <RowAction primary onClick={(e) => { e.stopPropagation(); openCall(c.id); }}>
                        Review
                      </RowAction>
                    ) : (
                      <RowAction onClick={(e) => { e.stopPropagation(); openCall(c.id); }}>Open</RowAction>
                    )}
                  </td>
                </tr>
              );
            })}
          </TableWrap>
        )}
        <Footnote>Any row opens the same 13-section call workspace. A missed call shows no recording and no inferred intent — Noxtill does not guess why someone rang. Only the last 500 calls in 30 days are loaded.</Footnote>
      </Card>
    </div>
  );
}
