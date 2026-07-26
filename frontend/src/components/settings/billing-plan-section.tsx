"use client";

import { Check, MessageSquare, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SettingsSectionHeader } from "./settings-section-header";
import { PLANS } from "@/lib/plans";
import { toast } from "@/lib/toast";
import { useTranslation } from "@/hooks/use-translation";

const CURRENT_PLAN_KEY = "starter";
const MOCK_USAGE = {
  messagesUsed: 640,
  aiCostUsedUsd: 2.85,
  aiCostCapUsd: 5,
};

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
  const currentPlan = PLANS.find((p) => p.key === CURRENT_PLAN_KEY)!;

  function handleUpgrade(planName: string) {
    toast.info(`Checkout for ${planName} wires up in INT-014.`);
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
          used={MOCK_USAGE.messagesUsed}
          total={currentPlan.msgQuota}
          format={(n) => n.toLocaleString()}
          ofLabel={t("settings.billing.usageOf")}
        />
        <UsageMeter
          icon={Sparkles}
          label={t("settings.billing.aiUsageThisMonth")}
          used={MOCK_USAGE.aiCostUsedUsd}
          total={MOCK_USAGE.aiCostCapUsd}
          format={(n) => `$${n.toFixed(2)}`}
          ofLabel={t("settings.billing.usageOf")}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((plan) => {
          const isCurrent = plan.key === CURRENT_PLAN_KEY;
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
                disabled={isCurrent}
                onClick={() => handleUpgrade(plan.name)}
                className="mt-4 w-full"
              >
                {isCurrent
                  ? t("settings.billing.currentPlan")
                  : plan.price === 0
                    ? t("settings.billing.downgrade")
                    : t("settings.billing.upgrade")}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
