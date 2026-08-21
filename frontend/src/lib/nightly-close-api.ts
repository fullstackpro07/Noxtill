import { apiFetch } from "@/lib/api-client";

export interface NightlyCloseHistoryRow {
  date: string;
  sales: number;
  revenue: number;
  profit: number;
  newReviews: number;
  bookingsTomorrow: number;
  creditRecovered: number;
  deliveryStatus: "sent" | "failed";
  deliveryError: string | null;
  channel: "whatsapp" | "sms" | "email";
}

export interface NightlyClosePreview {
  businessId: string;
  businessName: string;
  dateLabel: string;
  ordersCount: number;
  revenue: number;
  grossProfit: number;
  appointmentsTomorrowCount: number;
  newReviewsCount: number;
  openFeedbackCount: number;
  creditPaymentsTodayTotal: number;
  lowStockProducts: { id: string; name: string; stock_qty: number; low_stock_threshold: number }[];
}

/** GET /nightly-close/history */
export function fetchNightlyCloseHistory(filters?: {
  status?: "sent" | "failed";
}): Promise<NightlyCloseHistoryRow[]> {
  const query = filters?.status ? `?status=${filters.status}` : "";
  return apiFetch<NightlyCloseHistoryRow[]>(`/nightly-close/history${query}`);
}

/** POST /nightly-close/preview — composes tonight's close without sending it. */
export function previewNightlyClose(): Promise<NightlyClosePreview> {
  return apiFetch<NightlyClosePreview>("/nightly-close/preview", { method: "POST" });
}

/** POST /nightly-close/test-send — sends immediately, bypassing the schedule. */
export function sendNightlyCloseTest(): Promise<void> {
  return apiFetch<void>("/nightly-close/test-send", { method: "POST" });
}

export interface UpdateNightlyCloseSettings {
  time?: string;
  channel?: "whatsapp" | "sms" | "email";
}

/** PATCH /settings/nightly-close */
export function updateNightlyCloseSettings(dto: UpdateNightlyCloseSettings): Promise<unknown> {
  return apiFetch("/settings/nightly-close", {
    method: "PATCH",
    body: JSON.stringify(dto),
  });
}
