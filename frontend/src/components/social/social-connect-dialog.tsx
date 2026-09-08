"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ShieldCheck, KeyRound } from "lucide-react";
import {
  SOCIAL_PLATFORM_LABELS,
  TOKEN_BASED_PLATFORMS,
  connectSocialAccount,
  connectSocialAccountWithToken,
  type SocialPlatform,
  type SocialAccountStatus,
} from "@/lib/social-accounts-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export function SocialConnectDialog({
  platform,
  status,
  onClose,
  onConnected,
}: {
  platform: SocialPlatform | null;
  status?: SocialAccountStatus;
  onClose: () => void;
  onConnected: (platform: SocialPlatform) => void;
}) {
  if (!platform) return null;
  return (
    <SocialConnectDialogBody
      key={platform}
      platform={platform}
      status={status}
      onClose={onClose}
      onConnected={onConnected}
    />
  );
}

function SocialConnectDialogBody({
  platform,
  status,
  onClose,
  onConnected,
}: {
  platform: SocialPlatform;
  status?: SocialAccountStatus;
  onClose: () => void;
  onConnected: (platform: SocialPlatform) => void;
}) {
  const name = SOCIAL_PLATFORM_LABELS[platform];
  const reconnect = status === "needs_attention";
  const isTokenBased = TOKEN_BASED_PLATFORMS.includes(platform);
  const [authorizing, setAuthorizing] = useState(false);
  const [token, setToken] = useState("");

  async function handleOAuthAuthorize() {
    setAuthorizing(true);
    try {
      const result = await connectSocialAccount(platform);
      if (result.authUrl) {
        window.location.href = result.authUrl;
        return;
      }
      onConnected(platform);
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Couldn't connect ${name} — please try again.`);
    } finally {
      setAuthorizing(false);
    }
  }

  async function handleTokenSubmit() {
    if (!token.trim()) return;
    setAuthorizing(true);
    try {
      await connectSocialAccountWithToken(platform, token.trim());
      onConnected(platform);
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Couldn't verify this ${name} credential.`);
    } finally {
      setAuthorizing(false);
    }
  }

  if (isTokenBased) {
    return (
      <Dialog
        open
        onClose={onClose}
        title={reconnect ? `Reconnect ${name}` : `Connect ${name}`}
        description={`${name} doesn't support browser sign-in — paste the bot/API token from your ${name} developer settings.`}
        footer={
          <>
            <Button variant="ghost" onClick={onClose} disabled={authorizing}>
              Cancel
            </Button>
            <Button onClick={handleTokenSubmit} disabled={authorizing || !token.trim()}>
              {authorizing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Verifying…
                </>
              ) : (
                <>
                  <KeyRound className="h-4 w-4" aria-hidden />
                  {reconnect ? "Reconnect" : "Connect"}
                </>
              )}
            </Button>
          </>
        }
      >
        <Input
          label={`${name} token`}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste token"
          autoFocus
        />
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={reconnect ? `Reconnect ${name}` : `Connect ${name}`}
      description={
        reconnect
          ? "Your access token expired. Reauthorize to keep this account posting."
          : `You'll be redirected to ${name} to grant Noxtill permission to post and read insights.`
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={authorizing}>
            Cancel
          </Button>
          <Button onClick={handleOAuthAuthorize} disabled={authorizing}>
            {authorizing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Authorizing…
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" aria-hidden />
                {reconnect ? "Reconnect" : "Continue"}
              </>
            )}
          </Button>
        </>
      }
    >
      <p className="text-xs text-fg-faint">
        Noxtill never stores your password — access is revocable at any time from {name}&apos;s own security settings.
      </p>
    </Dialog>
  );
}
