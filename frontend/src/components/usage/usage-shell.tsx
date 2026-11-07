"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ApiError } from "@/lib/api-client";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { fetchUsageOverview, type UsageOverview } from "@/lib/usage-api";
import { ErrorState, NoAccess, Skeleton, U, dateUtc, pctOf, rangeUtc, toneFor } from "./usage-ui";

export const USAGE_PAGES: [string, string][] = [
  ["overview", "Usage Overview"],
  ["plan", "Plan Allowances"],
  ["team", "Users & Locations"],
  ["ai", "AI Credits & AI Usage"],
  ["comm", "Communication"],
  ["voice", "Voice & Calling"],
  ["auto", "Automation"],
  ["storage", "Storage & Documents"],
  ["digitizer", "Photo Digitizer"],
  ["seo", "SEO"],
  ["esign", "eSign"],
  ["web", "Websites & Integrations"],
  ["history", "Usage History"],
  ["limits", "Limits & Upgrade"],
];

export function useUsageOverview() {
  return useQuery({
    queryKey: ["usage", "overview"],
    queryFn: fetchUsageOverview,
    retry: (n, e) => !(e instanceof ApiError && e.status === 403) && n < 2,
    staleTime: 15_000,
  });
}

export function periodInfo(o: UsageOverview) {
  const s = o.set;
  const trial = s.status === "trialing";
  const enterprise = s.planKey === "enterprise";
  const days = s.trialEndsAt ? Math.max(0, Math.ceil((new Date(s.trialEndsAt).getTime() - Date.now()) / 86_400_000)) : 0;
  return {
    trial,
    enterprise,
    label: rangeUtc(s.usagePeriod.start, s.usagePeriod.end),
    start: dateUtc(s.usagePeriod.start),
    end: dateUtc(s.usagePeriod.end),
    reset: dateUtc(s.usagePeriod.end),
    interval: trial ? "14-day trial" : s.interval === "year" ? "Yearly" : "Monthly",
    status: trial
      ? `Trial · ${days} day${days === 1 ? "" : "s"} left`
      : s.status === "past_due"
        ? "Payment overdue"
        : s.status === "paused"
          ? "Paused · read-only"
          : s.status === "cancelled"
            ? "Cancelled"
            : "Active",
  };
}

function Header({ o }: { o: UsageOverview | undefined }) {
  const p = o ? periodInfo(o) : null;
  useModuleHeader({
    title: (
      <span style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 11.5, color: U.muted, fontWeight: 600 }}>
          <Link href="/settings/account/plan" style={{ color: U.muted }}>
            Settings
          </Link>{" "}
          / Usage &amp; Limits
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 2, flexWrap: "wrap" }}>
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.6px", color: U.ink }}>Usage &amp; Limits</span>
          {o && p ? (
            <span style={{ fontSize: 11, fontWeight: 800, color: "var(--app-primary-hover)", background: U.greenSoft, borderRadius: 20, padding: "3px 10px" }}>
              {o.set.planName} · {p.interval}
            </span>
          ) : null}
        </span>
      </span>
    ),
    stats: p ? (
      <dl style={{ margin: 0, display: "flex", gap: 18, flexWrap: "wrap" }}>
        {[
          ["Billing period", p.label],
          ["Next reset", p.reset],
          ["Status", p.status],
        ].map(([k, v]) => (
          <div key={k}>
            <dt style={{ fontSize: 10.5, color: U.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".4px" }}>{k}</dt>
            <dd style={{ margin: "2px 0 0", fontSize: 12.5, fontWeight: 700, color: U.text, whiteSpace: "nowrap" }}>{v}</dd>
          </div>
        ))}
      </dl>
    ) : undefined,
  });
  return null;
}

export function UsageShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const page = pathname.match(/^\/settings\/usage\/([^/?#]+)/)?.[1] ?? "overview";
  const q = useUsageOverview();
  const o = q.data;

  const dot = (k: string) => {
    if (!o) return "transparent";
    const m = k === "ai" ? o.set.metrics.ai_credits : k === "team" ? o.set.metrics.users : null;
    if (!m || m.included == null) return "transparent";
    const pct = pctOf(m.used + m.reserved, m.included + m.purchased);
    return k === "team" ? (pct >= 100 ? "#F04438" : "transparent") : toneFor(pct).dot;
  };

  let body: ReactNode = children;
  if (q.isLoading) body = <Skeleton rows={4} />;
  else if (q.error instanceof ApiError && q.error.status === 403)
    body = <NoAccess body="Usage and limits are visible to the workspace Owner and members with billing permission. Ask the Owner if you need to see them." />;
  else if (q.isError)
    body = (
      <div role="alert" style={{ background: U.dangerBg, border: `1px solid ${U.dangerLine}`, borderRadius: 12, padding: "13px 15px", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: U.danger }}>We can&apos;t verify your subscription right now</div>
        <div style={{ fontSize: 12.5, color: U.dangerDeep, lineHeight: 1.55 }}>
          Usage-based features are paused until we can check your limits, so nothing runs or is charged without a verified allowance. Your data is safe. Try again in a few minutes.
        </div>
        <ErrorState title="Usage service didn't respond" body="Nothing was changed." onRetry={() => q.refetch()} />
      </div>
    );

  return (
    <div style={{ background: "#F4F6F8", minHeight: "100%" }}>
      <Header o={o} />
      <style>{"@media(max-width:980px){[data-split]{grid-template-columns:minmax(0,1fr)!important}[data-subnav]{flex-direction:row!important;overflow-x:auto;position:static!important}[data-subnav] [data-sublabel]{display:none!important}}@media(max-width:1100px){[data-r2]{grid-template-columns:minmax(0,1fr)!important}}"}</style>
      <div data-split="1" style={{ display: "grid", gridTemplateColumns: "224px minmax(0,1fr)", gap: 18, padding: "18px 22px 30px", alignItems: "start", maxWidth: 1320, width: "100%" }}>
        <nav data-subnav="1" aria-label="Usage and limits sections" style={{ display: "flex", flexDirection: "column", gap: 2, position: "sticky", top: 16, background: "#fff", border: `1px solid ${U.border}`, borderRadius: 14, padding: 8 }}>
          {USAGE_PAGES.map(([k, label]) => {
            const on = k === page;
            return (
              <Link key={k} href={`/settings/usage/${k}`} aria-current={on ? "page" : undefined} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 10px", borderRadius: 9, fontSize: 12.5, fontWeight: on ? 700 : 600, background: on ? U.greenSoft : "transparent", color: on ? "var(--app-primary-hover)" : U.text3, whiteSpace: "nowrap", minHeight: 38, textDecoration: "none" }}>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
                <span data-sublabel="1" style={{ width: 7, height: 7, borderRadius: "50%", background: dot(k), flex: "0 0 7px" }} />
              </Link>
            );
          })}
        </nav>
        <main style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          {o && o.set.suspended ? (
            <div role="alert" style={{ background: U.dangerBg, border: `1px solid ${U.dangerLine}`, borderRadius: 12, padding: "13px 15px", display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: U.danger }}>This workspace is read-only</div>
              <div style={{ fontSize: 12.5, color: U.dangerDeep, lineHeight: 1.55 }}>
                {o.set.status === "past_due"
                  ? "Your subscription payment is overdue. You can still view and export everything. Update your payment method to continue."
                  : "The subscription isn't active. You can still view and export everything — nothing has been deleted. Choose a plan to continue."}
              </div>
            </div>
          ) : o && o.set.meteredPaused ? (
            <div role="alert" style={{ background: U.warnBg, border: `1px solid ${U.warnLine}`, borderRadius: 12, padding: "13px 15px", fontSize: 12.5, color: U.warnDeep, lineHeight: 1.55, fontWeight: 600 }}>
              Your payment is overdue, so AI credits, SMS, email and calls are paused. Everything else keeps working. Update your payment method to turn them back on.
            </div>
          ) : null}
          {body}
        </main>
      </div>
    </div>
  );
}
