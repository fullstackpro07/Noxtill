import { apiFetch } from "@/lib/api-client";
import { fetchWidgetData } from "@/lib/widgets-api";

/** GET /segments/:key — live per-audience member count (segment "all" matches every non-opted-out customer). */
export async function fetchAudienceCount(segmentKey: string): Promise<number> {
  const result = await apiFetch<{ key: string; count: number }>(`/segments/${segmentKey}`);
  return result.count;
}

export interface QuotaUsage {
  used: number;
  quota: number;
  percent: number;
}

/** Reuses the existing message_quota_usage widget rather than duplicating the same business fields via a new endpoint. */
export async function fetchQuotaUsage(): Promise<QuotaUsage> {
  return fetchWidgetData("message_quota_usage") as Promise<QuotaUsage>;
}

export interface CreateCampaignInput {
  segment: string;
  body: string;
  scheduledFor?: string;
}

export interface LiveCampaign {
  id: string;
  segment: string;
  body: string;
  sentCount: number;
  scheduledFor: string | null;
  createdAt: string;
}

export function createCampaign(input: CreateCampaignInput): Promise<LiveCampaign> {
  return apiFetch<LiveCampaign>("/campaigns", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function fetchCampaigns(): Promise<LiveCampaign[]> {
  return apiFetch<LiveCampaign[]>("/campaigns");
}

export interface CampaignReport {
  campaignId: string;
  segment: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}

export function fetchCampaignReport(id: string): Promise<CampaignReport> {
  return apiFetch<CampaignReport>(`/campaigns/${id}/report`);
}
