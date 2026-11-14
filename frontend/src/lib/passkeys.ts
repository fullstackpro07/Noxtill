import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { apiFetch } from "@/lib/api-client";
import type { PasskeyView, SignInStep } from "@/lib/auth-api";

/**
 * Passkeys via the browser WebAuthn API. The browser/OS picks the authenticator (Face ID, Touch ID,
 * Windows Hello, Android, a password manager or a security key) — Noxtill never sees biometrics.
 */
export function passkeysSupported(): boolean {
  return typeof window !== "undefined" && browserSupportsWebAuthn();
}

/** The user dismissed the browser prompt — not an error worth showing. */
export function isPasskeyCancel(err: unknown): boolean {
  const name = (err as { name?: string })?.name;
  return name === "NotAllowedError" || name === "AbortError";
}

type Options = { challengeId: string; options: PublicKeyCredentialRequestOptionsJSON };

/** Usernameless sign-in — or, with `ticket`, the second-factor step of a sign-in. */
export async function signInWithPasskey(ticket?: string): Promise<SignInStep> {
  const { challengeId, options } = await apiFetch<Options>(
    "/auth/passkeys/authenticate/options",
    { method: "POST", body: JSON.stringify(ticket ? { ticket } : {}) },
    { skipAuth: true },
  );
  const response = await startAuthentication({ optionsJSON: options });
  return apiFetch(
    "/auth/passkeys/authenticate/verify",
    { method: "POST", body: JSON.stringify({ challengeId, response, ...(ticket ? { ticket } : {}) }) },
    { skipAuth: true },
  );
}

/** Step-up re-authentication with a passkey (billing, payroll, exports). */
export async function stepUpWithPasskey(): Promise<{ validUntil: string }> {
  const { challengeId, options } = await apiFetch<Options>("/auth/passkeys/step-up/options", { method: "POST", body: "{}" });
  const response = await startAuthentication({ optionsJSON: options });
  return apiFetch("/auth/passkeys/step-up/verify", { method: "POST", body: JSON.stringify({ challengeId, response }) });
}

/** `password` only when the server asks for fresh authentication (REAUTH_REQUIRED). */
export async function addPasskey(opts: { password?: string; label?: string } = {}): Promise<PasskeyView> {
  const { challengeId, options } = await apiFetch<{ challengeId: string; options: PublicKeyCredentialCreationOptionsJSON }>("/auth/passkeys/register/options", {
    method: "POST",
    body: JSON.stringify(opts.password ? { password: opts.password } : {}),
  });
  const response = await startRegistration({ optionsJSON: options });
  return apiFetch("/auth/passkeys/register/verify", {
    method: "POST",
    body: JSON.stringify({ challengeId, response, ...(opts.label ? { label: opts.label } : {}) }),
  });
}
