export interface AdCampaignSummary {
  id: string;
  name: string;
  status: "active" | "paused";
  spend: number;
  clicks: number;
  conversions: number;
}

export const AD_GOALS = ["More calls", "More bookings", "More website visits"];

/** Mock dashboard rows — real campaign creation + daily stats pull is BE-085, live wiring is INT-013. */
export const GOOGLE_ADS_CAMPAIGNS: AdCampaignSummary[] = [
  { id: "ga1", name: "Downtown haircuts — search", status: "active", spend: 210, clicks: 340, conversions: 24 },
  { id: "ga2", name: "Weekend color special", status: "paused", spend: 85, clicks: 120, conversions: 6 },
];

export function forecastClicks(dailyBudget: number): number {
  return Math.round(dailyBudget * 2.4);
}
