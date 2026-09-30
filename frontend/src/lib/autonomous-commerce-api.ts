import { apiFetch } from "@/lib/api-client";

export interface AutonomousCommerceSummary {
  period: { start: string; end: string; days: number };
  capturedAt: string;
  sales: {
    status: "available";
    currency: string;
    completedOrders: number;
    recordedOrderTotal: number;
    averageOrderValue: number | null;
    definition: string;
  };
  inventory: {
    status: "available";
    activeProducts: number;
    lowStockProducts: number;
    definition: string;
  };
  approvals: {
    status: "available";
    pendingReturns: number;
    pendingRefundAmount: number;
    definition: string;
  };
  fulfillment: {
    status: "available" | "partial" | "unavailable";
    deliveredOrders: number;
    eligibleDeliveredOrders: number;
    missingPromiseTime: number;
    onTimeOrders: number;
    onTimeRate: number | null;
    definition: string;
  };
  supplierClaims: {
    status: "available";
    openClaims: number;
    recoverableValue: number;
    agingClaims: number;
    recoveredThisMonth: number;
    definition: string;
  };
  unavailableMetrics: { key: string; reason: string }[];
}

/** Existing Dashboard widget pack; data is computed from canonical Noxtill records. */
export function fetchAutonomousCommerceSummary(): Promise<AutonomousCommerceSummary> {
  return apiFetch<AutonomousCommerceSummary>("/commerce/dashboard/summary");
}
