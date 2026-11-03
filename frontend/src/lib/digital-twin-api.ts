import { apiFetch } from "@/lib/api-client";

export type TwinEntityType =
  "business" | "branch" | "staff" | "product" | "supplier";
export type TwinAssumptionKey =
  | "staff_weekly_hours"
  | "supplier_lead_days"
  | "product_reorder_buffer_units"
  | "branch_daily_capacity"
  | "expense_adjustment_percent";

export interface DigitalTwinAssumption {
  id: string;
  businessId: string;
  seriesId: string;
  version: number;
  entityType: TwinEntityType;
  entityId: string;
  assumptionKey: TwinAssumptionKey;
  value: number;
  rationale: string;
  createdByUserId: string;
  createdAt: string;
}

export interface TwinTarget {
  id: string;
  name: string;
  businessId?: string;
  role?: string;
  kind?: string;
}

export interface DigitalTwinContext {
  generatedAt: string;
  business: { id: string; name: string };
  branches: {
    id: string;
    name: string;
    parentId: string | null;
    active: boolean;
    currency: string;
    staff: {
      activeCount: number;
      scheduledPeopleNext7Days: number;
      scheduledHoursNext7Days: number;
      capacityStatus: string;
    };
    products: {
      activeCount: number;
      productCount: number;
      serviceCount: number;
      totalRecordedStockUnits: number;
      nonzeroRecordedUnitCostCount: number;
      serviceDurationsRecorded: number;
      costCoverage: string;
    };
    suppliers: { count: number; openPurchaseOrders: number; leadTimes: string };
    costs: {
      recordedExpenseCountLast30Days: number;
      recordedExpenseTotalLast30Days: number;
      periodDays: number;
      currency: string;
    };
    processes: { activeWorkflowCount: number; source: string };
    integrations: {
      provider: string;
      status: string;
      connectedAt: string | null;
      lastSyncAt: string | null;
    }[];
  }[];
  targets: {
    business: TwinTarget;
    branches: TwinTarget[];
    staff: TwinTarget[];
    products: TwinTarget[];
    suppliers: TwinTarget[];
  };
  assetCoverage: string;
  serviceCapacity: string;
  disclosures: string[];
}

export interface CreateDigitalTwinAssumption {
  seriesId?: string;
  entityType: TwinEntityType;
  entityId: string;
  assumptionKey: TwinAssumptionKey;
  value: number;
  rationale: string;
}

export function fetchDigitalTwinContext(): Promise<DigitalTwinContext> {
  return apiFetch<DigitalTwinContext>(
    "/business-intelligence/digital-twin/context",
  );
}

export function fetchDigitalTwinAssumptions(): Promise<
  DigitalTwinAssumption[]
> {
  return apiFetch<DigitalTwinAssumption[]>(
    "/business-intelligence/digital-twin/assumptions",
  );
}

export function saveDigitalTwinAssumption(
  input: CreateDigitalTwinAssumption,
): Promise<DigitalTwinAssumption> {
  return apiFetch<DigitalTwinAssumption>(
    "/business-intelligence/digital-twin/assumptions",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}
