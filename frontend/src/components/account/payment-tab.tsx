"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { useSession } from "@/lib/session";
import { fetchEntitlements, fetchPaymentMethods, makeCardDefault, startCardSetup, type PlatformCard } from "@/lib/usage-api";
import { ErrorState, Modal, NoAccess, Skeleton, Toast, U, dateUtc, ghostBtn, h2, inputStyle, primaryBtn, section, sub } from "@/components/usage/usage-ui";

const BRAND_BG: Record<string, string> = { visa: "#1A1F71", mastercard: "#252525", amex: "#2E77BC" };
const BRAND_SHORT: Record<string, string> = { visa: "VISA", mastercard: "MC", amex: "AMEX", discover: "DISC" };
const brandName = (b: string) => ({ visa: "Visa", mastercard: "Mastercard", amex: "American Express", discover: "Discover" })[b] ?? b.charAt(0).toUpperCase() + b.slice(1);

type Step = { mode: "add" | "replace" | "default"; target?: PlatformCard; makeDefault: boolean };

export function PaymentTab() {
  const session = useSession();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["usage", "payment-methods"], queryFn: fetchPaymentMethods, retry: (n, e) => !(e instanceof ApiError && e.status === 403) && n < 2 });
  const ent = useQuery({ queryKey: ["usage", "entitlements"], queryFn: fetchEntitlements });
  const [step, setStep] = useState<Step | null>(null);
  const [pw, setPw] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 4800);
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!step) return;
      if (step.mode === "default") {
        await makeCardDefault(step.target!.id, pw);
        return { done: true as const };
      }
      const r = await startCardSetup({ password: pw, makeDefault: step.makeDefault, replaceId: step.mode === "replace" ? step.target!.id : undefined });
      return { url: r.checkoutUrl };
    },
    onSuccess: (r) => {
      if (r && "url" in r && r.url) {
        window.location.assign(r.url);
        return;
      }
      setStep(null);
      setPw("");
      void qc.invalidateQueries({ queryKey: ["usage"] });
      flash(`${brandName(step?.target?.brand ?? "")} ending ${step?.target?.last4} is now your default card.`);
    },
    onError: (e) => {
      if (e instanceof ApiError && (e.code === "INVALID_PASSWORD" || e.code === "PASSWORD_REQUIRED")) setPwErr(e.message);
      else {
        setStep(null);
        flash(e instanceof ApiError ? e.message : "Couldn't update payment details.");
      }
    },
  });

  if (q.isLoading) return <Skeleton />;
  if (q.error instanceof ApiError && q.error.status === 403) return <NoAccess body="Billing and subscription settings are limited to the workspace Owner and members with billing permission." />;
  if (q.isError || !q.data) return <ErrorState title="We couldn't load payment methods" body="The billing service didn't respond. Nothing was changed." onRetry={() => q.refetch()} />;
  const { methods, stripeConfigured } = q.data;
  const trial = ent.data?.status === "trialing";
  const locked = !stripeConfigured;
  const open = (s: Step) => {
    setPw("");
    setPwErr("");
    setStep(s);
  };
  const now = new Date();

  return (
    <>
      {!stripeConfigured ? (
        <div role="status" style={{ background: U.warnBg, border: `1px solid ${U.warnLine}`, borderRadius: 12, padding: "12px 15px", fontSize: 12.5, color: U.warnDeep, fontWeight: 600, lineHeight: 1.55 }}>
          Payments aren&apos;t connected yet (Stripe isn&apos;t configured on this server), so cards can&apos;t be added or changed right now. Nothing is charged.
        </div>
      ) : null}
      <section style={{ ...section, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 20px", flexWrap: "wrap", borderBottom: `1px solid ${U.line}` }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h2 style={h2}>Payment methods</h2>
            <p style={sub}>Your default card pays for your Noxtill subscription. Customer payments are managed in Payments &amp; Billing.</p>
          </div>
          <button type="button" disabled={locked} title={locked ? "Stripe isn't configured" : ""} onClick={() => open({ mode: "add", makeDefault: methods.length === 0 })} style={primaryBtn(locked)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            Add payment method
          </button>
        </div>
        {methods.length === 0 ? (
          <div style={{ padding: "34px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: U.line, color: U.muted, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 6h20v12H2zM2 10h20M6 15h4" /></svg>
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: U.text }}>No payment method yet</div>
            <div style={{ fontSize: 12.5, color: U.muted, maxWidth: 420, lineHeight: 1.55 }}>
              {trial
                ? `You're on a free trial — no card is required. Add one before your trial ends on ${dateUtc(ent.data?.trialEndsAt)} so your workspace keeps running.`
                : "Add a card to pay for your Noxtill subscription."}
            </div>
          </div>
        ) : null}
        {methods.map((c) => {
          const months = (c.expYear - now.getUTCFullYear()) * 12 + (c.expMonth - (now.getUTCMonth() + 1));
          return (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "15px 20px", borderTop: `1px solid ${U.line}`, flexWrap: "wrap" }}>
              <div style={{ width: 46, height: 32, borderRadius: 7, background: BRAND_BG[c.brand] ?? "#344054", color: "#fff", fontSize: 9.5, fontWeight: 800, letterSpacing: ".4px", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 46px" }}>{BRAND_SHORT[c.brand] ?? c.brand.toUpperCase().slice(0, 4)}</div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: U.text }}>
                    {brandName(c.brand)} ending {c.last4}
                  </span>
                  {c.isDefault ? <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--app-primary-hover)", background: U.greenSoft, borderRadius: 20, padding: "2px 8px" }}>Default</span> : null}
                  {months <= 3 ? <span style={{ fontSize: 10.5, fontWeight: 800, color: U.warnText, background: U.warnBg, borderRadius: 20, padding: "2px 8px" }}>Expires soon</span> : null}
                </div>
                <div style={{ fontSize: 11.5, color: U.muted, marginTop: 3 }}>
                  Expires {String(c.expMonth).padStart(2, "0")}/{String(c.expYear).slice(-2)} · Added {dateUtc(c.createdAt)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {!c.isDefault ? (
                  <button type="button" disabled={locked} onClick={() => open({ mode: "default", target: c, makeDefault: true })} style={ghostBtn(locked, { minHeight: 40, padding: "8px 12px", fontSize: 12 })}>
                    Make default
                  </button>
                ) : null}
                <button type="button" disabled={locked} onClick={() => open({ mode: "replace", target: c, makeDefault: c.isDefault })} style={ghostBtn(locked, { minHeight: 40, padding: "8px 12px", fontSize: 12 })}>
                  Replace
                </button>
              </div>
            </div>
          );
        })}
      </section>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12, color: U.text3, lineHeight: 1.55, padding: "0 4px" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--app-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "0 0 16px", marginTop: 1 }}><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z" /></svg>
        <span>Card numbers and security codes are entered on Stripe&apos;s secure page and never reach Noxtill. We keep only the card brand, last four digits and expiry date. Every change requires you to confirm your identity.</span>
      </div>

      {step ? (
        <Modal title={step.mode === "default" ? "Change default card" : step.mode === "replace" ? "Replace card" : "Add payment method"} onClose={() => !submit.isPending && setStep(null)}>
          <p style={{ margin: 0, fontSize: 12.5, color: U.text3, lineHeight: 1.55 }}>
            {step.mode === "default"
              ? "Confirm it's you to change the default card for your subscription."
              : step.mode === "replace"
                ? `Confirm it's you. You'll then enter the new card on Stripe's secure page; it takes the place of ${brandName(step.target!.brand)} ending ${step.target!.last4} once Stripe verifies it.`
                : "Confirm it's you. You'll then enter the card on Stripe's secure page — the card number goes straight to Stripe, not to Noxtill."}
          </p>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, fontWeight: 700, color: U.text2 }}>
            Password for {session.user.email || session.user.name}
            <input
              type="password"
              autoComplete="current-password"
              autoFocus
              value={pw}
              onChange={(e) => {
                setPw(e.target.value);
                setPwErr("");
              }}
              onKeyDown={(e) => e.key === "Enter" && pw && submit.mutate()}
              style={{ ...inputStyle, borderColor: pwErr ? "#F04438" : undefined }}
            />
          </label>
          {pwErr ? <div role="alert" style={{ fontSize: 12, color: U.danger, fontWeight: 600, marginTop: -6 }}>{pwErr}</div> : null}
          {step.mode === "add" && methods.length > 0 ? (
            <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12.5, color: U.text2, cursor: "pointer" }}>
              <input type="checkbox" checked={step.makeDefault} onChange={() => setStep({ ...step, makeDefault: !step.makeDefault })} style={{ width: 18, height: 18, margin: 0, accentColor: "var(--app-primary)" }} />
              Use as default for my subscription
            </label>
          ) : null}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" disabled={submit.isPending} onClick={() => setStep(null)} style={ghostBtn()}>
              Cancel
            </button>
            <button type="button" disabled={!pw || submit.isPending} onClick={() => submit.mutate()} style={primaryBtn(!pw)}>
              {submit.isPending ? "Checking…" : step.mode === "default" ? "Confirm and set default" : "Continue to Stripe"}
            </button>
          </div>
        </Modal>
      ) : null}
      <Toast message={toast} />
    </>
  );
}
