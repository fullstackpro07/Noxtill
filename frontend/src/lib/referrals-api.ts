import { apiFetch } from "@/lib/api-client";
import type { ReferralSettings } from "@/lib/referrals";

interface RawReferralSettings {
  enabled?: boolean;
  rewardType?: "credit" | "discount";
  rewardValue?: number;
}

function toReferralSettings(raw: RawReferralSettings): ReferralSettings {
  return {
    enabled: raw.enabled ?? false,
    rewardType: raw.rewardType ?? "credit",
    rewardAmount: raw.rewardValue ?? 0,
  };
}

/** GET /referrals/settings — backend returns `{}` for a business that's never saved settings, no server default. */
export async function fetchReferralSettings(): Promise<ReferralSettings> {
  const raw = await apiFetch<RawReferralSettings>("/referrals/settings");
  return toReferralSettings(raw);
}

export async function saveReferralSettings(settings: ReferralSettings): Promise<ReferralSettings> {
  const raw = await apiFetch<RawReferralSettings>("/referrals/settings", {
    method: "POST",
    body: JSON.stringify({
      enabled: settings.enabled,
      rewardType: settings.rewardType,
      rewardValue: settings.rewardAmount,
    }),
  });
  return toReferralSettings(raw);
}

export interface ReferralStats {
  totalReferred: number;
  converted: number;
  rewardsIssued: number;
  leaderboard: { customerId: string; name: string; count: number }[];
}

export function fetchReferralStats(): Promise<ReferralStats> {
  return apiFetch<ReferralStats>("/referrals/stats");
}
