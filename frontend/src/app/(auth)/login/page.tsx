"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api-client";
import { login as loginRequest, verifyTwoFactorLogin } from "@/lib/auth-api";
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
  PrimaryButton,
  Subtitle,
  TextField,
  Title,
} from "@/components/auth-flow/auth-ui";
import { SocialButtons } from "@/components/auth-flow/social-buttons";
import { establishSession } from "@/components/auth-flow/session";

const GOOGLE_ERRORS: Record<string, string> = {
  google_cancelled: "Google sign-in was cancelled.",
  google_state: "Your Google sign-in expired — please try again.",
  google_exchange: "Google sign-in couldn't be completed — please try again.",
  google_email: "Your Google account has no verified email address.",
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
  const googleError = first(params.error);
  const [error, setError] = useState<string | null>(googleError ? (GOOGLE_ERRORS[googleError] ?? "Sign-in failed — please try again.") : null);
  // A 2FA-enabled account gets a code step before tokens are issued (UPD-INT-016).
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [code, setCode] = useState("");

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
      const result = await loginRequest({ emailOrPhone: email.trim(), password, rememberMe: remember });
      if ("pending2fa" in result) {
        setTempToken(result.tempToken);
        setSubmitting(false);
        return;
      }
      router.push(await establishSession(result, next));
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof ApiError ? (err.status === 401 ? "That email and password don't match an account." : err.message) : "Something went wrong — please try again.");
    }
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!tempToken) return;
    setError(null);
    setSubmitting(true);
    try {
      const tokens = await verifyTwoFactorLogin({ tempToken, code });
      router.push(await establishSession(tokens, next));
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof ApiError ? err.message : "Something went wrong — please try again.");
    }
  }

  return (
    <>
      <AuthCard>
        <LogoN />
        <Title>Welcome back</Title>
        <Subtitle>Log in to your account</Subtitle>

        {tempToken ? (
          <form key="2fa" onSubmit={onVerify}>
            <p style={{ fontSize: 15, color: C.secondary, margin: "0 0 18px", textAlign: "center", lineHeight: 1.5 }}>
              We sent a 6-digit verification code to your phone to finish signing in.
            </p>
            <FieldLabel htmlFor="code">Verification code</FieldLabel>
            <TextField
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              style={{ marginBottom: 16, letterSpacing: ".3em" }}
            />
            <FormError message={error} />
            <PrimaryButton type="submit" disabled={submitting || code.length !== 6}>
              {submitting ? "Verifying…" : "Verify & log in"}
              <ArrowRight />
            </PrimaryButton>
            <button
              type="button"
              onClick={() => {
                setTempToken(null);
                setCode("");
                setError(null);
              }}
              style={{ width: "100%", border: 0, background: "transparent", padding: "18px 6px 0", cursor: "pointer", fontSize: 15, fontWeight: 600, color: C.slate }}
            >
              Back to login
            </button>
          </form>
        ) : (
          <>
            <SocialButtons />
            <OrDivider label="or continue with email" />
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
              <FormError message={error} />
              <PrimaryButton type="submit" disabled={submitting}>
                {submitting ? "Logging in…" : "Log In"}
                <ArrowRight />
              </PrimaryButton>
            </form>
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
