import { apiFetch } from "@/lib/api-client";

export type DeliveryChargeType = "flat" | "by_distance" | "by_order_value";

export const CHARGE_TYPE_LABELS: Record<DeliveryChargeType, string> = {
  flat: "Flat fee",
  by_distance: "By distance",
  by_order_value: "By order value",
};

export interface DeliveryZone {
  id: string;
  businessId: string;
  name: string;
  chargeType: DeliveryChargeType;
  flatAmount: string | null;
  perKmAmount: string | null;
  freeAboveOrderValue: string | null;
  active: boolean;
  /** Per-zone SLA depth fix — null means "use the business default". */
  slaMinutes: number | null;
  createdAt: string;
  updatedAt: string;
}

export function fetchDeliveryZones(): Promise<DeliveryZone[]> {
  return apiFetch<DeliveryZone[]>("/delivery-zones");
}

export interface DeliveryZoneInput {
  name: string;
  chargeType: DeliveryChargeType;
  flatAmount?: number;
  perKmAmount?: number;
  freeAboveOrderValue?: number;
  active?: boolean;
  slaMinutes?: number | null;
}

export function createDeliveryZone(input: DeliveryZoneInput): Promise<DeliveryZone> {
  return apiFetch<DeliveryZone>("/delivery-zones", { method: "POST", body: JSON.stringify(input) });
}

export function updateDeliveryZone(id: string, input: Partial<DeliveryZoneInput>): Promise<DeliveryZone> {
  return apiFetch<DeliveryZone>(`/delivery-zones/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function removeDeliveryZone(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/delivery-zones/${id}`, { method: "DELETE" });
}
