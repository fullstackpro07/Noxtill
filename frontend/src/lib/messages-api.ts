import { apiFetch } from "@/lib/api-client";

export type MessageChannel = "whatsapp" | "sms" | "email";
export type MessageCategory = "utility" | "marketing";
export type MessageStatus = "queued" | "sent" | "delivered" | "read" | "failed";

export interface LiveMessage {
  id: string;
  customerId: string | null;
  customer: { id: string; name: string; phone: string } | null;
  channel: MessageChannel;
  category: MessageCategory;
  templateKey: string;
  status: MessageStatus;
  customBody: string | null;
  campaignId: string | null;
  createdAt: string;
}

/** GET /messages?customer_id= — every real message sent to one customer. */
export function fetchCustomerMessages(customerId: string): Promise<LiveMessage[]> {
  return apiFetch<LiveMessage[]>(`/messages?customer_id=${customerId}`);
}

/** GET /messages/recent — business-wide, most recent first; backs the Customers Activity feed. */
export function fetchRecentMessages(limit = 50): Promise<LiveMessage[]> {
  return apiFetch<LiveMessage[]>(`/messages/recent?limit=${limit}`);
}
