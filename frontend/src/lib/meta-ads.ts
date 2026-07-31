import type { AdCampaignSummary } from "@/lib/google-ads";

export const META_AD_GOALS = ["Awareness", "Traffic", "Engagement"];

/** Mock dashboard rows — real campaign creation + creative render is BE-087, live wiring is INT-013. */
export const META_ADS_CAMPAIGNS: AdCampaignSummary[] = [
  { id: "ma1", name: "5★ reviews carousel", status: "active", spend: 140, clicks: 890, conversions: 31 },
];
