"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api-client";
import { verifyEmail } from "@/lib/auth-api";
import { useAuthStore } from "@/store/auth-store";
import { ArrowRight, AuthCard, C, InfoNote, LogoN, PrimaryButton, Title } from "@/components/auth-flow/auth-ui";
import { refreshSession } from "@/components/auth-flow/session";

const TOTAL_STEPS = 5;

type State = { kind: "loading" } | { kind: "ok"; email: string | null } | { kind: "error"; message: string };

/** The link in the confirmation email lands here. Success plays the one-pass ~1.2s confirmation sequence. */
export default function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const raw = use(searchParams).token;
  const token = Array.isArray(raw) ? raw[0] : raw;
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [state, setState] = useState<State>(
    token ? { kind: "loading" } : { kind: "error", message: "This confirmation link is incomplete. Open the newest email we sent you." },
  );
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!token) return;
    verifyEmail(token)
      .then((r) => setState({ kind: "ok", email: r.email }))
      .catch((err) => setState({ kind: "error", message: err instanceof ApiError ? err.message : "We couldn't confirm your email — please try again." }));
  }, [token]);

  async function continueToStep2() {
    if (!accessToken) {
      router.push("/login?next=/onboarding");
      return;
    }
    try {
      router.push(await refreshSession("/onboarding"));
    } catch {
      router.push("/login?next=/onboarding");
    }
  }

  if (state.kind === "loading") {
    return (
      <AuthCard wide>
        <LogoN width={92} />
        <Title size={28}>Confirming your email…</Title>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
          <span style={{ width: 28, height: 28, borderRadius: "50%", border: "3px solid #D7F0E1", borderTopColor: C.complete, animation: "nxSpin .9s linear infinite" }} />
        </div>
      </AuthCard>
    );
  }

  if (state.kind === "error") {
    return (
      <AuthCard wide>
        <LogoN width={92} />
        <Title size={30} margin="20px 0 14px">
          Link expired or already used
        </Title>
        <InfoNote tone="danger">{state.message}</InfoNote>
        <PrimaryButton onClick={() => router.push(accessToken ? "/check-email" : "/login?next=/check-email")}>
          Get a new link
          <ArrowRight />
        </PrimaryButton>
      </AuthCard>
    );
  }

  return (
    <AuthCard wide padding="44px 36px 30px" style={{ animation: "nxFade .5s ease both" }}>
      <div style={{ display: "flex", justifyContent: "center", position: "relative", height: 128, alignItems: "center" }}>
        <span style={{ position: "absolute", width: 128, height: 128, borderRadius: "50%", border: "3px solid #12A150", animation: "nxRing 1.1s ease-out .25s both" }} />
        <span style={{ position: "absolute", inset: 0, pointerEvents: "none" }} aria-hidden>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: i % 2 ? "#12A150" : "#6EE7A8",
                transform: `translate(-50%, -50%) rotate(${i * 60}deg) translateY(-54px)`,
                opacity: 0,
                animation: `nxParticle .25s ease ${0.35 + i * 0.05}s forwards`,
              }}
            />
          ))}
        </span>
        <span style={{ width: 128, height: 128, borderRadius: "50%", background: C.mint, display: "grid", placeItems: "center", animation: "nxPop .5s cubic-bezier(.22,1,.36,1) both", position: "relative" }}>
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#0B8A49" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m5 12.5 4.5 4.5L19 7.5" style={{ strokeDasharray: 32, strokeDashoffset: 32, animation: "nxDraw .55s ease-out .32s forwards" }} />
          </svg>
        </span>
      </div>
      <h1 style={{ fontSize: 31, fontWeight: 800, letterSpacing: "-.02em", textAlign: "center", margin: "24px 0 12px", animation: "nxFade .5s ease .55s both" }}>Email confirmed successfully</h1>
      <p style={{ fontSize: 16.5, color: C.secondary, textAlign: "center", margin: "0 0 16px", lineHeight: 1.55, animation: "nxFade .5s ease .65s both" }}>
        Your Noxtill account has been verified. Continue to Step 2 to tell us about your business and set up your workspace.
      </p>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 20, animation: "nxFade .5s ease .7s both" }}>
        <span style={{ background: C.mint, color: C.primary, fontSize: 14, fontWeight: 700, padding: "7px 16px", borderRadius: 99 }}>Next: Step 2 of {TOTAL_STEPS}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, background: "#F4F8F6", borderRadius: 14, padding: 16, marginBottom: 20, animation: "nxFade .5s ease .8s both" }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="1.7" style={{ flex: "none" }} aria-hidden>
          <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
          <path d="m3 7 9 6 9-6" />
        </svg>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 16.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>{state.email}</span>
          <span style={{ display: "block", fontSize: 14.5, color: C.secondary }}>Email verified</span>
        </span>
        <span style={{ width: 28, height: 28, borderRadius: "50%", background: C.complete, display: "grid", placeItems: "center", color: "#fff", flex: "none" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m5 13 4 4L19 7" />
          </svg>
        </span>
      </div>
      <PrimaryButton onClick={continueToStep2} height={58} background={C.confirm} hover="confirm" style={{ fontSize: 17.5, animation: "nxFade .5s ease .9s both" }}>
        Continue to Step 2
        <ArrowRight />
      </PrimaryButton>
      <button
        type="button"
        onClick={() => router.push("/login")}
        style={{ width: "100%", border: 0, background: "transparent", padding: "18px 6px", cursor: "pointer", fontSize: 16, fontWeight: 700, color: C.primary }}
      >
        Back to login
      </button>
      <div style={{ height: 1, background: C.hairline, margin: "0 0 16px" }} />
      <p style={{ textAlign: "center", fontSize: 14.5, color: C.muted, margin: 0 }}>You&apos;ll be taken to your business setup.</p>
    </AuthCard>
  );
}
