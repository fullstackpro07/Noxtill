import { GOOGLE_ADS_CAMPAIGNS } from "@/lib/google-ads";
import { META_ADS_CAMPAIGNS } from "@/lib/meta-ads";
import { TIKTOK_ADS_CAMPAIGNS } from "@/lib/tiktok-ads";
import { EMAIL_FUNNEL } from "@/lib/email-marketing";

export interface ChannelOverviewRow {
  key: string;
  name: string;
  href: string;
  spend: number;
  results: number;
  resultLabel: string;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** Cross-channel roll-up — real aggregate is GET /marketing/overview (BE-089), live wiring is INT-013. */
export const CHANNEL_OVERVIEW: ChannelOverviewRow[] = [
  {
    key: "google_ads",
    name: "Google Ads",
    href: "/integrations/google-ads",
    spend: sum(GOOGLE_ADS_CAMPAIGNS.map((c) => c.spend)),
    results: sum(GOOGLE_ADS_CAMPAIGNS.map((c) => c.conversions)),
    resultLabel: "conversions",
  },
  {
    key: "meta_ads",
    name: "Meta Ads",
    href: "/integrations/meta-ads",
    spend: sum(META_ADS_CAMPAIGNS.map((c) => c.spend)),
    results: sum(META_ADS_CAMPAIGNS.map((c) => c.conversions)),
    resultLabel: "conversions",
  },
  {
    key: "tiktok_ads",
    name: "TikTok Ads",
    href: "/integrations/tiktok-ads",
    spend: sum(TIKTOK_ADS_CAMPAIGNS.map((c) => c.spend)),
    results: sum(TIKTOK_ADS_CAMPAIGNS.map((c) => c.conversions)),
    resultLabel: "conversions",
  },
  {
    key: "email",
    name: "Email",
    href: "/integrations/email",
    spend: 0,
    results: EMAIL_FUNNEL.clicked,
    resultLabel: "clicks",
  },
];

export const OVERVIEW_TREND = [180, 210, 195, 240, 260, 230, 280, 310, 290, 340, 360, 405];
