"use client";

import { useState } from "react";
import { Download, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsSectionHeader } from "./settings-section-header";
import { toast } from "@/lib/toast";
import { useTranslation } from "@/hooks/use-translation";

const MOCK_ERASURE_LOG = [
  { id: "e1", customerName: "Devon Marsh", requestedBy: "Amara Osei", date: "2026-06-14" },
  { id: "e2", customerName: "Casey Nolan", requestedBy: "Amara Osei", date: "2026-04-02" },
];

export function DataPrivacySection() {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    toast.info("Preparing your export — we'll notify you when it's ready.");
    await new Promise((r) => setTimeout(r, 1200));
    setExporting(false);
    toast.success("Export ready. Live download link wires up in INT-012.");
  }

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
          <Button variant="outline" onClick={handleExport} disabled={exporting} className="shrink-0">
            <Download className="h-4 w-4" aria-hidden />
            {exporting ? t("settings.privacy.preparing") : t("settings.privacy.exportAccount")}
          </Button>
        </div>

        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
          <p className="mb-3 text-sm font-medium text-fg">{t("settings.privacy.erasureLog")}</p>
          {MOCK_ERASURE_LOG.length === 0 ? (
            <p className="text-sm text-fg-faint">{t("settings.privacy.noErasures")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {MOCK_ERASURE_LOG.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <ShieldOff className="h-4 w-4 shrink-0 text-fg-faint" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-fg">{entry.customerName}</span>
                  <span className="shrink-0 text-xs text-fg-faint">
                    {t("settings.privacy.erasedBy", { name: entry.requestedBy, date: entry.date })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
