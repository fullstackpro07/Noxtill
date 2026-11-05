"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SkeletonRow } from "@/components/shared/skeleton";
import { SettingsSectionHeader } from "./settings-section-header";
import {
  fetchBillingStatus,
  fetchAddOns,
  updateAddOns,
  cancelSubscription,
} from "@/lib/billing-api";
import { requestAccountZip } from "@/lib/exports-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { useTranslation } from "@/hooks/use-translation";
import { VoiceUsageBillingSection } from './voice-usage-billing-section';

export function BillingPlanSection() {
  const { t } = useTranslation();
  const router = useRouter();

  const { data: status } = useQuery({ queryKey: ["billing-status"], queryFn: fetchBillingStatus });
  return (
    <div>
      <SettingsSectionHeader
        title={t("settings.section.billing.label")}
        description={t("settings.section.billing.description")}
      />

      <VoiceUsageBillingSection />

      <div className="mb-6 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <p className="text-sm font-medium text-fg">Plans, cards, invoices and usage have moved</p>
        <p className="mt-1 text-sm text-fg-muted">
          Change your plan, manage the cards that pay for Noxtill and see your invoices in Settings → My plan &amp; usage. Every allowance, AI credit and spending limit is in Usage &amp; Limits.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => router.push("/settings/account/plan")}>
            My plan &amp; usage
          </Button>
          <Button size="sm" variant="outline" onClick={() => router.push("/settings/usage/overview")}>
            Usage &amp; Limits
          </Button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AddOnsCard />
      </div>

      {status?.hasActiveSubscription && <CancelSubscriptionSection />}
    </div>
  );
}

function AddOnsCard() {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: ["billing-add-ons"], queryFn: fetchAddOns });

  const mutation = useMutation({
    mutationFn: (key: string) => {
      const active = data?.active ?? [];
      const next = active.includes(key) ? active.filter((k) => k !== key) : [...active, key];
      return updateAddOns(next);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["billing-add-ons"], updated);
      toast.success("Add-ons updated.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this — please try again."),
  });

  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
      <p className="mb-1 text-sm font-medium text-fg">Add-ons</p>
      <p className="mb-3 text-sm text-fg-muted">Real opt-in flags on your account — not yet a separate line item on your invoice.</p>
      {isPending || !data ? (
        <div className="flex flex-col gap-1">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.catalog.map((entry) => {
            const enabled = data.active.includes(entry.key);
            return (
              <li key={entry.key} className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-border bg-surface-2/40 px-3.5 py-2.5">
                <span className="text-sm text-fg">{entry.label}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  onClick={() => mutation.mutate(entry.key)}
                  disabled={mutation.isPending}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${enabled ? "bg-whatsapp" : "bg-surface-2"}`}
                >
                  <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${enabled ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CancelSubscriptionSection() {
  const [open, setOpen] = useState(false);
  const [exported, setExported] = useState(false);
  const [exporting, setExporting] = useState(false);
  const queryClient = useQueryClient();

  const exportMutation = useMutation({
    mutationFn: requestAccountZip,
    onSuccess: () => {
      setExported(true);
      toast.success("Export queued — we'll notify you when it's ready.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't start the export — please try again."),
    onSettled: () => setExporting(false),
  });

  const cancelMutation = useMutation({
    mutationFn: cancelSubscription,
    onSuccess: () => {
      toast.success("Subscription cancelled. You keep full access until the end of this billing period.");
      void queryClient.invalidateQueries({ queryKey: ["billing-status"] });
      setOpen(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't cancel your subscription — please try again."),
  });

  return (
    <div className="mt-6 rounded-[var(--radius-noxtill)] border border-destructive/25 bg-destructive/[0.03] p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-fg">Cancel subscription</p>
          <p className="mt-0.5 text-sm text-fg-muted">Your plan reverts once the current billing period ends.</p>
        </div>
        <Button variant="destructive" onClick={() => setOpen(true)} className="shrink-0">
          Cancel subscription
        </Button>
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Cancel your subscription?"
        description="Before you go, you can export a full copy of your account data."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={cancelMutation.isPending}>
              Keep subscription
            </Button>
            <Button variant="destructive" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
              {cancelMutation.isPending ? "Cancelling…" : "Cancel subscription"}
            </Button>
          </>
        }
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setExporting(true);
            exportMutation.mutate();
          }}
          disabled={exporting || exported}
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          {exported ? "Export queued" : exporting ? "Requesting…" : "Export my account data"}
        </Button>
      </Dialog>
    </div>
  );
}
