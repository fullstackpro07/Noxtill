"use client";

import { useMemo } from "react";
import { TOPIC_LABELS, type RoutingRule, type TopicKey } from "@/lib/voice-calls-api";
import { callerName, firstCallerLine, fmtWhen, outcomeChip, sliceDay, waitedFor } from "@/lib/receptionist-derive";
import { Ico } from "../rx-icon";
import { Card, CardHead, Chip, ChipFor, EmptyState, Footnote, KpiCard, RowAction, TableWrap, Th, kpiGrid } from "../rx-ui";
import type { Tone } from "@/lib/receptionist-derive";
import { useRx } from "../rx-data";
import { useRxStore, type PanelSpec } from "../rx-store";
import { RxGate } from "../rx-gate";
import { useCallActions } from "../rx-call-actions";
import { CustomIntentsForm } from "../rx-settings-forms";
import { RoutingRuleForm } from "../rx-forms";
import { RowTable } from "../rx-overlays";

export function QueueScreen() {
  return (
    <RxGate>
      <Queue />
    </RxGate>
  );
}

interface Rule {
  order: number;
  when: string;
  then: string;
  scope: string;
  status: string;
  tone: Tone;
  calls: number;
  /** A rule this business wrote (editable), a situation from Settings, or a fixed built-in. */
  source: "rule" | "situation" | "builtin";
  rule?: RoutingRule;
  panel: Pick<PanelSpec, "bullets" | "note"> & { canAi: string };
}

const FLOW: [string, string][] = [
  ["Incoming call", "phone-incoming"],
  ["Your number", "phone"],
  ["Disclosure & greeting", "shield-check"],
  ["Caller speaks", "mic"],
  ["Transcribe", "audio-lines"],
  ["Detect intent", "lightbulb"],
  ["Your rules", "list-ordered"],
  ["Route", "arrow-right-left"],
  ["Outcome recorded", "circle-check"],
];

const describeWhen = (r: RoutingRule): string => {
  switch (r.triggerKind) {
    case "keyword":
      return `The caller says “${r.matchValue ?? ""}”`;
    case "topic":
      return `The AI files the question under “${TOPIC_LABELS[r.matchValue as TopicKey] ?? r.matchValue ?? ""}”`;
    case "sentiment":
      return `The caller sounds ${r.matchValue ?? "upset"} (AI's estimate)`;
    case "low_confidence":
      return "The AI reports low confidence in what the caller wants";
    default:
      return "The call arrives outside working hours";
  }
};

/** The rule's own facts, read from live data so they stay right while the panel is open (position, on/off, calls today). */
function RuleSummary({ ruleId }: { ruleId: string }) {
  const rx = useRx();
  const rule = rx.routingRules.find((r) => r.id === ruleId);
  if (!rule) return null;
  const i = rx.routingRules.findIndex((r) => r.id === ruleId);
  const calls = rx.calls.filter((x) => x.routedRuleId === rule.id && x.localDay === rx.today).length;
  return (
    <div className="flex-none overflow-hidden rounded-[12px] border border-[#E6E8EC]">
      <RowTable
        rows={[
          { label: "Status", value: rule.active ? "On" : "Off", tone: rule.active ? "pos" : "muted" },
          { label: "Position", value: `${i + 1} of your ${rx.routingRules.length} rule${rx.routingRules.length === 1 ? "" : "s"}` },
          { label: "When", value: describeWhen(rule) },
          { label: "Then", value: rule.action === "transfer" ? `Transfer to ${rule.transferNumber ?? "your transfer number"}` : "Take a message → follow-up queue" },
          { label: "Calls matched today", value: String(calls) },
        ]}
      />
    </div>
  );
}

/** Move / switch off / delete for one rule — reads the CURRENT rule from live data, so it never goes stale while the panel is open. */
function RuleControls({ ruleId }: { ruleId: string }) {
  const rx = useRx();
  const openConfirm = useRxStore((s) => s.openConfirm);
  const closeOverlays = useRxStore((s) => s.closeOverlays);
  const rule = rx.routingRules.find((r) => r.id === ruleId);
  if (!rule) return null;
  const i = rx.routingRules.findIndex((r) => r.id === ruleId);
  const btn = "flex h-[32px] cursor-pointer items-center gap-1.5 rounded-[9px] border bg-white px-2.5 text-[12px] font-bold hover:bg-[#F1F3F6] disabled:cursor-not-allowed disabled:opacity-45";
  return (
    <div className="flex flex-none flex-wrap gap-2 rounded-[12px] border border-[#E6E8EC] p-3.5">
      <button type="button" disabled={i <= 0} onClick={() => void rx.actions.moveRule(rule.id, -1)} className={btn} style={{ borderColor: "#D5DAE2" }}>
        <Ico name="chevron-up" size={13} /> Move up
      </button>
      <button type="button" disabled={i >= rx.routingRules.length - 1} onClick={() => void rx.actions.moveRule(rule.id, 1)} className={btn} style={{ borderColor: "#D5DAE2" }}>
        <Ico name="chevron-down" size={13} /> Move down
      </button>
      <button type="button" onClick={() => void rx.actions.updateRule(rule.id, { active: !rule.active })} className={btn} style={{ borderColor: "#D5DAE2" }}>
        {rule.active ? "Turn off" : "Turn on"}
      </button>
      <button
        type="button"
        onClick={() =>
          openConfirm({
            title: `Delete “${rule.name}”?`,
            tone: "red",
            icon: "trash-2",
            body: "Calls it caught before stay recorded against its name. From the next call it no longer applies.",
            primary: "Delete rule",
            cancel: "Keep it",
            onConfirm: async () => {
              await rx.actions.deleteRule(rule.id);
              closeOverlays();
            },
          })
        }
        className={btn}
        style={{ borderColor: "#FBD5D2", color: "#B42318" }}
      >
        <Ico name="trash-2" size={13} /> Delete
      </button>
    </div>
  );
}

function Queue() {
  const rx = useRx();
  const openPanel = useRxStore((s) => s.openPanel);
  const openCall = useRxStore((s) => s.openCall);
  const notify = useRxStore((s) => s.notify);
  const openConfirm = useRxStore((s) => s.openConfirm);
  const ca = useCallActions();
  const t = useMemo(() => sliceDay(rx.calls, rx.today), [rx.calls, rx.today]);
  const transferOk = !!rx.insights?.transferConfigured;
  const maxTurns = rx.insights?.limits.maxCallTurns ?? 8;

  const followUps = rx.followUps;
  const oldest = followUps[0];
  const unassigned = followUps.filter((c) => !c.assignedToUserId);
  const offered = followUps.filter((c) => c.callbackRequestedAt);
  const missedOpen = followUps.filter((c) => c.status === "missed");

  const rules: Rule[] = useMemo(() => {
    const situations = [...(rx.settings?.customIntents ?? [])].sort((a, b) => b.priority - a.priority);
    const list: Omit<Rule, "order">[] = [
      // 1. Situations you named in Settings — the AI matches these first.
      ...situations.map((c) => ({
        when: `Conversation clearly matches “${c.name}”`,
        then: "Take a message → follow-up queue",
        scope: `Your situation · priority ${c.priority}`,
        status: "Active",
        tone: "green" as Tone,
        calls: t.calls.filter((x) => x.outcome === "custom" && x.customIntentName === c.name).length,
        source: "situation" as const,
        panel: { canAi: "Yes — the AI decides", bullets: ["You defined this situation; the AI uses its exact name when a conversation clearly matches it", "It is checked before your routing rules", "Matching calls join the follow-up queue"], note: "Situations are read on the very next call." },
      })),
      // 2. Your own routing rules, top to bottom — the first match wins.
      ...rx.routingRules.map((r) => {
        const needsNumber = r.action === "transfer" && !r.transferNumber && !transferOk;
        return {
          when: describeWhen(r),
          then: r.action === "transfer" ? `Transfer to ${r.transferNumber ?? "your transfer number"}` : "Take a message → follow-up queue",
          scope: "All calls",
          status: !r.active ? "Off" : needsNumber ? "Needs a transfer number" : "Active",
          tone: (!r.active ? "neutral" : needsNumber ? "amber" : "green") as Tone,
          calls: rx.calls.filter((x) => x.routedRuleId === r.id && x.localDay === rx.today).length,
          source: "rule" as const,
          rule: r,
          panel: {
            canAi: "No — this rule decides",
            bullets: [
              "Rules are checked top to bottom on every thing the caller says; the first one that matches decides the call",
              "A rule overrides what the AI itself would have done that turn",
              r.action === "transfer" ? (needsNumber ? "There is no number to ring yet — add one to this rule or set your transfer number in Settings, otherwise the call is recorded as a message" : "The caller is put through to the number shown") : "The call ends and joins the follow-up queue",
              "The call is recorded against this rule's name, so you can always see which rule fired",
            ],
            note: r.triggerKind === "sentiment" || r.triggerKind === "topic" || r.triggerKind === "low_confidence" ? "This trigger uses the AI's own reading of the call, which is an estimate — not a certainty." : "Changes apply from the very next call.",
          },
        };
      }),
      // 3. Built-in handling — fixed.
      {
        when: "Caller asks for a person, or the AI can't help",
        then: transferOk ? "Dial the transfer number" : "Tell the caller a message is noted, and record it as a message",
        scope: "All calls",
        status: transferOk ? "Built-in" : "Needs a transfer number",
        tone: transferOk ? "neutral" : "amber",
        calls: t.transferred.length,
        source: "builtin",
        panel: {
          canAi: "Yes — the AI decides",
          bullets: ["The AI chooses “transfer” when the caller asks for a person or it cannot help", transferOk ? "It then rings your transfer number" : "No transfer number is set, so the AI tells the caller their message is noted and the call is recorded as a message in the follow-up queue — set one in Settings to enable real transfers", "The transfer is recorded on the call as the outcome"],
          note: "Routing decisions are recorded per call, so you can see which rule fired.",
        },
      },
      {
        when: "Caller gives a service and a time",
        then: "Create a booking in Bookings — rejected if the time isn't free",
        scope: "All calls",
        status: "Built-in",
        tone: "neutral",
        calls: t.booked.length,
        source: "builtin",
        panel: { canAi: "Yes", bullets: ["The AI only books once it has both a clear service and a clear time", "The service is matched against your services; the booking engine rejects a time that isn't available", "If that fails, the AI asks for another time instead of pretending it worked"], note: "A booking appears in Bookings the moment it is created." },
      },
      {
        when: "Caller wants to leave a message",
        then: "Take a message → follow-up queue",
        scope: "All calls",
        status: "Built-in",
        tone: "neutral",
        calls: t.calls.filter((c) => c.outcome === "message" && !c.routedRuleId).length,
        source: "builtin",
        panel: { canAi: "Yes", bullets: ["The call joins the follow-up queue until someone marks it handled", "If you've set a hold message, the AI phrases its reply around it", "The transcript is kept so whoever calls back has the context"], note: "Nothing is promised to the caller beyond a callback." },
      },
      {
        when: "Conversation ends naturally",
        then: "End the call",
        scope: "All calls",
        status: "Built-in",
        tone: "neutral",
        calls: t.calls.filter((c) => c.status === "completed" && c.outcome === "none").length,
        source: "builtin",
        panel: { canAi: "Yes", bullets: ["The AI says goodbye once nothing more is needed", "The call is recorded as completed"], note: "A call that ends without any outcome is shown as “Completed”." },
      },
      {
        when: "Anything else",
        then: `Keep talking — after ${maxTurns} spoken lines, arrange a callback and record a message`,
        scope: "All calls",
        status: "Built-in",
        tone: "neutral",
        calls: t.calls.filter((c) => c.transcript.length >= maxTurns).length,
        source: "builtin",
        panel: { canAi: "Yes", bullets: [`A conversation is capped at ${maxTurns} spoken lines (caller and AI combined) so a runaway call still ends`, "At the cap the AI says someone will call back, and the call is recorded as a message so it reaches the follow-up queue"], note: "The count is calls today that reached the cap." },
      },
    ];
    return list.map((r, i) => ({ ...r, order: i + 1 }));
  }, [rx.settings, rx.routingRules, rx.calls, rx.today, t, transferOk, maxTurns]);

  const openRule = (r: Rule) =>
    openPanel({
      kicker: r.source === "rule" ? "Your routing rule" : r.source === "situation" ? `Your situation · ${r.order}` : `Built-in · ${r.order}`,
      title: r.rule?.name ?? r.when,
      // A rule's own status and position change while the panel is open, so they are shown by RuleSummary from live data.
      ...(r.rule
        ? {}
        : {
            badge: r.status,
            badgeTone: r.tone,
            rows: [
              { label: "Position", value: `${r.order} of ${rules.length}` },
              { label: "When", value: r.when },
              { label: "Then", value: r.then },
              { label: "Applies to", value: r.scope },
              { label: "Calls matched today", value: String(r.calls) },
              { label: "Who decides", value: r.panel.canAi },
            ],
          }),
      body: r.rule ? (
        <>
          <RuleSummary ruleId={r.rule.id} />
          <RuleControls ruleId={r.rule.id} />
          <RoutingRuleForm rule={r.rule} />
        </>
      ) : r.source === "situation" ? (
        <CustomIntentsForm />
      ) : undefined,
      bulletsTitle: "How this works",
      bullets: r.panel.bullets,
      note: r.panel.note,
      secondary: "Close",
    });

  const addRule = () =>
    openPanel({
      kicker: "New routing rule",
      title: "Route calls your own way",
      badge: "Applies from the next call",
      badgeTone: "blue",
      body: <RoutingRuleForm />,
      bulletsTitle: "What a rule can do",
      bullets: [
        "Match on a word the caller says, a topic the AI files the question under, how the caller sounds, low AI confidence, or a call arriving outside working hours",
        "Then take a message, or transfer the call to a person",
        "The first matching rule wins; you set the order",
        "A rule can only use what happens on the call — never who the caller is",
      ],
      note: "For an emergency line, add a keyword rule that transfers. For an out-of-hours message, use “outside working hours” → take a message.",
      secondary: "Close",
    });

  const addSituation = () =>
    openPanel({
      kicker: "New situation",
      title: "Name a situation for the AI to recognise",
      badge: "Applies from the next call",
      badgeTone: "blue",
      body: <CustomIntentsForm />,
      bulletsTitle: "How situations work",
      bullets: ["The AI uses the exact name when a conversation clearly matches it", "Matching calls join the follow-up queue", "Up to 10 situations, priority 1–10; situations are checked before your routing rules"],
      secondary: "Close",
    });

  const kpis: { label: string; value: string; meta: string; tone: "neutral" | "amber" | "red" }[] = [
    { label: "Awaiting follow-up", value: String(followUps.length), meta: oldest ? `oldest ${waitedFor(oldest, rx.now)}` : "nothing waiting", tone: followUps.length ? "amber" : "neutral" },
    { label: "AI active", value: String(rx.live.length), meta: rx.live.length ? "answering now" : "no live calls", tone: "neutral" },
    { label: "Unassigned", value: String(unassigned.length), meta: unassigned.length ? "needs an owner" : "all have an owner", tone: unassigned.length ? "amber" : "neutral" },
    { label: "Transfers today", value: String(t.transferred.length), meta: transferOk ? "to a person" : "no transfer number set", tone: "neutral" },
    { label: "Missed", value: String(missedOpen.length), meta: "still need a callback", tone: missedOpen.length ? "red" : "neutral" },
    { label: "Callbacks offered", value: String(offered.length), meta: "not yet handled", tone: offered.length ? "amber" : "neutral" },
  ];

  const est = rx.queue?.estimatedWaitMinutes;
  const customCount = rx.routingRules.length;

  return (
    <div className="flex flex-col gap-[18px]">
      <div style={kpiGrid(150)}>
        {kpis.map((k) => (
          <KpiCard key={k.label} label={k.label} value={k.value} sub={k.meta} tone={k.tone} onClick={() => notify(`${k.label} · ${k.value}`, k.meta)} />
        ))}
      </div>

      <Card pad={18}>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="text-[14px] font-extrabold">Routing flow</div>
          <div className="ml-auto text-[11px] text-[#94A3B8]">What happens to every call, in order</div>
        </div>
        <div className="mt-[15px] flex flex-wrap items-center gap-2">
          {FLOW.map(([label, icon], i) => (
            <button
              key={label}
              type="button"
              onClick={() => notify(`Routing step: ${label}`, "Every call passes through these steps in order — an earlier outcome ends the call.")}
              className="flex h-8 flex-none cursor-pointer items-center gap-[7px] whitespace-nowrap rounded-full px-[11px] text-[11.5px] font-bold"
              style={{ border: `1px solid ${i === 0 ? "#BBF0CB" : "#E1E5EB"}`, background: i === 0 ? "#ECFDF3" : "#fff", color: i === 0 ? "#15803D" : "#45505F" }}
            >
              <Ico name={icon} size={13} />
              {label}
            </button>
          ))}
        </div>
      </Card>

      <Card overflow>
        <CardHead
          title="Routing rules"
          sub={customCount ? `${customCount} of your own · checked top to bottom` : "None of your own yet"}
          right={
            <div className="flex items-center gap-2">
              <button type="button" onClick={addSituation} className="flex h-8 cursor-pointer items-center rounded-[9px] border border-[#D5DAE2] bg-white px-[11px] text-[12px] font-bold hover:bg-[#F1F3F6]">
                Add situation
              </button>
              <button type="button" onClick={addRule} className="flex h-8 cursor-pointer items-center gap-1.5 rounded-[9px] border-0 bg-[#16A34A] px-[11px] text-[12px] font-bold text-white hover:bg-[#15803D]">
                <Ico name="plus" size={13} strokeWidth={2.25} />
                Add rule
              </button>
            </div>
          }
        />
        <TableWrap
          minWidth={980}
          head={
            <>
              <Th align="center">Order</Th>
              <Th>When</Th>
              <Th>Then route to</Th>
              <Th>Applies to</Th>
              <Th>Status</Th>
              <Th align="center">Calls today</Th>
            </>
          }
        >
          {rules.map((r) => (
            <tr key={`${r.source}-${r.order}`} onClick={() => openRule(r)} className="cursor-pointer border-b border-[#F3F4F7] hover:bg-[#FAFBFC]!" style={{ background: r.tone === "amber" ? "#FFFDF5" : "#fff" }}>
              <td className="py-[11px] pl-[18px] pr-3 text-center">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-[7px] bg-[#F1F3F6] text-[11px] font-extrabold text-[#45505F]">{r.order}</span>
              </td>
              <td className="px-3 py-[11px] text-[12px] font-bold">
                {r.rule ? <div className="text-[10.5px] font-semibold text-[#7A8798]">{r.rule.name}</div> : null}
                {r.when}
              </td>
              <td className="px-3 py-[11px] text-[11.5px] text-[#45505F]">{r.then}</td>
              <td className="px-3 py-[11px] text-[11.5px] text-[#45505F]">{r.scope}</td>
              <td className="px-3 py-[11px]">
                <Chip tone={r.tone}>{r.status}</Chip>
              </td>
              <td className="py-[11px] pl-3 pr-[18px] text-center text-[11.5px] tabular-nums">{r.calls}</td>
            </tr>
          ))}
        </TableWrap>
        <Footnote>Your situations are checked first, then your routing rules top to bottom — the first match decides the call — then the built-in handling. There is no separate emergency or holiday switch: build one as a rule (a keyword, or “outside working hours”).</Footnote>
      </Card>

      <Card overflow>
        <CardHead
          title="Awaiting follow-up"
          sub={est != null ? `Calls like these have typically been handled in about ${est} min` : "No estimate yet — it needs a few handled calls to average"}
          right={
            followUps.length > 0 ? (
              <button
                type="button"
                onClick={() =>
                  openConfirm({
                    title: `Mark all ${followUps.length} as handled?`,
                    tone: "amber",
                    icon: "circle-check",
                    body: "Every waiting call leaves the queue and is marked handled. The calls, transcripts and recordings stay in Call History.",
                    rows: [{ label: "Calls affected", value: String(followUps.length) }],
                    primary: "Mark all handled",
                    cancel: "Keep them",
                    onConfirm: () => rx.actions.clearQueue(),
                  })
                }
                className="flex h-[30px] cursor-pointer items-center rounded-[8px] border border-[#D5DAE2] bg-white px-2.5 text-[12px] font-bold hover:bg-[#F1F3F6]"
              >
                Clear queue
              </button>
            ) : undefined
          }
        />
        {followUps.length === 0 ? (
          <EmptyState icon="circle-check" title="Nothing is waiting" body="A missed call, or a caller who left a message, appears here until someone marks it handled." />
        ) : (
          followUps.map((c, i) => {
            const said = firstCallerLine(c);
            return (
              <div key={c.id} onClick={() => openCall(c.id)} className="flex cursor-pointer flex-wrap items-center gap-3 px-[18px] py-3.5 hover:bg-[#FAFBFC]" style={{ borderTop: i === 0 ? "none" : "1px solid #F3F4F7" }}>
                <div className="flex h-7 w-7 flex-none items-center justify-center rounded-[9px] bg-[#FEF3C7] text-[12.5px] font-extrabold text-[#B45309]">{i + 1}</div>
                <div className="min-w-[180px] flex-[1_1_200px]">
                  <div className="text-[12.5px] font-bold">{callerName(c)}</div>
                  <div className="mt-0.5 text-[10.5px] text-[#94A3B8]">
                    {c.fromNumber} · {fmtWhen(c.startedAt, rx.timezone, rx.today, c.localDay)} · {c.assignedToName ? `owner ${c.assignedToName}` : "unassigned"}
                  </div>
                </div>
                <div className="min-w-[140px] flex-[1_1_160px] text-[11.5px] text-[#45505F]">
                  <ChipFor spec={outcomeChip(c)} />
                  {said ? <div className="mt-1 line-clamp-2 text-[11px] text-[#7A8798]">“{said}”</div> : null}
                </div>
                <div className="w-[96px] flex-none text-right">
                  <div className="text-[13px] font-extrabold tabular-nums">{waitedFor(c, rx.now)}</div>
                  <div className="mt-0.5 text-[10px] text-[#94A3B8]">waiting</div>
                </div>
                <div className="flex min-w-[214px] flex-none justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <RowAction primary onClick={() => ca.callBack(c)}>
                    Call back
                  </RowAction>
                  <RowAction onClick={() => ca.assign(c)}>{c.assignedToName ? "Reassign" : "Assign"}</RowAction>
                  <RowAction onClick={() => void rx.actions.markHandled(c.id)}>Handled</RowAction>
                </div>
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}
