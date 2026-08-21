import { apiFetch } from "@/lib/api-client";

export interface CreateReturnInput {
  orderId: string;
  reason: string;
  refundMethod: "cash" | "card" | "online" | "credit" | "store_credit";
  restock?: boolean;
  items: { productId: string; qty: number }[];
}

/** Creates a pending return request — actually refunding still requires a separate Returns-capability approval, unchanged by this call. */
export function createReturn(input: CreateReturnInput): Promise<{ id: string; status: string }> {
  return apiFetch<{ id: string; status: string }>("/returns", { method: "POST", body: JSON.stringify(input) });
}
