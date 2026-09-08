import { apiFetch } from "@/lib/api-client";

export interface SocialSettings {
  id: string | null;
  businessId: string;
  autoPostRules: Record<string, unknown>;
  hashtagSets: Record<string, string[]>;
  brandVoice: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface UpdateSocialSettingsInput {
  autoPostRules?: Record<string, unknown>;
  hashtagSets?: Record<string, string[]>;
  brandVoice?: string | null;
}

export function fetchSocialSettings(): Promise<SocialSettings> {
  return apiFetch<SocialSettings>("/social/settings");
}

export function updateSocialSettings(input: UpdateSocialSettingsInput): Promise<SocialSettings> {
  return apiFetch<SocialSettings>("/social/settings", { method: "PATCH", body: JSON.stringify(input) });
}
