"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api-client";
import { login as loginRequest, type SignInStep } from "@/lib/auth-api";
import { toast } from "@/lib/toast";
import {
  AuthCard,
  ArrowRight,
  C,
  FieldLabel,
  FormError,
  LogoN,
  OrDivider,
  PasswordField,
  PasskeyIcon,
  PrimaryButton,
  SocialButton,
  Subtitle,
  TextField,
  Title,
} from "@/components/auth-flow/auth-ui";
import { SocialButtons, useAuthProviders } from "@/components/auth-flow/social-buttons";
import { isPasskeyCancel, passkeysSupported, signInWithPasskey } from "@/lib/passkeys";
import { establishSession } from "@/components/auth-flow/session";
import { SignInSteps } from "@/components/auth-flow/sign-in-steps";
import { Turnstile } from "@/components/auth-flow/turnstile";

/** Safe messages for `/login?error=` codes from the provider callback (never reveal whether an email has an account). */
const SIGN_IN_ERRORS: Record<string, string> = {
  provider_cancelled: "Sign-in was cancelled.",
  provider_state: "Your sign-in expired — please try again.",
  provider_exchange: "Sign-in couldn't be completed — please try again.",
  provider_unavailable: "That sign-in method isn't available right now — use your email instead.",
  account_exists: "We couldn't sign you in with that account. If you already have a Noxtill account, log in below, then connect it from Settings → Security.",
  sign_in_expired: "Your sign-in expired — please try again.",
  provider_email_unverified: "That Google account's email address isn't verified. Verify it with Google, or log in with your email.",
  rate_limited: "Too many sign-in attempts. Wait a few minutes and try again.",
};

type SearchParams = Promise<{ tab?: string | string[]; next?: string | string[]; error?: string | string[]; reset?: string | string[] }>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = use(searchParams);
  const router = useRouter();
  const next = first(params.next) ?? null;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const providerError = first(params.error);
  const [error, setError] = useState<string | null>(providerError ? (SIGN_IN_ERRORS[providerError] ?? "Sign-in failed — please try again.") : null);
  const { data: providers } = useAuthProviders();
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  // New device → emailed code; then the second factor (spec §7.3). No session exists until both pass.
  const [step, setStep] = useState<Exclude<SignInStep, { status: "authenticated" }> | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  async function handleStep(result: SignInStep) {
    if (result.status === "authenticated") {
      router.push(await establishSession(result, next));
      return;
    }
    setStep(result);
  }

  useEffect(() => {
    // Old "/login?tab=signup" links (marketing CTAs) now have their own page.
    if (first(params.tab) === "signup") router.replace("/signup");
    if (first(params.reset)) toast.success("Password updated — log in with your new password.");
  }, [params, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await loginRequest({ emailOrPhone: email.trim(), password, rememberMe: remember, turnstileToken: turnstileToken ?? undefined });
      setSubmitting(false);
      setPassword("");
      await handleStep(result);
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof ApiError ? (err.status === 401 ? "That email and password don't match an account." : err.message) : "Something went wrong — please try again.");
    }
  }

  async function onPasskey() {
    if (passkeyBusy) return;
    setError(null);
    setPasskeyBusy(true);
    try {
      // A passkey is possession + biometric/PIN, so it completes the second factor too.
      const result = await signInWithPasskey();
      setPasskeyBusy(false);
      await handleStep(result);
    } catch (err) {
      setPasskeyBusy(false);
      if (isPasskeyCancel(err)) return;
      setError(err instanceof ApiError ? err.message : "We couldn't sign you in with a passkey — try again or use your email.");
    }
  }

  return (
    <>
      <AuthCard>
        <LogoN />
        <Title>Welcome back</Title>
        <Subtitle>Log in to your account</Subtitle>

        {step ? (
          <SignInSteps
            step={step}
            onResult={handleStep}
            onBack={() => {
              setStep(null);
              setError(null);
            }}
          />
        ) : (
          <>
            <SocialButtons />
            <form key="credentials" onSubmit={onSubmit} noValidate>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <TextField
                id="email"
                type="text"
                inputMode="email"
                autoComplete="username"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ marginBottom: 16 }}
              />
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <PasswordField id="password" value={password} onChange={setPassword} placeholder="Enter your password" autoComplete="current-password" />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={remember}
                  onClick={() => setRemember((v) => !v)}
                  style={{ display: "flex", alignItems: "center", gap: 10, border: 0, background: "transparent", padding: 0, cursor: "pointer", fontSize: 15, color: C.ink, fontWeight: 500 }}
                >
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      display: "grid",
                      placeItems: "center",
                      background: remember ? C.active : "#fff",
                      border: remember ? "0" : "1.8px solid #CBD5E1",
                      color: "#fff",
                    }}
                  >
                    {remember && (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m5 13 4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  Remember me
                </button>
                <Link href="/forgot-password" style={{ fontSize: 15, fontWeight: 600 }}>
                  Forgot password?
                </Link>
              </div>
              <Turnstile onToken={setTurnstileToken} />
              <FormError message={error} />
              <PrimaryButton type="submit" disabled={submitting}>
                {submitting ? "Logging in…" : "Log In"}
                <ArrowRight />
              </PrimaryButton>
            </form>
            {providers?.passkeys && passkeysSupported() && (
              <>
                <OrDivider label="or" margin="18px 0" />
                <SocialButton onClick={onPasskey} disabled={passkeyBusy || submitting}>
                  <PasskeyIcon />
                  {passkeyBusy ? "Waiting for your passkey…" : "Continue with a passkey"}
                </SocialButton>
              </>
            )}
            <p style={{ textAlign: "center", fontSize: 15, color: C.secondary, margin: "20px 0 0" }}>
              Don&apos;t have an account?{" "}
              <Link href="/signup" style={{ fontWeight: 700 }}>
                Create new account
              </Link>
            </p>
          </>
        )}
      </AuthCard>
      <p style={{ fontSize: 13, color: C.muted, display: "flex", gap: 14, alignItems: "center", margin: 0, flexWrap: "wrap", justifyContent: "center" }}>
        <span>©2026 Noxtill LLC. All Rights Reserved.</span>
        <span>|</span>
        <Link href="/legal/privacy">Privacy Policy</Link>
        <span>|</span>
        <Link href="/privacy/choices">Manage Cookies</Link>
      </p>
    </>
  );
}
