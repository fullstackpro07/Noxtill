"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ShieldOff, Plus, FileDown, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { EmptyState } from "@/components/shared/empty-state";
import { SettingsSectionHeader } from "./settings-section-header";
import { requestAccountZip } from "@/lib/exports-api";
import { fetchAuditLog } from "@/lib/audit-log-api";
import { searchCustomers, type CustomerSearchResult } from "@/lib/customers-api";
import {
  fetchDsrRequests,
  createDsrRequest,
  markDsrInProgress,
  fulfillDsrRequest,
  rejectDsrRequest,
  type DsrRequest,
  type DsrKind,
} from "@/lib/gdpr-api";
import { formatDate } from "@/lib/format";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { useTranslation } from "@/hooks/use-translation";

const STATUS_TONE: Record<DsrRequest["status"], "neutral" | "warning" | "success" | "danger"> = {
  pending: "neutral",
  in_progress: "warning",
  fulfilled: "success",
  rejected: "danger",
};

export function DataPrivacySection() {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);
  const [newRequestOpen, setNewRequestOpen] = useState(false);

  const exportMutation = useMutation({
    mutationFn: requestAccountZip,
    onSuccess: () => toast.success("Export queued — we'll notify you when it's ready."),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't start the export — please try again."),
    onSettled: () => setExporting(false),
  });

  return (
    <div>
      <SettingsSectionHeader
        title={t("settings.section.privacy.label")}
        description={t("settings.section.privacy.description")}
      />

      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
          <div>
            <p className="text-sm font-medium text-fg">{t("settings.privacy.exportEverything")}</p>
            <p className="mt-0.5 text-sm text-fg-muted">{t("settings.privacy.exportDescription")}</p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setExporting(true);
              exportMutation.mutate();
            }}
            disabled={exporting}
            className="shrink-0"
          >
            <Download className="h-4 w-4" aria-hidden />
            {exporting ? t("settings.privacy.preparing") : t("settings.privacy.exportAccount")}
          </Button>
        </div>

        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-fg">Data subject requests</p>
              <p className="mt-0.5 text-sm text-fg-muted">Export and erasure requests from customers, tracked against a 30-day legal window.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setNewRequestOpen(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New request
            </Button>
          </div>
          <DsrQueue />
        </div>

        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
          <p className="mb-3 text-sm font-medium text-fg">{t("settings.privacy.erasureLog")}</p>
          <ErasureLog />
        </div>
      </div>

      {newRequestOpen && <NewDsrRequestDialog onClose={() => setNewRequestOpen(false)} />}
    </div>
  );
}

function DsrQueue() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["dsr-requests"],
    queryFn: () => fetchDsrRequests(),
  });
  const queryClient = useQueryClient();

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["dsr-requests"] });
  }

  const markInProgress = useMutation({
    mutationFn: markDsrInProgress,
    onSuccess: invalidate,
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this request."),
  });

  if (isError) {
    return <ErrorBanner title="Couldn't load data subject requests" onRetry={() => refetch()} />;
  }
  if (isPending || !data) {
    return (
      <div className="flex flex-col gap-1">
        <SkeletonRow />
        <SkeletonRow />
      </div>
    );
  }
  if (data.length === 0) {
    return <EmptyState icon={UserX} title="No requests yet" description="Export and erasure requests appear here as customers ask for them." />;
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {data.map((request) => (
        <li key={request.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium text-fg">{request.customer.name}</p>
              <Badge tone={request.kind === "erasure" ? "danger" : "primary"}>{request.kind}</Badge>
              <Badge tone={STATUS_TONE[request.status]}>{request.status.replace("_", " ")}</Badge>
              {request.urgent && <Badge tone="danger">Urgent — {request.daysRemaining}d left</Badge>}
            </div>
            <p className="mt-0.5 text-xs text-fg-faint">Requested {formatDate(request.createdAt)}{!request.urgent && request.status !== "fulfilled" && request.status !== "rejected" ? ` · ${request.daysRemaining}d remaining` : ""}</p>
          </div>
          {(request.status === "pending" || request.status === "in_progress") && (
            <div className="flex shrink-0 items-center gap-2">
              {request.status === "pending" && (
                <Button variant="ghost" size="sm" onClick={() => markInProgress.mutate(request.id)} disabled={markInProgress.isPending}>
                  Start
                </Button>
              )}
              <FulfillOrRejectButtons request={request} onDone={invalidate} />
            </div>
          )}
          {request.status === "fulfilled" && request.resultUrl && (
            <a href={request.resultUrl} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-primary hover:underline">
              <FileDown className="h-3.5 w-3.5" aria-hidden />
              Download
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

function FulfillOrRejectButtons({ request, onDone }: { request: DsrRequest; onDone: () => void }) {
  const [confirmPhone, setConfirmPhone] = useState("");
  const [confirming, setConfirming] = useState(false);

  const fulfillMutation = useMutation({
    mutationFn: () => fulfillDsrRequest(request.id, request.kind === "erasure" ? confirmPhone : undefined),
    onSuccess: () => {
      toast.success(request.kind === "erasure" ? "Customer erased." : "Export ready — link sent.");
      setConfirming(false);
      onDone();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't fulfill this request."),
  });

  const rejectMutation = useMutation({
    mutationFn: () => rejectDsrRequest(request.id),
    onSuccess: () => {
      toast.success("Request rejected.");
      onDone();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't reject this request."),
  });

  if (request.kind === "erasure" && confirming) {
    return (
      <div className="flex items-center gap-1.5">
        <Input value={confirmPhone} onChange={(e) => setConfirmPhone(e.target.value)} placeholder="Confirm phone" className="h-8 w-36 text-xs" />
        <Button size="sm" variant="destructive" onClick={() => fulfillMutation.mutate()} disabled={!confirmPhone || fulfillMutation.isPending}>
          Confirm
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => (request.kind === "erasure" ? setConfirming(true) : fulfillMutation.mutate())}
        disabled={fulfillMutation.isPending}
      >
        Fulfill
      </Button>
      <Button size="sm" variant="ghost" onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending}>
        Reject
      </Button>
    </>
  );
}

function NewDsrRequestDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CustomerSearchResult | null>(null);
  const [kind, setKind] = useState<DsrKind>("export");
  const queryClient = useQueryClient();

  const { data: results } = useQuery({
    queryKey: ["customer-search", query],
    queryFn: () => searchCustomers(query),
    enabled: query.trim().length > 1,
  });

  const mutation = useMutation({
    mutationFn: () => createDsrRequest({ customerId: selected!.id, kind }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dsr-requests"] });
      toast.success("Request logged.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't create this request."),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="New data subject request"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!selected || mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Create"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Button size="sm" variant={kind === "export" ? "primary" : "outline"} onClick={() => setKind("export")}>
            Export
          </Button>
          <Button size="sm" variant={kind === "erasure" ? "primary" : "outline"} onClick={() => setKind("erasure")}>
            Erasure
          </Button>
        </div>
        <Input
          label="Find the customer by name or phone"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
          placeholder="Search…"
          autoFocus
        />
        {results && results.length > 0 && !selected && (
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-[var(--radius-sm)] border border-border">
            {results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelected(c)}
                className="flex flex-col items-start px-3 py-2 text-start text-sm hover:bg-surface-2"
              >
                <span className="text-fg">{c.name}</span>
                <span className="text-xs text-fg-faint">{c.phone}</span>
              </button>
            ))}
          </div>
        )}
        {selected && (
          <div className="flex items-center justify-between rounded-[var(--radius-sm)] bg-primary/8 px-3.5 py-2.5 text-sm">
            <div>
              <p className="font-medium text-fg">{selected.name}</p>
              <p className="text-xs text-fg-faint">{selected.phone}</p>
            </div>
            <button onClick={() => setSelected(null)} className="text-xs text-fg-muted hover:text-fg">
              Change
            </button>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function ErasureLog() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["audit-log", "customer.erase"],
    queryFn: () => fetchAuditLog({ action: 'customer.erase' }),
  });

  if (isError) {
    return <ErrorBanner title="Couldn't load the erasure log" onRetry={() => refetch()} />;
  }
  if (isPending || !data) {
    return (
      <div className="flex flex-col gap-1">
        <SkeletonRow />
      </div>
    );
  }
  if (data.rows.length === 0) {
    return <p className="text-sm text-fg-faint">No customer data has been erased.</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {data.rows.map((entry) => {
        const before = entry.before as { name?: string } | null;
        return (
          <li key={entry.id} className="flex items-center gap-3 py-2.5 text-sm">
            <ShieldOff className="h-4 w-4 shrink-0 text-fg-faint" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-fg">{before?.name ?? entry.entityId}</span>
            <span className="shrink-0 text-xs text-fg-faint">
              Erased by {entry.actorName ?? "System"} · {formatDate(entry.createdAt)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
