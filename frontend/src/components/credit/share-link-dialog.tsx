"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Ban, Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SkeletonRow } from "@/components/shared/skeleton";
import { fetchShareLinks, createShareLink, revokeShareLink } from "@/lib/credit-api";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";

export function ShareLinkDialog({ customerId, customerName, onClose }: { customerId: string; customerName: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: links, isPending } = useQuery({ queryKey: ["credit-share-links", customerId], queryFn: () => fetchShareLinks(customerId) });

  const createMutation = useMutation({
    mutationFn: () => createShareLink(customerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit-share-links", customerId] });
      toast.success("Transparent link created.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't create this link."),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeShareLink(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["credit-share-links", customerId] });
      toast.success("Link revoked.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't revoke this link."),
  });

  const active = links?.find((l) => !l.revoked);

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Transparent ledger link — ${customerName}`}
      description="Lets this customer check their own balance without logging in."
      footer={
        !active && (
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {createMutation.isPending ? "Creating…" : "Create link"}
          </Button>
        )
      }
    >
      {isPending ? (
        <SkeletonRow />
      ) : active ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-surface-2 px-3.5 py-2.5 text-sm">
            <span className="min-w-0 flex-1 truncate text-fg">{`${window.location.origin}/r/${active.token}`}</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/r/${active.token}`).catch(() => undefined);
                toast.success("Link copied.");
              }}
              aria-label="Copy link"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-fg-faint hover:bg-surface hover:text-fg"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          <Button variant="destructive" size="sm" onClick={() => revokeMutation.mutate(active.id)} disabled={revokeMutation.isPending}>
            <Ban className="h-3.5 w-3.5" aria-hidden />
            Revoke link
          </Button>
        </div>
      ) : (
        <p className="text-sm text-fg-muted">No active link yet.</p>
      )}

      {links && links.filter((l) => l.revoked).length > 0 && (
        <div className="mt-4 flex flex-col gap-1.5 border-t border-border pt-3">
          <p className="text-xs font-medium text-fg-muted">Revoked</p>
          {links
            .filter((l) => l.revoked)
            .map((l) => (
              <div key={l.id} className="flex items-center justify-between text-xs text-fg-faint">
                <span>{formatDate(l.createdAt)}</span>
                <Badge tone="neutral">Revoked</Badge>
              </div>
            ))}
        </div>
      )}
    </Dialog>
  );
}
