import type { AdCampaignSummary } from "@/lib/google-ads";

export const TIKTOK_GOALS = ["Awareness", "Traffic", "Conversions"];

export type SlideshowStyle = "bold" | "minimal" | "retro";

export const SLIDESHOW_STYLES: { key: SlideshowStyle; label: string }[] = [
  { key: "bold", label: "Bold" },
  { key: "minimal", label: "Minimal" },
  { key: "retro", label: "Retro" },
];

/** Mock dashboard rows — real campaign creation + slideshow creative job is BE-088, live wiring is INT-013. */
export const TIKTOK_ADS_CAMPAIGNS: AdCampaignSummary[] = [
  { id: "tt1", name: "Transformation slideshow", status: "active", spend: 60, clicks: 410, conversions: 12 },
];
