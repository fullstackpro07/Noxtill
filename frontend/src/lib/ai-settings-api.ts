import { apiFetch } from "@/lib/api-client";

export interface AiFeatureToggles {
  voiceEntry: boolean;
  photoDigitizer: boolean;
  reviewReplies: boolean;
  campaignCopy: boolean;
  insights: boolean;
  whatIf: boolean;
  assistant: boolean;
}

export interface AiFeatureUsage {
  costUsd: number;
  calls: number;
}

export interface AiQueryDay {
  day: string;
  count: number;
}

export interface AiSettings {
  aiMonthlyCostCapUsd: number;
  aiRateLimitPerMinute: number;
  aiQueryQuota: number;
  featureToggles: AiFeatureToggles;
  usageThisMonth: {
    byFeature: Record<keyof AiFeatureToggles, AiFeatureUsage>;
    other: AiFeatureUsage;
    totalCostUsd: number;
    totalCalls: number;
    queryQuotaUsedPercent: number;
    limitResetsAt: string;
  };
  queriesThisWeek: AiQueryDay[];
  disclosureText: string;
}

export function fetchAiSettings(): Promise<AiSettings> {
  return apiFetch<AiSettings>("/ai/settings");
}

export interface UpdateAiSettingsInput {
  aiMonthlyCostCapUsd?: number;
  aiRateLimitPerMinute?: number;
  aiQueryQuota?: number;
  featureToggles?: Partial<AiFeatureToggles>;
}

export function updateAiSettings(input: UpdateAiSettingsInput): Promise<AiSettings> {
  return apiFetch<AiSettings>("/ai/settings", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
