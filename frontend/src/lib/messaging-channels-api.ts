import { apiFetch } from "@/lib/api-client";

export type MessageChannel = "whatsapp" | "sms" | "email";
export type TemplateApprovalStatus = "approved" | "pending" | "rejected";

export interface TemplateApprovalRow {
  key: string;
  category: string;
  locales: string[];
  approval: { status: TemplateApprovalStatus; reason?: string };
}

export interface MessagingChannelsSettings {
  priority: MessageChannel[];
  defaultPriority: MessageChannel[];
  msgQuota: number;
  msgUsed: number;
  usageByChannel: Record<string, number>;
  templates: TemplateApprovalRow[];
}

/** GET /messaging/channels */
export function fetchMessagingChannels(): Promise<MessagingChannelsSettings> {
  return apiFetch<MessagingChannelsSettings>("/messaging/channels");
}

/** PATCH /messaging/channels */
export function updateChannelPriority(priority: MessageChannel[]): Promise<MessagingChannelsSettings> {
  return apiFetch<MessagingChannelsSettings>("/messaging/channels", {
    method: "PATCH",
    body: JSON.stringify({ priority }),
  });
}

/** PATCH /messaging/templates/:key/approval */
export function setTemplateApproval(
  key: string,
  status: TemplateApprovalStatus,
  reason?: string,
): Promise<MessagingChannelsSettings> {
  return apiFetch<MessagingChannelsSettings>(`/messaging/templates/${key}/approval`, {
    method: "PATCH",
    body: JSON.stringify({ status, reason }),
  });
}
