import { apiFetch } from "@/lib/api-client";

export type RiderStatus = "active" | "inactive";
export type RiderVehicleType = "bike" | "motorcycle" | "car" | "van" | "on_foot";

export const VEHICLE_TYPE_LABELS: Record<RiderVehicleType, string> = {
  bike: "Bike",
  motorcycle: "Motorcycle",
  car: "Car",
  van: "Van",
  on_foot: "On foot",
};

export interface Rider {
  id: string;
  businessId: string;
  name: string;
  phone: string;
  status: RiderStatus;
  vehicleType: RiderVehicleType | null;
  commissionRate: string | null;
  zoneIds: string[];
  lastLat: string | null;
  lastLng: string | null;
  lastLocationAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Roster row — same as Rider plus real today/active delivery counts (`RidersService.list()`). */
export interface RiderRosterRow extends Rider {
  deliveriesToday: number;
  activeDeliveries: number;
}

export function fetchRiders(): Promise<RiderRosterRow[]> {
  return apiFetch<RiderRosterRow[]>("/riders");
}

export function fetchRider(id: string): Promise<Rider> {
  return apiFetch<Rider>(`/riders/${id}`);
}

export interface RiderPerformance {
  riderId: string;
  name: string;
  totalDeliveries: number;
  delivered: number;
  failed: number;
  successRate: number | null;
  averageDeliveryMinutes: number | null;
  /** Real average of staff-recorded 1-5 ratings — null (not a fabricated default) until at least one delivery has been rated. */
  averageRating: number | null;
  ratedDeliveries: number;
}

export function fetchRiderPerformance(id: string): Promise<RiderPerformance> {
  return apiFetch<RiderPerformance>(`/riders/${id}/performance`);
}

export interface CreateRiderInput {
  name: string;
  phone: string;
  vehicleType?: RiderVehicleType;
  commissionRate?: number;
  zoneIds?: string[];
}

export function createRider(input: CreateRiderInput): Promise<Rider> {
  return apiFetch<Rider>("/riders", { method: "POST", body: JSON.stringify(input) });
}

export interface UpdateRiderInput {
  name?: string;
  phone?: string;
  status?: RiderStatus;
  vehicleType?: RiderVehicleType;
  commissionRate?: number;
  zoneIds?: string[];
}

export function updateRider(id: string, input: UpdateRiderInput): Promise<Rider> {
  return apiFetch<Rider>(`/riders/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function removeRider(id: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/riders/${id}`, { method: "DELETE" });
}
