import { apiFetch } from "@/lib/api-client";

export interface VoiceTrendRow {
  day: string;
  calls: number;
  missed: number;
  transferred: number;
  aiContained: number;
  humanConnected: number;
  aiOnlyMinutes: number;
  humanInvolvedMinutes: number;
  costPerPricedCall: number | null;
  averageQualityScore: number | null;
  complianceBlockedRate: number | null;
}

export interface VoiceAnalyticsTrends {
  windowDays: number;
  timeZone: string;
  generatedAt: string;
  series: VoiceTrendRow[];
  totals: {
    calls: number;
    missed: number;
    transferred: number;
    aiContained: number;
    humanConnected: number;
    aiOnlyMinutes: number;
    humanInvolvedMinutes: number;
    pricedCalls: number;
    pricedCost: number;
  };
  glossary: { metric: string; definition: string }[];
  dataLag: string;
}

export function fetchVoiceAnalyticsTrends(days: number): Promise<VoiceAnalyticsTrends> {
  return apiFetch(`/voice/analytics/trends?days=${days}`);
}
