"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SettingsSectionHeader } from "./settings-section-header";
import { toast } from "@/lib/toast";
import { useTranslation } from "@/hooks/use-translation";

export function TaxSection() {
  const { t } = useTranslation();
  const [taxLabel, setTaxLabel] = useState("Tax");
  const [taxRate, setTaxRate] = useState("8.5");

  function handleSave() {
    toast.success("Tax settings saved. Live save wires up in INT-005.");
  }

  const previewSentence = t("settings.tax.previewSentence", {
    amount: "$100.00",
    label: taxLabel || "Tax",
    tax: `$${(Number(taxRate) || 0).toFixed(2)}`,
  });

  return (
    <div>
      <SettingsSectionHeader
        title={t("settings.section.tax.label")}
        description={t("settings.section.tax.description")}
      />
      <div className="flex flex-col gap-4 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
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
          <Button onClick={handleSave}>{t("common.saveChanges")}</Button>
        </div>
      </div>
    </div>
  );
}
