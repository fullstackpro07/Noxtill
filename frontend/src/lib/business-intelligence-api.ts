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

export function fetchBusinessIntelligenceOverview(): Promise<BusinessIntelligenceOverview> {
  return apiFetch<BusinessIntelligenceOverview>(
    "/business-intelligence/overview",
  );
}
