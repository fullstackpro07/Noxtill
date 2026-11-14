"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api-client";
import { completeOAuthSignup, confirmOAuthLink, exchangeOAuthCode, type OAuthExchangeResult, type SignInStep, type SocialProvider } from "@/lib/auth-api";
import { ArrowRight, AuthCard, C, FieldLabel, FormError, LogoN, PrimaryButton, Subtitle, TextField, Title } from "@/components/auth-flow/auth-ui";
import { OtpInput } from "@/components/auth-flow/otp-input";
import { SignInSteps } from "@/components/auth-flow/sign-in-steps";
import { establishSession } from "@/components/auth-flow/session";

const LABEL: Record<SocialProvider, string> = { google: "Google", microsoft: "Microsoft", facebook: "Facebook" };

type Step =
  | { kind: "loading" }
  | { kind: "signin"; step: Exclude<SignInStep, { status: "authenticated" }> }
  | { kind: "email"; ticket: string; provider: SocialProvider; name: string | null }
  | { kind: "confirm"; ticket: string; provider: SocialProvider; email: string };

/**
 * Provider sign-in lands here with a one-time handoff code (`?code=`) — never tokens. The code is
 * exchanged over HTTPS; the outcome is the session (HttpOnly cookies), a second-factor step, an
 * "add your email" step, or an emailed code that proves the mailbox before a provider is linked
 * to an existing account (auth security spec §3.1).
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const ran = useRef(false);
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(result: OAuthExchangeResult) {
    setValue("");
    setError(null);
    setBusy(false);
    if (result.status === "authenticated") {
      router.replace(await establishSession(result));
      return;
    }
    if (result.status === "needs_email") {
      setStep({ kind: "email", ticket: result.ticket, provider: result.provider, name: result.name });
      return;
    }
    if (result.status === "confirm_link") {
      setStep({ kind: "confirm", ticket: result.ticket, provider: result.provider, email: result.email });
      return;
    }
    setStep({ kind: "signin", step: result });
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
      .then(handle)
      .catch((err) => {
        const code = err instanceof ApiError && err.code === "SIGN_IN_EXPIRED" ? "sign_in_expired" : "provider_exchange";
        router.replace(`/login?error=${code}`);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function submit(fn: () => Promise<OAuthExchangeResult>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await handle(await fn());
    } catch (err) {
      setBusy(false);
      setValue("");
      setError(err instanceof ApiError ? err.message : "Something went wrong — please try again.");
    }
  }

  const back = (
    <button
      type="button"
      onClick={() => router.replace("/login")}
      style={{ width: "100%", border: 0, background: "transparent", padding: "18px 6px 0", cursor: "pointer", fontSize: 15, fontWeight: 600, color: C.slate }}
    >
      Back to login
    </button>
  );

  if (step.kind === "signin") {
    return (
      <AuthCard>
        <LogoN />
        <Title>Two-step verification</Title>
        <SignInSteps step={step.step} onResult={handle} onBack={() => router.replace("/login")} />
      </AuthCard>
    );
  }

  if (step.kind === "confirm") {
    const label = LABEL[step.provider];
    return (
      <AuthCard>
        <LogoN />
        <Title>Confirm it’s you</Title>
        <Subtitle>
          A Noxtill account already uses this email. To connect {label}, enter the 6-digit code we sent to <strong>{step.email}</strong>.
        </Subtitle>
        <OtpInput value={value} onChange={setValue} onComplete={(v) => submit(() => confirmOAuthLink(step.ticket, v))} disabled={busy} invalid={Boolean(error)} />
        <div style={{ height: 16 }} />
        <FormError message={error} />
        <PrimaryButton onClick={() => submit(() => confirmOAuthLink(step.ticket, value))} disabled={busy || value.length !== 6}>
          {busy ? "Verifying…" : `Connect ${label}`}
          <ArrowRight />
        </PrimaryButton>
        {back}
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
          {label} didn&apos;t share an email address{step.name ? ` for ${step.name}` : ""}. Add one to continue — we&apos;ll send a code to confirm it.
        </Subtitle>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(() => completeOAuthSignup(step.ticket, value.trim()));
          }}
          noValidate
        >
          <FieldLabel htmlFor="email">Work email</FieldLabel>
          <TextField id="email" type="email" autoComplete="email" placeholder="you@company.com" value={value} onChange={(e) => setValue(e.target.value)} style={{ marginBottom: 16 }} autoFocus />
          <FormError message={error} />
          <PrimaryButton type="submit" disabled={busy || !value.includes("@")}>
            {busy ? "Continuing…" : "Continue"}
            <ArrowRight />
          </PrimaryButton>
        </form>
        {back}
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
