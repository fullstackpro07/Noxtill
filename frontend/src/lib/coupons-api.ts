import { apiFetch } from "@/lib/api-client";

export type CouponType = "percentage" | "fixed";

export interface Coupon {
  id: string;
  code: string;
  type: CouponType;
  value: string;
  minOrderAmount: string | null;
  maxDiscountAmount: string | null;
  usageLimit: number | null;
  usageLimitPerCustomer: number | null;
  usedCount: number;
  startsAt: string | null;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
}

export interface CreateCouponInput {
  code: string;
  type: CouponType;
  value: number;
  minOrderAmount?: number;
  maxDiscountAmount?: number;
  usageLimit?: number;
  usageLimitPerCustomer?: number;
  startsAt?: string;
  expiresAt?: string;
}

export type UpdateCouponInput = Partial<Omit<CreateCouponInput, "code" | "type">> & { active?: boolean };

export function fetchCoupons(): Promise<Coupon[]> {
  return apiFetch<Coupon[]>("/coupons");
}

export function createCoupon(input: CreateCouponInput): Promise<Coupon> {
  return apiFetch<Coupon>("/coupons", { method: "POST", body: JSON.stringify(input) });
}

export function updateCoupon(id: string, input: UpdateCouponInput): Promise<Coupon> {
  return apiFetch<Coupon>(`/coupons/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteCoupon(id: string): Promise<void> {
  return apiFetch(`/coupons/${id}`, { method: "DELETE" });
}
