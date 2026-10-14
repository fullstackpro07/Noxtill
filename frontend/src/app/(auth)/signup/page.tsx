"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api-client";
import { signup } from "@/lib/auth-api";
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
  StrengthMeter,
  Subtitle,
  TextField,
  Title,
} from "@/components/auth-flow/auth-ui";
import { SocialButtons } from "@/components/auth-flow/social-buttons";
import { establishSession } from "@/components/auth-flow/session";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Signup — work email + password only; everything about the business is collected in Step 2. */
export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const normalized = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalized)) return setError("Enter a valid work email.");
    if (password.length < 8) return setError("Use at least 8 characters for your password.");
    setSubmitting(true);
    try {
      const tokens = await signup({ email: normalized, password });
      router.push(await establishSession(tokens));
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError && err.code === "ACCOUNT_EXISTS") {
        setError("This email already has an account — log in instead.");
      } else {
        setError(err instanceof ApiError ? (err.fields ? Object.values(err.fields)[0]?.[0] ?? err.message : err.message) : "Something went wrong — please try again.");
      }
    }
  }

  return (
    <AuthCard>
      <LogoN />
      <Title>Get started for free</Title>
      <Subtitle>Create your account</Subtitle>
      <SocialButtons />
      <OrDivider label="or continue with email" />
      <form onSubmit={onSubmit} noValidate>
        <FieldLabel htmlFor="email">Work email</FieldLabel>
        <TextField
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ marginBottom: 16 }}
        />
        <FieldLabel htmlFor="password">Password</FieldLabel>
        <PasswordField id="password" value={password} onChange={setPassword} placeholder="Create a password" marginBottom={10} autoComplete="new-password" />
        <StrengthMeter password={password} />
        <FormError message={error} />
        <PrimaryButton type="submit" disabled={submitting}>
          {submitting ? "Creating account…" : "Create Free Account"}
          <ArrowRight />
        </PrimaryButton>
      </form>
      <p style={{ textAlign: "center", fontSize: 15, color: C.secondary, margin: "20px 0 10px" }}>
        Already have an account?{" "}
        <Link href="/login" style={{ fontWeight: 700, textDecoration: "underline" }}>
          Log in
        </Link>
      </p>
      <p style={{ textAlign: "center", fontSize: 12.5, color: C.muted, margin: 0, lineHeight: 1.6 }}>
        By creating an account you agree to our <Link href="/legal/terms">Terms of Service</Link> and <Link href="/legal/privacy">Privacy Policy</Link>.
      </p>
    </AuthCard>
  );
}
