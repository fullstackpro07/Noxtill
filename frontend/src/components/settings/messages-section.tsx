"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SettingsSectionHeader } from "./settings-section-header";
import { LOCALES } from "@/lib/locales";
import { MESSAGE_TEMPLATES } from "@/lib/message-templates";
import { toast } from "@/lib/toast";
import { useTranslation } from "@/hooks/use-translation";

const CHANNELS = [
  { value: "whatsapp", labelKey: "channel.whatsapp" },
  { value: "sms", labelKey: "channel.sms" },
  { value: "email", labelKey: "channel.email" },
];

const SAMPLE_VALUES: Record<string, string> = {
  customerName: "Priya",
  serviceName: "Signature Haircut",
  dateTime: "Fri, 3:00 PM",
  orderNo: "1042",
  status: "ready for pickup",
  receiptUrl: "noxtill.app/r/abc123",
  balance: "$48.00",
  alertTitle: "New private feedback",
  alertBody: "2★ — service was slow",
  revenue: "$842",
  ordersCount: "14",
  lowStockCount: "3",
  businessName: "Sunset Hair Studio",
  reviewUrl: "noxtill.app/r/xyz789",
  body: "20% off all hair color services this weekend only!",
};

function renderTemplate(text: string): string {
  return text.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => SAMPLE_VALUES[key] ?? `{{${key}}}`);
}

export function MessagesSection() {
  const { t } = useTranslation();
  const [channel, setChannel] = useState("whatsapp");
  const [nightlyCloseTime, setNightlyCloseTime] = useState("22:00");
  const [templateKey, setTemplateKey] = useState(MESSAGE_TEMPLATES[0].key);
  const [previewLocale, setPreviewLocale] = useState("en");

  const template = MESSAGE_TEMPLATES.find((t) => t.key === templateKey)!;
  const hasTranslation = !!template.locales[previewLocale];
  const previewText = renderTemplate(template.locales[previewLocale] ?? template.locales.en);

  function handleSave() {
    toast.success("Messaging settings saved. Live save wires up in INT-005.");
  }

  return (
    <div>
      <SettingsSectionHeader
        title={t("settings.section.messages.label")}
        description={t("settings.section.messages.description")}
      />

      <div className="flex flex-col gap-6 rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label={t("settings.messages.preferredChannel")} value={channel} onChange={(e) => setChannel(e.target.value)}>
            {CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>
                {t(c.labelKey)}
              </option>
            ))}
          </Select>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="nightly-close-time" className="text-sm font-medium text-fg">
              {t("settings.messages.nightlyCloseTime")}
            </label>
            <div className="relative flex items-center">
              <span className="pointer-events-none absolute start-3.5 text-fg-faint">
                <Clock className="h-4 w-4" aria-hidden />
              </span>
              <input
                id="nightly-close-time"
                type="time"
                value={nightlyCloseTime}
                onChange={(e) => setNightlyCloseTime(e.target.value)}
                className="h-11 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface ps-10 pe-3.5 text-sm text-fg focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-5">
          <p className="mb-3 text-sm font-medium text-fg">{t("settings.messages.templatePreview")}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select label={t("settings.messages.template")} value={templateKey} onChange={(e) => setTemplateKey(e.target.value)}>
              {MESSAGE_TEMPLATES.map((tpl) => (
                <option key={tpl.key} value={tpl.key}>
                  {tpl.label}
                </option>
              ))}
            </Select>
            <Select label={t("settings.messages.language")} value={previewLocale} onChange={(e) => setPreviewLocale(e.target.value)}>
              {LOCALES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.nativeLabel}
                </option>
              ))}
            </Select>
          </div>

          <div className="mt-3 rounded-[var(--radius-noxtill)] border border-border bg-surface-2 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Badge tone={template.category === "marketing" ? "warning" : "primary"}>{template.category}</Badge>
              {!hasTranslation && <Badge tone="neutral">{t("settings.messages.translationPending")}</Badge>}
            </div>
            <p className="text-sm text-fg">{previewText}</p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave}>{t("common.saveChanges")}</Button>
        </div>
      </div>
    </div>
  );
}
