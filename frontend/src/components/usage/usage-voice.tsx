"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { fetchVoiceUsage, updateSpendCap, type PurchaseKey, type VoiceUsage } from "@/lib/usage-api";
import { BuyDialog, buyBlocker } from "./buy-dialog";
import { periodInfo, useUsageOverview } from "./usage-shell";
import { Bar, Modal, Pill, Rule, Skeleton, Toast, U, dateTime, dateUtc, ghostBtn, h2, money2, pctOf, primaryBtn, section, selectStyle, sub, th, theadRow, toneFor, tr } from "./usage-ui";

type VTab = "ai" | "local" | "tollfree" | "seats" | "human" | "analysis";
const mn = (n: number) => `${Math.round(n * 10) / 10} min`;

function rate(v: VoiceUsage, metric: string, numberType?: string): number | null {
  const r = v.prices.find((p) => p.metricCode === metric && (numberType == null || p.numberType === numberType) && (metric !== "voice_minutes" || p.countryCode === "US"));
  return r ? r.unitPriceUsd / r.per : null;
}

const REASONS: Record<string, string> = {
  "usage:voice_limit_reached": "your voice limit couldn't cover the longest allowed call",
  "usage:trial": "AI calls are off during the free trial",
  "usage:receptionist_not_in_plan": "AI Receptionist isn't in your plan",
  "usage:receptionist_not_confirmed_for_plan": "AI Receptionist isn't confirmed for your plan",
  "usage:subscription_not_active": "the subscription isn't active",
  "usage:no_published_rate": "no AI Receptionist rate is published",
  agent_capacity_reached: "the agent was already at its concurrent-call limit",
};

export function VoicePage() {
  const ov = useUsageOverview();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["usage", "voice"], queryFn: fetchVoiceUsage });
  const [tab, setTab] = useState<VTab>("ai");
  const [capIn, setCapIn] = useState<string | null>(null);
  const [maxIn, setMaxIn] = useState<string | null>(null);
  const [formErr, setFormErr] = useState("");
  const [confirm, setConfirm] = useState<{ cap: number; max: number } | null>(null);
  const [buyKey, setBuyKey] = useState<PurchaseKey | null>(null);
  const [hm, setHm] = useState("all");
  const [hs, setHs] = useState("all");
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 4800);
  };
  const save = useMutation({
    mutationFn: (c: { cap: number; max: number }) => updateSpendCap("voice", { capUsd: c.cap, maxCallMinutes: c.max }),
    onSuccess: () => {
      setConfirm(null);
      setCapIn(null);
      setMaxIn(null);
      void qc.invalidateQueries({ queryKey: ["usage"] });
      flash("Spending controls saved. The change is recorded in your usage history.");
    },
    onError: (e) => {
      setConfirm(null);
      flash(e instanceof ApiError ? e.message : "Couldn't save the controls.");
    },
  });

  if (!ov.data) return null;
  if (q.isLoading) return <Skeleton rows={3} />;
  if (!q.data) return <div style={{ fontSize: 12.5, color: U.muted }}>Voice usage couldn&apos;t be loaded. Try again.</div>;
  const o = ov.data;
  const v = q.data;
  const p = periodInfo(o);
  const trial = o.set.status === "trialing";
  const included = v.receptionist === true;
  const aiRate = rate(v, "ai_voice_minutes");
  const humanRate = rate(v, "voice_minutes");
  const anRate = rate(v, "speech_analysis_minutes");
  const localRate = rate(v, "phone_numbers_local");
  const tollRate = rate(v, "phone_numbers_tollfree");
  const seatRate = rate(v, "agent_seats");
  const local = v.numbers.filter((n) => !n.tollfree);
  const toll = v.numbers.filter((n) => n.tollfree);
  const aiCalls = v.calls.filter((c) => c.handledBy.startsWith("AI"));
  const humanCalls = v.calls.filter((c) => c.humanBillableMin > 0 || c.handledBy === "Human");
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const aiBill = sum(v.calls.map((c) => c.aiBillableMin));
  const aiCharge = sum(v.calls.map((c) => c.aiChargeUsd));
  const huBill = sum(v.calls.map((c) => c.humanBillableMin));
  const huCharge = sum(v.calls.map((c) => c.humanChargeUsd));
  const rentLocal = local.length * (localRate ?? 0);
  const rentToll = toll.length * (tollRate ?? 0);
  const seatCharge = v.agentSeats.filter((s) => s.active).length * (seatRate ?? 0);
  const cap = v.spendCap;
  const capPct = pctOf(cap.spentUsd + cap.reservedUsd, cap.capUsd);
  const capTone = toneFor(capPct);
  const perCall = (v.maxCallMinutes || 10) * (aiRate ?? 0);
  const entLabel = trial ? "Not available during the trial" : v.receptionist == null ? "Not confirmed for your plan" : included ? "AI Receptionist included" : `Not included in ${o.set.planName}`;
  const pill = (t: string, ok: boolean) => ({ t, bg: ok ? U.greenSoft : U.line, fg: ok ? "var(--app-primary-hover)" : U.text3 });

  const cards: { k: VTab; name: string; big: string; unit: string; status: ReturnType<typeof pill>; stats: [string, string][]; line: string }[] = [
    { k: "ai", name: "AI Receptionist minutes", big: mn(aiBill), unit: "billable", status: included && !trial ? pill("Pay as you go", true) : pill(trial ? "Off in trial" : "Not included", false), stats: [["Included", "Pay as you go"], ["Calls answered", String(aiCalls.filter((c) => c.aiBillableMin > 0).length)], ["Total minutes", mn(sum(aiCalls.map((c) => c.durationMin)))], ["Current charges", money2(aiCharge)]], line: `${aiRate == null ? "No published rate" : `${money2(aiRate)} per minute`} · ${p.label}` },
    { k: "local", name: "Local phone numbers", big: String(local.length), unit: "active", status: pill(local.length ? "Active" : "None", !!local.length), stats: [["In use", String(local.length)], ["Price", localRate == null ? "—" : `${money2(localRate)} / number / mo`], ["Billing", "Monthly rental"], ["Monthly rental", money2(rentLocal)]], line: `Recurring rental · next billing ${dateUtc(o.set.billingPeriod.end)}` },
    { k: "tollfree", name: "Toll-free numbers", big: String(toll.length), unit: "active", status: pill(toll.length ? "Active" : "None", !!toll.length), stats: [["In use", String(toll.length)], ["Price", tollRate == null ? "—" : `${money2(tollRate)} / number / mo`], ["Billing", "Monthly rental"], ["Monthly rental", money2(rentToll)]], line: "Recurring rental · where the phone provider supports it" },
    { k: "seats", name: "Human agent seats", big: String(v.agentSeats.filter((s) => s.active).length), unit: "in use", status: pill(v.agentSeats.length ? "Active" : "None", !!v.agentSeats.length), stats: [["Active", String(v.agentSeats.filter((s) => s.active).length)], ["Inactive", String(v.agentSeats.filter((s) => !s.active).length)], ["Price", seatRate == null ? "—" : `${money2(seatRate)} / seat / mo`], ["Monthly", money2(seatCharge)]], line: "Recurring seat · separate from Noxtill user seats" },
    { k: "human", name: "Human call minutes", big: mn(huBill), unit: "billable", status: pill(humanCalls.length ? "Pay as you go" : "No usage", !!humanCalls.length), stats: [["Included", "Pay as you go"], ["Calls", String(humanCalls.length)], ["Rate", humanRate == null ? "—" : `${money2(humanRate)}/min (US only)`], ["Current charges", money2(huCharge)]], line: "Usage · other countries need an approved rate" },
    { k: "analysis", name: "Speech quality analysis", big: "—", unit: "not metered", status: pill(v.speechAnalysisTracked ? "Pay as you go" : "Not tracked", false), stats: [["Rate", anRate == null ? "—" : `${money2(anRate)} / analyzed min`], ["Analyzed calls", "—"], ["Minutes", "—"], ["Charges", money2(0)]], line: "Not metered yet — nothing is charged for it" },
  ];

  const rowStatus = (c: VoiceUsage["calls"][number]) => (c.rejectedReason ? ["Not answered by AI — not charged", U.dangerBg, U.danger] : c.status === "in_progress" ? ["In progress", U.warnBg, U.warnText] : c.status === "missed" ? ["Missed — not charged", U.line, U.text3] : ["Completed", U.greenSoft, "var(--app-primary-hover)"]);
  const callsTable = (calls: VoiceUsage["calls"], meter: "ai" | "human") =>
    calls.length ? (
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 820 }}>
          <thead>
            <tr style={theadRow}>
              {["Date", "ID", "Handled by", "From"].map((x, i) => (
                <th key={x} style={{ ...th, padding: i === 0 ? "10px 20px" : 10 }}>{x}</th>
              ))}
              <th style={{ ...th, textAlign: "right" }}>Duration</th>
              <th style={{ ...th, textAlign: "right" }}>Billable</th>
              <th style={{ ...th, textAlign: "right" }}>Charge</th>
              <th style={{ ...th, padding: "10px 20px 10px 10px" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((c) => {
              const [st, bg, fg] = rowStatus(c);
              const bill = meter === "ai" ? c.aiBillableMin : c.humanBillableMin;
              const charge = meter === "ai" ? c.aiChargeUsd : c.humanChargeUsd;
              return (
                <tr key={c.id} style={tr}>
                  <td style={{ padding: "10px 20px", color: U.text3, whiteSpace: "nowrap" }}>{dateTime(c.startedAt)}</td>
                  <td style={{ padding: 10, fontFamily: "ui-monospace,Menlo,monospace", fontSize: 11.5, color: U.text2 }}>{c.callSid.slice(-8)}</td>
                  <td style={{ padding: 10, color: U.text2 }}>{c.handledBy}{c.isTestCall ? " · test" : ""}</td>
                  <td style={{ padding: 10, color: U.text3 }}>{c.from}</td>
                  <td style={{ padding: 10, textAlign: "right", color: U.text3, whiteSpace: "nowrap" }}>{mn(c.durationMin)}</td>
                  <td style={{ padding: 10, textAlign: "right", fontWeight: 700, color: U.text, whiteSpace: "nowrap" }}>{mn(bill)}</td>
                  <td style={{ padding: 10, textAlign: "right", fontWeight: 800, color: U.text }}>{meter === "human" && c.humanRateMissing ? "No approved rate" : money2(charge)}</td>
                  <td style={{ padding: "10px 20px 10px 10px", whiteSpace: "nowrap" }}>
                    <Pill bg={bg} fg={fg}>
                      {st}
                    </Pill>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    ) : null;

  const detail = (() => {
    const fact = (k: string, val: string) => (
      <div key={k} style={{ background: U.subtle, borderRadius: 10, padding: "10px 12px" }}>
        <dt style={{ fontSize: 11, color: U.muted, fontWeight: 600 }}>{k}</dt>
        <dd style={{ margin: "4px 0 0", fontSize: 14, fontWeight: 800, color: U.text }}>{val}</dd>
      </div>
    );
    if (tab === "ai")
      return { title: "AI Receptionist minutes", desc: "Calls answered by your AI Receptionist, charged per minute of the AI part of the call.", facts: [fact("Calls handled", String(aiCalls.length)), fact("Billable minutes", mn(aiBill)), fact("Price", aiRate == null ? "—" : `${money2(aiRate)} / min`), fact("Current charges", money2(aiCharge))], body: callsTable(aiCalls, "ai"), empty: aiCalls.length ? "" : "No AI calls this period.", note: "AI Receptionist minutes never use AI credits. Durations are charged as recorded, to the hundredth of a minute.", buy: null as PurchaseKey | null };
    if (tab === "local" || tab === "tollfree") {
      const list = tab === "local" ? local : toll;
      const r = tab === "local" ? localRate : tollRate;
      return {
        title: tab === "local" ? "Local phone numbers" : "Toll-free numbers",
        desc: "Monthly rental. This is a recurring charge, not a usage allowance.",
        facts: [fact("Active numbers", String(list.length)), fact("Monthly rental", r == null ? "—" : `${money2(r)} / number`), fact("Total monthly", money2(list.length * (r ?? 0))), fact("Next renewal", dateUtc(o.set.billingPeriod.end))],
        body: list.length ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 520 }}>
              <thead>
                <tr style={theadRow}>
                  <th style={{ ...th, padding: "10px 20px" }}>Number</th>
                  <th style={th}>Active since</th>
                  <th style={{ ...th, textAlign: "right" }}>Monthly</th>
                  <th style={{ ...th, padding: "10px 20px 10px 10px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((n) => (
                  <tr key={n.number} style={tr}>
                    <td style={{ padding: "10px 20px", fontWeight: 700, color: U.text }}>{n.number}</td>
                    <td style={{ padding: 10, color: U.text3 }}>{dateUtc(n.since)}</td>
                    <td style={{ padding: 10, textAlign: "right", fontWeight: 800, color: U.text }}>{r == null ? "—" : money2(r)}</td>
                    <td style={{ padding: "10px 20px 10px 10px" }}>
                      <Pill bg={U.greenSoft} fg="var(--app-primary-hover)">
                        Active
                      </Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null,
        empty: list.length ? "" : tab === "local" ? "No local numbers yet." : "No toll-free numbers. Availability depends on the phone provider and region.",
        note: "",
        buy: (tab === "local" ? "localnum" : "tollfree") as PurchaseKey,
      };
    }
    if (tab === "seats")
      return {
        title: "Human agent seats",
        desc: "Seats for staff who take calls. These are separate from your Noxtill user seats.",
        facts: [fact("In use", String(v.agentSeats.filter((s) => s.active).length)), fact("Inactive", String(v.agentSeats.filter((s) => !s.active).length)), fact("Monthly charges", money2(seatCharge))],
        body: v.agentSeats.length ? (
          <>
            {v.agentSeats.map((s, i) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 20px", borderTop: `1px solid ${U.line}`, fontSize: 12.5, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 800, color: U.text, width: 70 }}>Seat {i + 1}</span>
                <span style={{ flex: 1, minWidth: 140, color: U.text2 }}>{s.name}</span>
                <span style={{ fontWeight: 800, color: U.text }}>{seatRate == null ? "—" : `${money2(seatRate)} / month`}</span>
                <Pill bg={s.active ? U.greenSoft : U.line} fg={s.active ? "var(--app-primary-hover)" : U.text3}>
                  {s.active ? "Assigned" : "Inactive"}
                </Pill>
              </div>
            ))}
          </>
        ) : null,
        empty: v.agentSeats.length ? "" : "No agent seats. A seat is only added when you approve it.",
        note: "Each person can hold one seat.",
        buy: "agentseat" as PurchaseKey,
      };
    if (tab === "human")
      return { title: "Human call minutes", desc: "Calls handled by your staff, charged per minute.", facts: [fact("Total calls", String(humanCalls.length)), fact("Billable minutes", mn(huBill)), fact("Rate (US)", humanRate == null ? "—" : `${money2(humanRate)} / min`), fact("Other countries", "No approved rate"), fact("Current charges", money2(huCharge))], body: callsTable(humanCalls, "human"), empty: humanCalls.length ? "" : "No human calls this period.", note: "Calls to countries without an approved rate are recorded but not charged.", buy: null };
    return { title: "Speech quality analysis", desc: "Call recordings analyzed for quality, charged per analyzed minute.", facts: [fact("Rate", anRate == null ? "—" : `${money2(anRate)} / min`), fact("Metered minutes", "Not tracked")], body: null, empty: "Speech quality analysis has a published price, but Noxtill doesn't meter analyzed minutes yet — so nothing is counted or charged for it.", note: "", buy: null };
  })();

  const breakRows: [string, string, string, string, number][] = [
    ["AI Receptionist", `${aiCalls.filter((c) => c.aiBillableMin > 0).length} answered calls`, mn(aiBill), aiRate == null ? "—" : `${money2(aiRate)} / min`, aiCharge],
    ["Human calls (US)", `${humanCalls.length} calls`, mn(huBill), humanRate == null ? "—" : `${money2(humanRate)} / min`, huCharge],
    ["Local numbers", "Monthly rental", String(local.length), localRate == null ? "—" : `${money2(localRate)} / mo`, rentLocal],
    ["Toll-free numbers", "Monthly rental", String(toll.length), tollRate == null ? "—" : `${money2(tollRate)} / mo`, rentToll],
    ["Human agent seats", "Monthly seat", String(v.agentSeats.filter((s) => s.active).length), seatRate == null ? "—" : `${money2(seatRate)} / mo`, seatCharge],
  ];
  const hist = v.calls.filter((c) => (hm === "all" || (hm === "ai" ? c.aiBillableMin > 0 || c.handledBy.startsWith("AI") : c.humanBillableMin > 0)) && (hs === "all" || rowStatus(c)[0] === hs));

  return (
    <>
      <section style={{ ...section, padding: "16px 20px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h2 style={h2}>Voice &amp; Calling</h2>
          <p style={sub}>Your phone numbers, AI receptionist usage, human calls and voice-related charges.</p>
        </div>
        <Pill bg={included && !trial ? U.greenSoft : U.line} fg={included && !trial ? "var(--app-primary-hover)" : U.text3} style={{ padding: "4px 10px" }}>
          {entLabel}
        </Pill>
        <Link href="/receptionist" style={{ ...ghostBtn(false, { minHeight: 40, padding: "9px 13px", fontSize: 12 }), textDecoration: "none" }}>
          Set up in AI Phone Receptionist
        </Link>
      </section>
      {!included || trial ? (
        <div role="status" style={{ background: U.subtle, border: `1px solid ${U.border}`, borderRadius: 12, padding: "12px 15px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240, fontSize: 12.5, color: U.text2, lineHeight: 1.55 }}>
            <strong style={{ color: U.text }}>{trial ? "AI calls are off during the free trial." : v.receptionist == null ? "AI Receptionist isn't confirmed for your plan yet." : `AI Receptionist isn't included in ${o.set.planName}.`}</strong>{" "}
            {trial ? "Calls aren't answered by AI and nothing is charged until you choose a plan." : `${o.catalog.plans.filter((x) => x.entitlements.ai_phone_receptionist && x.purchasable).map((x) => x.name).join(", ")} include it.`}
          </div>
          <Link href="/settings/usage/limits" style={{ fontSize: 12, fontWeight: 800 }}>
            View plans
          </Link>
        </div>
      ) : null}
      {included && !trial && capPct >= 50 ? (
        <div role="status" style={{ background: capPct >= 100 ? U.dangerBg : U.amberBg, border: `1px solid ${capPct >= 100 ? U.dangerLine : U.warnLine}`, borderRadius: 12, padding: "12px 15px" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: capPct >= 100 ? U.danger : U.warnText }}>{capPct >= 100 ? "Voice spending limit reached" : `${capPct}% of your voice limit used`}</div>
          <div style={{ fontSize: 12.5, color: U.text2, marginTop: 3, lineHeight: 1.55 }}>
            {money2(cap.spentUsd)} of {money2(cap.capUsd)} used this period. {money2(cap.remainingUsd)} left. Each new AI call needs {money2(perCall)} available to be answered. Calls in progress aren&apos;t cut off.
          </div>
        </div>
      ) : null}

      <section data-r2="1" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 }}>
        {cards.map((c) => (
          <button key={c.k} type="button" aria-pressed={c.k === tab} onClick={() => setTab(c.k)} style={{ textAlign: "left", background: "#fff", border: `1px solid ${c.k === tab ? U.green : U.border}`, borderRadius: 14, padding: 15, display: "flex", flexDirection: "column", gap: 10, cursor: "pointer", font: "inherit", boxShadow: c.k === tab ? "0 0 0 3px rgba(18,161,80,.10)" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 800, color: U.text }}>{c.name}</span>
              <Pill bg={c.status.bg} fg={c.status.fg} size={10.5}>
                {c.status.t}
              </Pill>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.5px", color: U.ink }}>{c.big}</span>
              <span style={{ fontSize: 12, color: U.muted, fontWeight: 600 }}>{c.unit}</span>
            </div>
            <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8, width: "100%" }}>
              {c.stats.map(([k, val]) => (
                <div key={k}>
                  <dt style={{ fontSize: 11, color: U.muted, fontWeight: 600 }}>{k}</dt>
                  <dd style={{ margin: "2px 0 0", fontSize: 12.5, fontWeight: 800, color: U.text }}>{val}</dd>
                </div>
              ))}
            </dl>
            <div style={{ fontSize: 11.5, color: U.muted, lineHeight: 1.45, borderTop: `1px solid ${U.line}`, paddingTop: 8, width: "100%" }}>{c.line}</div>
          </button>
        ))}
      </section>

      <section style={{ ...section, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px 12px", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h2 style={h2}>{detail.title}</h2>
            <p style={sub}>{detail.desc}</p>
          </div>
          {detail.buy ? (
            <button type="button" title={buyBlocker(o, detail.buy) ?? undefined} onClick={() => setBuyKey(detail.buy)} style={primaryBtn(!!buyBlocker(o, detail.buy), { minHeight: 40, padding: "9px 14px" })}>
              {detail.buy === "localnum" ? `Add local number${localRate != null ? ` · ${money2(localRate).replace(".00", "")}/month` : ""}` : detail.buy === "tollfree" ? `Add toll-free number${tollRate != null ? ` · ${money2(tollRate).replace(".00", "")}/month` : ""}` : `Add agent seat${seatRate != null ? ` · ${money2(seatRate).replace(".00", "")}/month` : ""}`}
            </button>
          ) : null}
        </div>
        <dl style={{ margin: 0, padding: "0 20px 14px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10 }}>{detail.facts}</dl>
        {detail.body}
        {detail.empty ? <div style={{ padding: "18px 20px", borderTop: `1px solid ${U.line}`, fontSize: 12.5, color: U.muted }}>{detail.empty}</div> : null}
        {detail.note ? <div style={{ padding: "11px 20px", borderTop: `1px solid ${U.line}`, fontSize: 11.5, color: U.muted, lineHeight: 1.5 }}>{detail.note}</div> : null}
      </section>

      <div data-r2="1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
        <section style={{ ...section, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h2 style={{ ...h2, flex: 1 }}>Spending controls</h2>
            <Pill bg={capTone.bg} fg={capTone.fg}>
              {capTone.label}
            </Pill>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: U.ink, letterSpacing: "-.5px" }}>{money2(cap.spentUsd)}</span>
            <span style={{ fontSize: 12, color: U.muted, fontWeight: 600 }}>of {money2(cap.capUsd)} monthly usage limit</span>
          </div>
          <Bar pct={capPct} reservedPct={pctOf(cap.reservedUsd, cap.capUsd)} color={capTone.bar} height={8} label="Voice spend" />
          <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
            {[
              ["Remaining", money2(cap.remainingUsd)],
              ["Set aside for live calls", money2(cap.reservedUsd)],
              ["Needed per new AI call", money2(perCall)],
              ["Rentals & seats (not capped)", `${money2(rentLocal + rentToll + seatCharge)} / mo`],
            ].map(([k, val]) => (
              <div key={k} style={{ background: U.subtle, borderRadius: 10, padding: "9px 11px" }}>
                <dt style={{ fontSize: 11, color: U.muted, fontWeight: 600 }}>{k}</dt>
                <dd style={{ margin: "3px 0 0", fontSize: 13, fontWeight: 800, color: U.text }}>{val}</dd>
              </div>
            ))}
          </dl>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10, borderTop: `1px solid ${U.line}`, paddingTop: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 700, color: U.text2 }}>
              Monthly usage limit (USD)
              <input type="number" min={1} step={1} value={capIn ?? String(cap.capUsd)} onChange={(e) => { setCapIn(e.target.value); setFormErr(""); }} style={{ padding: "9px 11px", border: `1px solid ${U.border}`, borderRadius: 9, fontSize: 13, background: U.subtle, minHeight: 42 }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 700, color: U.text2 }}>
              Maximum call length (minutes)
              <input type="number" min={1} max={60} step={1} value={maxIn ?? String(v.maxCallMinutes)} onChange={(e) => { setMaxIn(e.target.value); setFormErr(""); }} style={{ padding: "9px 11px", border: `1px solid ${U.border}`, borderRadius: 9, fontSize: 13, background: U.subtle, minHeight: 42 }} />
            </label>
          </div>
          <div style={{ fontSize: 11.5, color: U.muted, lineHeight: 1.5 }}>When the limit can&apos;t cover a new AI call, the call goes to your team using your AI Phone Receptionist transfer settings — the same path used when the AI is unavailable.</div>
          {formErr ? <div role="alert" style={{ fontSize: 12, color: U.danger, fontWeight: 700 }}>{formErr}</div> : null}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => {
                const c = Math.floor(Number(capIn ?? cap.capUsd));
                const mx = Math.floor(Number(maxIn ?? v.maxCallMinutes));
                if (!(c >= 1)) return setFormErr("Enter a monthly limit of $1 or more.");
                if (!(mx >= 1 && mx <= 60)) return setFormErr("Maximum call length must be 1 to 60 minutes.");
                setConfirm({ cap: c, max: mx });
              }}
              style={primaryBtn(false, { minHeight: 40, padding: "9px 15px" })}
            >
              Review &amp; save
            </button>
          </div>
        </section>
        <section style={{ ...section, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h2 style={{ ...h2, flex: 1 }}>Call admission check</h2>
            <Pill bg={U.infoBg} fg={U.info} size={10.5}>
              Live log
            </Pill>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: U.muted, lineHeight: 1.55 }}>
            Before the AI answers a call, Noxtill checks your plan and your remaining limit, then sets aside the cost of the longest allowed call. When the call ends, only the real minutes are charged and the rest is released. Calls in progress are never cut off.
          </p>
          <div aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {v.admissions.length === 0 ? <div style={{ fontSize: 12, color: U.muted }}>No AI call admissions yet this period.</div> : null}
            {v.admissions.map((a, i) => {
              const dot = a.kind === "declined" ? U.danger : a.state === "committed" ? U.green : a.state === "reserved" ? "#F79009" : "#3538CD";
              const text =
                a.kind === "declined"
                  ? `Not answered by AI: ${REASONS[a.reason ?? ""] ?? a.reason}. Sent to the team; nothing charged.`
                  : a.state === "reserved"
                    ? `Call answered. ${money2(a.amountUsd)} set aside — in progress.`
                    : a.state === "committed"
                      ? `Call ended. Charged ${money2(a.actualUsd ?? 0)}; the rest of the ${money2(a.amountUsd)} set aside was released.`
                      : `${money2(a.amountUsd)} released — nothing charged${a.reason ? ` (${a.reason})` : ""}.`;
              return (
                <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, lineHeight: 1.45, color: U.text2 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot, flex: "0 0 7px", marginTop: 5 }} />
                  <span>
                    {text} <span style={{ color: U.faint }}>{dateTime(a.at)}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section style={{ ...section, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px 12px" }}>
          <h2 style={h2}>Charges this period</h2>
          <p style={sub}>{p.label} · usage charges build up during the period; rentals and seats are billed each renewal</p>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 720 }}>
            <thead>
              <tr style={theadRow}>
                <th style={{ ...th, padding: "10px 20px" }}>Service</th>
                <th style={th}>Why</th>
                <th style={{ ...th, textAlign: "right" }}>Quantity</th>
                <th style={{ ...th, textAlign: "right" }}>Noxtill price</th>
                <th style={{ ...th, textAlign: "right" }}>Tax</th>
                <th style={{ ...th, padding: "10px 20px 10px 10px", textAlign: "right" }}>Your charge</th>
              </tr>
            </thead>
            <tbody>
              {breakRows.map(([k, why, qty, r, val]) => (
                <tr key={k} style={tr}>
                  <td style={{ padding: "10px 20px", fontWeight: 700, color: U.text }}>{k}</td>
                  <td style={{ padding: 10, color: U.text3 }}>{why}</td>
                  <td style={{ padding: 10, textAlign: "right", color: U.text2, whiteSpace: "nowrap" }}>{qty}</td>
                  <td style={{ padding: 10, textAlign: "right", color: U.text2, whiteSpace: "nowrap" }}>{r}</td>
                  <td style={{ padding: 10, textAlign: "right", color: U.text3 }}>On invoice</td>
                  <td style={{ padding: "10px 20px 10px 10px", textAlign: "right", fontWeight: 800, color: U.text }}>{money2(val)}</td>
                </tr>
              ))}
              <tr style={{ ...tr, background: U.subtle }}>
                <td style={{ padding: "10px 20px", fontWeight: 800, color: U.text }} colSpan={5}>
                  Total before tax
                </td>
                <td style={{ padding: "10px 20px 10px 10px", textAlign: "right", fontWeight: 800, color: U.text }}>{money2(sum(breakRows.map((b) => b[4])))}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ padding: "11px 20px", borderTop: `1px solid ${U.line}`, fontSize: 11.5, color: U.muted, lineHeight: 1.5 }}>Tax is calculated on your invoice. Each part of a call is charged once on one meter: when a call is transferred, the AI part counts as AI Receptionist minutes and the human part as human call minutes.</div>
      </section>

      <section style={{ ...section, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", flexWrap: "wrap", borderBottom: `1px solid ${U.line}` }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h2 style={h2}>Voice usage history</h2>
            <p style={sub}>
              {hist.length} of {v.calls.length} calls · this billing period
            </p>
          </div>
          <select value={hm} onChange={(e) => setHm(e.target.value)} aria-label="Usage category" style={selectStyle}>
            <option value="all">All categories</option>
            <option value="ai">AI Receptionist</option>
            <option value="human">Human calls</option>
          </select>
          <select value={hs} onChange={(e) => setHs(e.target.value)} aria-label="Status" style={selectStyle}>
            <option value="all">Any status</option>
            {Array.from(new Set(v.calls.map((c) => rowStatus(c)[0]))).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        {callsTable(hist, hm === "human" ? "human" : "ai")}
        {hist.length === 0 ? <div style={{ padding: 24, textAlign: "center", fontSize: 12.5, color: U.muted }}>No voice usage matches these filters.</div> : null}
      </section>

      <section style={{ ...section, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 9 }}>
        <h2 style={{ ...h2, fontSize: 14 }}>How it&apos;s counted</h2>
        <Rule>A call is never charged as both voice minutes and AI credits.</Rule>
        <Rule>A billable AI call can&apos;t start unless your limit covers the longest allowed call.</Rule>
        <Rule>Calls to countries without an approved rate are recorded but not charged.</Rule>
      </section>

      {confirm ? (
        <Modal title="Save spending controls?" onClose={() => setConfirm(null)}>
          <Rule>Your monthly voice usage limit will be {money2(confirm.cap)}. Rentals and seats are billed separately.</Rule>
          <Rule>
            A new AI call is answered only if {money2(confirm.max * (aiRate ?? 0))} ({confirm.max} minutes) is still available.
          </Rule>
          <Rule>When the limit can&apos;t cover a call, it goes to your team. Calls in progress aren&apos;t cut off.</Rule>
          <Rule>You&apos;ll get alerts at 50%, 75%, 90% and 100%. Nothing is charged beyond this limit.</Rule>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
            <button type="button" onClick={() => setConfirm(null)} style={ghostBtn()}>
              Cancel
            </button>
            <button type="button" disabled={save.isPending} onClick={() => save.mutate(confirm)} style={primaryBtn()}>
              Save controls
            </button>
          </div>
        </Modal>
      ) : null}
      {buyKey ? <BuyDialog o={o} k={buyKey} onClose={() => setBuyKey(null)} onDone={(m) => { setBuyKey(null); flash(m); }} /> : null}
      <Toast message={toast} />
    </>
  );
}
