import { apiFetch } from "@/lib/api-client";

export interface CreateEmailCampaignInput {
  subject: string;
  body: string;
  segment: string;
}

export interface LiveEmailCampaign {
  id: string;
  subject: string;
  body: string;
  segment: string;
  sentCount: number;
  createdAt: string;
}

export function createEmailCampaign(input: CreateEmailCampaignInput): Promise<LiveEmailCampaign> {
  return apiFetch<LiveEmailCampaign>("/integrations/email/campaigns", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface EmailFunnel {
  campaignId: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
}

export function fetchEmailFunnel(campaignId: string): Promise<EmailFunnel> {
  return apiFetch<EmailFunnel>(`/integrations/email/campaigns/${campaignId}/funnel`);
}

export interface EmailListHealth {
  subscribed: number;
  unsubscribed: number;
  bounced: number;
}

export function fetchEmailListHealth(): Promise<EmailListHealth> {
  return apiFetch<EmailListHealth>("/integrations/email/list-health");
}

/** GET /integrations/email/unsubscribe (BE-083, public — signed link, no auth). */
export function unsubscribeEmail(token: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(
    `/integrations/email/unsubscribe?token=${encodeURIComponent(token)}`,
    {},
    { skipAuth: true },
  );
}
