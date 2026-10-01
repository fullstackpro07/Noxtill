import { apiFetch } from "@/lib/api-client";

export type RiskRuleKey = "repeat_returns" | "over_returned_order" | "coupon_repeat_use";
export type RiskCaseStatus = "open" | "investigating" | "resolved" | "dismissed";
export type RiskSeverity = "low" | "medium" | "high";
export type ComplianceDocType = "certificate" | "test_report" | "license" | "declaration" | "safety_data_sheet" | "other";
export type MarketEligibilityStatus = "eligible" | "review_required" | "blocked";

export interface RiskSummary {
  openCases: number;
  highSeverityOpen: number;
  openExposure: number;
  documentsExpiring: number;
  documentsExpired: number;
  blockedMarkets: number;
  marketsInReview: number;
}

export interface RiskRule {
  id: string;
  key: RiskRuleKey;
  enabled: boolean;
  threshold: number;
  windowDays: number;
  updatedAt: string;
}

export interface RiskCase {
  id: string;
  ruleKey: RiskRuleKey;
  entityType: "customer" | "order";
  entityId: string;
  entityLabel: string;
  severity: RiskSeverity;
  status: RiskCaseStatus;
  exposureAmount: number;
  signalCount: number;
  evidence: unknown;
  resolution: string | null;
  firstDetectedAt: string;
  lastDetectedAt: string;
}

export interface ComplianceDocument {
  id: string;
  productId: string | null;
  product: { id: string; name: string } | null;
  docType: ComplianceDocType;
  title: string;
  reference: string | null;
  issuer: string | null;
  markets: string[];
  issuedAt: string | null;
  expiresAt: string | null;
  notes: string | null;
  status: "expired" | "expiring" | "valid" | "no_expiry";
  archivedAt: string | null;
}

export interface MarketEligibility {
  id: string;
  productId: string;
  product: { id: string; name: string; sku: string | null };
  market: string;
  status: MarketEligibilityStatus;
  reason: string | null;
  updatedAt: string;
}

const BASE = "/commerce/risk-compliance";

export const fetchRiskSummary = () => apiFetch<RiskSummary>(`${BASE}/summary`);
export const fetchRiskRules = () => apiFetch<RiskRule[]>(`${BASE}/rules`);
export const fetchRiskCases = (status?: RiskCaseStatus | "all") =>
  apiFetch<RiskCase[]>(`${BASE}/cases${status && status !== "all" ? `?status=${status}` : ""}`);
export const fetchComplianceDocuments = () => apiFetch<ComplianceDocument[]>(`${BASE}/documents`);
export const fetchMarketEligibility = () => apiFetch<MarketEligibility[]>(`${BASE}/eligibility`);

export const runRiskChecks = () => apiFetch<{ findings: number; created: number; refreshed: number; reopened: number }>(`${BASE}/checks/run`, { method: "POST" });

export function updateRiskRule(key: RiskRuleKey, input: Partial<Pick<RiskRule, "enabled" | "threshold" | "windowDays">>) {
  return apiFetch<RiskRule>(`${BASE}/rules/${key}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function updateRiskCase(id: string, input: { status: RiskCaseStatus; reason?: string }) {
  return apiFetch<RiskCase>(`${BASE}/cases/${id}/status`, { method: "POST", body: JSON.stringify(input) });
}

export type ComplianceDocumentInput = {
  productId?: string | null;
  docType: ComplianceDocType;
  title: string;
  reference?: string | null;
  issuer?: string | null;
  markets?: string[];
  issuedAt?: string | null;
  expiresAt?: string | null;
  notes?: string | null;
};

export const createComplianceDocument = (input: ComplianceDocumentInput) =>
  apiFetch<ComplianceDocument>(`${BASE}/documents`, { method: "POST", body: JSON.stringify(input) });

export const updateComplianceDocument = (id: string, input: Partial<ComplianceDocumentInput>) =>
  apiFetch<ComplianceDocument>(`${BASE}/documents/${id}`, { method: "PATCH", body: JSON.stringify(input) });

export const archiveComplianceDocument = (id: string) =>
  apiFetch<ComplianceDocument>(`${BASE}/documents/${id}/archive`, { method: "POST" });

export function setMarketEligibility(input: { productId: string; market: string; status: MarketEligibilityStatus; reason?: string }) {
  return apiFetch<MarketEligibility>(`${BASE}/eligibility`, { method: "PUT", body: JSON.stringify(input) });
}

export const removeMarketEligibility = (id: string) =>
  apiFetch<{ removed: boolean }>(`${BASE}/eligibility/${id}`, { method: "DELETE" });

export interface RiskAuditEntry {
  id: string;
  action: string;
  reason: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}

export const fetchRiskAudit = (entityType: string, entityId: string) =>
  apiFetch<RiskAuditEntry[]>(`${BASE}/audit/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`);
