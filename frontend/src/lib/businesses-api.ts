import { apiFetch } from "@/lib/api-client";

export interface BusinessProfile {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  currency: string;
  timezone: string;
  country: string | null;
  taxLabel: string;
  taxRate: number;
}

export interface UpdateBusinessProfile {
  name?: string;
  phone?: string;
  address?: string;
  currency?: string;
  timezone?: string;
  country?: string;
  taxLabel?: string;
  taxRate?: number;
}

/** GET /businesses/me */
export function fetchBusinessProfile(): Promise<BusinessProfile> {
  return apiFetch<BusinessProfile>("/businesses/me");
}

/** PATCH /businesses/me */
export function updateBusinessProfile(dto: UpdateBusinessProfile): Promise<BusinessProfile> {
  return apiFetch<BusinessProfile>("/businesses/me", {
    method: "PATCH",
    body: JSON.stringify(dto),
  });
}
