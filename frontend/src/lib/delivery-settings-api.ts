import { apiFetch } from "@/lib/api-client";

export interface DeliverySettings {
  businessId: string;
  defaultSlaMinutes: number;
}

export interface UpdateDeliverySettingsInput {
  defaultSlaMinutes: number;
}

/**
 * On-time-rate depth fix — `defaultSlaMinutes` is the real promise window: the backend reads it at
 * the moment a delivery is actually assigned to a rider and stamps `Delivery.promisedAt` from it.
 * A single business-wide setting, not per-zone — this app has no `Delivery`→`DeliveryZone` link yet.
 */
export function fetchDeliverySettings(): Promise<DeliverySettings> {
  return apiFetch<DeliverySettings>("/delivery-settings");
}

export function updateDeliverySettings(input: UpdateDeliverySettingsInput): Promise<DeliverySettings> {
  return apiFetch<DeliverySettings>("/delivery-settings", { method: "PATCH", body: JSON.stringify(input) });
}
