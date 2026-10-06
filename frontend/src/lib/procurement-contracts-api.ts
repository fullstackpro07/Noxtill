import { apiFetch } from "@/lib/api-client";

export type ContractEffectiveStatus = "draft" | "active" | "renewal_due" | "renewal_unconfirmed" | "expired" | "terminated";

export interface DiscountTier {
  minQty: number | null;
  minSpend: number | null;
  percent: number;
}

export interface SupplierContract {
  id: string;
  reference: string;
  title: string;
  supplier: { id: string; name: string };
  status: "draft" | "active" | "terminated";
  effectiveStatus: ContractEffectiveStatus;
  documentUrl: string | null;
  effectiveFrom: string;
  expiresAt: string | null;
  autoRenew: boolean;
  noticeDays: number | null;
  noticeDeadline: string | null;
  daysToExpiry: number | null;
  currency: string;
  paymentTerms: string | null;
  discountTiers: DiscountTier[];
  priceValidUntil: string | null;
  minimumOrderQty: number | null;
  sla: string | null;
  deliveryTerms: string | null;
  incoterms: string | null;
  warranty: string | null;
  complianceRequirements: string[];
  categories: string[];
  ownerUserId: string | null;
  ownerName: string | null;
  version: number;
  termsConfirmedAt: string | null;
  termsConfirmedBy: string | null;
  renewalAlertSent: boolean;
  spendUnderContract: number;
  posUnderContract: number;
  posAfterExpiry: number;
  issues: string[];
}

export interface ContractsResponse {
  currency: string;
  alertLeadDays: number;
  kpis: { active: number; expiring30: number; expiring60: number; expiring90: number; autoRenewing: number; spendUnderContract: number; nonCompliant: number };
  contracts: SupplierContract[];
  spendNote: string;
}

export type ContractInput = Partial<{
  supplierId: string;
  reference: string;
  title: string;
  documentUrl: string | null;
  effectiveFrom: string;
  expiresAt: string | null;
  autoRenew: boolean;
  noticeDays: number | null;
  currency: string;
  paymentTerms: string | null;
  discountTiers: DiscountTier[];
  priceValidUntil: string | null;
  minimumOrderQty: number | null;
  sla: string | null;
  deliveryTerms: string | null;
  incoterms: string | null;
  warranty: string | null;
  complianceRequirements: string[];
  categories: string[];
  ownerUserId: string | null;
  reason: string;
}>;

export interface ContractHistoryEntry {
  kind: "terms" | "status";
  id: string;
  version: number | null;
  terms: Record<string, unknown> | null;
  reason: string | null;
  createdAt: string;
  actorName: string | null;
}

export interface ProcurementAnalytics {
  currency: string;
  periodDays: number;
  options: { suppliers: { id: string; name: string }[]; departments: string[] };
  kpis: {
    requestToPoCycleDays: { median: number | null; average: number | null; sample: number };
    rfqParticipation: { invited: number; responded: number; rate: number | null };
    savingsVsBaseline: { amount: number | null; percent: number | null; comparedRfqs: number };
    offContractSpend: { amount: number; shareOfCommitted: number | null };
    matchExceptionRate: { value: null; availability: "not_available"; detail: string };
    supplierResponseHours: { median: number | null; sample: number };
    throughput: { requestsCreated: number; requestsConverted: number; purchaseOrders: number };
  };
  spendByCategory: { category: string; committed: number }[];
  savings: { rows: { rfqId: string; supplier: string | null; baseline: number; awarded: number; savings: number }[]; exclusions: Record<string, number>; methodology: string };
  funnel: Record<string, number>;
  contractUtilization: { committed: number; underContract: number; percent: number | null };
  suppliers: { supplierId: string; name: string; committed: number; purchaseOrders: number; underContractPercent: number | null; rfqInvites: number; rfqResponses: number; medianResponseHours: number | null; billed: null }[];
  departments: { department: string; requests: number; estimated: number; converted: number }[];
  definitions: { metric: string; definition: string }[];
}

const body = (b: unknown) => ({ body: JSON.stringify(b) });

export const procurementContractsApi = {
  list: () => apiFetch<ContractsResponse>("/procurement/contracts"),
  options: () => apiFetch<{ suppliers: { id: string; name: string }[]; members: { userId: string; name: string }[] }>("/procurement/contracts/options"),
  history: (id: string) => apiFetch<ContractHistoryEntry[]>(`/procurement/contracts/${id}/versions`),
  create: (input: ContractInput) => apiFetch("/procurement/contracts", { method: "POST", ...body(input) }),
  update: (id: string, input: ContractInput) => apiFetch(`/procurement/contracts/${id}`, { method: "PATCH", ...body(input) }),
  confirmTerms: (id: string) => apiFetch(`/procurement/contracts/${id}/confirm-terms`, { method: "POST" }),
  setStatus: (id: string, status: "active" | "terminated", reason?: string) => apiFetch(`/procurement/contracts/${id}/status`, { method: "POST", ...body({ status, reason }) }),
  remind: (id: string) => apiFetch<{ notified: number }>(`/procurement/contracts/${id}/remind`, { method: "POST" }),
  analytics: (params: { days: number; supplierId?: string; department?: string }) => {
    const qs = new URLSearchParams({ days: String(params.days) });
    if (params.supplierId) qs.set("supplierId", params.supplierId);
    if (params.department) qs.set("department", params.department);
    return apiFetch<ProcurementAnalytics>(`/procurement/analytics?${qs.toString()}`);
  },
};
