"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Plug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { SocialConnectDialog } from "@/components/social/social-connect-dialog";
import {
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_LABELS,
  disconnectSocialAccount,
  fetchSocialAccounts,
  type SocialPlatform,
  type SocialAccountRow,
} from "@/lib/social-accounts-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const STATUS_TONE = {
  not_connected: "neutral",
  connected: "success",
  needs_attention: "danger",
} as const;

const STATUS_LABEL = {
  not_connected: "Not connected",
  connected: "Connected",
  needs_attention: "Needs attention",
} as const;

export function SocialAccountsView() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [target, setTarget] = useState<SocialPlatform | null>(null);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["social-accounts"],
    queryFn: fetchSocialAccounts,
  });

  // The backend's OAuth callback redirects the browser straight back here with
  // ?connected=<platform> or ?error=<platform> — this IS the callback landing.
  useEffect(() => {
    const connectedKey = searchParams.get("connected") as SocialPlatform | null;
    const errorKey = searchParams.get("error") as SocialPlatform | null;
    if (connectedKey) {
      toast.success(`Connected ${SOCIAL_PLATFORM_LABELS[connectedKey] ?? connectedKey}.`);
      void queryClient.invalidateQueries({ queryKey: ["social-accounts"] });
      router.replace(pathname);
    } else if (errorKey) {
      toast.error(`Couldn't connect ${SOCIAL_PLATFORM_LABELS[errorKey] ?? errorKey} — please try again.`);
      void queryClient.invalidateQueries({ queryKey: ["social-accounts"] });
      router.replace(pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per mount to consume the redirect params
  }, []);

  const rows: SocialAccountRow[] = SOCIAL_PLATFORMS.map((platform) => {
    const row = data?.find((r) => r.platform === platform);
    return row ?? { platform, status: "not_connected", externalAccountName: null, updatedAt: null };
  });
  const connectedCount = rows.filter((r) => r.status === "connected").length;

  const disconnectMutation = useMutation({
    mutationFn: disconnectSocialAccount,
    onSuccess: (_data, platform) => {
      toast.success(`Disconnected ${SOCIAL_PLATFORM_LABELS[platform]}.`);
      void queryClient.invalidateQueries({ queryKey: ["social-accounts"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't disconnect — please try again."),
  });

  function handleConnected(platform: SocialPlatform) {
    void queryClient.invalidateQueries({ queryKey: ["social-accounts"] });
    toast.success(`Connected ${SOCIAL_PLATFORM_LABELS[platform]}.`);
  }

  const targetRow = rows.find((r) => r.platform === target);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-fg">Connected Accounts</h1>
          <p className="mt-0.5 text-sm text-fg-muted">
            {connectedCount} of {rows.length} platforms connected.
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" aria-hidden />
          Refresh
        </Button>
      </div>

      {isError ? (
        <ErrorBanner title="Couldn't load your connected accounts" onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
              <SkeletonRow />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <div key={row.platform} className="flex flex-col gap-3 rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-fg">{SOCIAL_PLATFORM_LABELS[row.platform]}</p>
                  <p className="mt-0.5 truncate text-xs text-fg-muted">
                    {row.externalAccountName ?? "No account linked yet"}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
              </div>
              <div className="mt-auto flex gap-2">
                {row.status === "not_connected" && (
                  <Button size="sm" className="flex-1" onClick={() => setTarget(row.platform)}>
                    <Plug className="h-3.5 w-3.5" aria-hidden />
                    Connect
                  </Button>
                )}
                {row.status === "needs_attention" && (
                  <Button size="sm" variant="destructive" className="flex-1" onClick={() => setTarget(row.platform)}>
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                    Reconnect
                  </Button>
                )}
                {row.status === "connected" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => disconnectMutation.mutate(row.platform)}
                    disabled={disconnectMutation.isPending}
                  >
                    Disconnect
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <SocialConnectDialog
        platform={target}
        status={targetRow?.status}
        onClose={() => setTarget(null)}
        onConnected={handleConnected}
      />
    </div>
  );
}
