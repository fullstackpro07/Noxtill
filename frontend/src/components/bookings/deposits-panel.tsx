"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Settings2, Check, Undo2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-states";
import { SkeletonRow } from "@/components/shared/skeleton";
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import {
  fetchDeposits,
  captureDeposit,
  refundDeposit,
  fetchDepositSettings,
  updateDepositSettings,
  type Deposit,
  type DepositAmountType,
} from "@/lib/deposits-api";
import { fetchProducts } from "@/lib/products-api";

const STATUS_TONE: Record<Deposit["status"], "primary" | "success" | "neutral" | "danger" | "warning"> = {
  pending: "warning",
  captured: "success",
  refunded: "neutral",
  forfeited: "danger",
};

export function DepositsPanel({ currency }: { currency: string }) {
  const queryClient = useQueryClient();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { data: deposits, isPending, isError, refetch } = useQuery({ queryKey: ["deposits"], queryFn: () => fetchDeposits() });

  const captureMutation = useMutation({
    mutationFn: (id: string) => captureDeposit(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deposits"] });
      toast.success("Deposit captured.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't capture this deposit."),
  });
  const refundMutation = useMutation({
    mutationFn: (id: string) => refundDeposit(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deposits"] });
      toast.success("Deposit refunded.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't refund this deposit."),
  });

  const pendingCount = (deposits ?? []).filter((d) => d.status === "pending").length;
  const capturedTotal = (deposits ?? []).filter((d) => d.status === "captured").reduce((sum, d) => sum + Number(d.amount), 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-fg-muted">Pending capture</p>
            <p className="font-display text-xl font-bold text-fg">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-fg-muted">Captured total</p>
            <p className="font-display text-xl font-bold text-fg">{formatCurrency(capturedTotal, currency)}</p>
          </CardContent>
        </Card>
        <Card className="flex items-center">
          <CardContent className="flex w-full items-center justify-between p-4">
            <p className="text-xs text-fg-muted">Deposit rule</p>
            <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="h-3.5 w-3.5" aria-hidden />
              Settings
            </Button>
          </CardContent>
        </Card>
      </div>

      {isError && <ErrorBanner title="Couldn't load deposits" onRetry={() => refetch()} />}
      {isPending && (
        <Card>
          <CardContent className="flex flex-col gap-1 p-4">
            <SkeletonRow />
            <SkeletonRow />
          </CardContent>
        </Card>
      )}
      {deposits && deposits.length === 0 && (
        <Card>
          <CardContent>
            <EmptyState icon={CreditCard} title="No deposits yet" description="Deposits collected against appointments show up here." />
          </CardContent>
        </Card>
      )}
      {deposits && deposits.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {deposits.map((d) => (
            <Card key={d.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium tabular-nums text-fg">{formatCurrency(Number(d.amount), currency)}</p>
                    <Badge tone={STATUS_TONE[d.status]}>{d.status}</Badge>
                  </div>
                  <p className="truncate text-xs text-fg-muted">
                    {d.method} · {formatDate(d.createdAt)}
                  </p>
                </div>
                {d.status === "pending" && d.method === "cash" && (
                  <Button size="sm" onClick={() => captureMutation.mutate(d.id)} disabled={captureMutation.isPending}>
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    Capture
                  </Button>
                )}
                {d.status === "captured" && (
                  <Button variant="outline" size="sm" onClick={() => refundMutation.mutate(d.id)} disabled={refundMutation.isPending}>
                    <Undo2 className="h-3.5 w-3.5" aria-hidden />
                    Refund
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <DepositSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

function DepositSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: settings, isPending } = useQuery({ queryKey: ["deposit-settings"], queryFn: fetchDepositSettings, enabled: open });
  const { data: services } = useQuery({ queryKey: ["products", "services-for-deposit"], queryFn: () => fetchProducts({ kind: "service" }), enabled: open });

  if (!open) return null;
  if (isPending || !settings) {
    return (
      <Dialog open onClose={onClose} title="Deposit settings">
        <SkeletonRow />
      </Dialog>
    );
  }
  return <DepositSettingsForm settings={settings} services={services ?? []} onClose={onClose} />;
}

function DepositSettingsForm({
  settings,
  services,
  onClose,
}: {
  settings: { required: boolean; triggerAfterNoShows: number | null; amountType: DepositAmountType; amountValue: number | string; applicableServiceIds: string[] };
  services: { id: string; name: string }[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [required, setRequired] = useState(settings.required);
  const [triggerAfterNoShows, setTriggerAfterNoShows] = useState<string>(settings.triggerAfterNoShows != null ? String(settings.triggerAfterNoShows) : "");
  const [amountType, setAmountType] = useState<DepositAmountType>(settings.amountType);
  const [amountValue, setAmountValue] = useState(Number(settings.amountValue));
  const [applicableServiceIds, setApplicableServiceIds] = useState<string[]>(settings.applicableServiceIds);

  const mutation = useMutation({
    mutationFn: () =>
      updateDepositSettings({
        required,
        triggerAfterNoShows: triggerAfterNoShows ? Number(triggerAfterNoShows) : null,
        amountType,
        amountValue,
        applicableServiceIds,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deposit-settings"] });
      toast.success("Deposit settings saved.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save deposit settings."),
  });

  function toggleService(id: string) {
    setApplicableServiceIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Deposit settings"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <label className="flex items-center gap-2 text-sm font-medium text-fg">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          Require a deposit to book
        </label>

        {required && (
          <>
            <Input
              label="Required after this many no-shows (blank = always required)"
              type="number"
              min={1}
              value={triggerAfterNoShows}
              onChange={(e) => setTriggerAfterNoShows(e.target.value)}
            />
            <div className="flex gap-2.5">
              <Select label="Amount type" value={amountType} onChange={(e) => setAmountType(e.target.value as DepositAmountType)} className="flex-1">
                <option value="flat">Flat amount</option>
                <option value="percent">Percent of total</option>
              </Select>
              <Input
                label={amountType === "percent" ? "Percent" : "Amount"}
                type="number"
                min={0}
                step="0.01"
                value={amountValue}
                onChange={(e) => setAmountValue(Number(e.target.value))}
                className="flex-1"
              />
            </div>
            <div>
              <p className="mb-1.5 text-sm font-medium text-fg">Applies to (blank = every service)</p>
              <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
                {(services ?? []).map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm text-fg">
                    <input type="checkbox" checked={applicableServiceIds.includes(s.id)} onChange={() => toggleService(s.id)} />
                    {s.name}
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
