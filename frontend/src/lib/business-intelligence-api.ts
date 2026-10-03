import { apiFetch } from "@/lib/api-client";

export interface BusinessIntelligenceMetric {
  key: string;
  title: string;
  value: Record<string, number | null>;
}

export interface BusinessIntelligenceInsight {
  id: string;
  category: string;
  observation: string;
  sourceFigure: string;
  estimatedImpact: number | null;
  status: string;
  createdAt: string;
  nextDecisionHref: string | null;
}

export interface BusinessIntelligenceOverview {
  requestedAt: string;
  metricSource: string;
  currency: string;
  metrics: BusinessIntelligenceMetric[];
  insightSource: string;
  insights: BusinessIntelligenceInsight[];
  disclosure: string;
}

export interface BusinessBrainSource {
  key: string;
  title: string;
  value: Record<string, unknown>;
}

export interface BusinessBrainAnswer {
  id: string;
  question: string;
  answer: string;
  sourceMetrics: BusinessBrainSource[];
  calculation: string;
  assumptions: string[];
  confidenceNote: string;
  createdAt: string;
}

export interface BusinessOpportunityInsight {
  id: string;
  theme: string;
  sourceCategory: string;
  title: string;
  evidence: string;
  sourceRecordedImpact: number | null;
  createdAt: string;
  sourceHref: string | null;
  rank: number;
  rankBasis: string;
}

export interface BusinessCommerceCandidate {
  id: string;
  title: string;
  source: string;
  category: string | null;
  market: string | null;
  demandSignal: number | null;
  competitionScore: number | null;
  trendVelocity: number | null;
  storeFitScore: number | null;
  risk: string;
  status: string;
  evidence: string | null;
  confidence: number | null;
  sourceFreshAt: string | null;
  updatedAt: string;
  rank: number;
  rankBasis: string;
  sourceHref: string;
}

export interface BusinessOpportunityRadar {
  currency: string;
  recordedInsights: BusinessOpportunityInsight[];
  commerceCandidates: BusinessCommerceCandidate[];
  themeCounts: {
    growth: number;
    savings: number;
    retention: number;
    unclassified: number;
  };
  disclosure: string;
}

export function fetchBusinessIntelligenceOverview(): Promise<BusinessIntelligenceOverview> {
  return apiFetch<BusinessIntelligenceOverview>(
    "/business-intelligence/overview",
  );
}

export function fetchBusinessBrainAnswers(): Promise<BusinessBrainAnswer[]> {
  return apiFetch<BusinessBrainAnswer[]>(
    "/business-intelligence/brain/answers",
  );
}

export function askBusinessBrain(
  question: string,
): Promise<BusinessBrainAnswer> {
  return apiFetch<BusinessBrainAnswer>("/business-intelligence/brain/ask", {
    method: "POST",
    body: JSON.stringify({ question }),
  });
}

export function fetchBusinessOpportunityRadar(): Promise<BusinessOpportunityRadar> {
  return apiFetch<BusinessOpportunityRadar>(
    "/business-intelligence/opportunity-radar",
  );
}
