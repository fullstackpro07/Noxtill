"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { SettingsSectionHeader } from "./settings-section-header";
import { enableTwoFactor, confirmTwoFactor, disableTwoFactor } from "@/lib/two-factor-api";
import { useSession } from "@/lib/session";
import { useAuthStore } from "@/store/auth-store";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export function SecuritySection() {
  const session = useSession();
  const [enrolling, setEnrolling] = useState(false);
  const [disabling, setDisabling] = useState(false);

  return (
    <div>
      <SettingsSectionHeader title="Security" description="Two-factor authentication for your own login." />

      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {session.user.twoFactorEnabled ? (
              <ShieldCheck className="h-5 w-5 shrink-0 text-whatsapp" aria-hidden />
            ) : (
              <ShieldOff className="h-5 w-5 shrink-0 text-fg-faint" aria-hidden />
            )}
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-fg">Two-factor authentication</p>
                <Badge tone={session.user.twoFactorEnabled ? "success" : "neutral"}>
                  {session.user.twoFactorEnabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
              <p className="mt-0.5 text-sm text-fg-muted">
                {session.user.twoFactorEnabled
                  ? "A WhatsApp code is required each time you log in."
                  : session.user.phone
                    ? "Adds a WhatsApp code check to every login."
                    : "Add a phone number to your account to turn this on."}
              </p>
            </div>
          </div>
          {session.user.twoFactorEnabled ? (
            <Button variant="destructive" size="sm" className="shrink-0" onClick={() => setDisabling(true)}>
              Disable
            </Button>
          ) : (
            <Button size="sm" className="shrink-0" disabled={!session.user.phone} onClick={() => setEnrolling(true)}>
              Enable
            </Button>
          )}
        </div>
      </div>

      {enrolling && <EnrollDialog onClose={() => setEnrolling(false)} />}
      {disabling && <DisableDialog onClose={() => setDisabling(false)} />}
    </div>
  );
}

function EnrollDialog({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);

  const sendMutation = useMutation({
    mutationFn: enableTwoFactor,
    onSuccess: () => {
      setSent(true);
      toast.success("Code sent via WhatsApp.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send a code — please try again."),
  });

  const confirmMutation = useMutation({
    mutationFn: () => confirmTwoFactor(code),
    onSuccess: () => {
      useAuthStore.getState().updateUser({ twoFactorEnabled: true });
      toast.success("Two-factor authentication enabled.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "That code didn't work — please try again."),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Enable two-factor authentication"
      footer={
        sent ? (
          <>
            <Button variant="ghost" onClick={onClose} disabled={confirmMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={() => confirmMutation.mutate()} disabled={code.length !== 6 || confirmMutation.isPending}>
              {confirmMutation.isPending ? "Confirming…" : "Confirm"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={sendMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending}>
              {sendMutation.isPending ? "Sending…" : "Send code"}
            </Button>
          </>
        )
      }
    >
      {sent ? (
        <Input label="6-digit code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} maxLength={6} autoFocus />
      ) : (
        <p className="text-sm text-fg-muted">We&apos;ll send a 6-digit code to your phone over WhatsApp.</p>
      )}
    </Dialog>
  );
}

function DisableDialog({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState("");

  const mutation = useMutation({
    mutationFn: () => disableTwoFactor(password),
    onSuccess: () => {
      useAuthStore.getState().updateUser({ twoFactorEnabled: false });
      toast.success("Two-factor authentication disabled.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't disable 2FA — please try again."),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Disable two-factor authentication"
      description="Confirm your password to turn this off."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => mutation.mutate()} disabled={!password || mutation.isPending}>
            {mutation.isPending ? "Disabling…" : "Disable"}
          </Button>
        </>
      }
    >
      <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
    </Dialog>
  );
}
