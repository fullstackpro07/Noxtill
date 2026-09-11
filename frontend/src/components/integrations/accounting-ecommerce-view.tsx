"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calculator, Plus, Trash2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { EmptyState } from "@/components/shared/empty-state";
import {
  fetchAccountingMappings,
  upsertAccountingMapping,
  removeAccountingMapping,
  runAccountingSync,
  runEcommerceSync,
  fetchEcommerceConflicts,
  ACCOUNTING_PROVIDERS,
  PROVIDER_LABELS,
  type AccountingProvider,
  type AccountingSyncResult,
  type EcommerceSyncResult,
} from "@/lib/accounting-ecommerce-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { formatDate, formatTime } from "@/lib/format";

export function AccountingEcommerceView() {
  const [addMappingOpen, setAddMappingOpen] = useState(false);
  const [lastAccountingResult, setLastAccountingResult] = useState<AccountingSyncResult | null>(null);
  const [lastEcommerceResult, setLastEcommerceResult] = useState<EcommerceSyncResult[] | null>(null);
  const queryClient = useQueryClient();

  const { data: mappings, isPending, isError, refetch } = useQuery({ queryKey: ["accounting-mappings"], queryFn: () => fetchAccountingMappings() });
  const { data: conflicts } = useQuery({ queryKey: ["ecommerce-conflicts"], queryFn: () => fetchEcommerceConflicts() });

  const removeMutation = useMutation({
    mutationFn: removeAccountingMapping,
    onSuccess: () => {
      toast.success("Mapping removed.");
      void queryClient.invalidateQueries({ queryKey: ["accounting-mappings"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't remove this mapping."),
  });

  const accountingSyncMutation = useMutation({
    mutationFn: runAccountingSync,
    onSuccess: (result) => {
      setLastAccountingResult(result);
      toast.success(`Pushed ${result.pushed} invoice(s)${result.failed ? `, ${result.failed} failed` : ""}.`);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't sync accounting."),
  });

  const ecommerceSyncMutation = useMutation({
    mutationFn: runEcommerceSync,
    onSuccess: (results) => {
      setLastEcommerceResult(results);
      const imported = results.reduce((sum, r) => sum + r.ordersImported, 0);
      toast.success(`Reconciled stock, imported ${imported} order(s).`);
      void queryClient.invalidateQueries({ queryKey: ["ecommerce-conflicts"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't sync e-commerce."),
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold text-fg">Accounting &amp; E-commerce Sync</h1>
        <p className="mt-0.5 text-sm text-fg-muted">Real invoice push to QuickBooks/Xero, and real two-way stock + order sync with Shopify/WooCommerce.</p>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-fg">Accounting</p>
            <Button size="sm" variant="outline" onClick={() => accountingSyncMutation.mutate()} disabled={accountingSyncMutation.isPending}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              {accountingSyncMutation.isPending ? "Syncing…" : "Sync now"}
            </Button>
          </div>
          {lastAccountingResult && (
            <div className="mt-2 text-xs text-fg-muted">
              <p>
                Last run: <Badge tone="success">{lastAccountingResult.pushed} pushed</Badge>{" "}
                {lastAccountingResult.failed > 0 && <Badge tone="danger">{lastAccountingResult.failed} failed</Badge>}
              </p>
              {lastAccountingResult.results.filter((r) => r.status === "failed").map((r) => (
                <p key={r.orderId} className="mt-1 text-destructive">
                  Order #{r.orderNo}: {r.message}
                </p>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-fg">E-commerce</p>
            <Button size="sm" variant="outline" onClick={() => ecommerceSyncMutation.mutate()} disabled={ecommerceSyncMutation.isPending}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              {ecommerceSyncMutation.isPending ? "Syncing…" : "Sync now"}
            </Button>
          </div>
          {lastEcommerceResult && (
            <div className="mt-2 flex flex-col gap-2 text-xs text-fg-muted">
              {lastEcommerceResult.map((r) => (
                <div key={r.provider}>
                  <p>
                    {PROVIDER_LABELS[r.provider]}: {r.productsReconciled} product(s) reconciled, {r.ordersImported} order(s) imported
                  </p>
                  {r.conflicts.map((c) => (
                    <p key={c.sku} className="ml-2">
                      {c.sku}: {c.winner === "remote" ? "remote" : "local"} wins ({c.winner === "remote" ? c.remoteQty : c.localQty}) — automatically resolved by most-recently-updated
                    </p>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {conflicts && conflicts.length > 0 && (
        <div className="mb-8">
          <p className="mb-1 text-sm font-medium text-fg">Conflict history</p>
          <p className="mb-2 text-xs text-fg-faint">Every real stock conflict across all e-commerce providers, resolved automatically (most-recently-updated side wins) and kept as a browsable log.</p>
          <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-fg-faint">
                  <th className="px-4 py-2 font-medium">Provider</th>
                  <th className="px-4 py-2 font-medium">SKU</th>
                  <th className="px-4 py-2 font-medium">Winner</th>
                  <th className="px-4 py-2 font-medium">Local qty</th>
                  <th className="px-4 py-2 font-medium">Remote qty</th>
                  <th className="px-4 py-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {conflicts.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-fg-muted">{PROVIDER_LABELS[c.provider]}</td>
                    <td className="px-4 py-2 font-medium text-fg">{c.sku}</td>
                    <td className="px-4 py-2">
                      <Badge tone={c.winner === "remote" ? "primary" : "neutral"}>{c.winner}</Badge>
                    </td>
                    <td className="px-4 py-2 text-fg-muted">{c.localQty}</td>
                    <td className="px-4 py-2 text-fg-muted">{c.remoteQty}</td>
                    <td className="px-4 py-2 text-xs text-fg-faint">{formatDate(c.createdAt)} · {formatTime(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-fg">Account/tax-code mapping</p>
        <Button size="sm" onClick={() => setAddMappingOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          New mapping
        </Button>
      </div>
      {isError ? (
        <ErrorBanner title="Couldn't load mappings" onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <SkeletonRow />
        </div>
      ) : !mappings || mappings.length === 0 ? (
        <EmptyState icon={Calculator} title="No mappings yet" description="Every order needs a mapping (or a default) before it can be pushed as an invoice." action={{ label: "New mapping", onClick: () => setAddMappingOpen(true) }} />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-fg-faint">
                <th className="px-4 py-2 font-medium">Provider</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 font-medium">Account code</th>
                <th className="px-4 py-2 font-medium">Tax code</th>
                <th className="w-8 px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {mappings.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium text-fg">{PROVIDER_LABELS[m.provider]}</td>
                  <td className="px-4 py-2 text-fg-muted">{m.productCategory ?? <span className="italic">Default</span>}</td>
                  <td className="px-4 py-2 text-fg-muted">{m.externalAccountCode}</td>
                  <td className="px-4 py-2 text-fg-muted">{m.externalTaxCode ?? "—"}</td>
                  <td className="px-4 py-2">
                    <Button variant="ghost" size="icon" onClick={() => removeMutation.mutate(m.id)} disabled={removeMutation.isPending} aria-label="Remove">
                      <Trash2 className="h-3.5 w-3.5 text-fg-faint" aria-hidden />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddMappingDialog open={addMappingOpen} onClose={() => setAddMappingOpen(false)} />
    </div>
  );
}

function AddMappingDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState<AccountingProvider>("quickbooks");
  const [productCategory, setProductCategory] = useState("");
  const [externalAccountCode, setExternalAccountCode] = useState("");
  const [externalTaxCode, setExternalTaxCode] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      upsertAccountingMapping({
        provider,
        productCategory: productCategory.trim() || undefined,
        externalAccountCode,
        externalTaxCode: externalTaxCode.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success("Mapping saved.");
      void queryClient.invalidateQueries({ queryKey: ["accounting-mappings"] });
      handleClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this mapping."),
  });

  function handleClose() {
    setProvider("quickbooks");
    setProductCategory("");
    setExternalAccountCode("");
    setExternalTaxCode("");
    onClose();
  }

  if (!open) return null;

  return (
    <Dialog
      open
      onClose={handleClose}
      title="New mapping"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!externalAccountCode.trim() || mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Select label="Provider" value={provider} onChange={(e) => setProvider(e.target.value as AccountingProvider)}>
          {ACCOUNTING_PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {PROVIDER_LABELS[p]}
            </option>
          ))}
        </Select>
        <Input label="Product category (optional — leave blank for the default mapping)" value={productCategory} onChange={(e) => setProductCategory(e.target.value)} />
        <Input label="External account code" value={externalAccountCode} onChange={(e) => setExternalAccountCode(e.target.value)} autoFocus />
        <Input label="External tax code (optional)" value={externalTaxCode} onChange={(e) => setExternalTaxCode(e.target.value)} />
      </div>
    </Dialog>
  );
}
