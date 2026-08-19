export type ActivityEventType =
  | "sale"
  | "booking"
  | "review"
  | "payment"
  | "complaint"
  | "stock"
  | "low_stock"
  | "customer_lapsed"
  | "credit_overdue"
  | "birthday";

export interface LiveActivityEvent {
  id: string;
  type: ActivityEventType;
  description: string;
  amount: number | null;
  entityType: string | null;
  entityId: string | null;
  actorUserId: string | null;
  createdAt: string;
}

export const ACTIVITY_EVENT_TYPE_LABEL: Record<ActivityEventType, string> = {
  sale: "Sale",
  booking: "Booking",
  review: "Review",
  payment: "Payment",
  complaint: "Complaint",
  stock: "Stock",
  low_stock: "Low stock",
  customer_lapsed: "Customer lapsed",
  credit_overdue: "Credit overdue",
  birthday: "Birthday",
};

/** How many live events the feed keeps in memory (the initial SSE backfill is already capped at 50 server-side). */
export const ACTIVITY_FEED_MAX = 200;
