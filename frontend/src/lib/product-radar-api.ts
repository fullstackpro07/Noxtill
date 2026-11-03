import { apiFetch } from "@/lib/api-client";

export const PRODUCT_OPPORTUNITY_STATUSES = [
  "discovered",
  "saved",
  "watching",
  "dismissed",
  "validation_requested",
  "test_approved",
  "launch_approved",
  "rejected",
] as const;
export type ProductOpportunityStatus =
  (typeof PRODUCT_OPPORTUNITY_STATUSES)[number];
export type ProductOpportunityRisk = "low" | "medium" | "high" | "blocked";
export type ProductValidationDecision =
  "approve_test" | "approve_launch" | "watch" | "reject";

export interface ProductOpportunity {
  id: string;
  title: string;
  source: string;
  sourceReference: string | null;
  externalEntityId: string | null;
  category: string | null;
  market: string | null;
  observedPrice: number | null;
  estimatedLandedCost: number | null;
  demandSignal: number | null;
  competitionScore: number | null;
  trendVelocity: number | null;
  storeFitScore: number | null;
  marginEstimate: number | null;
  supplierCount: number | null;
  shippingEstimate: number | null;
  risk: ProductOpportunityRisk;
  status: ProductOpportunityStatus;
  productId: string | null;
  evidence: string | null;
  confidence: number | null;
  sourceFreshAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductOpportunityAudit {
  id: string;
  action: string;
  reason: string | null;
  before: unknown;
  after: unknown;
  actorUserId: string | null;
  createdAt: string;
}

export interface ProductValidationRun {
  id: string;
  opportunityId: string;
  decision: ProductValidationDecision;
  reason: string;
  evidenceSnapshot: unknown;
  actorUserId: string | null;
  createdAt: string;
}

export interface ProductValidationCandidate extends ProductOpportunity {
  evidenceReview: {
    evidenceCoverage: { recorded: number; total: number };
    launchApproval: { available: boolean; reason: string };
    factors: Array<{
      key: string;
      value: unknown;
      status: "recorded" | "not_recorded";
    }>;
    unavailableDimensions: Array<{
      key: string;
      status: "not_available";
      reason: string;
    }>;
  };
}

export interface ProductValidationDecisionResult {
  opportunity: ProductOpportunity;
  decision: ProductValidationRun;
  sideEffects: unknown[];
  note: string;
}

export interface CreateProductOpportunityInput {
  title: string;
  source: string;
  category?: string;
  market?: string;
  observedPrice?: number;
  estimatedLandedCost?: number;
  evidence?: string;
  risk?: ProductOpportunityRisk;
}

export interface UpdateProductOpportunityInput {
  expectedVersion: number;
  title?: string;
  source?: string;
  sourceReference?: string | null;
  category?: string | null;
  market?: string | null;
  observedPrice?: number | null;
  estimatedLandedCost?: number | null;
  demandSignal?: number | null;
  competitionScore?: number | null;
  trendVelocity?: number | null;
  storeFitScore?: number | null;
  marginEstimate?: number | null;
  supplierCount?: number | null;
  shippingEstimate?: number | null;
  risk?: ProductOpportunityRisk;
  evidence?: string | null;
  confidence?: number | null;
}

export function fetchProductOpportunities(
  filters: { status?: ProductOpportunityStatus; search?: string } = {},
): Promise<ProductOpportunity[]> {
  const query = new URLSearchParams();
  if (filters.status) query.set("status", filters.status);
  if (filters.search?.trim()) query.set("search", filters.search.trim());
  const suffix = query.size > 0 ? `?${query}` : "";
  return apiFetch<ProductOpportunity[]>(`/commerce/product-radar${suffix}`);
}

export function createProductOpportunity(
  input: CreateProductOpportunityInput,
): Promise<ProductOpportunity> {
  return apiFetch<ProductOpportunity>("/commerce/product-radar", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateProductOpportunity(
  id: string,
  input: UpdateProductOpportunityInput,
): Promise<ProductOpportunity> {
  return apiFetch<ProductOpportunity>(`/commerce/product-radar/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function applyProductOpportunityAction(
  id: string,
  action: "save" | "watch" | "dismiss" | "send_to_validation",
  expectedVersion: number,
): Promise<ProductOpportunity> {
  return apiFetch<ProductOpportunity>(
    `/commerce/product-radar/${id}/actions/${action}`,
    {
      method: "POST",
      body: JSON.stringify({ expectedVersion }),
    },
  );
}

export function fetchProductOpportunityAudit(
  id: string,
): Promise<ProductOpportunityAudit[]> {
  return apiFetch<ProductOpportunityAudit[]>(
    `/commerce/product-radar/${id}/audit`,
  );
}

export function decideProductOpportunity(
  id: string,
  input: {
    decision: ProductValidationDecision;
    reason: string;
    expectedVersion: number;
  },
): Promise<ProductValidationDecisionResult> {
  return apiFetch<ProductValidationDecisionResult>(
    `/commerce/product-validation/${id}/decisions`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export interface ValidationCatalogProductResult {
  product: {
    id: string;
    name: string;
    category: string | null;
    sku: string | null;
    costPrice: number;
    sellingPrice: number;
    stockQty: number;
    active: boolean;
  };
  alreadyExists: boolean;
}

export function createProductFromValidation(
  id: string,
  input: {
    sku?: string | null;
    costPrice: number;
    sellingPrice: number;
    expectedVersion: number;
  },
): Promise<ValidationCatalogProductResult> {
  return apiFetch<ValidationCatalogProductResult>(
    `/commerce/product-validation/${id}/product`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function fetchProductValidationCandidate(
  id: string,
): Promise<ProductValidationCandidate> {
  return apiFetch<ProductValidationCandidate>(
    `/commerce/product-validation/${id}`,
  );
}

export function fetchProductValidationQueue(
  search?: string,
): Promise<ProductValidationCandidate[]> {
  const query = new URLSearchParams();
  if (search?.trim()) query.set("search", search.trim());
  const suffix = query.size > 0 ? `?${query}` : "";
  return apiFetch<ProductValidationCandidate[]>(
    `/commerce/product-validation${suffix}`,
  );
}

export function fetchProductValidationHistory(
  id: string,
): Promise<ProductValidationRun[]> {
  return apiFetch<ProductValidationRun[]>(
    `/commerce/product-validation/${id}/history`,
  );
}
