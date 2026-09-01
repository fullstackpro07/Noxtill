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

export interface AiSettings {
  aiMonthlyCostCapUsd: number;
  aiRateLimitPerMinute: number;
  featureToggles: AiFeatureToggles;
  usageThisMonth: {
    byFeature: Record<keyof AiFeatureToggles, AiFeatureUsage>;
    other: AiFeatureUsage;
    totalCostUsd: number;
  };
  disclosureText: string;
}

export function fetchAiSettings(): Promise<AiSettings> {
  return apiFetch<AiSettings>("/ai/settings");
}

export interface UpdateAiSettingsInput {
  aiMonthlyCostCapUsd?: number;
  aiRateLimitPerMinute?: number;
  featureToggles?: Partial<AiFeatureToggles>;
}

export function updateAiSettings(input: UpdateAiSettingsInput): Promise<AiSettings> {
  return apiFetch<AiSettings>("/ai/settings", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
