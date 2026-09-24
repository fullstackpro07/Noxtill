"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  aiResolved,
  buildBrief,
  buildOverviewKpis,
  callerName,
  fmtShortDuration,
  handlerChip,
  intentLabel,
  needsFollowUp,
  sliceDay,
  type Kpi,
} from "@/lib/receptionist-derive";
import { Ico } from "../rx-icon";
import { BarRow, Card, CardHead, Chip, EmptyState, KpiCard, kpiGrid } from "../rx-ui";
import { useRx } from "../rx-data";
import { useRxStore } from "../rx-store";
import { RxGate } from "../rx-gate";

export function OverviewScreen() {
  return (
    <RxGate>
      <Overview />
    </RxGate>
  );
}

function Overview() {
  const router = useRouter();
  const rx = useRx();
  const openPanel = useRxStore((s) => s.openPanel);
  const openCall = useRxStore((s) => s.openCall);
  const whc = !!rx.insights?.workingHoursConfigured;

  const kpis = useMemo(() => buildOverviewKpis(rx.calls, rx.today, whc), [rx.calls, rx.today, whc]);
  const brief = useMemo(() => buildBrief(rx.calls, rx.today, rx.now, whc), [rx.calls, rx.today, rx.now, whc]);
  const t = useMemo(() => sliceDay(rx.calls, rx.today), [rx.calls, rx.today]);

  const oldestMissed = rx.followUps.find((c) => c.status === "missed");
  const unassigned = rx.followUps.filter((c) => !c.assignedToUserId);
  const next: { label: string; icon: string; primary?: boolean; go: () => void }[] = [];
  if (!rx.insights?.number) next.push({ label: "Set up a number", icon: "phone", primary: true, go: () => router.push("/receptionist/numbers") });
  if (oldestMissed) next.push({ label: "Call back missed caller", icon: "phone-outgoing", primary: next.length === 0, go: () => openCall(oldestMissed.id) });
  if (unassigned.length) next.push({ label: `Assign ${unassigned.length} open callback${unassigned.length === 1 ? "" : "s"}`, icon: "user-round-plus", go: () => router.push("/receptionist/leads") });
  if (t.transferred.length) next.push({ label: "Review the transfers", icon: "phone-forwarded", go: () => router.push("/receptionist/history") });
  next.push({ label: "Open call history", icon: "history", go: () => router.push("/receptionist/history") });

  const openKpi = (k: Kpi) =>
    openPanel({
      kicker: "Call metric",
      title: `${k.label} · ${k.value}`,
      badge: k.delta,
      badgeTone: k.tone === "neutral" ? "neutral" : k.tone,
      rows: [
        { label: "Value", value: k.value },
        { label: "Comparison", value: k.delta },
        { label: "Period", value: k.key === "callbacks" ? "Last 30 days, still open" : "Today" },
        { label: "Number scope", value: rx.insights?.number?.phoneNumber ?? "No number" },
        { label: "Source", value: "Noxtill call log" },
      ],
      bulletsTitle: "What this counts",
      bullets: [k.basis, "Only real inbound calls on your Noxtill number — no test data", "A missed call is recorded as missed, never excluded", "A figure that can't be worked out yet shows “—” rather than an estimate"],
      note: "Noxtill counts what happened, including the calls that went badly.",
      primary: "Open call history",
      onPrimary: () => {
        useRxStore.getState().closeOverlays();
        router.push("/receptionist/history");
      },
      secondary: "Close",
    });

  // Overlapping measures, as in the design — a booked call can also be one the AI resolved.
  const buckets = [
    { label: "Resolved by AI", n: aiResolved(t).length, color: "#16A34A" },
    { label: "Booked", n: t.booked.length, color: "#16A34A" },
    { label: "Lead captured", n: t.leads.length, color: "#4ADE80" },
    { label: "Transferred", n: t.transferred.length, color: "#2563EB" },
    { label: "Callback required", n: t.calls.filter(needsFollowUp).length, color: "#F59E0B" },
    { label: "Unresolved", n: t.missed.filter((c) => !c.resolvedAt).length, color: "#DC2626" },
  ];
  const maxBucket = Math.max(1, ...buckets.map((b) => b.n));

  return (
    <div className="flex flex-col gap-[18px]">
      <Card border="#DDD3FE" pad={16} className="px-[18px]!">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex h-7 w-7 flex-none items-center justify-center rounded-[8px] bg-[#F5F3FF] text-[#6D28D9]">
            <Ico name="sparkles" size={15} />
          </div>
          <div className="text-[11px] font-bold uppercase tracking-[.09em] text-[#6D28D9]">Today&apos;s phone brief</div>
          <div className="ml-auto text-[10.5px] text-[#94A3B8]">{brief.meta}</div>
        </div>
        <div className="mt-[11px] text-[14px] font-extrabold" style={{ textWrap: "pretty" }}>
          {brief.headline}
        </div>
        <div className="mt-[7px] text-[12.5px] leading-[1.6] text-[#45505F]" style={{ textWrap: "pretty" }}>
          {brief.body}
        </div>
        <div className="mt-[13px] flex flex-wrap items-center gap-[7px]">
          {next.map((n) => (
            <button
              key={n.label}
              type="button"
              onClick={n.go}
              className="flex h-8 flex-none cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[9px] px-3 text-[12.5px] font-bold"
              style={{ background: n.primary ? "#16A34A" : "#fff", color: n.primary ? "#fff" : "#45505F", border: `1px solid ${n.primary ? "#16A34A" : "#D5DAE2"}` }}
            >
              <Ico name={n.icon} size={14} />
              {n.label}
            </button>
          ))}
        </div>
      </Card>

      <div style={kpiGrid(150)}>
        {kpis.map((k) => (
          <KpiCard
            key={k.key}
            label={k.label}
            value={k.value}
            sub={k.delta}
            tone={k.tone}
            subColor={k.dir === "up" ? "#15803D" : k.dir === "down" ? "#B42318" : undefined}
            onClick={() => openKpi(k)}
          />
        ))}
      </div>

      <div className="grid items-start gap-[18px]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))" }}>
        <Card overflow>
          <CardHead icon="phone-call" iconColor="#1D4ED8" title="Live now" right={<Chip tone="blue" h={21} fontSize={10}>{rx.live.length} active · 0 waiting</Chip>} />
          {rx.live.length === 0 ? (
            <EmptyState icon="phone-call" title="No calls in progress" body="When a call comes in you'll see it here, with who is handling it. Calls are answered straight away, so no caller is ever left waiting." />
          ) : (
            rx.live.map((c, i) => {
              const h = handlerChip(c.handledBy);
              const secs = Math.max(0, Math.round((rx.now.getTime() - new Date(c.startedAt).getTime()) / 1000));
              return (
                <div
                  key={c.id}
                  onClick={() => router.push("/receptionist/live")}
                  className="flex cursor-pointer items-center gap-[11px] px-[18px] py-3 hover:bg-[#FAFBFC]"
                  style={{ borderTop: i === 0 ? "none" : "1px solid #F3F4F7" }}
                >
                  <div className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px] bg-[#F5F3FF] text-[#6D28D9]">
                    <Ico name="phone-call" size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-bold">{callerName(c)}</div>
                    <div className="mt-0.5 text-[10.5px] text-[#94A3B8]">
                      {intentLabel(c)} · {fmtShortDuration(secs)} so far
                    </div>
                  </div>
                  <Chip tone={h.tone === "neutral" ? "blue" : "purple"} h={21} fontSize={10}>
                    {c.joinedAt ? "Person joined" : "AI answering"}
                  </Chip>
                </div>
              );
            })
          )}
        </Card>

        <Card overflow>
          <CardHead icon="chart-no-axes-combined" title="Today's outcomes" right={<span className="text-[11px] text-[#94A3B8]">{t.calls.length} call{t.calls.length === 1 ? "" : "s"}</span>} />
          <div className="flex flex-col gap-[11px] px-[18px] py-[15px]">
            {t.calls.length === 0 ? (
              <div className="py-4 text-center text-[12px] text-[#94A3B8]">No calls yet today.</div>
            ) : (
              buckets.map((b) => (
                <BarRow key={b.label} label={b.label} value={String(b.n)} widthPct={(b.n / maxBucket) * 100} color={b.color} onClick={() => router.push("/receptionist/history")} />
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
