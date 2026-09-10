import { apiFetch } from "@/lib/api-client";
import type { Delivery } from "@/lib/deliveries-api";
import type { Rider } from "@/lib/riders-api";

export type RouteStatus = "planned" | "in_progress" | "completed";

export interface DeliveryRoute {
  id: string;
  businessId: string;
  riderId: string | null;
  rider?: Rider | null;
  status: RouteStatus;
  deliveries: Delivery[];
  createdAt: string;
  updatedAt: string;
}

export function fetchRoutes(): Promise<DeliveryRoute[]> {
  return apiFetch<DeliveryRoute[]>("/routes");
}

export function fetchRoute(id: string): Promise<DeliveryRoute> {
  return apiFetch<DeliveryRoute>(`/routes/${id}`);
}

export function createRoute(deliveryIds: string[], riderId?: string): Promise<DeliveryRoute> {
  return apiFetch<DeliveryRoute>("/routes", { method: "POST", body: JSON.stringify({ deliveryIds, riderId }) });
}

/** Real greedy nearest-neighbour reorder — straight-line distance always, upgraded to a real maps provider when configured server-side. */
export function optimiseRoute(id: string): Promise<DeliveryRoute> {
  return apiFetch<DeliveryRoute>(`/routes/${id}/optimise`, { method: "POST" });
}
