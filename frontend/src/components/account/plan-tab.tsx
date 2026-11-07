"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { cancelScheduledChange, changePlan, fetchPaymentMethods, fetchUsageOverview, type CatalogPlan, type UsageOverview } from "@/lib/usage-api";
import { Bar, ErrorState, Fact, Modal, NoAccess, Skeleton, Toast, U, dateUtc, fmtInt, ghostBtn, h2, money, pctOf, primaryBtn, rangeUtc, section, sub } from "@/components/usage/usage-ui";

type Interval = "month" | "year";

function statusPill(o: UsageOverview) {
  const s = o.set;
  if (s.status === "trialing") {
    const days = s.trialEndsAt ? Math.max(0, Math.ceil((new Date(s.trialEndsAt).getTime() - Date.now()) / 86_400_000)) : 0;
    return { label: `Free trial · ${days} day${days === 1 ? "" : "s"} left`, bg: U.infoBg, fg: U.info };
  }
  if (s.status === "past_due") return { label: "Payment overdue", bg: U.dangerBg, fg: U.danger };
  if (s.status === "paused") return { label: "Paused · read-only", bg: U.dangerBg, fg: U.danger };
  if (s.status === "cancelled") return { label: "Cancelled", bg: U.line, fg: U.text3 };
  if (s.cancelAtPeriodEnd) return { label: `Ends ${dateUtc(s.billingPeriod.end)}`, bg: U.warnBg, fg: U.warnText };
  return { label: "Active", bg: U.greenSoft, fg: "var(--app-primary-hover)" };
}

function Meter({ label, used, limit, okNote }: { label: string; used: number; limit: number | null; okNote: string }) {
  if (limit == null) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: U.text2, flex: 1 }}>{label}</span>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: U.text }}>{fmtInt(used)} used</span>
        </div>
        <span style={{ fontSize: 11.5, color: U.muted, fontWeight: 600 }}>Allowance not confirmed yet. Usage is paused and nothing is charged.</span>
      </div>
    );
  }
  const p = pctOf(used, limit);
  const full = used >= limit;
  const high = p >= 85;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: U.text2, flex: 1 }}>{label}</span>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: U.text }}>
          {fmtInt(used)} of {fmtInt(limit)}
        </span>
      </div>
      <Bar pct={p} height={8} label={label} color={full ? U.danger : high ? "#F79009" : U.green} />
      <span style={{ fontSize: 11.5, color: full ? U.danger : high ? U.warnText : U.muted, fontWeight: 600 }}>
        {full ? "Limit reached — upgrade or add capacity to add more" : high ? `${okNote} · getting close to your limit` : okNote}
      </span>
    </div>
  );
}

export function PlanTab() {
  const qc = useQueryClient();
  const o = useQuery({ queryKey: ["usage", "overview"], queryFn: fetchUsageOverview, retry: (n, e) => !(e instanceof ApiError && e.status === 403) && n < 2 });
  const cards = useQuery({ queryKey: ["usage", "payment-methods"], queryFn: fetchPaymentMethods, retry: false });
  const [compInterval, setCompInterval] = useState<Interval | null>(null);
  const [modal, setModal] = useState<{ plan: CatalogPlan; interval: Interval; authorized: boolean } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Captured once per visit; the prorated estimate is a preview (Stripe computes the real charge).
  const [now] = useState(() => Date.now());
  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 5200);
  };
  const refresh = () => qc.invalidateQueries({ queryKey: ["usage"] });

  const change = useMutation({
    mutationFn: () => changePlan(modal!.plan.key, modal!.interval, modal!.authorized),
    onSuccess: (r) => {
      setModal(null);
      if (r.checkoutUrl) {
        window.location.assign(r.checkoutUrl);
        return;
      }
      void refresh();
      flash(r.message);
    },
    onError: (e) => flash(e instanceof ApiError ? e.message : "Couldn't change the plan."),
  });
  const keep = useMutation({
    mutationFn: cancelScheduledChange,
    onSuccess: () => {
      void refresh();
      flash("Scheduled change cancelled. You stay on your current plan.");
    },
    onError: (e) => flash(e instanceof ApiError ? e.message : "Couldn't cancel the scheduled change."),
  });

  if (o.isLoading) return <Skeleton />;
  if (o.error instanceof ApiError && o.error.status === 403) return <NoAccess body="Billing and subscription settings are limited to the workspace Owner and members with billing permission. Ask the Owner if you need a change." />;
  if (o.isError || !o.data) return <ErrorState title="We couldn't load your plan" body="The billing service didn't respond. Nothing was changed. Try again, or check your connection." onRetry={() => o.refetch()} />;

  const d = o.data;
  const s = d.set;
  const trial = s.status === "trialing";
  const plans = d.catalog.plans.filter((p) => p.key !== "trial" && p.key !== "basic" && (p.purchasable || p.key === "enterprise"));
  const current = d.catalog.plans.find((p) => p.current)!;
  const chosen = trial ? plans.find((p) => p.key === s.scheduledPlanKey) ?? null : current;
  const interval: Interval = s.interval;
  const iv = compInterval ?? interval;
  const defCard = cards.data?.methods.find((c) => c.isDefault);
  const cardName = defCard ? `${defCard.brand.charAt(0).toUpperCase()}${defCard.brand.slice(1)} •••• ${defCard.last4}` : null;
  const pill = statusPill(d);
  const rank = (p: CatalogPlan) => plans.findIndex((x) => x.key === p.key);
  const curRank = trial ? -1 : plans.findIndex((p) => p.key === current.key);
  const price = (p: CatalogPlan, i: Interval) => (i === "year" ? p.yearly : p.monthly);
  const users = s.metrics.users;
  const locs = s.metrics.locations;
  const credits = s.metrics.ai_credits;
  const lim = (m: typeof users | undefined) => (m && m.included != null ? m.included + m.purchased : null);
  const creditsUsed = credits ? credits.used + credits.reserved : 0;
  const creditTotal = d.byFeature.reduce((a, r) => a + r.credits, 0) || 1;

  // Plan-change preview (the server re-checks everything and is the one that decides).
  const preview = (() => {
    if (!modal) return null;
    const to = modal.plan;
    const toPrice = price(to, modal.interval) ?? 0;
    const per = modal.interval === "year" ? "/year" : "/month";
    const lines: string[] = [];
    const warnings: string[] = [];
    let kind: "upgrade" | "downgrade" | "interval" | "trial" = "interval";
    if (trial) kind = "trial";
    else if (to.key !== current.key) kind = rank(to) > curRank ? "upgrade" : "downgrade";
    let cta = "Confirm change";
    if (kind === "trial") {
      lines.push(`No charge today. Your trial continues until ${dateUtc(s.trialEndsAt)}.`);
      lines.push(`${to.name} starts after your trial at ${money(toPrice)}${per}.`);
      if (!defCard) warnings.push(`Add a payment method before ${dateUtc(s.trialEndsAt)} so ${to.name} can start.`);
      cta = `Choose ${to.name}`;
    } else if (kind === "upgrade") {
      const cr = to.entitlements.ai_credits;
      lines.push(`${to.name} starts immediately${cr != null ? `, with ${fmtInt(cr)} AI credits a month` : ""}. Credits you've already used this period still count.`);
      if (modal.interval === "month" && interval === "month" && current.monthly != null && to.monthly != null) {
        const start = new Date(s.billingPeriod.start).getTime();
        const end = new Date(s.billingPeriod.end).getTime();
        const left = Math.max(0, end - now);
        const days = Math.ceil(left / 86_400_000);
        const est = ((to.monthly - current.monthly) * left) / Math.max(1, end - start);
        lines.push(`Prorated charge today: about ${money(Math.max(0, est), 2)} for the ${days} day${days === 1 ? "" : "s"} left in this period. Stripe confirms the exact amount.`);
      } else lines.push("Stripe calculates the prorated charge for the rest of this period before charging.");
      lines.push(`Then ${money(toPrice)}${per}.`);
      cta = `Upgrade to ${to.name}`;
    } else {
      lines.push(`Takes effect at your next renewal on ${dateUtc(s.billingPeriod.end)}. No charge today.`);
      lines.push(`From then: ${money(toPrice)}${per}.`);
      if (kind === "interval" && modal.interval === "year" && to.monthly != null && to.yearly != null) lines.push(`Yearly billing costs ${money(to.yearly)} instead of ${money(to.monthly * 12)} over 12 months.`);
      cta = kind === "interval" ? "Schedule switch" : "Schedule downgrade";
    }
    if (kind === "downgrade") {
      const tu = to.entitlements.users;
      const tl = to.entitlements.locations;
      const tc = to.entitlements.ai_credits;
      if (users && tu != null && users.used > tu + users.purchased) warnings.push(`You have ${users.used} users; ${to.name} includes ${tu}. Remove ${users.used - tu - users.purchased} before downgrading, or keep ${current.name}.`);
      if (locs && tl != null && locs.used > tl + locs.purchased) warnings.push(`You have ${locs.used} locations; ${to.name} includes ${tl}.`);
      if (credits && tc != null && creditsUsed > tc) warnings.push(`Your AI usage this period (${fmtInt(creditsUsed)} credits) is above ${to.name}'s ${fmtInt(tc)} monthly credits.`);
    }
    const needsAuth = kind === "upgrade";
    const blocked = needsAuth && !modal.authorized;
    return { kind, lines, warnings, cta, needsAuth, blocked, from: `${current.name} · ${trial ? "trial" : interval === "year" ? "yearly" : "monthly"}`, to: `${to.name} · ${modal.interval === "year" ? "yearly" : "monthly"}` };
  })();

  return (
    <>
      <div data-r2="1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(380px,1fr))", gap: 16, alignItems: "start" }}>
        <section style={{ ...section, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: U.muted, textTransform: "uppercase", letterSpacing: ".5px" }}>Current plan</span>
            <span style={{ fontSize: 11, fontWeight: 800, borderRadius: 20, padding: "3px 9px", background: pill.bg, color: pill.fg }}>{pill.label}</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-.9px", color: U.ink }}>{trial ? (chosen?.name ?? "Trial") : current.name}</div>
            <div style={{ fontSize: 14, color: U.text3, fontWeight: 600 }}>
              {trial ? `Free until ${dateUtc(s.trialEndsAt)}` : current.monthly == null ? "Custom pricing" : `${money(price(current, interval) ?? 0)} / ${interval === "year" ? "year" : "month"}`}
            </div>
          </div>
          <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
            {(trial
              ? [
                  ["Trial ends", dateUtc(s.trialEndsAt)],
                  ["After trial", chosen ? `${chosen.name} · ${money(price(chosen, s.scheduledInterval ?? "month") ?? 0)}/${(s.scheduledInterval ?? "month") === "year" ? "yr" : "mo"}` : "No plan chosen yet"],
                  ["Payment method", cardName ?? "Not required yet"],
                ]
              : [
                  ["Billing", interval === "year" ? "Yearly" : "Monthly"],
                  [s.cancelAtPeriodEnd ? "Access until" : "Renews", dateUtc(s.billingPeriod.end)],
                  ["Pays with", cardName ?? "No card on file"],
                ]
            ).map(([k, v]) => (
              <Fact key={k} k={k} v={v} big />
            ))}
          </dl>
          {!trial && s.scheduledPlanKey ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: U.warnBg, border: `1px solid ${U.warnLine}`, borderRadius: 10, padding: "11px 13px", flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 200, fontSize: 12.5, color: U.warnDeep, fontWeight: 600 }}>
                Changing to {d.catalog.plans.find((p) => p.key === s.scheduledPlanKey)?.name ?? s.scheduledPlanKey} ({s.scheduledInterval === "year" ? "yearly" : "monthly"}) on {dateUtc(s.billingPeriod.end)}.
              </span>
              <button type="button" disabled={keep.isPending} onClick={() => keep.mutate()} style={{ border: `1px solid ${U.warnLine}`, background: "#fff", borderRadius: 8, padding: "7px 11px", fontSize: 11.5, fontWeight: 700, color: U.warnDeep, cursor: "pointer", minHeight: 36 }}>
                Keep current plan
              </button>
            </div>
          ) : null}
          {trial && !defCard ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: U.greenTint, border: "1px solid #C9EBD6", borderRadius: 10, padding: "11px 13px", flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 200, fontSize: 12.5, color: "#0E5C32", fontWeight: 600 }}>No card needed during your trial. Add one before {dateUtc(s.trialEndsAt)} to keep your workspace running.</span>
              <Link href="/settings/account/payment" style={{ fontSize: 12, fontWeight: 800 }}>
                Add payment method
              </Link>
            </div>
          ) : null}
          {s.status === "paused" ? (
            <div role="alert" style={{ background: U.dangerBg, border: `1px solid ${U.dangerLine}`, borderRadius: 10, padding: "11px 13px", fontSize: 12.5, color: U.dangerDeep, lineHeight: 1.55 }}>
              Your workspace is read-only: you can view and export everything, and nothing has been deleted. Choose a plan below to continue.
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="#nx-plans" style={{ ...primaryBtn(), textDecoration: "none" }}>
              Compare plans
            </a>
            {!trial && current.monthly != null && current.yearly != null ? (
              <button type="button" onClick={() => setModal({ plan: current, interval: interval === "year" ? "month" : "year", authorized: false })} style={ghostBtn()}>
                {interval === "year" ? "Switch to monthly" : "Switch to yearly — save 25%"}
              </button>
            ) : null}
          </div>
        </section>

        <section style={{ ...section, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <h2 style={h2}>Usage this period</h2>
            <p style={sub}>
              {trial ? `Trial period · ${rangeUtc(s.usagePeriod.start, s.usagePeriod.end)}` : `${rangeUtc(s.usagePeriod.start, s.usagePeriod.end)} · AI credits reset on ${dateUtc(s.usagePeriod.end)}`}
            </p>
          </div>
          {users ? <Meter label="Team members" used={users.used} limit={lim(users)} okNote={lim(users) == null ? "" : `${Math.max(0, lim(users)! - users.used)} seat${lim(users)! - users.used === 1 ? "" : "s"} available`} /> : null}
          {locs ? <Meter label="Locations" used={locs.used} limit={lim(locs)} okNote={d.locations.filter((l) => l.active).map((l) => l.name).join(", ")} /> : null}
          {credits ? <Meter label={trial ? "Trial AI credits" : "AI credits this month"} used={creditsUsed} limit={lim(credits)} okNote={`${fmtInt(credits.remaining ?? 0)} credits remaining`} /> : null}
          <div style={{ borderTop: `1px solid ${U.line}`, paddingTop: 14, display: "flex", flexDirection: "column", gap: 9 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: U.muted, textTransform: "uppercase", letterSpacing: ".5px" }}>AI credits by feature</div>
            {d.byFeature.length === 0 ? <div style={{ fontSize: 12.5, color: U.muted }}>No AI credits used yet this period.</div> : null}
            {d.byFeature.slice(0, 6).map((r) => (
              <div key={r.operationCode} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 90px 52px", gap: 10, alignItems: "center", fontSize: 12.5 }}>
                <span style={{ color: U.text2, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`${r.module} · ${r.label}`}>
                  {r.label}
                </span>
                <span style={{ height: 6, borderRadius: 6, background: U.line, overflow: "hidden" }}>
                  <span style={{ display: "block", height: "100%", width: `${Math.round((r.credits / creditTotal) * 100)}%`, background: U.green }} />
                </span>
                <span style={{ textAlign: "right", fontWeight: 700, color: U.text }}>{fmtInt(r.credits)}</span>
              </div>
            ))}
            <Link href="/settings/usage/overview" style={{ fontSize: 12, fontWeight: 800 }}>
              See all usage &amp; limits
            </Link>
          </div>
        </section>
      </div>

      <section id="nx-plans" style={{ ...section, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h2 style={h2}>Plans</h2>
            <p style={sub}>Upgrades start right away. Downgrades and billing-interval changes start at your next renewal.</p>
          </div>
          <div role="radiogroup" aria-label="Billing interval" style={{ display: "flex", background: U.line, borderRadius: 10, padding: 3, gap: 2 }}>
            {(["month", "year"] as Interval[]).map((i) => (
              <button key={i} type="button" role="radio" aria-checked={iv === i} onClick={() => setCompInterval(i)} style={{ border: 0, borderRadius: 8, padding: "7px 13px", fontSize: 12, fontWeight: 700, cursor: "pointer", minHeight: 36, background: iv === i ? "#fff" : "transparent", color: iv === i ? U.text : U.muted, display: "flex", alignItems: "center", gap: 6 }}>
                {i === "month" ? "Monthly" : "Yearly"}
                {i === "year" ? <span style={{ fontSize: 10, fontWeight: 800, color: "var(--app-primary-hover)", background: U.greenSoft, borderRadius: 20, padding: "1px 6px" }}>Save 25%</span> : null}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(178px,1fr))", gap: 12 }}>
          {plans.map((p, idx) => {
            const ent = p.key === "enterprise";
            const isCur = trial ? p.key === s.scheduledPlanKey : p.current;
            const sameIv = trial ? (s.scheduledInterval ?? "month") === iv : iv === interval;
            let btn: string;
            let primary = false;
            if (ent) btn = "Contact sales";
            else if (isCur && sameIv) btn = trial ? "Your trial plan" : "Current plan";
            else if (isCur) btn = iv === "year" ? "Switch to yearly" : "Switch to monthly";
            else if (trial || idx > curRank) {
              btn = trial ? `Choose ${p.name}` : "Upgrade";
              primary = true;
            } else btn = "Downgrade";
            const disabled = !ent && isCur && sameIv;
            const pr = price(p, iv);
            return (
              <div key={p.key} style={{ border: `1px solid ${isCur ? U.green : U.border}`, background: isCur ? U.greenTint : "#fff", borderRadius: 13, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, minHeight: 20 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 800, color: U.text, flex: 1 }}>{p.name}</span>
                  {isCur ? <span style={{ fontSize: 10, fontWeight: 800, color: "var(--app-primary-hover)", background: U.greenSoft, borderRadius: 20, padding: "2px 7px" }}>{trial ? "After trial" : "Current"}</span> : null}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-.6px", color: U.ink }}>{ent || pr == null ? "Custom" : money(pr)}</span>
                  <span style={{ fontSize: 12, color: U.muted, fontWeight: 600 }}>{ent || pr == null ? "" : iv === "year" ? "/year" : "/month"}</span>
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: U.text3, flex: 1 }}>
                  {(ent
                    ? ["Custom AI credits", "Custom users and locations", "Dedicated onboarding"]
                    : [
                        p.entitlements.ai_credits != null ? `${fmtInt(p.entitlements.ai_credits)} AI credits / month` : "AI credits not confirmed",
                        p.entitlements.users != null ? `${p.entitlements.users} team members` : "Team members not confirmed",
                        p.entitlements.locations != null ? `${p.entitlements.locations} location${p.entitlements.locations === 1 ? "" : "s"}` : "Locations not confirmed",
                        p.entitlements.ai_phone_receptionist ? "AI Phone Receptionist" : null,
                      ].filter(Boolean)
                  ).map((l) => (
                    <li key={l as string} style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--app-primary)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "0 0 14px", marginTop: 1 }}><path d="m5 12 5 5 9-10" /></svg>
                      {l}
                    </li>
                  ))}
                </ul>
                {ent ? (
                  <a href="mailto:sales@noxtill.com" style={{ border: `1px solid ${U.border}`, background: "#fff", color: U.text2, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 800, minHeight: 42, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none" }}>
                    {btn}
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setModal({ plan: p, interval: iv, authorized: false })}
                    style={{ border: `1px solid ${primary ? U.green : U.border}`, background: primary ? U.green : "#fff", color: primary ? "#fff" : U.text2, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 800, cursor: disabled ? "default" : "pointer", minHeight: 42, opacity: disabled ? 0.5 : 1 }}
                  >
                    {btn}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 11.5, color: U.muted }}>Prices in USD, before tax. Stripe calculates tax at checkout.</div>
      </section>

      {modal && preview ? (
        <Modal title="Confirm plan change" onClose={() => setModal(null)}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: U.subtle, borderRadius: 11, padding: 13 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: U.muted, fontWeight: 600 }}>From</div>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: U.text }}>{preview.from}</div>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#98A2B3" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            <div style={{ flex: 1, minWidth: 0, textAlign: "right" }}>
              <div style={{ fontSize: 11, color: U.muted, fontWeight: 600 }}>To</div>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--app-primary-hover)" }}>{preview.to}</div>
            </div>
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5, color: U.text2, lineHeight: 1.5 }}>
            {preview.lines.map((l) => (
              <li key={l} style={{ display: "flex", gap: 8 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#98A2B3", flex: "0 0 5px", marginTop: 7 }} />
                {l}
              </li>
            ))}
          </ul>
          {preview.warnings.map((w) => (
            <div key={w} style={{ background: U.warnBg, border: `1px solid ${U.warnLine}`, borderRadius: 10, padding: "10px 12px", fontSize: 12, color: U.warnDeep, lineHeight: 1.5, fontWeight: 600 }}>
              {w}
            </div>
          ))}
          {preview.needsAuth ? (
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12.5, color: U.text2, lineHeight: 1.5, cursor: "pointer" }}>
              <input type="checkbox" checked={modal.authorized} onChange={() => setModal({ ...modal, authorized: !modal.authorized })} style={{ width: 18, height: 18, margin: "1px 0 0", accentColor: "var(--app-primary)", flex: "0 0 18px" }} />
              <span>I authorize Noxtill to charge {cardName ?? "my card on file"} for this change.</span>
            </label>
          ) : null}
          {!d.providers.stripe && preview.kind !== "trial" && preview.kind !== "downgrade" && preview.kind !== "interval" ? (
            <div style={{ fontSize: 12, color: U.warnText, fontWeight: 600 }}>Payments aren&apos;t connected yet (Stripe isn&apos;t configured), so this upgrade can&apos;t be charged right now.</div>
          ) : null}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
            <button type="button" onClick={() => setModal(null)} style={ghostBtn()}>
              Cancel
            </button>
            <button type="button" disabled={preview.blocked || change.isPending} onClick={() => change.mutate()} style={primaryBtn(preview.blocked)}>
              {change.isPending ? "Working…" : preview.cta}
            </button>
          </div>
        </Modal>
      ) : null}
      <Toast message={toast} />
    </>
  );
}
