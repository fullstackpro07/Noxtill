"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api-client";
import { forgotPassword } from "@/lib/auth-api";
import { ArrowRight, AuthCard, BackToLogin, FieldLabel, FormError, InfoNote, LogoN, PrimaryButton, Subtitle, TextField, Title } from "@/components/auth-flow/auth-ui";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const normalized = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalized)) return setError("Enter the email for your account.");
    setSubmitting(true);
    try {
      await forgotPassword(normalized);
      setSentTo(normalized);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard>
      <LogoN width={92} />
      <Title size={30} margin="20px 0 8px">
        Forgot your password?
      </Title>
      <Subtitle size={16.5} lineHeight={1.55}>
        Enter the email for your account and we&apos;ll send a secure link to reset your password.
      </Subtitle>
      <form onSubmit={onSubmit} noValidate>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <TextField id="email" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} style={{ marginBottom: 20 }} />
        <FormError message={error} />
        <PrimaryButton type="submit" disabled={submitting}>
          {submitting ? "Sending…" : sentTo ? "Send again" : "Send reset link"}
          <ArrowRight />
        </PrimaryButton>
      </form>
      {sentTo ? (
        <InfoNote tone="success" margin="20px 0 18px">
          If an account exists for {sentTo}, a reset link is on its way. The link expires in 30 minutes.
        </InfoNote>
      ) : (
        <InfoNote margin="20px 0 18px">
          For your security we send the same confirmation whether or not an account exists. The link expires in 30 minutes.
        </InfoNote>
      )}
      <BackToLogin onClick={() => router.push("/login")} />
    </AuthCard>
  );
}
