"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, ArrowDown, MessageSquare, Mail, Smartphone } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { SettingsSectionHeader } from "./settings-section-header";
import { SkeletonRow } from "@/components/shared/skeleton";
import { ErrorBanner } from "@/components/shared/error-states";
import { LOCALES } from "@/lib/locales";
import { MESSAGE_TEMPLATES } from "@/lib/message-templates";
import {
  fetchMessagingChannels,
  updateChannelPriority,
  setTemplateApproval,
  type MessageChannel,
  type TemplateApprovalStatus,
} from "@/lib/messaging-channels-api";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { useTranslation } from "@/hooks/use-translation";

const CHANNEL_ICON: Record<MessageChannel, typeof MessageSquare> = {
  whatsapp: MessageSquare,
  sms: Smartphone,
  email: Mail,
};

const CHANNEL_LABEL: Record<MessageChannel, string> = {
  whatsapp: "WhatsApp",
  sms: "SMS",
  email: "Email",
};

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
  const queryClient = useQueryClient();
  const [templateKey, setTemplateKey] = useState(MESSAGE_TEMPLATES[0].key);
  const [previewLocale, setPreviewLocale] = useState("en");

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["messaging-channels"],
    queryFn: fetchMessagingChannels,
  });

  const priorityMutation = useMutation({
    mutationFn: (priority: MessageChannel[]) => updateChannelPriority(priority),
    onSuccess: (updated) => {
      queryClient.setQueryData(["messaging-channels"], updated);
      toast.success("Channel order saved.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save the channel order — please try again."),
  });

  const approvalMutation = useMutation({
    mutationFn: ({ key, status }: { key: string; status: TemplateApprovalStatus }) => setTemplateApproval(key, status),
    onSuccess: (updated) => {
      queryClient.setQueryData(["messaging-channels"], updated);
      toast.success("Template approval updated.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't update this template — please try again."),
  });

  function move(index: number, direction: -1 | 1) {
    if (!data) return;
    const next = [...data.priority];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    priorityMutation.mutate(next);
  }

  const template = MESSAGE_TEMPLATES.find((tpl) => tpl.key === templateKey)!;
  const hasTranslation = !!template.locales[previewLocale];
  const previewText = renderTemplate(template.locales[previewLocale] ?? template.locales.en);

  if (isError) {
    return (
      <div>
        <SettingsSectionHeader title={t("settings.section.messages.label")} description={t("settings.section.messages.description")} />
        <ErrorBanner title="Couldn't load Messages & Channels" onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div>
      <SettingsSectionHeader
        title={t("settings.section.messages.label")}
        description={t("settings.section.messages.description")}
      />

      <div className="flex flex-col gap-6">
        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
          <p className="mb-1 text-sm font-medium text-fg">Channel priority</p>
          <p className="mb-3 text-sm text-fg-muted">The order Noxtill tries a delivery channel when a customer can be reached on more than one.</p>
          {isPending || !data ? (
            <div className="flex flex-col gap-1">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.priority.map((channel, i) => {
                const Icon = CHANNEL_ICON[channel];
                return (
                  <li key={channel} className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-border bg-surface-2/40 px-3.5 py-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
                    <Icon className="h-4 w-4 shrink-0 text-fg-faint" aria-hidden />
                    <span className="flex-1 text-sm font-medium text-fg">{CHANNEL_LABEL[channel]}</span>
                    <span className="text-xs tabular-nums text-fg-faint">{data.usageByChannel[channel] ?? 0} sent this month</span>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => move(i, -1)}
                        disabled={i === 0 || priorityMutation.isPending}
                        className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-fg-muted hover:bg-surface-2 disabled:opacity-30"
                        aria-label={`Move ${CHANNEL_LABEL[channel]} up`}
                      >
                        <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(i, 1)}
                        disabled={i === data.priority.length - 1 || priorityMutation.isPending}
                        className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-fg-muted hover:bg-surface-2 disabled:opacity-30"
                        aria-label={`Move ${CHANNEL_LABEL[channel]} down`}
                      >
                        <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
          <p className="mb-1 text-sm font-medium text-fg">Templates</p>
          <p className="mb-3 text-sm text-fg-muted">Approval status for every message template — {data?.msgUsed ?? 0} of {data?.msgQuota ?? 0} monthly messages used.</p>
          {isPending || !data ? (
            <div className="flex flex-col gap-1">
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                    <th className="px-2 py-2 text-start">Template</th>
                    <th className="px-2 py-2 text-start">Category</th>
                    <th className="px-2 py-2 text-start">Locales</th>
                    <th className="px-2 py-2 text-end">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.templates.map((row) => {
                    const label = MESSAGE_TEMPLATES.find((tpl) => tpl.key === row.key)?.label ?? row.key;
                    return (
                      <tr key={row.key} className="border-b border-border last:border-0">
                        <td className="px-2 py-2.5 font-medium text-fg">{label}</td>
                        <td className="px-2 py-2.5">
                          <Badge tone={row.category === "marketing" ? "warning" : "neutral"}>{row.category}</Badge>
                        </td>
                        <td className="px-2 py-2.5 text-fg-muted">{row.locales.length}</td>
                        <td className="px-2 py-2.5">
                          <div className="flex justify-end">
                            <select
                              value={row.approval.status}
                              disabled={approvalMutation.isPending}
                              onChange={(e) =>
                                approvalMutation.mutate({ key: row.key, status: e.target.value as TemplateApprovalStatus })
                              }
                              className="h-8 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-2 text-xs text-fg"
                            >
                              <option value="approved">Approved</option>
                              <option value="pending">Pending</option>
                              <option value="rejected">Rejected</option>
                            </select>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-5">
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
      </div>
    </div>
  );
}
