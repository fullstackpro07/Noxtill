import { apiFetch } from "@/lib/api-client";

export type BomStatus = "active" | "archived";
export type WorkOrderStatus = "planned" | "in_progress" | "quality_hold" | "completed" | "cancelled";

export interface Bom {
  id: string;
  product: { id: string; name: string; sku: string | null };
  version: number;
  status: BomStatus;
  scrapAllowancePct: number;
  laborCostPerUnit: number | null;
  overheadCostPerUnit: number | null;
  notes: string | null;
  items: Array<{
    id: string;
    qtyPerUnit: number;
    component: { id: string; name: string; sku: string | null; stockQty: number; costPrice: number };
  }>;
  estimatedUnitCost: number;
  createdAt: string;
}

export interface WorkOrder {
  id: string;
  number: number;
  product: { id: string; name: string; sku: string | null };
  bom: { id: string; version: number };
  qtyPlanned: number;
  qtyGood: number | null;
  qtyScrap: number | null;
  status: WorkOrderStatus;
  dueDate: string | null;
  late: boolean;
  facility: string | null;
  demandSource: string | null;
  estimatedCost: number;
  actualCost: number | null;
  qualityPassed: boolean | null;
  qualityNotes: string | null;
  materialsReady: boolean;
  materials: Array<{
    component: { id: string; name: string; sku: string | null; stockQty: number };
    qtyRequired: number;
    qtyConsumed: number | null;
    shortage: number;
  }>;
  startedAt: string | null;
  completedAt: string | null;
  cancelledReason: string | null;
  createdAt: string;
}

export interface ProductionSummary {
  openWorkOrders: number;
  unitsInProduction: number;
  withShortages: number;
  late: number;
  qualityHolds: number;
  completedCount: number;
  scrapRatePct: number | null;
  costVariance: number | null;
}

const BASE = "/commerce/production";

export const fetchProductionSummary = () => apiFetch<ProductionSummary>(`${BASE}/summary`);
export const fetchBoms = () => apiFetch<Bom[]>(`${BASE}/boms`);
export const fetchWorkOrders = () => apiFetch<WorkOrder[]>(`${BASE}/work-orders`);

export function createBom(input: {
  productId: string;
  items: Array<{ componentProductId: string; qtyPerUnit: number }>;
  scrapAllowancePct?: number;
  laborCostPerUnit?: number | null;
  overheadCostPerUnit?: number | null;
  notes?: string;
}) {
  return apiFetch<{ id: string }>(`${BASE}/boms`, { method: "POST", body: JSON.stringify(input) });
}

export function createWorkOrder(input: {
  bomId: string;
  qtyPlanned: number;
  dueDate?: string;
  facility?: string;
  demandSource?: string;
}) {
  return apiFetch<{ id: string }>(`${BASE}/work-orders`, { method: "POST", body: JSON.stringify(input) });
}

const post = (path: string, body?: unknown) =>
  apiFetch<{ id: string }>(`${BASE}/work-orders/${path}`, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export const startWorkOrder = (id: string) => post(`${id}/start`);
export const completeWorkOrder = (
  id: string,
  input: { qtyGood: number; qtyScrap: number; qualityPassed: boolean; qualityNotes?: string },
) => post(`${id}/complete`, input);
export const releaseWorkOrder = (id: string, input: { qtyReleased: number; reason: string }) =>
  post(`${id}/release`, input);
export const cancelWorkOrder = (id: string, reason: string) => post(`${id}/cancel`, { reason });

/** Mirrors the backend: planned qty × per-unit qty × (1 + scrap%), rounded up to whole units. */
export function requiredComponentQty(qty: number, qtyPerUnit: number, scrapAllowancePct: number): number {
  return Math.ceil(qty * qtyPerUnit * (1 + scrapAllowancePct / 100) - 1e-9);
}
