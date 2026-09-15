export type OrderStatus = "draft" | "pending" | "confirmed" | "in_progress" | "completed" | "cancelled";

export const ORDER_STATUS_COLUMNS: { key: OrderStatus; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "confirmed", label: "Confirmed" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed", label: "Completed" },
];

/** Mirrors the backend's flow guard (BE-M2 ORDER_STATUS_TRANSITIONS) so the board can pre-validate drags before the server round-trip. */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft: [],
  pending: ["confirmed", "cancelled"],
  confirmed: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};
