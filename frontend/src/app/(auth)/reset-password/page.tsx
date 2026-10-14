"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { fetchResetTokenStatus, resetPassword } from "@/lib/auth-api";
import { useAuthStore } from "@/store/auth-store";
import { AuthCard, BackToLogin, C, FieldLabel, FormError, InfoNote, LogoN, PasswordField, PrimaryButton, StrengthMeter, Subtitle, Title } from "@/components/auth-flow/auth-ui";

function Requirement({ ok, failed, children }: { ok: boolean; failed?: boolean; children: React.ReactNode }) {
  const stroke = failed ? C.danger : ok ? C.active : "#CBD5E1";
  return (
    <li style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14.5, color: failed ? C.danger : C.slate }}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {failed ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="m5 13 4 4L19 7" />}
      </svg>
      {children}
    </li>
  );
}

export default function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const raw = use(searchParams).token;
  const token = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reused, setReused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { data: status, isLoading } = useQuery({ queryKey: ["auth", "reset", token], queryFn: () => fetchResetTokenStatus(token), enabled: Boolean(token), retry: false });

  const longEnough = password.length >= 8;
  const mixed = /[A-Za-z]/.test(password) && /\d/.test(password);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setReused(false);
    if (!longEnough || !mixed) return setError("Your new password doesn't meet the requirements below.");
    if (password !== confirm) return setError("The two passwords don't match.");
    setSubmitting(true);
    try {
      await resetPassword(token, password);
      // Every session was revoked server-side — drop this device's too.
      useAuthStore.getState().clearSession();
      router.push("/login?reset=1");
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError && err.code === "PASSWORD_REUSED") setReused(true);
      setError(err instanceof ApiError ? err.message : "Something went wrong — please try again.");
    }
  }

  const invalid = !token || (!isLoading && status && !status.valid);

  return (
    <AuthCard>
      <LogoN width={92} />
      <Title size={30} margin="20px 0 8px">
        Set a new password
      </Title>
      <Subtitle size={16.5}>Choose a password you haven&apos;t used before.</Subtitle>
      {invalid ? (
        <>
          <InfoNote tone="danger">This reset link is invalid or has expired. Reset links work once and expire after 30 minutes.</InfoNote>
          <PrimaryButton onClick={() => router.push("/forgot-password")}>Request a new link</PrimaryButton>
          <div style={{ height: 14 }} />
          <BackToLogin onClick={() => router.push("/login")} />
        </>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <FieldLabel htmlFor="pw">New password</FieldLabel>
          <PasswordField id="pw" value={password} onChange={setPassword} placeholder="Enter new password" marginBottom={10} autoComplete="new-password" />
          <StrengthMeter password={password} marginBottom={18} />
          <FieldLabel htmlFor="pw2">Confirm new password</FieldLabel>
          <PasswordField id="pw2" value={confirm} onChange={setConfirm} placeholder="Re-enter new password" marginBottom={20} autoComplete="new-password" invalid={confirm.length > 0 && confirm !== password} />
          <FormError message={error} />
          <PrimaryButton type="submit" disabled={submitting || isLoading}>
            {submitting ? "Saving…" : "Reset password"}
          </PrimaryButton>
          <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0", display: "flex", flexDirection: "column", gap: 9 }}>
            <Requirement ok={longEnough}>At least 8 characters</Requirement>
            <Requirement ok={mixed}>One number and one letter</Requirement>
            <Requirement ok={false} failed={reused}>
              Not one of your previous passwords
            </Requirement>
          </ul>
        </form>
      )}
    </AuthCard>
  );
}
