"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { KeyRound, LogOut, MonitorSmartphone, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { SettingsSectionHeader } from "./settings-section-header";
import { SignInMethods } from "./sign-in-methods";
import {
  changePassword,
  confirmTotp,
  disableTotp,
  fetchDeviceSessions,
  fetchMfaStatus,
  logoutEverywhere,
  regenerateRecoveryCodes,
  revokeDeviceSession,
  startTotp,
} from "@/lib/auth-api";
import { useAuthStore } from "@/store/auth-store";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const fmt = (d: string) => new Date(d).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function deviceName(ua: string | null): string {
  if (!ua) return "Unknown device";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${browser} on ${os}`;
}

/** After a change that ended every session (password change, method removal), send the user to log in. */
function signedOutEverywhere(message: string) {
  useAuthStore.getState().clearSession();
  toast.success(message);
  window.location.assign("/login");
}

/** Prompts for the current password when the server wants fresh authentication, then retries. */
function usePasswordPrompt() {
  const [pending, setPending] = useState<{ title: string; run: (pw: string) => Promise<void> } | null>(null);
  async function guarded(title: string, run: (pw?: string) => Promise<void>) {
    try {
      await run();
    } catch (err) {
      if (err instanceof ApiError && err.code === "REAUTH_REQUIRED") setPending({ title, run: (pw) => run(pw) });
      else toast.error(err instanceof ApiError ? err.message : "Something went wrong — please try again.");
    }
  }
  return { pending, clear: () => setPending(null), guarded };
}

export function SecuritySection() {
  const qc = useQueryClient();
  const { data: mfa } = useQuery({ queryKey: ["auth", "mfa"], queryFn: fetchMfaStatus });
  const { data: devices } = useQuery({ queryKey: ["auth", "devices"], queryFn: fetchDeviceSessions });
  const [enrolling, setEnrolling] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const { pending, clear, guarded } = usePasswordPrompt();

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["auth", "mfa"] });
    qc.invalidateQueries({ queryKey: ["auth", "devices"] });
    qc.invalidateQueries({ queryKey: ["auth", "identities"] });
  };

  return (
    <div>
      <SettingsSectionHeader title="Security" description="Second factor, password, connected accounts, passkeys and signed-in devices for your own login." />

      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {mfa?.totp ? <ShieldCheck className="h-5 w-5 shrink-0 text-whatsapp" aria-hidden /> : <ShieldOff className="h-5 w-5 shrink-0 text-fg-faint" aria-hidden />}
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-fg">Authenticator app</p>
                <Badge tone={mfa?.totp ? "success" : "neutral"}>{mfa?.totp ? "On" : "Off"}</Badge>
                {mfa?.required && <Badge tone="neutral">Required for owners</Badge>}
              </div>
              <p className="mt-0.5 text-sm text-fg-muted">
                {mfa?.totp
                  ? `A code from your authenticator app is asked for at sign-in. ${mfa.recoveryCodesLeft} recovery code${mfa.recoveryCodesLeft === 1 ? "" : "s"} left.`
                  : "Ask for a code from Google Authenticator, Microsoft Authenticator or a similar app at sign-in. A passkey also counts as your second factor."}
              </p>
            </div>
          </div>
          {mfa?.totp ? (
            <div className="flex shrink-0 gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  guarded("New recovery codes", async (pw) => {
                    const r = await regenerateRecoveryCodes(pw);
                    setCodes(r.recoveryCodes);
                    refresh();
                  })
                }
              >
                New recovery codes
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() =>
                  guarded("Turn off the authenticator app", async (pw) => {
                    await disableTotp(pw);
                    toast.success("Authenticator app turned off.");
                    useAuthStore.getState().updateUser({ twoFactorEnabled: (mfa?.passkeys ?? 0) > 0 });
                    refresh();
                  })
                }
              >
                Turn off
              </Button>
            </div>
          ) : (
            <Button size="sm" className="shrink-0" onClick={() => setEnrolling(true)}>
              Set up
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <KeyRound className="h-5 w-5 shrink-0 text-fg-faint" aria-hidden />
            <div>
              <p className="text-sm font-medium text-fg">Password</p>
              <p className="mt-0.5 text-sm text-fg-muted">At least 12 characters, checked against known data breaches. Changing it signs out every device.</p>
            </div>
          </div>
          <Button size="sm" variant="ghost" className="shrink-0" onClick={() => setChangingPassword(true)}>
            Change
          </Button>
        </div>
      </div>

      <SignInMethods />

      <div className="mt-4 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <MonitorSmartphone className="h-5 w-5 shrink-0 text-fg-faint" aria-hidden />
            <div>
              <p className="text-sm font-medium text-fg">Signed-in devices</p>
              <p className="mt-0.5 text-sm text-fg-muted">Every browser and device currently signed in to your account. Location is shown only when the network provides it.</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="destructive"
            className="shrink-0"
            onClick={async () => {
              try {
                await logoutEverywhere();
                signedOutEverywhere("Signed out of every device.");
              } catch (err) {
                toast.error(err instanceof ApiError ? err.message : "Couldn't sign out everywhere.");
              }
            }}
          >
            <LogOut className="h-4 w-4" aria-hidden /> Sign out everywhere
          </Button>
        </div>
        <ul className="mt-4 divide-y divide-border">
          {(devices ?? []).map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <Smartphone className="h-4 w-4 shrink-0 text-fg-faint" aria-hidden />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-fg">{deviceName(d.userAgent)}</p>
                    {d.current && <Badge tone="success">This device</Badge>}
                    {d.sharedDevice && <Badge tone="neutral">Shared device</Badge>}
                  </div>
                  <p className="text-xs text-fg-muted">
                    {[d.country, d.ipAddress].filter(Boolean).join(" · ") || "Location not recorded"} · signed in {fmt(d.createdAt)} · active {fmt(d.lastUsedAt)}
                  </p>
                </div>
              </div>
              {!d.current && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    try {
                      await revokeDeviceSession(d.id);
                      toast.success("Device signed out.");
                      refresh();
                    } catch (err) {
                      toast.error(err instanceof ApiError ? err.message : "Couldn't sign that device out.");
                    }
                  }}
                >
                  Sign out
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {enrolling && (
        <EnrollDialog
          onClose={() => setEnrolling(false)}
          onDone={(c) => {
            setEnrolling(false);
            setCodes(c);
            useAuthStore.getState().updateUser({ twoFactorEnabled: true });
            refresh();
          }}
        />
      )}
      {codes && <RecoveryCodesDialog codes={codes} onClose={() => setCodes(null)} />}
      {changingPassword && <ChangePasswordDialog onClose={() => setChangingPassword(false)} />}
      {pending && <PasswordDialog title={pending.title} onClose={clear} onConfirm={pending.run} />}
    </div>
  );
}

function EnrollDialog({ onClose, onDone }: { onClose: () => void; onDone: (codes: string[]) => void }) {
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [code, setCode] = useState("");

  const start = useMutation({
    mutationFn: () => startTotp(needsPassword ? password : undefined),
    onSuccess: setSetup,
    onError: (err) => {
      if (err instanceof ApiError && err.code === "REAUTH_REQUIRED") setNeedsPassword(true);
      else toast.error(err instanceof ApiError ? err.message : "Couldn't start setup — please try again.");
    },
  });
  const confirm = useMutation({
    mutationFn: () => confirmTotp(code),
    onSuccess: (r) => {
      toast.success("Authenticator app turned on.");
      onDone(r.recoveryCodes);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "That code didn't work — please try again."),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Set up an authenticator app"
      footer={
        setup ? (
          <>
            <Button variant="ghost" onClick={onClose} disabled={confirm.isPending}>
              Cancel
            </Button>
            <Button onClick={() => confirm.mutate()} disabled={code.length !== 6 || confirm.isPending}>
              {confirm.isPending ? "Checking…" : "Turn on"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={start.isPending}>
              Cancel
            </Button>
            <Button onClick={() => start.mutate()} disabled={start.isPending || (needsPassword && !password)}>
              {start.isPending ? "Starting…" : "Continue"}
            </Button>
          </>
        )
      }
    >
      {setup ? (
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-lg border border-border bg-white p-3">
            <QRCodeSVG value={setup.otpauthUrl} size={168} />
          </div>
          <p className="text-center text-xs text-fg-muted">
            Can’t scan? Enter this key: <span className="break-all font-mono">{setup.secret}</span>
          </p>
          <div className="w-full">
            <Input label="6-digit code from the app" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} maxLength={6} autoFocus />
          </div>
        </div>
      ) : needsPassword ? (
        <Input label="Confirm your password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
      ) : (
        <p className="text-sm text-fg-muted">You’ll scan a QR code with Google Authenticator, Microsoft Authenticator, 1Password or a similar app, then enter the code it shows.</p>
      )}
    </Dialog>
  );
}

function RecoveryCodesDialog({ codes, onClose }: { codes: string[]; onClose: () => void }) {
  return (
    <Dialog
      open
      onClose={onClose}
      title="Your recovery codes"
      description="Each code signs you in once if you lose your phone. Store them somewhere safe — they won’t be shown again."
      footer={
        <>
          <Button variant="ghost" onClick={() => void navigator.clipboard?.writeText(codes.join("\n")).then(() => toast.success("Copied."))}>
            Copy
          </Button>
          <Button onClick={onClose}>I’ve saved them</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-surface p-3 font-mono text-sm">
        {codes.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
    </Dialog>
  );
}

function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const tooShort = [...next.normalize("NFKC")].length < 12;
  const mutation = useMutation({
    mutationFn: () => changePassword(current, next),
    onSuccess: () => signedOutEverywhere("Password changed — sign in with your new password."),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't change your password."),
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title="Change password"
      description="Use at least 12 characters — a few words make a strong passphrase. Every device will be signed out."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!current || tooShort || next !== confirm || mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Change password"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
        <Input label="New password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} error={next && tooShort ? "At least 12 characters." : undefined} />
        <Input label="Confirm new password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={confirm && confirm !== next ? "The passwords don't match." : undefined} />
      </div>
    </Dialog>
  );
}

function PasswordDialog({ title, onClose, onConfirm }: { title: string; onClose: () => void; onConfirm: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState("");
  const mutation = useMutation({
    mutationFn: () => onConfirm(password),
    onSuccess: onClose,
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Something went wrong — please try again."),
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      description="For your security, confirm your password to continue."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!password || mutation.isPending}>
            {mutation.isPending ? "Confirming…" : "Confirm"}
          </Button>
        </>
      }
    >
      <Input label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
    </Dialog>
  );
}
