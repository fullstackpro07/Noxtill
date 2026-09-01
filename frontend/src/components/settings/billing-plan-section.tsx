"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, MessageSquare, Sparkles, Download, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { SkeletonRow } from "@/components/shared/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { SettingsSectionHeader } from "./settings-section-header";
import { PLANS } from "@/lib/plans";
import {
  fetchBillingStatus,
  createCheckout,
  fetchBillingInvoices,
  fetchAddOns,
  updateAddOns,
  cancelSubscription,
} from "@/lib/billing-api";
import { requestAccountZip } from "@/lib/exports-api";
import { formatCurrency, formatDate } from "@/lib/format";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { useTranslation } from "@/hooks/use-translation";

function UsageMeter({
  icon: Icon,
  label,
  used,
  total,
  format,
  ofLabel,
}: {
  icon: typeof MessageSquare;
  label: string;
  used: number;
  total: number;
  format: (n: number) => string;
  ofLabel: string;
}) {
  const percent = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-fg">
        <Icon className="h-4 w-4 text-fg-faint" aria-hidden />
        {label}
      </div>
      <p className="mb-2 text-sm text-fg-muted">
        {format(used)} <span className="text-fg-faint">{ofLabel} {format(total)}</span>
      </p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className={cn("h-full rounded-full", percent >= 95 ? "bg-destructive" : percent >= 80 ? "bg-accent" : "bg-primary")}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function BillingPlanSection() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const { data: status } = useQuery({ queryKey: ["billing-status"], queryFn: fetchBillingStatus });
  const currentPlanKey = status?.planKey ?? null;

  const checkoutMutation = useMutation({
    mutationFn: (planKey: string) => createCheckout(planKey),
    onSuccess: ({ url }) => {
      // Real full-page redirect to Stripe Checkout — the actual plan change happens via the
      // webhook once checkout completes, not this redirect itself.
      window.location.href = url;
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't start checkout — please try again.");
    },
  });

  useEffect(() => {
    const checkout = searchParams.get("checkout");
    if (checkout === "success") {
      toast.success("Checkout complete — your plan updates once Stripe confirms the subscription.");
      void queryClient.invalidateQueries({ queryKey: ["billing-status"] });
      router.replace(pathname);
    } else if (checkout === "cancel") {
      toast.info("Checkout cancelled — your plan is unchanged.");
      router.replace(pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per mount to consume the redirect params
  }, []);

  function handleUpgrade(planKey: string) {
    checkoutMutation.mutate(planKey);
  }

  return (
    <div>
      <SettingsSectionHeader
        title={t("settings.section.billing.label")}
        description={t("settings.section.billing.description")}
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <UsageMeter
          icon={MessageSquare}
          label={t("settings.billing.messagesThisMonth")}
          used={status?.msgUsed ?? 0}
          total={status?.msgQuota ?? 0}
          format={(n) => n.toLocaleString()}
          ofLabel={t("settings.billing.usageOf")}
        />
        <UsageMeter
          icon={Sparkles}
          label={t("settings.billing.aiUsageThisMonth")}
          used={status?.aiCostUsedUsd ?? 0}
          total={status?.aiCostCapUsd ?? 0}
          format={(n) => `$${n.toFixed(2)}`}
          ofLabel={t("settings.billing.usageOf")}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((plan) => {
          const isCurrent = plan.key === currentPlanKey;
          return (
            <div
              key={plan.key}
              className={cn(
                "flex flex-col rounded-[var(--radius-noxtill)] border p-5",
                isCurrent ? "border-primary bg-primary/[0.04] shadow-[var(--shadow-sm)]" : "border-border bg-surface",
              )}
            >
              {isCurrent && (
                <Badge tone="primary" className="mb-3 w-fit">
                  {t("settings.billing.currentPlan")}
                </Badge>
              )}
              <p className="font-display text-lg font-bold text-fg">{plan.name}</p>
              <p className="mt-1">
                <span className="font-display text-2xl font-bold text-fg">${plan.price}</span>
                <span className="text-sm text-fg-faint">{t("settings.billing.perMonth")}</span>
              </p>
              <p className="mt-2 text-xs text-fg-faint">
                {plan.msgQuota.toLocaleString()} messages · {plan.userLimit} users
              </p>
              <ul className="mt-4 flex-1 space-y-1.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-1.5 text-xs text-fg-muted">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button
                variant={isCurrent ? "outline" : "primary"}
                size="sm"
                disabled={isCurrent || checkoutMutation.isPending}
                onClick={() => handleUpgrade(plan.key)}
                className="mt-4 w-full"
              >
                {isCurrent
                  ? t("settings.billing.currentPlan")
                  : checkoutMutation.isPending && checkoutMutation.variables === plan.key
                    ? "…"
                    : plan.price === 0
                      ? t("settings.billing.downgrade")
                      : t("settings.billing.upgrade")}
              </Button>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AddOnsCard />
        <InvoicesCard />
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

function InvoicesCard() {
  const { data, isPending } = useQuery({ queryKey: ["billing-invoices"], queryFn: fetchBillingInvoices });

  return (
    <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
      <p className="mb-1 text-sm font-medium text-fg">Invoices</p>
      <p className="mb-3 text-sm text-fg-muted">Your real Stripe billing history.</p>
      {isPending || !data ? (
        <div className="flex flex-col gap-1">
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : data.length === 0 ? (
        <EmptyState icon={FileText} title="No invoices yet" description="Invoices appear here once a subscription payment has been processed." />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {data.map((invoice) => (
            <li key={invoice.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-fg">{invoice.number ?? invoice.id}</p>
                <p className="text-xs text-fg-faint">{formatDate(invoice.createdAt)} · {invoice.status}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="tabular-nums text-fg">{formatCurrency(invoice.amountPaid, invoice.currency.toUpperCase())}</span>
                {invoice.invoicePdf && (
                  <a href={invoice.invoicePdf} target="_blank" rel="noreferrer" className="text-fg-faint hover:text-primary" aria-label="Download invoice PDF">
                    <Download className="h-4 w-4" aria-hidden />
                  </a>
                )}
              </div>
            </li>
          ))}
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
      toast.success("Subscription cancelled.");
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
