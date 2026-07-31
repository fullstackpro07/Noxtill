"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";
import type { Connector } from "@/lib/integrations";

export function OAuthConnectDialog({
  connector,
  onClose,
  onConnected,
  reconnect,
}: {
  connector: Connector | null;
  onClose: () => void;
  onConnected: (key: Connector["key"]) => void;
  reconnect?: boolean;
}) {
  if (!connector) return null;
  return <OAuthConnectDialogBody key={connector.key} connector={connector} onClose={onClose} onConnected={onConnected} reconnect={reconnect} />;
}

function OAuthConnectDialogBody({
  connector,
  onClose,
  onConnected,
  reconnect,
}: {
  connector: Connector;
  onClose: () => void;
  onConnected: (key: Connector["key"]) => void;
  reconnect?: boolean;
}) {
  const [authorizing, setAuthorizing] = useState(false);

  async function handleAuthorize() {
    setAuthorizing(true);
    await new Promise((r) => setTimeout(r, 1000));
    setAuthorizing(false);
    onConnected(connector.key);
    onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={reconnect ? `Reconnect ${connector.name}` : `Connect ${connector.name}`}
      description={
        reconnect
          ? "Your access token expired. Reauthorize to keep this connector running."
          : `You'll be redirected to ${connector.name} to grant Noxtill permission to manage your account.`
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={authorizing}>
            Cancel
          </Button>
          <Button onClick={handleAuthorize} disabled={authorizing}>
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
        Noxtill never stores your password — access is revocable at any time from {connector.name}&apos;s own security settings.
      </p>
    </Dialog>
  );
}
