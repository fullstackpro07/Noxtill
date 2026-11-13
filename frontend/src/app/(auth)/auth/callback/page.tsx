"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api-client";
import { completeOAuthSignup, exchangeOAuthCode, verifyTwoFactorLogin, type AuthTokens, type Pending2fa, type SocialProvider } from "@/lib/auth-api";
import { ArrowRight, AuthCard, C, FieldLabel, FormError, LogoN, PrimaryButton, Subtitle, TextField, Title } from "@/components/auth-flow/auth-ui";
import { OtpInput } from "@/components/auth-flow/otp-input";
import { establishSession } from "@/components/auth-flow/session";

const LABEL: Record<SocialProvider, string> = { google: "Google", microsoft: "Microsoft", facebook: "Facebook" };

type Step =
  | { kind: "loading" }
  | { kind: "twoFactor"; tempToken: string }
  | { kind: "email"; ticket: string; provider: SocialProvider; name: string | null };

/**
 * Provider sign-in lands here with a one-time handoff code (`?code=`) — never tokens. The code is
 * exchanged over HTTPS for the normal Noxtill session, the WhatsApp 2FA step, or an "add your
 * email" step when the provider didn't share one.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const ran = useRef(false);
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [code2fa, setCode2fa] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish(result: AuthTokens | Pending2fa) {
    if ("pending2fa" in result) {
      setStep({ kind: "twoFactor", tempToken: result.tempToken });
      setBusy(false);
      return;
    }
    router.replace(await establishSession(result));
  }

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const params = new URLSearchParams(window.location.search);
    const handoff = params.get("code");
    const failure = params.get("error");
    // Keep the one-time code out of history and any later Referer.
    window.history.replaceState(null, "", window.location.pathname);
    if (failure || !handoff) {
      router.replace(`/login?error=${encodeURIComponent(failure ?? "provider_exchange")}`);
      return;
    }
    exchangeOAuthCode(handoff)
      .then((r) => {
        if ("needsEmail" in r) {
          setStep({ kind: "email", ticket: r.ticket, provider: r.provider, name: r.name });
          return;
        }
        return finish(r);
      })
      .catch((err) => {
        const code = err instanceof ApiError && err.code === "SIGN_IN_EXPIRED" ? "sign_in_expired" : "provider_exchange";
        router.replace(`/login?error=${code}`);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function submitTwoFactor(value: string) {
    if (step.kind !== "twoFactor" || busy || value.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const tokens = await verifyTwoFactorLogin({ tempToken: step.tempToken, code: value });
      router.replace(await establishSession(tokens));
    } catch (err) {
      setBusy(false);
      setCode2fa("");
      setError(err instanceof ApiError ? err.message : "Something went wrong — please try again.");
    }
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    if (step.kind !== "email" || busy) return;
    setBusy(true);
    setError(null);
    try {
      await finish(await completeOAuthSignup(step.ticket, email.trim()));
    } catch (err) {
      setBusy(false);
      setError(err instanceof ApiError ? err.message : "Something went wrong — please try again.");
    }
  }

  if (step.kind === "twoFactor") {
    return (
      <AuthCard>
        <LogoN />
        <Title>Two-step verification</Title>
        <Subtitle>We sent a 6-digit code to your phone on WhatsApp to finish signing in.</Subtitle>
        <OtpInput value={code2fa} onChange={setCode2fa} onComplete={submitTwoFactor} disabled={busy} invalid={Boolean(error)} />
        <div style={{ height: 16 }} />
        <FormError message={error} />
        <PrimaryButton onClick={() => submitTwoFactor(code2fa)} disabled={busy || code2fa.length !== 6}>
          {busy ? "Verifying…" : "Verify & log in"}
          <ArrowRight />
        </PrimaryButton>
      </AuthCard>
    );
  }

  if (step.kind === "email") {
    const label = LABEL[step.provider];
    return (
      <AuthCard>
        <LogoN />
        <Title>Add your email</Title>
        <Subtitle>
          {label} didn&apos;t share an email address{step.name ? ` for ${step.name}` : ""}. Add one to create your Noxtill account — we&apos;ll send a code to confirm it.
        </Subtitle>
        <form onSubmit={submitEmail} noValidate>
          <FieldLabel htmlFor="email">Work email</FieldLabel>
          <TextField id="email" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} style={{ marginBottom: 16 }} autoFocus />
          <FormError message={error} />
          <PrimaryButton type="submit" disabled={busy || !email.includes("@")}>
            {busy ? "Creating your account…" : "Continue"}
            <ArrowRight />
          </PrimaryButton>
        </form>
        <button
          type="button"
          onClick={() => router.replace("/login")}
          style={{ width: "100%", border: 0, background: "transparent", padding: "18px 6px 0", cursor: "pointer", fontSize: 15, fontWeight: 600, color: C.slate }}
        >
          Back to login
        </button>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <LogoN width={92} />
      <Title size={26}>Signing you in…</Title>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
        <span style={{ width: 28, height: 28, borderRadius: "50%", border: "3px solid #D7F0E1", borderTopColor: C.complete, animation: "nxSpin .9s linear infinite" }} />
      </div>
    </AuthCard>
  );
}
