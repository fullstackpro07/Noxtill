"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { FacebookIcon, GoogleIcon, MicrosoftIcon } from "@/components/auth-flow/auth-ui";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { fetchIdentities, fetchPasskeys, renamePasskey, removePasskey, startIdentityLink, unlinkIdentity, type PasskeyView, type SocialProvider } from "@/lib/auth-api";
import { addPasskey, isPasskeyCancel, passkeysSupported } from "@/lib/passkeys";
import { useAuthStore } from "@/store/auth-store";

const ICONS: Record<SocialProvider, () => React.JSX.Element> = { google: GoogleIcon, microsoft: MicrosoftIcon, facebook: FacebookIcon };

const LINK_ERRORS: Record<string, string> = {
  IDENTITY_TAKEN: "That account is already connected to a different Noxtill user.",
  PROVIDER_ALREADY_LINKED: "That provider is already connected to your account.",
  provider_cancelled: "Connecting was cancelled.",
  provider_state: "That request expired — please try again.",
  provider_exchange: "We couldn't verify that account — please try again.",
  provider_unavailable: "That sign-in method isn't available right now.",
};

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null);

/** Runs a sensitive change; when the server wants fresh authentication, asks for the password and retries. */
function useReauth() {
  const [pending, setPending] = useState<{ title: string; run: (password: string) => Promise<void> } | null>(null);
  async function guarded(title: string, run: (password?: string) => Promise<void>) {
    try {
      await run();
    } catch (err) {
      if (err instanceof ApiError && err.code === "REAUTH_REQUIRED") {
        setPending({ title, run: (pw) => run(pw) });
        return;
      }
      if (!isPasskeyCancel(err)) toast.error(err instanceof ApiError ? err.message : "Something went wrong — please try again.");
    }
  }
  return { pending, clear: () => setPending(null), guarded };
}

/**
 * Settings → Security: connected sign-in providers and passkeys (auth spec §6.5). Everything shown
 * comes from /auth/identities and /auth/passkeys; providers that aren't configured on this
 * environment are not offered.
 */
export function SignInMethods() {
  const qc = useQueryClient();
  const { data: identities } = useQuery({ queryKey: ["auth", "identities"], queryFn: fetchIdentities });
  const { data: passkeys } = useQuery({ queryKey: ["auth", "passkeys"], queryFn: fetchPasskeys });
  const { pending, clear, guarded } = useReauth();
  const [renaming, setRenaming] = useState<PasskeyView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Result of a provider "connect" round trip.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linked = params.get("linked");
    const linkError = params.get("link_error");
    if (!linked && !linkError) return;
    if (linked) toast.success(`${linked.charAt(0).toUpperCase()}${linked.slice(1)} connected.`);
    if (linkError) toast.error(LINK_ERRORS[linkError] ?? "Couldn't connect that account — please try again.");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["auth", "identities"] });
    qc.invalidateQueries({ queryKey: ["auth", "passkeys"] });
  };

  const run = (key: string, title: string, fn: (password?: string) => Promise<void>) => async () => {
    setBusy(key);
    await guarded(title, fn);
    setBusy(null);
  };

  const providers = (identities?.providers ?? []).filter((p) => p.enabled || p.connected);
  const passkeysOn = identities?.passkeysEnabled && passkeysSupported();

  return (
    <>
      {providers.length > 0 && (
        <div className="mt-4 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
          <p className="text-sm font-medium text-fg">Connected accounts</p>
          <p className="mt-0.5 text-sm text-fg-muted">Sign in with these accounts as well as your password. Disconnecting never deletes your Noxtill account.</p>
          <ul className="mt-4 divide-y divide-border">
            {providers.map((p) => {
              const Icon = ICONS[p.provider];
              return (
                <li key={p.provider} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Icon />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-fg">{p.label}</p>
                        <Badge tone={p.connected ? "success" : "neutral"}>{p.connected ? "Connected" : "Not connected"}</Badge>
                      </div>
                      {p.connected && (
                        <p className="truncate text-xs text-fg-muted">
                          {[p.email, p.lastUsedAt ? `last used ${fmt(p.lastUsedAt)}` : `connected ${fmt(p.connectedAt)}`].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                  </div>
                  {p.connected ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy !== null}
                      onClick={run(`unlink:${p.provider}`, `Disconnect ${p.label}`, async (pw) => {
                        await unlinkIdentity(p.provider, pw);
                        // Removing a sign-in method signs out every device, this one included (spec §9.3).
                        useAuthStore.getState().clearSession();
                        toast.success(`${p.label} disconnected — every device was signed out. Sign in again.`);
                        window.location.assign("/login");
                      })}
                    >
                      {busy === `unlink:${p.provider}` ? "Disconnecting…" : "Disconnect"}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={busy !== null || !p.enabled}
                      onClick={run(`link:${p.provider}`, `Connect ${p.label}`, async (pw) => {
                        const { url } = await startIdentityLink(p.provider, pw);
                        window.location.assign(url);
                      })}
                    >
                      {busy === `link:${p.provider}` ? "Redirecting…" : "Connect"}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {(passkeysOn || (passkeys?.length ?? 0) > 0) && (
        <div className="mt-4 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <KeyRound className="h-5 w-5 shrink-0 text-fg-faint" aria-hidden />
              <div>
                <p className="text-sm font-medium text-fg">Passkeys</p>
                <p className="mt-0.5 text-sm text-fg-muted">Sign in with Face ID, Touch ID, Windows Hello or a security key. Your fingerprint or face never leaves your device.</p>
              </div>
            </div>
            {passkeysOn && (
              <Button
                size="sm"
                className="shrink-0"
                disabled={busy !== null}
                onClick={run("add-passkey", "Add a passkey", async (pw) => {
                  await addPasskey({ password: pw });
                  toast.success("Passkey added.");
                  refresh();
                })}
              >
                {busy === "add-passkey" ? "Waiting…" : "Add a passkey"}
              </Button>
            )}
          </div>
          {passkeys && passkeys.length > 0 ? (
            <ul className="mt-4 divide-y divide-border">
              {passkeys.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-fg">{k.label}</p>
                      {k.synced && <Badge tone="neutral">Synced</Badge>}
                      {k.disabled && <Badge tone="danger">Disabled — possible copy</Badge>}
                    </div>
                    <p className="text-xs text-fg-muted">
                      Added {fmt(k.createdAt)} · {k.lastUsedAt ? `last used ${fmt(k.lastUsedAt)}` : "not used yet"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="sm" aria-label={`Rename ${k.label}`} disabled={busy !== null} onClick={() => setRenaming(k)}>
                      <Pencil className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${k.label}`}
                      disabled={busy !== null}
                      onClick={run(`remove:${k.id}`, `Remove ${k.label}`, async (pw) => {
                        await removePasskey(k.id, pw);
                        useAuthStore.getState().clearSession();
                        toast.success("Passkey removed — every device was signed out. Sign in again.");
                        window.location.assign("/login");
                      })}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-fg-muted">No passkeys yet.</p>
          )}
        </div>
      )}

      {pending && <PasswordDialog title={pending.title} onClose={clear} onConfirm={pending.run} />}
      {renaming && <RenameDialog passkey={renaming} onClose={() => setRenaming(null)} onDone={refresh} />}
    </>
  );
}

function PasswordDialog({ title, onClose, onConfirm }: { title: string; onClose: () => void; onConfirm: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState("");
  const mutation = useMutation({
    mutationFn: () => onConfirm(password),
    onSuccess: onClose,
    onError: (err) => {
      if (!isPasskeyCancel(err)) toast.error(err instanceof ApiError ? err.message : "Something went wrong — please try again.");
    },
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      description="For your security, confirm your password to change how you sign in. If you signed up with a provider and never set a password, sign out and sign in again instead."
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

function RenameDialog({ passkey, onClose, onDone }: { passkey: PasskeyView; onClose: () => void; onDone: () => void }) {
  const [label, setLabel] = useState(passkey.label);
  const mutation = useMutation({
    mutationFn: () => renamePasskey(passkey.id, label.trim()),
    onSuccess: () => {
      onDone();
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't rename — please try again."),
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title="Rename passkey"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!label.trim() || mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <Input label="Name" value={label} maxLength={64} onChange={(e) => setLabel(e.target.value)} autoFocus />
    </Dialog>
  );
}
