import { apiFetch } from "@/lib/api-client";

export interface BookingLinkSettings {
  welcomeText: string | null;
  visibleServiceIds: string[];
  brandColor: string | null;
}

export function fetchBookingLinkSettings(): Promise<BookingLinkSettings> {
  return apiFetch<BookingLinkSettings>("/booking-link/settings");
}

export function updateBookingLinkSettings(input: Partial<BookingLinkSettings>): Promise<BookingLinkSettings> {
  return apiFetch<BookingLinkSettings>("/booking-link/settings", { method: "PATCH", body: JSON.stringify(input) });
}

export interface BookingLinkStatsTrendPoint {
  month: string;
  visits: number;
  bookings: number;
  conversion: number;
}

export interface BookingLinkStats {
  months: number;
  totalVisits: number;
  totalBookings: number;
  conversion: number;
  trend: BookingLinkStatsTrendPoint[];
}

export function fetchBookingLinkStats(months?: number): Promise<BookingLinkStats> {
  const query = months ? `?months=${months}` : "";
  return apiFetch<BookingLinkStats>(`/booking-link/stats${query}`);
}

export interface GenerateQrInput {
  format: "a5" | "a4" | "sticker";
  fileType: "png" | "pdf";
}

export function generateBookingQr(input: GenerateQrInput): Promise<{ url: string }> {
  return apiFetch<{ url: string }>("/booking-link/qr", { method: "POST", body: JSON.stringify(input) });
}
