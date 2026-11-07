"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { inviteStaff } from "@/lib/staff-api";
import { downloadUsageCsv, fetchCreditsByFeature, fetchUsageHistory, type ResolvedMetric, type UsageOverview } from "@/lib/usage-api";
import { BuyDialog, buyBlocker, buyLabel, priceFor } from "./buy-dialog";
import { periodInfo, useUsageOverview } from "./usage-shell";
import { Bar, Fact, Pill, Rule, Toast, U, bytes, dateTime, dateUtc, fmtInt, ghostBtn, greyTone, h2, inputStyle, money2, pctOf, primaryBtn, section, selectStyle, sub, td, th, theadRow, toneFor, tr, type Tone } from "./usage-ui";
import type { PurchaseKey } from "@/lib/usage-api";

// ---------------------------------------------------------------- shared helpers

const limitOf = (m: ResolvedMetric | undefined) => (m && m.included != null ? m.included + m.purchased : null);
const usedOf = (m: ResolvedMetric | undefined) => (m ? m.used + m.reserved : 0);

function useToast() {
  const [toast, setToast] = useState<string | null>(null);
  return {
    toast,
    flash: (m: string) => {
      setToast(m);
      setTimeout(() => setToast(null), 4800);
    },
  };
}

function BuyButton({ o, k, onOpen, primary = false }: { o: UsageOverview; k: PurchaseKey; onOpen: (k: PurchaseKey) => void; primary?: boolean }) {
  const blocked = buyBlocker(o, k);
  return (
    <button
      type="button"
      title={blocked ?? undefined}
      onClick={() => onOpen(k)}
      style={primary ? primaryBtn(!!blocked, { minHeight: 40, padding: "9px 15px" }) : ghostBtn(!!blocked, { minHeight: 40, padding: "9px 13px", fontSize: 12 })}
    >
      {buyLabel(o, k)}
    </button>
  );
}

interface Card {
  name: string;
  page: string;
  usedText: string;
  ofText: string;
  pct: number | null;
  remText: string;
  pctText: string;
  reset: string;
  note?: string;
  tone: Tone;
}

function MetricCard({ c }: { c: Card }) {
  return (
    <Link href={`/settings/usage/${c.page}`} style={{ ...section, padding: 15, display: "flex", flexDirection: "column", gap: 10, color: U.text, textDecoration: "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: U.text2 }}>{c.name}</span>
        <Pill bg={c.tone.bg} fg={c.tone.fg} size={10.5}>
          {c.tone.label}
        </Pill>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.5px", color: U.ink }}>{c.usedText}</span>
        <span style={{ fontSize: 12, color: U.muted, fontWeight: 600 }}>{c.ofText}</span>
      </div>
      {c.pct != null ? <Bar pct={c.pct} color={c.tone.bar} label={c.name} /> : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 6, fontSize: 11, color: U.muted }}>
        {[
          ["Remaining", c.remText],
          ["Used", c.pctText],
          ["Resets", c.reset],
        ].map(([k, v]) => (
          <div key={k}>
            <div style={{ fontWeight: 600 }}>{k}</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: U.text, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v}</div>
          </div>
        ))}
      </div>
      {c.note ? <div style={{ fontSize: 11.5, color: U.muted, lineHeight: 1.45, borderTop: `1px solid ${U.line}`, paddingTop: 8 }}>{c.note}</div> : null}
    </Link>
  );
}

function metricCard(o: UsageOverview, name: string, page: string, code: string, unit: string, opts: { reset?: string; display?: (n: number) => string } = {}): Card {
  const m = o.set.metrics[code];
  const p = periodInfo(o);
  const show = opts.display ?? fmtInt;
  const used = usedOf(m);
  const limit = limitOf(m);
  if (!m || limit == null) {
    return {
      name,
      page,
      usedText: show(used),
      ofText: m?.enforced ? "allowance not configured" : "counted · no limit set yet",
      pct: null,
      remText: "—",
      pctText: "—",
      reset: "—",
      note: m?.enforced
        ? "Allowance not confirmed yet. Usage is paused and nothing is charged."
        : "Allowance not confirmed yet. This is counted but not limited, and nothing is charged for it.",
      tone: { ...greyTone, label: m?.enforced ? "Not configured" : "Counted only" },
    };
  }
  const pct = pctOf(used, limit);
  return {
    name,
    page,
    usedText: show(used),
    ofText: `of ${show(limit)} ${unit}`,
    pct,
    remText: show(Math.max(0, limit - used)),
    pctText: `${pct}%`,
    reset: opts.reset ?? (m.resetsAt ? p.reset : "Capacity"),
    tone: toneFor(pct),
  };
}

function spendCard(o: UsageOverview, name: string, page: string, group: "voice" | "messaging", note?: string): Card {
  const c = o.set.spendCaps[group];
  const p = periodInfo(o);
  const pct = pctOf(c.spentUsd + c.reservedUsd, c.capUsd);
  const trialOff = o.set.status === "trialing";
  return {
    name,
    page,
    usedText: money2(c.spentUsd),
    ofText: `of ${money2(c.capUsd)} limit`,
    pct: trialOff ? null : pct,
    remText: money2(c.remainingUsd),
    pctText: `${pct}%`,
    reset: p.reset,
    note: trialOff ? "Off during the free trial. Nothing is sent or charged." : note,
    tone: trialOff ? { ...greyTone, label: "Off in trial" } : toneFor(pct),
  };
}

// ---------------------------------------------------------------- Overview

export function OverviewPage() {
  const q = useUsageOverview();
  if (!q.data) return null;
  const o = q.data;
  const p = periodInfo(o);
  const s = o.set;
  const credits = s.metrics.ai_credits;
  const users = s.metrics.users;
  const alerts: { title: string; body: string; cta: string; page: string; danger: boolean }[] = [];
  const cl = limitOf(credits);
  if (credits && cl != null) {
    const ap = pctOf(usedOf(credits), cl);
    if (ap >= 100) alerts.push({ danger: true, title: "AI credit limit reached", body: `You've used all ${fmtInt(cl)} AI credits ${p.trial ? "in your trial" : `for this period on ${s.planName}`}. AI features are paused until ${p.reset}. Upgrade your plan or buy a credit pack to continue.`, cta: "View options", page: "ai" });
    else if (ap >= 75) alerts.push({ danger: false, title: `AI credits ${ap}% used`, body: `Your ${s.planName} plan has used ${ap}% of its ${p.trial ? "trial" : "monthly"} AI credits. You have ${fmtInt(credits.remaining ?? 0)} credits remaining. Resets ${p.reset}.`, cta: "See AI usage", page: "ai" });
  }
  const ul = limitOf(users);
  if (users && ul != null && users.used >= ul) {
    const pending = o.people.filter((x) => x.pending).length;
    alerts.push({ danger: true, title: "User limit reached", body: `Your ${s.planName} plan includes ${ul} users. You have ${users.used - pending} active and ${pending} pending. Upgrade your plan or add a seat to invite more.`, cta: "Manage users", page: "team" });
  }
  for (const g of ["voice", "messaging"] as const) {
    const c = s.spendCaps[g];
    const pct = pctOf(c.spentUsd + c.reservedUsd, c.capUsd);
    if (pct >= 75 && s.status !== "trialing")
      alerts.push({ danger: pct >= 100, title: pct >= 100 ? `${g === "voice" ? "Voice" : "Messaging"} spending limit reached` : `${pct}% of your ${g} limit used`, body: `${money2(c.spentUsd)} of ${money2(c.capUsd)} used this period. ${pct >= 100 ? "New " + (g === "voice" ? "AI calls aren't answered" : "messages aren't sent") + " until " + p.reset + " or until you raise the limit." : money2(c.remainingUsd) + " left."}`, cta: "Spending controls", page: g === "voice" ? "voice" : "comm" });
  }
  const storageUsed = o.storage?.bytes ?? 0;
  const cards: Card[] = [
    metricCard(o, "Users", "team", "users", "users"),
    metricCard(o, "Locations", "team", "locations", "locations"),
    metricCard(o, p.trial ? "Trial AI credits" : "AI credits", "ai", "ai_credits", "credits", { reset: p.reset }),
    spendCard(o, "Voice usage", "voice", "voice", s.features.ai_phone_receptionist === false ? `AI Receptionist isn't included in ${s.planName}.` : undefined),
    spendCard(o, "Emails & SMS spending", "comm", "messaging", `${fmtInt(s.metrics.emails?.used ?? 0)} emails · ${fmtInt(s.metrics.sms_segments?.used ?? 0)} SMS segments this period`),
    { ...metricCard(o, "WhatsApp messages", "comm", "whatsapp_messages", "messages"), ofText: "sent", note: "Counted for your visibility. WhatsApp is billed by Meta to your own business account — Noxtill charges nothing.", tone: { ...greyTone, label: "Not billed" } },
    metricCard(o, "Automation runs", "auto", "automation_runs", "runs"),
    { ...metricCard(o, "Storage", "storage", "storage_bytes", "", { display: bytes }), usedText: o.storage ? bytes(storageUsed) : "—" },
    metricCard(o, "Digitizer pages", "digitizer", "digitizer_pages", "pages"),
    metricCard(o, "SEO keywords", "seo", "seo_keywords", "keywords"),
    metricCard(o, "eSign transactions", "esign", "esign_transactions", "transactions"),
  ];
  return (
    <>
      {alerts.map((a) => (
        <div key={a.title} role="status" style={{ background: a.danger ? U.dangerBg : U.amberBg, border: `1px solid ${a.danger ? U.dangerLine : U.warnLine}`, borderRadius: 12, padding: "12px 15px", display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: a.danger ? U.danger : U.warnText }}>{a.title}</div>
            <div style={{ fontSize: 12.5, color: U.text2, marginTop: 3, lineHeight: 1.55 }}>{a.body}</div>
          </div>
          <Link href={`/settings/usage/${a.page}`} style={{ fontSize: 12, fontWeight: 800, alignSelf: "center" }}>
            {a.cta}
          </Link>
        </div>
      ))}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(232px,1fr))", gap: 12 }}>
        {cards.map((c) => (
          <MetricCard key={c.name} c={c} />
        ))}
      </section>
      <div style={{ fontSize: 11.5, color: U.muted, padding: "0 4px" }}>Alerts are sent at 50%, 75%, 90% and 100% of each allowance. An alert never lets you go over a limit.</div>
    </>
  );
}

// ---------------------------------------------------------------- Plan allowances

const ALLOW_ROWS: [string, string, (n: number) => string][] = [
  ["Users", "users", fmtInt],
  ["Locations", "locations", fmtInt],
  ["AI credits", "ai_credits", fmtInt],
  ["Local phone numbers", "phone_numbers_local", fmtInt],
  ["Toll-free numbers", "phone_numbers_tollfree", fmtInt],
  ["Human agent seats", "agent_seats", fmtInt],
  ["Automation runs", "automation_runs", fmtInt],
  ["Storage", "storage_bytes", bytes],
  ["Digitizer pages", "digitizer_pages", fmtInt],
  ["SEO keywords", "seo_keywords", fmtInt],
  ["eSign transactions", "esign_transactions", fmtInt],
  ["Websites", "websites", fmtInt],
];

export function PlanPage() {
  const q = useUsageOverview();
  if (!q.data) return null;
  const o = q.data;
  const p = periodInfo(o);
  const s = o.set;
  const pending = o.purchases.filter((x) => x.status === "pending");
  return (
    <>
      <section style={{ ...section, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={h2}>Your subscription</h2>
        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
          {[
            ["Plan", s.planKey === "trial" && s.scheduledPlanKey ? `Trial → ${o.catalog.plans.find((x) => x.key === s.scheduledPlanKey)?.name}` : s.planName],
            ["Status", p.status],
            ["Billing", p.interval],
            ["Period start", p.start],
            ["Period end", p.end],
            [p.trial ? "Trial ends" : "Next renewal", p.trial ? dateUtc(s.trialEndsAt) : dateUtc(s.billingPeriod.end)],
          ].map(([k, v]) => (
            <Fact key={k} k={k} v={v} big />
          ))}
        </dl>
      </section>
      <section style={{ ...section, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px 12px" }}>
          <h2 style={h2}>Plan allowances</h2>
          <p style={sub}>What your plan includes, plus any extra capacity you&apos;ve bought.</p>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 640 }}>
            <thead>
              <tr style={theadRow}>
                <th style={{ ...th, padding: "10px 20px" }}>Allowance</th>
                {["Included", "Purchased", "Used", "Remaining"].map((h) => (
                  <th key={h} style={{ ...th, padding: "10px 10px", textAlign: "right" }}>{h}</th>
                ))}
                <th style={{ ...th, padding: "10px 20px 10px 10px" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {ALLOW_ROWS.map(([name, code, show]) => {
                const m = s.metrics[code];
                if (!m) return null;
                const lim = limitOf(m);
                const used = code === "storage_bytes" ? (o.storage?.bytes ?? 0) : usedOf(m);
                const tone = lim == null ? { ...greyTone, label: m.enforced ? "Not configured" : "Counted only" } : toneFor(pctOf(used, lim));
                return (
                  <tr key={code} style={tr}>
                    <td style={{ padding: "11px 20px", fontWeight: 700, color: U.text }}>{code === "ai_credits" ? (p.trial ? "AI credits (trial)" : "AI credits / month") : name}</td>
                    <td style={{ padding: "11px 10px", textAlign: "right", color: U.text, fontWeight: 700 }}>{m.included == null ? "Not configured" : show(m.included)}</td>
                    <td style={{ padding: "11px 10px", textAlign: "right", color: U.text3 }}>{show(m.purchased)}</td>
                    <td style={{ padding: "11px 10px", textAlign: "right", color: U.text3 }}>{show(used)}</td>
                    <td style={{ padding: "11px 10px", textAlign: "right", color: U.text, fontWeight: 700 }}>{lim == null ? "—" : show(Math.max(0, lim - used))}</td>
                    <td style={{ padding: "11px 20px 11px 10px" }}>
                      <Pill bg={tone.bg} fg={tone.fg}>
                        {tone.label}
                      </Pill>
                    </td>
                  </tr>
                );
              })}
              {(["emails", "sms_segments", "whatsapp_messages"] as const).map((code) => (
                <tr key={code} style={tr}>
                  <td style={{ padding: "11px 20px", fontWeight: 700, color: U.text }}>{{ emails: "Emails", sms_segments: "SMS segments", whatsapp_messages: "WhatsApp messages" }[code]}</td>
                  <td style={{ padding: "11px 10px", textAlign: "right", color: U.text }} colSpan={1}>
                    Pay as you go
                  </td>
                  <td style={{ padding: "11px 10px", textAlign: "right", color: U.text3 }}>—</td>
                  <td style={{ padding: "11px 10px", textAlign: "right", color: U.text3 }}>{fmtInt(s.metrics[code]?.used ?? 0)}</td>
                  <td style={{ padding: "11px 10px", textAlign: "right", color: U.text3 }}>—</td>
                  <td style={{ padding: "11px 20px 11px 10px" }}>
                    <Pill bg={U.line} fg={U.text3}>
                      {code === "whatsapp_messages" ? "Not billed by Noxtill" : "Within spend limit"}
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {pending.length ? (
        <section style={{ ...section, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px 10px" }}>
            <h2 style={h2}>Capacity requests</h2>
            <p style={sub}>Added to your allowance only once payment is confirmed.</p>
          </div>
          {pending.map((x) => (
            <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 20px", borderTop: `1px solid ${U.line}`, fontSize: 12.5, flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 180, fontWeight: 700, color: U.text }}>
                {fmtInt(x.quantity)} × {x.metricCode.replace(/_/g, " ")}
                <span style={{ fontWeight: 500, color: U.muted }}> · {money2(x.unitPriceUsd)} · {dateTime(x.createdAt)}</span>
              </span>
              <Pill bg={U.warnBg} fg={U.warnText}>
                Awaiting payment confirmation
              </Pill>
            </div>
          ))}
        </section>
      ) : null}
      <div style={{ ...section, padding: "14px 18px", fontSize: 12.5, color: U.text3, lineHeight: 1.55 }}>
        <strong style={{ color: U.text }}>Modules and features by plan.</strong> Noxtill hasn&apos;t confirmed which modules each plan includes yet, so none are listed here. The only plan-gated feature today is AI Phone Receptionist ({o.catalog.plans.filter((x) => x.entitlements.ai_phone_receptionist).map((x) => x.name).join(", ")}).
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Users & locations

function blockMsg(o: UsageOverview, what: "users" | "locations", m: ResolvedMetric | undefined): [string, string] | null {
  const lim = limitOf(m);
  if (o.set.suspended) return ["Your workspace is read-only.", `Adding ${what} is paused until the subscription is active again.`];
  if (!m) return null;
  if (lim == null) return ["Not confirmed for your plan yet.", `The ${what} allowance is awaiting confirmation, so adding more is paused.`];
  if (m.used >= lim) return [`${what === "users" ? "User" : "Location"} limit reached.`, `Your ${o.set.planName} plan includes ${lim} ${what} and you're using ${m.used}. Upgrade, or add one below.`];
  return null;
}

export function TeamPage() {
  const q = useUsageOverview();
  const qc = useQueryClient();
  const t = useToast();
  const [buyKey, setBuyKey] = useState<PurchaseKey | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const inv = useMutation({
    mutationFn: () => inviteStaff({ name: name.trim(), email: email.trim().toLowerCase(), role: "staff", commissionRule: { type: "none" } }),
    onSuccess: (r) => {
      setEmail("");
      setName("");
      void qc.invalidateQueries({ queryKey: ["usage"] });
      t.flash(`Invite created for ${r.email ?? r.name}. It holds a seat until they sign in or you revoke it.`);
    },
    onError: (e) => setErr(e instanceof ApiError ? e.message : "Couldn't send the invite."),
  });
  if (!q.data) return null;
  const o = q.data;
  const users = o.set.metrics.users;
  const locs = o.set.metrics.locations;
  const ub = blockMsg(o, "users", users);
  const lb = blockMsg(o, "locations", locs);
  const pending = o.people.filter((x) => x.pending);
  const active = o.people.filter((x) => x.active && !x.pending);
  const capPanel = (title: string, m: ResolvedMetric | undefined, facts: [string, string][], block: [string, string] | null, extra: ReactNode, purchaseKey: PurchaseKey) => {
    const lim = limitOf(m);
    const tone = lim == null ? greyTone : toneFor(pctOf(m!.used, lim));
    return (
      <section style={{ ...section, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h2 style={{ ...h2, flex: 1 }}>{title}</h2>
          <Pill bg={tone.bg} fg={tone.fg}>
            {tone.label}
          </Pill>
        </div>
        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
          {facts.map(([k, v]) => (
            <div key={k} style={{ background: U.subtle, borderRadius: 10, padding: "9px 11px" }}>
              <dt style={{ fontSize: 10.5, color: U.muted, fontWeight: 600 }}>{k}</dt>
              <dd style={{ margin: "3px 0 0", fontSize: 14, fontWeight: 800, color: U.text }}>{v}</dd>
            </div>
          ))}
        </dl>
        {lim != null ? <Bar pct={pctOf(m!.used, lim)} color={tone.bar} label={title} /> : null}
        {extra}
        {block ? (
          <div role="alert" style={{ background: U.dangerBg, border: `1px solid ${U.dangerLine}`, borderRadius: 10, padding: "10px 12px", fontSize: 12.5, color: U.dangerDeep, lineHeight: 1.55 }}>
            <strong style={{ color: U.danger }}>{block[0]}</strong> {block[1]}
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", borderTop: `1px solid ${U.line}`, paddingTop: 12, alignItems: "center" }}>
          <BuyButton o={o} k={purchaseKey} onOpen={setBuyKey} />
          <Link href="/settings/usage/limits" style={{ fontSize: 12, fontWeight: 800, padding: "0 6px" }}>
            See upgrade options
          </Link>
        </div>
      </section>
    );
  };
  const fmtLim = (m: ResolvedMetric | undefined) => (m?.included == null ? "Not configured" : fmtInt(m.included));
  return (
    <>
      <div data-r2="1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
        {capPanel(
          "Users",
          users,
          [
            ["Included", fmtLim(users)],
            ["Purchased", fmtInt(users?.purchased ?? 0)],
            ["Active", fmtInt(active.length)],
            ["Pending", fmtInt(pending.length)],
            ["In use", fmtInt(users?.used ?? 0)],
            ["Remaining", limitOf(users) == null ? "—" : fmtInt(Math.max(0, limitOf(users)! - (users?.used ?? 0)))],
          ],
          ub,
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input value={name} onChange={(e) => { setName(e.target.value); setErr(""); }} disabled={!!ub} placeholder="Full name" aria-label="Name to invite" style={{ ...inputStyle, flex: "1 1 140px", width: "auto" }} />
              <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); }} disabled={!!ub} placeholder="name@business.com" aria-label="Email to invite" style={{ ...inputStyle, flex: "1 1 180px", width: "auto", borderColor: err ? "#F04438" : undefined }} />
              <button
                type="button"
                disabled={!!ub || inv.isPending}
                onClick={() => {
                  if (!name.trim()) return setErr("Enter their name.");
                  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErr("Enter a valid email address.");
                  inv.mutate();
                }}
                style={primaryBtn(!!ub)}
              >
                Send invite
              </button>
            </div>
            {err ? <div role="alert" style={{ fontSize: 12, color: U.danger, fontWeight: 700, marginTop: -6 }}>{err}</div> : null}
            {pending.map((x) => (
              <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, borderTop: `1px solid ${U.line}`, paddingTop: 10 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", color: U.text, fontWeight: 600 }}>{x.email || x.name}</span>
                <Pill bg={U.warnBg} fg={U.warnText} size={10.5}>
                  Pending · holds a seat
                </Pill>
                <Link href="/settings/account/team" style={{ fontSize: 11.5, fontWeight: 700 }}>
                  Revoke
                </Link>
              </div>
            ))}
          </>,
          "seat",
        )}
        {capPanel(
          "Locations",
          locs,
          [
            ["Included", fmtLim(locs)],
            ["Active", fmtInt(locs?.used ?? 0)],
            ["Remaining", limitOf(locs) == null ? "—" : fmtInt(Math.max(0, limitOf(locs)! - (locs?.used ?? 0)))],
          ],
          lb,
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {o.locations.map((l) => (
                <span key={l.id} style={{ fontSize: 12, fontWeight: 700, color: l.active ? U.text2 : U.faint, background: U.line, borderRadius: 8, padding: "5px 10px", textDecoration: l.active ? undefined : "line-through" }}>
                  {l.name}
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Link href="/branches" style={{ ...primaryBtn(!!lb), textDecoration: "none", pointerEvents: lb ? "none" : undefined }}>
                Add location
              </Link>
            </div>
          </>,
          "location",
        )}
      </div>
      <section style={{ ...section, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 9 }}>
        <h2 style={{ ...h2, fontSize: 14 }}>How seats are counted</h2>
        {["Active members and pending invitations both count, so every invitation sent can be accepted.", "Deactivated members don't count.", "Each person counts once, however many locations they work at.", "The Owner counts as a user."].map((r) => (
          <Rule key={r}>{r}</Rule>
        ))}
      </section>
      {buyKey ? <BuyDialog o={o} k={buyKey} onClose={() => setBuyKey(null)} onDone={(m) => { setBuyKey(null); t.flash(m); }} /> : null}
      <Toast message={t.toast} />
    </>
  );
}

// ---------------------------------------------------------------- AI credits

export function AiPage() {
  const q = useUsageOverview();
  const f = useQuery({ queryKey: ["usage", "by-feature"], queryFn: fetchCreditsByFeature });
  const [buyKey, setBuyKey] = useState<PurchaseKey | null>(null);
  const t = useToast();
  if (!q.data) return null;
  const o = q.data;
  const p = periodInfo(o);
  const m = o.set.metrics.ai_credits;
  const lim = limitOf(m);
  const usedOnly = m?.used ?? 0;
  const tone = lim == null ? greyTone : toneFor(pctOf(usedOfAi(m), lim));
  const plan = o.catalog.plans.find((x) => x.current);
  const rows = f.data?.rows ?? o.byFeature;
  const tot = rows.reduce((a, r) => a + r.credits, 0) || 1;
  const pendingCredits = o.purchases.filter((x) => x.metricCode === "ai_credits" && x.status === "pending").reduce((a, x) => a + x.quantity, 0);
  const purchasedLeft = m ? Math.max(0, m.purchased - Math.max(0, usedOnly - (m.included ?? 0))) : 0;
  return (
    <>
      <section style={{ ...section, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h2 style={h2}>AI credit balance</h2>
            <p style={sub}>
              {p.trial ? `${fmtInt(m?.included ?? 0)} trial credits · ${p.label}` : p.enterprise ? "Set by your agreement" : `${plan?.name ?? o.set.planName} includes ${fmtInt(m?.included ?? 0)} credits each billing period · resets ${p.reset}`}
            </p>
          </div>
          <Pill bg={tone.bg} fg={tone.fg}>
            {tone.label}
          </Pill>
          <BuyButton o={o} k="credits" onOpen={setBuyKey} primary />
        </div>
        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(118px,1fr))", gap: 10 }}>
          <Fact big k="Included" v={m?.included == null ? "Not configured" : fmtInt(m.included)} />
          <Fact big k="Purchased" v={fmtInt(m?.purchased ?? 0)} />
          <Fact big k="Reserved" v={fmtInt(m?.reserved ?? 0)} fg={m?.reserved ? "#175CD3" : undefined} />
          <Fact big k="Used" v={fmtInt(usedOnly)} />
          <Fact big k="Remaining" v={m?.remaining == null ? "—" : fmtInt(m.remaining)} fg={m?.remaining === 0 ? U.danger : "var(--app-primary-hover)"} />
        </dl>
        {lim != null ? <Bar pct={pctOf(usedOnly, lim)} reservedPct={pctOf(m?.reserved ?? 0, lim)} color={tone.bar} height={9} label="AI credits used" /> : null}
        {purchasedLeft > 0 ? <div style={{ fontSize: 12, color: U.text3, fontWeight: 600 }}>{fmtInt(purchasedLeft)} bought credits carry over to the next period — they never expire.</div> : null}
        {pendingCredits ? <div style={{ fontSize: 12, color: U.warnText, fontWeight: 700 }}>{fmtInt(pendingCredits)} purchased credits are awaiting payment confirmation and can&apos;t be used yet.</div> : null}
      </section>
      <div data-r2="1" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
        <section style={{ ...section, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px 10px" }}>
            <h2 style={h2}>Credits used by feature</h2>
            <p style={sub}>This billing period.</p>
          </div>
          {rows.length === 0 ? (
            <div style={{ padding: "22px 20px", borderTop: `1px solid ${U.line}`, fontSize: 12.5, color: U.muted }}>No AI credits used yet this period.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={theadRow}>
                  <th style={{ ...th, padding: "9px 20px" }}>Feature</th>
                  <th style={{ ...th, textAlign: "right" }}>Operations</th>
                  <th style={{ ...th, padding: "9px 20px 9px 10px", textAlign: "right" }}>Credits</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.operationCode} style={tr}>
                    <td style={{ padding: "10px 20px" }}>
                      <div style={{ fontWeight: 700, color: U.text }}>{r.label}</div>
                      <div style={{ fontSize: 11, color: U.muted }}>{r.module}</div>
                      <div style={{ height: 5, borderRadius: 5, background: U.line, marginTop: 6, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.round((r.credits / tot) * 100)}%`, background: U.green }} />
                      </div>
                    </td>
                    <td style={{ ...td, textAlign: "right", color: U.text3 }}>{fmtInt(r.operations)}</td>
                    <td style={{ padding: "10px 20px 10px 10px", textAlign: "right", fontWeight: 800, color: U.text }}>{fmtInt(r.credits)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section style={{ ...section, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h2 style={{ ...h2, flex: 1 }}>Limit check</h2>
            <Pill bg={U.infoBg} fg={U.info} size={10.5}>
              Live ledger
            </Pill>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: U.muted, lineHeight: 1.55 }}>
            Every AI request reserves its credits before work starts, commits the real cost when it finishes, and releases them if it fails. A retried request is never charged twice, and requests sent at the same time can&apos;t go over your balance. These are your most recent requests.
          </p>
          <div aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(f.data?.recent ?? []).length === 0 ? <div style={{ fontSize: 12, color: U.muted }}>No AI requests yet.</div> : null}
            {(f.data?.recent ?? []).map((r) => {
              const dot = r.state === "committed" ? U.green : r.state === "reserved" ? "#F79009" : "#3538CD";
              const text =
                r.state === "committed"
                  ? `${r.operation}: reserved ${fmtInt(r.reserved)}, charged ${fmtInt(r.actual ?? 0)} credits${r.bucket === "purchased" ? " from bought credits" : r.bucket === "split" ? " (included, then bought)" : ""}.`
                  : r.state === "reserved"
                    ? `${r.operation}: ${fmtInt(r.reserved)} credits reserved — running now.`
                    : `${r.operation}: ${fmtInt(r.reserved)} credits ${r.state === "expired" ? "released automatically" : "released"} — nothing charged${r.reason ? ` (${r.reason})` : ""}.`;
              return (
                <div key={r.id} style={{ display: "flex", gap: 8, fontSize: 12, lineHeight: 1.45, color: U.text2 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot, flex: "0 0 7px", marginTop: 5 }} />
                  <span>
                    {text} <span style={{ color: U.faint }}>{dateTime(r.reservedAt)}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
      <section style={{ ...section, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 9 }}>
        <h2 style={{ ...h2, fontSize: 14 }}>How AI credits work</h2>
        <Rule>Credits are reserved before an AI task starts and released if it fails. Your balance never goes below zero.</Rule>
        <Rule>A retried request is never charged twice.</Rule>
        <Rule>Sales, bookings, CRM records, reports and other everyday work never use AI credits.</Rule>
        <Rule>AI Receptionist minutes, Digitizer pages and SEO keyword tracking have their own meters and never use AI credits.</Rule>
        <Rule>Included credits renew each billing period and are used first. Bought credits are kept separately and never expire.</Rule>
        <Rule color="#F79009">
          A task costs 1, 3, 8, 25 or 75 credits depending on its size.
          <span style={{ fontSize: 10.5, fontWeight: 800, color: U.warnText, background: U.warnBg, borderRadius: 20, padding: "1px 7px", marginLeft: 6 }}>Provisional — being measured</span>
        </Rule>
      </section>
      {buyKey ? <BuyDialog o={o} k={buyKey} onClose={() => setBuyKey(null)} onDone={(msg) => { setBuyKey(null); t.flash(msg); }} /> : null}
      <Toast message={t.toast} />
    </>
  );
}

const usedOfAi = (m: ResolvedMetric | undefined) => (m ? m.used + m.reserved : 0);

// ---------------------------------------------------------------- Counted-only categories

const CATS: Record<string, { title: string; desc: string; metric: string; unit: string; priceMetric: string; priceText: (p: number | null) => string; note?: string; rules: string[]; module: [string, string] }> = {
  auto: { title: "Automation usage", desc: "Workflow executions this billing period.", metric: "automation_runs", unit: "runs", priceMetric: "", priceText: () => "Not set yet", note: "Counts successful, failed and retried runs", rules: ["Retrying a run never counts it twice.", "A normal workflow step uses no AI credits. Only steps that run AI use credits, shown under AI Credits.", "What counts as one billable run is awaiting confirmation."], module: ["Open Automations", "/marketing/automations"] },
  digitizer: { title: "Photo Digitizer usage", desc: "Pages processed by the AI Photo Digitizer.", metric: "digitizer_pages", unit: "pages", priceMetric: "digitizer_pages", priceText: (p) => (p == null ? "Not set yet" : `${money2(p).replace(".00", "")} per 100 pages`), note: "Failed scans are not counted", rules: ["Pages have their own meter and are never also charged as AI credits.", "Once a page allowance is set, a page is only processed if you have pages available."], module: ["Open Photo Digitizer", "/digitizer"] },
  seo: { title: "SEO usage", desc: "Keywords tracked by SEO Autopilot.", metric: "seo_keywords", unit: "keywords", priceMetric: "seo_keywords", priceText: (p) => (p == null ? "Not set yet" : `${money2(p).replace(".00", "")} per 100 keywords`), rules: ["Tracking keywords uses no AI credits.", "AI-written SEO content uses AI credits and is shown under AI Credits.", "Once a keyword allowance is set, you can't add keywords beyond it."], module: ["Open SEO", "/marketing"] },
  esign: { title: "eSign usage", desc: "Documents sent for signature this billing period.", metric: "esign_transactions", unit: "transactions", priceMetric: "esign_transactions", priceText: (p) => (p == null ? "Not set yet" : `${money2(p)} per transaction`), note: "Counted when a document is first sent", rules: ["One document sent for signature counts as one transaction.", "Resends, reminders and page refreshes never count it again."], module: ["Open Contracts", "/contracts"] },
};

export function CategoryPage({ page }: { page: "auto" | "digitizer" | "seo" | "esign" }) {
  const q = useUsageOverview();
  if (!q.data) return null;
  const o = q.data;
  const c = CATS[page];
  const m = o.set.metrics[c.metric];
  const price = c.priceMetric ? priceFor(o.prices, c.priceMetric) : null;
  return <CategoryBody o={o} title={c.title} desc={c.desc} rows={[{ name: c.title.replace(" usage", ""), note: c.note, m, unit: c.unit, price: c.priceText(price) }]} rules={c.rules} module={c.module} />;
}

function CategoryBody({ o, title, desc, rows, rules, module, extra }: { o: UsageOverview; title: string; desc: string; rows: { name: string; note?: string; m: ResolvedMetric | undefined; unit: string; price: string; usedText?: string }[]; rules: string[]; module?: [string, string]; extra?: ReactNode }) {
  const p = periodInfo(o);
  return (
    <>
      <section style={{ ...section, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h2 style={h2}>{title}</h2>
            <p style={sub}>{desc}</p>
          </div>
          {module ? (
            <Link href={module[1]} style={{ fontSize: 12, fontWeight: 800 }}>
              {module[0]}
            </Link>
          ) : null}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 720 }}>
            <thead>
              <tr style={theadRow}>
                <th style={{ ...th, padding: "10px 20px" }}>Meter</th>
                {["Included", "Used", "Remaining"].map((h) => (
                  <th key={h} style={{ ...th, textAlign: "right" }}>{h}</th>
                ))}
                <th style={th}>Extra usage price</th>
                <th style={{ ...th, padding: "10px 20px 10px 10px" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const lim = limitOf(r.m);
                const tone = lim == null ? { ...greyTone, label: r.m?.enforced ? "Not configured" : "Counted only" } : toneFor(pctOf(usedOf(r.m), lim));
                return (
                  <tr key={r.name} style={tr}>
                    <td style={{ padding: "11px 20px" }}>
                      <div style={{ fontWeight: 700, color: U.text }}>{r.name}</div>
                      {r.note ? <div style={{ fontSize: 11, color: U.muted, marginTop: 2 }}>{r.note}</div> : null}
                    </td>
                    <td style={{ ...td, textAlign: "right", color: U.text3, whiteSpace: "nowrap" }}>{r.m?.included == null ? "Not configured" : fmtInt(r.m.included)}</td>
                    <td style={{ ...td, textAlign: "right", color: U.text, fontWeight: 700 }}>{r.usedText ?? fmtInt(usedOf(r.m))}</td>
                    <td style={{ ...td, textAlign: "right", color: U.text3 }}>{lim == null ? "—" : fmtInt(Math.max(0, lim - usedOf(r.m)))}</td>
                    <td style={{ ...td, color: U.text2 }}>{r.price}</td>
                    <td style={{ padding: "11px 20px 11px 10px" }}>
                      <Pill bg={tone.bg} fg={tone.fg}>
                        {tone.label}
                      </Pill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {rows.some((r) => r.m && r.m.included == null) ? (
        <div style={{ background: U.subtle, border: `1px solid ${U.border}`, borderRadius: 12, padding: "12px 15px", fontSize: 12.5, color: U.text2, lineHeight: 1.55 }}>
          <strong style={{ color: U.text }}>Why is there no limit?</strong> Noxtill is still confirming how much of this each plan includes. Until then it&apos;s counted for your visibility but not limited, and nothing is charged for it. You&apos;ll be told before any limit or price starts to apply.
        </div>
      ) : null}
      {extra}
      <section style={{ ...section, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 9 }}>
        <h2 style={{ ...h2, fontSize: 14 }}>How it&apos;s counted</h2>
        {rules.map((r) => (
          <Rule key={r}>{r}</Rule>
        ))}
        <div style={{ fontSize: 11.5, color: U.muted }}>Counting period: {p.label}.</div>
      </section>
    </>
  );
}

export function StoragePage() {
  const q = useUsageOverview();
  if (!q.data) return null;
  const o = q.data;
  const st = o.storage;
  return (
    <CategoryBody
      o={o}
      title="Storage & documents"
      desc="Files, attachments, documents and generated files your workspace keeps."
      rows={[{ name: "File storage", note: st ? `${fmtInt(st.objects)} files${st.truncated ? " (very large — total is a lower bound)" : ""}` : "Storage usage couldn't be measured right now", m: o.set.metrics.storage_bytes, unit: "bytes", price: "Not set yet", usedText: st ? bytes(st.bytes) : "—" }]}
      rules={["Each file is counted once, at its stored size.", "Storing documents never uses AI credits.", "Once a storage allowance is set, a file's size is checked before it's accepted."]}
      extra={
        st && st.areas.length ? (
          <section style={{ ...section, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px 10px" }}>
              <h2 style={h2}>By category</h2>
            </div>
            {st.areas
              .slice()
              .sort((a, b) => b.bytes - a.bytes)
              .map((a) => (
                <div key={a.area} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 140px 80px", gap: 10, alignItems: "center", padding: "10px 20px", borderTop: `1px solid ${U.line}`, fontSize: 12.5 }}>
                  <span style={{ fontWeight: 700, color: U.text, textTransform: "capitalize" }}>{a.area.replace(/[-_]/g, " ")}</span>
                  <Bar pct={pctOf(a.bytes, st.bytes || 1)} color={U.green} height={6} label={a.area} />
                  <span style={{ textAlign: "right", fontWeight: 800, color: U.text }}>{bytes(a.bytes)}</span>
                </div>
              ))}
          </section>
        ) : null
      }
    />
  );
}

export function WebPage() {
  const q = useUsageOverview();
  if (!q.data) return null;
  const o = q.data;
  const price = priceFor(o.prices, "websites");
  return (
    <CategoryBody
      o={o}
      title="Websites & integrations"
      desc="Websites and connected apps on your account."
      rows={[
        { name: "Websites", m: o.set.metrics.websites, unit: "sites", price: price == null ? "Not set yet" : `${money2(price).replace(".00", "")} per website / month` },
        { name: "Active integrations", m: o.set.metrics.integrations, unit: "integrations", price: "No restriction defined" },
      ]}
      rules={["Only restrictions set by your plan or by an integration's own terms are shown here.", "Website prices apply only once a website allowance is confirmed for your plan."]}
      module={["Open Integrations", "/integrations"]}
    />
  );
}

// ---------------------------------------------------------------- History

const HIST_CATS = ["AI credits", "Communication", "Voice & Calling", "Settings"];

export function HistoryPage() {
  const [hc, setHc] = useState("");
  const [hs, setHs] = useState("");
  const [hq, setHq] = useState("");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [exporting, setExporting] = useState(false);
  const h = useQuery({ queryKey: ["usage", "history", hc, hs, hq, cursor], queryFn: () => fetchUsageHistory({ category: hc, status: hs, q: hq, cursor }) });
  const rows = h.data?.rows ?? [];
  const statuses = Array.from(new Set(rows.map((r) => r.status)));
  const style = (s: string): [string, string] =>
    /allocated/i.test(s) ? [U.infoBg, U.info] : /refused|failed/i.test(s) ? [U.dangerBg, U.danger] : /duplicate/i.test(s) ? [U.infoBg, U.info] : /stripe/i.test(s) ? [U.greenSoft, "var(--app-primary-hover)"] : [U.greenSoft, "var(--app-primary-hover)"];
  return (
    <section style={{ ...section, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", flexWrap: "wrap", borderBottom: `1px solid ${U.line}` }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 style={h2}>Usage history</h2>
          <p style={sub}>{h.data ? `${rows.length} shown · ${fmtInt(h.data.total)} usage events recorded in total` : "Loading…"}</p>
        </div>
        <input value={hq} onChange={(e) => { setHq(e.target.value); setCursor(undefined); }} placeholder="Search feature or module" aria-label="Search history" style={{ padding: "9px 12px", border: `1px solid ${U.border}`, borderRadius: 10, fontSize: 12.5, background: U.subtle, minHeight: 40, width: 190 }} />
        <select value={hc} onChange={(e) => { setHc(e.target.value); setCursor(undefined); }} aria-label="Usage category" style={selectStyle}>
          <option value="">All categories</option>
          {HIST_CATS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select value={hs} onChange={(e) => { setHs(e.target.value); setCursor(undefined); }} aria-label="Status" style={selectStyle}>
          <option value="">Any status</option>
          {["completed", "allocated", "refused", ...statuses.filter((s) => !["completed", "allocated", "refused"].includes(s))].map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={exporting}
          onClick={async () => {
            setExporting(true);
            try {
              await downloadUsageCsv();
            } finally {
              setExporting(false);
            }
          }}
          style={ghostBtn(exporting, { minHeight: 40 })}
        >
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 900 }}>
          <thead>
            <tr style={theadRow}>
              {["Date", "Feature", "Module", "Category"].map((x, i) => (
                <th key={x} style={{ ...th, padding: i === 0 ? "10px 20px" : "10px" }}>{x}</th>
              ))}
              <th style={{ ...th, textAlign: "right" }}>Quantity</th>
              <th style={{ ...th, textAlign: "right" }}>Impact</th>
              <th style={{ ...th, padding: "10px 20px 10px 10px" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const credit = r.metric === "ai_credits";
              const impact = credit ? `${r.status === "allocated" ? "+" : "−"}${fmtInt(r.quantity)}` : r.priceUsd != null ? money2(r.priceUsd) : "—";
              const [bg, fg] = style(r.status);
              return (
                <tr key={r.id} style={tr}>
                  <td style={{ padding: "10px 20px", color: U.text3, whiteSpace: "nowrap" }}>{dateTime(r.at)}</td>
                  <td style={{ padding: 10, fontWeight: 700, color: U.text, textTransform: "none" }}>{r.feature}</td>
                  <td style={{ padding: 10, color: U.text3 }}>{r.module}</td>
                  <td style={{ padding: 10, color: U.text3 }}>{r.category}</td>
                  <td style={{ padding: 10, textAlign: "right", color: U.text, whiteSpace: "nowrap" }}>{r.unit ? `${r.quantity.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${r.unit}${r.quantity === 1 ? "" : "s"}` : "—"}</td>
                  <td style={{ padding: 10, textAlign: "right", fontWeight: 800, color: impact.startsWith("+") ? "var(--app-primary-hover)" : U.text, whiteSpace: "nowrap" }}>{impact}</td>
                  <td style={{ padding: "10px 20px 10px 10px", whiteSpace: "nowrap" }}>
                    <Pill bg={bg} fg={fg}>
                      {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                    </Pill>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {h.data && rows.length === 0 ? <div style={{ padding: 26, textAlign: "center", fontSize: 12.5, color: U.muted }}>No usage matches these filters.</div> : null}
      </div>
      {h.data?.nextCursor || cursor ? (
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "11px 20px", borderTop: `1px solid ${U.line}` }}>
          {cursor ? (
            <button type="button" onClick={() => setCursor(undefined)} style={ghostBtn(false, { minHeight: 36 })}>
              Newest
            </button>
          ) : null}
          {h.data?.nextCursor ? (
            <button type="button" onClick={() => setCursor(h.data!.nextCursor!)} style={ghostBtn(false, { minHeight: 36 })}>
              Older
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- Limits & upgrade

export function LimitsPage() {
  const q = useUsageOverview();
  if (!q.data) return null;
  const o = q.data;
  const p = periodInfo(o);
  const s = o.set;
  const plans = o.catalog.plans.filter((x) => x.key !== "basic" && (x.status === "active" || x.current));
  const sellable = plans.filter((x) => x.purchasable || x.key === "enterprise");
  const curIdx = sellable.findIndex((x) => x.current);
  const next = s.status === "trialing" ? sellable[0] : sellable[curIdx + 1];
  const cur = plans.find((x) => x.current);
  const credits = s.metrics.ai_credits;
  const users = s.metrics.users;
  const locs = s.metrics.locations;
  const seatPrice = priceFor(o.prices, "users");
  const locPrice = priceFor(o.prices, "locations");
  const delta = (k: string) => {
    const a = next?.entitlements[k];
    const b = cur?.entitlements[k];
    return a == null ? "" : b == null ? "" : a > b ? ` (+${fmtInt(a - b)})` : a === b ? " (same)" : "";
  };
  return (
    <>
      {next ? (
        <section style={{ ...section, borderColor: U.greenLine, padding: "18px 20px", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--app-primary-hover)", textTransform: "uppercase", letterSpacing: ".5px" }}>{s.status === "trialing" ? "Choose a plan" : "Next plan up"}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: U.ink, marginTop: 4, letterSpacing: "-.4px" }}>
              {next.name} <span style={{ fontSize: 13, color: U.text3, fontWeight: 600 }}>{next.monthly == null ? "Custom pricing" : `${money2(next.monthly).replace(".00", "")}/month`}</span>
            </div>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8 }}>
              {next.key === "enterprise" ? (
                <span style={{ fontSize: 12.5, color: U.text2 }}>
                  <strong style={{ color: U.text }}>Custom</strong> users, locations and AI credits
                </span>
              ) : (
                [
                  ["users", "users"],
                  ["locations", "locations"],
                  ["ai_credits", "AI credits / month"],
                ].map(([k, label]) => (
                  <span key={k} style={{ fontSize: 12.5, color: U.text2 }}>
                    <strong style={{ color: U.text }}>{next.entitlements[k] == null ? "—" : fmtInt(next.entitlements[k]!)}</strong> {label}
                    {delta(k)}
                  </span>
                ))
              )}
            </div>
          </div>
          {next.key === "enterprise" ? (
            <a href="mailto:sales@noxtill.com" style={{ ...primaryBtn(), textDecoration: "none" }}>
              Contact sales
            </a>
          ) : (
            <Link href="/settings/account/plan#nx-plans" style={{ ...primaryBtn(), textDecoration: "none" }}>
              Change plan
            </Link>
          )}
        </section>
      ) : null}
      <section style={{ ...section, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px 12px" }}>
          <h2 style={h2}>Compare plans</h2>
          <p style={sub}>Yearly prices include a 25% discount. Prices are in USD, before tax.</p>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 640 }}>
            <thead>
              <tr style={theadRow}>
                <th style={{ ...th, padding: "10px 20px" }}>Plan</th>
                {["Monthly", "Yearly", "Users", "Locations", "AI credits"].map((x, i) => (
                  <th key={x} style={{ ...th, textAlign: "right", padding: i === 4 ? "10px 20px 10px 10px" : "10px" }}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plans.map((x) => {
                const ent = x.key === "enterprise";
                const trial = x.key === "trial";
                const val = (k: string, suffix = "") => (ent ? "Custom" : x.entitlements[k] == null ? "Not confirmed" : fmtInt(x.entitlements[k]!) + suffix);
                return (
                  <tr key={x.key} style={{ ...tr, background: x.current ? U.greenTint : "#fff" }}>
                    <td style={{ padding: "11px 20px", fontWeight: 800, color: U.text }}>
                      {x.name}
                      {x.current ? <span style={{ fontSize: 10, fontWeight: 800, color: "var(--app-primary-hover)", background: U.greenSoft, borderRadius: 20, padding: "2px 7px", marginLeft: 7 }}>Your plan</span> : null}
                    </td>
                    <td style={{ padding: "11px 10px", textAlign: "right", color: U.text2 }}>{trial ? `Free · ${x.trialDays} days` : ent || x.monthly == null ? "Custom" : money2(x.monthly).replace(".00", "")}</td>
                    <td style={{ padding: "11px 10px", textAlign: "right", color: U.text2 }}>{trial ? "—" : ent || x.yearly == null ? "Custom" : money2(x.yearly).replace(".00", "")}</td>
                    <td style={{ padding: "11px 10px", textAlign: "right", color: U.text, fontWeight: 700 }}>{val("users")}</td>
                    <td style={{ padding: "11px 10px", textAlign: "right", color: U.text, fontWeight: 700 }}>{val("locations")}</td>
                    <td style={{ padding: "11px 20px 11px 10px", textAlign: "right", color: U.text, fontWeight: 700 }}>{val("ai_credits", trial ? " total" : "")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "11px 20px", borderTop: `1px solid ${U.line}`, fontSize: 11.5, color: U.muted }}>Other allowances (storage, automation runs, digitizer pages and more) appear here once Noxtill confirms them. They&apos;re never shown as unlimited.</div>
      </section>
      <section style={{ ...section, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 style={h2}>What happens when you reach a limit</h2>
        {[
          ["AI credits", limitOf(credits) == null ? "AI features pause until your allowance is confirmed." : `AI features pause once you've used all ${fmtInt(limitOf(credits)!)} credits. You have ${fmtInt(credits?.remaining ?? 0)} left, which resets ${p.reset}. You can upgrade or buy 1,000 credits${priceFor(o.prices, "ai_credits") != null ? ` for ${money2(priceFor(o.prices, "ai_credits")!).replace(".00", "")}` : ""}.`],
          ["Users", limitOf(users) == null ? "Invitations pause until the allowance is confirmed." : `Invitations stop at ${fmtInt(limitOf(users)!)} users, pending invitations included. You're using ${fmtInt(users?.used ?? 0)}.${seatPrice != null ? ` Add a seat for ${money2(seatPrice).replace(".00", "")}/month or upgrade.` : ""}`],
          ["Locations", limitOf(locs) == null ? "New locations pause until the allowance is confirmed." : `New locations stop at ${fmtInt(limitOf(locs)!)}. You're using ${fmtInt(locs?.used ?? 0)}.${locPrice != null ? ` Add a location for ${money2(locPrice).replace(".00", "")}/month or upgrade.` : ""}`],
          ["Voice and messaging", `New AI calls, SMS and emails stop at your monthly spending limits (${money2(s.spendCaps.voice.capUsd)} voice, ${money2(s.spendCaps.messaging.capUsd)} messaging). Calls already in progress are never cut off. There's no override — you raise the limit yourself.`],
          ["Features not in your plan", "If a feature isn't in your plan, you'll see which plans include it. Noxtill only suggests plans that actually include it."],
        ].map(([t, b]) => (
          <div key={t} style={{ border: `1px solid ${U.border}`, borderRadius: 11, padding: "12px 14px" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: U.text }}>{t}</div>
            <div style={{ fontSize: 12.5, color: U.text3, marginTop: 4, lineHeight: 1.55 }}>{b}</div>
          </div>
        ))}
        <div style={{ fontSize: 12, color: U.text3, lineHeight: 1.55 }}>You&apos;re never charged extra without approving the price first. Reaching 100% pauses that usage. It doesn&apos;t charge you automatically.</div>
      </section>
    </>
  );
}
