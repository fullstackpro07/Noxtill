"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api-client";
import { fetchMfaStatus, stepUp } from "@/lib/auth-api";
import { isPasskeyCancel, passkeysSupported, stepUpWithPasskey } from "@/lib/passkeys";
import { useStepUpStore } from "@/store/step-up-store";

type Mode = "password" | "code" | "recovery";

/**
 * "Confirm it's you" before an elevated action — billing, payroll or a data export (auth security
 * spec §8.5). Opened by apiFetch on STEP_UP_REQUIRED; valid for 10 minutes once confirmed.
 */
export function StepUpDialog() {
  const open = useStepUpStore((s) => s.open);
  // A fresh form (empty field, no stale error) every time the dialog opens.
  return open ? <StepUpForm /> : null;
}

function StepUpForm() {
  const finish = useStepUpStore((s) => s.finish);
  const { data: mfa } = useQuery({ queryKey: ["auth", "mfa"], queryFn: fetchMfaStatus, staleTime: 60_000 });
  const [mode, setMode] = useState<Mode>("password");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await stepUp(mode === "password" ? { password: value } : mode === "code" ? { code: value } : { recoveryCode: value });
      finish(true);
    } catch (err) {
      setBusy(false);
      setError(err instanceof ApiError ? err.message : "That didn't work — try again.");
    }
  }

  async function withPasskey() {
    setBusy(true);
    setError(null);
    try {
      await stepUpWithPasskey();
      finish(true);
    } catch (err) {
      setBusy(false);
      if (!isPasskeyCancel(err)) setError(err instanceof ApiError ? err.message : "We couldn't verify that passkey.");
    }
  }

  const label = mode === "password" ? "Password" : mode === "code" ? "6-digit code from your authenticator app" : "Recovery code";

  return (
    <Dialog
      open
      onClose={() => finish(false)}
      title="Confirm it’s you"
      description="This action changes billing, payroll or exports data. Confirm your identity to continue — you won’t be asked again for 10 minutes."
      footer={
        <>
          <Button variant="ghost" onClick={() => finish(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={busy || !value}>
            {busy ? "Confirming…" : "Confirm"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          label={label}
          type={mode === "password" ? "password" : "text"}
          inputMode={mode === "code" ? "numeric" : undefined}
          autoComplete={mode === "password" ? "current-password" : "one-time-code"}
          value={value}
          onChange={(e) => setValue(mode === "code" ? e.target.value.replace(/\D/g, "").slice(0, 6) : e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && value && !busy && void confirm()}
          error={error ?? undefined}
          autoFocus
        />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {mode !== "password" && (
            <button type="button" className="font-medium text-primary" onClick={() => (setMode("password"), setValue(""))}>
              Use my password
            </button>
          )}
          {mfa?.totp && mode !== "code" && (
            <button type="button" className="font-medium text-primary" onClick={() => (setMode("code"), setValue(""))}>
              Use authenticator app
            </button>
          )}
          {mfa && mfa.recoveryCodesLeft > 0 && mode !== "recovery" && (
            <button type="button" className="font-medium text-primary" onClick={() => (setMode("recovery"), setValue(""))}>
              Use a recovery code
            </button>
          )}
          {mfa && mfa.passkeys > 0 && passkeysSupported() && (
            <button type="button" className="font-medium text-primary" onClick={withPasskey} disabled={busy}>
              Use a passkey
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
