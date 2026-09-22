import { apiFetch } from "@/lib/api-client";

export const AD_PROVIDERS = [
  "google_ads",
  "meta_ads",
  "tiktok_ads",
  "linkedin_ads",
  "pinterest_ads",
  "snapchat_ads",
  "microsoft_ads",
  "amazon_ads",
  "reddit_ads",
] as const;
export type AdProvider = (typeof AD_PROVIDERS)[number];

export const AD_PROVIDER_LABELS: Record<AdProvider, string> = {
  google_ads: "Google Ads",
  meta_ads: "Meta Ads",
  tiktok_ads: "TikTok Ads",
  linkedin_ads: "LinkedIn Ads",
  pinterest_ads: "Pinterest Ads",
  snapchat_ads: "Snapchat Ads",
  microsoft_ads: "Microsoft Ads",
  amazon_ads: "Amazon Ads",
  reddit_ads: "Reddit Ads",
};

export interface AdAccountsRow {
  provider: AdProvider;
  connected: boolean;
  accounts?: unknown;
  error?: string;
}

export function fetchAdAccounts(): Promise<AdAccountsRow[]> {
  return apiFetch<AdAccountsRow[]>("/ads/accounts");
}

export interface AdCampaign {
  id: string;
  businessId: string;
  integrationId: string | null;
  provider: AdProvider;
  goal: string;
  budget: string;
  status: "draft" | "paused" | "active";
  externalId: string | null;
  stats: { spend?: number; impressions?: number; clicks?: number; results?: number };
  providerMeta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export function fetchCampaigns(): Promise<AdCampaign[]> {
  return apiFetch<AdCampaign[]>("/ads/campaigns");
}

export function fetchCampaign(id: string): Promise<AdCampaign> {
  return apiFetch<AdCampaign>(`/ads/campaigns/${id}`);
}

/** Real AI-generated ad copy — the same `AiInfraService` path used for social captions, not a template. */
export function generateAdCopy(input: { productName: string; goal?: string }): Promise<{ headline: string; body: string }> {
  return apiFetch("/ads/generate-copy", { method: "POST", body: JSON.stringify(input) });
}

export interface CreateCampaignInput {
  name: string;
  goal: string;
  dailyBudget: number;
  meta?: Record<string, unknown>;
}

/** Ad Accounts + Create Campaign (UPD-FE-058) — a real, paused-by-default campaign pushed to the provider when connected. */
export function createCampaign(provider: AdProvider, input: CreateCampaignInput): Promise<AdCampaign> {
  return apiFetch<AdCampaign>(`/ads/${provider}/campaigns`, { method: "POST", body: JSON.stringify(input) });
}

/** Campaign management actions (UPD-BE-130/UPD-FE-128) — real pause/resume/budget-adjust, applied at the provider when connected. */
export function updateCampaign(id: string, input: { status?: "paused" | "active"; dailyBudget?: number }): Promise<AdCampaign> {
  return apiFetch<AdCampaign>(`/ads/campaigns/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export interface FatigueWarning {
  fatigued: boolean;
  sampleSize: number;
  ctrDeclinePercent?: number;
  baselineCapturedAt?: string;
  latestCapturedAt?: string;
}

/**
 * Fatigue-warning depth fix — real, computed only from stats snapshots `AdStatsSyncProcessor` has
 * actually captured hourly for a connected, real-reporting-capable platform. `sampleSize < 2`
 * means no real trend exists yet — never a fabricated "not fatigued" guess.
 */
export function fetchCampaignFatigue(id: string): Promise<FatigueWarning> {
  return apiFetch<FatigueWarning>(`/ads/campaigns/${id}/fatigue`);
}

export interface AdCreative {
  id: string;
  businessId: string;
  campaignId: string | null;
  provider: AdProvider;
  headline: string;
  body: string;
  mediaKey: string | null;
  sourceReviewId: string | null;
  externalId: string | null;
  status: "draft" | "approved" | "active" | "paused";
  /** A/B-test setup depth fix — creatives sharing this real, user-chosen key are variants of one experiment. */
  experimentKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export function fetchCreatives(): Promise<AdCreative[]> {
  return apiFetch<AdCreative[]>("/ads/creatives");
}

export interface CreateCreativeInput {
  provider: AdProvider;
  campaignId?: string;
  headline: string;
  body: string;
  mediaKey?: string;
  experimentKey?: string;
}

export function createCreative(input: CreateCreativeInput): Promise<AdCreative> {
  return apiFetch<AdCreative>("/ads/creatives", { method: "POST", body: JSON.stringify(input) });
}

export function updateCreative(id: string, input: Partial<Pick<AdCreative, "headline" | "body" | "mediaKey" | "status" | "experimentKey">>): Promise<AdCreative> {
  return apiFetch<AdCreative>(`/ads/creatives/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function removeCreative(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/ads/creatives/${id}`, { method: "DELETE" });
}

export interface AdAudience {
  id: string;
  businessId: string;
  provider: AdProvider;
  name: string;
  segmentKey: string | null;
  size: number;
  externalId: string | null;
  status: "local" | "synced" | "syncing" | "failed" | string;
  createdAt: string;
  updatedAt: string;
}

export function fetchAudiences(): Promise<AdAudience[]> {
  return apiFetch<AdAudience[]>("/ads/audiences");
}

/** Real CRM segment behind `segmentKey` — consent-checked (excludes opted-out customers) before sync, always. */
export function syncAudience(input: { segmentKey: string; provider: AdProvider; name?: string }): Promise<AdAudience> {
  return apiFetch<AdAudience>("/ads/audiences/sync", { method: "POST", body: JSON.stringify(input) });
}

export function removeAudience(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/ads/audiences/${id}`, { method: "DELETE" });
}

export interface AdBudgetRow {
  provider: AdProvider;
  campaignCount: number;
  totalDailyBudget: number;
}

export function fetchAdBudget(): Promise<{ rows: AdBudgetRow[]; totalDailyBudget: number }> {
  return apiFetch<{ rows: AdBudgetRow[]; totalDailyBudget: number }>("/ads/budget");
}

export interface AdPerformanceRow {
  provider: AdProvider;
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
  ctr: number | null;
  costPerResult: number | null;
}

export function fetchAdPerformance(): Promise<AdPerformanceRow[]> {
  return apiFetch<AdPerformanceRow[]>("/ads/performance");
}

export type AdLeadStatus = "new" | "contacted" | "converted";

export interface AdLead {
  id: string;
  businessId: string;
  campaignId: string | null;
  provider: AdProvider;
  name: string | null;
  email: string | null;
  phone: string | null;
  formData: Record<string, unknown>;
  externalId: string;
  status: AdLeadStatus;
  createdAt: string;
}

export function fetchAdLeads(): Promise<AdLead[]> {
  return apiFetch<AdLead[]>("/ads/leads");
}

/** Real status, set by a person from the Leads screen — never inferred. */
export function updateAdLeadStatus(id: string, status: AdLeadStatus): Promise<AdLead> {
  return apiFetch<AdLead>(`/ads/leads/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
}

export interface AdSettings {
  businessId: string;
  defaultDailyBudgetCap: string | number | null;
  autoPauseCostPerResult: string | number | null;
  requireApproval: boolean;
}

export function fetchAdSettings(): Promise<AdSettings> {
  return apiFetch<AdSettings>("/ads/settings");
}

export function updateAdSettings(input: {
  defaultDailyBudgetCap?: number | null;
  autoPauseCostPerResult?: number | null;
  requireApproval?: boolean;
}): Promise<AdSettings> {
  return apiFetch<AdSettings>("/ads/settings", { method: "PATCH", body: JSON.stringify(input) });
}

/**
 * A/B experiment: two or more `AdCreative` rows sharing a real `experimentKey`. There is no
 * per-creative spend/CTR/conversion tracking in this schema (stats only exist at the campaign
 * level), so this deliberately carries no spend, winner, or confidence figure — none of those
 * would be real.
 */
export interface AdExperimentItem {
  id: string;
  name: string;
  variantA: string;
  variantB: string;
  createdAt: string;
  creatives: Array<{
    id: string;
    headline: string;
    body: string;
    provider: string;
    status: string;
  }>;
}

export function fetchAdExperiments(): Promise<AdExperimentItem[]> {
  return apiFetch<AdExperimentItem[]>("/ads/experiments");
}

export function createAdExperiment(input: {
  name: string;
  provider: AdProvider;
  campaignId?: string;
  variantAHeadline: string;
  variantABody: string;
  variantBHeadline: string;
  variantBBody: string;
}): Promise<any> {
  return apiFetch("/ads/experiments", { method: "POST", body: JSON.stringify(input) });
}

export interface AdRuleRecord {
  id: string;
  name: string;
  when: string;
  then: string;
  guard: string;
  fired: number;
  on: boolean;
  locked?: boolean;
}

/**
 * Rules & Automation. There is exactly one real automated rule (auto-pause on cost per result,
 * enforced hourly by the real `ad-auto-pause` job) — `pendingApproval` is always null: no
 * suggestion/anomaly-detection engine exists to populate it, and it's never fabricated to look
 * like one does.
 */
export interface AdRulesResponse {
  kpis: Array<{ label: string; value: string; color: string }>;
  rules: AdRuleRecord[];
  pendingApproval: null;
}

export function fetchAdRules(): Promise<AdRulesResponse> {
  return apiFetch<AdRulesResponse>("/ads/rules");
}

export function toggleAdRule(id: string): Promise<{ success: boolean; rule: AdRuleRecord }> {
  return apiFetch(`/ads/rules/${id}/toggle`, { method: "POST" });
}

export interface FunnelStage {
  label: string;
  value: number;
  widthPercent: number;
}

/** Real numbers only: impressions/clicks from campaign stats, leads and completed orders from
 * their own tables. No landing-page-view or click-to-order tracking exists, so this is where the
 * funnel stops — it never estimates a stage it can't measure. */
export function fetchAdFunnel(): Promise<FunnelStage[]> {
  return apiFetch<FunnelStage[]>("/ads/analytics/funnel");
}

export interface AdDailyHistoryPoint {
  date: string;
  spend: number;
  results: number;
}

/** Real per-day spend/results from `AdCampaignStatsSnapshot`, captured hourly. */
export function fetchAdDailyHistory(): Promise<AdDailyHistoryPoint[]> {
  return apiFetch<AdDailyHistoryPoint[]>("/ads/analytics/daily-history");
}

