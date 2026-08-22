import { apiFetch } from "@/lib/api-client";
import { toLiveOrder, updateOrderStatus, type LiveOrder, type RawOrder } from "@/lib/orders-api";

export function fetchDraftOrders(): Promise<LiveOrder[]> {
  return apiFetch<RawOrder[]>("/orders?status=draft").then((rows) => rows.map(toLiveOrder));
}

export function convertDraftOrder(id: string, method: "cash" | "card" | "online" | "credit"): Promise<LiveOrder> {
  return apiFetch<RawOrder>(`/orders/${id}/convert`, {
    method: "POST",
    body: JSON.stringify({ payment: { method } }),
  }).then(toLiveOrder);
}

/** No dedicated delete endpoint exists for a draft order — this reuses the real order-status
 * endpoint to cancel it, the same effect a delete would have (it drops out of the drafts list). */
export function deleteDraftOrder(id: string): Promise<LiveOrder> {
  return updateOrderStatus(id, "cancelled");
}
