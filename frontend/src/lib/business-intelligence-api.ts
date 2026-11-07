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
  impactThresholdStatus: string;
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
  impactThreshold: number | null;
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
  impactThresholdStatus: string;
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
  confidenceBandStatus: string;
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

export type BiScenarioType = "price" | "stock" | "staff" | "marketing";

export interface BiScenarioContext {
  currency: string;
  simulationDefaults: {
    priceChangePercent: number | null;
    additionalStockUnits: number | null;
    staffCountChange: number | null;
    marketingBudgetChange: number | null;
  };
  priceBaseline: { widget: string; value: number | null; status: string };
  staffBaseline: { widget: string; value: number | null; status: string };
  products: {
    id: string;
    name: string;
    stockQty: number;
    lowStockThreshold: number;
  }[];
  marketingBaseline: {
    campaignRecords: number;
    budgetAndAttributedRevenue: string;
  };
  disclosure: string;
}

export interface BiScenarioVersion {
  id: string;
  businessId: string;
  seriesId: string;
  version: number;
  name: string;
  scenarioType: BiScenarioType;
  assumptions: Record<string, unknown>;
  baseline: Record<string, unknown>;
  outcome: Record<string, unknown> | null;
  calculationStatus: "calculated" | "assumptions_only";
  calculationNote: string;
  createdByUserId: string;
  createdAt: string;
}

export interface CreateBiScenarioInput {
  name: string;
  scenarioType: BiScenarioType;
  seriesId?: string;
  priceChangePercent?: number;
  productId?: string;
  additionalStockUnits?: number;
  staffCountChange?: number;
  marketingBudgetChange?: number;
}

export type BiDiagnosisCategory =
  "sales" | "stock" | "customers" | "marketing" | "credit";
export type BiDiagnosisStatus = "new" | "actioned" | "dismissed" | "all";

export interface BiDiagnosisHypothesis {
  id: string;
  insightId: string;
  hypothesis: string;
  status: "open" | "resolved";
  resolutionNote: string | null;
  createdByUserId: string;
  resolvedByUserId: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BiDiagnosisRecord {
  id: string;
  businessId: string;
  category: BiDiagnosisCategory;
  observation: string;
  sourceFigure: string;
  estimatedImpact: string | number | null;
  status: Exclude<BiDiagnosisStatus, "all">;
  createdAt: string;
  updatedAt: string;
  evidenceStrength: string;
  confidence: null;
  causalStatus: string;
  diagnosisHypotheses: BiDiagnosisHypothesis[];
}

export interface BiDiagnosisResponse {
  total: number;
  currency: string;
  rows: BiDiagnosisRecord[];
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

export function fetchBiSimulatorContext(): Promise<BiScenarioContext> {
  return apiFetch<BiScenarioContext>(
    "/business-intelligence/simulator/context",
  );
}

export function fetchBiScenarioVersions(): Promise<BiScenarioVersion[]> {
  return apiFetch<BiScenarioVersion[]>(
    "/business-intelligence/simulator/scenarios",
  );
}

export function saveBiScenarioVersion(
  input: CreateBiScenarioInput,
): Promise<BiScenarioVersion> {
  return apiFetch<BiScenarioVersion>(
    "/business-intelligence/simulator/scenarios",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function fetchBiDiagnoses(
  category: BiDiagnosisCategory | "all",
  status: BiDiagnosisStatus,
): Promise<BiDiagnosisResponse> {
  const query = new URLSearchParams({ status });
  if (category !== "all") query.set("category", category);
  return apiFetch<BiDiagnosisResponse>(
    `/business-intelligence/diagnosis-center?${query.toString()}`,
  );
}

export function createBiDiagnosisHypothesis(
  insightId: string,
  hypothesis: string,
): Promise<BiDiagnosisHypothesis> {
  return apiFetch<BiDiagnosisHypothesis>(
    `/business-intelligence/diagnosis-center/${insightId}/hypotheses`,
    { method: "POST", body: JSON.stringify({ hypothesis }) },
  );
}

export function resolveBiDiagnosisHypothesis(
  hypothesisId: string,
  reason: string,
): Promise<BiDiagnosisHypothesis> {
  return apiFetch<BiDiagnosisHypothesis>(
    `/business-intelligence/diagnosis-center/hypotheses/${hypothesisId}/resolve`,
    { method: "PATCH", body: JSON.stringify({ reason }) },
  );
}
