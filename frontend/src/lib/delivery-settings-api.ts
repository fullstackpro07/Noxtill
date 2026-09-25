import { apiFetch } from "@/lib/api-client";

export interface DeliverySettings {
  businessId: string;
  defaultSlaMinutes: number;
  etaPaddingMinutes: number;
  cashLimitAmount: string | null;
  warnAtStopCount: number;
  staleLocationMinutes: number;
  hubLat: string | null;
  hubLng: string | null;
  costPerKm: string | null;
  riderPayPerDelivery: string | null;
  autoEtaOnAssign: boolean;
  autoEtaOnSlip: boolean;
  slipThresholdMinutes: number;
  autoFlagStalePhone: boolean;
  autoWarnCashLimit: boolean;
  autoTaskOnFailure: boolean;
  sendProofToCustomer: boolean;
  shareLiveLocation: boolean;
  enforceZoneCoverage: boolean;
  showFeeBeforeCheckout: boolean;
  pausedZonesBlockOrders: boolean;
  autoAssignNew: boolean;
  urgentAfterMinutes: number;
  highValueAmount: string | null;
}

export type UpdateDeliverySettingsInput = Partial<{
  defaultSlaMinutes: number;
  etaPaddingMinutes: number;
  cashLimitAmount: number | null;
  warnAtStopCount: number;
  staleLocationMinutes: number;
  hubLat: number | null;
  hubLng: number | null;
  costPerKm: number | null;
  riderPayPerDelivery: number | null;
  autoEtaOnAssign: boolean;
  autoEtaOnSlip: boolean;
  slipThresholdMinutes: number;
  autoFlagStalePhone: boolean;
  autoWarnCashLimit: boolean;
  autoTaskOnFailure: boolean;
  sendProofToCustomer: boolean;
  shareLiveLocation: boolean;
  enforceZoneCoverage: boolean;
  showFeeBeforeCheckout: boolean;
  pausedZonesBlockOrders: boolean;
  autoAssignNew: boolean;
  urgentAfterMinutes: number;
  highValueAmount: number | null;
}>;

export function fetchDeliverySettings(): Promise<DeliverySettings> {
  return apiFetch<DeliverySettings>("/delivery-settings");
}

export function updateDeliverySettings(input: UpdateDeliverySettingsInput): Promise<DeliverySettings> {
  return apiFetch<DeliverySettings>("/delivery-settings", { method: "PATCH", body: JSON.stringify(input) });
}

/** Whether this person may open Zones, Automations and Settings (the real owner-only gate). */
export function fetchDeliveryAccess(): Promise<{ canConfigure: boolean }> {
  return apiFetch<{ canConfigure: boolean }>("/delivery-settings/access");
}
