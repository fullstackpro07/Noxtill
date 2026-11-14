"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { ApiError, loadSessionInfo } from "@/lib/api-client";
import { confirmTotp, logout, startTotp } from "@/lib/auth-api";
import { addPasskey, isPasskeyCancel, passkeysSupported } from "@/lib/passkeys";
import { useAuthStore } from "@/store/auth-store";
import { useAuthProviders } from "@/components/auth-flow/social-buttons";
import { ArrowRight, AuthCard, BackToLogin, C, FormError, InfoNote, LogoN, PasskeyIcon, PrimaryButton, SocialButton, Subtitle, Title } from "@/components/auth-flow/auth-ui";
import { OtpInput } from "@/components/auth-flow/otp-input";
import { refreshSession } from "@/components/auth-flow/session";

type Stage = { kind: "choose" } | { kind: "totp"; secret: string; otpauthUrl: string } | { kind: "codes"; codes: string[] };

/**
 * Owners must have a second factor that doesn't depend on email — an authenticator app or a
 * passkey (auth security spec §7.3). Until one exists the session can only reach this screen.
 */
export default function SetupMfaPage() {
  const router = useRouter();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { data: providers } = useAuthProviders();
  const [stage, setStage] = useState<Stage>({ kind: "choose" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hasHydrated && !isAuthenticated) router.replace("/login?next=/setup-mfa");
    else if (hasHydrated) void loadSessionInfo();
  }, [hasHydrated, isAuthenticated, router]);

  async function done() {
    useAuthStore.getState().setMfaSetupRequired(false);
    router.replace(await refreshSession());
  }

  async function run<T>(fn: () => Promise<T>, then: (r: T) => void | Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await then(await fn());
    } catch (err) {
      setCode("");
      if (!isPasskeyCancel(err)) setError(err instanceof ApiError ? err.message : "Something went wrong — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    try {
      await logout();
    } catch {
      /* already gone */
    }
    useAuthStore.getState().clearSession();
    router.push("/login");
  }

  if (!hasHydrated || !isAuthenticated) return null;

  if (stage.kind === "codes") {
    return (
      <AuthCard wide>
        <LogoN width={92} />
        <Title size={28}>Save your recovery codes</Title>
        <Subtitle size={16}>If you lose your phone, each of these codes signs you in once. Store them somewhere safe — they won’t be shown again.</Subtitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, background: C.mintSoft, border: "1px solid #DEF0E6", borderRadius: 12, padding: 16, marginBottom: 18, fontFamily: "ui-monospace, Consolas, monospace", fontSize: 15.5 }}>
          {stage.codes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <PrimaryButton
          onClick={() => {
            void navigator.clipboard?.writeText(stage.codes.join("\n"));
          }}
          background="#fff"
          style={{ color: C.primary, border: `1px solid ${C.inputBorder}`, marginBottom: 12 }}
        >
          Copy codes
        </PrimaryButton>
        <PrimaryButton onClick={done} background={C.confirm} hover="confirm">
          I’ve saved them — continue
          <ArrowRight />
        </PrimaryButton>
      </AuthCard>
    );
  }

  if (stage.kind === "totp") {
    return (
      <AuthCard wide>
        <LogoN width={92} />
        <Title size={28}>Scan with your authenticator app</Title>
        <Subtitle size={16}>Use Google Authenticator, Microsoft Authenticator, 1Password or any app that supports one-time codes.</Subtitle>
        <div style={{ display: "flex", justifyContent: "center", margin: "4px 0 14px" }}>
          <div style={{ padding: 12, background: "#fff", border: `1px solid ${C.hairline}`, borderRadius: 12 }}>
            <QRCodeSVG value={stage.otpauthUrl} size={176} />
          </div>
        </div>
        <InfoNote margin="0 0 18px">
          Can’t scan? Enter this key: <strong style={{ fontFamily: "ui-monospace, Consolas, monospace", wordBreak: "break-all" }}>{stage.secret}</strong>
        </InfoNote>
        <p style={{ fontSize: 15, color: C.secondary, textAlign: "center", margin: "0 0 12px" }}>Then enter the 6-digit code it shows:</p>
        <OtpInput value={code} onChange={setCode} onComplete={(v) => run(() => confirmTotp(v), (r) => setStage({ kind: "codes", codes: r.recoveryCodes }))} disabled={busy} invalid={Boolean(error)} />
        <div style={{ height: 16 }} />
        <FormError message={error} />
        <PrimaryButton onClick={() => run(() => confirmTotp(code), (r) => setStage({ kind: "codes", codes: r.recoveryCodes }))} disabled={busy || code.length !== 6}>
          {busy ? "Checking…" : "Turn on"}
          <ArrowRight />
        </PrimaryButton>
        <button
          type="button"
          onClick={() => (setStage({ kind: "choose" }), setError(null), setCode(""))}
          style={{ width: "100%", border: 0, background: "transparent", padding: "18px 6px 0", cursor: "pointer", fontSize: 15, fontWeight: 600, color: C.slate }}
        >
          Choose another method
        </button>
      </AuthCard>
    );
  }

  return (
    <AuthCard wide>
      <LogoN width={92} />
      <Title size={28}>Protect your business account</Title>
      <Subtitle size={16}>
        Your account holds sales, payroll and customer data, so owners need a second way to prove it’s them — one that doesn’t depend on email. Choose one to continue.
      </Subtitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SocialButton onClick={() => run(() => startTotp(), (r) => setStage({ kind: "totp", ...r }))} disabled={busy}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
            <path d="M10 18h4" />
          </svg>
          Use an authenticator app
        </SocialButton>
        {providers?.passkeys && passkeysSupported() && (
          <SocialButton onClick={() => run(() => addPasskey(), () => done())} disabled={busy}>
            <PasskeyIcon />
            Use a passkey (Face ID, Touch ID, Windows Hello)
          </SocialButton>
        )}
      </div>
      <div style={{ height: 16 }} />
      <FormError message={error} />
      <BackToLogin onClick={signOut} />
    </AuthCard>
  );
}
