import { apiFetch } from "@/lib/api-client";
import type { Rider } from "@/lib/riders-api";
import type { DeliveryZone } from "@/lib/delivery-zones-api";

export type DeliveryStatus = "unassigned" | "assigned" | "picked_up" | "en_route" | "delivered" | "failed";

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  unassigned: "Unassigned",
  assigned: "Assigned",
  picked_up: "Picked up",
  en_route: "En route",
  delivered: "Delivered",
  failed: "Failed",
};

/** Common reasons for the dropdown — the field itself is free text, so "Add custom" always works too. */
export const DELIVERY_FAILURE_REASONS = [
  "Customer not available",
  "Wrong or incomplete address",
  "Customer refused delivery",
  "Item damaged in transit",
  "Unable to contact customer",
];

export interface DeliveryOrder {
  id: string;
  orderNo: number;
}

export interface Delivery {
  id: string;
  businessId: string;
  orderId: string;
  order?: DeliveryOrder;
  riderId: string | null;
  rider?: Rider | null;
  status: DeliveryStatus;
  addressLine: string;
  lat: string | null;
  lng: string | null;
  routeId: string | null;
  routeSequence: number | null;
  /** Per-zone SLA depth fix — real link, set manually (this app's zones carry no geofence). */
  zoneId: string | null;
  zone?: DeliveryZone | null;
  proofSignatureKey: string | null;
  proofPhotoKey: string | null;
  proofAt: string | null;
  assignedAt: string | null;
  deliveredAt: string | null;
  failureReason: string | null;
  qualityRating: number | null;
  createdAt: string;
  updatedAt: string;
}

export function fetchDeliveries(status?: DeliveryStatus): Promise<Delivery[]> {
  const qs = status ? `?status=${status}` : "";
  return apiFetch<Delivery[]>(`/deliveries${qs}`);
}

export function fetchDelivery(id: string): Promise<Delivery> {
  return apiFetch<Delivery>(`/deliveries/${id}`);
}

export function assignDelivery(id: string, riderId: string): Promise<Delivery> {
  return apiFetch<Delivery>(`/deliveries/${id}/assign`, { method: "PATCH", body: JSON.stringify({ riderId }) });
}

/**
 * Per-zone SLA depth fix — sets (or clears, with `zoneId: null`) which zone a delivery belongs to.
 * If the delivery is already assigned to a rider, the backend honestly recomputes its promised
 * time under the new zone's real SLA rather than leaving a stale promise.
 */
export function assignDeliveryZone(id: string, zoneId: string | null): Promise<Delivery> {
  return apiFetch<Delivery>(`/deliveries/${id}/zone`, { method: "PATCH", body: JSON.stringify({ zoneId }) });
}

export function updateDeliveryStatus(
  id: string,
  status: Extract<DeliveryStatus, "picked_up" | "en_route" | "delivered" | "failed">,
  failureReason?: string,
): Promise<Delivery> {
  return apiFetch<Delivery>(`/deliveries/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, failureReason }),
  });
}

/** Real, staff-recorded 1-5 rating — only valid on a delivered delivery. */
export function rateDelivery(id: string, rating: number): Promise<Delivery> {
  return apiFetch<Delivery>(`/deliveries/${id}/rating`, { method: "POST", body: JSON.stringify({ rating }) });
}

export interface DeliveryProof {
  submitted: boolean;
  signatureUrl?: string;
  photoUrl?: string | null;
  lat?: number | null;
  lng?: number | null;
  at?: string | null;
}

export function fetchDeliveryProof(id: string): Promise<DeliveryProof> {
  return apiFetch<DeliveryProof>(`/deliveries/${id}/proof`);
}

export interface OnTimeTrendPoint {
  date: string;
  onTimeRate: number | null;
  sampleSize: number;
}

export interface OnTimeStats {
  onTimeRate: number | null;
  sampleSize: number;
  trend: OnTimeTrendPoint[];
}

/**
 * On-time-rate depth fix — real rate computed only from deliveries with an actual promised time
 * (`promisedAt`); `sampleSize: 0` / `onTimeRate: null` means no real promise has been made yet
 * (e.g. every delivery so far predates this feature), not a 0% rate.
 */
export function fetchOnTimeStats(): Promise<OnTimeStats> {
  return apiFetch<OnTimeStats>(`/deliveries/on-time-stats`);
}
