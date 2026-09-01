"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Receipt } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { EmptyState } from "@/components/shared/empty-state";
import { SettingsSectionHeader } from "./settings-section-header";
import { fetchBusinessProfile, updateBusinessProfile, type BusinessProfile } from "@/lib/businesses-api";
import { fetchTaxRules, createTaxRule, updateTaxRule, deleteTaxRule, type TaxRule } from "@/lib/tax-rules-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { useTranslation } from "@/hooks/use-translation";

export function TaxSection() {
  const { t } = useTranslation();

  const profileQuery = useQuery({ queryKey: ["business-profile"], queryFn: fetchBusinessProfile });
  const rulesQuery = useQuery({ queryKey: ["tax-rules"], queryFn: fetchTaxRules });

  return (
    <div>
      <SettingsSectionHeader
        title={t("settings.section.tax.label")}
        description={t("settings.section.tax.description")}
      />

      <div className="flex flex-col gap-6">
        {profileQuery.isError ? (
          <ErrorBanner title="Couldn't load tax settings" onRetry={() => profileQuery.refetch()} />
        ) : profileQuery.isPending || !profileQuery.data ? (
          <div className="flex flex-col gap-1 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
            <SkeletonRow />
          </div>
        ) : (
          <DefaultTaxForm key={profileQuery.data.id} initial={profileQuery.data} />
        )}

        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-fg">Category tax rates</p>
              <p className="mt-0.5 text-sm text-fg-muted">Override the default rate for specific product categories. The default applies when nothing matches.</p>
            </div>
          </div>
          {rulesQuery.isError ? (
            <ErrorBanner title="Couldn't load tax rules" onRetry={() => rulesQuery.refetch()} />
          ) : rulesQuery.isPending || !rulesQuery.data ? (
            <div className="flex flex-col gap-1">
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : (
            <TaxRulesTable rules={rulesQuery.data} />
          )}
        </div>
      </div>
    </div>
  );
}

function DefaultTaxForm({ initial }: { initial: BusinessProfile }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [taxLabel, setTaxLabel] = useState(initial.taxLabel);
  const [taxRate, setTaxRate] = useState(String(initial.taxRate));

  const mutation = useMutation({
    mutationFn: () => updateBusinessProfile({ taxLabel, taxRate: Number(taxRate) || 0 }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["business-profile"], updated);
      toast.success("Tax settings saved.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save these changes — please try again."),
  });

  const previewSentence = t("settings.tax.previewSentence", {
    amount: "$100.00",
    label: taxLabel || "Tax",
    tax: `$${(Number(taxRate) || 0).toFixed(2)}`,
  });

  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
      <p className="text-sm font-medium text-fg">Default rate</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label={t("settings.tax.label")}
          value={taxLabel}
          onChange={(e) => setTaxLabel(e.target.value)}
          hint={t("settings.tax.labelHint")}
        />
        <Input
          label={t("settings.tax.rate")}
          type="number"
          step="0.01"
          min={0}
          max={100}
          value={taxRate}
          onChange={(e) => setTaxRate(e.target.value)}
          trailingSlot={<span className="text-sm text-fg-faint">%</span>}
        />
      </div>
      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface-2 p-4 text-sm text-fg-muted">
        {previewSentence}
      </div>
      <div className="flex justify-end pt-1">
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? t("common.saving") : t("common.saveChanges")}
        </Button>
      </div>
    </div>
  );
}

function TaxRulesTable({ rules }: { rules: TaxRule[] }) {
  const [dialogRule, setDialogRule] = useState<TaxRule | "new" | null>(null);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTaxRule(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tax-rules"] });
      toast.success("Tax rule removed.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't remove this rule — please try again."),
  });

  return (
    <>
      {rules.length === 0 ? (
        <EmptyState icon={Receipt} title="No category rates yet" description="Every sale uses the default rate above until you add one." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                <th className="px-2 py-2 text-start">Category</th>
                <th className="px-2 py-2 text-start">Label</th>
                <th className="px-2 py-2 text-end">Rate</th>
                <th className="px-2 py-2 text-start">Status</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-b border-border last:border-0">
                  <td className="px-2 py-2.5 text-fg">{rule.category ?? <span className="text-fg-faint">Any category</span>}</td>
                  <td className="px-2 py-2.5 text-fg-muted">{rule.label}</td>
                  <td className="px-2 py-2.5 text-end tabular-nums text-fg">{rule.rate}%</td>
                  <td className="px-2 py-2.5">
                    <Badge tone={rule.active ? "success" : "neutral"}>{rule.active ? "Active" : "Inactive"}</Badge>
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setDialogRule(rule)}
                        className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-fg-muted hover:bg-surface-2"
                        aria-label="Edit rule"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteMutation.mutate(rule.id)}
                        disabled={deleteMutation.isPending}
                        className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-fg-faint hover:bg-destructive/8 hover:text-destructive"
                        aria-label="Delete rule"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Button variant="ghost" size="sm" className="mt-3 w-fit" onClick={() => setDialogRule("new")}>
        <Plus className="h-3.5 w-3.5" aria-hidden />
        Add category rate
      </Button>

      {dialogRule && <TaxRuleDialog rule={dialogRule === "new" ? null : dialogRule} onClose={() => setDialogRule(null)} />}
    </>
  );
}

function TaxRuleDialog({ rule, onClose }: { rule: TaxRule | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState(rule?.category ?? "");
  const [label, setLabel] = useState(rule?.label ?? "");
  const [rate, setRate] = useState(String(rule?.rate ?? ""));
  const [active, setActive] = useState(rule?.active ?? true);

  const mutation = useMutation({
    mutationFn: () => {
      const dto = { category: category || undefined, label, rate: Number(rate) || 0, active };
      return rule ? updateTaxRule(rule.id, dto) : createTaxRule(dto);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tax-rules"] });
      toast.success(rule ? "Tax rule updated." : "Tax rule added.");
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this rule — please try again."),
  });

  const valid = label.trim().length > 0 && Number(rate) >= 0 && Number(rate) <= 100;

  return (
    <Dialog
      open
      onClose={onClose}
      title={rule ? "Edit tax rate" : "Add category tax rate"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Category" placeholder="Leave blank to apply to any category" value={category} onChange={(e) => setCategory(e.target.value)} />
        <Input label="Label" placeholder="e.g. Beverage VAT" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Input label="Rate" type="number" step="0.01" min={0} max={100} value={rate} onChange={(e) => setRate(e.target.value)} trailingSlot={<span className="text-sm text-fg-faint">%</span>} />
        <label className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 rounded border-border-strong text-primary focus:ring-primary/30" />
          Active
        </label>
      </div>
    </Dialog>
  );
}
