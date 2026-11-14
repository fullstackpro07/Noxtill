"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api-client";
import { verifyLoginDevice, verifyLoginMfa, type SignInStep } from "@/lib/auth-api";
import { isPasskeyCancel, passkeysSupported, signInWithPasskey } from "@/lib/passkeys";
import { C, FieldLabel, FormError, PasskeyIcon, PrimaryButton, SocialButton, TextField, ArrowRight } from "./auth-ui";
import { OtpInput } from "./otp-input";

type PendingStep = Exclude<SignInStep, { status: "authenticated" }>;

/**
 * The follow-up steps of a sign-in (auth security spec §7.3): the emailed code for a new device,
 * then the second factor — authenticator app, passkey or a recovery code. Shared by the login page
 * and the provider callback page.
 */
export function SignInSteps({
  step,
  onResult,
  onBack,
}: {
  step: PendingStep;
  onResult: (next: SignInStep) => void | Promise<void>;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"totp" | "recovery">(step.status === "mfa" && !step.methods.includes("totp") ? "recovery" : "totp");

  async function run(fn: () => Promise<SignInStep>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await fn();
      setCode("");
      setBusy(false);
      await onResult(next);
    } catch (err) {
      setBusy(false);
      setCode("");
      if (!isPasskeyCancel(err)) setError(err instanceof ApiError ? err.message : "Something went wrong — please try again.");
    }
  }

  const back = (
    <button
      type="button"
      onClick={onBack}
      style={{ width: "100%", border: 0, background: "transparent", padding: "18px 6px 0", cursor: "pointer", fontSize: 15, fontWeight: 600, color: C.slate }}
    >
      Back to login
    </button>
  );

  if (step.status === "device_code") {
    return (
      <div>
        <p style={{ fontSize: 15, color: C.secondary, margin: "0 0 18px", textAlign: "center", lineHeight: 1.5 }}>
          You’re signing in from a new device. We emailed a 6-digit code to <strong style={{ color: C.ink }}>{step.email}</strong>.
        </p>
        <OtpInput value={code} onChange={setCode} onComplete={(v) => run(() => verifyLoginDevice(step.ticket, v))} disabled={busy} invalid={Boolean(error)} />
        <div style={{ height: 16 }} />
        <FormError message={error} />
        <PrimaryButton onClick={() => run(() => verifyLoginDevice(step.ticket, code))} disabled={busy || code.length !== 6}>
          {busy ? "Verifying…" : "Continue"}
          <ArrowRight />
        </PrimaryButton>
        {back}
      </div>
    );
  }

  const hasPasskey = step.methods.includes("passkey") && passkeysSupported();
  return (
    <div>
      <p style={{ fontSize: 15, color: C.secondary, margin: "0 0 18px", textAlign: "center", lineHeight: 1.5 }}>
        {mode === "totp" ? "Enter the 6-digit code from your authenticator app." : "Enter one of your recovery codes."}
      </p>
      {mode === "totp" ? (
        <OtpInput value={code} onChange={setCode} onComplete={(v) => run(() => verifyLoginMfa(step.ticket, { code: v }))} disabled={busy} invalid={Boolean(error)} />
      ) : (
        <>
          <FieldLabel htmlFor="recovery">Recovery code</FieldLabel>
          <TextField id="recovery" autoComplete="one-time-code" autoFocus value={code} onChange={(e) => setCode(e.target.value.trim())} placeholder="xxxxx-xxxxx" style={{ marginBottom: 4 }} />
        </>
      )}
      <div style={{ height: 16 }} />
      <FormError message={error} />
      <PrimaryButton
        onClick={() => run(() => verifyLoginMfa(step.ticket, mode === "totp" ? { code } : { recoveryCode: code }))}
        disabled={busy || (mode === "totp" ? code.length !== 6 : code.length < 10)}
      >
        {busy ? "Verifying…" : "Verify & log in"}
        <ArrowRight />
      </PrimaryButton>
      {hasPasskey && (
        <div style={{ marginTop: 12 }}>
          <SocialButton onClick={() => run(() => signInWithPasskey(step.ticket))} disabled={busy}>
            <PasskeyIcon />
            Use a passkey instead
          </SocialButton>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 14, fontSize: 14 }}>
        {mode === "totp" && step.methods.includes("recovery") && (
          <button type="button" onClick={() => (setMode("recovery"), setCode(""), setError(null))} style={{ border: 0, background: "transparent", color: C.primary, fontWeight: 600, cursor: "pointer" }}>
            Use a recovery code
          </button>
        )}
        {mode === "recovery" && step.methods.includes("totp") && (
          <button type="button" onClick={() => (setMode("totp"), setCode(""), setError(null))} style={{ border: 0, background: "transparent", color: C.primary, fontWeight: 600, cursor: "pointer" }}>
            Use my authenticator app
          </button>
        )}
      </div>
      {back}
    </div>
  );
}
